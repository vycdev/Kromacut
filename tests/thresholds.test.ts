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
