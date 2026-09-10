/**
 * Standalone perceptual color difference (CIEDE2000) on sRGB triplets.
 *
 * This is a leaf module that depends only on Math. Calibration math needs ΔE00
 * but cannot import it from `autoPaint.ts` — `autoPaint` already imports from
 * `calibration`, so the reverse would be a cycle. Keeping the implementation
 * here lets the optical/calibration code share one perceptual metric without
 * pulling in the heavy auto-paint module.
 *
 * NOTE: `autoPaint.ts` and `nextBestColor.ts` still carry their own rgbToLab /
 * CIEDE2000 copies. Consolidating all of them onto this leaf is a worthwhile
 * follow-up cleanup, intentionally left out of the calibration redesign to keep
 * the optimizer hot path untouched.
 */

export type Lab = { L: number; a: number; b: number };
export type Rgb = [number, number, number];

/** Convert an sRGB triplet (0-255) to CIE Lab (D65). */
export function rgbToLab([r, g, b]: Rgb): Lab {
    let rl = r / 255;
    let gl = g / 255;
    let bl = b / 255;

    rl = rl > 0.04045 ? Math.pow((rl + 0.055) / 1.055, 2.4) : rl / 12.92;
    gl = gl > 0.04045 ? Math.pow((gl + 0.055) / 1.055, 2.4) : gl / 12.92;
    bl = bl > 0.04045 ? Math.pow((bl + 0.055) / 1.055, 2.4) : bl / 12.92;

    rl *= 100;
    gl *= 100;
    bl *= 100;

    const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
    const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
    const z = rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041;

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

/** Convert CIE Lab (D65) to clamped sRGB. Preserve fractions for continuous model blending. */
export function labToRgb({ L, a, b }: Lab, quantize = true): Rgb {
    const fy = (L + 16) / 116;
    const fx = a / 500 + fy;
    const fz = fy - b / 200;
    const epsilon = 0.008856;
    const kappa = 903.3;
    const inverse = (value: number) => {
        const cube = value ** 3;
        return cube > epsilon ? cube : (116 * value - 16) / kappa;
    };

    const x = (95.047 * inverse(fx)) / 100;
    const y = (100 * inverse(fy)) / 100;
    const z = (108.883 * inverse(fz)) / 100;
    const linear = [
        x * 3.2404542 + y * -1.5371385 + z * -0.4985314,
        x * -0.969266 + y * 1.8760108 + z * 0.041556,
        x * 0.0556434 + y * -0.2040259 + z * 1.0572252,
    ];
    const encode = (value: number) => {
        const srgb = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
        const channel = Math.max(0, Math.min(1, srgb)) * 255;
        return quantize ? Math.round(channel) : channel;
    };
    return [encode(linear[0]), encode(linear[1]), encode(linear[2])];
}

function labHueDegrees(a: number, b: number): number {
    return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
}

/**
 * Lower bound for CIEDE2000 using only its independent lightness term.
 *
 * The chroma/hue portion of the CIEDE2000 quadratic is non-negative, so a
 * pair whose normalized lightness difference already exceeds a threshold
 * cannot pass the complete distance test. This is substantially cheaper than
 * evaluating hue angles, trigonometric weights, and rotation terms.
 */
export function deltaE2000LightnessLowerBound(lab1: Lab, lab2: Lab): number {
    const meanL = (lab1.L + lab2.L) / 2;
    const meanLightnessOffsetSquared = (meanL - 50) ** 2;
    const lightnessScale =
        1 + (0.015 * meanLightnessOffsetSquared) / Math.sqrt(20 + meanLightnessOffsetSquared);
    return Math.abs(lab2.L - lab1.L) / lightnessScale;
}

/** CIEDE2000 color difference between two Lab values. */
export function deltaE2000Lab(lab1: Lab, lab2: Lab): number {
    return deltaE2000LabInternal(lab1, lab2, Infinity);
}

/**
 * Compute CIEDE2000 while allowing exact lower bounds to reject pairs that
 * cannot be within `maximumDistance`. Rejected pairs return Infinity; every
 * surviving pair returns the same full distance as `deltaE2000Lab`.
 */
export function deltaE2000LabWithinRadius(lab1: Lab, lab2: Lab, maximumDistance: number): number {
    return deltaE2000LabInternal(lab1, lab2, Math.max(0, maximumDistance));
}

/**
 * Radius-aware CIEDE2000 for callers that reuse the same Lab values many
 * times. The supplied chromas must be the exact `Math.hypot(a, b)` values.
 */
export function deltaE2000LabWithinRadiusPrepared(
    lab1: Lab,
    chroma1: number,
    lab2: Lab,
    chroma2: number,
    maximumDistance: number
): number {
    return deltaE2000LabInternal(lab1, lab2, Math.max(0, maximumDistance), chroma1, chroma2);
}

function deltaE2000LabInternal(
    lab1: Lab,
    lab2: Lab,
    maximumDistance: number,
    preparedChroma1?: number,
    preparedChroma2?: number
): number {
    const deltaL = lab2.L - lab1.L;
    const meanL = (lab1.L + lab2.L) / 2;
    const meanLightnessOffsetSquared = (meanL - 50) ** 2;
    const lightnessScale =
        1 + (0.015 * meanLightnessOffsetSquared) / Math.sqrt(20 + meanLightnessOffsetSquared);
    const normalizedDeltaL = deltaL / lightnessScale;
    const bounded = Number.isFinite(maximumDistance);
    const conservativeMaximum = maximumDistance + 1e-9;
    if (bounded && Math.abs(normalizedDeltaL) > conservativeMaximum) return Infinity;

    const chroma1 = preparedChroma1 ?? Math.hypot(lab1.a, lab1.b);
    const chroma2 = preparedChroma2 ?? Math.hypot(lab2.a, lab2.b);
    const averageChroma = (chroma1 + chroma2) / 2;
    const g = 0.5 * (1 - Math.sqrt(averageChroma ** 7 / (averageChroma ** 7 + 25 ** 7)));
    const a1 = (1 + g) * lab1.a;
    const a2 = (1 + g) * lab2.a;
    const adjustedChroma1 = Math.hypot(a1, lab1.b);
    const adjustedChroma2 = Math.hypot(a2, lab2.b);
    const deltaChroma = adjustedChroma2 - adjustedChroma1;
    const meanChroma = (adjustedChroma1 + adjustedChroma2) / 2;
    const chromaScale = 1 + 0.045 * meanChroma;
    const normalizedDeltaChroma = deltaChroma / chromaScale;
    if (
        bounded &&
        normalizedDeltaL ** 2 + 0.25 * normalizedDeltaChroma ** 2 > conservativeMaximum ** 2
    ) {
        return Infinity;
    }
    const hue1 = labHueDegrees(a1, lab1.b);
    const hue2 = labHueDegrees(a2, lab2.b);
    const hueSeparation = Math.abs(hue2 - hue1);
    const hueDifference =
        adjustedChroma1 * adjustedChroma2 === 0
            ? 0
            : hueSeparation <= 180
              ? hue2 - hue1
              : hue2 <= hue1
                ? hue2 - hue1 + 360
                : hue2 - hue1 - 360;
    const deltaHue =
        2 *
        Math.sqrt(adjustedChroma1 * adjustedChroma2) *
        Math.sin(((hueDifference / 2) * Math.PI) / 180);
    const adjustedChromaProduct = adjustedChroma1 * adjustedChroma2;
    const meanHue =
        adjustedChromaProduct === 0
            ? hue1 + hue2
            : hueSeparation <= 180
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
    const hueScale = 1 + 0.015 * meanChroma * hueWeight;
    const rotation =
        -2 *
        Math.sqrt(meanChroma ** 7 / (meanChroma ** 7 + 25 ** 7)) *
        Math.sin((60 * Math.exp(-(((meanHue - 275) / 25) ** 2)) * Math.PI) / 180);

    const normalizedDeltaHue = deltaHue / hueScale;
    return Math.sqrt(
        normalizedDeltaL ** 2 +
            normalizedDeltaChroma ** 2 +
            normalizedDeltaHue ** 2 +
            rotation * normalizedDeltaChroma * normalizedDeltaHue
    );
}

/** CIEDE2000 color difference between two sRGB triplets (0-255). */
export function deltaE2000(a: Rgb, b: Rgb): number {
    return deltaE2000Lab(rgbToLab(a), rgbToLab(b));
}
