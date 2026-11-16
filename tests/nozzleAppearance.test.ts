import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateNozzleAppearance } from '../src/lib/nozzleAppearance.ts';
const image = () => {
    const d = new Uint8ClampedArray(64 * 64 * 4);
    for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
            const i = (y * 64 + x) * 4;
            d[i] = x >= 30 && x <= 32 && y > 8 && y < 55 ? 255 : 10;
            d[i + 1] = 10;
            d[i + 2] = 10;
            d[i + 3] = 255;
        }
    return d;
};
const redCount = (d: Uint8ClampedArray) => {
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === 255) n++;
    return n;
};
test('line width changes displayed RGB geometry, not just an overlay', () => {
    const source = image();
    const before = source.slice();
    const fine = estimateNozzleAppearance(64, 64, source, 0.1, 0.21);
    const coarse = estimateNozzleAppearance(64, 64, source, 0.1, 0.42);
    assert(redCount(fine.data) > 0);
    assert.equal(redCount(coarse.data), 0);
    assert(coarse.changedPixelCount > fine.changedPixelCount);
    assert.deepEqual(source, before);
    const enlarged = estimateNozzleAppearance(64, 64, source, 0.2, 0.42);
    assert.deepEqual(enlarged.data, fine.data);
});
test('transparent pixels and alpha survive, and unavailable estimates are explicit', () => {
    const source = image();
    source[3] = 0;
    source[7] = 128;
    const result = estimateNozzleAppearance(64, 64, source, 0.1, 0.42);
    assert.deepEqual(result.data.slice(0, 4), source.slice(0, 4));
    assert.equal(result.data[7], 128);
    const unavailable = estimateNozzleAppearance(64, 64, source, 0.1, 20);
    assert.equal(unavailable.coreCount, 0);
    assert.deepEqual(unavailable.data, source);
});
test('features below the sampling limit remain unchanged, and invalid dimensions fail', () => {
    const source = image();
    assert.deepEqual(estimateNozzleAppearance(64, 64, source, 1, 0.2).data, source);
    assert.throws(() => estimateNozzleAppearance(0, 64, source, 0.1, 0.4));
});
