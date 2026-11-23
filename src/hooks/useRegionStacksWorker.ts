/**
 * Hook that plans per-region stacks in a Web Worker.
 *
 * Planning runs when the user clicks "Build 3D Model" (call `run()`). Calling
 * it again, or unmounting, cancels the run in flight.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RegionStackPlan } from '../types';
import type { RegionStackPlanOptions } from '../lib/regionStacks';
import type {
    RegionStacksWorkerRequest,
    RegionStacksWorkerResponse,
} from '../workers/regionStacks.worker';

export interface UseRegionStacksWorkerResult {
    isComputing: boolean;
    error?: string;
    run: (options: RegionStackPlanOptions) => Promise<RegionStackPlan | null>;
    /** Stop planning in flight; its pending run resolves null. */
    cancel: () => void;
}

let nextId = 1;

export function useRegionStacksWorker(): UseRegionStacksWorkerResult {
    const [isComputing, setIsComputing] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const workerRef = useRef<Worker | null>(null);
    const pendingResolveRef = useRef<((result: RegionStackPlan | null) => void) | null>(null);

    const cancelWorker = useCallback(() => {
        workerRef.current?.terminate();
        workerRef.current = null;
        pendingResolveRef.current?.(null);
        pendingResolveRef.current = null;
    }, []);

    const cancel = useCallback(() => {
        cancelWorker();
        setIsComputing(false);
    }, [cancelWorker]);

    useEffect(() => cancelWorker, [cancelWorker]);

    const run = useCallback(
        (options: RegionStackPlanOptions): Promise<RegionStackPlan | null> => {
            cancelWorker();
            setError(undefined);
            setIsComputing(true);
            const id = nextId++;

            return new Promise((resolve) => {
                const fail = (message: string) => {
                    if (pendingResolveRef.current !== resolve) return;
                    pendingResolveRef.current = null;
                    cancelWorker();
                    setIsComputing(false);
                    setError(message);
                    resolve(null);
                };
                pendingResolveRef.current = resolve;
                let worker: Worker;
                try {
                    worker = new Worker(
                        new URL('../workers/regionStacks.worker.ts', import.meta.url),
                        { type: 'module' }
                    );
                    workerRef.current = worker;
                } catch (err) {
                    fail(err instanceof Error ? err.message : String(err));
                    return;
                }

                worker.onmessage = (e: MessageEvent<RegionStacksWorkerResponse>) => {
                    if (e.data.id !== id || pendingResolveRef.current !== resolve) return;
                    if (e.data.error) {
                        fail(e.data.error);
                        return;
                    }
                    pendingResolveRef.current = null;
                    cancelWorker();
                    setIsComputing(false);
                    resolve(e.data.result ?? null);
                };
                worker.onerror = (err) => fail(err.message || 'Region stack worker failed');
                worker.onmessageerror = () =>
                    fail('Region stack worker returned an unreadable result');

                const request: RegionStacksWorkerRequest = { id, ...options };
                try {
                    worker.postMessage(request);
                } catch (err) {
                    fail(err instanceof Error ? err.message : String(err));
                }
            });
        },
        [cancelWorker]
    );

    return { isComputing, error, run, cancel };
}
