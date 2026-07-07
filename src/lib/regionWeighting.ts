/**
 * Region Weighting Utilities
 *
 * Provides tools for creating importance masks that prioritize specific image regions
 * during optimization. Common use cases:
 * - Focus on faces in portraits
 * - Emphasize foreground subjects
 * - Prioritize center regions (rule of thirds)
 * - Manual brush-based importance painting
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface RegionWeightOptions {
    method: 'uniform' | 'center-weighted' | 'edge-detection' | 'face-detection' | 'custom';
    centerStrength?: number; // 0-1, strength of center bias
    edgeThreshold?: number; // 0-255, threshold for edge detection
    customMask?: Float32Array; // User-provided weights
}

const DEFAULT_CENTER_WEIGHT_STRENGTH = 0.5;
const MAX_CENTER_WEIGHT_STRENGTH = 0.999;

/** A spatial weight lookup bound to a fixed image size. */
export type SpatialWeight = (x: number, y: number) => number;

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

// ============================================================================
// Weight Map Generation
// ============================================================================

/**
 * Generate a weight map for an image.
 * Returns Float32Array where each value is 0-1 importance weight.
 */
export function generateWeightMap(
    imageData: ImageData,
    options: RegionWeightOptions
): Float32Array {
    const { width, height } = imageData;
    const weights = new Float32Array(width * height);

    switch (options.method) {
        case 'uniform':
            weights.fill(1.0);
            break;

        case 'center-weighted':
            generateCenterWeightedMap(width, height, weights, options.centerStrength ?? 0.5);
            break;

        case 'edge-detection':
            generateEdgeWeightedMap(imageData, weights, options.edgeThreshold ?? 30);
            break;

        case 'custom':
            if (options.customMask) {
                weights.set(options.customMask);
            } else {
                weights.fill(1.0);
            }
            break;

        default:
            weights.fill(1.0);
    }

    // Normalize to 0-1 range
    normalizeWeights(weights);

    return weights;
}

/**
 * Generate center-weighted importance map using Gaussian fall-off.
 * Center of image has weight 1.0, edges fade based on strength parameter.
 */
function generateCenterWeightedMap(
    width: number,
    height: number,
    weights: Float32Array,
    strength: number
): void {
    const resolvedStrength = normalizeCenterStrength(strength);
    const centerX = width / 2;
    const centerY = height / 2;
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - centerX;
            const dy = y - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const normalizedDist = dist / maxDist;

            // Gaussian fall-off: weight = 1 at center, decreases with distance
            // strength controls how quickly weight falls off
            const weight = Math.exp(
                -((normalizedDist * normalizedDist) / (2 * (1 - resolvedStrength)))
            );

            weights[y * width + x] = weight;
        }
    }
}

/**
 * Generate edge-weighted importance map using Sobel edge detection.
 * Areas with high edge density get higher weight (more detail to preserve).
 */
function generateEdgeWeightedMap(
    imageData: ImageData,
    weights: Float32Array,
    threshold: number
): void {
    const { width, height, data } = imageData;

    // Sobel kernels
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let gx = 0;
            let gy = 0;

            // Apply Sobel operator in 3x3 window
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const px = x + kx;
                    const py = y + ky;
                    const idx = (py * width + px) * 4;

                    // Use luminance for grayscale
                    const luminance =
                        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

                    const kernelIdx = (ky + 1) * 3 + (kx + 1);
                    gx += luminance * sobelX[kernelIdx];
                    gy += luminance * sobelY[kernelIdx];
                }
            }

            const magnitude = Math.sqrt(gx * gx + gy * gy);

            // Weight proportional to edge strength
            weights[y * width + x] = magnitude > threshold ? 1.0 : 0.5;
        }
    }

    // Fill borders with 0.5 (couldn't compute edges)
    for (let x = 0; x < width; x++) {
        weights[x] = 0.5;
        weights[(height - 1) * width + x] = 0.5;
    }
    for (let y = 0; y < height; y++) {
        weights[y * width] = 0.5;
        weights[y * width + (width - 1)] = 0.5;
    }
}

/**
 * Normalize weights to 0-1 range while preserving relative differences.
 */
function normalizeWeights(weights: Float32Array): void {
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < weights.length; i++) {
        if (weights[i] < min) min = weights[i];
        if (weights[i] > max) max = weights[i];
    }

    const range = max - min;
    if (range > 0) {
        for (let i = 0; i < weights.length; i++) {
            weights[i] = (weights[i] - min) / range;
        }
    } else {
        weights.fill(1.0);
    }
}

// ============================================================================
// Weight Map Manipulation
// ============================================================================

/**
 * Apply Gaussian blur to weight map for smooth transitions.
 */
export function blurWeightMap(
    weights: Float32Array,
    width: number,
    height: number,
    radius: number = 5
): Float32Array {
    const blurred = new Float32Array(weights.length);
    const kernel = createGaussianKernel(radius);
    const kernelSize = kernel.length;
    const halfSize = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let weightSum = 0;

            for (let ky = 0; ky < kernelSize; ky++) {
                for (let kx = 0; kx < kernelSize; kx++) {
                    const px = x + kx - halfSize;
                    const py = y + ky - halfSize;

                    if (px >= 0 && px < width && py >= 0 && py < height) {
                        const kernelWeight = kernel[ky * kernelSize + kx];
                        sum += weights[py * width + px] * kernelWeight;
                        weightSum += kernelWeight;
                    }
                }
            }

            blurred[y * width + x] = weightSum > 0 ? sum / weightSum : 0;
        }
    }

    return blurred;
}

/**
 * Create 2D Gaussian kernel for blurring.
 */
function createGaussianKernel(radius: number): Float32Array {
    const size = radius * 2 + 1;
    const kernel = new Float32Array(size * size);
    const sigma = radius / 3;
    const twoSigmaSq = 2 * sigma * sigma;
    let sum = 0;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x - radius;
            const dy = y - radius;
            const value = Math.exp(-(dx * dx + dy * dy) / twoSigmaSq);
            kernel[y * size + x] = value;
            sum += value;
        }
    }

    // Normalize
    for (let i = 0; i < kernel.length; i++) {
        kernel[i] /= sum;
    }

    return kernel;
}

/**
 * Combine multiple weight maps using specified blending mode.
 */
export function combineWeightMaps(
    maps: Float32Array[],
    mode: 'max' | 'min' | 'multiply' | 'average' = 'multiply'
): Float32Array {
    if (maps.length === 0) {
        return new Float32Array(0);
    }

    if (maps.length === 1) {
        return new Float32Array(maps[0]);
    }

    const length = maps[0].length;
    const combined = new Float32Array(length);

    for (let i = 0; i < length; i++) {
        const values = maps.map((m) => m[i]);

        switch (mode) {
            case 'max':
                combined[i] = Math.max(...values);
                break;
            case 'min':
                combined[i] = Math.min(...values);
                break;
            case 'multiply':
                combined[i] = values.reduce((prod, v) => prod * v, 1);
                break;
            case 'average':
                combined[i] = values.reduce((sum, v) => sum + v, 0) / values.length;
                break;
        }
    }

    return combined;
}

/**
 * Invert weight map (high importance becomes low, vice versa).
 */
export function invertWeightMap(weights: Float32Array): Float32Array {
    const inverted = new Float32Array(weights.length);
    for (let i = 0; i < weights.length; i++) {
        inverted[i] = 1.0 - weights[i];
    }
    return inverted;
}

/**
 * Apply threshold to weight map (binary mask).
 */
export function thresholdWeightMap(
    weights: Float32Array,
    threshold: number = 0.5,
    aboveValue: number = 1.0,
    belowValue: number = 0.0
): Float32Array {
    const thresholded = new Float32Array(weights.length);
    for (let i = 0; i < weights.length; i++) {
        thresholded[i] = weights[i] >= threshold ? aboveValue : belowValue;
    }
    return thresholded;
}

// ============================================================================
// Visualization Helpers
// ============================================================================

/**
 * Convert weight map to RGBA ImageData for visualization.
 * Uses heatmap color scheme (blue=low, red=high).
 */
export function weightMapToImageData(
    weights: Float32Array,
    width: number,
    height: number
): ImageData {
    const imageData = new ImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < weights.length; i++) {
        const weight = weights[i];
        const color = heatmapColor(weight);

        data[i * 4] = color.r;
        data[i * 4 + 1] = color.g;
        data[i * 4 + 2] = color.b;
        data[i * 4 + 3] = 255;
    }

    return imageData;
}

/**
 * Generate heatmap color for a value in [0, 1].
 * Blue (cold) → Green → Yellow → Red (hot)
 */
function heatmapColor(value: number): { r: number; g: number; b: number } {
    const v = Math.max(0, Math.min(1, value));

    let r, g, b;

    if (v < 0.25) {
        // Blue to cyan
        const t = v / 0.25;
        r = 0;
        g = Math.round(t * 255);
        b = 255;
    } else if (v < 0.5) {
        // Cyan to green
        const t = (v - 0.25) / 0.25;
        r = 0;
        g = 255;
        b = Math.round((1 - t) * 255);
    } else if (v < 0.75) {
        // Green to yellow
        const t = (v - 0.5) / 0.25;
        r = Math.round(t * 255);
        g = 255;
        b = 0;
    } else {
        // Yellow to red
        const t = (v - 0.75) / 0.25;
        r = 255;
        g = Math.round((1 - t) * 255);
        b = 0;
    }

    return { r, g, b };
}
