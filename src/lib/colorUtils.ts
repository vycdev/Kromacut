/**
 * Shared color utility functions.
 */

import { FRONTLIT_TD_SCALE } from './calibration.ts';

/**
 * Normalize a hex color to canonical `#RRGGBB` uppercase form.
 * Accepts values with or without the leading '#'; anything that is not a
 * 6-digit hex color returns the fallback unchanged.
 */
export function normalizeHexColor(hex: string | undefined, fallback: string): string {
    if (!hex) return fallback;
    const value = hex.startsWith('#') ? hex : `#${hex}`;
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

/**
 * Convert a CSS-ish color string to canonical `#RRGGBB` uppercase form.
 * Accepts `#RGB`, `#RRGGBB` (with or without '#') and `hsl(H S% L%)` /
 * `hsl(H, S%, L%)` strings (the shapes used by built-in palettes).
 * Returns null for anything else.
 */
export function toHex6(color: string): string | null {
    const str = color.trim();
    const raw = str.replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(raw)) {
        return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toUpperCase();
    }
    if (/^[0-9a-f]{6}$/i.test(raw)) {
        return `#${raw}`.toUpperCase();
    }
    const hsl = str.match(
        /^hsl\(\s*([\d.-]+)(?:deg)?(?:\s*,\s*|\s+)([\d.]+)%?(?:\s*,\s*|\s+)([\d.]+)%?\s*\)$/i
    );
    if (hsl) {
        const h = Number(hsl[1]);
        const s = Number(hsl[2]) / 100;
        const l = Number(hsl[3]) / 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const hh = ((h % 360) + 360) % 360;
        const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
        let r1 = 0,
            g1 = 0,
            b1 = 0;
        if (hh < 60) [r1, g1, b1] = [c, x, 0];
        else if (hh < 120) [r1, g1, b1] = [x, c, 0];
        else if (hh < 180) [r1, g1, b1] = [0, c, x];
        else if (hh < 240) [r1, g1, b1] = [0, x, c];
        else if (hh < 300) [r1, g1, b1] = [x, 0, c];
        else [r1, g1, b1] = [c, 0, x];
        const m = l - c / 2;
        const toByte = (v: number) =>
            Math.round(Math.max(0, Math.min(255, (v + m) * 255)))
                .toString(16)
                .padStart(2, '0');
        return `#${toByte(r1)}${toByte(g1)}${toByte(b1)}`.toUpperCase();
    }
    return null;
}

/**
 * Compute perceived luminance (0–1) from a hex color string.
 * Uses the standard sRGB luminance coefficients.
 */
export function hexLuminance(hex: string): number {
    const c = hex.replace('#', '');
    const r = parseInt(c.slice(0, 2), 16) / 255;
    const g = parseInt(c.slice(2, 4), 16) / 255;
    const b = parseInt(c.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Estimate the frontlit hiding distance (mm) from a hex color.
 *
 * Hiding distance is the depth of material at which a filament visually hides
 * what's beneath it:
 * - Darker / more opaque colors hide sooner (smaller value)
 * - Lighter / more translucent colors need more depth (larger value)
 * - Saturation and hue shift the estimate slightly around the luminance baseline
 *
 * The heuristic shape is the historical backlit-TD estimate rescaled by
 * FRONTLIT_TD_SCALE; it is intentionally conservative and should be replaced by
 * measured calibration data whenever possible.
 */
export function estimateHidingDistanceFromColor(hex: string): number {
    const h = hex.replace(/^#/, '');
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;

    // Calculate luminance (perceived brightness)
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Calculate saturation
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;

    // Calculate hue (0-360)
    let hue = 0;
    if (max !== min) {
        if (max === r) {
            hue = ((g - b) / (max - min) + (g < b ? 6 : 0)) * 60;
        } else if (max === g) {
            hue = ((b - r) / (max - min) + 2) * 60;
        } else {
            hue = ((r - g) / (max - min) + 4) * 60;
        }
    }

    // Base TD estimation (direct relationship with luminance):
    // - Black (lum=0.0): TD ≈ 1.0mm (opaque)
    // - Mid-gray (lum=0.5): TD ≈ 3.9mm
    // - White (lum=1.0): TD ≈ 6.8mm (translucent)
    let estimatedTD = 1.0 + luminance * 5.8;

    // Saturation adjustment:
    // Desaturated colors are often more opaque than similarly bright saturated colors.
    // Increase effect strongest in the mid-luminance range.
    if (luminance > 0.2 && luminance < 0.8) {
        const desaturation = 1 - saturation;
        estimatedTD -= desaturation * 0.7;
    }

    // Hue-specific adjustments based on typical filament behavior:
    // Yellow/orange (30-90°): often more translucent, +0.4mm
    if (hue >= 30 && hue < 90 && saturation > 0.3) {
        estimatedTD += 0.4;
    }
    // Blue/cyan (180-240°): moderately translucent, +0.2mm
    else if (hue >= 180 && hue < 240 && saturation > 0.3) {
        estimatedTD += 0.2;
    }
    // Red/magenta: commonly more opaque, -0.2mm
    else if ((hue >= 330 || hue < 30 || (hue >= 270 && hue < 330)) && saturation > 0.3) {
        estimatedTD -= 0.2;
    }

    // Special cases for very light colors (whites)
    if (luminance > 0.95) {
        estimatedTD = 6.5 + (luminance - 0.95) * 12; // Range: ~6.5-7.1mm
    }

    // Special cases for very dark colors (blacks)
    if (luminance < 0.15) {
        estimatedTD = 0.8 + luminance * 2.7; // Range: ~0.8-1.2mm
    }

    // Clamp to realistic range for PLA filaments (still on the legacy TD scale)
    estimatedTD = Math.max(0.6, Math.min(8.5, estimatedTD));

    // Convert the legacy backlit-TD shape to a frontlit hiding distance and
    // round to 2 decimals (values live in roughly 0.06–0.85 mm).
    return Math.round(estimatedTD * FRONTLIT_TD_SCALE * 100) / 100;
}