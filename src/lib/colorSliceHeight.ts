/** Preserve the first color's first-layer offset when reconciling image swatches. */
export function reconcileColorSliceHeight(
    previous: number | undefined,
    layerHeight: number,
    firstLayerHeight: number,
    isFirst: boolean
): number {
    const valid = typeof previous === 'number' && Number.isFinite(previous) && previous >= 0;
    const base = valid ? previous : layerHeight;
    if (!Number.isFinite(layerHeight) || layerHeight <= 0) return valid ? base : 0.2;
    const clamped = Math.max(layerHeight, Math.min(10, base));
    const minimum = isFirst ? Math.max(layerHeight, firstLayerHeight) : layerHeight;
    const snapped = isFirst
        ? minimum + Math.round(Math.max(0, clamped - minimum) / layerHeight) * layerHeight
        : Math.round(clamped / layerHeight) * layerHeight;
    return Number(Math.max(minimum, Math.min(10, snapped)).toFixed(8));
}
