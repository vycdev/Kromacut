/**
 * Frontlit filament calibration.
 *
 * Camera-free workflow: the user prints a wedge of 1..N filament layers over a
 * black base plus a fully-opaque reference patch, then reports the single layer
 * count at which the wedge first becomes indistinguishable from the reference.
 * That one integer is converted to a frontlit Transmission Distance (TD) here.
 *
 * The "indistinguishable" judgment is a perceptual just-noticeable difference, so
 * opacity is defined the same way: the transmission `T*` at which the over-black
 * blend sits exactly `jnd` ΔE00 from the opaque filament color. `T*` depends only
 * on the filament color and the JND (not on TD), so it is a per-color "effective
 * opacity transmission" — `TD = -d_opaque / log10(T*)` recovers the Beer-Lambert
 * form with a principled, color-aware constant instead of a hand-picked number.
 */

import { blendSrgbChannel } from './colorSpace';
import { deltaE2000 } from './colorDifference';

// ============================================================================
// Types
// ============================================================================

export type CalibrationRgb = [number, number, number];

export interface FrontlitCalibration {
    /** Layer count at which the wedge first matched the opaque reference. */
    opacityLayers: number;
    /** Layer height the calibration print used (mm). */
    layerHeight: number;
    /** First-layer height the calibration print used (mm). */
    firstLayerHeight: number;
    /** Per-channel frontlit TD derived from the read (mm). */
    td: CalibrationRgb;
    /** Scalar working TD used by auto-paint (mm). */
    tdSingleValue: number;
    /** JND used for the opacity solve. */
    jnd: number;
    /** Base color the wedge was calibrated over (hex). */
    baseColor?: string;
    /** 0-1 quality score. */
    confidence: number;
    /** Calibration basis, fixed for now. */
    basis: 'black-frontlit';
    /** ISO timestamp. */
    calibrationDate: string;
    notes?: string;
}

export type FrontlitCalibrationResult =
    | { ok: true; calibration: FrontlitCalibration }
    | { ok: false; error: string };

export interface FrontlitCalibrationInput {
    filamentColor: string;
    opacityLayers: number;
    layerHeight: number;
    firstLayerHeight: number;
    /** Base color the wedge prints over (hex). Defaults to black. */
    baseColor?: string;
    /** Highest layer count printed on the wedge; used to flag clipped reads. */
    maxLayers?: number;
    jnd?: number;
    notes?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default base the calibration wedge prints on (black). */
export const FRONTLIT_BASE: CalibrationRgb = [0, 0, 0];
export const FRONTLIT_BASE_HEX = '#000000';

/**
 * Perceptual just-noticeable difference (CIEDE2000) defining "indistinguishable
 * from the opaque reference patch." ~1 is the textbook JND; 2 is forgiving for
 * real room-light viewing. This is a human-vision constant, NOT fit to any
 * filament — per-filament optics come from the read. Tune against physical
 * frontlit prints.
 */
export const OPACITY_JND = 2.0;

const FRONTLIT_TD_MIN = 0.05;
const FRONTLIT_TD_MAX = 12.0;

const CONFIDENCE_THRESHOLD_EXCELLENT = 0.9;
const CONFIDENCE_THRESHOLD_GOOD = 0.7;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function hexToRgb(hex: string): CalibrationRgb | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
        : null;
}

// ============================================================================
// Opacity-read calibration
// ============================================================================

function blendOverBase(
    filamentRgb: CalibrationRgb,
    transmission: number,
    base: CalibrationRgb = FRONTLIT_BASE
): CalibrationRgb {
    return [
        blendSrgbChannel(base[0], filamentRgb[0], transmission),
        blendSrgbChannel(base[1], filamentRgb[1], transmission),
        blendSrgbChannel(base[2], filamentRgb[2], transmission),
    ];
}

/**
 * Solve for the transmission `T*` at which the over-base blend is exactly `jnd`
 * ΔE00 from the opaque filament color. ΔE00 grows monotonically with T (more
 * base shows through), so a bisection converges to a unique value.
 *
 * Returns undefined when even full background (T=1, pure base) is within the JND
 * of the filament — i.e. the filament has too little contrast with the base to be
 * opacity-calibrated (e.g. a black filament over a black base; switch to a lighter
 * base).
 */
export function solveOpacityTransmission(
    filamentColor: string,
    jnd = OPACITY_JND,
    baseColor: string = FRONTLIT_BASE_HEX
): number | undefined {
    const rgb = hexToRgb(filamentColor);
    const base = hexToRgb(baseColor) ?? FRONTLIT_BASE;
    if (!rgb) return undefined;

    const deltaAt = (t: number) => deltaE2000(blendOverBase(rgb, t, base), rgb);

    // Not enough contrast with the base to ever reach the JND.
    if (deltaAt(1) < jnd) return undefined;

    let lo = 0; // ΔE = 0 at T=0 (pure filament)
    let hi = 1; // ΔE maximal at T=1 (pure base)
    for (let i = 0; i < 48; i++) {
        const mid = (lo + hi) / 2;
        if (deltaAt(mid) < jnd) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}

/**
 * Derive per-channel TDs from the single measured TD, modulated by the filament
 * color. Uses a `1 + value*5.8` shape per channel (the per-channel form of the
 * estimateTDFromColor luminance heuristic): a brighter channel is more
 * transmissive (larger TD). The brightest channel — which governs the opacity
 * the eye reads — is anchored to `tdSingle`, so darker (more absorptive) channels
 * scale down from there.
 */
export function deriveChannelTds(filamentColor: string, tdSingle: number): CalibrationRgb {
    const rgb = hexToRgb(filamentColor) ?? [128, 128, 128];
    const raw = rgb.map((c) => 1 + (c / 255) * 5.8) as CalibrationRgb;
    const anchor = Math.max(raw[0], raw[1], raw[2]);
    const k = tdSingle / anchor;
    return raw.map((value) => clamp(k * value, FRONTLIT_TD_MIN, FRONTLIT_TD_MAX)) as CalibrationRgb;
}

function frontlitConfidence(opacityLayers: number, tdSingle: number, maxLayers?: number): number {
    let confidence = 0.9;
    // Reads pinned at either extreme of the wedge are less trustworthy: the true
    // opacity point may lie outside the printed range.
    if (opacityLayers <= 1) confidence -= 0.3;
    if (maxLayers !== undefined && opacityLayers >= maxLayers) confidence -= 0.3;
    // A TD against either clamp edge means the read fell outside the model's band.
    if (tdSingle <= FRONTLIT_TD_MIN * 1.5 || tdSingle >= FRONTLIT_TD_MAX * 0.9) {
        confidence -= 0.2;
    }
    return clamp(confidence, 0.1, 1);
}

/**
 * Convert a single opacity-layer read into a frontlit calibration.
 *
 * The color wedge prints on top of the black base, so every color layer is a
 * regular layer — `d_opaque = opacityLayers * layerHeight`. `firstLayerHeight`
 * is stored (it governs the black base bottom layer and keeps auto-paint's
 * thickness model consistent) but does not enter the color thickness.
 */
export function computeFrontlitCalibration(
    input: FrontlitCalibrationInput
): FrontlitCalibrationResult {
    const { filamentColor, opacityLayers, layerHeight, firstLayerHeight } = input;
    const jnd = input.jnd ?? OPACITY_JND;
    const baseColor = input.baseColor ?? FRONTLIT_BASE_HEX;

    if (!Number.isFinite(opacityLayers) || opacityLayers < 1) {
        return { ok: false, error: 'Opacity layer count must be at least 1.' };
    }
    if (!Number.isFinite(layerHeight) || layerHeight <= 0) {
        return { ok: false, error: 'Layer height must be a positive number.' };
    }

    const tStar = solveOpacityTransmission(filamentColor, jnd, baseColor);
    if (tStar === undefined || tStar <= 0 || tStar >= 1) {
        return {
            ok: false,
            error: 'Too little contrast with the base to calibrate. Pick a lighter base (e.g. white) for this filament.',
        };
    }

    const dOpaque = opacityLayers * layerHeight;
    const tdSingleValue = clamp(-dOpaque / Math.log10(tStar), FRONTLIT_TD_MIN, FRONTLIT_TD_MAX);
    const td = deriveChannelTds(filamentColor, tdSingleValue);
    const confidence = frontlitConfidence(opacityLayers, tdSingleValue, input.maxLayers);

    return {
        ok: true,
        calibration: {
            opacityLayers,
            layerHeight,
            firstLayerHeight,
            td,
            tdSingleValue,
            jnd,
            baseColor,
            confidence,
            basis: 'black-frontlit',
            calibrationDate: new Date().toISOString(),
            notes: input.notes,
        },
    };
}

/**
 * Predict the displayed color of `layers` of filament over the base, using
 * per-channel TDs. Mirrors the auto-paint blend so calibration previews match.
 */
export function predictFrontlitColor(
    filamentColor: string,
    layers: number,
    layerHeight: number,
    td: CalibrationRgb,
    baseColor: string = FRONTLIT_BASE_HEX
): CalibrationRgb {
    const rgb = hexToRgb(filamentColor);
    const base = hexToRgb(baseColor) ?? FRONTLIT_BASE;
    if (!rgb) return [...base] as CalibrationRgb;

    const thickness = layers * layerHeight;
    return [0, 1, 2].map((channel) => {
        const transmission = Math.pow(10, -thickness / td[channel]);
        return Math.round(blendSrgbChannel(base[channel], rgb[channel], transmission));
    }) as CalibrationRgb;
}

// ============================================================================
// Confidence scoring (consumed by auto-paint + filament UI)
// ============================================================================

/**
 * Compute confidence for a filament profile: calibration quality with an age
 * decay, or a TD-plausibility heuristic when uncalibrated.
 */
export function computeProfileConfidence(profile: {
    calibration?: FrontlitCalibration;
    transmissionDistance: number;
}): number {
    if (!profile.calibration) {
        const td = profile.transmissionDistance;
        if (td >= 1.0 && td <= 5.0) return 0.5;
        if (td >= 0.5 && td <= 10.0) return 0.3;
        return 0.1;
    }

    const cal = profile.calibration;
    let confidence = cal.confidence;

    const ageMs = Date.now() - new Date(cal.calibrationDate).getTime();
    const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30);
    if (ageMonths > 6) {
        confidence *= Math.max(0.7, 1 - (ageMonths - 6) / 24); // decay over 2 years
    }

    return clamp(confidence, 0, 1);
}

/** Confidence label for UI display. */
export function getConfidenceLabel(confidence: number): string {
    if (confidence >= CONFIDENCE_THRESHOLD_EXCELLENT) return 'Excellent';
    if (confidence >= CONFIDENCE_THRESHOLD_GOOD) return 'Good';
    if (confidence >= 0.5) return 'Fair';
    return 'Low';
}

/** Confidence color (Tailwind classes) for UI display. */
export function getConfidenceColor(confidence: number): string {
    if (confidence >= CONFIDENCE_THRESHOLD_EXCELLENT) return 'text-green-600';
    if (confidence >= CONFIDENCE_THRESHOLD_GOOD) return 'text-blue-600';
    if (confidence >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
}
