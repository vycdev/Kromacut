import { useCallback, useEffect, useRef, useState } from 'react';
import type { NextBestColorResult } from '../lib/nextBestColor';
import type { Filament } from '../types';
import type {
    NextBestColorWorkerRequest,
    NextBestColorWorkerResponse,
} from '../workers/nextBestColor.worker';

export interface UseNextBestColorWorkerResult {
    result: NextBestColorResult | null;
    isComputing: boolean;
    error?: string;
    requestSuggestion: (
        filaments: Filament[],
        imageSwatches: Array<{ hex: string; count?: number }>
    ) => void;
    reset: () => void;
}

let nextRequestId = 1;

export function useNextBestColorWorker(): UseNextBestColorWorkerResult {
    const [result, setResult] = useState<NextBestColorResult | null>(null);
    const [isComputing, setIsComputing] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);

    const workerRef = useRef<Worker | null>(null);
    const activeRequestIdRef = useRef(0);

    const cancelWorker = useCallback(() => {
        workerRef.current?.terminate();
        workerRef.current = null;
    }, []);

    const finishRequest = useCallback(
        (id: number, nextError?: string, nextResult?: NextBestColorResult) => {
            if (id !== activeRequestIdRef.current) return;

            activeRequestIdRef.current = 0;
            cancelWorker();
            setIsComputing(false);
            setError(nextError);
            setResult(nextError ? null : (nextResult ?? null));
        },
        [cancelWorker]
    );

    const reset = useCallback(() => {
        activeRequestIdRef.current = 0;
        cancelWorker();
        setResult(null);
        setIsComputing(false);
        setError(undefined);
    }, [cancelWorker]);

    const requestSuggestion = useCallback(
        (filaments: Filament[], imageSwatches: Array<{ hex: string; count?: number }>) => {
            if (filaments.length === 0 || imageSwatches.length === 0) {
                reset();
                return;
            }

            cancelWorker();
            const id = nextRequestId++;
            activeRequestIdRef.current = id;
            setResult(null);
            setIsComputing(true);
            setError(undefined);

            try {
                const worker = new Worker(
                    new URL('../workers/nextBestColor.worker.ts', import.meta.url),
                    { type: 'module' }
                );
                workerRef.current = worker;

                worker.onmessage = (e: MessageEvent<NextBestColorWorkerResponse>) => {
                    const response = e.data;
                    finishRequest(response.id, response.error, response.result);
                };

                worker.onerror = (err) => {
                    finishRequest(id, err.message || 'Next-best-color worker failed');
                };

                worker.onmessageerror = () => {
                    finishRequest(id, 'Next-best-color worker returned an unreadable result');
                };

                const request: NextBestColorWorkerRequest = { id, filaments, imageSwatches };
                worker.postMessage(request);
            } catch (postError) {
                finishRequest(
                    id,
                    postError instanceof Error ? postError.message : String(postError)
                );
            }
        },
        [cancelWorker, finishRequest, reset]
    );

    useEffect(() => {
        return () => {
            activeRequestIdRef.current = 0;
            cancelWorker();
        };
    }, [cancelWorker]);

    return { result, isComputing, error, requestSuggestion, reset };
}
