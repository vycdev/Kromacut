import test from 'node:test';
import assert from 'node:assert/strict';
import { thresholdPixels, evenThresholds } from '../src/lib/thresholds.ts';
test('exact thresholds enter the next band without changing source', () => {
    const values = [0, 79, 80, 169, 170, 255];
    const src = new Uint8ClampedArray(values.flatMap((v) => [v, v, v, 255]));
    const before = src.slice();
    const out = thresholdPixels(src, [80, 170], ['#000000', '#ff0000', '#ffffff']);
    assert.deepEqual(
        Array.from(out),
        [
            0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255, 255,
            255, 255, 255,
        ]
    );
    assert.deepEqual(src, before);
});
test('transparency and arbitrary band counts', () => {
    for (let count = 2; count <= 64; count++) {
        const t = evenThresholds(count);
        assert.equal(t.length, count - 1);
        const out = thresholdPixels(
            new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 32]),
            t,
            Array(count).fill('#123456')
        );
        assert.equal(out[3], 0);
        assert.equal(out[7], 32);
    }
    assert.throws(() =>
        thresholdPixels(new Uint8ClampedArray(4), [80, 80], ['#000000', '#888888', '#ffffff'])
    );
});
test('threshold bands sort by brightness while preserving picker identity', async () => {
    const { orderedThresholdBands } = await import('../src/lib/thresholds.ts');
    const palette = ['#ffffff', '#ff0000', '#000000', '#888888'];
    assert.deepEqual(
        orderedThresholdBands(palette).map((b) => b.color),
        ['#000000', '#ff0000', '#888888', '#ffffff']
    );
    assert.deepEqual(
        orderedThresholdBands(palette).map((b) => b.id),
        [2, 1, 3, 0]
    );
    assert.deepEqual(palette, ['#ffffff', '#ff0000', '#000000', '#888888']);
});

test('lookup matches brightness bands at every boundary for 2–64 colors', () => {
    const source = new Uint8ClampedArray(
        Array.from({ length: 256 }, (_, v) => [v, v, v, v]).flat()
    );
    const before = source.slice();
    for (let count = 2; count <= 64; count++) {
        const thresholds = evenThresholds(count);
        const rgb = Array.from({ length: count }, (_, i) => [i * 3, 255 - i * 2, i * 4]);
        const colors = rgb.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''));
        const actual = thresholdPixels(source, thresholds, colors);
        for (let value = 0; value < 256; value++) {
            const band = thresholds.filter((boundary) => boundary <= value).length;
            assert.deepEqual(Array.from(actual.slice(value * 4, value * 4 + 4)), [
                ...rgb[band],
                value,
            ]);
        }
    }
    assert.deepEqual(source, before);
    // Weighted brightness, rather than just the red channel or an RGB mean.
    assert.deepEqual(
        Array.from(
            thresholdPixels(
                new Uint8ClampedArray([255, 0, 0, 73, 0, 255, 0, 91]),
                [100],
                ['#123456', '#abcdef']
            )
        ),
        [18, 52, 86, 73, 171, 205, 239, 91]
    );
});
