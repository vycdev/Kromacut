import assert from 'node:assert/strict';
import test from 'node:test';

import {
    PRINTABLE_FEATURE_NEIGHBOR_TAKEOVER,
    PRINTABLE_FEATURE_NO_SUPPORT,
    concealPrintableFeatureBuffers,
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

test('large printable buffers stay accessible without generic enumeration', () => {
    const data = new Uint8ClampedArray([1, 2, 3, 255]);
    const changeMask = new Uint8Array([PRINTABLE_FEATURE_NEIGHBOR_TAKEOVER]);
    const simulation = concealPrintableFeatureBuffers({ data, changeMask });

    assert.equal(simulation.data, data);
    assert.equal(simulation.changeMask, changeMask);
    assert.equal(Object.keys(simulation).includes('data'), false);
    assert.equal(Object.keys(simulation).includes('changeMask'), false);
});

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
    const omissionEnabled = simulatePrintableFeatures({
        data,
        width: 11,
        height: 9,
        pixelSizeMm: 0.1,
        lineWidthMm: 0.4,
        omitAtRiskPixels: true,
    });
    assert.deepEqual(omissionEnabled.data, result.data);
    assert.deepEqual(omissionEnabled.changeMask, result.changeMask);
    assert.notEqual(omissionEnabled.fingerprint, result.fingerprint);
});

test('long sub-line-width stripes are retained even when omission is on', () => {
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
        assert.deepEqual(pixelRgb(result.data, 11, 5, y), red);
        assert.equal(result.changeMask[y * 11 + 5], PRINTABLE_FEATURE_NEIGHBOR_TAKEOVER);
    }
    assert.equal(result.diagnostics.omittedPixelCount, 0);
    assert.equal(result.diagnostics.eligibleSpeckPixelCount, 0);
    assert.equal(result.diagnostics.retainedRiskPixelCount, 9);
    assert.equal(result.diagnostics.printableOpaquePixelCount, 99);
    assert.equal(result.diagnostics.omitAtRiskPixels, true);
    assert.deepEqual(
        result.colorStats.map((stat) => stat.hex),
        ['#143cc8', '#dc1e28']
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

const BLUE = [20, 60, 200, 255] as const;
const RED = [220, 30, 40, 255] as const;
const GREEN = [30, 180, 60, 255] as const;
const CLEAR = [0, 0, 0, 0] as const;

function simulate(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    lineWidthMm = 0.4,
    pixelSizeMm = 0.1,
    omitAtRiskPixels = true
) {
    return simulatePrintableFeatures({
        data,
        width,
        height,
        lineWidthMm,
        pixelSizeMm,
        omitAtRiskPixels,
    });
}

test('a 0.40 mm stripe is not erased or flagged at a 0.21 mm line width', () => {
    const data = image(13, 13, (x) => (x === 6 || x === 7 ? RED : BLUE));
    const result = simulate(data, 13, 13, 0.21, 0.2);

    assert.deepEqual(result.data, data);
    assert.equal(result.diagnostics.changedPixelCount, 0);
    assert.equal(result.diagnostics.omittedPixelCount, 0);
    assert.equal(result.diagnostics.printableColorCount, 2);
});

for (const stripeWidth of [2, 4]) {
    test(`a ${stripeWidth}-pixel stripe exactly as wide as the line width has a printable core`, () => {
        const data = image(21, 21, (x) => (x >= 9 && x < 9 + stripeWidth ? RED : BLUE));
        const result = simulate(data, 21, 21, stripeWidth * 0.1);

        assert.deepEqual(result.data, data);
        assert.equal(result.diagnostics.changedPixelCount, 0);
        assert.equal(result.diagnostics.omittedPixelCount, 0);
    });
}

test('diagonal bands use their physical boundary distance rather than an eight-neighbor penalty', () => {
    // The staircase band is more than 2.1 pixels across away from its clipped ends.
    const data = image(25, 25, (x, y) => (x - y >= 0 && x - y < 4 ? RED : BLUE));
    const result = simulate(data, 25, 25, 0.21);

    assert.deepEqual(result.data, data);
    assert.equal(result.diagnostics.changedPixelCount, 0);
    assert.equal(result.diagnostics.omittedPixelCount, 0);
});

test('single-pixel diagonal paths are one protected component, not a collection of specks', () => {
    const data = image(19, 19, (x, y) => (x === y && x >= 5 && x <= 13 ? RED : BLUE));
    const result = simulate(data, 19, 19);

    assert.deepEqual(result.data, data);
    assert.equal(result.diagnostics.changedPixelCount, 9);
    assert.equal(result.diagnostics.eligibleSpeckPixelCount, 0);
    assert.equal(result.diagnostics.omittedPixelCount, 0);
    assert.equal(result.diagnostics.retainedRiskPixelCount, 9);
});

test('a component with a printable core retains its thin tails and every boundary pixel', () => {
    const data = image(25, 25, (x, y) => {
        const body = x >= 9 && x <= 15 && y >= 9 && y <= 15;
        const tail = y === 12 && x >= 3 && x <= 21;
        return body || tail ? RED : BLUE;
    });
    const result = simulate(data, 25, 25);

    assert.deepEqual(result.data, data);
    assert.equal(result.diagnostics.changedPixelCount, 0);
    assert.equal(result.diagnostics.omittedPixelCount, 0);
});

for (const secondComponent of ['line', 'wide region'] as const) {
    test(`a color appearing in a ${secondComponent} protects its separate tiny specks globally`, () => {
        const data = image(25, 25, (x, y) => {
            const speck = x === 4 && y === 4;
            const detail =
                secondComponent === 'line'
                    ? x === 16 && y >= 9 && y <= 19
                    : x >= 13 && x <= 19 && y >= 13 && y <= 19;
            return speck || detail ? RED : BLUE;
        });
        const result = simulate(data, 25, 25);

        assert.deepEqual(result.data, data);
        assert.equal(result.diagnostics.eligibleSpeckPixelCount, 0);
        assert.equal(result.diagnostics.omittedPixelCount, 0);
        assert.equal(result.diagnostics.lostColorCount, 0);
        assert.equal(result.changeMask[4 * 25 + 4], PRINTABLE_FEATURE_NEIGHBOR_TAKEOVER);
    });
}

test('only a color made entirely of enclosed compact specks is omitted', () => {
    const data = image(21, 21, (x, y) =>
        (x === 6 && y === 6) || (x === 14 && y === 14) ? RED : BLUE
    );
    const result = simulate(data, 21, 21);

    assert.deepEqual(
        result.data,
        image(21, 21, () => BLUE)
    );
    assert.equal(result.diagnostics.eligibleSpeckPixelCount, 2);
    assert.equal(result.diagnostics.omittedPixelCount, 2);
    assert.equal(result.diagnostics.retainedRiskPixelCount, 0);
    assert.equal(result.diagnostics.changedPixelCount, 2);
    assert.equal(result.diagnostics.lostColorCount, 1);
    assert.deepEqual(
        result.colorStats.map((stat) => [stat.hex, stat.count]),
        [['#143cc8', 441]]
    );
});

test('multi-pixel specks can be omitted only when their full bounding diagonal fits inside the line width', () => {
    for (const side of [2, 3]) {
        const data = image(21, 21, (x, y) =>
            x >= 9 && x < 9 + side && y >= 9 && y < 9 + side ? RED : BLUE
        );
        const result = simulate(data, 21, 21);
        const omitted = side === 2 ? 4 : 0;

        assert.equal(result.diagnostics.eligibleSpeckPixelCount, omitted);
        assert.equal(result.diagnostics.omittedPixelCount, omitted);
        assert.deepEqual(result.data, side === 2 ? image(21, 21, () => BLUE) : data);
    }
});

test('a speck exactly at the bounding-diagonal cutoff is conservatively retained', () => {
    const data = image(15, 15, (x, y) => (x === 7 && y === 7 ? RED : BLUE));
    const result = simulate(data, 15, 15, Math.SQRT2 * 0.1);

    assert.deepEqual(result.data, data);
    assert.equal(result.diagnostics.eligibleSpeckPixelCount, 0);
    assert.equal(result.diagnostics.omittedPixelCount, 0);
});

test('a compact speck between multiple surrounding colors is not reassigned', () => {
    const data = image(21, 21, (x, y) => {
        if (x === 10 && y === 10) return RED;
        return x < 10 ? BLUE : GREEN;
    });
    const result = simulate(data, 21, 21);

    assert.deepEqual(result.data, data);
    assert.equal(result.diagnostics.eligibleSpeckPixelCount, 0);
    assert.equal(result.diagnostics.omittedPixelCount, 0);
});

test('a speck touching transparency, including diagonally, is protected', () => {
    const data = image(15, 15, (x, y) => {
        if (x === 7 && y === 7) return RED;
        if (x === 6 && y === 6) return CLEAR;
        return BLUE;
    });
    const result = simulate(data, 15, 15);

    assert.deepEqual(result.data, data);
    assert.equal(result.diagnostics.eligibleSpeckPixelCount, 0);
    assert.equal(result.diagnostics.omittedPixelCount, 0);
});

test('a component at the image border protects all other components of its source color', () => {
    const data = image(15, 15, (x, y) =>
        (x === 0 && y === 7) || (x === 9 && y === 9) ? RED : BLUE
    );
    const result = simulate(data, 15, 15);

    assert.deepEqual(result.data, data);
    assert.equal(result.diagnostics.eligibleSpeckPixelCount, 0);
    assert.equal(result.diagnostics.omittedPixelCount, 0);
});

test('a speck has no supported replacement when its sole neighbor has no printable core', () => {
    const data = image(9, 3, (x, y) => (x === 4 && y === 1 ? RED : BLUE));
    const result = simulate(data, 9, 3);

    assert.deepEqual(result.data, data);
    assert.equal(result.changeMask[1 * 9 + 4], PRINTABLE_FEATURE_NO_SUPPORT);
    assert.equal(result.diagnostics.unsupportedPixelCount, 27);
    assert.equal(result.diagnostics.eligibleSpeckPixelCount, 0);
    assert.equal(result.diagnostics.omittedPixelCount, 0);
});

test('unsupported nested specks do not cascade into replacement through the outer color', () => {
    const data = image(21, 21, (x, y) => {
        if (x === 10 && y === 10) return RED;
        if (x >= 9 && x <= 11 && y >= 9 && y <= 11) return GREEN;
        return BLUE;
    });
    const result = simulate(data, 21, 21, 0.5);

    assert.deepEqual(result.data, data);
    assert.equal(result.diagnostics.eligibleSpeckPixelCount, 0);
    assert.equal(result.diagnostics.omittedPixelCount, 0);
    assert.equal(result.diagnostics.printableColorCount, 3);
});

test('risk and omission results rotate and mirror without raster traversal bias', () => {
    const side = 25;
    const data = image(side, side, (x, y) => {
        if (x === 4 && y === 7) return RED;
        if (x - y === 5 && x >= 12 && x <= 19) return GREEN;
        return BLUE;
    });
    const result = simulate(data, side, side);
    const transforms = [
        (x: number, y: number) => [side - 1 - y, x] as const,
        (x: number, y: number) => [side - 1 - x, y] as const,
    ];

    for (const transform of transforms) {
        const transformedData = image(side, side, (x, y) => {
            const [sourceX, sourceY] = transform(x, y);
            return pixelRgb(data, side, sourceX, sourceY) as [number, number, number, number];
        });
        const transformedResult = simulate(transformedData, side, side);
        assert.deepEqual(transformedResult.diagnostics, result.diagnostics);
        for (let y = 0; y < side; y++) {
            for (let x = 0; x < side; x++) {
                const [sourceX, sourceY] = transform(x, y);
                assert.deepEqual(
                    pixelRgb(transformedResult.data, side, x, y),
                    pixelRgb(result.data, side, sourceX, sourceY)
                );
                assert.equal(
                    transformedResult.changeMask[y * side + x],
                    result.changeMask[sourceY * side + sourceX]
                );
            }
        }
    }
});

test('omission diagnostics distinguish eligible specks from retained risks without mutating the source', () => {
    const data = image(21, 21, (x, y) => {
        if (x === 6 && y === 6) return [RED[0], RED[1], RED[2], 128];
        if (x === 14 && y >= 5 && y <= 15) return GREEN;
        if (x === 0 && y === 0) return [91, 92, 93, 0];
        return BLUE;
    });
    const original = new Uint8ClampedArray(data);
    const off = simulate(data, 21, 21, 0.4, 0.1, false);
    const on = simulate(data, 21, 21);
    const repeated = simulate(data, 21, 21);

    assert.deepEqual(data, original);
    assert.notEqual(on.data, data);
    assert.deepEqual(off.data, data);
    assert.deepEqual(off.changeMask, on.changeMask);
    assert.equal(off.diagnostics.eligibleSpeckPixelCount, 1);
    assert.equal(on.diagnostics.eligibleSpeckPixelCount, 1);
    assert.equal(off.diagnostics.omittedPixelCount, 0);
    assert.equal(on.diagnostics.omittedPixelCount, 1);
    assert.equal(off.diagnostics.retainedRiskPixelCount, 12);
    assert.equal(on.diagnostics.retainedRiskPixelCount, 11);
    assert.equal(on.diagnostics.changedPixelCount, 12);
    assert.equal(on.diagnostics.affectedFraction, 12 / 440);
    assert.equal(on.diagnostics.sourceOpaquePixelCount, 440);
    assert.equal(on.diagnostics.printableOpaquePixelCount, 440);
    assert.equal(off.diagnostics.sourceColorCount, 3);
    assert.equal(off.diagnostics.printableColorCount, 3);
    assert.equal(on.diagnostics.printableColorCount, 2);
    assert.equal(on.diagnostics.lostColorCount, 1);
    assert.deepEqual(
        on.colorStats.map((stat) => [stat.hex, stat.count]),
        [
            ['#143cc8', 429],
            ['#1eb43c', 11],
        ]
    );
    assert.deepEqual(pixelRgb(on.data, 21, 6, 6), [BLUE[0], BLUE[1], BLUE[2], 128]);
    assert.deepEqual(pixelRgb(on.data, 21, 0, 0), [91, 92, 93, 0]);
    for (let pixel = 0; pixel < 21 * 21; pixel++) {
        assert.equal(on.data[pixel * 4 + 3], data[pixel * 4 + 3]);
    }
    assert.equal(on.fingerprint, repeated.fingerprint);
    assert.deepEqual(on.colorStats, repeated.colorStats);
    assert.notEqual(off.fingerprint, on.fingerprint);
    assert.notEqual(on.fingerprint, simulate(data, 21, 21, 0.41).fingerprint);
    assert.notEqual(on.fingerprint, simulate(data, 21, 21, 0.4, 0.11).fingerprint);
});
