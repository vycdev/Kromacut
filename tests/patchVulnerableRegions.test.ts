import test from 'node:test';
import assert from 'node:assert/strict';
import { patchVulnerableRegions } from '../src/lib/patchVulnerableRegions.ts';
import { simulatePrintableFeatures } from '../src/lib/printableFeatures.ts';
const make = (w: number, h: number, color = [20, 20, 20, 255]) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) d.set(color, i * 4);
    return d;
};
const put = (d: Uint8ClampedArray, w: number, x: number, y: number, rgb: number[], alpha = 255) =>
    d.set([...rgb, alpha], (y * w + x) * 4);
const rgb = (d: Uint8ClampedArray, w: number, x: number, y: number) => [
    ...d.slice((y * w + x) * 4, (y * w + x) * 4 + 3),
];
test('merges thin stripe into perceptually closest wider neighbor and reanalysis clears risk', () => {
    const w = 40,
        h = 30,
        d = make(w, h);
    for (let y = 0; y < h; y++) for (let x = 20; x < w; x++) put(d, w, x, y, [200, 20, 20]);
    for (let y = 4; y < 26; y++) put(d, w, 19, y, [210, 25, 25]);
    const input = { width: w, height: h, data: d, pixelSizeMm: 0.1, lineWidthMm: 0.42 };
    const sim = simulatePrintableFeatures(input),
        before = d.slice();
    const patch = patchVulnerableRegions(w, h, d, sim.changeMask);
    assert.equal(patch.changedPixelCount, 22);
    assert.equal(patch.patchedRegionCount, 1);
    assert.equal(patch.unresolvedPixelCount, 0);
    assert.deepEqual(rgb(patch.data, w, 19, 15), [200, 20, 20]);
    assert.deepEqual(d, before);
    assert.equal(
        simulatePrintableFeatures({ ...input, data: patch.data }).diagnostics.changedPixelCount,
        0
    );
    for (let i = 0; i < w * h; i++)
        if (!sim.changeMask[i])
            assert.deepEqual(patch.data.slice(i * 4, i * 4 + 4), d.slice(i * 4, i * 4 + 4));
});
test('never crosses transparency or cascades through another vulnerable region', () => {
    const w = 8,
        h = 6,
        d = make(w, h, [0, 0, 0, 0]),
        mask = new Uint8Array(w * h);
    put(d, w, 1, 2, [120, 30, 30], 128);
    mask[2 * w + 1] = 2;
    put(d, w, 2, 2, [140, 30, 30]);
    mask[2 * w + 2] = 1;
    put(d, w, 3, 2, [160, 30, 30]);
    // Separate same-color island: diagonal-only contact is not a shared edge.
    put(d, w, 5, 4, [120, 30, 30]);
    mask[4 * w + 5] = 2;
    put(d, w, 6, 5, [160, 30, 30]);
    const result = patchVulnerableRegions(w, h, d, mask);
    assert.equal(result.changedPixelCount, 1);
    assert.equal(result.unresolvedPixelCount, 2);
    assert.deepEqual(rgb(result.data, w, 1, 2), [120, 30, 30]);
    assert.deepEqual(rgb(result.data, w, 2, 2), [160, 30, 30]);
    for (let i = 0; i < w * h; i++) {
        assert.equal(result.data[i * 4 + 3], d[i * 4 + 3]);
        if (!d[i * 4 + 3])
            assert.deepEqual(result.data.slice(i * 4, i * 4 + 4), d.slice(i * 4, i * 4 + 4));
    }
});
test('repeated adjacent colors produce deterministic output', () => {
    const w = 5,
        h = 5,
        d = make(w, h, [0, 0, 0, 0]),
        mask = new Uint8Array(w * h);
    put(d, w, 2, 2, [100, 100, 100]);
    mask[12] = 1;
    // Identical candidates on different sides contribute shared boundary contacts.
    put(d, w, 1, 2, [80, 80, 80]);
    put(d, w, 3, 2, [80, 80, 80]);
    put(d, w, 2, 1, [200, 200, 200]);
    const a = patchVulnerableRegions(w, h, d, mask),
        b = patchVulnerableRegions(w, h, d, mask);
    assert.deepEqual(a, b);
    assert.deepEqual(rgb(a.data, w, 2, 2), [80, 80, 80]);
});
test('alpha is preserved for patched regions and nothing changes below line width', () => {
    const d = make(24, 24);
    for (let y = 5; y < 19; y++) put(d, 24, 10, y, [190, 10, 10], 128);
    const options = { width: 24, height: 24, data: d, pixelSizeMm: 0.1, lineWidthMm: 0.42 };
    const mask = simulatePrintableFeatures(options).changeMask;
    const result = patchVulnerableRegions(24, 24, d, mask);
    assert(result.changedPixelCount > 0);
    for (let i = 0; i < 24 * 24; i++) assert.equal(result.data[i * 4 + 3], d[i * 4 + 3]);
    const fine = simulatePrintableFeatures({ ...options, lineWidthMm: 0.05 });
    assert.deepEqual(patchVulnerableRegions(24, 24, d, fine.changeMask).data, d);
    assert.throws(() => patchVulnerableRegions(24, 24, d, new Uint8Array(1)));
});
