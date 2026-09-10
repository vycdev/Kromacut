/**
 * sRGB transfer functions and light-space compositing helpers.
 *
 * RGB values shown in the UI are sRGB-encoded display values. Convert them to
 * linear light before applying physical transmission or opacity calculations.
 */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function srgbChannelToLinear(channel: number): number {
    const normalized = clamp(channel, 0, 255) / 255;
    return normalized <= 0.04045
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

export function linearChannelToSrgb(channel: number): number {
    const clamped = clamp(channel, 0, 1);
    const normalized =
        clamped <= 0.0031308
            ? clamped * 12.92
            : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return normalized * 255;
}

/**
 * Composite a transmissive foreground over a background. `transmission` is
 * the fraction of background light that passes through the foreground.
 */
export function blendSrgbChannel(
    background: number,
    foreground: number,
    transmission: number
): number {
    const clampedTransmission = clamp(transmission, 0, 1);
    const backgroundLinear = srgbChannelToLinear(background);
    const foregroundLinear = srgbChannelToLinear(foreground);
    return linearChannelToSrgb(
        foregroundLinear * (1 - clampedTransmission) +
            backgroundLinear * clampedTransmission
    );
}
