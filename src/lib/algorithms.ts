// Lightweight image algorithms for StrataPaint
// Each function operates on an ImageData instance and returns the modified ImageData.

export function posterizeImageData(
    data: ImageData,
    colorCount: number
): ImageData {
    const d = data.data;
    // sanitize and clamp
    colorCount = Math.max(2, Math.min(256, Math.floor(colorCount)));

    // For very small palettes it's usually more visually pleasing to
    // quantize luminance (grayscale) rather than breaking color channels
    // which can produce strong color tints (e.g. red outlines at 2 colors).
    if (colorCount <= 4) {
        const levels = colorCount;
        const steps = Math.max(0, levels - 1);
        const scale = steps > 0 ? 255 / steps : 0;
        for (let i = 0; i < d.length; i += 4) {
            const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const idx = steps > 0 ? Math.round((l * steps) / 255) : 0;
            const v = Math.round(idx * scale);
            d[i] = d[i + 1] = d[i + 2] = v;
        }
        return data;
    }

    // For larger palettes, distribute levels across R/G/B trying to get
    // a product close to the requested colorCount while keeping channels balanced.
    let r = Math.max(1, Math.floor(Math.cbrt(colorCount)));
    let g = r;
    let b = r;

    // Grow the smallest channel as long as it doesn't make the product exceed colorCount
    while (r * g * b < colorCount) {
        if (r <= g && r <= b) {
            if ((r + 1) * g * b <= colorCount) r++;
            else break;
        } else if (g <= r && g <= b) {
            if (r * (g + 1) * b <= colorCount) g++;
            else break;
        } else {
            if (r * g * (b + 1) <= colorCount) b++;
            else break;
        }
    }

    const levels = [r, g, b];
    const stepsArr = levels.map((l) => Math.max(0, l - 1));
    const scales = stepsArr.map((s) => (s > 0 ? 255 / s : 0));

    for (let i = 0; i < d.length; i += 4) {
        // quantize each channel independently; if a channel has only one
        // level (steps === 0) map to mid-range (128) to avoid pushing the
        // overall color toward black.
        for (let c = 0; c < 3; c++) {
            const val = d[i + c];
            const steps = stepsArr[c];
            if (steps === 0) {
                d[i + c] = 128;
            } else {
                const idx = Math.round((val * steps) / 255);
                d[i + c] = Math.round(idx * scales[c]);
            }
        }
        // leave alpha untouched
    }

    return data;
}

export default { posterizeImageData };
