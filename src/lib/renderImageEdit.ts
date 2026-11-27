import { applyAdjustments, isAllDefault } from './applyAdjustments.ts';
import { applyReplacementLookup, createReplacementLookup } from './replaceImageColors.ts';
import type { ImageEditSnapshot } from '../types';

const TILE_SIZE = 128;
const TILE_BYTES_WITH_HALO = (TILE_SIZE + 2) ** 2 * 4;

/** Process contiguous tiles with a one-pixel clarity halo so seams match a full-frame render. */
export async function renderImageEdit<Canvas extends HTMLCanvasElement | OffscreenCanvas>(
    source: HTMLCanvasElement | ImageBitmap,
    edit: Omit<ImageEditSnapshot, 'bitmap'>,
    makeCanvas: (width: number, height: number) => Canvas,
    signal: AbortSignal
): Promise<Canvas> {
    signal.throwIfAborted();
    const { width, height } = source;
    const output = makeCanvas(width, height);
    const destination = output.getContext('2d') as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
    if (!destination) throw new Error('Cannot create image-edit canvas');

    const { adjustments, replacements } = edit;
    const lookup = createReplacementLookup(replacements ?? {});
    const adjust = !isAllDefault(adjustments);
    if (!adjust && !lookup.size) {
        destination.drawImage(source, 0, 0);
        return output;
    }

    const halo = adjustments.clarity ? 1 : 0;
    const tile = makeCanvas(TILE_SIZE + 2 * halo, TILE_SIZE + 2 * halo);
    const ctx = tile.getContext('2d', { willReadFrequently: true }) as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
    if (!ctx) throw new Error('Cannot create image-edit tile');
    // Pixel readback plus output and blur scratch stay below 200 KiB per request.
    const scratch = adjust
        ? {
              output: new Uint8ClampedArray(TILE_BYTES_WITH_HALO),
              blurred: new Uint8ClampedArray(TILE_BYTES_WITH_HALO),
          }
        : undefined;
    let lastYield = performance.now();

    try {
        for (let y = 0; y < height; y += TILE_SIZE) {
            for (let x = 0; x < width; x += TILE_SIZE) {
                if (performance.now() - lastYield >= 12) {
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                    lastYield = performance.now();
                }
                signal.throwIfAborted();
                const right = Math.min(width, x + TILE_SIZE);
                const bottom = Math.min(height, y + TILE_SIZE);
                const left = Math.max(0, x - halo);
                const top = Math.max(0, y - halo);
                const w = Math.min(width, right + halo) - left;
                const h = Math.min(height, bottom + halo) - top;

                ctx.clearRect(0, 0, tile.width, tile.height);
                ctx.drawImage(source, left, top, w, h, 0, 0, w, h);
                const pixels = ctx.getImageData(0, 0, w, h);
                applyReplacementLookup(pixels.data, lookup);
                destination.putImageData(
                    adjust ? applyAdjustments(pixels, adjustments, scratch) : pixels,
                    left,
                    top,
                    x - left,
                    y - top,
                    right - x,
                    bottom - y
                );
            }
        }
        return output;
    } catch (error) {
        output.width = output.height = 1;
        throw error;
    } finally {
        tile.width = tile.height = 1;
    }
}
