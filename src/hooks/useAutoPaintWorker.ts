/**
 * Hook that runs the auto-paint algorithm in a Web Worker.
 *
 * Replaces the previous synchronous `useMemo` approach, ensuring the
 * optimizer (exhaustive / SA / GA) never blocks the main thread.
 *
 * Features:
 * - Automatic cancellation: new inputs terminate stale in-flight worker work.
 * - Loading and error state for UI feedback.
 * - Lazy worker instantiation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AutoPaintResult } from '../lib/autoPaint';
import type {
    AutoPaintRepeatLimit,
    AutoPaintTransitionOpacity,
    Filament,
    Swatch,
} from '../types';
import type {
    AutoPaintWorkerProgress,
    AutoPaintWorkerRequest,
    AutoPaintWorkerResponse,
} from '../workers/autoPaint.worker';

export interface UseAutoPaintWorkerOptions {
    paintMode: 'manual' | 'autopaint';
    filaments: Filament[];
    filtered: Swatch[];
    layerHeight: number;
    slicerFirstLayerHeight: number;
    autoPaintMaxHeight?: number;
    enhancedColorMatch: boolean;
    preserveSeparation: boolean;
    maxRepeatedSwaps: AutoPaintRepeatLimit;
    transitionOpacity: AutoPaintTransitionOpacity;
    optimizerAlgorithm: 'fast' | 'balanced' | 'thorough' | 'deep' | 'exact';
    optimizerSeed?: number;
    regionWeightingMode: 'uniform' | 'center' | 'edge';
}

export interface UseAutoPaintWorkerResult {
    autoPaintResult: AutoPaintResult | undefined;
    isComputing: boolean;
    progress: number;
    error?: string;
}

let nextRequestId = 1;

export function isCurrentAutoPaintWorkerResponse(responseId: number, activeRequestId: number): boolean {
    return responseId === activeRequestId;
}

function isAutoPaintWorkerProgress(
    response: AutoPaintWorkerResponse
): response is AutoPaintWorkerProgress {
    return 'type' in response && response.type === 'progress';
}

function useStableValueByKey<T>(value: T, key: string): T {
    const stableRef = useRef<{ key: string; value: T } | null>(null);
    if (!stableRef.current || stableRef.current.key !== key) {
        stableRef.current = { key, value };
    }
    return stableRef.current.value;
}

function freezeWorkerValue<T>(value: T): T {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;

    for (const child of Object.values(value)) {
        freezeWorkerValue(child);
    }

    return Object.freeze(value);
}

export function useAutoPaintWorker(opts: UseAutoPaintWorkerOptions): UseAutoPaintWorkerResult {
    const {
        paintMode,
        filaments,
        filtered,
        layerHeight,
        slicerFirstLayerHeight,
        autoPaintMaxHeight,
        enhancedColorMatch,
        preserveSeparation,
        maxRepeatedSwaps,
        transitionOpacity,
        optimizerAlgorithm,
        optimizerSeed,
        regionWeightingMode,
    } = opts;

    const [autoPaintResult, setAutoPaintResult] = useState<AutoPaintResult | undefined>(undefined);
    const [isComputing, setIsComputing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | undefined>(undefined);

    const workerRef = useRef<Worker | null>(null);
    const activeRequestIdRef = useRef<number>(0);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimers = useCallback(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
    }, []);

    const cancelWorker = useCallback(() => {
        workerRef.current?.terminate();
        workerRef.current = null;
    }, []);

    const finishRequest = useCallback(
        (id: number, nextError?: string, result?: AutoPaintResult) => {
            if (id !== activeRequestIdRef.current) return;

            activeRequestIdRef.current = 0;
            setIsComputing(false);
            setProgress(nextError ? 0 : 1);
            setError(nextError);

            if (nextError) {
                console.error('[autoPaintWorker] error:', nextError);
                setAutoPaintResult(undefined);
            } else {
                setAutoPaintResult(
                    result
                        ? {
                              ...result,
                              finalStack: freezeWorkerValue(result.finalStack),
                          }
                        : undefined
                );
            }
        },
        []
    );

    // Stabilize filaments and filtered with content-based keys.
    const filamentsKey = useMemo(() => {
        return filaments
            .map((f) => `${f.id}:${f.color}:${f.td}:${JSON.stringify(f.calibration ?? null)}`)
            .join(';');
    }, [filaments]);

    const selectedImageSwatches = useMemo(() => {
        const rawSwatches = filtered.map((swatch) => ({
            hex: swatch.hex,
            rawCount: swatch.count ?? 1,
            sampleContext: swatch.sampleContext,
            weightedCount:
                regionWeightingMode === 'center'
                    ? swatch.centerWeight
                    : regionWeightingMode === 'edge'
                      ? swatch.edgeWeight
                      : undefined,
        }));
        const totalWeight = rawSwatches.reduce(
            (total, swatch) => total + (swatch.weightedCount ?? 0),
            0
        );

        return rawSwatches.map((swatch) => ({
            hex: swatch.hex,
            sampleContext: swatch.sampleContext,
            count:
                regionWeightingMode !== 'uniform' && totalWeight > 0
                    ? swatch.weightedCount ?? 0
                    : swatch.rawCount,
        }));
    }, [filtered, regionWeightingMode]);

    const filteredKey = useMemo(() => {
        return selectedImageSwatches
            .map((s) => `${s.hex}:${s.count}:${JSON.stringify(s.sampleContext ?? null)}`)
            .join(';');
    }, [selectedImageSwatches]);

    // Keep stable references when only array identity changes but content does not.
    const stableFilaments = useStableValueByKey(filaments, filamentsKey);
    const stableImageSwatches = useStableValueByKey(
        selectedImageSwatches,
        filteredKey
    );

    const getWorker = useCallback(() => {
        if (!workerRef.current) {
            workerRef.current = new Worker(
                new URL('../workers/autoPaint.worker.ts', import.meta.url),
                { type: 'module' }
            );

            workerRef.current.onmessage = (e: MessageEvent<AutoPaintWorkerResponse>) => {
                const resp = e.data;
                if (!isCurrentAutoPaintWorkerResponse(resp.id, activeRequestIdRef.current)) return;

                if (isAutoPaintWorkerProgress(resp)) {
                    setProgress((current) => Math.max(current, resp.progress));
                    return;
                }

                if (resp.error) {
                    finishRequest(resp.id, resp.error);
                } else {
                    finishRequest(resp.id, undefined, resp.result);
                }
            };

            workerRef.current.onerror = (err) => {
                const id = activeRequestIdRef.current;
                cancelWorker();
                finishRequest(id, err.message || 'Auto-paint worker failed');
            };

            workerRef.current.onmessageerror = () => {
                const id = activeRequestIdRef.current;
                cancelWorker();
                finishRequest(id, 'Auto-paint worker returned an unreadable result');
            };
        }

        return workerRef.current;
    }, [cancelWorker, finishRequest]);

    useEffect(() => {
        return () => {
            clearTimers();
            cancelWorker();
        };
    }, [cancelWorker, clearTimers]);

    useEffect(() => {
        clearTimers();

        if (paintMode !== 'autopaint' || filaments.length === 0 || filtered.length === 0) {
            activeRequestIdRef.current = 0;
            cancelWorker();
            setAutoPaintResult(undefined);
            setIsComputing(false);
            setProgress(0);
            setError(undefined);
            return;
        }

        // The worker algorithm is synchronous. Recreate the worker when inputs change so
        // stale optimizations cannot keep the only worker busy and block the latest request.
        cancelWorker();
        const id = nextRequestId++;
        activeRequestIdRef.current = id;
        setAutoPaintResult(undefined);
        setIsComputing(true);
        setProgress(0);
        setError(undefined);

        debounceTimerRef.current = setTimeout(() => {
            try {
                const worker = getWorker();
                const request: AutoPaintWorkerRequest = {
                    id,
                    filaments: stableFilaments,
                    imageSwatches: stableImageSwatches,
                    layerHeight,
                    firstLayerHeight: slicerFirstLayerHeight,
                    maxHeight: autoPaintMaxHeight,
                    enhancedColorMatch,
                    maxRepeatedSwaps,
                    optimizerOptions: {
                        algorithm: optimizerAlgorithm,
                        maxExtraRepeats: maxRepeatedSwaps,
                        transitionOpacity,
                        preserveSeparation,
                        ...(optimizerSeed !== undefined && { seed: optimizerSeed }),
                    },
                };

                worker.postMessage(request);
            } catch (postError) {
                cancelWorker();
                finishRequest(
                    id,
                    postError instanceof Error ? postError.message : String(postError)
                );
            }
        }, 250);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
        };
    }, [
        paintMode,
        filaments.length,
        filamentsKey,
        filtered.length,
        filteredKey,
        layerHeight,
        slicerFirstLayerHeight,
        autoPaintMaxHeight,
        enhancedColorMatch,
        preserveSeparation,
        maxRepeatedSwaps,
        transitionOpacity,
        optimizerAlgorithm,
        optimizerSeed,
        regionWeightingMode,
        getWorker,
        stableFilaments,
        stableImageSwatches,
        clearTimers,
        cancelWorker,
        finishRequest,
    ]);

    return { autoPaintResult, isComputing, progress, error };
}
