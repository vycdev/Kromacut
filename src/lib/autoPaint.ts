/**
 * Auto-Paint Algorithm for Filament Painting (HueForge-style lithophanes)
 *
 * This module implements a physically-accurate optical simulation for
 * multi-filament lithophane printing using the Beer-Lambert law.
 *
 * Key concepts:
 * 1. TRANSITION ZONES: Each filament needs enough vertical space to fully
 *    transition from the previous color to its pure color.
 * 2. CUMULATIVE HEIGHT: Total height = sum of all transition zones.
 * 3. COMPRESSION: If user sets a max height below the ideal, zones are compressed.
 * 4. LUMINANCE MAPPING: Image pixel brightness maps to position within zones.
 * 5. ENHANCED COLOR MATCHING: Optimizes filament ordering by evaluating all
 *    permutations for best color reproduction (DeltaE-based).
 * 6. REPEATED SWAPS: Allows filaments to appear multiple times in the stack
 *    to create intermediate blended colors (e.g., thin white over red = pink).
 */

import type { Filament } from '../types';
import {
    optimizeFilamentOrder,
    type OptimizerOptions,
    type OptimizerResult,
    type ScoringContext,
} from './optimizer';
import { generateCenterWeightedMapSimple, generateEdgeWeightedMapSimple } from './regionWeighting';
import { computeProfileConfidence } from './calibration';

export { LAYER_ACTIVATION_EPSILON } from './layerActivation';

/** RGB color representation (0-255 range) */
export interface RGB {
    r: number;
    g: number;
    b: number;
}

/** Lab color representation for perceptual color difference */
export interface Lab {
    L: number;
    a: number;
    b: number;
}

/** Lab color with a frequency weight (0-1, normalized) */
interface WeightedLab extends Lab {
    weight: number;
}

/** A transition zone between two filaments */
export interface TransitionZone {
    filamentId: string;
    filamentColor: string;
    filamentTd: number; // Transmission Distance of this filament
    startHeight: number; // mm from Z=0
    endHeight: number; // mm from Z=0
    idealThickness: number; // Uncompressed zone thickness
    actualThickness: number; // After compression
}

/** A generated layer segment from the auto-paint algorithm */
export interface AutoPaintLayer {
    filamentId: string;
    filamentColor: string;
    startHeight: number; // mm from Z=0
    endHeight: number; // mm from Z=0
}

/** Result from the auto-paint generator */
export interface AutoPaintResult {
    layers: AutoPaintLayer[];
    totalHeight: number;
    idealHeight: number; // What height would be ideal without compression
    autoHeight: number; // The default height when user hasn't set a max
    compressionRatio: number; // 1.0 = no compression, 0.5 = 50% compressed
    filamentOrder: string[]; // Filament IDs in order (dark to light)
    transitionZones: TransitionZone[]; // Detailed zone info
    // Confidence metrics
    confidence: number; // Overall confidence score (0-1)
    confidenceFactors: {
        calibrationQuality: number; // 0-1: Quality of filament calibrations
        filamentCoverage: number; // 0-1: How well filaments cover image colors
        compressionImpact: number; // 0-1: Impact of height compression
    };
    // Optimizer metadata (for advanced optimizer only)
    optimizerMetadata?: {
        algorithm: string; // 'exhaustive' | 'simulated-annealing' | 'genetic'
        score: number; // Quality score achieved
        iterations: number; // Iterations performed
        converged: boolean; // Whether algorithm converged
        cacheHit: boolean; // Whether result came from cache
    };
}

// =============================================================================
// COLOR CONVERSION UTILITIES
// =============================================================================

/**
 * Convert hex color to RGB
 */
export function hexToRgb(hex: string): RGB {
    const h = hex.replace(/^#/, '');
    return {
        r: parseInt(h.slice(0, 2), 16) || 0,
        g: parseInt(h.slice(2, 4), 16) || 0,
        b: parseInt(h.slice(4, 6), 16) || 0,
    };
}

/**
 * Convert RGB to hex
 */
export function rgbToHex(rgb: RGB): string {
    const toHex = (n: number) =>
        Math.round(Math.max(0, Math.min(255, n)))
            .toString(16)
            .padStart(2, '0');
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Convert RGB (0-255) to Lab color space for perceptual color difference
 */
export function rgbToLab(rgb: RGB): Lab {
    // First convert RGB to XYZ
    let r = rgb.r / 255;
    let g = rgb.g / 255;
    let b = rgb.b / 255;

    // sRGB gamma correction
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    r *= 100;
    g *= 100;
    b *= 100;

    // RGB to XYZ (D65 illuminant)
    const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
    const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
    const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

    // XYZ to Lab (D65 reference white)
    const refX = 95.047;
    const refY = 100.0;
    const refZ = 108.883;

    let xr = x / refX;
    let yr = y / refY;
    let zr = z / refZ;

    const epsilon = 0.008856;
    const kappa = 903.3;

    xr = xr > epsilon ? Math.cbrt(xr) : (kappa * xr + 16) / 116;
    yr = yr > epsilon ? Math.cbrt(yr) : (kappa * yr + 16) / 116;
    zr = zr > epsilon ? Math.cbrt(zr) : (kappa * zr + 16) / 116;

    return {
        L: 116 * yr - 16,
        a: 500 * (xr - yr),
        b: 200 * (yr - zr),
    };
}

/**
 * Calculate Delta E (CIE76) - perceptual color difference
 * A DeltaE < 1 is generally imperceptible to the human eye.
 * DeltaE < 2.3 is considered "just noticeable difference"
 */
export function deltaE(color1: RGB, color2: RGB): number {
    const lab1 = rgbToLab(color1);
    const lab2 = rgbToLab(color2);

    return deltaELab(lab1, lab2);
}

/**
 * Calculate Delta E (CIE76) directly from Lab values
 */
export function deltaELab(lab1: Lab, lab2: Lab): number {
    return Math.sqrt(
        Math.pow(lab1.L - lab2.L, 2) + Math.pow(lab1.a - lab2.a, 2) + Math.pow(lab1.b - lab2.b, 2)
    );
}

/**
 * Calculate perceived luminance (brightness) from RGB values.
 * Uses the standard sRGB luminance coefficients.
 *
 * @param color - RGB color (0-255 range)
 * @returns Luminance value (0-255 range)
 */
export function getLuminance(color: RGB): number {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

// =============================================================================
// OPTICAL BLENDING (BEER-LAMBERT LAW)
// =============================================================================

/**
 * Calculate the resulting color when placing a semi-transparent filament
 * on top of an existing background color using the Beer-Lambert law.
 *
 * The transmission follows: T = 0.1^(thickness/TD)
 * At thickness == TD, transmission is 10% (filament definition of TD).
 *
 * @param backgroundColor - The color of the existing stack
 * @param filamentColor - The color of the filament being added
 * @param filamentTD - Transmission Distance of the filament (mm)
 * @param layerThickness - How thick the filament layer is (mm)
 * @returns The resulting blended color
 */
export function blendColors(
    backgroundColor: RGB,
    filamentColor: RGB,
    filamentTD: number,
    layerThickness: number
): RGB {
    // Prevent division by zero or invalid TD
    if (filamentTD <= 0 || layerThickness <= 0) {
        return filamentColor;
    }

    // Beer-Lambert law: transmission = 10^(-thickness/TD)
    // At thickness == TD, transmission = 10^(-1) = 0.1 (10%)
    const transmission = Math.pow(0.1, layerThickness / filamentTD);

    // Opacity is the inverse of transmission
    const opacity = 1 - transmission;

    // Linear interpolation (simple RGB mixing)
    return {
        r: filamentColor.r * opacity + backgroundColor.r * transmission,
        g: filamentColor.g * opacity + backgroundColor.g * transmission,
        b: filamentColor.b * opacity + backgroundColor.b * transmission,
    };
}

/**
 * Calculate the opacity (how opaque) a filament layer is at a given thickness.
 *
 * @param filamentTD - Transmission Distance (mm)
 * @param thickness - Layer thickness (mm)
 * @returns Opacity value (0-1)
 */
export function getOpacity(filamentTD: number, thickness: number): number {
    if (filamentTD <= 0 || thickness <= 0) return 0;
    const transmission = Math.pow(0.1, thickness / filamentTD);
    return 1 - transmission;
}

// =============================================================================
// TRANSITION ZONE CALCULATION
// =============================================================================

/**
 * DeltaE threshold for considering a color transition "complete".
 * Below this value, the blended color is perceptually indistinguishable
 * from the target pure filament color.
 */
const DELTA_E_THRESHOLD = 2.3; // "Just noticeable difference"

/**
 * Frontlit prints behave optically like a much shorter effective TD.
 * Scale user-entered TD values down for internal simulation.
 */
const FRONTLIT_TD_SCALE = 0.1;

/**
 * Simulate adding filament layers until the blended color matches the
 * target pure filament color (DeltaE < threshold), or until the filament
 * is effectively opaque (opacity target reached).
 *
 * @param backgroundColor - Starting background color
 * @param filamentColor - Target filament color
 * @param filamentTD - Transmission distance of the filament
 * @param layerHeight - Physical layer height increment
 * @returns Thickness needed for complete transition
 */
export function calculateTransitionThickness(
    backgroundColor: RGB,
    filamentColor: RGB,
    filamentTD: number,
    layerHeight: number
): number {
    // Early exit if colors are already close
    if (deltaE(backgroundColor, filamentColor) < DELTA_E_THRESHOLD) {
        return layerHeight; // Still need at least one layer
    }

    let thickness = 0;
    let currentColor = backgroundColor;

    // The cap determines the absolute maximum transition thickness.
    // At 0.7×TD, opacity ≈ 80%. At 1×TD, opacity ≈ 90%.
    // For transitions between adjacent colors in a sorted stack,
    // DeltaE convergence typically fires well before this cap.
    // We use 0.7×TD — if the color hasn't converged by ~80% opacity,
    // additional thickness gives diminishing visual returns.
    const OPACITY_CAP = 0.7;
    const maxThickness = Math.max(layerHeight, filamentTD * OPACITY_CAP);

    // Simulate adding layers until color converges or we hit the cap
    while (thickness < maxThickness) {
        thickness += layerHeight;
        currentColor = blendColors(backgroundColor, filamentColor, filamentTD, thickness);

        // Stop if the blended color is perceptually close to the target
        if (deltaE(currentColor, filamentColor) < DELTA_E_THRESHOLD) {
            break;
        }

        // Also stop if opacity is already very high — diminishing returns
        if (getOpacity(filamentTD, thickness) > 0.85) {
            break;
        }
    }

    // Snap to layerHeight grid
    return Math.min(thickness, maxThickness);
}

/**
 * Calculate the ideal model height based on cumulative transition zones.
 *
 * This simulates the full stack from darkest to lightest filament,
 * calculating how much vertical space each transition needs.
 *
 * @param sortedFilaments - Filaments sorted dark to light
 * @param layerHeight - Physical layer height
 * @param baseThickness - Minimum thickness for the first (darkest) layer
 * @returns Object with ideal height and zone breakdown
 */
export function calculateIdealHeight(
    sortedFilaments: Array<{ id: string; color: string; td: number }>,
    layerHeight: number,
    baseThickness: number = 0.6
): { idealHeight: number; zones: TransitionZone[] } {
    if (sortedFilaments.length === 0) {
        return { idealHeight: baseThickness, zones: [] };
    }

    const zones: TransitionZone[] = [];
    let currentHeight = 0;
    let currentBackgroundColor = hexToRgb(sortedFilaments[0].color);

    // Zone 1: Foundation layer (darkest filament)
    // Needs to be opaque enough to block the backlight.
    // Using Beer-Lambert: for 95% opacity → transmission = 5%
    //   0.05 = 10^(-thickness/TD)  →  thickness = TD × log10(20) ≈ TD × 1.3
    // Dark filaments have low TD (e.g. 0.5mm) → foundation ≈ 0.65mm
    const firstFilament = sortedFilaments[0];
    const opacityThickness = firstFilament.td * 1.3; // 95% opaque
    // Ensure at least the base thickness (avoid unnecessary extra layers)
    const foundationThickness = Math.max(baseThickness, opacityThickness);

    zones.push({
        filamentId: firstFilament.id,
        filamentColor: firstFilament.color,
        filamentTd: firstFilament.td,
        startHeight: 0,
        endHeight: foundationThickness,
        idealThickness: foundationThickness,
        actualThickness: foundationThickness,
    });
    currentHeight = foundationThickness;

    // Subsequent zones: each filament transitions from the previous
    for (let i = 1; i < sortedFilaments.length; i++) {
        const filament = sortedFilaments[i];
        const filamentRgb = hexToRgb(filament.color);

        // Calculate how thick this zone needs to be
        const transitionThickness = calculateTransitionThickness(
            currentBackgroundColor,
            filamentRgb,
            filament.td,
            layerHeight
        );

        zones.push({
            filamentId: filament.id,
            filamentColor: filament.color,
            filamentTd: filament.td,
            startHeight: currentHeight,
            endHeight: currentHeight + transitionThickness,
            idealThickness: transitionThickness,
            actualThickness: transitionThickness,
        });

        // Update for next iteration
        currentBackgroundColor = filamentRgb;
        currentHeight += transitionThickness;
    }

    return { idealHeight: currentHeight, zones };
}

/**
 * Apply compression to transition zones when max height is exceeded.
 *
 * @param zones - Original transition zones
 * @param maxHeight - User's maximum height constraint
 * @returns Compressed zones and compression ratio
 */
export function compressZones(
    zones: TransitionZone[],
    maxHeight: number
): { compressedZones: TransitionZone[]; compressionRatio: number } {
    if (zones.length === 0) {
        return { compressedZones: [], compressionRatio: 1 };
    }

    const idealHeight = zones[zones.length - 1].endHeight;

    if (idealHeight <= maxHeight) {
        // No compression needed
        return { compressedZones: zones, compressionRatio: 1 };
    }

    const compressionRatio = maxHeight / idealHeight;

    // Apply uniform compression to all zones
    const compressedZones: TransitionZone[] = [];
    let currentHeight = 0;

    for (const zone of zones) {
        const compressedThickness = zone.idealThickness * compressionRatio;
        compressedZones.push({
            ...zone,
            startHeight: currentHeight,
            endHeight: currentHeight + compressedThickness,
            actualThickness: compressedThickness,
        });
        currentHeight += compressedThickness;
    }

    return { compressedZones, compressionRatio };
}

// =============================================================================
// IMAGE COLOR ANALYSIS
// =============================================================================

/**
 * Cluster image swatches into a smaller set of weighted representative colors.
 *
 * Uses greedy agglomerative clustering in Lab space:
 * 1. Convert all swatches to Lab, sorted by frequency (descending)
 * 2. For each swatch, merge into the nearest existing cluster if
 *    DeltaE < threshold, otherwise create a new cluster
 * 3. Cluster centroid is the weighted average of its members
 * 4. Normalize weights so they sum to 1.0
 *
 * This reduces thousands of unique image colors to ~20-40 representative
 * targets, weighted by how much of the image each color region covers.
 * The result is both faster scoring and smarter optimization —
 * dominant image colors have higher weight and drive filament selection.
 *
 * @param swatches - Image colors with optional pixel counts
 * @param maxClusters - Maximum number of clusters to produce (default 32)
 * @param threshold - DeltaE merge threshold (default 5.0)
 * @returns Weighted Lab targets, normalized so weights sum to 1.0
 */
function clusterImageColors(
    swatches: Array<{ hex: string; count?: number }>,
    maxClusters: number = 32,
    threshold: number = 5.0
): WeightedLab[] {
    if (swatches.length === 0) return [];

    // Convert to Lab with counts
    const items = swatches.map((s) => ({
        lab: rgbToLab(hexToRgb(s.hex)),
        count: s.count ?? 1,
    }));

    // Sort by count descending — most common colors seed clusters first
    items.sort((a, b) => b.count - a.count);

    // Greedy clustering
    const clusters: Array<{
        L: number;
        a: number;
        b: number;
        totalCount: number;
    }> = [];

    const thresholdSq = threshold * threshold;

    for (const item of items) {
        // Find nearest existing cluster
        let bestIdx = -1;
        let bestDeSq = Infinity;

        for (let ci = 0; ci < clusters.length; ci++) {
            const c = clusters[ci];
            const deSq =
                (item.lab.L - c.L) ** 2 + (item.lab.a - c.a) ** 2 + (item.lab.b - c.b) ** 2;
            if (deSq < bestDeSq) {
                bestDeSq = deSq;
                bestIdx = ci;
            }
        }

        if (bestIdx >= 0 && bestDeSq < thresholdSq) {
            // Merge into existing cluster (weighted centroid update)
            const c = clusters[bestIdx];
            const total = c.totalCount + item.count;
            const w1 = c.totalCount / total;
            const w2 = item.count / total;
            c.L = c.L * w1 + item.lab.L * w2;
            c.a = c.a * w1 + item.lab.a * w2;
            c.b = c.b * w1 + item.lab.b * w2;
            c.totalCount = total;
        } else if (clusters.length < maxClusters) {
            // Create new cluster
            clusters.push({
                L: item.lab.L,
                a: item.lab.a,
                b: item.lab.b,
                totalCount: item.count,
            });
        } else {
            // At max clusters — force-merge into nearest
            if (bestIdx >= 0) {
                const c = clusters[bestIdx];
                const total = c.totalCount + item.count;
                const w1 = c.totalCount / total;
                const w2 = item.count / total;
                c.L = c.L * w1 + item.lab.L * w2;
                c.a = c.a * w1 + item.lab.a * w2;
                c.b = c.b * w1 + item.lab.b * w2;
                c.totalCount = total;
            }
        }
    }

    // Normalize weights to sum to 1.0
    const totalPixels = clusters.reduce((s, c) => s + c.totalCount, 0);
    if (totalPixels === 0) return [];

    return clusters.map((c) => ({
        L: c.L,
        a: c.a,
        b: c.b,
        weight: c.totalCount / totalPixels,
    }));
}

// =============================================================================
// ENHANCED COLOR MATCHING — ORDERING OPTIMIZATION
// =============================================================================

/**
 * Generate all non-empty subsets of an array.
 * For N items, produces 2^N - 1 subsets.
 */
function nonEmptySubsets<T>(arr: T[]): T[][] {
    const result: T[][] = [];
    const n = arr.length;
    for (let mask = 1; mask < 1 << n; mask++) {
        const subset: T[] = [];
        for (let i = 0; i < n; i++) {
            if (mask & (1 << i)) subset.push(arr[i]);
        }
        result.push(subset);
    }
    return result;
}

/**
 * Generate all permutations of an array.
 * Only used when array.length <= 7 (5040 permutations max).
 */
function permutations<T>(arr: T[]): T[][] {
    if (arr.length <= 1) return [arr];
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i++) {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
        for (const perm of permutations(rest)) {
            result.push([arr[i], ...perm]);
        }
    }
    return result;
}

/**
 * Build the achievable color palette for a given filament sequence.
 *
 * Simulates the Beer-Lambert blended color at each layer-height step
 * through the stack and returns an array of { height, color } entries.
 *
 * @param sequence - Ordered filament sequence (can include repeats)
 * @param layerHeight - Physical layer height
 * @param firstLayerHeight - First layer height
 * @returns Array of achievable { height, lab, rgb } at each layer step
 */
function buildAchievableColorPalette(
    sequence: Array<{ id: string; color: string; td: number }>,
    layerHeight: number,
    firstLayerHeight: number
): Array<{ height: number; lab: Lab; rgb: RGB }> {
    if (sequence.length === 0) return [];

    // Calculate zones for this sequence
    const { zones } = calculateIdealHeight(
        sequence.map((f) => ({ id: f.id, color: f.color, td: f.td })),
        layerHeight,
        Math.max(firstLayerHeight, layerHeight)
    );

    if (zones.length === 0) return [];

    const totalHeight = zones[zones.length - 1].endHeight;
    const palette: Array<{ height: number; lab: Lab; rgb: RGB }> = [];

    let currentZ = 0;
    let layerIndex = 0;
    let prevZoneIndex = 0;
    let thicknessInCurrentZone = 0;

    while (currentZ < totalHeight + layerHeight * 0.5) {
        const thickness = layerIndex === 0 ? Math.max(firstLayerHeight, layerHeight) : layerHeight;

        // Find active zone
        let activeZoneIndex = 0;
        for (let zi = 0; zi < zones.length; zi++) {
            if (currentZ >= zones[zi].startHeight && currentZ < zones[zi].endHeight) {
                activeZoneIndex = zi;
                break;
            }
            if (currentZ >= zones[zi].startHeight) {
                activeZoneIndex = zi;
            }
        }

        if (activeZoneIndex !== prevZoneIndex) {
            thicknessInCurrentZone = currentZ - zones[activeZoneIndex].startHeight + thickness;
            prevZoneIndex = activeZoneIndex;
        } else {
            thicknessInCurrentZone += thickness;
        }

        const zone = zones[activeZoneIndex];
        const filamentColor = hexToRgb(zone.filamentColor);

        let blendedColor: RGB;
        if (activeZoneIndex === 0) {
            blendedColor = filamentColor;
        } else {
            const bgColor = hexToRgb(zones[activeZoneIndex - 1].filamentColor);
            blendedColor = blendColors(
                bgColor,
                filamentColor,
                zone.filamentTd,
                thicknessInCurrentZone
            );
        }

        palette.push({
            height: currentZ + thickness,
            lab: rgbToLab(blendedColor),
            rgb: blendedColor,
        });

        currentZ += thickness;
        layerIndex++;

        if (layerIndex > 500) break;
    }

    return palette;
}

/**
 * Deduplicate a palette by collapsing consecutive entries whose colors
 * are within a DeltaE threshold. Each cluster is represented by its
 * midpoint height, giving the best possible height spread.
 */
function deduplicatePalette(
    palette: Array<{ height: number; lab: Lab; rgb: RGB }>,
    threshold: number = 3.0
): Array<{ height: number; lab: Lab; rgb: RGB }> {
    if (palette.length === 0) return [];

    const result: Array<{ height: number; lab: Lab; rgb: RGB }> = [];
    let clusterStart = 0;

    for (let i = 1; i <= palette.length; i++) {
        const prev = palette[i - 1];
        const curr = i < palette.length ? palette[i] : null;

        const shouldBreak =
            !curr ||
            Math.sqrt(
                (curr.lab.L - prev.lab.L) ** 2 +
                    (curr.lab.a - prev.lab.a) ** 2 +
                    (curr.lab.b - prev.lab.b) ** 2
            ) >= threshold;

        if (shouldBreak) {
            // Use the midpoint entry of this cluster
            const midIdx = Math.floor((clusterStart + (i - 1)) / 2);
            result.push(palette[midIdx]);
            clusterStart = i;
        }
    }

    return result;
}

/**
 * Score a filament sequence against weighted image target colors.
 *
 * The score combines:
 * 1. Weighted color accuracy — for each target, min DeltaE × weight.
 *    Dominant image colors contribute more to the score, so the optimizer
 *    prioritizes filament orderings that nail the most common colors.
 * 2. Height spread — penalizes when distinct image colors collapse to
 *    the same height (leading to flat surfaces).
 * 3. Total layer count — penalizes the raw number of layers in the palette.
 *    This punishes sequences with expensive transitions between dissimilar
 *    colors (e.g., yellow→purple takes many layers to transition, vs
 *    yellow→orange which is quick). More layers = taller model.
 * 4. Transition waste — penalizes palette layers that don't closely match
 *    any target color. These are "wasted" intermediate layers that exist
 *    only as transitions and contribute no useful color to the image.
 */
function scoreSequenceAgainstImage(
    palette: Array<{ height: number; lab: Lab; rgb: RGB }>,
    imageTargets: WeightedLab[]
): number {
    if (palette.length === 0) return Infinity;

    // Deduplicate: collapse consecutive near-identical colors
    const reduced = deduplicatePalette(palette, 3.0);
    if (reduced.length === 0) return Infinity;

    // 1. Weighted color accuracy: sum of (min DeltaE × weight) per target
    let weightedDeltaE = 0;
    const bestMatchHeights: number[] = [];

    // Also track which reduced palette entries are "useful" (matched by a target)
    const usedPaletteEntries = new Set<number>();

    for (const target of imageTargets) {
        let minDE = Infinity;
        let bestHeight = reduced[0].height;
        let bestIdx = 0;
        for (let ri = 0; ri < reduced.length; ri++) {
            const entry = reduced[ri];
            const de = Math.sqrt(
                (entry.lab.L - target.L) ** 2 +
                    (entry.lab.a - target.a) ** 2 +
                    (entry.lab.b - target.b) ** 2
            );
            if (de < minDE) {
                minDE = de;
                bestHeight = entry.height;
                bestIdx = ri;
                if (de < 0.5) break;
            }
        }
        weightedDeltaE += minDE * target.weight;
        bestMatchHeights.push(bestHeight);
        // Mark this palette entry as useful if it's a decent match
        if (minDE < 15) usedPaletteEntries.add(bestIdx);
    }

    // Scale up so the magnitude is comparable to pre-weighting scores
    weightedDeltaE *= imageTargets.length;

    // 2. Height spread penalty: penalize when distinct image colors
    //    collapse to the same height (leading to flat surfaces)
    if (bestMatchHeights.length > 1 && reduced.length > 1) {
        const totalModelHeight = reduced[reduced.length - 1].height - reduced[0].height;
        if (totalModelHeight > 0) {
            const uniqueHeights = new Set(bestMatchHeights.map((h) => Math.round(h * 100)));
            const spreadRatio = uniqueHeights.size / imageTargets.length;
            const spreadPenalty = (1 - spreadRatio) * imageTargets.length * 5;
            weightedDeltaE += spreadPenalty;
        }
    }

    // 3. Total layer count penalty: raw palette size reflects actual model height.
    //    A sequence with expensive transitions (dissimilar hues) produces many
    //    layers; smooth transitions (similar hues) produce few.
    //    penalty = 0.5 per raw layer — small per layer but adds up significantly
    //    for wasteful sequences (e.g., 40 layers vs 15 layers = +12.5 penalty)
    weightedDeltaE += palette.length * 0.5;

    // 4. Transition waste penalty: palette entries not matched by any target.
    //    If a reduced palette entry is not the best match for any image target,
    //    the transition height that produced it is wasted model space.
    if (reduced.length > 1) {
        const wastedEntries = reduced.length - usedPaletteEntries.size;
        weightedDeltaE += wastedEntries * 1.5;
    }

    return weightedDeltaE;
}

/**
 * Find the best filament ordering for the image colors.
 *
 * If optimizer options are provided, uses the advanced optimizer (simulated annealing, genetic algorithm).
 * Otherwise, falls back to legacy exhaustive/greedy search.
 *
 * NOT all filaments need to be used — the algorithm evaluates subsets
 * and only includes filaments that improve color reproduction.
 *
 * For ≤6 filaments, tries all permutations of all non-empty subsets.
 * For >6 filaments, uses a greedy build that adds one filament at a time
 * and stops when no further addition improves the score.
 *
 * @returns Optimal filament ordering (may be a subset of the input) and optimizer result
 */
function findBestFilamentOrder(
    filaments: Filament[],
    imageSwatches: Array<{ hex: string; count?: number }>,
    layerHeight: number,
    firstLayerHeight: number,
    optimizerOptions?: Partial<OptimizerOptions>
): { sortedFilaments: Filament[]; result?: OptimizerResult } {
    if (filaments.length <= 1) {
        return { sortedFilaments: [...filaments] };
    }

    // Use advanced optimizer if options provided
    if (optimizerOptions) {
        return findBestFilamentOrderWithOptimizer(
            filaments,
            imageSwatches,
            layerHeight,
            firstLayerHeight,
            optimizerOptions
        );
    }

    // Legacy implementation
    return {
        sortedFilaments: findBestFilamentOrderLegacy(
            filaments,
            imageSwatches,
            layerHeight,
            firstLayerHeight
        ),
    };
}

/**
 * Apply region weighting heuristic to clustered colors.
 * 
 * This is an approximation since spatial information is lost during clustering.
 * We analyze the region weight distribution and adjust cluster weights accordingly:
 * - High-weight regions (center or edges) boost colors commonly found there
 * - Uses luminance as a proxy for spatial distribution (centers tend brighter, edges darker)
 * 
 * @param clusters Weighted Lab color clusters
 * @param regionWeights Per-pixel region importance weights
 * @returns Adjusted color clusters with modified weights
 */
function applyRegionWeightHeuristic(
    clusters: WeightedLab[],
    regionWeights: Float32Array
): WeightedLab[] {
    if (clusters.length === 0 || regionWeights.length === 0) return clusters;

    // Calculate average region weight to determine mode strength
    let sumWeight = 0;
    for (let i = 0; i < regionWeights.length; i++) {
        sumWeight += regionWeights[i];
    }
    const avgWeight = sumWeight / regionWeights.length;

    // Calculate luminance variance to detect contrast distribution
    // Higher contrast (edge mode) vs more uniform (center mode)
    let sumSqDiff = 0;
    for (let i = 0; i < regionWeights.length; i++) {
        const diff = regionWeights[i] - avgWeight;
        sumSqDiff += diff * diff;
    }
    const variance = sumSqDiff / regionWeights.length;
    const isHighContrast = variance > 0.05; // Threshold for edge-weighted pattern

    // Apply heuristic adjustments
    let totalAdjustedWeight = 0;
    const adjustedClusters = clusters.map((cluster) => {
        let modifier = 1.0;

        if (isHighContrast) {
            // Edge-weighted mode: boost high-contrast colors (very light or very dark)
            const isHighContrast = cluster.L < 30 || cluster.L > 70;
            modifier = isHighContrast ? 1.3 : 0.85;
        } else {
            // Center-weighted mode: boost mid-luminance colors (typical of center regions)
            const isMidLuminance = cluster.L >= 35 && cluster.L <= 65;
            modifier = isMidLuminance ? 1.2 : 0.9;
        }

        const adjustedWeight = cluster.weight * modifier;
        totalAdjustedWeight += adjustedWeight;

        return {
            ...cluster,
            weight: adjustedWeight,
        };
    });

    // Renormalize to sum to 1.0
    if (totalAdjustedWeight > 0) {
        return adjustedClusters.map((c) => ({
            ...c,
            weight: c.weight / totalAdjustedWeight,
        }));
    }

    return clusters;
}

/**
 * Advanced optimizer path using simulated annealing / genetic algorithm
 */
function findBestFilamentOrderWithOptimizer(
    filaments: Filament[],
    imageSwatches: Array<{ hex: string; count?: number }>,
    layerHeight: number,
    firstLayerHeight: number,
    optimizerOptions: Partial<OptimizerOptions>
): { sortedFilaments: Filament[]; result: OptimizerResult } {
    // Cluster image colors into weighted Lab targets
    let imageTargets = clusterImageColors(imageSwatches, 32, 5.0);

    // Apply region weight heuristic if region weights are provided
    // Note: This is an approximation since we've lost pixel positions during clustering.
    // Proper implementation would require weighting pixels before aggregation.
    if (optimizerOptions.regionWeights) {
        imageTargets = applyRegionWeightHeuristic(imageTargets, optimizerOptions.regionWeights);
    }

    // Build scoring context
    const context: ScoringContext = {
        imageColors: imageTargets,
        layerHeight,
        firstLayerHeight,
        regionWeights: optimizerOptions.regionWeights,
    };

    // Apply frontlit TD scale
    const scaledFilaments = filaments.map((f) => ({
        ...f,
        td: f.td * FRONTLIT_TD_SCALE,
    }));

    // Run optimizer
    const result = optimizeFilamentOrder(scaledFilaments, context, optimizerOptions);

    // Map back to original filaments (unscaled TDs)
    const sortedFilaments = result.order.map((sf) =>
        filaments.find((f) => f.id === sf.id)
    ).filter((f): f is Filament => f !== undefined);

    return { sortedFilaments, result };
}

/**
 * Legacy optimizer path (exhaustive for ≤6, greedy for >6)
 */
function findBestFilamentOrderLegacy(
    filaments: Filament[],
    imageSwatches: Array<{ hex: string; count?: number }>,
    layerHeight: number,
    firstLayerHeight: number
): Filament[] {
    if (filaments.length <= 1) return [...filaments];

    // Cluster image colors into weighted representative targets
    const imageTargets = clusterImageColors(imageSwatches, 32, 5.0);
    if (imageTargets.length === 0) return [...filaments];

    // Apply frontlit TD scale
    const scaledFilaments = filaments.map((f) => ({
        ...f,
        td: f.td * FRONTLIT_TD_SCALE,
    }));

    if (filaments.length <= 6) {
        // Exhaustive search — try all permutations of all non-empty subsets
        // For N=6: sum of k! * C(6,k) for k=1..6 = 1957 total permutations
        const subsets = nonEmptySubsets(scaledFilaments);
        let bestScore = Infinity;
        let bestPerm = scaledFilaments;

        for (const subset of subsets) {
            const perms = permutations(subset);
            for (const perm of perms) {
                const palette = buildAchievableColorPalette(perm, layerHeight, firstLayerHeight);
                const score = scoreSequenceAgainstImage(palette, imageTargets);
                if (score < bestScore) {
                    bestScore = score;
                    bestPerm = perm;
                }
            }
        }

        // Return the original filaments in the best ordering (unscaled TDs)
        return bestPerm.map((sf) => filaments.find((f) => f.id === sf.id)!);
    }

    // Greedy heuristic for large sets:
    // Build the sequence one filament at a time, stopping when no addition helps.
    // Try each filament as a possible starting point.
    const allStarts = scaledFilaments.map((f, idx) => ({ f, idx }));
    let globalBestSequence: typeof scaledFilaments = [];
    let globalBestScore = Infinity;

    for (const { f: startFilament } of allStarts) {
        const remaining = scaledFilaments.filter((sf) => sf.id !== startFilament.id);
        const sequence = [startFilament];

        let palette = buildAchievableColorPalette(sequence, layerHeight, firstLayerHeight);
        let currentScore = scoreSequenceAgainstImage(palette, imageTargets);
        const pool = [...remaining];

        while (pool.length > 0) {
            let bestIdx = -1;
            let bestScore = currentScore;

            for (let i = 0; i < pool.length; i++) {
                const candidate = [...sequence, pool[i]];
                const candidatePalette = buildAchievableColorPalette(
                    candidate,
                    layerHeight,
                    firstLayerHeight
                );
                const candidateScore = scoreSequenceAgainstImage(candidatePalette, imageTargets);
                if (candidateScore < bestScore) {
                    bestScore = candidateScore;
                    bestIdx = i;
                }
            }

            // Stop if no filament improves the score
            if (bestIdx < 0 || currentScore - bestScore < 0.5) break;

            sequence.push(pool.splice(bestIdx, 1)[0]);
            palette = buildAchievableColorPalette(sequence, layerHeight, firstLayerHeight);
            currentScore = bestScore;
        }

        if (currentScore < globalBestScore) {
            globalBestScore = currentScore;
            globalBestSequence = [...sequence];
        }
    }

    return globalBestSequence.map((sf) => filaments.find((f) => f.id === sf.id)!);
}

// =============================================================================
// REPEATED SWAPS — SEQUENCE EXPANSION
// =============================================================================

/**
 * Build an expanded filament sequence that allows filaments to repeat.
 *
 * Uses a greedy approach: starting from the base ordering, repeatedly
 * tries inserting each available filament at the top of the stack.
 * Stops when no insertion improves the palette coverage, or when
 * a maximum sequence length is reached.
 *
 * Note: candidates are drawn from ALL original filaments, not just those
 * in the base ordering — a filament omitted from the base ordering might
 * still be useful as a blending layer.
 *
 * @param baseFilaments - The initial filament ordering (already optimized, may be a subset)
 * @param allFilaments - The full set of available filaments
 * @param imageSwatches - Target colors from the image
 * @param layerHeight - Physical layer height
 * @param firstLayerHeight - First layer height
 * @returns Expanded filament sequence with potential repeats
 */
function buildRepeatedSwapSequence(
    baseFilaments: Filament[],
    allFilaments: Filament[],
    imageSwatches: Array<{ hex: string; count?: number }>,
    layerHeight: number,
    firstLayerHeight: number
): Filament[] {
    if (baseFilaments.length === 0) return [];

    // Cluster image colors into weighted representative targets
    const imageTargets = clusterImageColors(imageSwatches, 32, 5.0);
    if (imageTargets.length === 0) return [...baseFilaments];

    // Start with the base sequence
    let currentSequence = baseFilaments.map((f) => ({
        ...f,
        td: f.td * FRONTLIT_TD_SCALE,
    }));

    let currentPalette = buildAchievableColorPalette(
        currentSequence,
        layerHeight,
        firstLayerHeight
    );
    let currentScore = scoreSequenceAgainstImage(currentPalette, imageTargets);

    // Use ALL filaments as insertion candidates (scaled)
    const candidates = allFilaments.map((f) => ({
        ...f,
        td: f.td * FRONTLIT_TD_SCALE,
    }));

    // Maximum number of extra swaps to try (avoid runaway sequences)
    const MAX_EXTRA_SWAPS = Math.min(4, allFilaments.length);
    // Minimum improvement threshold — stop if gains are diminishing
    const MIN_IMPROVEMENT = 2.0;

    for (let iter = 0; iter < MAX_EXTRA_SWAPS; iter++) {
        let bestCandidate: (typeof candidates)[0] | null = null;
        let bestInsertPos = -1;
        let bestScore = currentScore;

        for (const candidate of candidates) {
            // Try inserting at every position in the sequence (not just append).
            // Inserting earlier lets later filaments blend on top naturally,
            // potentially reusing existing transitions rather than creating
            // expensive new ones.
            // Position 0 = new foundation, position len = append at top.
            // Skip if it would create consecutive identical filaments.
            for (let pos = 1; pos <= currentSequence.length; pos++) {
                // Skip consecutive duplicates
                if (pos > 0 && currentSequence[pos - 1].id === candidate.id) continue;
                if (pos < currentSequence.length && currentSequence[pos].id === candidate.id)
                    continue;

                const trial = [
                    ...currentSequence.slice(0, pos),
                    candidate,
                    ...currentSequence.slice(pos),
                ];
                const trialPalette = buildAchievableColorPalette(
                    trial,
                    layerHeight,
                    firstLayerHeight
                );
                const trialScore = scoreSequenceAgainstImage(trialPalette, imageTargets);

                if (trialScore < bestScore) {
                    bestScore = trialScore;
                    bestCandidate = candidate;
                    bestInsertPos = pos;
                }
            }
        }

        if (!bestCandidate || bestInsertPos < 0 || currentScore - bestScore < MIN_IMPROVEMENT) {
            break; // No meaningful improvement
        }

        currentSequence = [
            ...currentSequence.slice(0, bestInsertPos),
            bestCandidate,
            ...currentSequence.slice(bestInsertPos),
        ];
        currentPalette = buildAchievableColorPalette(
            currentSequence,
            layerHeight,
            firstLayerHeight
        );
        currentScore = bestScore;
    }

    // Map back to original (unscaled) filaments, preserving sequence with repeats
    return currentSequence.map((sf) => {
        const orig = allFilaments.find((f) => f.id === sf.id)!;
        return { ...orig }; // Return copies with original TD
    });
}

// =============================================================================
// MAIN AUTO-PAINT ALGORITHM
// =============================================================================

/**
 * Generate auto-paint layers based on filaments, image data, and constraints.
 *
 * Algorithm:
 * 1. Sort filaments by luminance (dark to light)
 * 2. Calculate ideal transition zones using DeltaE simulation
 * 3. Apply compression if max height is exceeded
 * 4. Generate layer segments for the 3D model
 *
 * @param filaments - User's list of filaments with colors and TDs
 * @param imageSwatches - Distinct colors from the image (for luminance range)
 * @param layerHeight - Layer height in mm (e.g., 0.12)
 * @param firstLayerHeight - First layer height in mm (e.g., 0.20)
 * @param maxHeight - Optional maximum height constraint (undefined = auto)
 * @param enhancedColorMatch - If true, optimize filament ordering for best color reproduction
 * @param allowRepeatedSwaps - If true, allow filaments to appear multiple times in the stack
 * @param optimizerOptions - Advanced optimizer settings (algorithm, seeding, region weighting)
 * @param regionWeightingMode - Region weighting strategy: uniform, center, or edge
 * @param imageDimensions - Image width and height for region weight map generation
 * @returns Generated layer segments with zone information
 */
export function generateAutoLayers(
    filaments: Filament[],
    imageSwatches: Array<{ hex: string; count?: number }>,
    layerHeight: number,
    firstLayerHeight: number,
    maxHeight?: number,
    enhancedColorMatch?: boolean,
    allowRepeatedSwaps?: boolean,
    optimizerOptions?: Partial<OptimizerOptions>,
    regionWeightingMode: 'uniform' | 'center' | 'edge' = 'uniform',
    imageDimensions?: { width: number; height: number } | null
): AutoPaintResult {
    // --- STEP 1: VALIDATION ---
    if (filaments.length === 0) {
        return {
            layers: [],
            totalHeight: 0,
            idealHeight: 0,
            autoHeight: 0,
            compressionRatio: 1,
            filamentOrder: [],
            transitionZones: [],
            confidence: 0,
            confidenceFactors: {
                calibrationQuality: 0,
                filamentCoverage: 0,
                compressionImpact: 1,
            },
        };
    }

    if (imageSwatches.length === 0) {
        return {
            layers: [],
            totalHeight: 0,
            idealHeight: 0,
            autoHeight: 0,
            compressionRatio: 1,
            filamentOrder: [],
            transitionZones: [],
            confidence: 0,
            confidenceFactors: {
                calibrationQuality: 0,
                filamentCoverage: 0,
                compressionImpact: 1,
            },
        };
    }

    // --- STEP 2: DETERMINE FILAMENT ORDERING ---
    let sortedFilaments: Filament[];
    let optimizerResult: OptimizerResult | undefined;

    // Generate region weight map if dimensions are available and mode is not uniform
    let regionWeights: Float32Array | undefined;
    if (imageDimensions && regionWeightingMode !== 'uniform') {
        if (regionWeightingMode === 'center') {
            // Center-weighted: prioritize center of image
            regionWeights = generateCenterWeightedMapSimple(
                imageDimensions.width,
                imageDimensions.height,
                0.5 // strength parameter
            );
        } else if (regionWeightingMode === 'edge') {
            // Edge-weighted (geometry-based): prioritize border regions.
            regionWeights = generateEdgeWeightedMapSimple(
                imageDimensions.width,
                imageDimensions.height
            );
        }
    }

    // Merge region weights into optimizer options
    const mergedOptimizerOptions: Partial<OptimizerOptions> | undefined = optimizerOptions
        ? {
              ...optimizerOptions,
              regionWeights: regionWeights ?? optimizerOptions.regionWeights,
          }
        : regionWeights
          ? { regionWeights }
          : undefined;

    if (enhancedColorMatch) {
        // Enhanced: find the ordering that best covers the image's color palette
        const orderingResult = findBestFilamentOrder(
            filaments,
            imageSwatches,
            layerHeight,
            firstLayerHeight,
            mergedOptimizerOptions
        );

        sortedFilaments = orderingResult.sortedFilaments;
        optimizerResult = orderingResult.result;

        // If repeated swaps are also enabled, expand the sequence
        if (allowRepeatedSwaps) {
            sortedFilaments = buildRepeatedSwapSequence(
                sortedFilaments,
                filaments,
                imageSwatches,
                layerHeight,
                firstLayerHeight
            );
        }
    } else {
        // Standard: sort by luminance (dark to light)
        sortedFilaments = [...filaments].sort((a, b) => {
            const lumA = getLuminance(hexToRgb(a.color));
            const lumB = getLuminance(hexToRgb(b.color));
            return lumA - lumB;
        });
    }

    const filamentOrder = sortedFilaments.map((f) => f.id);

    // Apply frontlit TD scale for internal simulation
    const scaledFilaments = sortedFilaments.map((f) => ({
        ...f,
        td: f.td * FRONTLIT_TD_SCALE,
    }));

    // --- STEP 3: CALCULATE IDEAL HEIGHT WITH TRANSITION ZONES ---
    const { idealHeight, zones } = calculateIdealHeight(
        scaledFilaments.map((f) => ({ id: f.id, color: f.color, td: f.td })),
        layerHeight,
        Math.max(firstLayerHeight, layerHeight)
    );

    // --- STEP 4: APPLY COMPRESSION IF NEEDED ---
    // autoHeight = idealHeight — the physics-derived value from the
    // DeltaE convergence simulation. This is the height the algorithm
    // determines is needed for accurate color reproduction.
    // No hardcoded cap — each transition zone is already bounded by
    // opacity thresholds (85%) and DeltaE convergence (< 2.3).
    const autoHeight = idealHeight;
    const targetMaxHeight = maxHeight ?? autoHeight;
    const { compressedZones, compressionRatio } = compressZones(zones, targetMaxHeight);

    // --- STEP 5: GENERATE LAYER SEGMENTS FROM ZONES ---
    const layers: AutoPaintLayer[] = compressedZones.map((zone) => ({
        filamentId: zone.filamentId,
        filamentColor: zone.filamentColor,
        startHeight: zone.startHeight,
        endHeight: zone.endHeight,
    }));

    const totalHeight =
        compressedZones.length > 0 ? compressedZones[compressedZones.length - 1].endHeight : 0;

    // --- STEP 6: CALCULATE CONFIDENCE METRICS ---
    const confidence = calculateAutoConfidence(
        filaments,
        imageSwatches,
        sortedFilaments,
        compressionRatio
    );

    const result: AutoPaintResult = {
        layers,
        totalHeight,
        idealHeight,
        autoHeight,
        compressionRatio,
        filamentOrder,
        transitionZones: compressedZones,
        ...confidence,
    };

    // Add optimizer metadata if available
    if (optimizerResult) {
        result.optimizerMetadata = {
            algorithm: optimizerResult.resolvedAlgorithm || optimizerOptions?.algorithm || 'auto',
            score: optimizerResult.score,
            iterations: optimizerResult.iterations,
            converged: optimizerResult.converged,
            cacheHit: optimizerResult.cacheHit || false,
        };
    }

    return result;
}

/**
 * Calculate the recommended model height based on filaments.
 * This is a quick estimate before the full zone calculation.
 *
 * @param filaments - Array of filaments
 * @returns Recommended model height in mm
 */
export function calculateRecommendedHeight(
    filaments: Array<{ color: string; td: number }>
): number {
    if (filaments.length === 0) return 2.0;

    // Sum of TDs gives a rough estimate of total transition space needed
    const totalTD = filaments.reduce((sum, f) => sum + f.td * FRONTLIT_TD_SCALE, 0);

    // Typically need about 0.8x to 1.2x the sum of TDs
    const estimated = totalTD * 0.9;

    // Clamp to reasonable bounds
    return Math.max(1.0, Math.min(15, estimated));
}

// =============================================================================
// SLICE HEIGHT CONVERSION (for ThreeDView)
// =============================================================================

/**
 * Convert auto-paint layers to the format expected by ThreeDView.
 *
 * This function generates layers at each layerHeight increment,
 * creating a graduated effect where higher layers cover progressively
 * fewer pixels (only the lightest ones).
 *
 * ThreeDView expects:
 * - colorSliceHeights: height for each swatch index
 * - colorOrder: ordering of swatch indices
 * - virtualSwatches: colors for each layer
 */
export function autoPaintToSliceHeights(
    result: AutoPaintResult,
    layerHeight: number,
    firstLayerHeight: number
): {
    colorSliceHeights: number[];
    colorOrder: number[];
    virtualSwatches: Array<{ hex: string; a: number }>;
    filamentSwatches: Array<{ hex: string; a: number }>;
} {
    if (result.layers.length === 0 || result.totalHeight <= 0) {
        return {
            colorSliceHeights: [],
            colorOrder: [],
            virtualSwatches: [],
            filamentSwatches: [],
        };
    }

    const virtualSwatches: Array<{ hex: string; a: number }> = [];
    const filamentSwatches: Array<{ hex: string; a: number }> = [];
    const colorSliceHeights: number[] = [];
    const colorOrder: number[] = [];

    const zones = result.transitionZones;

    // Generate layers at each layerHeight increment from 0 to totalHeight.
    // For each layer, simulate the Beer-Lambert blended color at that Z.
    let currentZ = 0;
    let layerIndex = 0;
    let prevZoneIndex = 0;
    let thicknessInCurrentZone = 0;

    while (currentZ < result.totalHeight) {
        const thickness = layerIndex === 0 ? Math.max(firstLayerHeight, layerHeight) : layerHeight;

        // Find which zone is active at this Z height
        let activeZoneIndex = 0;
        for (let zi = 0; zi < zones.length; zi++) {
            if (currentZ >= zones[zi].startHeight && currentZ < zones[zi].endHeight) {
                activeZoneIndex = zi;
                break;
            }
            if (currentZ >= zones[zi].startHeight) {
                activeZoneIndex = zi;
            }
        }

        // Track cumulative thickness within this zone for blending
        if (activeZoneIndex !== prevZoneIndex) {
            thicknessInCurrentZone = currentZ - zones[activeZoneIndex].startHeight + thickness;
            prevZoneIndex = activeZoneIndex;
        } else {
            thicknessInCurrentZone += thickness;
        }

        const zone = zones[activeZoneIndex];
        const filamentColor = hexToRgb(zone.filamentColor);

        // Simulate the blended color at this layer:
        // Foundation zone → pure filament color (opaque base)
        // Subsequent zones → blend filament onto the previous zone's color
        let blendedColor: RGB;
        if (activeZoneIndex === 0) {
            blendedColor = filamentColor;
        } else {
            const bgColor = hexToRgb(zones[activeZoneIndex - 1].filamentColor);
            blendedColor = blendColors(
                bgColor,
                filamentColor,
                zone.filamentTd,
                thicknessInCurrentZone
            );
        }

        virtualSwatches.push({ hex: rgbToHex(blendedColor), a: 255 });
        filamentSwatches.push({ hex: zone.filamentColor, a: 255 });
        colorSliceHeights.push(Number(thickness.toFixed(8)));
        colorOrder.push(layerIndex);

        currentZ += thickness;
        layerIndex++;

        if (layerIndex > 500) {
            console.warn('autoPaintToSliceHeights: too many layers, stopping at 500');
            break;
        }
    }

    return {
        colorSliceHeights,
        colorOrder,
        virtualSwatches,
        filamentSwatches,
    };
}

// =============================================================================
// LUMINANCE-TO-HEIGHT MAPPING
// =============================================================================

/**
 * Map a pixel's luminance to a target height within the transition zones.
 *
 * This is the key function that determines how image brightness translates
 * to physical height in the 3D model.
 *
 * The mapping works as follows:
 * - Darkest pixels (luminance = 0) → minimum height (base layer only)
 * - Lightest pixels (luminance = 1) → maximum height (all layers)
 * - Mid-tones → proportional position within the transition zones
 *
 * @param normalizedLuminance - Pixel luminance normalized to 0-1
 * @param transitionZones - The computed transition zones
 * @param totalHeight - Total model height
 * @param firstLayerHeight - First layer height
 * @returns Target height in mm
 */
export function luminanceToHeight(
    normalizedLuminance: number,
    transitionZones: TransitionZone[],
    totalHeight: number,
    firstLayerHeight: number
): number {
    if (transitionZones.length === 0) {
        return firstLayerHeight;
    }

    // Base height (darkest pixels get at least the foundation)
    const baseHeight = transitionZones[0].endHeight;

    if (normalizedLuminance <= 0) {
        return baseHeight;
    }

    if (normalizedLuminance >= 1) {
        return totalHeight;
    }

    // Linear interpolation from base to total height
    // This gives a smooth gradient where brightness = height
    return baseHeight + normalizedLuminance * (totalHeight - baseHeight);
}

// =============================================================================
// CONFIDENCE SCORING
// =============================================================================

/**
 * Calculate confidence metrics for auto-paint results.
 *
 * Confidence is based on three factors:
 * 1. Calibration Quality: How well the filaments are calibrated
 * 2. Filament Coverage: How well the filament colors cover the image palette
 * 3. Compression Impact: How much the result was compressed from ideal
 *
 * @param filaments - Input filaments with their TDs
 * @param imageSwatches - Image color palette
 * @param sortedFilaments - Filaments in their optimal order
 * @param compressionRatio - How much compression was applied (1.0 = none)
 * @returns Confidence score and detailed factors
 */
function calculateAutoConfidence(
    filaments: Filament[],
    imageSwatches: Array<{ hex: string; count?: number }>,
    sortedFilaments: Filament[],
    compressionRatio: number
): {
    confidence: number;
    confidenceFactors: {
        calibrationQuality: number;
        filamentCoverage: number;
        compressionImpact: number;
    };
} {
    // 1. CALIBRATION QUALITY
    // Average confidence of all filament calibrations using actual calibration data
    let calibrationQuality = 0.5; // Default baseline for uncalibrated filaments
    
    if (filaments.length > 0) {
        const confidences = filaments.map((f) =>
            computeProfileConfidence({
                calibration: f.calibration,
                transmissionDistance: f.td,
            })
        );
        calibrationQuality = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    }

    // 2. FILAMENT COVERAGE
    // How well do the filament colors cover the image's color space?
    // Primary metric: actual deltaE distance between image colors and nearest filament.
    // Secondary: filament count caps the maximum achievable coverage.
    let filamentCoverage = 0.5; // Baseline

    if (filaments.length > 0 && imageSwatches.length > 0) {
        const filamentColors = sortedFilaments.map((f) => rgbToLab(hexToRgb(f.color)));

        // For each image color, find nearest filament color (weighted by pixel count)
        let totalDeltaE = 0;
        let totalWeight = 0;

        for (const imageSwatch of imageSwatches) {
            const imageColor = rgbToLab(hexToRgb(imageSwatch.hex));
            const weight = imageSwatch.count ?? 1;

            let minDeltaE = Infinity;
            for (const filamentColor of filamentColors) {
                const de = deltaELab(imageColor, filamentColor);
                if (de < minDeltaE) minDeltaE = de;
            }

            totalDeltaE += minDeltaE * weight;
            totalWeight += weight;
        }

        const avgDeltaE = totalWeight > 0 ? totalDeltaE / totalWeight : 50;

        // Map avgDeltaE to a 0-1 score: 0 deltaE = 1.0, 50+ deltaE = ~0.2
        // Decay constant of 35 accounts for Beer-Lambert blending producing
        // better results than raw filament-to-swatch deltaE suggests.
        filamentCoverage = 0.2 + 0.8 * Math.exp(-avgDeltaE / 35);

        // Cap by filament count — even perfect color matches are limited by
        // how many distinct layers can be stacked
        const filamentCount = filaments.length;
        let countCap = 1.0;
        if (filamentCount === 1) countCap = 0.5;
        else if (filamentCount === 2) countCap = 0.7;
        else if (filamentCount === 3) countCap = 0.85;

        filamentCoverage = Math.min(filamentCoverage, countCap);
    }

    // 3. COMPRESSION IMPACT
    // Compression reduces accuracy, especially heavy compression
    // compressionRatio: 1.0 = no compression (perfect)
    // compressionRatio: 0.5 = 50% compressed (significant quality loss)
    let compressionImpact = compressionRatio;

    // Nonlinear penalty: light compression (0.9) is OK, heavy (<0.7) is bad
    if (compressionRatio < 0.9) {
        compressionImpact = 0.9 * Math.pow(compressionRatio / 0.9, 2);
    }

    // OVERALL CONFIDENCE
    // Weighted average with emphasis on calibration
    const confidence =
        calibrationQuality * 0.5 + // Calibration is most important
        filamentCoverage * 0.3 + // Coverage matters
        compressionImpact * 0.2; // Compression has least weight

    return {
        confidence,
        confidenceFactors: {
            calibrationQuality,
            filamentCoverage,
            compressionImpact,
        },
    };
}

// =============================================================================
// DEBUG UTILITIES
// =============================================================================

/**
 * Debug helper: simulate and log the optical stacking at each layer
 */
export function debugAutoPaint(
    filaments: Filament[],
    imageSwatches: Array<{ hex: string }>,
    layerHeight: number,
    firstLayerHeight: number,
    maxHeight?: number
): void {
    const result = generateAutoLayers(
        filaments,
        imageSwatches,
        layerHeight,
        firstLayerHeight,
        maxHeight
    );

    console.group('🎨 Auto-Paint Debug');
    console.log('Input filaments:', filaments);
    console.log('Max height constraint:', maxHeight ?? 'auto');
    console.log('---');
    console.log('Ideal height:', result.idealHeight.toFixed(2), 'mm');
    console.log('Actual height:', result.totalHeight.toFixed(2), 'mm');
    console.log(
        'Compression:',
        result.compressionRatio < 1
            ? `${((1 - result.compressionRatio) * 100).toFixed(1)}% compressed`
            : 'None'
    );
    console.log('Filament order (dark→light):', result.filamentOrder);
    console.log('---');
    console.log('Transition Zones:');
    result.transitionZones.forEach((zone, i) => {
        const status = zone.actualThickness < zone.idealThickness ? '⚠️ compressed' : '✓';
        console.log(
            `  ${i + 1}. ${zone.filamentColor} | ${zone.startHeight.toFixed(2)}mm → ${zone.endHeight.toFixed(2)}mm | ` +
                `Ideal: ${zone.idealThickness.toFixed(2)}mm, Actual: ${zone.actualThickness.toFixed(2)}mm ${status}`
        );
    });
    console.groupEnd();
}
