import type { Filament } from '../types/index.ts';

// ---------------------------------------------------------------------------
// Minimal color math — inlined to avoid pulling in autoPaint's optimizer dep.
// ---------------------------------------------------------------------------

interface RGB { r: number; g: number; b: number }
interface Lab { L: number; a: number; b: number }

function hexToRgb(hex: string): RGB {
    const h = hex.replace(/^#/, '');
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}

// IEC 61966-2-1 sRGB linearisation thresholds and coefficients.
const SRGB_LINEARISE_THRESHOLD = 0.04045;
const SRGB_LINEARISE_SCALE     = 12.92;
const SRGB_LINEARISE_OFFSET    = 0.055;
const SRGB_LINEARISE_DENOM     = 1.055;
const SRGB_LINEARISE_GAMMA     = 2.4;

// IEC 61966-2-1 sRGB → CIE XYZ (D65) matrix row coefficients.
const M_RX = 0.4124564, M_GX = 0.3575761, M_BX = 0.1804375;
const M_RY = 0.2126729, M_GY = 0.7151522, M_BY = 0.0721750;
const M_RZ = 0.0193339, M_GZ = 0.1191920, M_BZ = 0.9503041;

// CIE XYZ (D65) → sRGB inverse matrix row coefficients.
const M_INV_XR =  3.2404542, M_INV_YR = -1.5371385, M_INV_ZR = -0.4985314;
const M_INV_XG = -0.9692660, M_INV_YG =  1.8760108, M_INV_ZG =  0.0415560;
const M_INV_XB =  0.0556434, M_INV_YB = -0.2040259, M_INV_ZB =  1.0572252;

// CIE standard illuminant D65 tristimulus values (normalises XYZ to [0,1]).
const D65_X = 0.95047;
const D65_Y = 1.00000;
const D65_Z = 1.08883;

// CIE L*a*b* cube-root approximation thresholds and coefficients (CIE 1976).
const LAB_EPSILON     = 0.008856; // (6/29)³
const LAB_KAPPA       = 7.787;    // (29/6)² / 3  — slope of the linear segment
const LAB_DELTA_16    = 16 / 116; // y-intercept of the linear segment
const LAB_INV_CBRT    = 6 / 29;   // cbrt(LAB_EPSILON) — Lab→XYZ cube-root threshold

// Threshold for linear RGB values in the sRGB de-linearisation step.
// Derived from SRGB_LINEARISE_THRESHOLD / SRGB_LINEARISE_SCALE ≈ 0.0031308.
const SRGB_LINEAR_THRESHOLD = SRGB_LINEARISE_THRESHOLD / SRGB_LINEARISE_SCALE;

function rgbToLab(rgb: RGB): Lab {
    const linearise = (v: number) => {
        const s = v / 255;
        return s <= SRGB_LINEARISE_THRESHOLD
            ? s / SRGB_LINEARISE_SCALE
            : Math.pow((s + SRGB_LINEARISE_OFFSET) / SRGB_LINEARISE_DENOM, SRGB_LINEARISE_GAMMA);
    };
    const r = linearise(rgb.r), g = linearise(rgb.g), b = linearise(rgb.b);

    const fx = (r * M_RX + g * M_GX + b * M_BX) / D65_X;
    const fy = (r * M_RY + g * M_GY + b * M_BY) / D65_Y;
    const fz = (r * M_RZ + g * M_GZ + b * M_BZ) / D65_Z;

    const f = (t: number) => t > LAB_EPSILON ? Math.cbrt(t) : LAB_KAPPA * t + LAB_DELTA_16;
    return { L: 116 * f(fy) - 16, a: 500 * (f(fx) - f(fy)), b: 200 * (f(fy) - f(fz)) };
}

function labToHex(lab: Lab): string {
    // Lab → XYZ (D65)
    const fy = (lab.L + 16) / 116;
    const fx = lab.a / 500 + fy;
    const fz = fy - lab.b / 200;
    const invF = (f: number) => f > LAB_INV_CBRT ? f * f * f : (f - LAB_DELTA_16) / LAB_KAPPA;
    const X = D65_X * invF(fx);
    const Y = D65_Y * invF(fy);
    const Z = D65_Z * invF(fz);

    // XYZ → linear sRGB (clamp to [0,1] to handle out-of-gamut Lab values)
    const rl = Math.max(0, Math.min(1, M_INV_XR * X + M_INV_YR * Y + M_INV_ZR * Z));
    const gl = Math.max(0, Math.min(1, M_INV_XG * X + M_INV_YG * Y + M_INV_ZG * Z));
    const bl = Math.max(0, Math.min(1, M_INV_XB * X + M_INV_YB * Y + M_INV_ZB * Z));

    // Linear → sRGB
    const delinearise = (c: number) =>
        c <= SRGB_LINEAR_THRESHOLD
            ? c * SRGB_LINEARISE_SCALE
            : SRGB_LINEARISE_DENOM * Math.pow(c, 1 / SRGB_LINEARISE_GAMMA) - SRGB_LINEARISE_OFFSET;

    const r = Math.round(delinearise(rl) * 255);
    const g = Math.round(delinearise(gl) * 255);
    const b = Math.round(delinearise(bl) * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function deltaELab(a: Lab, b: Lab): number {
    return Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

/** Convert a hex color string to its CIE L*a*b* representation. */
export function hexToLab(hex: string): Lab {
    return rgbToLab(hexToRgb(hex));
}

export { labToHex };

// Beer-Lambert layer blend: matches autoPaint's blendColors (operates in sRGB [0-255]).
function blendRgb(bg: RGB, fg: RGB, td: number, thickness: number): RGB {
    if (td <= 0 || thickness <= 0) return bg;
    const t = Math.pow(0.1, thickness / td);
    return { r: fg.r + (bg.r - fg.r) * t, g: fg.g + (bg.g - fg.g) * t, b: fg.b + (bg.b - fg.b) * t };
}

const BLEND_CURVE_STEPS = 16;

/**
 * Pre-compute the Lab values along a Beer-Lambert blend curve (bg→fg over 3×fgTd).
 * Call once per filament pair, then use minCurveDE for each swatch — avoids repeating
 * the expensive rgbToLab conversion M times for the same blend curve.
 */
function buildBlendCurve(bgRgb: RGB, fgRgb: RGB, fgTd: number): Lab[] {
    const maxT = 3 * Math.max(fgTd, 0.01);
    const labs: Lab[] = [rgbToLab(bgRgb)];
    for (let i = 1; i <= BLEND_CURVE_STEPS; i++) {
        labs.push(rgbToLab(blendRgb(bgRgb, fgRgb, fgTd, (i / BLEND_CURVE_STEPS) * maxT)));
    }
    return labs;
}

function minCurveDE(sLab: Lab, curveLabs: Lab[]): number {
    let best = Infinity;
    for (const cLab of curveLabs) {
        best = Math.min(best, deltaELab(sLab, cLab));
    }
    return best;
}

/**
 * Solves blend(C, anchor, t) = target for C in Lab space.
 * Returns the color that, when blended with `anchor` at ratio `t`, produces `target`.
 */
function extrapolateLab(target: Lab, anchor: Lab, t: number): Lab {
    return {
        L: (target.L - (1 - t) * anchor.L) / t,
        a: (target.a - (1 - t) * anchor.a) / t,
        b: (target.b - (1 - t) * anchor.b) / t,
    };
}

// Blend ratios used when extrapolating candidate colors from underserved swatches.
// t=0.7 → candidate is close to the swatch (gentle extrapolation)
// t=0.5 → candidate is the reflection of the filament through the swatch
// t=0.3 → more aggressive; may push out of gamut but gets clamped to valid hex
const EXTRAP_BLEND_RATIOS = [0.3, 0.5, 0.7];

export interface ColorCandidate {
    hex: string;
    /** Recommended starting TD, derived from the nearest existing filament by ΔE. */
    td: number;
    /**
     * % reduction in blend-aware weighted-average ΔE vs current filament set.
     * The baseline accounts for existing filament↔filament blend lines, so this
     * reflects genuine new coverage added by the candidate.
     */
    improvementPct: number;
    /** Number of image pixels whose blend-aware error improves with this candidate. */
    pixelsCaptured: number;
    /** 0–1: nearest-filament ΔE normalised to [0,1] across viable candidates. Informational only — ranking uses blend-aware gain directly. */
    isolationScore: number;
}

export interface NextBestColorResult {
    candidate: ColorCandidate | null;
    /** Blend-aware weighted-average ΔE across all image pixels before adding anything. */
    baselineAvgDeltaE: number;
    totalPixels: number;
}

/**
 * Given the current filament set and image swatches, returns the single color
 * whose addition as a new filament would most reduce the blend-aware weighted-
 * average ΔE between the rendered print and the target image.
 *
 * Candidate generation (two sources):
 *   1. Swatch colors in the p75 most underserved (by blend-aware reachable error).
 *   2. Extrapolated colors: for each underserved swatch S and filament F, solve
 *      blend(C, F, t) = S for C at t ∈ {0.3, 0.5, 0.7}. These are colors that,
 *      when blended with an existing filament, hit the underserved swatch exactly —
 *      often better than the swatch color itself because they pull the blend line
 *      further into uncovered Lab space.
 *
 * Scoring: for each candidate C, gain = Σ_i max(0, currentReachable_i −
 *   newReachable_i) × count_i, where newReachable_i is the minimum ΔE achievable
 *   from swatch i via any existing blend line or any new C↔filament segment.
 */
export function nextBestColor(
    filaments: Filament[],
    imageSwatches: Array<{ hex: string; count?: number }>
): NextBestColorResult {
    const empty: NextBestColorResult = { candidate: null, baselineAvgDeltaE: 0, totalPixels: 0 };

    if (filaments.length === 0 || imageSwatches.length === 0) return empty;

    // Pre-compute color values for filaments and swatches.
    const filamentRgbs: RGB[] = filaments.map((f) => hexToRgb(f.color));
    const filamentLabs: Lab[] = filamentRgbs.map((rgb) => rgbToLab(rgb));
    const filamentTds: number[] = filaments.map((f) => f.td);
    const swatchLabs: Lab[] = imageSwatches.map((s) => rgbToLab(hexToRgb(s.hex)));
    const counts: number[] = imageSwatches.map((s) => s.count ?? 1);

    // -------------------------------------------------------------------------
    // Baseline: blend-aware reachable error for every swatch.
    // Uses Beer-Lambert blend curves (matching autoPaint's blendColors) rather
    // than straight Lab segments, so the achievability estimate matches what
    // the print model can actually produce at each filament's TD.
    //
    // Blend curves are pre-computed once per filament pair so the expensive
    // rgbToLab conversion isn't repeated for every swatch.
    // -------------------------------------------------------------------------
    const pairCurves: Lab[][] = [];
    for (let fi = 0; fi < filamentRgbs.length; fi++) {
        for (let fj = fi + 1; fj < filamentRgbs.length; fj++) {
            pairCurves.push(buildBlendCurve(filamentRgbs[fi], filamentRgbs[fj], filamentTds[fj]));
            pairCurves.push(buildBlendCurve(filamentRgbs[fj], filamentRgbs[fi], filamentTds[fi]));
        }
    }

    const currentReachable: number[] = swatchLabs.map((sLab) => {
        let best = Infinity;
        for (const fLab of filamentLabs) {
            best = Math.min(best, deltaELab(sLab, fLab));
        }
        for (const curve of pairCurves) {
            best = Math.min(best, minCurveDE(sLab, curve));
        }
        return best;
    });

    const totalPixels = counts.reduce((s, c) => s + c, 0);

    // Residual error below 1 ΔE is below the just-noticeable difference and is
    // treated as fully covered.  This absorbs Lab↔hex quantisation noise so that
    // blend-line midpoints (which land within ~0.5 ΔE of their segment) don't
    // show up as a meaningful gap.
    const COVERAGE_FLOOR = 1.0;
    const effectiveReachable = currentReachable.map(e => e >= COVERAGE_FLOOR ? e : 0);

    const baselineTotal = effectiveReachable.reduce((s, e, i) => s + e * counts[i], 0);
    const baselineAvgDeltaE = totalPixels > 0 ? baselineTotal / totalPixels : 0;

    if (baselineAvgDeltaE === 0) return { candidate: null, baselineAvgDeltaE: 0, totalPixels };

    // -------------------------------------------------------------------------
    // Build candidate pool.
    // For each p75-underserved swatch (by weighted contribution = error × count),
    // include the swatch color itself plus extrapolated Lab positions derived from
    // each filament at each blend ratio. Filtering on weighted contribution means
    // a high-frequency moderate-error swatch isn't excluded just because rarer
    // swatches have larger raw errors.
    // -------------------------------------------------------------------------
    const COVERAGE_THRESHOLD = 3.0; // ΔE — skip near-duplicates of existing filaments

    // Weighted contribution: each swatch's share of the total baseline error.
    const weightedContrib = effectiveReachable.map((e, i) => e * counts[i]);
    const sortedContrib = [...weightedContrib].sort((a, b) => a - b);
    const p75ContribThreshold = sortedContrib[Math.floor(sortedContrib.length * 0.75)];

    // These thresholds are still on raw error, used only for scoring weights (not filtering).
    const sortedReachable = [...effectiveReachable].sort((a, b) => a - b);
    const p90Threshold = sortedReachable[Math.floor(sortedReachable.length * 0.90)];
    const maxReachable  = sortedReachable[sortedReachable.length - 1];

    interface LabCandidate { lab: Lab; hex: string }
    const seen = new Set<string>();
    const pool: LabCandidate[] = [];

    const addCandidate = (hex: string) => {
        if (seen.has(hex)) return;
        // Round-trip through hex so the Lab used for scoring and filtering always
        // matches the actual representable color. labToHex clamps out-of-gamut
        // extrapolations, so using the raw extrapolated Lab would score a phantom
        // color and return an inconsistent hex (the original bug).
        const lab = rgbToLab(hexToRgb(hex));
        for (const fLab of filamentLabs) {
            if (deltaELab(lab, fLab) < COVERAGE_THRESHOLD) return;
        }
        seen.add(hex);
        pool.push({ lab, hex });
    };

    for (let c = 0; c < swatchLabs.length; c++) {
        if (weightedContrib[c] < p75ContribThreshold) continue;

        // The swatch color itself.
        addCandidate(imageSwatches[c].hex);

        // Extrapolated: color that, blended with each filament at ratio t, hits this swatch.
        for (const fLab of filamentLabs) {
            for (const t of EXTRAP_BLEND_RATIOS) {
                addCandidate(labToHex(extrapolateLab(swatchLabs[c], fLab, t)));
            }
        }
    }

    if (pool.length === 0) return { candidate: null, baselineAvgDeltaE, totalPixels };

    // -------------------------------------------------------------------------
    // Score every candidate.
    // -------------------------------------------------------------------------
    interface CandidateScore { lab: Lab; hex: string; weightedGain: number; rawGain: number; nearestFilamentDE: number; estimatedTd: number }
    const scores: CandidateScore[] = [];

    for (const { lab, hex } of pool) {
        let nearestFilamentDE = Infinity;
        let estimatedTd = filaments[0].td;
        for (let fi = 0; fi < filamentLabs.length; fi++) {
            const de = deltaELab(lab, filamentLabs[fi]);
            if (de < nearestFilamentDE) { nearestFilamentDE = de; estimatedTd = filamentTds[fi]; }
        }
        const candidateRgb = hexToRgb(hex);

        // Pre-compute candidate↔filament blend curves once, then check all swatches against them.
        const candCurves: Lab[][] = [];
        for (let fi = 0; fi < filamentRgbs.length; fi++) {
            candCurves.push(buildBlendCurve(filamentRgbs[fi], candidateRgb, estimatedTd));
            candCurves.push(buildBlendCurve(candidateRgb, filamentRgbs[fi], filamentTds[fi]));
        }

        let weightedGain = 0;
        let rawGain = 0;
        for (let i = 0; i < swatchLabs.length; i++) {
            let newReachable = currentReachable[i];
            newReachable = Math.min(newReachable, deltaELab(swatchLabs[i], lab));
            for (const curve of candCurves) {
                newReachable = Math.min(newReachable, minCurveDE(swatchLabs[i], curve));
            }
            const improvement = effectiveReachable[i] - newReachable;
            if (improvement > 0) {
                const w = effectiveReachable[i] >= maxReachable ? 3.0
                        : effectiveReachable[i] >= p90Threshold ? 2.0
                        : 1.0;
                weightedGain += improvement * counts[i] * w;
                rawGain      += improvement * counts[i];
            }
        }

        scores.push({ lab, hex, weightedGain, rawGain, nearestFilamentDE, estimatedTd });
    }

    if (scores.length === 0) return { candidate: null, baselineAvgDeltaE, totalPixels };

    // Isolation score is informational — blend-aware gain already rewards isolated
    // candidates (longer C↔F segments cover more Lab space).
    const maxIsolation = Math.max(...scores.map((s) => s.nearestFilamentDE));

    // Rank by weighted gain; report improvement from unweighted gain so improvementPct ∈ [0,100].
    const winner = scores.reduce((best, s) => s.weightedGain > best.weightedGain ? s : best, scores[0]);

    // -------------------------------------------------------------------------
    // Build the result for the winning candidate.
    // -------------------------------------------------------------------------

    // Pixel capture: swatches whose blend-aware reachable error improves with the winner.
    const winnerRgb = hexToRgb(winner.hex);
    const winnerCurves: Lab[][] = [];
    for (let fi = 0; fi < filamentRgbs.length; fi++) {
        winnerCurves.push(buildBlendCurve(filamentRgbs[fi], winnerRgb, winner.estimatedTd));
        winnerCurves.push(buildBlendCurve(winnerRgb, filamentRgbs[fi], filamentTds[fi]));
    }
    let pixelsCaptured = 0;
    for (let i = 0; i < swatchLabs.length; i++) {
        if (effectiveReachable[i] === 0) continue;
        let newReachable = effectiveReachable[i];
        newReachable = Math.min(newReachable, deltaELab(swatchLabs[i], winner.lab));
        for (const curve of winnerCurves) {
            newReachable = Math.min(newReachable, minCurveDE(swatchLabs[i], curve));
        }
        if (newReachable < effectiveReachable[i]) pixelsCaptured += counts[i];
    }

    // TD: borrow from nearest existing filament by ΔE.
    let nearestFilamentIdx = 0;
    let nearestDE = Infinity;
    for (let fi = 0; fi < filamentLabs.length; fi++) {
        const de = deltaELab(winner.lab, filamentLabs[fi]);
        if (de < nearestDE) { nearestDE = de; nearestFilamentIdx = fi; }
    }
    const recommendedTd = filaments[nearestFilamentIdx].td;

    const isolationScore = winner.nearestFilamentDE / maxIsolation;
    const improvementPct = (winner.rawGain / baselineTotal) * 100;

    console.group(
        `[NextBestColor] ${filaments.length} filament${filaments.length !== 1 ? 's' : ''} → ` +
        `${imageSwatches.length} image colors | ${totalPixels.toLocaleString()} px | ` +
        `${pool.length} candidates (${scores.length} scored)`
    );
    console.log(`  Baseline avg ΔE:  ${baselineAvgDeltaE.toFixed(2)}  (blend-aware)`);
    console.log(`  Suggestion:       ${winner.hex.toUpperCase()}  TD ${recommendedTd.toFixed(2)}`);
    console.log(
        `  Accuracy gain:    +${improvementPct.toFixed(1)}%  ` +
        `(${pixelsCaptured.toLocaleString()} px / ` +
        `${((pixelsCaptured / totalPixels) * 100).toFixed(1)}% of image improve)`
    );
    console.log(
        `  Isolation:        ${isolationScore.toFixed(3)}  ` +
        `(nearest filament ΔE ${winner.nearestFilamentDE.toFixed(1)} / ` +
        `max ${maxIsolation.toFixed(1)})`
    );
    console.groupEnd();

    return {
        candidate: {
            hex: winner.hex,
            td: recommendedTd,
            improvementPct,
            pixelsCaptured,
            isolationScore,
        },
        baselineAvgDeltaE,
        totalPixels,
    };
}
