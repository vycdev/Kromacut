import { useEffect, useRef, useState } from 'react';
import type { ImageEditingRequest, ImageEditingResponse } from '../workers/imageEditing.worker';

/** At most one running job and one replaceable pending job while a handle is dragged. */
export function useThresholdPreview(
    source: ImageData | null,
    thresholds: number[],
    colors: string[]
) {
    const [preview, setPreview] = useState<ImageData | null>(null);
    const [error, setError] = useState(false);
    const send = useRef<((thresholds: number[], colors: string[]) => void) | null>(null);
    useEffect(() => {
        setPreview(null);
        setError(false);
        if (!source) return;
        let worker: Worker;
        try {
            worker = new Worker(new URL('../workers/imageEditing.worker.ts', import.meta.url), {
                type: 'module',
            });
        } catch {
            setError(true);
            return;
        }
        let active = true;
        let running = false;
        let queued: { thresholds: number[]; colors: string[] } | null = null;
        const dispatch = () => {
            if (running || !queued || !active) return;
            const { thresholds, colors } = queued;
            queued = null;
            running = true;
            const pixels = new ImageData(
                new Uint8ClampedArray(source.data),
                source.width,
                source.height
            );
            const request: ImageEditingRequest = {
                kind: 'threshold-preview',
                pixels,
                thresholds,
                colors,
            };
            try {
                worker.postMessage(request, [pixels.data.buffer]);
            } catch {
                running = false;
                setError(true);
            }
        };
        send.current = (thresholds, colors) => {
            queued = { thresholds, colors };
            dispatch();
        };
        worker.onmessage = (event: MessageEvent<ImageEditingResponse>) => {
            if (!active) return;
            running = false;
            // Completed jobs are ordered. Paint each one even during continuous dragging.
            if (event.data.result && 'data' in event.data.result) {
                setPreview(event.data.result);
                setError(false);
            } else setError(true);
            dispatch();
        };
        const fail = () => {
            if (active) {
                running = false;
                queued = null;
                setError(true);
                active = false;
                send.current = null;
            }
            worker.terminate();
        };
        worker.onerror = (event) => {
            event.preventDefault();
            fail();
        };
        worker.onmessageerror = fail;
        return () => {
            active = false;
            send.current = null;
            worker.terminate();
        };
    }, [source]);
    useEffect(() => {
        send.current?.(thresholds, colors);
    }, [source, thresholds, colors]);
    return { preview, error };
}
