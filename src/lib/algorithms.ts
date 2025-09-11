// Lightweight image algorithms for StrataPaint
// Each function operates on an ImageData instance and returns the modified ImageData.

export function posterizeImageData(
    data: ImageData,
    colorCount: number
): ImageData {
    const d = data.data;
    // approximate per-channel levels by cube root of requested total colors
    const levelsPerChannel = Math.max(
        2,
        Math.min(256, Math.max(2, Math.round(Math.cbrt(colorCount))))
    );
    const steps = levelsPerChannel - 1;
    const scale = steps > 0 ? 255 / steps : 0;

    for (let i = 0; i < d.length; i += 4) {
        const rIdx = Math.round((d[i] * steps) / 255);
        const gIdx = Math.round((d[i + 1] * steps) / 255);
        const bIdx = Math.round((d[i + 2] * steps) / 255);
        d[i] = Math.round(rIdx * scale);
        d[i + 1] = Math.round(gIdx * scale);
        d[i + 2] = Math.round(bIdx * scale);
        // leave alpha untouched
    }

    return data;
}

export default { posterizeImageData };
