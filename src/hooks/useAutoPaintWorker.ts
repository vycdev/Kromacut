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
import type { AutoPaintRepeatLimit, AutoPaintTransitionOpacity, Filament, Swatch } from '../types';
import type {
    AutoPaintWorkerDiagnostic,
    AutoPaintWorkerProgress,
    AutoPaintWorkerRequest,
    AutoPaintWorkerResponse,
} from '../workers/autoPaint.worker';
import {
    fingerprintCompletedAppearanceEvidence,
    serializeAppearanceProfile,
    type AppearanceProfileV1,
} from '../lib/appearanceProfile.ts';
import {
    shouldRetainCompletedThreeDWork,
    shouldRunThreeDBackgroundWork,
} from '../lib/threeDWorkLifecycle.ts';
import { getAutoPaintDiagnosticsEnabled } from '../lib/diagnosticPreferences.ts';
import {
    appendAutoPaintDiagnostic,
    beginAutoPaintDiagnosticSession,
    finishAutoPaintDiagnosticSession,
    type DesktopDiagnosticSession,
} from '../lib/desktopDiagnostics.ts';
import type { AutoPaintDiagnosticRunInputV1 } from '../lib/autoPaintDiagnostics.ts';
import { frontlitCalibrationDiagnostics } from '../lib/calibration.ts';

declare const __APP_VERSION__: string;

export interface UseAutoPaintWorkerOptions {
    active?: boolean;
    paintMode: 'manual' | 'autopaint';
    filaments: Filament[];
    filtered: Swatch[];
    layerHeight: number;
    slicerFirstLayerHeight: number;
    autoPaintMaxHeight?: number;
    enhancedColorMatch: boolean;
    preserveSeparation: boolean;
    separationMaxDeltaE: number;
    failOnSeparationError: boolean;
    maxRepeatedSwaps: AutoPaintRepeatLimit;
    transitionOpacity: AutoPaintTransitionOpacity;
    optimizerAlgorithm: 'fast' | 'balanced' | 'thorough' | 'deep' | 'exact';
    optimizerSeed?: number;
    regionWeightingMode: 'uniform' | 'center' | 'edge';
    appearance?: AppearanceProfileV1;
}

export interface UseAutoPaintWorkerResult {
    autoPaintResult: AutoPaintResult | undefined;
    isComputing: boolean;
    progress: number;
    error?: string;
}

let nextRequestId = 1;

export function isCurrentAutoPaintWorkerResponse(
    responseId: number,
    activeRequestId: number
): boolean {
    return responseId === activeRequestId;
}

export function shouldRecordAutoPaintDiagnosticProgress(
    last: { at: number; progress: number },
    nextProgress: number,
    now: number
): boolean {
    return (
        nextProgress >= 1 || now - last.at >= 5_000 || nextProgress - last.progress >= 0.05 - 1e-9
    );
}

function isAutoPaintWorkerProgress(
    response: AutoPaintWorkerResponse
): response is AutoPaintWorkerProgress {
    return 'type' in response && response.type === 'progress';
}

function isAutoPaintWorkerDiagnostic(
    response: AutoPaintWorkerResponse
): response is AutoPaintWorkerDiagnostic {
    return 'type' in response && response.type === 'diagnostic';
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
        active = true,
        paintMode,
        filaments,
        filtered,
        layerHeight,
        slicerFirstLayerHeight,
        autoPaintMaxHeight,
        enhancedColorMatch,
        preserveSeparation,
        separationMaxDeltaE,
        failOnSeparationError,
        maxRepeatedSwaps,
        transitionOpacity,
        optimizerAlgorithm,
        optimizerSeed,
        regionWeightingMode,
        appearance,
    } = opts;

    const [autoPaintResult, setAutoPaintResult] = useState<AutoPaintResult | undefined>(undefined);
    const [isComputing, setIsComputing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | undefined>(undefined);

    const workerRef = useRef<Worker | null>(null);
    const activeRequestIdRef = useRef<number>(0);
    const activeRequestKeyRef = useRef<string | null>(null);
    const completedRequestKeyRef = useRef<string | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const diagnosticSessionRef = useRef<{
        requestId: number;
        session: DesktopDiagnosticSession;
    } | null>(null);
    const lastDiagnosticProgressRef = useRef({ at: 0, progress: 0 });

    const clearTimers = useCallback(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
    }, []);

    const closeDiagnosticSession = useCallback(
        (requestId: number | undefined, kind: string, payload?: unknown) => {
            const active = diagnosticSessionRef.current;
            if (!active || (requestId !== undefined && active.requestId !== requestId)) return;
            diagnosticSessionRef.current = null;
            finishAutoPaintDiagnosticSession(active.session, kind, payload);
        },
        []
    );

    const cancelWorker = useCallback(
        (reason: string = 'worker-cancelled') => {
            workerRef.current?.terminate();
            workerRef.current = null;
            closeDiagnosticSession(undefined, 'run-cancelled', { reason });
        },
        [closeDiagnosticSession]
    );

    const finishRequest = useCallback(
        (id: number, nextError?: string, result?: AutoPaintResult) => {
            if (id !== activeRequestIdRef.current) return;

            const completedKey = activeRequestKeyRef.current;
            activeRequestIdRef.current = 0;
            activeRequestKeyRef.current = null;
            setIsComputing(false);
            setProgress(nextError ? 0 : 1);
            setError(nextError);

            if (nextError) {
                completedRequestKeyRef.current = null;
                console.error('[autoPaintWorker] error:', nextError);
                setAutoPaintResult(undefined);
                closeDiagnosticSession(id, 'run-error', { error: nextError });
            } else {
                completedRequestKeyRef.current = result ? completedKey : null;
                setAutoPaintResult(
                    result
                        ? {
                              ...result,
                              finalStack: freezeWorkerValue(result.finalStack),
                          }
                        : undefined
                );
                closeDiagnosticSession(id, 'run-complete', {
                    finalStackFingerprint: result?.finalStack.fingerprint ?? null,
                    totalHeight: result?.totalHeight ?? null,
                });
            }
        },
        [closeDiagnosticSession]
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
                    ? (swatch.weightedCount ?? 0)
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
    const stableImageSwatches = useStableValueByKey(selectedImageSwatches, filteredKey);
    const appearanceKey = useMemo(
        () => fingerprintCompletedAppearanceEvidence(appearance),
        [appearance]
    );
    const stableAppearance = useStableValueByKey(appearance, appearanceKey);
    const serializedAppearance = useMemo(
        () => serializeAppearanceProfile(stableAppearance),
        [stableAppearance]
    );
    const requestKey = useMemo(
        () =>
            JSON.stringify([
                paintMode,
                filamentsKey,
                filteredKey,
                layerHeight,
                slicerFirstLayerHeight,
                autoPaintMaxHeight,
                enhancedColorMatch,
                preserveSeparation,
                separationMaxDeltaE,
                failOnSeparationError,
                maxRepeatedSwaps,
                transitionOpacity,
                optimizerAlgorithm,
                optimizerSeed,
                regionWeightingMode,
                appearanceKey,
            ]),
        [
            appearanceKey,
            autoPaintMaxHeight,
            enhancedColorMatch,
            failOnSeparationError,
            filamentsKey,
            filteredKey,
            layerHeight,
            maxRepeatedSwaps,
            optimizerAlgorithm,
            optimizerSeed,
            paintMode,
            preserveSeparation,
            regionWeightingMode,
            separationMaxDeltaE,
            slicerFirstLayerHeight,
            transitionOpacity,
        ]
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
                    const activeDiagnostic = diagnosticSessionRef.current;
                    const now = Date.now();
                    const last = lastDiagnosticProgressRef.current;
                    if (
                        activeDiagnostic?.requestId === resp.id &&
                        shouldRecordAutoPaintDiagnosticProgress(last, resp.progress, now)
                    ) {
                        appendAutoPaintDiagnostic(activeDiagnostic.session, 'progress', {
                            progress: resp.progress,
                            iteration: resp.iteration,
                            total: resp.total,
                            bestScore: resp.bestScore,
                        });
                        lastDiagnosticProgressRef.current = {
                            at: now,
                            progress: resp.progress,
                        };
                    }
                    return;
                }

                if (isAutoPaintWorkerDiagnostic(resp)) {
                    const activeDiagnostic = diagnosticSessionRef.current;
                    if (activeDiagnostic?.requestId === resp.id) {
                        appendAutoPaintDiagnostic(
                            activeDiagnostic.session,
                            resp.kind,
                            resp.payload
                        );
                    }
                    return;
                }

                if (resp.error) {
                    finishRequest(resp.id, resp.error);
                } else {
                    const activeDiagnostic = diagnosticSessionRef.current;
                    if (resp.diagnosticResult && activeDiagnostic?.requestId === resp.id) {
                        appendAutoPaintDiagnostic(
                            activeDiagnostic.session,
                            'result',
                            resp.diagnosticResult
                        );
                    }
                    finishRequest(resp.id, undefined, resp.result);
                }
            };

            workerRef.current.onerror = (err) => {
                const id = activeRequestIdRef.current;
                workerRef.current?.terminate();
                workerRef.current = null;
                finishRequest(id, err.message || 'Auto-paint worker failed');
            };

            workerRef.current.onmessageerror = () => {
                const id = activeRequestIdRef.current;
                workerRef.current?.terminate();
                workerRef.current = null;
                finishRequest(id, 'Auto-paint worker returned an unreadable result');
            };
        }

        return workerRef.current;
    }, [finishRequest]);

    useEffect(() => {
        return () => {
            clearTimers();
            cancelWorker('hook-unmounted');
        };
    }, [cancelWorker, clearTimers]);

    useEffect(() => {
        clearTimers();

        const ready = paintMode === 'autopaint' && filaments.length > 0 && filtered.length > 0;
        if (!shouldRunThreeDBackgroundWork(active, ready)) {
            activeRequestIdRef.current = 0;
            activeRequestKeyRef.current = null;
            cancelWorker('auto-paint-inactive-or-inputs-unavailable');
            if (
                !shouldRetainCompletedThreeDWork(active, completedRequestKeyRef.current, requestKey)
            ) {
                completedRequestKeyRef.current = null;
                setAutoPaintResult(undefined);
            }
            setIsComputing(false);
            setProgress(0);
            setError(undefined);
            return;
        }

        if (completedRequestKeyRef.current === requestKey) {
            activeRequestIdRef.current = 0;
            activeRequestKeyRef.current = null;
            cancelWorker('completed-result-reused');
            setIsComputing(false);
            setProgress(1);
            setError(undefined);
            return;
        }

        // The worker algorithm is synchronous. Recreate the worker when inputs change so
        // stale optimizations cannot keep the only worker busy and block the latest request.
        cancelWorker('superseded-by-new-request');
        const id = nextRequestId++;
        activeRequestIdRef.current = id;
        activeRequestKeyRef.current = requestKey;
        completedRequestKeyRef.current = null;
        setAutoPaintResult(undefined);
        setIsComputing(true);
        setProgress(0);
        setError(undefined);

        debounceTimerRef.current = setTimeout(async () => {
            try {
                let diagnosticSession: DesktopDiagnosticSession | null = null;
                if (getAutoPaintDiagnosticsEnabled()) {
                    try {
                        diagnosticSession = await beginAutoPaintDiagnosticSession();
                    } catch (diagnosticError) {
                        console.error(
                            '[autoPaintDiagnostics] Could not start diagnostic recording:',
                            diagnosticError
                        );
                    }
                }
                if (id !== activeRequestIdRef.current) {
                    finishAutoPaintDiagnosticSession(diagnosticSession, 'run-cancelled', {
                        reason: 'request-became-stale-before-worker-start',
                    });
                    return;
                }
                if (diagnosticSession) {
                    diagnosticSessionRef.current = { requestId: id, session: diagnosticSession };
                    lastDiagnosticProgressRef.current = { at: Date.now(), progress: 0 };
                    const diagnosticInput: AutoPaintDiagnosticRunInputV1 = {
                        schemaVersion: 1,
                        appVersion: __APP_VERSION__,
                        requestId: id,
                        runtime: {
                            userAgent: navigator.userAgent,
                            hardwareConcurrency: navigator.hardwareConcurrency || null,
                            deviceMemoryGiB:
                                (navigator as Navigator & { deviceMemory?: number }).deviceMemory ??
                                null,
                            crossOriginIsolated: globalThis.crossOriginIsolated === true,
                        },
                        appearanceEvidenceFingerprint: appearanceKey,
                        regionWeightingMode,
                        filaments: stableFilaments,
                        calibrationDiagnostics: stableFilaments.map((filament) => ({
                            filamentId: filament.id,
                            filamentColor: filament.color,
                            calibration: frontlitCalibrationDiagnostics(filament),
                        })),
                        imageSwatches: stableImageSwatches,
                        settings: {
                            layerHeight,
                            firstLayerHeight: slicerFirstLayerHeight,
                            maxHeight: autoPaintMaxHeight ?? null,
                            enhancedColorMatch,
                            maxRepeatedSwaps,
                            optimizerAlgorithm,
                            optimizerSeed: optimizerSeed ?? null,
                            transitionOpacity,
                            preserveSeparation,
                            separationMaxDeltaE,
                            failOnSeparationError,
                        },
                        appearanceProfile: serializedAppearance
                            ? (JSON.parse(serializedAppearance) as AppearanceProfileV1)
                            : null,
                    };
                    appendAutoPaintDiagnostic(diagnosticSession, 'run-start', diagnosticInput);
                }
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
                        separationMaxDeltaE,
                        failOnSeparationError,
                        ...(optimizerSeed !== undefined && { seed: optimizerSeed }),
                    },
                    appearanceJson: serializedAppearance,
                    diagnostics: diagnosticSession !== null,
                };

                worker.postMessage(request);
            } catch (postError) {
                workerRef.current?.terminate();
                workerRef.current = null;
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
        active,
        requestKey,
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
        separationMaxDeltaE,
        failOnSeparationError,
        maxRepeatedSwaps,
        transitionOpacity,
        optimizerAlgorithm,
        optimizerSeed,
        regionWeightingMode,
        appearanceKey,
        getWorker,
        stableFilaments,
        stableImageSwatches,
        serializedAppearance,
        clearTimers,
        cancelWorker,
        finishRequest,
    ]);

    return { autoPaintResult, isComputing, progress, error };
}
