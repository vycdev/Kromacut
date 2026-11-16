import { thresholdPixels } from '../lib/thresholds';
import { opaqueBounds } from '../lib/opaqueBounds';

export type ImageEditingRequest =
    | { kind: 'threshold-source' | 'nozzle-source'; blob: Blob }
    | { kind: 'threshold-apply'; blob: Blob; thresholds: number[]; colors: string[] }
    | { kind: 'threshold-preview'; pixels: ImageData; thresholds: number[]; colors: string[] };
export interface PreparedImage {
    pixels: ImageData;
    originalWidth: number;
    originalHeight: number;
}
export type ImageEditingResult = PreparedImage | Blob | ImageData;
export interface ImageEditingResponse {
    result?: ImageEditingResult;
    error?: string;
}

self.onmessage = async (event: MessageEvent<ImageEditingRequest>) => {
    const request = event.data;
    let bitmap: ImageBitmap | undefined;
    try {
        if (request.kind === 'threshold-preview') {
            const { pixels } = request;
            const result = new ImageData(
                thresholdPixels(pixels.data, request.thresholds, request.colors),
                pixels.width,
                pixels.height
            );
            self.postMessage({ result }, { transfer: [result.data.buffer] });
            return;
        }
        bitmap = await createImageBitmap(request.blob);
        const full = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = full.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        bitmap = undefined;
        if (request.kind === 'threshold-apply') {
            const pixels = ctx.getImageData(0, 0, full.width, full.height);
            const result = thresholdPixels(pixels.data, request.thresholds, request.colors);
            ctx.putImageData(new ImageData(result, full.width, full.height), 0, 0);
            self.postMessage({ result: await full.convertToBlob({ type: 'image/png' }) });
            return;
        }
        const bounds =
            request.kind === 'nozzle-source'
                ? opaqueBounds(
                      ctx.getImageData(0, 0, full.width, full.height).data,
                      full.width,
                      full.height
                  )
                : { x: 0, y: 0, width: full.width, height: full.height };
        if (!bounds) throw new Error('Empty image');
        const limit = request.kind === 'nozzle-source' ? 1024 : 1000;
        const scale = Math.min(1, limit / Math.max(bounds.width, bounds.height));
        const preview = new OffscreenCanvas(
            Math.max(1, Math.round(bounds.width * scale)),
            Math.max(1, Math.round(bounds.height * scale))
        );
        const out = preview.getContext('2d')!;
        out.imageSmoothingEnabled = request.kind !== 'nozzle-source';
        out.drawImage(
            full,
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
            0,
            0,
            preview.width,
            preview.height
        );
        const pixels = out.getImageData(0, 0, preview.width, preview.height);
        const result: PreparedImage = {
            pixels,
            originalWidth: bounds.width,
            originalHeight: bounds.height,
        };
        self.postMessage({ result }, { transfer: [pixels.data.buffer] });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    } finally {
        bitmap?.close();
    }
};
