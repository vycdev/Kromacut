/** Tallest height a single color can be given, in mm. */
export const MAX_COLOR_SLICE_HEIGHT = 10;

/**
 * Snap a color height onto its layer grid. Later colors use whole layers; the first color uses
 * the first-layer height plus whole layers. The result stays between the grid's minimum and its
 * last step at or below MAX_COLOR_SLICE_HEIGHT, so a capped height is still a printable layer
 * boundary. `layerHeight` must be positive.
 */
export function snapColorSliceHeight(
    height: number,
    layerHeight: number,
    firstLayerHeight: number,
    isFirst: boolean
): number {
    const minimum = isFirst ? Math.max(layerHeight, firstLayerHeight) : layerHeight;
    const origin = isFirst ? minimum : 0;
    const minSteps = isFirst ? 0 : 1;
    // The epsilon keeps an exact 10 mm step, such as 125 × 0.08 mm, despite float division.
    const maxSteps = Math.max(
        minSteps,
        Math.floor((MAX_COLOR_SLICE_HEIGHT - origin) / layerHeight + 1e-9)
    );
    const steps = Math.min(
        maxSteps,
        Math.max(minSteps, Math.round((height - origin) / layerHeight))
    );
    return Number((origin + steps * layerHeight).toFixed(8));
}

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
    const clamped = Math.max(layerHeight, Math.min(MAX_COLOR_SLICE_HEIGHT, base));
    return snapColorSliceHeight(clamped, layerHeight, firstLayerHeight, isFirst);
}
