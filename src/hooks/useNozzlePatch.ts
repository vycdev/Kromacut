import { assertNozzlePatchSize } from '../lib/nozzlePatchLimits';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RegionPatch } from '../lib/patchVulnerableRegions';
import type { NozzleComparisonResponse } from '../workers/nozzlePreview.worker';

/** Full-resolution application; cancellation cannot commit an obsolete result. */
export function useNozzlePatch() {
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<'error' | 'unchanged' | null>(null);
    const operation = useRef(0);
    const pending = useRef<{ worker: Worker; reject: (error: Error) => void } | null>(null);
    const abort = useCallback(() => {
        operation.current++;
        pending.current?.worker.terminate();
        pending.current?.reject(new Error('Cancelled'));
        pending.current = null;
    }, []);
    useEffect(() => abort, [abort]);
    const cancel = useCallback(() => {
        abort();
        setBusy(false);
        setStatus(null);
    }, [abort]);
    async function apply(
        blob: Blob,
        croppedWidth: number,
        widthMm: number,
        lineWidthMm: number
    ): Promise<Blob | null> {
        abort();
        const id = operation.current;
        setBusy(true);
        setStatus(null);
        let bitmap: ImageBitmap | undefined;
        try {
            bitmap = await createImageBitmap(blob);
            if (id !== operation.current) return null;
            assertNozzlePatchSize(bitmap.width, bitmap.height);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(bitmap, 0, 0);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
            bitmap.close();
            bitmap = undefined;
            const patch = await new Promise<RegionPatch>((resolve, reject) => {
                const worker = new Worker(
                    new URL('../workers/nozzlePreview.worker.ts', import.meta.url),
                    { type: 'module' }
                );
                pending.current = { worker, reject };
                worker.onmessage = (event: MessageEvent<NozzleComparisonResponse>) =>
                    event.data.patch
                        ? resolve(event.data.patch)
                        : reject(new Error(event.data.error ?? 'Patch failed'));
                worker.onerror = (event) => {
                    event.preventDefault();
                    reject(new Error('Patch failed'));
                };
                worker.onmessageerror = () => reject(new Error('Patch failed'));
                worker.postMessage(
                    {
                        id,
                        width: canvas.width,
                        height: canvas.height,
                        data: pixels.data,
                        pixelSizeMm: widthMm / croppedWidth,
                        lineWidthMm,
                        omitAtRiskPixels: false,
                        patchOnly: true,
                    },
                    [pixels.data.buffer]
                );
            });
            if (id !== operation.current) return null;
            if (!patch.changedPixelCount) {
                setStatus('unchanged');
                return null;
            }
            ctx.putImageData(
                new ImageData(new Uint8ClampedArray(patch.data), canvas.width, canvas.height),
                0,
                0
            );
            const result = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, 'image/png')
            );
            if (id !== operation.current) return null;
            if (!result) throw new Error('Patch encoding failed');
            return result;
        } catch {
            if (id === operation.current) setStatus('error');
            return null;
        } finally {
            bitmap?.close();
            if (id === operation.current) {
                pending.current?.worker.terminate();
                pending.current = null;
                setBusy(false);
            }
        }
    }
    return { apply, cancel, busy, status };
}
