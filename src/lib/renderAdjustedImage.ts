import { applyAdjustments, isAllDefault } from './applyAdjustments';
import { createReplacementLookup, applyReplacementLookup } from './replaceImageColors';
import { IMAGE_TILE_BYTES, renderImageTiles } from './imageTiles';
import type { ImageEditSnapshot } from '../types';

/** Worker-only full-resolution rendering with cache-sized, reusable JS pixel buffers. */
export function renderAdjustedImage({ bitmap, adjustments, replacements }: ImageEditSnapshot) {
    const adjust = !isAllDefault(adjustments);
    const lookup = createReplacementLookup(replacements);
    if (!adjust && !lookup.size) {
        const output = new OffscreenCanvas(bitmap.width, bitmap.height);
        output.getContext('2d')!.drawImage(bitmap, 0, 0);
        return output;
    }
    const scratch = adjust
        ? {
              output: new Uint8ClampedArray(IMAGE_TILE_BYTES),
              blurred: new Uint8ClampedArray(IMAGE_TILE_BYTES),
          }
        : undefined;
    return renderImageTiles(
        bitmap,
        (pixels) => {
            applyReplacementLookup(pixels.data, lookup);
            return adjust ? applyAdjustments(pixels, adjustments, scratch) : pixels;
        },
        adjustments.clarity ? 1 : 0
    );
}
