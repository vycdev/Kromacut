import { useCallback, useEffect, useRef } from 'react';
import type {
    ImageEditingRequest,
    ImageEditingResponse,
    ImageEditingResult,
} from '../workers/imageEditing.worker';

/** One cancellable preparation/application operation, including image decode and encoding. */
export function useImageWorkerTask() {
    const pending = useRef<{ worker: Worker; reject: (error: Error) => void } | null>(null);
    const cancel = useCallback(() => {
        const task = pending.current;
        pending.current = null;
        task?.worker.terminate();
        task?.reject(new Error('Cancelled'));
    }, []);
    useEffect(() => cancel, [cancel]);
    const run = useCallback(
        (request: ImageEditingRequest): Promise<ImageEditingResult> => {
            cancel();
            return new Promise((resolve, reject) => {
                const worker = new Worker(
                    new URL('../workers/imageEditing.worker.ts', import.meta.url),
                    { type: 'module' }
                );
                const finish = () => {
                    worker.terminate();
                    if (pending.current?.worker === worker) pending.current = null;
                };
                pending.current = { worker, reject };
                worker.onmessage = (event: MessageEvent<ImageEditingResponse>) => {
                    finish();
                    if (event.data.result) resolve(event.data.result);
                    else reject(new Error(event.data.error ?? 'Image processing failed'));
                };
                worker.onerror = (event) => {
                    event.preventDefault();
                    finish();
                    reject(new Error('Image worker failed'));
                };
                worker.onmessageerror = () => {
                    finish();
                    reject(new Error('Invalid worker response'));
                };
                try {
                    worker.postMessage(
                        request,
                        'snapshot' in request ? [request.snapshot.bitmap] : []
                    );
                } catch (error) {
                    finish();
                    reject(error);
                }
            });
        },
        [cancel]
    );
    return { run, cancel };
}
