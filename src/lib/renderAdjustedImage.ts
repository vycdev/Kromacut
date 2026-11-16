import { applyAdjustments, isAllDefault } from './applyAdjustments';
import { replaceImageColors } from './replaceImageColors';
import type { ImageEditSnapshot } from '../types';

/** Worker-only full-resolution rendering with bounded JS pixel buffers. */
export function renderAdjustedImage({ bitmap, adjustments, replacements }: ImageEditSnapshot) {
    const output = new OffscreenCanvas(bitmap.width, bitmap.height);
    const out = output.getContext('2d')!;
    const adjust = !isAllDefault(adjustments);
    if (!adjust && !Object.keys(replacements).length) {
        out.drawImage(bitmap, 0, 0);
        return output;
    }
    const tile = new OffscreenCanvas(514, 514);
    const ctx = tile.getContext('2d', { willReadFrequently: true })!;
    for (let y = 0; y < bitmap.height; y += 512)
        for (let x = 0; x < bitmap.width; x += 512) {
            const endX = Math.min(bitmap.width, x + 512);
            const endY = Math.min(bitmap.height, y + 512);
            // Clarity uses a 3x3 neighborhood, including across tile boundaries.
            const sx = Math.max(0, x - 1),
                sy = Math.max(0, y - 1);
            const w = Math.min(bitmap.width, endX + 1) - sx;
            const h = Math.min(bitmap.height, endY + 1) - sy;
            ctx.clearRect(0, 0, 514, 514);
            ctx.drawImage(bitmap, sx, sy, w, h, 0, 0, w, h);
            let pixels = ctx.getImageData(0, 0, w, h);
            replaceImageColors(pixels.data, replacements);
            if (adjust) pixels = applyAdjustments(pixels, adjustments);
            out.putImageData(pixels, sx, sy, x - sx, y - sy, endX - x, endY - y);
        }
    tile.width = tile.height = 1;
    return output;
}
