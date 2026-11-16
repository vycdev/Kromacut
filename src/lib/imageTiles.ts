/**
 * 128² RGBA pixels = 64 KiB. With a one-pixel clarity halo, input,
 * adjustment output and blur scratch total 202,800 bytes (<200 KiB).
 * Target a modest 256 KiB L2 working set, leaving room for lookup tables.
 * This is a portable budget, not detection of the device's cache size.
 * Process contiguous rows and finish all passes before advancing the tile.
 * Canvas backing stores and PNG encoding still require full-image storage.
 */
export const IMAGE_TILE_SIZE = 128;
export const IMAGE_TILE_BYTES = (IMAGE_TILE_SIZE + 2) ** 2 * 4;

/** Worker-only full-size output with bounded readback and optional neighborhood halo. */
export function renderImageTiles(
    bitmap: ImageBitmap,
    transform: (pixels: ImageData) => ImageData,
    halo: 0 | 1 = 0
) {
    const output = new OffscreenCanvas(bitmap.width, bitmap.height);
    const out = output.getContext('2d')!;
    const tile = new OffscreenCanvas(IMAGE_TILE_SIZE + 2 * halo, IMAGE_TILE_SIZE + 2 * halo);
    const ctx = tile.getContext('2d', { willReadFrequently: true })!;
    try {
        for (let y = 0; y < bitmap.height; y += IMAGE_TILE_SIZE)
            for (let x = 0; x < bitmap.width; x += IMAGE_TILE_SIZE) {
                const endX = Math.min(bitmap.width, x + IMAGE_TILE_SIZE);
                const endY = Math.min(bitmap.height, y + IMAGE_TILE_SIZE);
                const sx = Math.max(0, x - halo),
                    sy = Math.max(0, y - halo);
                const w = Math.min(bitmap.width, endX + halo) - sx;
                const h = Math.min(bitmap.height, endY + halo) - sy;
                ctx.clearRect(0, 0, tile.width, tile.height);
                ctx.drawImage(bitmap, sx, sy, w, h, 0, 0, w, h);
                const pixels = transform(ctx.getImageData(0, 0, w, h));
                out.putImageData(pixels, sx, sy, x - sx, y - sy, endX - x, endY - y);
            }
        return output;
    } finally {
        tile.width = tile.height = 1;
    }
}
