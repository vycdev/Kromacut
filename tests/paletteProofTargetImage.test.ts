import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildPaletteProofTargetHighlight,
    buildPaletteProofTargetPreview,
    paletteProofRgbKey,
    paletteProofTargetImageSize,
    paletteProofTargetKeyAt,
} from '../src/lib/paletteProofTargetImage.ts';

test('target image lookup returns the exact opaque processed color', () => {
    const pixels = new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 0, 12, 34, 56, 255,
    ]);

    assert.equal(paletteProofTargetKeyAt(pixels, 2, 2, 0.9, 0.1), paletteProofRgbKey(255, 0, 0));
    assert.equal(paletteProofTargetKeyAt(pixels, 2, 2, 1.8, 1.2), paletteProofRgbKey(12, 34, 56));
    assert.equal(paletteProofTargetKeyAt(pixels, 2, 2, 0, 1), null);
    assert.equal(paletteProofTargetKeyAt(pixels, 2, 2, 2, 0), null);
});

test('target image highlight preserves selected colors and dims the rest', () => {
    const pixels = new Uint8ClampedArray([200, 100, 50, 255, 40, 80, 120, 255, 10, 20, 30, 0]);
    const highlighted = buildPaletteProofTargetHighlight(
        pixels,
        new Set([paletteProofRgbKey(200, 100, 50)]),
        0.25
    );

    assert.deepEqual([...highlighted], [200, 100, 50, 255, 10, 20, 30, 255, 10, 20, 30, 0]);
    assert.deepEqual([...pixels], [200, 100, 50, 255, 40, 80, 120, 255, 10, 20, 30, 0]);
});

test('target image preview uses the supplied fitted colors before highlighting', () => {
    const pixels = new Uint8ClampedArray([200, 100, 50, 255, 40, 80, 120, 255]);
    const fittedRed = [20, 30, 40] as const;
    const fittedBlue = [100, 120, 140] as const;
    const preview = buildPaletteProofTargetPreview(
        pixels,
        new Map<number, readonly [number, number, number]>([
            [paletteProofRgbKey(200, 100, 50), fittedRed],
            [paletteProofRgbKey(40, 80, 120), fittedBlue],
        ]),
        new Set([paletteProofRgbKey(...fittedRed)]),
        0.5
    );

    assert.deepEqual([...preview], [20, 30, 40, 255, 50, 60, 70, 255]);
});

test('target image sampling stays within the dimension cap', () => {
    assert.deepEqual(paletteProofTargetImageSize(1800, 900), { width: 900, height: 450 });
    assert.deepEqual(paletteProofTargetImageSize(500, 400), { width: 500, height: 400 });
    assert.deepEqual(paletteProofTargetImageSize(0, 400), { width: 0, height: 0 });
});
