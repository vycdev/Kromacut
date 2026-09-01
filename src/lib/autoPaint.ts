/**
 * Auto-paint optical model and printable color-stack planner.
 *
 * This module models multi-filament prints with Beer-Lambert blending, then
 * turns the selected filament stack into layer zones and preview colors.
 *
 * It keeps the optimizer and preview on the same model: optional calibrated
 * per-channel TDs and printable layer sampling are shared by both paths.
 */

import type { Filament } from '../types';
import type {
    AppearanceAnchorLayer,
    AppearancePredictionConfidenceV1,
    AppearanceRankModelV1,
    CanonicalSrgbColor,
    FinalPrintableStackSnapshot,
    FinalStackLayerSnapshot,
    FinalStackPaletteEntrySnapshot,
    FinalStackSwapSnapshot,
    FinalStackTargetMappingSnapshot,
    FinalStackZoneSnapshot,
    TargetSampleContext,
} from '../types/appearance';
import {
    appearanceLabToRgb,
    createIdentityAppearanceRankModel,
    resolveAppearanceRankModel,
    type AppearanceLocalPreferenceMatch,
    type ResolvedAppearancePrediction,
} from './appearanceModel';
import {
    optimizeFilamentOrder,
    type OptimizerOptions,
    type OptimizerResult,
    type ScoringContext,
} from './optimizer';
import {
    activeFrontlitCalibration,
    channelHds,
    computeProfileConfidence,
    type CalibrationRgb,
} from './calibration';
import { blendSrgbChannel } from './colorSpace';
import {
    effectiveSubstrateHdMultiplier,
    effectiveTransmission,
    resolveEffectiveFilamentOptics,
} from './effectiveOptics';
import { fingerprintJson } from './fingerprint';

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
export interface WeightedLab extends Lab {
    weight: number;
}

export interface AutoPaintImageSwatch {
    hex: string;
    count?: number;
    sampleContext?: TargetSampleContext;
}

type ColorDistanceMetric = 'cie76' | 'ciede2000';

/** A transition zone between two filaments */
export interface TransitionZone {
    filamentId: string;
    filamentColor: string;
    filamentTd: number; // Transmission Distance of this filament
    filamentTdChannels?: CalibrationRgb; // Calibrated R, G, B TDs when available
    /** Runtime optical properties jointly fitted from Stack Matrix measurements. */
    effectiveColor?: RGB;
    effectiveTdChannels?: CalibrationRgb;
    transmissionExponent?: number;
    substrateFilamentId?: string;
    substrateHdMultiplier?: number;
    startHeight: number; // mm from Z=0
    endHeight: number; // mm from Z=0
    idealThickness: number; // Uncompressed zone thickness
    actualThickness: number; // After compression
}

export interface TransitionThicknessCache {
    get(key: string): number | undefined;
    set(key: string, value: number): void;
}

/** A generated layer segment from the auto-paint algorithm */
export interface AutoPaintLayer {
    filamentId: string;
    filamentColor: string;
    startHeight: number; // mm from Z=0
    endHeight: number; // mm from Z=0
}

/** One physically printable auto-paint layer, including its simulated visible color. */
interface PrintableAutoPaintLayer extends AutoPaintLayer {
    thickness: number;
    zoneIndex: number;
    virtualColor: RGB;
}

interface PrintableAutoPaintStack {
    layers: PrintableAutoPaintLayer[];
    zones: TransitionZone[];
    totalHeight: number;
    truncated: boolean;
}

/** Result from the auto-paint generator */
export interface AutoPaintResult {
    layers: AutoPaintLayer[];
    totalHeight: number; // Actual height of the discrete printable stack
    idealHeight: number; // Continuous optical height before compression
    autoHeight: number; // Default discrete printable height when no cap is set
    compressionRatio: number; // 1.0 = no compression, 0.5 = 50% compressed
    filamentOrder: string[]; // Filament IDs in order (dark to light)
    transitionZones: TransitionZone[]; // Detailed zone info
    /** Frozen, serializable single source of truth for preview, proof, and export. */
    finalStack: FinalPrintableStackSnapshot;
    /** Present when hard color-separation constraints were requested. */
    colorSeparation?: ColorSeparationReport;
    // Confidence metrics
    confidence: number; // Overall confidence score (0-1)
    confidenceFactors: {
        calibrationQuality: number; // 0-1: Quality of filament calibrations
        filamentCoverage: number; // 0-1: How well filaments cover image colors
        compressionImpact: number; // 0-1: Impact of height compression
    };
    // Optimizer metadata (for advanced optimizer only)
    optimizerMetadata?: {
        algorithm: string; // concrete tier path, such as 'beam', 'deep-hybrid', or 'exact-base'
        score: number; // Quality score achieved
        iterations: number; // Iterations performed
        converged: boolean; // Whether algorithm converged
        cacheHit: boolean; // Whether result came from cache
        extraRepeatCount: number; // Actual repeated occurrences used by the chosen stack
        optimality: 'exact' | 'best-found';
        singleRemovalMinimal: boolean;
        usedFilamentOccurrenceCount: number;
        usedPrintableLayerCount: number;
        usedHeight: number;
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
 * Blending takes place in linear-light sRGB, then converts back to display
 * sRGB for color matching and preview output.
 *
 * @param backgroundColor - The color of the existing stack
 * @param filamentColor - The color of the filament being added
 * @param filamentTD - Scalar working TD or calibrated R, G, B TDs (mm)
 * @param layerThickness - How thick the filament layer is (mm)
 * @returns The resulting blended color
 */
export function blendColors(
    backgroundColor: RGB,
    filamentColor: RGB,
    filamentTD: number | CalibrationRgb,
    layerThickness: number,
    transmissionExponent = 1,
    substrateHdMultiplier = 1
): RGB {
    if (layerThickness <= 0) {
        return filamentColor;
    }

    const channelTd: CalibrationRgb =
        typeof filamentTD === 'number' ? [filamentTD, filamentTD, filamentTD] : filamentTD;
    if (channelTd.some((td) => !Number.isFinite(td) || td <= 0)) {
        return filamentColor;
    }

    const blendChannel = (background: number, filament: number, td: number) => {
        // Beer-Lambert law: transmission = 10^(-thickness/TD).
        // At thickness == TD, transmission = 10^(-1) = 0.1 (10%).
        const transmission = effectiveTransmission(
            layerThickness,
            td,
            transmissionExponent,
            substrateHdMultiplier
        );
        return blendSrgbChannel(background, filament, transmission);
    };

    return {
        r: blendChannel(backgroundColor.r, filamentColor.r, channelTd[0]),
        g: blendChannel(backgroundColor.g, filamentColor.g, channelTd[1]),
        b: blendChannel(backgroundColor.b, filamentColor.b, channelTd[2]),
    };
}

/** Calculate Delta E (CIEDE2000) directly from Lab values. */
export function deltaE2000Lab(lab1: Lab, lab2: Lab): number {
    const chroma1 = Math.hypot(lab1.a, lab1.b);
    const chroma2 = Math.hypot(lab2.a, lab2.b);
    const averageChroma = (chroma1 + chroma2) / 2;
    const g = 0.5 * (1 - Math.sqrt(averageChroma ** 7 / (averageChroma ** 7 + 25 ** 7)));
    const a1 = (1 + g) * lab1.a;
    const a2 = (1 + g) * lab2.a;
    const adjustedChroma1 = Math.hypot(a1, lab1.b);
    const adjustedChroma2 = Math.hypot(a2, lab2.b);
    const hue = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    const hue1 = hue(a1, lab1.b);
    const hue2 = hue(a2, lab2.b);
    const deltaL = lab2.L - lab1.L;
    const deltaChroma = adjustedChroma2 - adjustedChroma1;
    const hueDifference =
        adjustedChroma1 * adjustedChroma2 === 0
            ? 0
            : Math.abs(hue2 - hue1) <= 180
              ? hue2 - hue1
              : hue2 <= hue1
                ? hue2 - hue1 + 360
                : hue2 - hue1 - 360;
    const deltaHue =
        2 *
        Math.sqrt(adjustedChroma1 * adjustedChroma2) *
        Math.sin(((hueDifference / 2) * Math.PI) / 180);
    const meanL = (lab1.L + lab2.L) / 2;
    const meanChroma = (adjustedChroma1 + adjustedChroma2) / 2;
    const meanHue =
        adjustedChroma1 * adjustedChroma2 === 0
            ? hue1 + hue2
            : Math.abs(hue1 - hue2) <= 180
              ? (hue1 + hue2) / 2
              : hue1 + hue2 < 360
                ? (hue1 + hue2 + 360) / 2
                : (hue1 + hue2 - 360) / 2;
    const hueWeight =
        1 -
        0.17 * Math.cos(((meanHue - 30) * Math.PI) / 180) +
        0.24 * Math.cos((2 * meanHue * Math.PI) / 180) +
        0.32 * Math.cos(((3 * meanHue + 6) * Math.PI) / 180) -
        0.2 * Math.cos(((4 * meanHue - 63) * Math.PI) / 180);
    const lightnessScale = 1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2);
    const chromaScale = 1 + 0.045 * meanChroma;
    const hueScale = 1 + 0.015 * meanChroma * hueWeight;
    const rotation =
        -2 *
        Math.sqrt(meanChroma ** 7 / (meanChroma ** 7 + 25 ** 7)) *
        Math.sin((60 * Math.exp(-(((meanHue - 275) / 25) ** 2)) * Math.PI) / 180);

    return Math.sqrt(
        (deltaL / lightnessScale) ** 2 +
            (deltaChroma / chromaScale) ** 2 +
            (deltaHue / hueScale) ** 2 +
            rotation * (deltaChroma / chromaScale) * (deltaHue / hueScale)
    );
}

const OPTIMIZER_DISTANCE_METRIC: ColorDistanceMetric = 'cie76';

/**
 * Geometric color distance used for nearest-match and polyline projection.
 * Deliberately a Euclidean Lab metric (CIE76): projecting a target onto the
 * palette's Lab polyline assumes a Euclidean space, so a non-Euclidean metric
 * (CIEDE2000) would be geometrically inconsistent here — and this runs in the
 * hot per-segment loop, where CIE76 keeps the search fast.
 */
function optimizerColorDistance(left: Lab, right: Lab): number {
    return OPTIMIZER_DISTANCE_METRIC === 'ciede2000'
        ? deltaE2000Lab(left, right)
        : deltaELab(left, right);
}

/**
 * Perceptual realized-error metric for the optimizer objective and benchmark
 * reporting. CIEDE2000 tracks visible print error far better than CIE76, and it
 * is only evaluated once per image target per sequence (after projection), so
 * its higher cost stays negligible against the search.
 */
function realizedColorError(left: Lab, right: Lab): number {
    return deltaE2000Lab(left, right);
}

/**
 * Calculate the opacity (how opaque) a filament layer is at a given thickness.
 *
 * @param filamentTD - Scalar TD, or calibrated R, G, B TDs (mm)
 * @param thickness - Layer thickness (mm)
 * @returns Opacity value (0-1); calibrated TDs return the least-opaque channel
 */
export function getOpacity(
    filamentTD: number | CalibrationRgb,
    thickness: number,
    transmissionExponent = 1,
    substrateHdMultiplier = 1
): number {
    if (thickness <= 0) return 0;

    const channelTds: CalibrationRgb =
        typeof filamentTD === 'number' ? [filamentTD, filamentTD, filamentTD] : filamentTD;
    if (channelTds.some((td) => !Number.isFinite(td) || td <= 0)) return 0;

    return Math.min(
        ...channelTds.map(
            (td) =>
                1 -
                effectiveTransmission(thickness, td, transmissionExponent, substrateHdMultiplier)
        )
    );
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

/** Legacy compact transition endpoint: 80% opacity. The UI explicitly defaults to Detailed (90%). */
export const DEFAULT_TRANSITION_OPACITY = 0.8;

function normalizeTransitionOpacity(targetOpacity: number | undefined): number {
    if (!Number.isFinite(targetOpacity)) return DEFAULT_TRANSITION_OPACITY;
    return Math.max(0.5, Math.min(0.99, targetOpacity!));
}

function transitionThicknessMultiplier(targetOpacity: number): number {
    // Keep the old compact 0.7×TD endpoint byte-for-byte stable. The detailed
    // and maximum presets deliberately align with the familiar 1×TD and
    // 1.3×TD (about 95%) optical landmarks.
    if (Math.abs(targetOpacity - 0.8) < 1e-9) return 0.7;
    if (Math.abs(targetOpacity - 0.9) < 1e-9) return 1;
    if (Math.abs(targetOpacity - 0.95) < 1e-9) return 1.3;
    return -Math.log10(1 - targetOpacity);
}

// `filament.td` stores the frontlit hiding distance directly (profile schema v2)
// for calibrated and uncalibrated filaments alike, so no runtime scaling is
// needed. Per-channel values come from `channelHds`: measured when calibrated,
// derived from the swatch color otherwise.

export type AutoPaintFilament = Pick<Filament, 'id' | 'color' | 'td' | 'calibration'>;

/**
 * Simulate adding filament layers until the blended color matches the
 * target pure filament color (DeltaE < threshold), or until the filament
 * is effectively opaque (opacity target reached).
 *
 * @param backgroundColor - Starting background color
 * @param filamentColor - Target filament color
 * @param filamentTD - Scalar TD or calibrated R, G, B TDs of the filament
 * @param layerHeight - Physical layer height increment
 * @returns Thickness needed for complete transition
 */
export function calculateTransitionThickness(
    backgroundColor: RGB,
    filamentColor: RGB,
    filamentTD: number | CalibrationRgb,
    layerHeight: number,
    targetOpacity: number = DEFAULT_TRANSITION_OPACITY,
    transmissionExponent = 1,
    substrateHdMultiplier = 1
): number {
    // Early exit if colors are already close
    if (deltaE(backgroundColor, filamentColor) < DELTA_E_THRESHOLD) {
        return layerHeight; // Still need at least one layer
    }

    let thickness = 0;
    let currentColor = backgroundColor;
    const channelTds: CalibrationRgb =
        typeof filamentTD === 'number' ? [filamentTD, filamentTD, filamentTD] : filamentTD;
    if (channelTds.some((td) => !Number.isFinite(td) || td <= 0)) {
        return layerHeight;
    }

    // The requested opacity determines the absolute maximum transition
    // thickness. Perceptual convergence can still complete the transition
    // earlier when the blended result is already close to the target color.
    const resolvedOpacity = normalizeTransitionOpacity(targetOpacity);
    const opacityThicknessMultiplier =
        substrateHdMultiplier *
        Math.pow(
            transitionThicknessMultiplier(resolvedOpacity),
            1 / Math.max(0.01, transmissionExponent)
        );
    const opticalMaxThickness = Math.max(
        layerHeight,
        Math.max(...channelTds) * opacityThicknessMultiplier
    );
    // Keep malformed in-memory filament values from turning this layer-wise
    // simulation into an effectively infinite loop. No printable Auto-paint
    // result can retain more than 500 layers anyway.
    const maxThickness = Math.min(opticalMaxThickness, layerHeight * 500);

    // Simulate adding layers until color converges or we hit the cap
    while (thickness < maxThickness) {
        thickness += layerHeight;
        currentColor = blendColors(
            backgroundColor,
            filamentColor,
            filamentTD,
            thickness,
            transmissionExponent,
            substrateHdMultiplier
        );

        // Stop if the blended color is perceptually close to the target
        if (deltaE(currentColor, filamentColor) < DELTA_E_THRESHOLD) {
            break;
        }

        // Stop at the selected opacity endpoint when perceptual convergence
        // has not already completed the transition.
        if (
            getOpacity(filamentTD, thickness, transmissionExponent, substrateHdMultiplier) >=
            resolvedOpacity
        ) {
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
 * @param transitionThicknessCache - Optional cache shared by optimizer evaluations
 * @returns Object with ideal height and zone breakdown
 */
export function calculateIdealHeight(
    sortedFilaments: AutoPaintFilament[],
    layerHeight: number,
    baseThickness: number = 0.6,
    transitionThicknessCache?: TransitionThicknessCache,
    transitionOpacity: number = DEFAULT_TRANSITION_OPACITY,
    appearanceModel: AppearanceRankModelV1 = createIdentityAppearanceRankModel()
): { idealHeight: number; zones: TransitionZone[] } {
    if (sortedFilaments.length === 0) {
        return { idealHeight: baseThickness, zones: [] };
    }

    const zones: TransitionZone[] = [];
    let currentHeight = 0;
    const effectiveOptics = appearanceModel.effectiveOptics;
    const firstResolvedOptics = resolveEffectiveFilamentOptics(effectiveOptics, sortedFilaments[0]);
    let currentBackgroundColor: RGB = {
        r: firstResolvedOptics.color[0],
        g: firstResolvedOptics.color[1],
        b: firstResolvedOptics.color[2],
    };

    // Zone 1: Foundation layer (darkest filament)
    // Needs to be opaque enough to block the backlight.
    // Using Beer-Lambert: for 95% opacity → transmission = 5%
    //   0.05 = 10^(-thickness/TD)  →  thickness = TD × log10(20) ≈ TD × 1.3
    // Dark filaments have low TD (e.g. 0.5mm) → foundation ≈ 0.65mm
    const firstFilament = sortedFilaments[0];
    const foundationTdChannels = channelHds(firstFilament);
    const effectiveFoundationTdChannels: CalibrationRgb = [
        firstResolvedOptics.hdChannels[0],
        firstResolvedOptics.hdChannels[1],
        firstResolvedOptics.hdChannels[2],
    ];
    // Use the least-opaque (largest) channel hiding distance so every channel
    // reaches ~95% opacity.
    const foundationTd = Math.max(...effectiveFoundationTdChannels);
    const opacityThickness =
        foundationTd * Math.pow(1.3, 1 / firstResolvedOptics.transmissionExponent); // ~95% opaque
    // Ensure at least the base thickness (avoid unnecessary extra layers)
    const foundationThickness = Math.max(baseThickness, opacityThickness);

    zones.push({
        filamentId: firstFilament.id,
        filamentColor: firstFilament.color,
        filamentTd: firstFilament.td,
        filamentTdChannels: foundationTdChannels,
        ...(effectiveOptics?.applied
            ? {
                  effectiveColor: { ...currentBackgroundColor },
                  effectiveTdChannels: effectiveFoundationTdChannels,
                  transmissionExponent: firstResolvedOptics.transmissionExponent,
                  substrateHdMultiplier: 1,
              }
            : {}),
        startHeight: 0,
        endHeight: foundationThickness,
        idealThickness: foundationThickness,
        actualThickness: foundationThickness,
    });
    currentHeight = foundationThickness;

    // Subsequent zones: each filament transitions from the previous
    for (let i = 1; i < sortedFilaments.length; i++) {
        const filament = sortedFilaments[i];
        const resolvedOptics = resolveEffectiveFilamentOptics(effectiveOptics, filament);
        const filamentRgb: RGB = {
            r: resolvedOptics.color[0],
            g: resolvedOptics.color[1],
            b: resolvedOptics.color[2],
        };
        const transitionTd = channelHds(filament);
        const effectiveTransitionTd: CalibrationRgb = [
            resolvedOptics.hdChannels[0],
            resolvedOptics.hdChannels[1],
            resolvedOptics.hdChannels[2],
        ];
        const substrateFilamentId = sortedFilaments[i - 1].id;
        const substrateHdMultiplier = effectiveSubstrateHdMultiplier(
            effectiveOptics,
            filament.id,
            substrateFilamentId
        );

        // Calculate how thick this zone needs to be
        const transitionKey = [
            currentBackgroundColor.r,
            currentBackgroundColor.g,
            currentBackgroundColor.b,
            filamentRgb.r,
            filamentRgb.g,
            filamentRgb.b,
            ...effectiveTransitionTd,
            resolvedOptics.transmissionExponent,
            substrateFilamentId,
            substrateHdMultiplier,
            layerHeight,
            transitionOpacity,
        ].join(':');
        let transitionThickness = transitionThicknessCache?.get(transitionKey);
        if (transitionThickness === undefined) {
            transitionThickness = calculateTransitionThickness(
                currentBackgroundColor,
                filamentRgb,
                effectiveTransitionTd,
                layerHeight,
                transitionOpacity,
                resolvedOptics.transmissionExponent,
                substrateHdMultiplier
            );
            transitionThicknessCache?.set(transitionKey, transitionThickness);
        }

        zones.push({
            filamentId: filament.id,
            filamentColor: filament.color,
            filamentTd: filament.td,
            filamentTdChannels: transitionTd,
            ...(effectiveOptics?.applied
                ? {
                      effectiveColor: filamentRgb,
                      effectiveTdChannels: effectiveTransitionTd,
                      transmissionExponent: resolvedOptics.transmissionExponent,
                      substrateFilamentId,
                      substrateHdMultiplier,
                  }
                : {}),
            startHeight: currentHeight,
            endHeight: currentHeight + transitionThickness,
            idealThickness: transitionThickness,
            actualThickness: transitionThickness,
        });

        // The next filament is deposited over this transition's actual end
        // color, not an idealized pure-filament shortcut.
        currentBackgroundColor = blendColors(
            currentBackgroundColor,
            filamentRgb,
            effectiveTransitionTd,
            transitionThickness,
            resolvedOptics.transmissionExponent,
            substrateHdMultiplier
        );
        currentHeight += transitionThickness;
    }

    return { idealHeight: currentHeight, zones };
}

/** Compact linked optical state retained while a search extends one prefix. */
export interface OpticalPrefixState {
    readonly parent: OpticalPrefixState | undefined;
    readonly zone: TransitionZone;
    readonly backgroundColor: RGB;
    readonly depth: number;
    readonly owner: symbol;
}

export interface OpticalPrefixBuilder {
    extend(parent: OpticalPrefixState | undefined, filament: AutoPaintFilament): OpticalPrefixState;
    buildPalette(
        state: OpticalPrefixState,
        maxHeight?: number,
        appearancePredictionCache?: AppearancePredictionCache
    ): AchievableColor[];
}

/**
 * Build one-edge-at-a-time optical states for prefix-oriented searches.
 * Printable palettes remain transient and are materialized only for scoring.
 */
export function createOpticalPrefixBuilder(
    layerHeight: number,
    firstLayerHeight: number,
    transitionOpacity: number = DEFAULT_TRANSITION_OPACITY,
    appearanceModel: AppearanceRankModelV1 = createIdentityAppearanceRankModel()
): OpticalPrefixBuilder {
    const owner = Symbol('optical-prefix-builder');
    const baseThickness = Math.max(firstLayerHeight, layerHeight);
    const effectiveOptics = appearanceModel.effectiveOptics;

    const extend = (
        parent: OpticalPrefixState | undefined,
        filament: AutoPaintFilament
    ): OpticalPrefixState => {
        if (parent && parent.owner !== owner) {
            throw new Error('Cannot extend an optical prefix created by a different builder');
        }

        const resolvedOptics = resolveEffectiveFilamentOptics(effectiveOptics, filament);
        const effectiveTdChannels: CalibrationRgb = [
            resolvedOptics.hdChannels[0],
            resolvedOptics.hdChannels[1],
            resolvedOptics.hdChannels[2],
        ];
        const effectiveColor: RGB = {
            r: resolvedOptics.color[0],
            g: resolvedOptics.color[1],
            b: resolvedOptics.color[2],
        };
        const filamentTdChannels = channelHds(filament);

        if (!parent) {
            const foundationThickness = Math.max(
                baseThickness,
                Math.max(...effectiveTdChannels) *
                    Math.pow(1.3, 1 / resolvedOptics.transmissionExponent)
            );
            return {
                parent: undefined,
                zone: {
                    filamentId: filament.id,
                    filamentColor: filament.color,
                    filamentTd: filament.td,
                    filamentTdChannels,
                    ...(effectiveOptics?.applied
                        ? {
                              effectiveColor: { ...effectiveColor },
                              effectiveTdChannels,
                              transmissionExponent: resolvedOptics.transmissionExponent,
                              substrateHdMultiplier: 1,
                          }
                        : {}),
                    startHeight: 0,
                    endHeight: foundationThickness,
                    idealThickness: foundationThickness,
                    actualThickness: foundationThickness,
                },
                backgroundColor: effectiveColor,
                depth: 1,
                owner,
            };
        }

        const substrateFilamentId = parent.zone.filamentId;
        const substrateHdMultiplier = effectiveSubstrateHdMultiplier(
            effectiveOptics,
            filament.id,
            substrateFilamentId
        );
        const transitionThickness = calculateTransitionThickness(
            parent.backgroundColor,
            effectiveColor,
            effectiveTdChannels,
            layerHeight,
            transitionOpacity,
            resolvedOptics.transmissionExponent,
            substrateHdMultiplier
        );
        const endHeight = parent.zone.endHeight + transitionThickness;
        return {
            parent,
            zone: {
                filamentId: filament.id,
                filamentColor: filament.color,
                filamentTd: filament.td,
                filamentTdChannels,
                ...(effectiveOptics?.applied
                    ? {
                          effectiveColor,
                          effectiveTdChannels,
                          transmissionExponent: resolvedOptics.transmissionExponent,
                          substrateFilamentId,
                          substrateHdMultiplier,
                      }
                    : {}),
                startHeight: parent.zone.endHeight,
                endHeight,
                idealThickness: transitionThickness,
                actualThickness: transitionThickness,
            },
            backgroundColor: blendColors(
                parent.backgroundColor,
                effectiveColor,
                effectiveTdChannels,
                transitionThickness,
                resolvedOptics.transmissionExponent,
                substrateHdMultiplier
            ),
            depth: parent.depth + 1,
            owner,
        };
    };

    return {
        extend,
        buildPalette(state, maxHeight, appearancePredictionCache) {
            if (state.owner !== owner) {
                throw new Error('Cannot materialize an optical prefix created by a different builder');
            }
            const zones = new Array<TransitionZone>(state.depth);
            let current: OpticalPrefixState | undefined = state;
            while (current) {
                zones[current.depth - 1] = current.zone;
                current = current.parent;
            }
            return buildAchievableColorPaletteFromZones(
                zones,
                layerHeight,
                firstLayerHeight,
                maxHeight,
                appearanceModel,
                appearancePredictionCache
            );
        },
    };
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

const PRINTABLE_HEIGHT_EPSILON = 1e-8;
const MAX_PRINTABLE_AUTO_PAINT_LAYERS = 500;

function printableFirstLayerHeight(layerHeight: number, firstLayerHeight: number): number {
    return Math.max(layerHeight, firstLayerHeight);
}

function roundPrintableHeight(height: number): number {
    return Number(height.toFixed(8));
}

/**
 * Return the smallest valid slicer height that fully covers `height`.
 *
 * Auto-paint zones are continuous, but the generated model can only contain a
 * thick first layer followed by whole normal-height layers. Keeping this rule
 * here prevents the optimizer, preview, and export paths from disagreeing
 * about the physical stack height.
 */
export function ceilAutoPaintHeightToPrintableStack(
    height: number,
    layerHeight: number,
    firstLayerHeight: number
): number {
    if (!Number.isFinite(height) || height <= 0 || layerHeight <= 0) return 0;

    const first = printableFirstLayerHeight(layerHeight, firstLayerHeight);
    if (height <= first + PRINTABLE_HEIGHT_EPSILON) return roundPrintableHeight(first);

    const regularLayers = Math.ceil((height - first - PRINTABLE_HEIGHT_EPSILON) / layerHeight);
    return roundPrintableHeight(first + Math.max(0, regularLayers) * layerHeight);
}

/**
 * Return the tallest valid slicer height that does not exceed `maxHeight`.
 *
 * A requested cap between printable layer boundaries is intentionally rounded
 * down. A partial final layer would violate the configured print settings and
 * rounding it up would violate the user's cap.
 */
export function floorAutoPaintHeightToPrintableStack(
    maxHeight: number,
    layerHeight: number,
    firstLayerHeight: number
): number {
    if (!Number.isFinite(maxHeight) || maxHeight <= 0 || layerHeight <= 0) return 0;

    const first = printableFirstLayerHeight(layerHeight, firstLayerHeight);
    // A cap smaller than the required first layer cannot produce a valid stack.
    // Return zero rather than silently exceeding the caller's maximum.
    if (maxHeight < first - PRINTABLE_HEIGHT_EPSILON) return 0;

    const regularLayers = Math.floor((maxHeight - first + PRINTABLE_HEIGHT_EPSILON) / layerHeight);
    return roundPrintableHeight(first + Math.max(0, regularLayers) * layerHeight);
}

function findTransitionZoneAtHeight(zones: TransitionZone[], height: number): number {
    let activeZoneIndex = 0;

    for (let index = 0; index < zones.length; index++) {
        const zone = zones[index];
        if (
            height + PRINTABLE_HEIGHT_EPSILON >= zone.startHeight &&
            height < zone.endHeight - PRINTABLE_HEIGHT_EPSILON
        ) {
            return index;
        }
        if (height + PRINTABLE_HEIGHT_EPSILON >= zone.startHeight) {
            activeZoneIndex = index;
        }
    }

    return activeZoneIndex;
}

/**
 * Convert continuous transition zones into the exact printable stack used by
 * preview, meshing, and export. Zone changes occur at whole layer boundaries;
 * every layer has either the first-layer height or the configured layer height.
 */
function buildPrintableAutoPaintStack(
    zones: TransitionZone[],
    layerHeight: number,
    firstLayerHeight: number
): PrintableAutoPaintStack {
    if (zones.length === 0 || layerHeight <= 0) {
        return { layers: [], zones: [], totalHeight: 0, truncated: false };
    }

    const continuousTotalHeight = zones[zones.length - 1].endHeight;
    const printableTotalHeight = ceilAutoPaintHeightToPrintableStack(
        continuousTotalHeight,
        layerHeight,
        firstLayerHeight
    );
    if (printableTotalHeight <= 0) {
        return { layers: [], zones: [], totalHeight: 0, truncated: false };
    }

    const uncoloredLayers: Array<{
        thickness: number;
        startHeight: number;
        endHeight: number;
        sourceZoneIndex: number;
    }> = [];
    let currentHeight = 0;
    let layerIndex = 0;

    while (
        currentHeight < printableTotalHeight - PRINTABLE_HEIGHT_EPSILON &&
        layerIndex < MAX_PRINTABLE_AUTO_PAINT_LAYERS
    ) {
        const thickness =
            layerIndex === 0
                ? printableFirstLayerHeight(layerHeight, firstLayerHeight)
                : layerHeight;
        const sourceZoneIndex = findTransitionZoneAtHeight(zones, currentHeight);
        const endHeight = roundPrintableHeight(currentHeight + thickness);

        uncoloredLayers.push({
            thickness: roundPrintableHeight(thickness),
            startHeight: roundPrintableHeight(currentHeight),
            endHeight,
            sourceZoneIndex,
        });
        currentHeight = endHeight;
        layerIndex++;
    }

    const truncated = currentHeight < printableTotalHeight - PRINTABLE_HEIGHT_EPSILON;
    const actualZoneIndices: number[] = [];
    for (const layer of uncoloredLayers) {
        if (actualZoneIndices.at(-1) !== layer.sourceZoneIndex) {
            actualZoneIndices.push(layer.sourceZoneIndex);
        }
    }

    const sourceToActualZone = new Map<number, number>();
    const printableZones = actualZoneIndices.map((sourceZoneIndex, actualZoneIndex) => {
        sourceToActualZone.set(sourceZoneIndex, actualZoneIndex);
        const source = zones[sourceZoneIndex];
        const zoneLayers = uncoloredLayers.filter(
            (layer) => layer.sourceZoneIndex === sourceZoneIndex
        );
        const startHeight = zoneLayers[0].startHeight;
        const endHeight = zoneLayers[zoneLayers.length - 1].endHeight;

        return {
            ...source,
            startHeight,
            endHeight,
            actualThickness: roundPrintableHeight(endHeight - startHeight),
        };
    });

    const zoneBackgrounds = buildZoneBackgrounds(printableZones);
    const thicknessByZone = new Array(printableZones.length).fill(0);
    const layers = uncoloredLayers.map((layer) => {
        const zoneIndex = sourceToActualZone.get(layer.sourceZoneIndex)!;
        const zone = printableZones[zoneIndex];
        const thicknessInZone = roundPrintableHeight(
            (thicknessByZone[zoneIndex] += layer.thickness)
        );
        const filamentColor = zone.effectiveColor ?? hexToRgb(zone.filamentColor);
        const virtualColor =
            zoneIndex === 0
                ? filamentColor
                : blendColors(
                      zoneBackgrounds[zoneIndex],
                      filamentColor,
                      zone.effectiveTdChannels ?? zone.filamentTdChannels ?? zone.filamentTd,
                      thicknessInZone,
                      zone.transmissionExponent ?? 1,
                      zone.substrateHdMultiplier ?? 1
                  );

        return {
            filamentId: zone.filamentId,
            filamentColor: zone.filamentColor,
            startHeight: layer.startHeight,
            endHeight: layer.endHeight,
            thickness: layer.thickness,
            zoneIndex,
            virtualColor,
        };
    });

    return {
        layers,
        zones: printableZones,
        totalHeight: layers.at(-1)?.endHeight ?? 0,
        truncated,
    };
}

/**
 * Keep the already-simulated prefix through the highest mapped printable
 * surface. Trimming after simulation preserves every lower optical prediction
 * while preventing unused suffix layers and swaps from leaking into preview,
 * export, or print instructions.
 */
function trimPrintableAutoPaintStack(
    stack: PrintableAutoPaintStack,
    maximumUsedHeight: number | undefined
): PrintableAutoPaintStack {
    if (
        maximumUsedHeight === undefined ||
        !Number.isFinite(maximumUsedHeight) ||
        maximumUsedHeight >= stack.totalHeight - PRINTABLE_HEIGHT_EPSILON
    ) {
        return stack;
    }

    const layers = stack.layers.filter(
        (layer) => layer.endHeight <= maximumUsedHeight + PRINTABLE_HEIGHT_EPSILON
    );
    const lastLayer = layers.at(-1);
    if (!lastLayer) return stack;

    const totalHeight = lastLayer.endHeight;
    const lastZoneIndex = lastLayer.zoneIndex;
    const zones = stack.zones.slice(0, lastZoneIndex + 1).map((zone, index) =>
        index === lastZoneIndex
            ? {
                  ...zone,
                  endHeight: totalHeight,
                  actualThickness: roundPrintableHeight(totalHeight - zone.startHeight),
              }
            : zone
    );

    return {
        layers,
        zones,
        totalHeight,
        truncated: stack.truncated,
    };
}

function canonicalSrgbColor(rgb: RGB): CanonicalSrgbColor {
    const channels = [rgb.r, rgb.g, rgb.b].map((channel) =>
        Math.round(Math.max(0, Math.min(255, channel)))
    ) as [number, number, number];

    return {
        space: 'srgb',
        encoding: 'uint8',
        whitePoint: 'D65',
        rgb: channels,
        hex: rgbToHex({ r: channels[0], g: channels[1], b: channels[2] }),
    };
}

function labTuple(lab: Lab): [number, number, number] {
    return [lab.L, lab.a, lab.b];
}

function freezeSnapshotValue<T>(value: T): T {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;

    for (const child of Object.values(value)) {
        freezeSnapshotValue(child);
    }

    return Object.freeze(value);
}

export function freezeFinalPrintableStackSnapshot(
    snapshot: FinalPrintableStackSnapshot
): FinalPrintableStackSnapshot {
    return freezeSnapshotValue(snapshot);
}

function buildFinalPrintableStackSnapshot(
    stack: PrintableAutoPaintStack,
    imageSwatches: AutoPaintImageSwatch[],
    settings: {
        layerHeight: number;
        firstLayerHeight: number;
        requestedMaxHeight?: number;
        printableMaxHeight: number;
        transitionOpacity?: number;
        compressionRatio: number;
        preserveSeparation?: boolean;
        separationMaxDeltaE?: number;
        failOnSeparationError?: boolean;
        appearanceModel?: AppearanceRankModelV1;
    }
): FinalPrintableStackSnapshot {
    const appearanceModel = settings.appearanceModel ?? createIdentityAppearanceRankModel();
    const comparedStackKeys = new Set(appearanceModel.comparedStackKeys);
    const zoneSnapshots: FinalStackZoneSnapshot[] = stack.zones.map((zone, index) => ({
        id: `zone-${index + 1}`,
        index,
        filamentId: zone.filamentId,
        filamentColor: rgbToHex(hexToRgb(zone.filamentColor)),
        filamentHd: zone.filamentTd,
        filamentHdChannels: zone.filamentTdChannels
            ? [zone.filamentTdChannels[0], zone.filamentTdChannels[1], zone.filamentTdChannels[2]]
            : undefined,
        ...(zone.effectiveColor
            ? {
                  effectiveOpaqueColor: [
                      zone.effectiveColor.r,
                      zone.effectiveColor.g,
                      zone.effectiveColor.b,
                  ] as const,
              }
            : {}),
        ...(zone.effectiveTdChannels
            ? {
                  effectiveHdChannels: [
                      zone.effectiveTdChannels[0],
                      zone.effectiveTdChannels[1],
                      zone.effectiveTdChannels[2],
                  ] as const,
              }
            : {}),
        ...(zone.transmissionExponent !== undefined
            ? { transmissionExponent: zone.transmissionExponent }
            : {}),
        ...(zone.substrateFilamentId ? { substrateFilamentId: zone.substrateFilamentId } : {}),
        ...(zone.substrateHdMultiplier !== undefined
            ? { substrateHdMultiplier: zone.substrateHdMultiplier }
            : {}),
        startHeight: zone.startHeight,
        endHeight: zone.endHeight,
        idealThickness: zone.idealThickness,
        actualThickness: zone.actualThickness,
    }));
    const modelVersion = appearanceModel.effectiveOptics?.applied
        ? ('rgb-effective-optics-v2' as const)
        : ('rgb-beer-lambert-v1' as const);
    const modelFingerprint = fingerprintJson('appearance-model-v1', {
        modelVersion,
        zones: zoneSnapshots.map((zone) => ({
            filamentId: zone.filamentId,
            filamentColor: zone.filamentColor,
            filamentHd: zone.filamentHd,
            filamentHdChannels: zone.filamentHdChannels ?? null,
            effectiveOpaqueColor: zone.effectiveOpaqueColor ?? null,
            effectiveHdChannels: zone.effectiveHdChannels ?? null,
            transmissionExponent: zone.transmissionExponent ?? null,
            substrateFilamentId: zone.substrateFilamentId ?? null,
            substrateHdMultiplier: zone.substrateHdMultiplier ?? null,
        })),
        transitionOpacity: normalizeTransitionOpacity(settings.transitionOpacity),
    });

    const prefixTokens: Array<{
        filamentId: string;
        filamentColor: string;
        thickness: number;
    }> = [];
    const appearancePrefix: AppearanceAnchorLayer[] = [];
    const layerSnapshots: FinalStackLayerSnapshot[] = stack.layers.map((layer, index) => {
        const filamentColor = rgbToHex(hexToRgb(layer.filamentColor));
        const physicalLayer = {
            filamentId: layer.filamentId,
            filamentColor,
            thickness: layer.thickness,
        };
        prefixTokens.push(physicalLayer);
        appearancePrefix.push(physicalLayer);
        const canonicalStackKey = fingerprintJson('stack-v1', prefixTokens);
        const basePredictedLab = rgbToLab(layer.virtualColor);
        const prediction = resolveAppearanceRankModel(
            basePredictedLab,
            appearanceModel,
            appearancePrefix
        );
        const predictedRgb =
            appearanceModel.applied ||
            prediction.exactAnchor ||
            prediction.empiricalMatch ||
            prediction.localMatch
                ? appearanceLabToRgb(prediction.lab)
                : [layer.virtualColor.r, layer.virtualColor.g, layer.virtualColor.b];
        const appearanceStatus = prediction.exactAnchor
            ? ('anchored' as const)
            : prediction.localMatch && prediction.localMatch.correctionStrength > 0
              ? ('locally-fitted' as const)
              : prediction.empiricalMatch
                ? ('interpolated' as const)
                : comparedStackKeys.has(canonicalStackKey)
                  ? ('compared' as const)
                  : appearanceModel.applied
                    ? ('fitted' as const)
                    : ('estimated' as const);

        return {
            id: `layer-${index + 1}`,
            index,
            filamentId: layer.filamentId,
            filamentColor,
            startHeight: layer.startHeight,
            endHeight: layer.endHeight,
            thickness: layer.thickness,
            zoneIndex: layer.zoneIndex,
            canonicalStackKey,
            basePredictedColor: canonicalSrgbColor(layer.virtualColor),
            basePredictedLab: labTuple(basePredictedLab),
            predictedColor: canonicalSrgbColor({
                r: predictedRgb[0],
                g: predictedRgb[1],
                b: predictedRgb[2],
            }),
            predictedLab: labTuple(prediction.lab),
            appearanceStatus,
            predictionConfidence: prediction.predictionConfidence,
            ...(prediction.exactAnchor
                ? {
                      exactAnchorId: prediction.exactAnchor.id,
                      exactAnchorTargetLab: prediction.exactAnchor.targetLab,
                  }
                : {}),
            ...(prediction.empiricalMatch
                ? {
                      empiricalLutId: prediction.empiricalMatch.lutId,
                      empiricalSampleIds: prediction.empiricalMatch.sampleIds,
                  }
                : {}),
            ...(prediction.localMatch
                ? {
                      localEvidenceIds: prediction.localMatch.evidenceIds,
                      localCorrectionStrength: prediction.localMatch.correctionStrength,
                      localUncertainty: prediction.localMatch.uncertainty,
                  }
                : {}),
        };
    });
    const palette: FinalStackPaletteEntrySnapshot[] = layerSnapshots.map((layer) => ({
        id: `prefix-${layer.index + 1}`,
        index: layer.index,
        layerId: layer.id,
        height: layer.endHeight,
        canonicalStackKey: layer.canonicalStackKey,
        basePredictedColor: layer.basePredictedColor,
        basePredictedLab: layer.basePredictedLab,
        predictedColor: layer.predictedColor,
        predictedLab: layer.predictedLab,
        appearanceStatus: layer.appearanceStatus,
        predictionConfidence: layer.predictionConfidence,
        ...(layer.exactAnchorId
            ? {
                  exactAnchorId: layer.exactAnchorId,
                  exactAnchorTargetLab: layer.exactAnchorTargetLab,
              }
            : {}),
        ...(layer.empiricalLutId
            ? {
                  empiricalLutId: layer.empiricalLutId,
                  empiricalSampleIds: layer.empiricalSampleIds,
              }
            : {}),
        ...(layer.localEvidenceIds
            ? {
                  localEvidenceIds: layer.localEvidenceIds,
                  localCorrectionStrength: layer.localCorrectionStrength,
                  localUncertainty: layer.localUncertainty,
              }
            : {}),
    }));
    const swapSequence: FinalStackSwapSnapshot[] = zoneSnapshots.map((zone) => {
        const zoneLayers = layerSnapshots.filter((layer) => layer.zoneIndex === zone.index);
        const firstLayer = zoneLayers[0];
        const lastLayer = zoneLayers.at(-1);

        return {
            id: `swap-run-${zone.index + 1}`,
            index: zone.index,
            filamentId: zone.filamentId,
            filamentColor: zone.filamentColor,
            startLayerIndex: firstLayer?.index ?? 0,
            endLayerIndex: lastLayer?.index ?? 0,
            startHeight: firstLayer?.startHeight ?? zone.startHeight,
            endHeight: lastLayer?.endHeight ?? zone.endHeight,
        };
    });

    const totalTargetWeight = imageSwatches.reduce(
        (sum, swatch) => sum + Math.max(0, swatch.count ?? 1),
        0
    );
    const sourceTargets = imageSwatches
        .map((swatch, index) => ({
            index,
            color: canonicalSrgbColor(hexToRgb(swatch.hex)),
            lab: rgbToLab(hexToRgb(swatch.hex)),
            weight: Math.max(0, swatch.count ?? 1) / Math.max(1, totalTargetWeight),
            sampleContext: {
                geometryClass: swatch.sampleContext?.geometryClass ?? ('unknown' as const),
                interiorRadiusMm: swatch.sampleContext?.interiorRadiusMm,
                flatInteriorWeight: swatch.sampleContext?.flatInteriorWeight,
                edgeLimitedWeight: swatch.sampleContext?.edgeLimitedWeight,
            },
        }))
        .filter((target) => target.weight > 0);
    const mappedTargets =
        palette.length > 0
            ? mapTargetsToPrintablePalette(
                  palette.map((entry) => ({
                      height: entry.height,
                      lab: {
                          L: entry.predictedLab[0],
                          a: entry.predictedLab[1],
                          b: entry.predictedLab[2],
                      },
                      rgb: {
                          r: entry.predictedColor.rgb[0],
                          g: entry.predictedColor.rgb[1],
                          b: entry.predictedColor.rgb[2],
                      },
                      exactAnchorId: entry.exactAnchorId,
                      exactAnchorTargetLab: entry.exactAnchorTargetLab
                          ? {
                                L: entry.exactAnchorTargetLab[0],
                                a: entry.exactAnchorTargetLab[1],
                                b: entry.exactAnchorTargetLab[2],
                            }
                          : undefined,
                      predictionConfidence: entry.predictionConfidence,
                  })),
                  sourceTargets.map((target) => ({ ...target.lab, weight: target.weight })),
                  {
                      preserveSeparation: settings.preserveSeparation,
                      separationMaxDeltaE: settings.separationMaxDeltaE,
                  }
              )
            : [];
    const targetMappings: FinalStackTargetMappingSnapshot[] = mappedTargets.map((mapped, index) => {
        const source = sourceTargets[index];
        const paletteEntry = palette[mapped.paletteIndex];

        return {
            id: `target-${source.index + 1}-${source.color.hex.slice(1)}`,
            index: source.index,
            targetColor: source.color,
            targetLab: labTuple(source.lab),
            usageWeight: source.weight,
            paletteIndex: mapped.paletteIndex,
            paletteEntryId: paletteEntry.id,
            canonicalStackKey: paletteEntry.canonicalStackKey,
            projectedHeight: mapped.projectedHeight,
            predictedColor: paletteEntry.predictedColor,
            predictedLab: paletteEntry.predictedLab,
            predictionConfidence: paletteEntry.predictionConfidence,
            ...(typeof mapped.preservedWithinThreshold === 'boolean'
                ? { preservedWithinThreshold: mapped.preservedWithinThreshold }
                : {}),
            sampleContext: { ...source.sampleContext },
        };
    });

    const snapshotWithoutFingerprint = {
        schemaVersion: 1 as const,
        modelFingerprint,
        modelVersion,
        appearanceModel,
        settings: {
            layerHeight: settings.layerHeight,
            firstLayerHeight: printableFirstLayerHeight(
                settings.layerHeight,
                settings.firstLayerHeight
            ),
            requestedMaxHeight: settings.requestedMaxHeight ?? null,
            printableMaxHeight: settings.printableMaxHeight,
            transitionOpacity: normalizeTransitionOpacity(settings.transitionOpacity),
            compressionRatio: settings.compressionRatio,
            ...(settings.preserveSeparation
                ? {
                      separationMaxDeltaE: normalizeSeparationMaxDeltaE(
                          settings.separationMaxDeltaE
                      ),
                      failOnSeparationError: settings.failOnSeparationError !== false,
                  }
                : {}),
        },
        totalHeight: stack.totalHeight,
        truncated: stack.truncated,
        layers: layerSnapshots,
        zones: zoneSnapshots,
        swapSequence,
        palette,
        targetMappings,
    };
    const snapshot: FinalPrintableStackSnapshot = {
        ...snapshotWithoutFingerprint,
        fingerprint: fingerprintJson('final-stack-v1', snapshotWithoutFingerprint),
    };

    return freezeFinalPrintableStackSnapshot(snapshot);
}

function buildZoneBackgrounds(zones: TransitionZone[]): RGB[] {
    if (zones.length === 0) return [];

    const backgrounds: RGB[] = [];
    let previousEndColor = zones[0].effectiveColor ?? hexToRgb(zones[0].filamentColor);

    for (let index = 0; index < zones.length; index++) {
        const zone = zones[index];
        const filamentColor = zone.effectiveColor ?? hexToRgb(zone.filamentColor);
        const backgroundColor = index === 0 ? filamentColor : previousEndColor;
        backgrounds.push(backgroundColor);

        previousEndColor =
            index === 0
                ? filamentColor
                : blendColors(
                      backgroundColor,
                      filamentColor,
                      zone.effectiveTdChannels ?? zone.filamentTdChannels ?? zone.filamentTd,
                      zone.actualThickness,
                      zone.transmissionExponent ?? 1,
                      zone.substrateHdMultiplier ?? 1
                  );
    }

    return backgrounds;
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
export function clusterImageColors(
    swatches: AutoPaintImageSwatch[],
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

    for (const item of items) {
        // Find nearest existing cluster
        let bestIdx = -1;
        let bestDistance = Infinity;

        for (let ci = 0; ci < clusters.length; ci++) {
            const c = clusters[ci];
            const distance = optimizerColorDistance(item.lab, c);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIdx = ci;
            }
        }

        if (bestIdx >= 0 && bestDistance < threshold) {
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
 * Build the achievable color palette for a given filament sequence.
 *
 * Simulates the Beer-Lambert blended color at each layer-height step
 * through the stack and returns an array of { height, color } entries.
 *
 * @param sequence - Ordered filament sequence (can include repeats)
 * @param layerHeight - Physical layer height
 * @param firstLayerHeight - First layer height
 * @param maxHeight - Optional height constraint applied before sampling the palette
 * @param transitionThicknessCache - Optional cache shared by optimizer evaluations
 * @returns Array of achievable { height, lab, rgb } at each layer step
 */
export interface AchievableColor {
    height: number;
    lab: Lab;
    rgb: RGB;
    /** Physical filament occurrence that produced this printable layer. */
    filamentId?: string;
    /** Zero-based occurrence index in the candidate sequence. */
    zoneIndex?: number;
    /** Present on all palettes generated by the current appearance resolver. */
    predictionConfidence?: AppearancePredictionConfidenceV1;
    exactAnchorId?: string;
    exactAnchorTargetLab?: Lab;
    localPreferences?: readonly AppearanceLocalPreferenceMatch[];
    localEvidenceIds?: readonly string[];
    localCorrectionStrength?: number;
    localUncertainty?: number;
}

export interface AppearancePredictionCache {
    startPrefix(): number;
    extendPrefix(parentPrefix: number, layer: AppearanceAnchorLayer): number;
    get(prefix: number, base: Lab): ResolvedAppearancePrediction | undefined;
    set(prefix: number, base: Lab, value: ResolvedAppearancePrediction): void;
}

const identityPredictionConfidenceCache = new WeakMap<
    AppearanceRankModelV1,
    AppearancePredictionConfidenceV1
>();

function getIdentityPredictionConfidence(
    appearanceModel: AppearanceRankModelV1
): AppearancePredictionConfidenceV1 {
    const cached = identityPredictionConfidenceCache.get(appearanceModel);
    if (cached) return cached;
    const confidence = resolveAppearanceRankModel(
        { L: 0, a: 0, b: 0 },
        appearanceModel,
        []
    ).predictionConfidence;
    identityPredictionConfidenceCache.set(appearanceModel, confidence);
    return confidence;
}

export function buildAchievableColorPalette(
    sequence: AutoPaintFilament[],
    layerHeight: number,
    firstLayerHeight: number,
    maxHeight?: number,
    transitionOpacity: number = DEFAULT_TRANSITION_OPACITY,
    transitionThicknessCache?: TransitionThicknessCache,
    appearanceModel: AppearanceRankModelV1 = createIdentityAppearanceRankModel(),
    appearancePredictionCache?: AppearancePredictionCache
): AchievableColor[] {
    if (sequence.length === 0) return [];

    // Calculate zones for this sequence
    const { zones } = calculateIdealHeight(
        sequence,
        layerHeight,
        Math.max(firstLayerHeight, layerHeight),
        transitionThicknessCache,
        transitionOpacity,
        appearanceModel
    );

    if (zones.length === 0) return [];

    return buildAchievableColorPaletteFromZones(
        zones,
        layerHeight,
        firstLayerHeight,
        maxHeight,
        appearanceModel,
        appearancePredictionCache
    );
}

function buildAchievableColorPaletteFromZones(
    zones: TransitionZone[],
    layerHeight: number,
    firstLayerHeight: number,
    maxHeight: number | undefined,
    appearanceModel: AppearanceRankModelV1,
    appearancePredictionCache?: AppearancePredictionCache
): AchievableColor[] {

    const printableMaxHeight =
        maxHeight === undefined
            ? undefined
            : floorAutoPaintHeightToPrintableStack(maxHeight, layerHeight, firstLayerHeight);
    const activeZones =
        printableMaxHeight === undefined
            ? zones
            : compressZones(zones, printableMaxHeight).compressedZones;
    const stack = buildPrintableAutoPaintStack(activeZones, layerHeight, firstLayerHeight);

    const identityAppearance =
        !appearanceModel.applied &&
        !appearanceModel.effectiveOptics?.applied &&
        (appearanceModel.exactAnchors?.length ?? 0) === 0 &&
        (appearanceModel.localEvidence?.length ?? 0) === 0 &&
        (appearanceModel.empiricalLuts?.length ?? 0) === 0;
    // With no fitted or measured evidence, confidence is the same simulated
    // prior for every prefix. Resolve it once and skip recipe construction and
    // evidence-index traversal for every physical layer of every candidate.
    const identityPredictionConfidence = identityAppearance
        ? getIdentityPredictionConfidence(appearanceModel)
        : undefined;
    const appearancePrefix: AppearanceAnchorLayer[] = [];
    let appearancePrefixId = appearancePredictionCache?.startPrefix();
    return stack.layers.map((layer) => {
        if (!identityAppearance) {
            const physicalLayer = {
                filamentId: layer.filamentId,
                filamentColor: rgbToHex(hexToRgb(layer.filamentColor)),
                thickness: layer.thickness,
            };
            appearancePrefix.push(physicalLayer);
            if (appearancePredictionCache && appearancePrefixId !== undefined) {
                appearancePrefixId = appearancePredictionCache.extendPrefix(
                    appearancePrefixId,
                    physicalLayer
                );
            }
        }
        const baseLab = rgbToLab(layer.virtualColor);
        let prediction: ResolvedAppearancePrediction;
        if (identityPredictionConfidence) {
            prediction = {
                lab: baseLab,
                predictionConfidence: identityPredictionConfidence,
            };
        } else if (appearancePredictionCache && appearancePrefixId !== undefined) {
            const cached = appearancePredictionCache.get(appearancePrefixId, baseLab);
            if (cached) {
                prediction = cached;
            } else {
                prediction = resolveAppearanceRankModel(baseLab, appearanceModel, appearancePrefix);
                appearancePredictionCache.set(appearancePrefixId, baseLab, prediction);
            }
        } else {
            prediction = resolveAppearanceRankModel(baseLab, appearanceModel, appearancePrefix);
        }
        const rgb =
            appearanceModel.applied ||
            prediction.exactAnchor ||
            prediction.empiricalMatch ||
            prediction.localMatch
                ? appearanceLabToRgb(prediction.lab)
                : null;
        return {
            height: layer.endHeight,
            lab: prediction.lab,
            rgb: rgb ? { r: rgb[0], g: rgb[1], b: rgb[2] } : layer.virtualColor,
            filamentId: layer.filamentId,
            zoneIndex: layer.zoneIndex,
            predictionConfidence: prediction.predictionConfidence,
            ...(prediction.exactAnchor
                ? {
                      exactAnchorId: prediction.exactAnchor.id,
                      exactAnchorTargetLab: {
                          L: prediction.exactAnchor.targetLab[0],
                          a: prediction.exactAnchor.targetLab[1],
                          b: prediction.exactAnchor.targetLab[2],
                      },
                  }
                : {}),
            ...(prediction.localMatch
                ? {
                      localPreferences: prediction.localMatch.preferences,
                      localEvidenceIds: prediction.localMatch.evidenceIds,
                      localCorrectionStrength: prediction.localMatch.correctionStrength,
                      localUncertainty: prediction.localMatch.uncertainty,
                  }
                : {}),
        };
    });
}

export interface MappedTarget {
    target: WeightedLab;
    /** Printable palette index whose color the preview renders for this target. */
    paletteIndex: number;
    /** Lab color of that printable palette entry. */
    mappedLab: Lab;
    /** Continuous projected height before snapping to a printable layer. */
    projectedHeight: number;
    /** Whether this target owns a distinct printable color inside the hard Delta E limit. */
    preservedWithinThreshold?: boolean;
}

export interface ColorSeparationReport {
    requestedColorCount: number;
    /** Distinct printable colors available after collapsing perceptually equivalent entries. */
    printableColorCount: number;
    /** Maximum number of targets that can receive different printable colors within the limit. */
    assignedDistinctColorCount: number;
    /** Distinct, within-limit printable colors actually used by the final target mappings. */
    uniquelyPreservedWithinThresholdCount: number;
    /** Internal hard-constraint deficit retained for optimizer scoring and legacy benchmarks. */
    unacceptableColorCount: number;
    /** Final target mappings, including fallbacks, whose raw color error is within the limit. */
    mappedWithinThresholdCount: number;
    /** Final target mappings, including fallbacks, whose raw color error exceeds the limit. */
    overThresholdColorCount: number;
    /** Target colors for which no printable mapping exists at all. */
    unmappedColorCount: number;
    /** Final target mappings beyond the first use of each distinct printable color. */
    reusedPrintableColorCount: number;
    /** Worst raw color error across every final target mapping, including fallbacks. */
    maximumDeltaE: number;
    /** Worst raw color error among the uniquely preserved mappings only. */
    maximumPreservedDeltaE: number;
    /** Total normalized image weight owned by uniquely preserved source colors. */
    preservedTargetWeight: number;
    /** Weighted mean error among uniquely preserved source colors. */
    preservedWeightedMeanDeltaE: number;
    /** Source colors merged into the surviving printable mappings. */
    mergedColorCount: number;
    maximumAllowedDeltaE: number;
    satisfied: boolean;
}

export interface ColorSeparationMapping {
    mappedTargets: MappedTarget[];
    report: ColorSeparationReport;
}

interface DistinctPrintableColor {
    lab: Lab;
    height: number;
    paletteIndex: number;
}

/**
 * Reusable scratch storage for the optimizer's hot scoring loop. Values
 * returned from a scoring call must be consumed before the workspace is reused.
 */
export interface SequenceScoringWorkspace {
    separation: {
        distinct: DistinctPrintableColor[];
        distances: number[][];
        uncertaintyPenalties: number[];
        acceptable: number[][];
        targetOrder: number[];
        candidateTarget: Int32Array;
        visitedGeneration: Uint32Array;
        assignment: number[];
        mappedTargets: MappedTarget[];
        assignedDistinct: Set<number>;
    };
    errorSamples: Array<{ value: number; weight: number }>;
    bestMatchHeightKeys: Set<number>;
    usedPaletteEntries: Set<number>;
}

export function createSequenceScoringWorkspace(): SequenceScoringWorkspace {
    return {
        separation: {
            distinct: [],
            distances: [],
            uncertaintyPenalties: [],
            acceptable: [],
            targetOrder: [],
            candidateTarget: new Int32Array(0),
            visitedGeneration: new Uint32Array(0),
            assignment: [],
            mappedTargets: [],
            assignedDistinct: new Set<number>(),
        },
        errorSamples: [],
        bestMatchHeightKeys: new Set<number>(),
        usedPaletteEntries: new Set<number>(),
    };
}

/**
 * Map each weighted image target onto the printable palette exactly the way the
 * 3D preview does, so the optimizer scores the colors the model actually shows.
 *
 * The preview collapses consecutive same-color layers into flat-zone nodes and
 * projects each pixel onto that node/transition polyline. Scoring against the
 * raw per-layer polyline instead let the optimizer land a target on a one-layer
 * transition sliver — a color no pixel is ever assigned — and optimize that
 * fiction. Mirroring the collapse keeps the objective and the build consistent.
 */
/** Minimum ΔE between two printable colors for them to count as "distinct". */
const SEPARATION_MIN_DE = 2;
export const MIN_SEPARATION_MAX_DELTA_E = 1;
export const MAX_SEPARATION_MAX_DELTA_E = 100;
/** Default hard fidelity boundary for a separated printable color. */
export const SEPARATION_MAX_DELTA_E = 6;
export function normalizeSeparationMaxDeltaE(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number.NaN;
    if (!Number.isFinite(numeric)) return SEPARATION_MAX_DELTA_E;
    return Math.max(
        MIN_SEPARATION_MAX_DELTA_E,
        Math.min(MAX_SEPARATION_MAX_DELTA_E, Math.round(numeric * 10) / 10)
    );
}
export const EXACT_ANCHOR_TARGET_DE = 0.25;
// Large enough that a sequence cannot beat a physically verified recipe merely
// by landing an unverified prefix on the same simulated Lab coordinate.
const MISSING_EXACT_ANCHOR_PENALTY = 20;
/** Maximum ΔE-equivalent cost added for a wholly uncertain predicted color. */
export const PREDICTION_UNCERTAINTY_PENALTY = 5;

function predictionConfidenceValue(entry: AchievableColor): number {
    // Legacy/manual palettes without diagnostics retain their historical score.
    return Math.max(0, Math.min(1, entry.predictionConfidence?.confidence ?? 1));
}

function exactAnchorMapping(palette: AchievableColor[], target: WeightedLab): MappedTarget | null {
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (let index = 0; index < palette.length; index++) {
        const anchorTarget = palette[index].exactAnchorTargetLab;
        if (!anchorTarget) continue;
        const distance = optimizerColorDistance(anchorTarget, target);
        if (
            distance <= EXACT_ANCHOR_TARGET_DE &&
            (distance < bestDistance || (distance === bestDistance && index < bestIndex))
        ) {
            bestIndex = index;
            bestDistance = distance;
        }
    }
    if (bestIndex < 0) return null;
    return {
        target,
        paletteIndex: bestIndex,
        mappedLab: palette[bestIndex].lab,
        projectedHeight: palette[bestIndex].height,
    };
}

/**
 * Rectangular Hungarian assignment. Rows are targets and columns are distinct
 * printable colors (plus dummy columns when there are too few colors). Keeping
 * this deterministic is important because optimizer goldens and cache entries
 * depend on stable tie-breaking.
 */
function minimumCostAssignment(costs: readonly (readonly number[])[]): number[] {
    const rowCount = costs.length;
    if (rowCount === 0) return [];
    const columnCount = costs[0]?.length ?? 0;
    if (columnCount < rowCount) {
        throw new Error('Color assignment requires at least as many columns as rows');
    }

    const rowPotential = new Float64Array(rowCount + 1);
    const columnPotential = new Float64Array(columnCount + 1);
    const matchedRow = new Int32Array(columnCount + 1);
    const previousColumn = new Int32Array(columnCount + 1);

    for (let row = 1; row <= rowCount; row++) {
        matchedRow[0] = row;
        let currentColumn = 0;
        const minimum = new Float64Array(columnCount + 1);
        minimum.fill(Infinity);
        const used = new Uint8Array(columnCount + 1);

        do {
            used[currentColumn] = 1;
            const currentRow = matchedRow[currentColumn];
            let delta = Infinity;
            let nextColumn = 0;
            for (let column = 1; column <= columnCount; column++) {
                if (used[column]) continue;
                const reducedCost =
                    costs[currentRow - 1][column - 1] -
                    rowPotential[currentRow] -
                    columnPotential[column];
                if (reducedCost < minimum[column] - 1e-12) {
                    minimum[column] = reducedCost;
                    previousColumn[column] = currentColumn;
                }
                if (
                    minimum[column] < delta - 1e-12 ||
                    (Math.abs(minimum[column] - delta) <= 1e-12 && column < nextColumn)
                ) {
                    delta = minimum[column];
                    nextColumn = column;
                }
            }
            for (let column = 0; column <= columnCount; column++) {
                if (used[column]) {
                    rowPotential[matchedRow[column]] += delta;
                    columnPotential[column] -= delta;
                } else {
                    minimum[column] -= delta;
                }
            }
            currentColumn = nextColumn;
        } while (matchedRow[currentColumn] !== 0);

        do {
            const previous = previousColumn[currentColumn];
            matchedRow[currentColumn] = matchedRow[previous];
            currentColumn = previous;
        } while (currentColumn !== 0);
    }

    const assignment = new Array<number>(rowCount).fill(-1);
    for (let column = 1; column <= columnCount; column++) {
        const row = matchedRow[column];
        if (row > 0) assignment[row - 1] = column - 1;
    }
    return assignment;
}

/**
 * Find the largest target-to-candidate matching whose every edge is inside the
 * hard separation boundary. Most optimizer candidates are infeasible; this
 * sparse check avoids paying for a full cubic cost assignment just to reject
 * them. Descending source weight makes the ordinary augmenting-path algorithm
 * choose the maximum-weight basis among maximum-cardinality matchings (the
 * matchable target sets form a transversal matroid).
 */
function maximumAcceptableMatching(
    distances: readonly (readonly number[])[],
    maximumDeltaE: number,
    uncertaintyPenalties: readonly number[],
    targets: readonly Pick<WeightedLab, 'weight'>[],
    workspace?: SequenceScoringWorkspace['separation']
): number[] {
    const targetCount = distances.length;
    const candidateCount = distances[0]?.length ?? 0;
    const acceptable = workspace?.acceptable ?? [];
    while (acceptable.length < targetCount) acceptable.push([]);
    acceptable.length = targetCount;
    for (let target = 0; target < targetCount; target++) {
        const row = distances[target];
        const candidates = acceptable[target];
        candidates.length = 0;
        for (let candidate = 0; candidate < row.length; candidate++) {
            if (row[candidate] <= maximumDeltaE) candidates.push(candidate);
        }
        candidates.sort(
            (left, right) =>
                row[left] +
                    uncertaintyPenalties[left] -
                    (row[right] + uncertaintyPenalties[right]) ||
                row[left] - row[right] ||
                left - right
        );
    }
    const targetOrder = workspace?.targetOrder ?? [];
    targetOrder.length = targetCount;
    for (let target = 0; target < targetCount; target++) targetOrder[target] = target;
    targetOrder.sort(
        (left, right) =>
            targets[right].weight - targets[left].weight ||
            acceptable[left].length - acceptable[right].length ||
            left - right
    );
    let candidateTarget = workspace?.candidateTarget ?? new Int32Array(candidateCount);
    let visitedGeneration = workspace?.visitedGeneration ?? new Uint32Array(candidateCount);
    if (candidateTarget.length < candidateCount) {
        candidateTarget = new Int32Array(candidateCount);
        if (workspace) workspace.candidateTarget = candidateTarget;
    }
    if (visitedGeneration.length < candidateCount) {
        visitedGeneration = new Uint32Array(candidateCount);
        if (workspace) workspace.visitedGeneration = visitedGeneration;
    }
    candidateTarget.fill(-1, 0, candidateCount);
    visitedGeneration.fill(0, 0, candidateCount);
    let generation = 0;

    const augment = (target: number): boolean => {
        for (const candidate of acceptable[target]) {
            if (visitedGeneration[candidate] === generation) continue;
            visitedGeneration[candidate] = generation;
            const incumbent = candidateTarget[candidate];
            if (incumbent < 0 || augment(incumbent)) {
                candidateTarget[candidate] = target;
                return true;
            }
        }
        return false;
    };

    for (const target of targetOrder) {
        generation++;
        augment(target);
    }

    const assignment = workspace?.assignment ?? [];
    assignment.length = targetCount;
    assignment.fill(-1);
    for (let candidate = 0; candidate < candidateCount; candidate++) {
        const target = candidateTarget[candidate];
        if (target >= 0) assignment[target] = candidate;
    }
    return assignment;
}

/**
 * Globally assign source colors to distinct printable colors. Unlike the old
 * dominant-first greedy mapper, this considers every collision together and
 * treats an assignment outside the acceptable error boundary as unsatisfied.
 */
export function mapTargetsWithSeparation(
    palette: AchievableColor[],
    imageTargets: WeightedLab[],
    requestedMaximumDeltaE: number = SEPARATION_MAX_DELTA_E,
    workspace?: SequenceScoringWorkspace['separation']
): ColorSeparationMapping {
    const maximumAllowedDeltaE = normalizeSeparationMaxDeltaE(requestedMaximumDeltaE);
    if (imageTargets.length === 0) {
        return {
            mappedTargets: [],
            report: {
                requestedColorCount: 0,
                printableColorCount: 0,
                assignedDistinctColorCount: 0,
                uniquelyPreservedWithinThresholdCount: 0,
                unacceptableColorCount: 0,
                mappedWithinThresholdCount: 0,
                overThresholdColorCount: 0,
                unmappedColorCount: 0,
                reusedPrintableColorCount: 0,
                maximumDeltaE: 0,
                maximumPreservedDeltaE: 0,
                preservedTargetWeight: 0,
                preservedWeightedMeanDeltaE: 0,
                mergedColorCount: 0,
                maximumAllowedDeltaE,
                satisfied: true,
            },
        };
    }
    if (palette.length === 0) {
        return {
            mappedTargets: [],
            report: {
                requestedColorCount: imageTargets.length,
                printableColorCount: 0,
                assignedDistinctColorCount: 0,
                uniquelyPreservedWithinThresholdCount: 0,
                unacceptableColorCount: imageTargets.length,
                mappedWithinThresholdCount: 0,
                overThresholdColorCount: 0,
                unmappedColorCount: imageTargets.length,
                reusedPrintableColorCount: 0,
                maximumDeltaE: Infinity,
                maximumPreservedDeltaE: Infinity,
                preservedTargetWeight: 0,
                preservedWeightedMeanDeltaE: Infinity,
                mergedColorCount: 0,
                maximumAllowedDeltaE,
                satisfied: false,
            },
        };
    }

    // Distinct printable colors, keeping a representative entry for each.
    const distinct = workspace?.distinct ?? [];
    distinct.length = 0;
    for (let i = 0; i < palette.length; i++) {
        const entry = palette[i];
        const existingIndex = distinct.findIndex(
            (candidate) => optimizerColorDistance(candidate.lab, entry.lab) < SEPARATION_MIN_DE
        );
        if (existingIndex < 0) {
            distinct.push({ lab: entry.lab, height: entry.height, paletteIndex: i });
        } else if (
            (entry.exactAnchorId && !palette[distinct[existingIndex].paletteIndex].exactAnchorId) ||
            (Boolean(entry.exactAnchorId) ===
                Boolean(palette[distinct[existingIndex].paletteIndex].exactAnchorId) &&
                predictionConfidenceValue(entry) >
                    predictionConfidenceValue(palette[distinct[existingIndex].paletteIndex]))
        ) {
            distinct[existingIndex] = { lab: entry.lab, height: entry.height, paletteIndex: i };
        }
    }

    const distances = workspace?.distances ?? [];
    while (distances.length < imageTargets.length) distances.push([]);
    distances.length = imageTargets.length;
    for (let targetIndex = 0; targetIndex < imageTargets.length; targetIndex++) {
        const row = distances[targetIndex];
        row.length = distinct.length;
        const target = imageTargets[targetIndex];
        for (let candidate = 0; candidate < distinct.length; candidate++) {
            row[candidate] = optimizerColorDistance(distinct[candidate].lab, target);
        }
    }
    const uncertaintyPenalties = workspace?.uncertaintyPenalties ?? [];
    uncertaintyPenalties.length = distinct.length;
    for (let candidate = 0; candidate < distinct.length; candidate++) {
        uncertaintyPenalties[candidate] =
            (1 - predictionConfidenceValue(palette[distinct[candidate].paletteIndex])) *
            PREDICTION_UNCERTAINTY_PENALTY;
    }
    const acceptableAssignment = maximumAcceptableMatching(
        distances,
        maximumAllowedDeltaE,
        uncertaintyPenalties,
        imageTargets,
        workspace
    );
    const acceptableMatchCount = acceptableAssignment.reduce(
        (count, candidate) => count + (candidate >= 0 ? 1 : 0),
        0
    );
    const preservedTargetIndices = acceptableAssignment
        .map((candidate, targetIndex) => (candidate >= 0 ? targetIndex : -1))
        .filter((targetIndex) => targetIndex >= 0);
    const assignment = [...acceptableAssignment];

    // The sparse matcher establishes the maximum cardinality and which weighted
    // targets survive. Refine only that feasible subset globally so its unique
    // assignments minimize error without ever crossing the hard Delta E limit.
    if (preservedTargetIndices.length > 0) {
        const DISALLOWED_COST = 1_000_000_000;
        const costs = preservedTargetIndices.map((targetIndex) =>
            distinct.map((_, column) => {
                const deltaE = distances[targetIndex][column];
                if (deltaE > maximumAllowedDeltaE) return DISALLOWED_COST + column;
                return (
                    deltaE * Math.max(imageTargets[targetIndex].weight, Number.EPSILON) +
                    uncertaintyPenalties[column] * 1e-9 +
                    column * 1e-12
                );
            })
        );
        const refined = minimumCostAssignment(costs);
        for (let index = 0; index < preservedTargetIndices.length; index++) {
            const targetIndex = preservedTargetIndices[index];
            const candidateColumn = refined[index];
            if (
                candidateColumn >= 0 &&
                candidateColumn < distinct.length &&
                distances[targetIndex][candidateColumn] <= maximumAllowedDeltaE
            ) {
                assignment[targetIndex] = candidateColumn;
            }
        }
    }

    const preservedColumns = workspace?.assignedDistinct ?? new Set<number>();
    preservedColumns.clear();
    for (const candidateColumn of assignment) {
        if (candidateColumn >= 0) preservedColumns.add(candidateColumn);
    }

    const mappedTargets = workspace?.mappedTargets ?? [];
    mappedTargets.length = 0;
    let maximumDeltaE = 0;
    let maximumPreservedDeltaE = 0;
    let mappedWithinThresholdCount = 0;
    let preservedTargetWeight = 0;
    let preservedWeightedError = 0;

    for (let index = 0; index < imageTargets.length; index++) {
        const target = imageTargets[index];
        const preservedWithinThreshold = assignment[index] >= 0;
        let candidateColumn = assignment[index];
        if (!preservedWithinThreshold) {
            candidateColumn = -1;
            let nearestDistance = Infinity;
            for (const column of preservedColumns) {
                const distance = distances[index][column] + uncertaintyPenalties[column];
                if (
                    distance < nearestDistance ||
                    (distance === nearestDistance && column < candidateColumn)
                ) {
                    nearestDistance = distance;
                    candidateColumn = column;
                }
            }
        }
        if (candidateColumn < 0) continue;
        const candidate = distinct[candidateColumn];
        const deltaE = distances[index][candidateColumn];
        maximumDeltaE = Math.max(maximumDeltaE, deltaE);
        if (deltaE <= maximumAllowedDeltaE) mappedWithinThresholdCount++;
        if (preservedWithinThreshold) {
            maximumPreservedDeltaE = Math.max(maximumPreservedDeltaE, deltaE);
            preservedTargetWeight += target.weight;
            preservedWeightedError += deltaE * target.weight;
        }
        mappedTargets.push({
            target,
            paletteIndex: candidate.paletteIndex,
            mappedLab: candidate.lab,
            projectedHeight: candidate.height,
            preservedWithinThreshold,
        });
    }

    const unmatchedColorCount = imageTargets.length - acceptableMatchCount;
    const unmappedColorCount = preservedColumns.size === 0 ? imageTargets.length : 0;
    return {
        mappedTargets,
        report: {
            requestedColorCount: imageTargets.length,
            printableColorCount: distinct.length,
            assignedDistinctColorCount: acceptableMatchCount,
            uniquelyPreservedWithinThresholdCount: acceptableMatchCount,
            unacceptableColorCount: unmatchedColorCount,
            mappedWithinThresholdCount,
            overThresholdColorCount: mappedTargets.length - mappedWithinThresholdCount,
            unmappedColorCount,
            reusedPrintableColorCount: preservedColumns.size > 0 ? unmatchedColorCount : 0,
            maximumDeltaE: mappedTargets.length > 0 ? maximumDeltaE : Infinity,
            maximumPreservedDeltaE: acceptableMatchCount > 0 ? maximumPreservedDeltaE : Infinity,
            preservedTargetWeight,
            preservedWeightedMeanDeltaE:
                preservedTargetWeight > 0
                    ? preservedWeightedError / preservedTargetWeight
                    : Infinity,
            mergedColorCount: preservedColumns.size > 0 ? unmatchedColorCount : 0,
            maximumAllowedDeltaE,
            satisfied: acceptableMatchCount === imageTargets.length,
        },
    };
}

export function mapTargetsToPrintablePalette(
    palette: AchievableColor[],
    imageTargets: WeightedLab[],
    options: { preserveSeparation?: boolean; separationMaxDeltaE?: number } = {}
): MappedTarget[] {
    if (palette.length === 0) return [];

    // Separation mode: assign each distinct image color to a DISTINCT printable
    // color so perceptibly different colors never collapse to one flat surface.
    if (options.preserveSeparation) {
        return mapTargetsWithSeparation(palette, imageTargets, options.separationMaxDeltaE)
            .mappedTargets;
    }

    // Collapse consecutive near-identical layers into flat-zone nodes (ΔE<0.5),
    // matching ThreeDView. Each node keeps its height range and an averaged Lab.
    const COLLAPSE_DE_SQ = 0.25; // 0.5^2
    const nodes: Array<{ lab: Lab; minHeight: number; maxHeight: number; paletteIndex: number }> =
        [];
    let runStart = 0;
    for (let i = 1; i <= palette.length; i++) {
        let split = i === palette.length;
        if (!split) {
            const ref = palette[runStart].lab;
            const cur = palette[i].lab;
            const deSq = (cur.L - ref.L) ** 2 + (cur.a - ref.a) ** 2 + (cur.b - ref.b) ** 2;
            split = deSq >= COLLAPSE_DE_SQ;
        }
        if (split) {
            let sL = 0;
            let sa = 0;
            let sb = 0;
            for (let j = runStart; j < i; j++) {
                sL += palette[j].lab.L;
                sa += palette[j].lab.a;
                sb += palette[j].lab.b;
            }
            const n = i - runStart;
            let representativeIndex = runStart;
            for (let index = runStart + 1; index < i; index++) {
                const representative = palette[representativeIndex];
                const candidate = palette[index];
                if (
                    (candidate.exactAnchorId && !representative.exactAnchorId) ||
                    (Boolean(candidate.exactAnchorId) === Boolean(representative.exactAnchorId) &&
                        predictionConfidenceValue(candidate) >
                            predictionConfidenceValue(representative))
                ) {
                    representativeIndex = index;
                }
            }
            nodes.push({
                lab: { L: sL / n, a: sa / n, b: sb / n },
                minHeight: palette[runStart].height,
                maxHeight: palette[i - 1].height,
                paletteIndex: representativeIndex,
            });
            runStart = i;
        }
    }

    // Transition segments connect the end of one flat zone to the start of the
    // next, tracing the blend path through the printable layers between them.
    const segments = nodes.slice(0, -1).map((A, ni) => {
        const B = nodes[ni + 1];
        return {
            aL: A.lab.L,
            aa: A.lab.a,
            ab: A.lab.b,
            dL: B.lab.L - A.lab.L,
            da: B.lab.a - A.lab.a,
            db: B.lab.b - A.lab.b,
            hStart: A.maxHeight,
            hEnd: B.minHeight,
        };
    });

    // Printable palettes are height-ordered. Resolve the first physical layer
    // at or above a projected height with a binary search instead of scanning
    // the full palette once for every target/transition pair. Keep the linear
    // fallback for callers that provide a legacy or synthetic unordered palette.
    const heightsAreOrdered = palette.every(
        (entry, index) => index === 0 || palette[index - 1].height <= entry.height
    );
    const hasExactAnchors = palette.some((entry) => entry.exactAnchorTargetLab !== undefined);
    const paletteIndexAtOrAboveHeight = (height: number): number => {
        if (!heightsAreOrdered) {
            const index = palette.findIndex((entry) => entry.height >= height);
            return index >= 0 ? index : palette.length - 1;
        }
        let low = 0;
        let high = palette.length;
        while (low < high) {
            const middle = low + ((high - low) >> 1);
            if (palette[middle].height >= height) high = middle;
            else low = middle + 1;
        }
        return low < palette.length ? low : palette.length - 1;
    };

    return imageTargets.map((target) => {
        if (hasExactAnchors) {
            const anchored = exactAnchorMapping(palette, target);
            if (anchored) return anchored;
        }
        let minimumSelectionCost = Infinity;
        let nodeMatch = 0;
        let onSegment = false;
        let segmentHeight = nodes[0].minHeight;
        const projectedLab: Lab = { L: 0, a: 0, b: 0 };

        // Nearest flat-zone node by color.
        for (let ni = 0; ni < nodes.length; ni++) {
            const selectionCost =
                optimizerColorDistance(nodes[ni].lab, target) +
                (1 - predictionConfidenceValue(palette[nodes[ni].paletteIndex])) *
                    PREDICTION_UNCERTAINTY_PENALTY;
            if (selectionCost < minimumSelectionCost) {
                minimumSelectionCost = selectionCost;
                nodeMatch = ni;
                onSegment = false;
            }
        }

        // Refine against the closest point on each transition segment.
        for (const seg of segments) {
            const lengthSquared = seg.dL * seg.dL + seg.da * seg.da + seg.db * seg.db;
            if (lengthSquared < 0.01) continue;
            const t = Math.max(
                0,
                Math.min(
                    1,
                    ((target.L - seg.aL) * seg.dL +
                        (target.a - seg.aa) * seg.da +
                        (target.b - seg.ab) * seg.db) /
                        lengthSquared
                )
            );
            projectedLab.L = seg.aL + t * seg.dL;
            projectedLab.a = seg.aa + t * seg.da;
            projectedLab.b = seg.ab + t * seg.db;
            const projectedDistance = optimizerColorDistance(target, projectedLab);
            const projectedHeight = seg.hStart + t * (seg.hEnd - seg.hStart);
            const paletteIndex = paletteIndexAtOrAboveHeight(projectedHeight);
            const selectionCost =
                projectedDistance +
                (1 - predictionConfidenceValue(palette[paletteIndex])) *
                    PREDICTION_UNCERTAINTY_PENALTY;
            if (selectionCost < minimumSelectionCost) {
                minimumSelectionCost = selectionCost;
                onSegment = true;
                segmentHeight = projectedHeight;
            }
        }

        if (!onSegment) {
            // Flat-zone match: the printed surface is this filament's solid
            // color across the whole zone (sub-position within it is relief).
            const node = nodes[nodeMatch];
            return {
                target,
                paletteIndex: node.paletteIndex,
                mappedLab: node.lab,
                projectedHeight: (node.minHeight + node.maxHeight) / 2,
            };
        }

        // Transition match: the printed color is the layer at that height.
        const paletteIndex = paletteIndexAtOrAboveHeight(segmentHeight);
        return {
            target,
            paletteIndex,
            mappedLab: palette[paletteIndex].lab,
            projectedHeight: segmentHeight,
        };
    });
}

/**
 * Weighted percentile over realized-error samples: the smallest sample value
 * whose cumulative weight reaches `quantile` of the total weight.
 */
export function weightedErrorPercentile(
    samples: Array<{ value: number; weight: number }>,
    quantile: number
): number {
    if (samples.length === 0) return 0;
    const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
    if (totalWeight <= 0) return 0;

    const ordered = [...samples].sort((left, right) => left.value - right.value);
    return weightedErrorPercentileFromOrdered(ordered, quantile, totalWeight);
}

function weightedErrorPercentileFromOrdered(
    ordered: Array<{ value: number; weight: number }>,
    quantile: number,
    totalWeight: number
): number {
    const threshold = totalWeight * quantile;
    let cumulative = 0;
    for (const sample of ordered) {
        cumulative += sample.weight;
        if (cumulative >= threshold) return sample.value;
    }
    return ordered[ordered.length - 1].value;
}

/** Scoring owns its sample array, so it can avoid an extra copy before sorting. */
function weightedErrorPercentileInPlace(
    samples: Array<{ value: number; weight: number }>,
    quantile: number,
    totalWeight: number
): number {
    samples.sort((left, right) => left.value - right.value);
    return weightedErrorPercentileFromOrdered(samples, quantile, totalWeight);
}

/** Weight applied to the weighted-p95 realized-error tail in the objective. */
const REALIZED_ERROR_TAIL_WEIGHT = 0.5;
/** Percentile used for the realized-error tail term. */
const REALIZED_ERROR_TAIL_PERCENTILE = 0.95;
/** Detail coverage: targets within this realized error are treated as retained. */
const DETAIL_COVERAGE_DE = 6;
/** Prefer stacks that retain more weighted source-color detail. */
const DETAIL_COVERAGE_PENALTY = 8;
/** A printable palette entry counts as "used" if a target lands within this ΔE00. */
const USEFUL_PALETTE_MATCH_DE = 8;
/** Keep local proof preferences meaningful without overwhelming measured color error. */
const LOCAL_APPEARANCE_PREFERENCE_WEIGHT = 6;
/** Palette Proof comparisons only influence nearby target colors. */
const LOCAL_APPEARANCE_TARGET_SIGMA = 12;

function localAppearancePreference(entry: AchievableColor, target: Lab): number {
    if (!entry.localPreferences?.length) return 0;
    let signed = 0;
    let influence = 0;
    for (const preference of entry.localPreferences) {
        const distance = optimizerColorDistance(preference.targetLab, target);
        const locality = Math.exp(-0.5 * (distance / LOCAL_APPEARANCE_TARGET_SIGMA) ** 2);
        const weight = preference.confidence * locality;
        signed += preference.preference * weight;
        influence += weight;
    }
    if (influence <= 0) return 0;
    // Repeated agreeing neighborhoods reinforce each other, but the bounded
    // signal cannot dominate actual CIEDE2000 error or exact-anchor constraints.
    return Math.max(-1, Math.min(1, signed));
}

/**
 * Score a filament sequence against weighted image target colors.
 *
 * The score combines:
 * 1. Preview-realized color accuracy — project each target onto the printable
 *    Lab path, snap to the layer the preview renders, and measure the visible
 *    error in CIEDE2000. The objective uses the weighted mean plus a weighted
 *    p95 tail, so a few rare but conspicuous colors cannot be abandoned to
 *    lower the average. Dominant image colors carry more weight.
 * 2. Prediction uncertainty — penalizes colors far from measurements,
 *    unsupported by agreeing neighbors, or weak under cross-validation.
 * 3. Height spread — penalizes when distinct image colors collapse to
 *    the same height (leading to flat surfaces).
 * 4. Total layer count — penalizes the raw number of layers in the palette.
 *    This punishes sequences with expensive transitions between dissimilar
 *    colors (e.g., yellow→purple takes many layers to transition, vs
 *    yellow→orange which is quick). More layers = taller model.
 * 5. Transition waste — penalizes palette layers that don't closely match
 *    any target color. These are "wasted" intermediate layers that exist
 *    only as transitions and contribute no useful color to the image.
 */
export interface SequenceScoreEvaluation {
    score: number;
    /** Total printable layers in the simulated candidate. */
    printableLayerCount: number;
    /** Total filament occurrences in the candidate sequence. */
    filamentOccurrenceCount?: number;
    /** Layers at or below the highest uniquely preserved mapping. */
    usedPrintableLayerCount?: number;
    /** Filament occurrences at or below the highest uniquely preserved mapping. */
    usedFilamentOccurrenceCount?: number;
    /** Repeated occurrences within the physically used prefix. */
    usedExtraRepeatCount?: number;
    /** Highest uniquely preserved printable surface. */
    usedHeight?: number;
    separation?: ColorSeparationReport;
}

export function evaluateSequenceAgainstImage(
    palette: AchievableColor[],
    imageTargets: WeightedLab[],
    options: {
        preserveSeparation?: boolean;
        separationMaxDeltaE?: number;
        exactAnchorTargets?: readonly Lab[];
        exactAnchorTargetSet?: ReadonlySet<WeightedLab>;
        workspace?: SequenceScoringWorkspace;
    } = {}
): SequenceScoreEvaluation {
    if (palette.length === 0 || imageTargets.length === 0) {
        return { score: Infinity, printableLayerCount: palette.length };
    }

    const separation = options.preserveSeparation
        ? mapTargetsWithSeparation(
              palette,
              imageTargets,
              options.separationMaxDeltaE,
              options.workspace?.separation
          )
        : undefined;
    const mapped =
        separation?.mappedTargets ?? mapTargetsToPrintablePalette(palette, imageTargets, options);

    const physicallyUsedMappings = separation
        ? mapped.filter((entry) => entry.preservedWithinThreshold === true)
        : mapped;
    const highestUsedPaletteIndex = physicallyUsedMappings.reduce(
        (highest, entry) => Math.max(highest, entry.paletteIndex),
        -1
    );
    const usedPrintableLayerCount =
        highestUsedPaletteIndex >= 0 ? highestUsedPaletteIndex + 1 : palette.length;
    const highestUsedEntry = palette[highestUsedPaletteIndex];
    const usedFilamentOccurrenceCount =
        highestUsedEntry?.zoneIndex !== undefined
            ? highestUsedEntry.zoneIndex + 1
            : physicallyUsedMappings.length > 0
              ? undefined
              : 0;
    let usedExtraRepeatCount: number | undefined;
    if (usedFilamentOccurrenceCount !== undefined && usedFilamentOccurrenceCount > 0) {
        const usedFilamentIds = new Map<number, string>();
        for (let index = 0; index <= highestUsedPaletteIndex; index++) {
            const entry = palette[index];
            if (entry.zoneIndex !== undefined && entry.filamentId !== undefined) {
                usedFilamentIds.set(entry.zoneIndex, entry.filamentId);
            }
        }
        usedExtraRepeatCount = usedFilamentOccurrenceCount - new Set(usedFilamentIds.values()).size;
    }
    const physicalUsage = {
        usedPrintableLayerCount,
        ...(usedFilamentOccurrenceCount !== undefined ? { usedFilamentOccurrenceCount } : {}),
        ...(usedExtraRepeatCount !== undefined ? { usedExtraRepeatCount } : {}),
        ...(highestUsedEntry ? { usedHeight: highestUsedEntry.height } : {}),
    };

    // 1. Weighted realized color error (CIEDE2000), with a p95 tail term so a
    //    few rare conspicuous colors cannot be sacrificed to lower the mean.
    let weightedErrorSum = 0;
    let totalWeight = 0;
    const errorSamples = options.workspace?.errorSamples ?? [];
    errorSamples.length = 0;
    const bestMatchHeightKeys = options.workspace?.bestMatchHeightKeys ?? new Set<number>();
    bestMatchHeightKeys.clear();
    const usedPaletteEntries = options.workspace?.usedPaletteEntries ?? new Set<number>();
    usedPaletteEntries.clear();
    let detailCoveredWeight = 0;
    let missingExactAnchorWeight = 0;
    let localPreferenceSum = 0;
    let weightedUncertaintySum = 0;

    for (const entry of mapped) {
        const realizedDeltaE = realizedColorError(entry.mappedLab, entry.target);
        const weight = entry.target.weight;
        weightedErrorSum += realizedDeltaE * weight;
        totalWeight += weight;
        errorSamples.push({ value: realizedDeltaE, weight });
        bestMatchHeightKeys.add(Math.round(entry.projectedHeight * 100));
        if (realizedDeltaE <= DETAIL_COVERAGE_DE) detailCoveredWeight += weight;
        // Mark this palette entry as useful if its printable color is a decent match.
        if (realizedDeltaE < USEFUL_PALETTE_MATCH_DE) usedPaletteEntries.add(entry.paletteIndex);
        const expectedAnchor = options.exactAnchorTargetSet
            ? options.exactAnchorTargetSet.has(entry.target)
            : options.exactAnchorTargets?.some(
                  (target) => optimizerColorDistance(target, entry.target) <= EXACT_ANCHOR_TARGET_DE
              );
        const realizedAnchor = palette[entry.paletteIndex].exactAnchorTargetLab;
        if (
            expectedAnchor &&
            (!realizedAnchor ||
                optimizerColorDistance(realizedAnchor, entry.target) > EXACT_ANCHOR_TARGET_DE)
        ) {
            missingExactAnchorWeight += weight;
        }
        localPreferenceSum +=
            localAppearancePreference(palette[entry.paletteIndex], entry.target) * weight;
        weightedUncertaintySum +=
            (1 - predictionConfidenceValue(palette[entry.paletteIndex])) * weight;
    }

    if (totalWeight <= 0) {
        return {
            score: Infinity,
            printableLayerCount: palette.length,
            ...physicalUsage,
            separation: separation?.report,
        };
    }

    const weightedMean = weightedErrorSum / totalWeight;
    const weightedTail = weightedErrorPercentileInPlace(
        errorSamples,
        REALIZED_ERROR_TAIL_PERCENTILE,
        totalWeight
    );
    let score = weightedMean + REALIZED_ERROR_TAIL_WEIGHT * weightedTail;
    score += (1 - detailCoveredWeight / totalWeight) * DETAIL_COVERAGE_PENALTY;
    score += (missingExactAnchorWeight / totalWeight) * MISSING_EXACT_ANCHOR_PENALTY;
    score += (localPreferenceSum / totalWeight) * LOCAL_APPEARANCE_PREFERENCE_WEIGHT;
    score += (weightedUncertaintySum / totalWeight) * PREDICTION_UNCERTAINTY_PENALTY;

    if (separation && !separation.report.satisfied) {
        const missingDistinct =
            separation.report.requestedColorCount - separation.report.assignedDistinctColorCount;
        const excessError = Math.max(
            0,
            separation.report.maximumDeltaE - separation.report.maximumAllowedDeltaE
        );
        // Keep a scalar energy for simulated-annealing exploration and legacy
        // score reporting. Final candidate ordering uses the explicit
        // lexicographic comparator in optimizer.ts.
        score +=
            missingDistinct * 10_000_000 +
            separation.report.unacceptableColorCount * 1_000_000 +
            excessError * 10_000;
    }

    // 3. Height spread penalty: penalize when distinct image colors
    //    collapse to the same height (leading to flat surfaces).
    if (mapped.length > 1 && palette.length > 1) {
        const totalModelHeight = palette[palette.length - 1].height - palette[0].height;
        if (totalModelHeight > 0) {
            const spreadRatio = bestMatchHeightKeys.size / imageTargets.length;
            score += 1 - spreadRatio;
        }
    }

    // 4. Total layer count penalty: raw palette size reflects actual model height.
    //    A sequence with expensive transitions (dissimilar hues) produces many
    //    layers; smooth transitions (similar hues) produce few.
    //    This is deliberately small so color accuracy remains the deciding factor.
    score += palette.length * 0.005;

    // 5. Transition waste penalty: palette entries not matched by any target.
    //    If a printable palette entry is not the best match for any image target,
    //    the transition height that produced it is wasted model space.
    if (palette.length > 1) {
        const wastedEntries = palette.length - usedPaletteEntries.size;
        score += wastedEntries * 0.015;
    }

    return {
        score,
        printableLayerCount: palette.length,
        ...physicalUsage,
        separation: separation?.report,
    };
}

export function scoreSequenceAgainstImage(
    palette: AchievableColor[],
    imageTargets: WeightedLab[],
    options: {
        preserveSeparation?: boolean;
        separationMaxDeltaE?: number;
        exactAnchorTargets?: readonly Lab[];
        exactAnchorTargetSet?: ReadonlySet<WeightedLab>;
        workspace?: SequenceScoringWorkspace;
    } = {}
): number {
    return evaluateSequenceAgainstImage(palette, imageTargets, options).score;
}

/**
 * Find the best filament ordering for the image colors.
 *
 * Uses the variable-length optimizer for every enhanced-color run. It may
 * omit unhelpful filaments and, when enabled, repeat a filament to create
 * a useful extra color transition.
 *
 * @returns Optimal filament ordering (may be a subset of the input) and optimizer result
 */
function findBestFilamentOrder(
    filaments: Filament[],
    imageSwatches: AutoPaintImageSwatch[],
    layerHeight: number,
    firstLayerHeight: number,
    optimizerOptions?: Partial<OptimizerOptions>,
    maxHeight?: number,
    allowRepeatedSwaps: boolean = false,
    appearanceModel?: AppearanceRankModelV1
): { sortedFilaments: Filament[]; result?: OptimizerResult } {
    if (filaments.length <= 1) {
        return { sortedFilaments: [...filaments] };
    }

    return findBestFilamentOrderWithOptimizer(
        filaments,
        imageSwatches,
        layerHeight,
        firstLayerHeight,
        optimizerOptions ?? {},
        maxHeight,
        allowRepeatedSwaps,
        appearanceModel
    );
}

/**
 * Advanced optimizer path using the shared variable-length sequence search.
 */
/**
 * Convert the already-processed 2D palette into weighted optimizer targets
 * without applying another palette-reduction pass.
 */
export function buildOptimizerImageTargets(imageSwatches: AutoPaintImageSwatch[]): WeightedLab[] {
    const totalWeight = imageSwatches.reduce(
        (total, swatch) => total + Math.max(0, swatch.count ?? 1),
        0
    );

    return imageSwatches
        .map((swatch) => ({
            ...rgbToLab(hexToRgb(swatch.hex)),
            weight: Math.max(0, swatch.count ?? 1) / Math.max(1, totalWeight),
        }))
        .filter((target) => target.weight > 0);
}

function findBestFilamentOrderWithOptimizer(
    filaments: Filament[],
    imageSwatches: AutoPaintImageSwatch[],
    layerHeight: number,
    firstLayerHeight: number,
    optimizerOptions: Partial<OptimizerOptions>,
    maxHeight?: number,
    allowRepeatedSwaps: boolean = false,
    appearanceModel?: AppearanceRankModelV1
): { sortedFilaments: Filament[]; result: OptimizerResult } {
    const imageTargets = buildOptimizerImageTargets(imageSwatches);

    // Build scoring context
    const context: ScoringContext = {
        imageColors: imageTargets,
        layerHeight,
        firstLayerHeight,
        maxHeight,
        transitionOpacity: optimizerOptions.transitionOpacity,
        appearanceModel,
    };

    // Run optimizer (tds are hiding distances; no scaling needed)
    const result = optimizeFilamentOrder(filaments, context, {
        ...optimizerOptions,
        allowRepeatedSwaps,
    });

    const sortedFilaments = result.order
        .map((sf) => filaments.find((f) => f.id === sf.id))
        .filter((f): f is Filament => f !== undefined);

    return { sortedFilaments, result };
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
 * @param optimizerOptions - Advanced optimizer settings (algorithm and seeding)
 * @returns Generated layer segments with zone information
 */
export function generateAutoLayers(
    filaments: Filament[],
    imageSwatches: AutoPaintImageSwatch[],
    layerHeight: number,
    firstLayerHeight: number,
    maxHeight?: number,
    enhancedColorMatch?: boolean,
    allowRepeatedSwaps?: boolean,
    optimizerOptions?: Partial<OptimizerOptions>,
    appearanceModel: AppearanceRankModelV1 = createIdentityAppearanceRankModel()
): AutoPaintResult {
    // --- STEP 1: VALIDATION ---
    if (filaments.length === 0) {
        const finalStack = buildFinalPrintableStackSnapshot(
            { layers: [], zones: [], totalHeight: 0, truncated: false },
            imageSwatches,
            {
                layerHeight,
                firstLayerHeight,
                requestedMaxHeight: maxHeight,
                printableMaxHeight: 0,
                transitionOpacity: optimizerOptions?.transitionOpacity,
                compressionRatio: 1,
                preserveSeparation: optimizerOptions?.preserveSeparation,
                separationMaxDeltaE: optimizerOptions?.separationMaxDeltaE,
                failOnSeparationError: optimizerOptions?.failOnSeparationError,
                appearanceModel,
            }
        );
        return {
            layers: [],
            totalHeight: 0,
            idealHeight: 0,
            autoHeight: 0,
            compressionRatio: 1,
            filamentOrder: [],
            transitionZones: [],
            finalStack,
            confidence: 0,
            confidenceFactors: {
                calibrationQuality: 0,
                filamentCoverage: 0,
                compressionImpact: 1,
            },
        };
    }

    if (imageSwatches.length === 0) {
        const finalStack = buildFinalPrintableStackSnapshot(
            { layers: [], zones: [], totalHeight: 0, truncated: false },
            imageSwatches,
            {
                layerHeight,
                firstLayerHeight,
                requestedMaxHeight: maxHeight,
                printableMaxHeight: 0,
                transitionOpacity: optimizerOptions?.transitionOpacity,
                compressionRatio: 1,
                preserveSeparation: optimizerOptions?.preserveSeparation,
                separationMaxDeltaE: optimizerOptions?.separationMaxDeltaE,
                failOnSeparationError: optimizerOptions?.failOnSeparationError,
                appearanceModel,
            }
        );
        return {
            layers: [],
            totalHeight: 0,
            idealHeight: 0,
            autoHeight: 0,
            compressionRatio: 1,
            filamentOrder: [],
            transitionZones: [],
            finalStack,
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

    if (enhancedColorMatch) {
        // Enhanced: find the ordering that best covers the image's color palette
        const orderingResult = findBestFilamentOrder(
            filaments,
            imageSwatches,
            layerHeight,
            firstLayerHeight,
            optimizerOptions,
            maxHeight,
            allowRepeatedSwaps,
            appearanceModel
        );

        sortedFilaments = orderingResult.sortedFilaments;
        optimizerResult = orderingResult.result;
    } else {
        // Standard: sort by luminance (dark to light)
        sortedFilaments = [...filaments].sort((a, b) => {
            const effectiveA = resolveEffectiveFilamentOptics(appearanceModel.effectiveOptics, a);
            const effectiveB = resolveEffectiveFilamentOptics(appearanceModel.effectiveOptics, b);
            const lumA = getLuminance({
                r: effectiveA.color[0],
                g: effectiveA.color[1],
                b: effectiveA.color[2],
            });
            const lumB = getLuminance({
                r: effectiveB.color[0],
                g: effectiveB.color[1],
                b: effectiveB.color[2],
            });
            return lumA - lumB;
        });
    }

    // --- STEP 3: CALCULATE IDEAL HEIGHT WITH TRANSITION ZONES ---
    const { idealHeight, zones } = calculateIdealHeight(
        sortedFilaments,
        layerHeight,
        Math.max(firstLayerHeight, layerHeight),
        undefined,
        optimizerOptions?.transitionOpacity,
        appearanceModel
    );

    // --- STEP 4: APPLY COMPRESSION ON THE PRINTABLE HEIGHT GRID ---
    // Keep the continuous optical ideal for diagnostics, but expose and build
    // a layer-aligned auto height so every consumer sees a real print stack.
    const autoHeight = ceilAutoPaintHeightToPrintableStack(
        idealHeight,
        layerHeight,
        firstLayerHeight
    );
    const targetMaxHeight =
        maxHeight === undefined
            ? autoHeight
            : floorAutoPaintHeightToPrintableStack(maxHeight, layerHeight, firstLayerHeight);
    const { compressedZones, compressionRatio } = compressZones(zones, targetMaxHeight);

    // --- STEP 5: BUILD THE ACTUAL PRINTABLE STACK ---
    const printableStack = trimPrintableAutoPaintStack(
        buildPrintableAutoPaintStack(compressedZones, layerHeight, firstLayerHeight),
        optimizerOptions?.preserveSeparation ? optimizerResult?.usedHeight : undefined
    );
    const layers: AutoPaintLayer[] = printableStack.zones.map((zone) => ({
        filamentId: zone.filamentId,
        filamentColor: zone.filamentColor,
        startHeight: zone.startHeight,
        endHeight: zone.endHeight,
    }));
    const filamentOrder = printableStack.zones.map((zone) => zone.filamentId);
    const printedFilaments = filamentOrder
        .map((id) => filaments.find((filament) => filament.id === id))
        .filter((filament): filament is Filament => filament !== undefined);

    // --- STEP 6: CALCULATE CONFIDENCE METRICS ---
    const confidence = calculateAutoConfidence(imageSwatches, printedFilaments, compressionRatio);
    const finalStack = buildFinalPrintableStackSnapshot(printableStack, imageSwatches, {
        layerHeight,
        firstLayerHeight,
        requestedMaxHeight: maxHeight,
        printableMaxHeight: targetMaxHeight,
        transitionOpacity: optimizerOptions?.transitionOpacity,
        compressionRatio,
        preserveSeparation: optimizerOptions?.preserveSeparation,
        separationMaxDeltaE: optimizerOptions?.separationMaxDeltaE,
        failOnSeparationError: optimizerOptions?.failOnSeparationError,
        appearanceModel,
    });
    let colorSeparation: ColorSeparationReport | undefined;
    if (optimizerOptions?.preserveSeparation) {
        const sourceTargets = buildOptimizerImageTargets(imageSwatches);
        const palette = finalStack.palette.map((entry) => ({
            height: entry.height,
            lab: {
                L: entry.predictedLab[0],
                a: entry.predictedLab[1],
                b: entry.predictedLab[2],
            },
            rgb: {
                r: entry.predictedColor.rgb[0],
                g: entry.predictedColor.rgb[1],
                b: entry.predictedColor.rgb[2],
            },
            exactAnchorId: entry.exactAnchorId,
            exactAnchorTargetLab: entry.exactAnchorTargetLab
                ? {
                      L: entry.exactAnchorTargetLab[0],
                      a: entry.exactAnchorTargetLab[1],
                      b: entry.exactAnchorTargetLab[2],
                  }
                : undefined,
            predictionConfidence: entry.predictionConfidence,
        }));
        colorSeparation = mapTargetsWithSeparation(
            palette,
            sourceTargets,
            optimizerOptions.separationMaxDeltaE
        ).report;
        if (colorSeparation.uniquelyPreservedWithinThresholdCount === 0) {
            throw new Error(
                `No image colors can be preserved within ΔE ${colorSeparation.maximumAllowedDeltaE}. ` +
                    'Raise the Unique-match limit, increase Max Height or the total repeat limit, add a suitable filament, or reduce the 2D palette.'
            );
        }
        if (!colorSeparation.satisfied && optimizerOptions.failOnSeparationError !== false) {
            const maximumPreservedError = Number.isFinite(colorSeparation.maximumPreservedDeltaE)
                ? Number(colorSeparation.maximumPreservedDeltaE.toFixed(3)).toString()
                : 'unavailable';
            throw new Error(
                `Could not uniquely preserve all ${colorSeparation.requestedColorCount} image colors within ΔE ${colorSeparation.maximumAllowedDeltaE}. ` +
                    `${colorSeparation.uniquelyPreservedWithinThresholdCount} can be preserved; ` +
                    `${colorSeparation.mergedColorCount} would be dropped and merged. ` +
                    `Worst preserved ΔE ${maximumPreservedError}. ` +
                    'Raise the Unique-match limit if less accurate matches are acceptable, increase Max Height or the total repeat limit, add a filament, or reduce the 2D palette.'
            );
        }
    }

    const result: AutoPaintResult = {
        layers,
        totalHeight: printableStack.totalHeight,
        idealHeight,
        autoHeight,
        compressionRatio,
        filamentOrder,
        transitionZones: printableStack.zones,
        finalStack,
        ...(colorSeparation ? { colorSeparation } : {}),
        ...confidence,
    };

    // Add optimizer metadata if available
    if (optimizerResult) {
        result.optimizerMetadata = {
            algorithm:
                optimizerResult.resolvedAlgorithm || optimizerOptions?.algorithm || 'balanced',
            score: optimizerResult.score,
            iterations: optimizerResult.iterations,
            converged: optimizerResult.converged,
            cacheHit: optimizerResult.cacheHit || false,
            extraRepeatCount: optimizerResult.extraRepeatCount ?? 0,
            optimality: optimizerResult.optimality ?? 'best-found',
            singleRemovalMinimal: optimizerResult.singleRemovalMinimal ?? false,
            usedFilamentOccurrenceCount:
                optimizerResult.usedFilamentOccurrenceCount ?? optimizerResult.order.length,
            usedPrintableLayerCount:
                optimizerResult.usedPrintableLayerCount ?? finalStack.layers.length,
            usedHeight: optimizerResult.usedHeight ?? finalStack.totalHeight,
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

    // Sum of hiding distances gives a rough estimate of transition space needed
    const totalTD = filaments.reduce((sum, f) => sum + f.td, 0);

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
type AutoPaintSliceInput = Omit<AutoPaintResult, 'finalStack'> & {
    finalStack?: FinalPrintableStackSnapshot;
};

export function autoPaintResultMatchesSliceGrid(
    result: AutoPaintSliceInput,
    layerHeight: number,
    firstLayerHeight: number
): boolean {
    if (!result.finalStack) return true;
    return (
        Math.abs(result.finalStack.settings.layerHeight - layerHeight) <=
            PRINTABLE_HEIGHT_EPSILON &&
        Math.abs(
            result.finalStack.settings.firstLayerHeight -
                printableFirstLayerHeight(layerHeight, firstLayerHeight)
        ) <= PRINTABLE_HEIGHT_EPSILON
    );
}

export function autoPaintToSliceHeights(
    result: AutoPaintSliceInput,
    layerHeight: number,
    firstLayerHeight: number
): {
    colorSliceHeights: number[];
    colorOrder: number[];
    virtualSwatches: Array<{ hex: string; a: number }>;
    filamentSwatches: Array<{ hex: string; a: number }>;
} {
    // Generated results always carry finalStack. The fallback keeps old in-memory
    // fixtures and pre-snapshot callers readable without rebuilding modern results.
    if (!result.finalStack) {
        const legacyStack = buildPrintableAutoPaintStack(
            result.transitionZones,
            layerHeight,
            firstLayerHeight
        );
        return {
            colorSliceHeights: legacyStack.layers.map((layer) => layer.thickness),
            colorOrder: legacyStack.layers.map((_, index) => index),
            virtualSwatches: legacyStack.layers.map((layer) => ({
                hex: rgbToHex(layer.virtualColor),
                a: 255,
            })),
            filamentSwatches: legacyStack.layers.map((layer) => ({
                hex: layer.filamentColor,
                a: 255,
            })),
        };
    }

    if (result.finalStack.layers.length === 0 || result.finalStack.totalHeight <= 0) {
        return {
            colorSliceHeights: [],
            colorOrder: [],
            virtualSwatches: [],
            filamentSwatches: [],
        };
    }

    const stack = result.finalStack;
    if (!autoPaintResultMatchesSliceGrid(result, layerHeight, firstLayerHeight)) {
        throw new Error('Auto-paint final stack settings do not match the requested slice grid');
    }
    if (stack.truncated) {
        console.warn('autoPaintToSliceHeights: too many layers, stopping at 500');
    }

    return {
        colorSliceHeights: stack.layers.map((layer) => layer.thickness),
        colorOrder: stack.layers.map((_, index) => index),
        virtualSwatches: stack.layers.map((layer) => ({
            hex: layer.predictedColor.hex,
            a: 255,
        })),
        filamentSwatches: stack.layers.map((layer) => ({
            hex: layer.filamentColor,
            a: 255,
        })),
    };
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
 * @param imageSwatches - Image color palette
 * @param printedFilaments - Filaments in the actual generated stack
 * @param compressionRatio - How much compression was applied (1.0 = none)
 * @returns Confidence score and detailed factors
 */
function calculateAutoConfidence(
    imageSwatches: AutoPaintImageSwatch[],
    printedFilaments: Filament[],
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

    if (printedFilaments.length > 0) {
        const confidences = printedFilaments.map((f) =>
            computeProfileConfidence({
                // Only count a calibration whose swatch still matches its color;
                // a color-edited filament falls back to the uncalibrated baseline.
                calibration: activeFrontlitCalibration(f),
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

    if (printedFilaments.length > 0 && imageSwatches.length > 0) {
        const filamentColors = printedFilaments.map((f) => rgbToLab(hexToRgb(f.color)));

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
        const filamentCount = printedFilaments.length;
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
