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

/** CIEDE2000 color difference between two Lab values. */
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
        Math.sin(((60 * Math.exp(-(((meanHue - 275) / 25) ** 2))) * Math.PI) / 180);

    return Math.sqrt(
        (deltaL / lightnessScale) ** 2 +
            (deltaChroma / chromaScale) ** 2 +
            (deltaHue / hueScale) ** 2 +
            rotation * (deltaChroma / chromaScale) * (deltaHue / hueScale)
    );
}

/** CIEDE2000 color difference between two sRGB triplets (0-255). */
export function deltaE2000(a: Rgb, b: Rgb): number {
    return deltaE2000Lab(rgbToLab(a), rgbToLab(b));
}
