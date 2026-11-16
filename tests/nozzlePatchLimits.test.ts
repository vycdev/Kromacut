import test from 'node:test';
import assert from 'node:assert/strict';
import { canApplyNozzlePatch, assertNozzlePatchSize } from '../src/lib/nozzlePatchLimits.ts';
import { patchVulnerableRegions } from '../src/lib/patchVulnerableRegions.ts';

test('full-resolution patch limit includes transparent margins and rejects invalid dimensions', () => {
    assert.equal(canApplyNozzlePatch(2000, 2000), true);
    assert.equal(canApplyNozzlePatch(2000, 2001), false);
    for (const [w, h] of [
        [16384, 16384],
        [0, 4],
        [3.5, 4],
        [Infinity, 1],
    ]) {
        assert.equal(canApplyNozzlePatch(w, h), false);
        assert.throws(() => assertNozzlePatchSize(w, h), /4 megapixels/);
    }
    // Reject before attempting any full-image output or traversal allocation.
    assert.throws(
        () => patchVulnerableRegions(16384, 16384, new Uint8ClampedArray(), new Uint8Array()),
        /4 megapixels/
    );
});

test('empty and sparse patch masks preserve output without a full-image traversal queue', () => {
    const data = new Uint8ClampedArray(1024 * 1024 * 4).fill(255);
    const mask = new Uint8Array(1024 * 1024);
    assert.deepEqual(patchVulnerableRegions(1024, 1024, data, mask).data, data);
    const i = 512 * 1024 + 512;
    data.set([0, 0, 0, 128], i * 4);
    mask[i] = 1;
    const patch = patchVulnerableRegions(1024, 1024, data, mask);
    assert.equal(patch.changedPixelCount, 1);
    assert.deepEqual(Array.from(patch.data.slice(i * 4, i * 4 + 4)), [255, 255, 255, 128]);
    assert.deepEqual(Array.from(data.slice(i * 4, i * 4 + 4)), [0, 0, 0, 128]);
});
