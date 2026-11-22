import { readPngFixture } from '../imageFixtures.ts';
import { rgbToHsl } from '../../src/lib/color.ts';

export function imageSwatches(path: string): Array<{ hex: string; count: number }> {
    const image = readPngFixture(path);
    const counts = new Map<number, number>();
    for (let index = 0; index < image.rgba.length; index += 4) {
        if (image.rgba[index + 3] === 0) continue;
        const key =
            (image.rgba[index] << 16) | (image.rgba[index + 1] << 8) | image.rgba[index + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const swatches = Array.from(counts, ([rgb, count]) => {
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = rgb & 0xff;
        return {
            hex: `#${rgb.toString(16).padStart(6, '0')}`,
            count,
            hsl: rgbToHsl(r, g, b),
        };
    });
    swatches.sort((left, right) => {
        if (left.hsl.h !== right.hsl.h) return left.hsl.h - right.hsl.h;
        if (left.hsl.s !== right.hsl.s) return right.hsl.s - left.hsl.s;
        return right.hsl.l - left.hsl.l;
    });
    // Match useSwatches exactly: colors are presented darkest-to-lightest by
    // reversing the shared HSL ordering before they enter auto-paint.
    return swatches.reverse().map(({ hex, count }) => ({ hex, count }));
}
