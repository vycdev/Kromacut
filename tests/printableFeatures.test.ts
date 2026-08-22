import assert from 'node:assert/strict';
import test from 'node:test';

import {
    PRINTABLE_FEATURE_NEIGHBOR_TAKEOVER,
    PRINTABLE_FEATURE_NO_SUPPORT,
    simulatePrintableFeatures,
} from '../src/lib/printableFeatures.ts';

function image(
    width: number,
    height: number,
    colorAt: (x: number, y: number) => readonly [number, number, number, number]
): Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            data.set(colorAt(x, y), (y * width + x) * 4);
        }
    }
    return data;
}

function pixelRgb(data: Uint8ClampedArray, width: number, x: number, y: number) {
    const offset = (y * width + x) * 4;
    return [...data.slice(offset, offset + 4)];
}

test('printable feature simulation leaves regions wider than the line width unchanged', () => {
    const data = image(7, 7, () => [12, 34, 56, 255]);
    const result = simulatePrintableFeatures({
        data,
        width: 7,
        height: 7,
        pixelSizeMm: 0.1,
        lineWidthMm: 0.4,
    });

    assert.deepEqual(result.data, data);
    assert.equal(result.diagnostics.changedPixelCount, 0);
    assert.equal(result.diagnostics.printableColorCount, 1);
});

test('a sub-line-width stripe is identified but retained when omission is off', () => {
    const blue = [20, 60, 200, 255] as const;
    const red = [220, 30, 40, 255] as const;
    const data = image(11, 9, (x) => (x === 5 ? red : blue));
    const result = simulatePrintableFeatures({
        data,
        width: 11,
        height: 9,
        pixelSizeMm: 0.1,
        lineWidthMm: 0.4,
    });

    for (let y = 0; y < 9; y++) {
        assert.deepEqual(pixelRgb(result.data, 11, 5, y), red);
        assert.equal(result.changeMask[y * 11 + 5], PRINTABLE_FEATURE_NEIGHBOR_TAKEOVER);
    }
    assert.equal(result.diagnostics.reassignedPixelCount, 9);
    assert.equal(result.diagnostics.lostColorCount, 0);
    assert.deepEqual(
        result.colorStats.map((stat) => stat.hex),
        ['#143cc8', '#dc1e28']
    );
});

test('at-risk source colors can be omitted by substituting printable neighbors', () => {
    const blue = [20, 60, 200, 255] as const;
    const red = [220, 30, 40, 255] as const;
    const data = image(11, 9, (x) => (x === 5 ? red : blue));
    const result = simulatePrintableFeatures({
        data,
        width: 11,
        height: 9,
        pixelSizeMm: 0.1,
        lineWidthMm: 0.4,
        omitAtRiskPixels: true,
    });

    for (let y = 0; y < 9; y++) {
        assert.deepEqual(pixelRgb(result.data, 11, 5, y), blue);
        assert.equal(result.changeMask[y * 11 + 5], PRINTABLE_FEATURE_NEIGHBOR_TAKEOVER);
    }
    assert.equal(result.diagnostics.omittedPixelCount, 9);
    assert.equal(result.diagnostics.printableOpaquePixelCount, 99);
    assert.equal(result.diagnostics.omitAtRiskPixels, true);
    assert.deepEqual(
        result.colorStats.map((stat) => stat.hex),
        ['#143cc8']
    );
});

test('an isolated component with no printable neighbor remains filled', () => {
    const data = image(7, 7, (x, y) =>
        x >= 2 && x <= 4 && y >= 2 && y <= 4 ? [250, 200, 20, 255] : [0, 0, 0, 0]
    );
    const result = simulatePrintableFeatures({
        data,
        width: 7,
        height: 7,
        pixelSizeMm: 0.1,
        lineWidthMm: 0.4,
    });

    assert.equal(result.diagnostics.unsupportedPixelCount, 9);
    assert.equal(result.diagnostics.printableOpaquePixelCount, 9);
    assert.equal(result.diagnostics.lostColorCount, 0);
    assert.equal(result.changeMask[3 * 7 + 3], PRINTABLE_FEATURE_NO_SUPPORT);
    assert.deepEqual(pixelRgb(result.data, 7, 3, 3), [250, 200, 20, 255]);
});

test('line widths at or below one image pixel are an identity operation', () => {
    const data = image(3, 2, (x, y) => [x * 80, y * 100, 10, 255]);
    const first = simulatePrintableFeatures({
        data,
        width: 3,
        height: 2,
        pixelSizeMm: 0.2,
        lineWidthMm: 0.2,
    });
    const second = simulatePrintableFeatures({
        data,
        width: 3,
        height: 2,
        pixelSizeMm: 0.2,
        lineWidthMm: 0.2,
    });

    assert.deepEqual(first.data, data);
    assert.equal(first.diagnostics.changedPixelCount, 0);
    assert.equal(first.fingerprint, second.fingerprint);
    assert.deepEqual(first.colorStats, second.colorStats);
});
