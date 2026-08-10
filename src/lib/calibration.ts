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

import { blendSrgbChannel } from './colorSpace.ts';
import { deltaE2000 } from './colorDifference.ts';

// ============================================================================
// Types
// ============================================================================

export type CalibrationRgb = [number, number, number];

export interface FrontlitCalibrationRead {
    baseColor: string;
    opacityLayers: number;
    /** Optional adjacent-step merge point, stored as model-form evidence. */
    mergeLayers?: number;
}

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
    baseColor: string;
    /** 0-1 quality score. */
    confidence: number;
    /** Calibration method. `baseColor` records the actual base used. */
    basis: 'frontlit';
    /** ISO timestamp. */
    calibrationDate: string;
    /** All opacity reads used by a multi-base fit. Absent means Phase-1 single read. */
    reads?: FrontlitCalibrationRead[];
    /** Whether RGB TD ratios came from the color heuristic or a multi-base fit. */
    channelSource?: 'heuristic' | 'measured';
    /** Whether the JND was the default constant or fitted across the session. */
    jndSource?: 'default' | 'session-fit';
    /**
     * Swatch color (hex) the wedge was calibrated for. A calibration only
     * applies while the filament still has this color — editing the swatch
     * deactivates it (see activeFrontlitCalibration) instead of silently
     * blending with measurements from a different material. Absent on records
     * saved before the field existed; those are backfilled on load.
     */
    filamentColor?: string;
    notes?: string;
}

export type FrontlitCalibrationResult =
    | { ok: true; calibration: FrontlitCalibration }
    | { ok: false; error: string };

export interface FrontlitCalibrationInput {
    filamentColor: string;
    opacityLayers?: number;
    layerHeight: number;
    firstLayerHeight: number;
    /** Base color the wedge prints over (hex). Defaults to black. */
    baseColor?: string;
    /** Multi-base reads for the same filament. The first read is the compatibility anchor. */
    reads?: FrontlitCalibrationRead[];
    /** Highest layer count printed on the wedge; used to flag clipped reads. */
    maxLayers?: number;
    jnd?: number;
    jndSource?: 'default' | 'session-fit';
    notes?: string;
}

export interface FrontlitCalibrationSessionInput {
    filaments: FrontlitCalibrationInput[];
    /** Highest layer count printed on the wedge; used for JND fit bounds and confidence. */
    maxLayers?: number;
}

export interface FrontlitCalibrationSessionResult {
    jnd: number;
    jndSource: 'default' | 'session-fit';
    results: FrontlitCalibrationResult[];
    residual: number;
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

/**
 * Conversion factor between conventional (backlit/lithophane) Transmission
 * Distance values and the frontlit hiding distance the app stores and
 * simulates with. Used only when converting user-entered conventional TD
 * values and when migrating pre-v2 persisted profiles; the runtime pipeline
 * consumes hiding distances directly. Empirically validated: measured hiding
 * distances of a physical 8-filament set landed at ≈ backlit TD × 0.1.
 */
export const FRONTLIT_TD_SCALE = 0.1;

const FRONTLIT_TD_MIN = 0.05;
const FRONTLIT_TD_MAX = 12.0;
const JND_FIT_MIN = 1.0;
const JND_FIT_MAX = 3.0;
const DEFAULT_PREDICT_MAX_LAYERS = 240;

const CONFIDENCE_THRESHOLD_EXCELLENT = 0.9;
const CONFIDENCE_THRESHOLD_GOOD = 0.7;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function hexToRgb(hex: string): CalibrationRgb | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
        : null;
}

const isFinitePositive = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

const isFiniteFrontlitTd = (value: unknown): value is number =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= FRONTLIT_TD_MIN &&
    value <= FRONTLIT_TD_MAX;

type ReadResidualMode = 'interval' | 'center';

function sanitizeCalibrationRgb(value: unknown): CalibrationRgb | undefined {
    if (!Array.isArray(value) || value.length !== 3) return undefined;
    const [r, g, b] = value;
    if (!isFiniteFrontlitTd(r) || !isFiniteFrontlitTd(g) || !isFiniteFrontlitTd(b)) {
        return undefined;
    }
    return [r, g, b];
}

function sanitizeCalibrationRead(value: unknown): FrontlitCalibrationRead | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const candidate = value as Record<string, unknown>;
    if (
        typeof candidate.baseColor !== 'string' ||
        !hexToRgb(candidate.baseColor) ||
        typeof candidate.opacityLayers !== 'number' ||
        !Number.isFinite(candidate.opacityLayers) ||
        candidate.opacityLayers < 1
    ) {
        return undefined;
    }
    const read: FrontlitCalibrationRead = {
        baseColor: candidate.baseColor,
        opacityLayers: candidate.opacityLayers,
    };
    if (candidate.mergeLayers !== undefined) {
        if (
            typeof candidate.mergeLayers !== 'number' ||
            !Number.isFinite(candidate.mergeLayers) ||
            candidate.mergeLayers < 1
        ) {
            return undefined;
        }
        read.mergeLayers = candidate.mergeLayers;
    }
    return read;
}

/**
 * Accept only the camera-free frontlit calibration shape. Older backlit photo
 * calibrations are intentionally stripped on load rather than migrated.
 */
export function sanitizeFrontlitCalibration(value: unknown): FrontlitCalibration | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const candidate = value as Record<string, unknown>;
    if (candidate.basis !== 'frontlit') return undefined;
    if (
        typeof candidate.opacityLayers !== 'number' ||
        !Number.isFinite(candidate.opacityLayers) ||
        candidate.opacityLayers < 1
    ) {
        return undefined;
    }
    if (!isFinitePositive(candidate.layerHeight)) return undefined;
    if (!isFinitePositive(candidate.firstLayerHeight)) return undefined;
    if (!isFiniteFrontlitTd(candidate.tdSingleValue)) return undefined;
    if (!isFinitePositive(candidate.jnd)) return undefined;
    if (typeof candidate.baseColor !== 'string' || !hexToRgb(candidate.baseColor)) {
        return undefined;
    }
    if (typeof candidate.confidence !== 'number' || !Number.isFinite(candidate.confidence)) {
        return undefined;
    }
    if (
        typeof candidate.calibrationDate !== 'string' ||
        !Number.isFinite(new Date(candidate.calibrationDate).getTime())
    ) {
        return undefined;
    }

    const td = sanitizeCalibrationRgb(candidate.td);
    if (!td) return undefined;

    const sanitized: FrontlitCalibration = {
        opacityLayers: candidate.opacityLayers,
        layerHeight: candidate.layerHeight,
        firstLayerHeight: candidate.firstLayerHeight,
        td,
        tdSingleValue: candidate.tdSingleValue,
        jnd: candidate.jnd,
        baseColor: candidate.baseColor,
        confidence: clamp(candidate.confidence, 0, 1),
        basis: 'frontlit',
        calibrationDate: candidate.calibrationDate,
    };
    if (candidate.reads !== undefined) {
        if (!Array.isArray(candidate.reads)) return undefined;
        const reads = candidate.reads.map(sanitizeCalibrationRead);
        if (reads.some((read) => !read)) return undefined;
        sanitized.reads = reads as FrontlitCalibrationRead[];
        if (sanitized.reads.length === 0) return undefined;
    }
    if (candidate.channelSource === 'heuristic' || candidate.channelSource === 'measured') {
        sanitized.channelSource = candidate.channelSource;
    } else if (candidate.channelSource !== undefined) {
        return undefined;
    }
    if (candidate.jndSource === 'default' || candidate.jndSource === 'session-fit') {
        sanitized.jndSource = candidate.jndSource;
    } else if (candidate.jndSource !== undefined) {
        return undefined;
    }
    if (candidate.filamentColor !== undefined) {
        if (typeof candidate.filamentColor !== 'string' || !hexToRgb(candidate.filamentColor)) {
            return undefined;
        }
        sanitized.filamentColor = candidate.filamentColor;
    }
    if (typeof candidate.notes === 'string') sanitized.notes = candidate.notes;
    return sanitized;
}

/**
 * The calibration that currently applies to a filament: a valid frontlit
 * record whose calibrated swatch color still matches the filament's color.
 * Editing the swatch deactivates the calibration (measurements belong to the
 * previous material) and reverting the color reactivates it. Records without
 * a stored color (pre-field) are treated as matching.
 */
export function activeFrontlitCalibration(filament: {
    color: string;
    calibration?: unknown;
}): FrontlitCalibration | undefined {
    const calibration = sanitizeFrontlitCalibration(filament.calibration);
    if (!calibration) return undefined;
    if (calibration.filamentColor === undefined) return calibration;
    const calibrated = hexToRgb(calibration.filamentColor);
    const current = hexToRgb(filament.color);
    if (!calibrated || !current) return undefined;
    return calibrated[0] === current[0] &&
        calibrated[1] === current[1] &&
        calibrated[2] === current[2]
        ? calibration
        : undefined;
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

function blendOverBaseWithTds(
    filamentRgb: CalibrationRgb,
    td: CalibrationRgb,
    thickness: number,
    base: CalibrationRgb
): CalibrationRgb {
    return [0, 1, 2].map((channel) => {
        const transmission = Math.pow(10, -thickness / td[channel]);
        return blendSrgbChannel(base[channel], filamentRgb[channel], transmission);
    }) as CalibrationRgb;
}

function opacityLayerThreshold(
    filamentRgb: CalibrationRgb,
    td: CalibrationRgb,
    layerHeight: number,
    jnd: number,
    base: CalibrationRgb,
    maxLayers = DEFAULT_PREDICT_MAX_LAYERS
): number | undefined {
    const deltaAt = (thickness: number) =>
        deltaE2000(blendOverBaseWithTds(filamentRgb, td, thickness, base), filamentRgb);

    if (deltaAt(0) < jnd) return undefined;

    let hi = Math.max(layerHeight, maxLayers * layerHeight);
    let guard = 0;
    while (deltaAt(hi) > jnd && guard < 8) {
        hi *= 1.8;
        guard++;
    }
    if (deltaAt(hi) > jnd) return maxLayers + 1;

    let lo = 0;
    for (let i = 0; i < 36; i++) {
        const mid = (lo + hi) / 2;
        if (deltaAt(mid) > jnd) lo = mid;
        else hi = mid;
    }
    return hi / layerHeight;
}

function quantizedReadResidual(predictedThreshold: number, observedLayers: number): number {
    const lowerExclusive = Math.max(0, observedLayers - 1);
    if (predictedThreshold > lowerExclusive && predictedThreshold <= observedLayers) return 0;
    if (predictedThreshold <= lowerExclusive) return lowerExclusive - predictedThreshold;
    return predictedThreshold - observedLayers;
}

function predictedReadResidual(
    filamentRgb: CalibrationRgb,
    td: CalibrationRgb,
    read: FrontlitCalibrationRead,
    layerHeight: number,
    jnd: number,
    maxLayers?: number,
    mode: ReadResidualMode = 'interval'
): number {
    const base = hexToRgb(read.baseColor);
    if (!base) return 50;
    const predicted = opacityLayerThreshold(
        filamentRgb,
        td,
        layerHeight,
        jnd,
        base,
        Math.max(maxLayers ?? 0, read.opacityLayers + 24, DEFAULT_PREDICT_MAX_LAYERS)
    );
    if (predicted === undefined) return 50;
    if (mode === 'center') return predicted - (read.opacityLayers - 0.5);
    return quantizedReadResidual(predicted, read.opacityLayers);
}

function scalarTdFromRead(
    filamentColor: string,
    read: FrontlitCalibrationRead,
    layerHeight: number,
    jnd: number
): number | undefined {
    const tStar = solveOpacityTransmission(filamentColor, jnd, read.baseColor);
    if (tStar === undefined || tStar <= 0 || tStar >= 1) return undefined;
    return clamp(
        -(read.opacityLayers * layerHeight) / Math.log10(tStar),
        FRONTLIT_TD_MIN,
        FRONTLIT_TD_MAX
    );
}

interface ChannelFit {
    td: CalibrationRgb;
    residual: number;
    dataResidual: number;
    rmsLayers: number;
    prior: CalibrationRgb;
    tdSingleValue: number;
}

function fitChannelTdsForReads(
    filamentColor: string,
    reads: FrontlitCalibrationRead[],
    layerHeight: number,
    jnd: number,
    maxLayers?: number,
    residualMode: ReadResidualMode = 'interval'
): ChannelFit | undefined {
    const filamentRgb = hexToRgb(filamentColor);
    if (!filamentRgb || reads.length === 0) return undefined;

    const anchorScalar = scalarTdFromRead(filamentColor, reads[0], layerHeight, jnd);
    if (!anchorScalar) return undefined;
    const prior = deriveChannelTds(filamentColor, anchorScalar);
    if (reads.length === 1) {
        const dataResidual =
            predictedReadResidual(
                filamentRgb,
                prior,
                reads[0],
                layerHeight,
                jnd,
                maxLayers,
                residualMode
            ) ** 2;
        return {
            td: prior,
            residual: dataResidual,
            dataResidual,
            rmsLayers: Math.sqrt(dataResidual),
            prior,
            tdSingleValue: anchorScalar,
        };
    }

    const regularizationWeight = reads.length <= 2 ? 0.08 : 0.035;
    const score = (td: CalibrationRgb) => {
        let dataResidual = 0;
        for (const read of reads) {
            const r = predictedReadResidual(
                filamentRgb,
                td,
                read,
                layerHeight,
                jnd,
                maxLayers,
                residualMode
            );
            dataResidual += r * r;
        }
        const reg =
            regularizationWeight *
            td.reduce((sum, value, index) => {
                const ratio = Math.log2(value / prior[index]);
                return sum + ratio * ratio;
            }, 0);
        return { total: dataResidual + reg, dataResidual };
    };

    let bestTd = prior;
    let best = score(bestTd);
    const coarseOffsets = [-1.2, -0.6, 0, 0.6, 1.2];
    for (const r of coarseOffsets) {
        for (const g of coarseOffsets) {
            for (const b of coarseOffsets) {
                const candidate: CalibrationRgb = [
                    clamp(prior[0] * Math.exp(r), FRONTLIT_TD_MIN, FRONTLIT_TD_MAX),
                    clamp(prior[1] * Math.exp(g), FRONTLIT_TD_MIN, FRONTLIT_TD_MAX),
                    clamp(prior[2] * Math.exp(b), FRONTLIT_TD_MIN, FRONTLIT_TD_MAX),
                ];
                const candidateScore = score(candidate);
                if (candidateScore.total < best.total) {
                    bestTd = candidate;
                    best = candidateScore;
                }
            }
        }
    }

    for (let step = 0.45; step >= 0.035; step *= 0.55) {
        let improved = true;
        let passes = 0;
        while (improved && passes < 6) {
            improved = false;
            passes++;
            for (const r of [-step, 0, step]) {
                for (const g of [-step, 0, step]) {
                    for (const b of [-step, 0, step]) {
                        if (r === 0 && g === 0 && b === 0) continue;
                        const candidate: CalibrationRgb = [
                            clamp(bestTd[0] * Math.exp(r), FRONTLIT_TD_MIN, FRONTLIT_TD_MAX),
                            clamp(bestTd[1] * Math.exp(g), FRONTLIT_TD_MIN, FRONTLIT_TD_MAX),
                            clamp(bestTd[2] * Math.exp(b), FRONTLIT_TD_MIN, FRONTLIT_TD_MAX),
                        ];
                        const candidateScore = score(candidate);
                        if (candidateScore.total + 1e-9 < best.total) {
                            bestTd = candidate;
                            best = candidateScore;
                            improved = true;
                        }
                    }
                }
            }
        }
    }

    return {
        td: bestTd,
        residual: best.total,
        dataResidual: best.dataResidual,
        rmsLayers: Math.sqrt(best.dataResidual / reads.length),
        prior,
        tdSingleValue: Math.max(...bestTd),
    };
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
 * Predict the first wedge patch that should match the reference rail for a set
 * of per-channel TDs. Returns maxLayers + 1 when it would not converge within
 * the printed wedge.
 */
export function predictOpacityLayersForTds(
    filamentColor: string,
    td: CalibrationRgb,
    layerHeight: number,
    jnd = OPACITY_JND,
    baseColor: string = FRONTLIT_BASE_HEX,
    maxLayers = DEFAULT_PREDICT_MAX_LAYERS
): number | undefined {
    const filamentRgb = hexToRgb(filamentColor);
    const base = hexToRgb(baseColor);
    if (!filamentRgb || !base) return undefined;
    const threshold = opacityLayerThreshold(filamentRgb, td, layerHeight, jnd, base, maxLayers);
    if (threshold === undefined) return undefined;
    if (threshold > maxLayers) return maxLayers + 1;
    return Math.max(1, Math.ceil(threshold - 1e-9));
}

/**
 * Derive per-channel TDs from the single measured TD, modulated by the filament
 * color. Uses a `1 + value*5.8` shape per channel (the per-channel form of the
 * estimateHidingDistanceFromColor luminance heuristic): a brighter channel is more
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

/**
 * Per-channel hiding distances for a filament: the measured triple when a valid
 * frontlit calibration exists, otherwise derived from the swatch color around
 * the scalar hiding distance. Every blend consumer should go through this so
 * calibrated and uncalibrated filaments share one channel model.
 */
export function channelHds(filament: {
    color: string;
    td: number;
    calibration?: unknown;
}): CalibrationRgb {
    return activeFrontlitCalibration(filament)?.td ?? deriveChannelTds(filament.color, filament.td);
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

function multiReadConfidence(
    reads: FrontlitCalibrationRead[],
    fit: ChannelFit,
    maxLayers?: number
): number {
    let confidence = reads.length > 1 ? 0.96 : 0.9;
    for (const read of reads) {
        if (read.opacityLayers <= 1) confidence -= 0.12;
        if (maxLayers !== undefined && read.opacityLayers >= maxLayers) confidence -= 0.12;
    }
    if (fit.td.some((td) => td <= FRONTLIT_TD_MIN * 1.5 || td >= FRONTLIT_TD_MAX * 0.9)) {
        confidence -= 0.16;
    }
    if (reads.length > 1) {
        confidence -= clamp(fit.rmsLayers * 0.16, 0, 0.35);
    }
    return clamp(confidence, 0.1, 1);
}

function normalizeInputReads(
    input: FrontlitCalibrationInput
): { ok: true; reads: FrontlitCalibrationRead[] } | { ok: false; error: string } {
    const rawReads =
        input.reads && input.reads.length > 0
            ? input.reads
            : input.opacityLayers !== undefined
              ? [
                    {
                        baseColor: input.baseColor ?? FRONTLIT_BASE_HEX,
                        opacityLayers: input.opacityLayers,
                    },
                ]
              : [];

    if (rawReads.length === 0) {
        return { ok: false, error: 'Enter at least one opacity read.' };
    }

    const reads: FrontlitCalibrationRead[] = [];
    for (const raw of rawReads) {
        const read = sanitizeCalibrationRead(raw);
        if (!read) {
            return {
                ok: false,
                error: 'Each opacity read needs a valid base color and layer count.',
            };
        }
        reads.push(read);
    }
    return { ok: true, reads };
}

function appendCalibrationNote(existing: string | undefined, note: string): string {
    return existing ? `${existing} ${note}` : note;
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
    const { filamentColor, layerHeight, firstLayerHeight } = input;
    const jnd = input.jnd ?? OPACITY_JND;
    const normalized = normalizeInputReads(input);
    if (!normalized.ok) return normalized;
    const { reads } = normalized;
    const anchorRead = reads[0];
    const opacityLayers = anchorRead.opacityLayers;
    const baseColor = anchorRead.baseColor;

    if (!Number.isFinite(opacityLayers) || opacityLayers < 1) {
        return { ok: false, error: 'Opacity layer count must be at least 1.' };
    }
    if (!Number.isFinite(layerHeight) || layerHeight <= 0) {
        return { ok: false, error: 'Layer height must be a positive number.' };
    }
    if (!Number.isFinite(firstLayerHeight) || firstLayerHeight <= 0) {
        return { ok: false, error: 'First-layer height must be a positive number.' };
    }

    for (const read of reads) {
        const tStar = solveOpacityTransmission(filamentColor, jnd, read.baseColor);
        if (tStar === undefined || tStar <= 0 || tStar >= 1) {
            return {
                ok: false,
                error: 'Too little contrast with one selected base to calibrate. Pick a base with stronger contrast for this filament.',
            };
        }
    }

    const fit = fitChannelTdsForReads(filamentColor, reads, layerHeight, jnd, input.maxLayers);
    if (!fit) {
        return { ok: false, error: 'Could not fit a calibration from these reads.' };
    }
    const channelSource = reads.length > 1 ? 'measured' : 'heuristic';
    const td = fit.td;
    const tdSingleValue = fit.tdSingleValue;
    const confidence =
        reads.length > 1
            ? multiReadConfidence(reads, fit, input.maxLayers)
            : frontlitConfidence(opacityLayers, tdSingleValue, input.maxLayers);
    let notes = input.notes;
    if (reads.length > 1 && fit.rmsLayers > 0.75) {
        notes = appendCalibrationNote(
            notes,
            `Multi-base reads disagree by about ${fit.rmsLayers.toFixed(1)} layers under the best fit.`
        );
    }

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
            basis: 'frontlit',
            calibrationDate: new Date().toISOString(),
            reads:
                reads.length > 1 || reads.some((read) => read.mergeLayers !== undefined)
                    ? reads
                    : undefined,
            channelSource,
            jndSource: input.jndSource ?? 'default',
            filamentColor,
            notes,
        },
    };
}

function calibrationFitResidualForJnd(input: FrontlitCalibrationInput, jnd: number): number {
    const normalized = normalizeInputReads(input);
    if (!normalized.ok || normalized.reads.length < 2) return 0;
    const fit = fitChannelTdsForReads(
        input.filamentColor,
        normalized.reads,
        input.layerHeight,
        jnd,
        input.maxLayers,
        'center'
    );
    return fit ? fit.dataResidual : 1_000;
}

function fitSessionJnd(
    inputs: FrontlitCalibrationInput[],
    maxLayers?: number
): { jnd: number; residual: number } | undefined {
    const eligible = inputs.filter((input) => {
        const normalized = normalizeInputReads({
            ...input,
            maxLayers: input.maxLayers ?? maxLayers,
        });
        return normalized.ok && normalized.reads.length >= 2;
    });
    if (eligible.length < 2) return undefined;

    const residualCache = new Map<number, number>();
    const evaluate = (jnd: number) => {
        const key = Number(jnd.toFixed(6));
        const cached = residualCache.get(key);
        if (cached !== undefined) return cached;
        const residual = eligible.reduce(
            (sum, input) =>
                sum +
                calibrationFitResidualForJnd(
                    { ...input, maxLayers: input.maxLayers ?? maxLayers },
                    key
                ),
            0
        );
        residualCache.set(key, residual);
        return residual;
    };

    let bestJnd = OPACITY_JND;
    let bestResidual = evaluate(OPACITY_JND);
    const defaultResidual = bestResidual;
    for (let jnd = JND_FIT_MIN; jnd <= JND_FIT_MAX + 1e-9; jnd += 0.2) {
        const rounded = Number(jnd.toFixed(2));
        const residual = evaluate(rounded);
        if (residual < bestResidual) {
            bestJnd = rounded;
            bestResidual = residual;
        }
    }
    const fineStart = Math.max(JND_FIT_MIN, bestJnd - 0.16);
    const fineEnd = Math.min(JND_FIT_MAX, bestJnd + 0.16);
    for (let jnd = fineStart; jnd <= fineEnd + 1e-9; jnd += 0.04) {
        const rounded = Number(jnd.toFixed(2));
        const residual = evaluate(rounded);
        if (residual < bestResidual) {
            bestJnd = rounded;
            bestResidual = residual;
        }
    }

    const improvement = defaultResidual - bestResidual;
    if (improvement < Math.max(0.1, eligible.length * 0.04)) return undefined;
    if (bestJnd <= JND_FIT_MIN + 1e-9 || bestJnd >= JND_FIT_MAX - 1e-9) return undefined;
    return { jnd: bestJnd, residual: bestResidual };
}

export function computeFrontlitCalibrationSession(
    input: FrontlitCalibrationSessionInput
): FrontlitCalibrationSessionResult {
    const jndFit = fitSessionJnd(input.filaments, input.maxLayers);
    const jnd = jndFit?.jnd ?? OPACITY_JND;
    const jndSource = jndFit ? 'session-fit' : 'default';
    const results = input.filaments.map((filament) =>
        computeFrontlitCalibration({
            ...filament,
            maxLayers: filament.maxLayers ?? input.maxLayers,
            jnd,
            jndSource,
        })
    );
    const residual =
        jndFit?.residual ??
        input.filaments.reduce(
            (sum, filament) =>
                sum +
                calibrationFitResidualForJnd(
                    { ...filament, maxLayers: filament.maxLayers ?? input.maxLayers },
                    jnd
                ),
            0
        );
    return { jnd, jndSource, results, residual };
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
    calibration?: unknown;
    transmissionDistance: number;
}): number {
    const cal = sanitizeFrontlitCalibration(profile.calibration);
    if (!cal) {
        // Plausibility bands for an uncalibrated hiding distance (mm, frontlit).
        const td = profile.transmissionDistance;
        if (td >= 0.1 && td <= 0.5) return 0.5;
        if (td >= 0.05 && td <= 1.0) return 0.3;
        return 0.1;
    }

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
