import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceThenMatchPalette } from '../src/lib/reduceThenMatchPalette.ts';
import { deltaE2000, type Rgb } from '../src/lib/colorDifference.ts';
const fake = (colors: number[][]) =>
    ({ width: colors.length, height: 1, data: new Uint8ClampedArray(colors.flat()) }) as ImageData;
const colors = (d: ImageData) =>
    new Set(
        Array.from({ length: d.width }, (_, i) => [...d.data.slice(i * 4, i * 4 + 3)].join(','))
    );
test('color count is reduced before mapping to a larger combined palette', async () => {
    const data = fake([
        [20, 20, 20, 255],
        [30, 30, 30, 255],
        [200, 30, 30, 255],
        [230, 50, 50, 255],
        [240, 240, 240, 255],
    ]);
    await reduceThenMatchPalette(data, 2, ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF']);
    assert(colors(data).size <= 2);
    assert(
        [...colors(data)].every((c) =>
            ['0,0,0', '255,255,255', '255,0,0', '0,255,0', '0,0,255'].includes(c)
        )
    );
});
test('representatives choose their nearest Delta E00 reference and preserve transparency', async () => {
    const source: Rgb = [183, 64, 39];
    const candidates: Rgb[] = [
        [255, 0, 0],
        [180, 90, 30],
        [128, 0, 0],
    ];
    const nearest = [...candidates].sort(
        (a, b) => deltaE2000(source, a) - deltaE2000(source, b)
    )[0];
    const data = fake([
        [...source, 255],
        [7, 8, 9, 0],
    ]);
    await reduceThenMatchPalette(
        data,
        2,
        candidates.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''))
    );
    assert.deepEqual([...data.data.slice(0, 3)], nearest);
    assert.deepEqual([...data.data.slice(4)], [7, 8, 9, 0]);
});
