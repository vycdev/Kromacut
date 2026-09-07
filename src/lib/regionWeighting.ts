/**
 * Spatial region-weighting helpers used by color matching and printable-detail analysis.
 */

const DEFAULT_CENTER_WEIGHT_STRENGTH = 0.5;
const MAX_CENTER_WEIGHT_STRENGTH = 0.999;

/** A spatial weight lookup bound to a fixed image size. */
export type SpatialWeight = (x: number, y: number) => number;

export interface CenterEdgeWeightPair {
    center: number;
    edge: number;
}

function nearestCenterDistance(width: number, height: number): number {
    const nearestX = Math.abs(Math.floor(width / 2) - width / 2);
    const nearestY = Math.abs(Math.floor(height / 2) - height / 2);
    const maxDistance = Math.hypot(width / 2, height / 2);
    return maxDistance > 0 ? Math.hypot(nearestX, nearestY) / maxDistance : 0;
}

function normalizeCenterStrength(strength: number): number {
    if (!Number.isFinite(strength)) return DEFAULT_CENTER_WEIGHT_STRENGTH;
    return Math.min(MAX_CENTER_WEIGHT_STRENGTH, Math.max(0, strength));
}

/**
 * Build both spatial-priority weights for hot full-image scans. The center and
 * edge formulas share the same normalized radial distance, so computing them
 * together removes one Math.hypot call per pixel without changing either value.
 * `out` is caller-owned to avoid allocating an object for every pixel.
 */
export function createCenterEdgeWeight(
    width: number,
    height: number,
    strength: number = DEFAULT_CENTER_WEIGHT_STRENGTH
): (x: number, y: number, out: CenterEdgeWeightPair) => void {
    const resolvedStrength = normalizeCenterStrength(strength);
    const centerX = width / 2;
    const centerY = height / 2;
    const maxDistance = Math.hypot(centerX, centerY);
    const nearestDistance = nearestCenterDistance(width, height);

    const centerDenominator = 2 * (1 - resolvedStrength);
    const centerMin = Math.exp(-1 / centerDenominator);
    const centerMax = Math.exp(-(nearestDistance ** 2 / centerDenominator));
    const centerRange = centerMax - centerMin;

    const edgeMin = nearestDistance ** 1.35;
    const edgeRange = 1 - edgeMin;

    return (x, y, out) => {
        const distance = maxDistance === 0 ? 0 : Math.hypot(x - centerX, y - centerY) / maxDistance;
        const centerRaw = Math.exp(-(distance ** 2 / centerDenominator));
        const edgeRaw = distance ** 1.35;
        out.center = centerRange > 0 ? (centerRaw - centerMin) / centerRange : 1;
        out.edge = edgeRange > 0 ? (edgeRaw - edgeMin) / edgeRange : 1;
    };
}

/**
 * Build a center-priority weight function for a fixed image size. Every term
 * that depends only on the size (fall-off denominator, normalization bounds,
 * max distance) is computed once, so the returned closure is cheap enough to
 * call for every pixel of a full-resolution image.
 */
export function createCenterWeight(
    width: number,
    height: number,
    strength: number = DEFAULT_CENTER_WEIGHT_STRENGTH
): SpatialWeight {
    const resolvedStrength = normalizeCenterStrength(strength);
    const centerX = width / 2;
    const centerY = height / 2;
    const maxDistance = Math.hypot(centerX, centerY);
    const denominator = 2 * (1 - resolvedStrength);
    const min = Math.exp(-1 / denominator);
    const max = Math.exp(-(nearestCenterDistance(width, height) ** 2 / denominator));
    const range = max - min;

    return (x, y) => {
        const distance = maxDistance === 0 ? 0 : Math.hypot(x - centerX, y - centerY) / maxDistance;
        const raw = Math.exp(-(distance ** 2 / denominator));
        return range > 0 ? (raw - min) / range : 1;
    };
}

/**
 * Build an edge-priority weight function for a fixed image size. Mirrors
 * createCenterWeight: the size-dependent normalization bounds are precomputed
 * once so per-pixel calls stay cheap.
 */
export function createEdgeWeight(width: number, height: number): SpatialWeight {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxDistance = Math.hypot(centerX, centerY);
    const min = nearestCenterDistance(width, height) ** 1.35;
    const range = 1 - min;

    return (x, y) => {
        const distance = maxDistance === 0 ? 0 : Math.hypot(x - centerX, y - centerY) / maxDistance;
        const raw = distance ** 1.35;
        return range > 0 ? (raw - min) / range : 1;
    };
}

/** Scalar center-priority weight. Prefer createCenterWeight for hot loops. */
export function centerWeightAt(
    x: number,
    y: number,
    width: number,
    height: number,
    strength: number = DEFAULT_CENTER_WEIGHT_STRENGTH
): number {
    return createCenterWeight(width, height, strength)(x, y);
}

/** Scalar edge-priority weight. Prefer createEdgeWeight for hot loops. */
export function edgeWeightAt(x: number, y: number, width: number, height: number): number {
    return createEdgeWeight(width, height)(x, y);
}
