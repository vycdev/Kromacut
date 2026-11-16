import { opaqueBounds } from './opaqueBounds';
import { createReplacementLookup, applyReplacementLookup } from './replaceImageColors';
import { IMAGE_TILE_SIZE, IMAGE_TILE_BYTES } from './imageTiles';
import { applyAdjustments, isAllDefault } from './applyAdjustments';
import { canApplyNozzlePatch } from './nozzlePatchLimits';
import type { ImageEditSnapshot } from '../types';

export interface PreparedNozzleSource {
    pixels: ImageData;
    originalWidth: number;
    originalHeight: number;
    /** Only small-enough images retain a full-resolution adjusted PNG for Apply. */
    blob: Blob | null;
}

/** Worker-only preparation. No full-size pixel arrays for large preview-only sources. */
export async function prepareNozzleSource({
    bitmap,
    replacements,
    adjustments,
}: ImageEditSnapshot): Promise<PreparedNozzleSource> {
    const width = bitmap.width,
        height = bitmap.height;
    const tileSize = IMAGE_TILE_SIZE;
    const tile = new OffscreenCanvas(tileSize + 2, tileSize + 2);
    const ctx = tile.getContext('2d', { willReadFrequently: true })!;
    let minX = width,
        minY = height,
        maxX = -1,
        maxY = -1;
    // Exact alpha bounds, including faint edge pixels, without a full-frame readback.
    for (let y = 0; y < height; y += tileSize)
        for (let x = 0; x < width; x += tileSize) {
            const w = Math.min(tileSize, width - x),
                h = Math.min(tileSize, height - y);
            ctx.clearRect(0, 0, tile.width, tile.height);
            ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
            const bounds = opaqueBounds(ctx.getImageData(0, 0, w, h).data, w, h);
            if (bounds) {
                minX = Math.min(minX, x + bounds.x);
                minY = Math.min(minY, y + bounds.y);
                maxX = Math.max(maxX, x + bounds.x + bounds.width - 1);
                maxY = Math.max(maxY, y + bounds.y + bounds.height - 1);
            }
        }
    if (maxX < 0) throw new Error('Empty image');
    const croppedWidth = maxX - minX + 1,
        croppedHeight = maxY - minY + 1;
    const scale = Math.min(1, 1024 / Math.max(croppedWidth, croppedHeight));
    const pixels = new ImageData(
        Math.max(1, Math.round(croppedWidth * scale)),
        Math.max(1, Math.round(croppedHeight * scale))
    );
    const xs = Array.from(
        { length: pixels.width },
        (_, x) => minX + Math.floor(((x + 0.5) * croppedWidth) / pixels.width)
    );
    const ys = Array.from(
        { length: pixels.height },
        (_, y) => minY + Math.floor(((y + 0.5) * croppedHeight) / pixels.height)
    );
    const full = canApplyNozzlePatch(width, height) ? new OffscreenCanvas(width, height) : null;
    const fullCtx = full?.getContext('2d');
    const adjust = !isAllDefault(adjustments);
    const lookup = createReplacementLookup(replacements);
    const scratch = adjust
        ? {
              output: new Uint8ClampedArray(IMAGE_TILE_BYTES),
              blurred: new Uint8ClampedArray(IMAGE_TILE_BYTES),
          }
        : undefined;
    // A one-pixel halo keeps clarity's 3x3 neighborhood identical at tile seams.
    for (let y = 0, py = 0; y < height; y += tileSize) {
        const endY = Math.min(height, y + tileSize),
            firstPy = py;
        while (py < ys.length && ys[py] < endY) py++;
        for (let x = 0, px = 0; x < width; x += tileSize) {
            const endX = Math.min(width, x + tileSize),
                firstPx = px;
            while (px < xs.length && xs[px] < endX) px++;
            if (!full && (firstPx === px || firstPy === py)) continue;
            const sx = Math.max(0, x - 1),
                sy = Math.max(0, y - 1);
            const sw = Math.min(width, endX + 1) - sx,
                sh = Math.min(height, endY + 1) - sy;
            ctx.clearRect(0, 0, tile.width, tile.height);
            ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
            let data = ctx.getImageData(0, 0, sw, sh);
            applyReplacementLookup(data.data, lookup);
            if (adjust) data = applyAdjustments(data, adjustments, scratch);
            // Match the canvas/PNG premultiplication of the working-image export.
            ctx.putImageData(data, 0, 0);
            data = ctx.getImageData(0, 0, sw, sh);
            fullCtx?.putImageData(data, sx, sy, x - sx, y - sy, endX - x, endY - y);
            for (let oy = firstPy; oy < py; oy++)
                for (let ox = firstPx; ox < px; ox++) {
                    const input = ((ys[oy] - sy) * sw + xs[ox] - sx) * 4;
                    const output = (oy * pixels.width + ox) * 4;
                    for (let channel = 0; channel < 4; channel++)
                        pixels.data[output + channel] = data.data[input + channel];
                }
        }
    }
    tile.width = tile.height = 1;
    const blob = full ? await full.convertToBlob({ type: 'image/png' }) : null;
    return { pixels, originalWidth: croppedWidth, originalHeight: croppedHeight, blob };
}
