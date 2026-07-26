export const PALETTE_PROOF_TARGET_IMAGE_MAX_DIMENSION = 900;

export function paletteProofRgbKey(red: number, green: number, blue: number): number {
    return ((red & 0xff) << 16) | ((green & 0xff) << 8) | (blue & 0xff);
}

export function paletteProofTargetKeyAt(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number
): number | null {
    const pixelX = Math.floor(x);
    const pixelY = Math.floor(y);
    if (
        width <= 0 ||
        height <= 0 ||
        pixelX < 0 ||
        pixelY < 0 ||
        pixelX >= width ||
        pixelY >= height
    ) {
        return null;
    }
    const offset = (pixelY * width + pixelX) * 4;
    if (pixels[offset + 3] === 0) return null;
    return paletteProofRgbKey(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
}

export function buildPaletteProofTargetHighlight(
    pixels: Uint8ClampedArray,
    selectedRgbKeys: ReadonlySet<number>,
    dimFactor = 0.22
): Uint8ClampedArray {
    const output = new Uint8ClampedArray(pixels);
    if (selectedRgbKeys.size === 0) return output;

    const factor = Math.max(0, Math.min(1, dimFactor));
    for (let offset = 0; offset < output.length; offset += 4) {
        if (
            output[offset + 3] === 0 ||
            selectedRgbKeys.has(
                paletteProofRgbKey(output[offset], output[offset + 1], output[offset + 2])
            )
        ) {
            continue;
        }
        output[offset] = Math.round(output[offset] * factor);
        output[offset + 1] = Math.round(output[offset + 1] * factor);
        output[offset + 2] = Math.round(output[offset + 2] * factor);
    }
    return output;
}

export function paletteProofTargetImageSize(
    width: number,
    height: number,
    maximumDimension = PALETTE_PROOF_TARGET_IMAGE_MAX_DIMENSION
): { width: number; height: number } {
    if (width <= 0 || height <= 0) return { width: 0, height: 0 };
    const scale = Math.min(1, maximumDimension / Math.max(width, height));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}
