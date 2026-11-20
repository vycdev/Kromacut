import { renderImageEdit } from '../lib/renderImageEdit';
import type { ImageEditRequest, ImageEditResponse } from '../types/imageEditing';

const active = new Map<number, AbortController>();
const send = (response: ImageEditResponse, transfer: Transferable[] = []) =>
    self.postMessage(response, { transfer });

self.addEventListener('message', ({ data }: MessageEvent<ImageEditRequest>) => {
    if (data.kind === 'cancel') {
        active.get(data.id)?.abort();
        return;
    }
    const controller = new AbortController();
    active.set(data.id, controller);
    void render(data, controller.signal).finally(() => active.delete(data.id));
});

async function render(request: Extract<ImageEditRequest, { kind: 'render' }>, signal: AbortSignal) {
    const { id, output, snapshot } = request;
    try {
        if (
            typeof OffscreenCanvas === 'undefined' ||
            !new OffscreenCanvas(1, 1).getContext('2d') ||
            (output === 'preview' && !OffscreenCanvas.prototype.transferToImageBitmap) ||
            (output === 'png' && !OffscreenCanvas.prototype.convertToBlob)
        ) {
            send({ id, kind: 'unsupported' });
            return;
        }
        const canvas = await renderImageEdit(
            snapshot.bitmap,
            snapshot,
            (w, h) => new OffscreenCanvas(w, h),
            signal
        );
        if (output === 'png') {
            const image = await canvas.convertToBlob({ type: 'image/png' });
            if (!signal.aborted) send({ id, kind: 'result', image });
        } else if (!signal.aborted) {
            const image = canvas.transferToImageBitmap();
            send({ id, kind: 'result', image }, [image]);
        }
    } catch (error) {
        if (!signal.aborted) {
            send({
                id,
                kind: 'error',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    } finally {
        snapshot.bitmap.close();
    }
}
