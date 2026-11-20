import assert from 'node:assert/strict';
import test from 'node:test';
import { reduceThenMatchPalette } from '../src/lib/reduceThenMatchPalette.ts';

test('reduces before matching to overlapping palettes and keeps transparent pixels', async () => {
    const pixels = new Uint8ClampedArray([
        249, 0, 0, 255, 227, 0, 0, 255, 0, 0, 241, 255, 3, 3, 230, 255, 1, 2, 3, 0,
    ]);
    const data = { data: pixels, width: 5, height: 1 } as ImageData;
    await reduceThenMatchPalette(data, 2, [
        '#EE0000',
        '#EE0000',
        '#F90000',
        '#E30000',
        '#0000FF',
        '#FFFFFF',
    ]);
    assert.deepEqual(
        [...pixels],
        [238, 0, 0, 255, 238, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255, 1, 2, 3, 0]
    );
});
