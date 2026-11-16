/** Brightness bands: a pixel exactly at a boundary enters the next band. */
export function createThresholdLookup(thresholds: number[], colors: string[]) {
    if (
        colors.length !== thresholds.length + 1 ||
        colors.length < 2 ||
        colors.some((c) => !/^#[0-9a-f]{6}$/i.test(c)) ||
        thresholds.some(
            (v, i) => !Number.isInteger(v) || v < 1 || v > 255 || (i > 0 && v <= thresholds[i - 1])
        )
    ) {
        throw new Error('Invalid threshold bands');
    }
    const palette = colors.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
    // Brightness is an integer in [0, 255]: band selection is constant time per pixel.
    const lookup = new Uint8ClampedArray(256 * 3);
    let band = 0;
    for (let value = 0; value < 256; value++) {
        while (band < thresholds.length && value >= thresholds[band]) band++;
        lookup.set(palette[band], value * 3);
    }
    return lookup;
}

/** Reuse the lookup across tiles; mutate RGB in place and preserve every alpha byte. */
export function applyThresholdLookup(data: Uint8ClampedArray, lookup: Uint8ClampedArray) {
    for (let i = 0; i < data.length; i += 4) {
        const brightness = Math.round(
            0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
        );
        const offset = brightness * 3;
        data[i] = lookup[offset];
        data[i + 1] = lookup[offset + 1];
        data[i + 2] = lookup[offset + 2];
    }
}

export function thresholdPixels(source: Uint8ClampedArray, thresholds: number[], colors: string[]) {
    const lookup = createThresholdLookup(thresholds, colors);
    const out = new Uint8ClampedArray(source);
    applyThresholdLookup(out, lookup);
    return out;
}
export function evenThresholds(count: number) {
    return Array.from({ length: count - 1 }, (_, i) => Math.round((256 * (i + 1)) / count));
}

/** Stable identities keep an open color picker attached to its color while sorting. */
export function orderedThresholdBands(colors: string[]) {
    const brightness = (hex: string) => {
        const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    };
    return colors
        .map((color, id) => ({ color, id }))
        .sort((a, b) => brightness(a.color) - brightness(b.color) || a.id - b.id);
}
