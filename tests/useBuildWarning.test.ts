import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialThreeDState } from '../src/hooks/useBuildWarning.ts';

test('saved 3D settings are present in the initial state before persistence runs', () => {
    const state = createInitialThreeDState({
        paintMode: 'autopaint',
        autoPaintMaxHeight: 6.08,
        calibrationLayerHeight: 0.08,
        enhancedColorMatch: true,
        preserveSeparation: true,
        optimizerAlgorithm: 'exact',
        maxRepeatedSwaps: 4,
    });

    assert.equal(state.paintMode, 'autopaint');
    assert.equal(state.autoPaintMaxHeight, 6.08);
    assert.equal(state.calibrationLayerHeight, 0.08);
    assert.equal(state.enhancedColorMatch, true);
    assert.equal(state.preserveSeparation, true);
    assert.equal(state.optimizerAlgorithm, 'exact');
    assert.equal(state.maxRepeatedSwaps, 4);
    assert.deepEqual(state.colorSliceHeights, []);
});
