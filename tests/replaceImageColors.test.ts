import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceImageColors } from '../src/lib/replaceImageColors.ts';
test('simultaneous replacements preserve transparency and do not cascade', () => {
    const data = new Uint8ClampedArray([
        255, 0, 0, 255, 0, 0, 255, 128, 255, 0, 0, 0, 1, 2, 3, 255,
    ]);
    replaceImageColors(data, { '#FF0000': '#0000FF', '#0000FF': '#FF0000' });
    assert.deepEqual([...data], [0, 0, 255, 255, 255, 0, 0, 128, 255, 0, 0, 0, 1, 2, 3, 255]);
});
