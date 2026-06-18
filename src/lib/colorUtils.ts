/**
 * Shared color utility functions.
 */

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
 * Estimate Transmission Distance (TD) from a hex color.
 *
 * TD is related to how much light passes through the filament:
 * - Darker / more opaque colors usually have lower TD
 * - Lighter / more translucent colors usually have higher TD
 * - Saturation and hue can shift TD slightly around the luminance baseline
 *
 * This heuristic is intentionally conservative and should be replaced by
 * measured calibration data whenever possible.
 */
export function estimateTDFromColor(hex: string): number {
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

    // Clamp to realistic range for PLA filaments
    estimatedTD = Math.max(0.6, Math.min(8.5, estimatedTD));

    // Round to 1 decimal place
    return Math.round(estimatedTD * 10) / 10;
}