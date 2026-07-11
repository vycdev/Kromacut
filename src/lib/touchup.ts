/**
 * Hard-edged pixel algorithms for the 2D touch-up tools (brush, eraser, fill,
 * text). Every tool is deliberately aliased: the 2D image is usually quantized
 * to a small palette, and anti-aliased edges would leak blended colors into
 * the palette that then flow into color slicing and the 3D model.
 */

/** A canvas-free view of RGBA pixel data (structurally matches ImageData). */
export interface PixelSurface {
    data: Uint8ClampedArray;
    width: number;
    height: number;
}

/**
 * One horizontal run of a brush stamp, relative to the cursor pixel:
 * paint columns `dx0..dx1` (inclusive) on row `dy`.
 */
export interface BrushSpan {
    dy: number;
    dx0: number;
    dx1: number;
}

/** A brush span clipped and positioned within an image. */
export interface PositionedBrushSpan {
    y: number;
    x0: number;
    x1: number;
}

/** Parses a six-digit brush color into RGB channels. */
export function parseHexColor(hex: string): [number, number, number] | null {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!match) return null;
    const value = Number.parseInt(match[1], 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Hard-edged circular brush footprint for a given diameter in image pixels.
 * A pixel is included when its center lies inside the circle of radius
 * `size / 2` centered on the stamp box, so size 1 is a single pixel, size 2 a
 * 2x2 square, and larger sizes progressively rounder aliased discs.
 */
export function brushSpans(size: number): BrushSpan[] {
    const s = Math.max(1, Math.floor(size));
    const offset = Math.floor((s - 1) / 2);
    const center = (s - 1) / 2;
    const radiusSq = (s / 2) ** 2;
    const spans: BrushSpan[] = [];

    for (let j = 0; j < s; j++) {
        let first = -1;
        let last = -1;
        for (let i = 0; i < s; i++) {
            const distSq = (i - center) ** 2 + (j - center) ** 2;
            if (distSq > radiusSq) continue;
            if (first === -1) first = i;
            last = i;
        }
        if (first === -1) continue;
        spans.push({ dy: j - offset, dx0: first - offset, dx1: last - offset });
    }

    return spans;
}

/** Positions a brush footprint and clips every span to the image bounds. */
export function clipBrushSpans(
    spans: readonly BrushSpan[],
    centerX: number,
    centerY: number,
    width: number,
    height: number
): PositionedBrushSpan[] {
    if (width <= 0 || height <= 0) return [];

    const clipped: PositionedBrushSpan[] = [];
    for (const span of spans) {
        const y = centerY + span.dy;
        if (y < 0 || y >= height) continue;

        const x0 = Math.max(0, centerX + span.dx0);
        const x1 = Math.min(width - 1, centerX + span.dx1);
        if (x0 <= x1) clipped.push({ y, x0, x1 });
    }
    return clipped;
}

/**
 * Stamps a brush footprint into a CPU-side pixel buffer. An alpha of 0 writes
 * the canonical transparent pixel (0,0,0,0) used across the app. Returns true
 * when any pixel actually changed, so no-op strokes (painting a color onto
 * itself) can skip creating a history entry — without any canvas readbacks.
 */
export function stampSpansIntoSurface(
    surface: PixelSurface,
    centerX: number,
    centerY: number,
    spans: readonly BrushSpan[],
    rgba: [number, number, number, number]
): boolean {
    const { data, width, height } = surface;
    const [r, g, b, a] = rgba[3] === 0 ? [0, 0, 0, 0] : rgba;
    let changed = false;

    for (const span of clipBrushSpans(spans, centerX, centerY, width, height)) {
        let idx = (span.y * width + span.x0) * 4;
        for (let x = span.x0; x <= span.x1; x++, idx += 4) {
            if (
                data[idx] !== r ||
                data[idx + 1] !== g ||
                data[idx + 2] !== b ||
                data[idx + 3] !== a
            ) {
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = a;
                changed = true;
            }
        }
    }

    return changed;
}

/**
 * Scanline flood fill, 4-connected, matching the seed pixel's exact RGBA.
 * A fill alpha of 0 writes the canonical transparent pixel (0,0,0,0). Returns
 * false without touching pixels when the seed is out of bounds or already has
 * the fill color.
 */
export function floodFill(
    surface: PixelSurface,
    x: number,
    y: number,
    fill: [number, number, number, number]
): boolean {
    const { data, width, height } = surface;
    if (x < 0 || y < 0 || x >= width || y >= height) return false;

    const seedIdx = (y * width + x) * 4;
    const sr = data[seedIdx];
    const sg = data[seedIdx + 1];
    const sb = data[seedIdx + 2];
    const sa = data[seedIdx + 3];
    const [fr, fg, fb, fa] = fill[3] === 0 ? [0, 0, 0, 0] : fill;
    if (sr === fr && sg === fg && sb === fb && sa === fa) return false;

    const matches = (idx: number) =>
        data[idx] === sr && data[idx + 1] === sg && data[idx + 2] === sb && data[idx + 3] === sa;

    const stack: number[] = [x, y];
    while (stack.length > 0) {
        const sy = stack.pop() as number;
        let sx = stack.pop() as number;
        let idx = (sy * width + sx) * 4;

        // Walk to the left edge of this run of seed-colored pixels.
        while (sx > 0 && matches(idx - 4)) {
            sx--;
            idx -= 4;
        }

        let spanAbove = false;
        let spanBelow = false;
        while (sx < width && matches(idx)) {
            data[idx] = fr;
            data[idx + 1] = fg;
            data[idx + 2] = fb;
            data[idx + 3] = fa;

            if (sy > 0) {
                const above = matches(idx - width * 4);
                if (above && !spanAbove) {
                    stack.push(sx, sy - 1);
                    spanAbove = true;
                } else if (!above) {
                    spanAbove = false;
                }
            }
            if (sy < height - 1) {
                const below = matches(idx + width * 4);
                if (below && !spanBelow) {
                    stack.push(sx, sy + 1);
                    spanBelow = true;
                } else if (!below) {
                    spanBelow = false;
                }
            }

            sx++;
            idx += 4;
        }
    }

    return true;
}

/** Alpha cutoff above which a rendered text pixel is kept as fully opaque. */
export const TEXT_ALPHA_THRESHOLD = 128;

/**
 * Hardens anti-aliased RGBA pixels (e.g. rendered text) into exactly two
 * values: the given opaque color where alpha reaches the threshold, and the
 * canonical transparent pixel (0,0,0,0) everywhere else.
 */
export function hardenAlphaToColor(data: Uint8ClampedArray, rgb: [number, number, number]): void {
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] >= TEXT_ALPHA_THRESHOLD) {
            data[i] = rgb[0];
            data[i + 1] = rgb[1];
            data[i + 2] = rgb[2];
            data[i + 3] = 255;
        } else {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = 0;
        }
    }
}

/**
 * Greedy word wrap matching a `white-space: pre-wrap; word-break: break-word`
 * text box: explicit newlines are kept, lines break at spaces when the next
 * word would overflow `maxWidth`, and a single word wider than the box is
 * broken mid-word. `measure` returns the rendered width of a string, so the
 * committed canvas text wraps like the on-screen draft box it previews.
 */
export function wrapTextLines(
    text: string,
    maxWidth: number,
    measure: (s: string) => number
): string[] {
    const lines: string[] = [];

    const pushBrokenWord = (word: string): string => {
        // Break an over-wide word into full-width chunks; the remainder
        // becomes the start of the current line.
        let chunk = '';
        for (const char of word) {
            if (chunk && measure(chunk + char) > maxWidth) {
                lines.push(chunk);
                chunk = char;
            } else {
                chunk += char;
            }
        }
        return chunk;
    };

    for (const paragraph of text.split('\n')) {
        let current = '';
        for (const word of paragraph.split(' ')) {
            const candidate = current ? `${current} ${word}` : word;
            if (measure(candidate) <= maxWidth) {
                current = candidate;
                continue;
            }
            if (current) {
                lines.push(current);
                current = '';
            }
            current = measure(word) > maxWidth ? pushBrokenWord(word) : word;
        }
        lines.push(current);
    }

    return lines;
}

/** Formats RGB channels as a lowercase `#rrggbb` string. */
export function rgbToHex(r: number, g: number, b: number): string {
    const channel = (v: number) =>
        Math.max(0, Math.min(255, Math.round(v)))
            .toString(16)
            .padStart(2, '0');
    return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Integer points of a stroke segment (Bresenham), inclusive of both
 * endpoints, so stamping every point leaves no gaps between pointer samples.
 */
export function strokeLinePoints(
    x0: number,
    y0: number,
    x1: number,
    y1: number
): Array<[number, number]> {
    const points: Array<[number, number]> = [];
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;

    for (;;) {
        points.push([x, y]);
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
            err += dy;
            x += sx;
        }
        if (e2 <= dx) {
            err += dx;
            y += sy;
        }
    }

    return points;
}
