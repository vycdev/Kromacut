import assert from 'node:assert/strict';
import test from 'node:test';
import type { StackMatrixCalibrationV1 } from '../src/lib/appearanceProfile.ts';
import type { AdaptiveMatrixPlanOptions } from '../src/lib/stackMatrixPlanning.ts';
import {
    adaptiveMatrixFilaments,
    adaptiveStackMatrixFixture,
} from './helpers/adaptiveStackMatrixFixture.ts';
import { loadViteModule } from './helpers/viteModule.ts';

type PlanningModule = typeof import('../src/lib/stackMatrixPlanning.ts');
const planning = loadViteModule<PlanningModule>('/src/lib/stackMatrixPlanning.ts');
const profileFingerprint = 'thin-backing-history-fixture';

function measuredMatrix(depth: number, id = `matrix-${depth}`): StackMatrixCalibrationV1 {
    const record = adaptiveStackMatrixFixture(profileFingerprint);
    const sample = record.samples[0];
    return {
        ...record,
        id,
        foundationLayerThicknesses: [0.1],
        stackLayerCount: depth,
        grid: { ...record.grid, columns: 1 },
        samples: [
            {
                ...sample,
                stack: [...Array<number>(depth - 1).fill(0), 1],
                recipeLayerCount: 1,
                backingPaddingLayerCount: depth - 1,
            },
        ],
        cornerStacks: record.cornerStacks.map((stack) => stack.slice(0, depth)),
    };
}

function options(
    layerCount: number,
    previousMatrices: StackMatrixCalibrationV1[],
    backingHd = 1
): AdaptiveMatrixPlanOptions {
    const predictedColor = measuredMatrix(4).samples[0].predictedColor;
    return {
        filaments: adaptiveMatrixFilaments.map((filament, index) =>
            index === 0 ? { ...filament, td: backingHd } : filament
        ),
        backingIndex: 0,
        layerCount,
        layerHeight: 0.04,
        firstLayerHeight: 0.1,
        foundationLayerThicknesses: [0.1],
        ownerProfileFingerprint: profileFingerprint,
        maximumSamples: 512,
        previousMatrices,
        predictColor: () => predictedColor,
    };
}

test('translucent backing keeps same-cap measured recipes reusable but distinguishes changed padding', async () => {
    const { planAdaptiveStackMatrix } = await planning;
    const previous = measuredMatrix(4);
    const sameCap = planAdaptiveStackMatrix(options(4, [previous]));
    const changedCap = planAdaptiveStackMatrix(options(5, [previous]));
    assert.equal(sameCap.compatibleHistoryCount, 1);
    assert.equal(changedCap.compatibleHistoryCount, 1);
    assert.equal(sameCap.measuredRecipeCount, 1);
    assert.equal(changedCap.measuredRecipeCount, 1);
    assert.equal(sameCap.unmeasuredSampleCount, sameCap.candidates.length - 1);
    assert.equal(changedCap.unmeasuredSampleCount, changedCap.candidates.length);
    assert.ok(changedCap.candidates.some(({ stack }) => stack.join(',') === '0,0,0,0,1'));
});

test('translucent history preserves distinct backing thicknesses while deduplicating exact physical replicas', async () => {
    const { planAdaptiveStackMatrix } = await planning;
    const previous = measuredMatrix(4);
    const deeper = measuredMatrix(5);
    const replica = measuredMatrix(4, 'exact-replica');
    const plan = planAdaptiveStackMatrix(options(5, [previous, deeper, replica]));
    const reordered = planAdaptiveStackMatrix(options(5, [replica, deeper, previous]));
    assert.equal(plan.compatibleHistoryCount, 3);
    assert.equal(plan.measuredRecipeCount, 2);
    assert.equal(plan.unmeasuredSampleCount, plan.candidates.length - 1);
    assert.deepEqual(plan, reordered);
});

test('opaque backing preserves useful-recipe reuse across different thickness caps', async () => {
    const { planAdaptiveStackMatrix } = await planning;
    const plan = planAdaptiveStackMatrix(options(5, [measuredMatrix(4)], 0.05));
    assert.equal(plan.compatibleHistoryCount, 1);
    assert.equal(plan.measuredRecipeCount, 1);
    assert.equal(plan.unmeasuredSampleCount, plan.candidates.length - 1);
    assert.ok(plan.candidates.some(({ stack }) => stack.join(',') === '0,0,0,0,1'));
});
