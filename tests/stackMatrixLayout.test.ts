import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdaptiveMatrixCandidate } from '../src/lib/stackMatrixPlanning.ts';
import { loadViteModule } from './helpers/viteModule.ts';

type PlanningModule = typeof import('../src/lib/stackMatrixPlanning.ts');
const planning = loadViteModule<PlanningModule>('/src/lib/stackMatrixPlanning.ts');

function candidate(
    stack: number[],
    backingPaddingLayerCount = 0,
    selectionReason: AdaptiveMatrixCandidate['selectionReason'] = 'coverage'
): AdaptiveMatrixCandidate {
    return {
        stack,
        recipeLayerCount: stack.length - backingPaddingLayerCount,
        backingPaddingLayerCount,
        predictedColor: {
            space: 'srgb',
            encoding: 'uint8',
            whitePoint: 'D65',
            rgb: [16, 32, 48],
            hex: '#102030',
        },
        selectionReason,
    };
}

function materialCountsByLayer(candidates: readonly AdaptiveMatrixCandidate[]) {
    const depth = Math.max(0, ...candidates.map(({ stack }) => stack.length));
    return Array.from({ length: depth }, (_, layer) => {
        const counts = new Map<number, number>();
        for (const { stack } of candidates) {
            counts.set(stack[layer], (counts.get(stack[layer]) ?? 0) + 1);
        }
        return [...counts].sort(([left], [right]) => left - right);
    });
}

function regionCount(candidates: readonly AdaptiveMatrixCandidate[], columns: number): number {
    const rows = Math.ceil(candidates.length / columns);
    const depth = Math.max(0, ...candidates.map(({ stack }) => stack.length));
    let regions = 0;
    for (let layer = 0; layer < depth; layer++) {
        const seen = new Set<number>();
        for (let cell = 0; cell < candidates.length; cell++) {
            if (seen.has(cell)) continue;
            regions++;
            const material = candidates[cell].stack[layer];
            const pending = [cell];
            seen.add(cell);
            while (pending.length) {
                const current = pending.pop()!;
                const x = current % columns;
                const y = Math.floor(current / columns);
                const neighbors = [
                    x > 0 ? current - 1 : -1,
                    x < columns - 1 ? current + 1 : -1,
                    y > 0 ? current - columns : -1,
                    y < rows - 1 ? current + columns : -1,
                ];
                for (const neighbor of neighbors) {
                    if (
                        neighbor < 0 ||
                        neighbor >= candidates.length ||
                        seen.has(neighbor) ||
                        candidates[neighbor].stack[layer] !== material
                    )
                        continue;
                    seen.add(neighbor);
                    pending.push(neighbor);
                }
            }
        }
    }
    return regions;
}

test('matrix layout groups full bottom-to-top stacks without mutating candidates or recipe metadata', async () => {
    const { orderStackMatrixCandidatesForLayout } = await planning;
    const input = [
        candidate([2, 0, 0], 0, 'exploration'),
        candidate([0, 2, 1], 1, 'reference'),
        candidate([0, 0, 2], 2),
        candidate([1, 0, 0]),
        candidate([0, 2, 0], 1),
    ];
    const snapshot = structuredClone(input);
    const ordered = orderStackMatrixCandidatesForLayout(input);
    assert.notEqual(ordered, input);
    assert.deepEqual(input, snapshot);
    assert.deepEqual(ordered, [input[2], input[4], input[1], input[3], input[0]]);
    assert.equal(ordered.length, input.length);
    assert.deepEqual(new Set(ordered), new Set(input));
    for (const item of ordered) assert.ok(input.includes(item));
    assert.deepEqual(orderStackMatrixCandidatesForLayout([...input].reverse()), ordered);
    assert.deepEqual(orderStackMatrixCandidatesForLayout(ordered), ordered);
});

test('matrix layout compares all layers precisely for ten-layer and sixty-four-layer recipes', async () => {
    const { orderStackMatrixCandidatesForLayout } = await planning;
    for (const depth of [10, 20, 64]) {
        const prefix = Array<number>(depth - 2).fill(7);
        const low = candidate([...prefix, 1, 2]);
        const middle = candidate([...prefix, 1, 3]);
        const high = candidate([...prefix, 2, 0]);
        assert.deepEqual(orderStackMatrixCandidatesForLayout([high, middle, low]), [
            low,
            middle,
            high,
        ]);
        assert.deepEqual(orderStackMatrixCandidatesForLayout([middle, low, high]), [
            low,
            middle,
            high,
        ]);
    }
});

test('matrix layout reduces connected material regions while preserving per-layer amounts and swap estimate', async () => {
    const { orderStackMatrixCandidatesForLayout, estimateStackMatrixSwapCycles } = await planning;
    // Acquisition order intentionally interleaves four material groups. The
    // bottom two layers become continuous rows when full stacks are grouped.
    const acquired = Array.from({ length: 16 }, (_, index) => {
        const group = (index + Math.floor(index / 4)) % 4;
        return candidate([group, group, Math.floor(index / 4)]);
    });
    const grouped = orderStackMatrixCandidatesForLayout(acquired);
    assert.ok(regionCount(grouped, 4) < regionCount(acquired, 4));
    assert.deepEqual(materialCountsByLayer(grouped), materialCountsByLayer(acquired));
    assert.equal(
        estimateStackMatrixSwapCycles(
            grouped.map(({ stack }) => stack),
            0
        ),
        estimateStackMatrixSwapCycles(
            acquired.map(({ stack }) => stack),
            0
        )
    );
});

test('adaptive planner returns layout-grouped candidates without changing its physical-material estimate', async () => {
    const {
        planAdaptiveStackMatrix,
        orderStackMatrixCandidatesForLayout,
        estimateStackMatrixSwapCycles,
    } = await planning;
    const options = {
        filaments: [
            { id: 'black', color: '#101010', td: 0.45, name: 'Black' },
            { id: 'red', color: '#ef3038', td: 0.8, name: 'Red' },
            { id: 'white', color: '#f4f2ea', td: 1.2, name: 'White' },
        ],
        backingIndex: 0,
        layerCount: 10,
        layerHeight: 0.04,
        firstLayerHeight: 0.1,
        foundationLayerThicknesses: [0.1],
        ownerProfileFingerprint: 'layout-regression-fixture',
        maximumSamples: 16,
        predictColor: () => candidate([0]).predictedColor,
    };
    const plan = planAdaptiveStackMatrix(options);
    assert.equal(plan.candidates.length, options.maximumSamples);
    assert.deepEqual(plan.candidates, orderStackMatrixCandidatesForLayout(plan.candidates));
    assert.equal(
        plan.estimatedSwapCycles,
        estimateStackMatrixSwapCycles(
            [...plan.candidates.map(({ stack }) => stack), ...plan.cornerStacks],
            options.backingIndex
        )
    );
    assert.equal(
        plan.referenceSampleCount,
        plan.candidates.filter(({ selectionReason }) => selectionReason === 'reference').length
    );
});
