import assert from 'node:assert/strict';
import test from 'node:test';
import {
    HIGH_AUTO_PAINT_TARGET_COUNT,
    needsAutoPaintSearchGuidance,
} from '../src/lib/autoPaintSearchPolicy.ts';

test('enhanced search pauses at the measured distinct-target threshold, regardless of pixel count', () => {
    assert.equal(HIGH_AUTO_PAINT_TARGET_COUNT, 1024);
    assert.equal(needsAutoPaintSearchGuidance(512, true), false);
    assert.equal(needsAutoPaintSearchGuidance(1023, true), false);
    assert.equal(needsAutoPaintSearchGuidance(1024, true), true);
    assert.equal(needsAutoPaintSearchGuidance(4096, true), true);
    assert.equal(needsAutoPaintSearchGuidance(142066, true), true);
    assert.equal(needsAutoPaintSearchGuidance(16, true), false);
    assert.equal(needsAutoPaintSearchGuidance(142066, false), false);
});
