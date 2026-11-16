import test from 'node:test';
import assert from 'node:assert/strict';
import { opaqueBounds } from '../src/lib/opaqueBounds.ts';

test('opaque bounds retain faint edge pixels and exclude transparent margins', () => {
    const pixels = new Uint8ClampedArray(13 * 9 * 4);
    pixels[(2 * 13 + 3) * 4 + 3] = 255;
    pixels[(7 * 13 + 11) * 4 + 3] = 1;
    assert.deepEqual(opaqueBounds(pixels, 13, 9), { x: 3, y: 2, width: 9, height: 6 });
    pixels[(8 * 13 + 12) * 4 + 3] = 255;
    assert.deepEqual(opaqueBounds(pixels, 13, 9), { x: 3, y: 2, width: 10, height: 7 });
});

test('opaque bounds distinguish empty images from a single pixel', () => {
    const pixels = new Uint8ClampedArray(4 * 3 * 4);
    assert.equal(opaqueBounds(pixels, 4, 3), null);
    pixels[(2 * 4 + 3) * 4 + 3] = 128;
    assert.deepEqual(opaqueBounds(pixels, 4, 3), { x: 3, y: 2, width: 1, height: 1 });
});
