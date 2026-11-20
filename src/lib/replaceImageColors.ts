/** Simultaneous RGB substitution. Preserve alpha and never cascade replacements. */
export function createReplacementLookup(replacements: Record<string, string>) {
    const lookup = new Map<number, number>();
    for (const [from, to] of Object.entries(replacements)) {
        if (/^#[0-9a-f]{6}$/i.test(from) && /^#[0-9a-f]{6}$/i.test(to)) {
            lookup.set(parseInt(from.slice(1), 16), parseInt(to.slice(1), 16));
        }
    }
    return lookup;
}

export function applyReplacementLookup(
    data: Uint8ClampedArray,
    lookup: ReadonlyMap<number, number>
) {
    if (!lookup.size) return;
    for (let i = 0; i < data.length; i += 4) {
        if (!data[i + 3]) continue;
        const replacement = lookup.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        if (replacement === undefined) continue;
        data[i] = replacement >> 16;
        data[i + 1] = (replacement >> 8) & 255;
        data[i + 2] = replacement & 255;
    }
}

/** Simultaneous RGB substitution; tile callers can reuse the compiled lookup above. */
export function replaceImageColors(data: Uint8ClampedArray, replacements: Record<string, string>) {
    applyReplacementLookup(data, createReplacementLookup(replacements));
}
