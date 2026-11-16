/** Bounds the combined simulation, region traversal and RGBA working buffers. */
export const MAX_NOZZLE_PATCH_PIXELS = 4_000_000;
export function canApplyNozzlePatch(width: number, height: number): boolean {
    return (
        Number.isInteger(width) &&
        Number.isInteger(height) &&
        width > 0 &&
        height > 0 &&
        width * height <= MAX_NOZZLE_PATCH_PIXELS
    );
}
export function assertNozzlePatchSize(width: number, height: number): void {
    if (!canApplyNozzlePatch(width, height))
        throw new RangeError(
            'Resize the image to 4 megapixels or less before applying a nozzle patch'
        );
}
