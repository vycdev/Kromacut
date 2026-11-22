/**
 * Hook that runs the multi-head analysis in a Web Worker.
 *
 * The analysis runs when the user clicks "Build 3D Model" (call `run()`).
 * Cancels the in-flight worker if called again before the previous run finishes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Filament, MultiHeadDitherContext } from '../types';
import type { AutoPaintResult } from '../lib/autoPaint';
import type {
    ColorFirstResult,
    MultiHeadColorMode,
} from '../lib/multiHeadAnalysisColorFirst';
import type {
    MultiHeadWorkerRequest,
    MultiHeadWorkerResponse,
} from '../workers/multiHead.worker';

export interface UseMultiHeadWorkerResult {
    isComputing: boolean;
    error?: string;
    cancel: () => void;
    run: (params: {
        filaments: Filament[];
        autoPaintResult: AutoPaintResult;
        imageSwatches: Array<{ hex: string; count?: number }>;
        layerHeight: number;
        firstLayerHeight: number;
        n: number;
        searchDepth: 'fast' | 'balanced' | 'thorough';
        colorMode: MultiHeadColorMode;
        heightDithering?: boolean;
        ditherContext?: MultiHeadDitherContext;
    }) => Promise<ColorFirstResult | null>;
}

let nextId = 1;

export function useMultiHeadWorker(): UseMultiHeadWorkerResult {
    const [isComputing, setIsComputing] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const workerRef = useRef<Worker | null>(null);
    const activeIdRef = useRef<number>(0);
    const pendingResolveRef = useRef<((result: ColorFirstResult | null) => void) | null>(null);

    const cancelWorker = useCallback(() => {
        workerRef.current?.terminate();
        workerRef.current = null;
        activeIdRef.current = 0;
        pendingResolveRef.current?.(null);
        pendingResolveRef.current = null;
    }, []);

    const cancel = useCallback(() => {
        cancelWorker();
        setIsComputing(false);
    }, [cancelWorker]);

    // Terminate any in-flight worker on unmount so it cannot keep computing
    // (and attempt state updates) after the component is gone.
    useEffect(() => cancelWorker, [cancelWorker]);

    const run = useCallback(
        (params: {
            filaments: Filament[];
            autoPaintResult: AutoPaintResult;
            imageSwatches: Array<{ hex: string; count?: number }>;
            layerHeight: number;
            firstLayerHeight: number;
            n: number;
            searchDepth: 'fast' | 'balanced' | 'thorough';
            colorMode: MultiHeadColorMode;
            heightDithering?: boolean;
            ditherContext?: MultiHeadDitherContext;
        }): Promise<ColorFirstResult | null> => {
            cancelWorker();
            setError(undefined);
            setIsComputing(true);

            const id = nextId++;
            activeIdRef.current = id;

            return new Promise((resolve) => {
                pendingResolveRef.current = resolve;
                let worker: Worker;
                try {
                    worker = new Worker(
                        new URL('../workers/multiHead.worker.ts', import.meta.url),
                        { type: 'module' }
                    );
                    workerRef.current = worker;
                } catch (err) {
                    cancelWorker();
                    setIsComputing(false);
                    setError(err instanceof Error ? err.message : String(err));
                    return;
                }

                worker.onmessage = (e: MessageEvent<MultiHeadWorkerResponse>) => {
                    const resp = e.data;
                    if (resp.id !== activeIdRef.current) return;
                    pendingResolveRef.current = null;
                    cancelWorker();
                    setIsComputing(false);
                    if (resp.error) {
                        setError(resp.error);
                        resolve(null);
                    } else {
                        resolve(resp.result ?? null);
                    }
                };

                worker.onerror = (err) => {
                    if (activeIdRef.current !== id) return;
                    cancelWorker();
                    setIsComputing(false);
                    setError(err.message || 'Multi-head worker failed');
                    resolve(null);
                };

                worker.onmessageerror = () => {
                    if (activeIdRef.current !== id) return;
                    cancelWorker();
                    setIsComputing(false);
                    setError('Multi-head worker returned an unreadable result');
                    resolve(null);
                };

                const request: MultiHeadWorkerRequest = {
                    id,
                    filaments: params.filaments,
                    autoPaintResult: params.autoPaintResult,
                    imageSwatches: params.imageSwatches,
                    layerHeight: params.layerHeight,
                    firstLayerHeight: params.firstLayerHeight,
                    n: params.n,
                    searchDepth: params.searchDepth,
                    colorMode: params.colorMode,
                    heightDithering: params.heightDithering,
                    // Pixel snapshots may conceal their large buffer from React;
                    // explicitly expose it to structured cloning without transfer.
                    ditherContext: params.ditherContext ? {
                        ...params.ditherContext,
                        pixels: {
                            width: params.ditherContext.pixels.width,
                            height: params.ditherContext.pixels.height,
                            data: params.ditherContext.pixels.data,
                        },
                    } : undefined,
                };
                try {
                    worker.postMessage(request);
                } catch (err) {
                    cancelWorker();
                    setIsComputing(false);
                    setError(err instanceof Error ? err.message : String(err));
                }
            });
        },
        [cancelWorker]
    );

    return { isComputing, error, run, cancel };
}
