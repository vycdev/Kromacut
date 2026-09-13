import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteTestServer } from './helpers/viteModule.ts';
import type { StackMatrixCalibrationV1 } from '../src/lib/appearanceProfile.ts';

type MatrixModule = typeof import('../src/lib/stackMatrixCalibration.ts');
type PlanningModule = typeof import('../src/lib/stackMatrixPlanning.ts');
const modules = withViteTestServer(
    async (server) =>
        [
            (await server.ssrLoadModule('/src/lib/stackMatrixCalibration.ts')) as MatrixModule,
            (await server.ssrLoadModule('/src/lib/stackMatrixPlanning.ts')) as PlanningModule,
        ] as const
);

const filaments = [
    { id: 'black', color: '#101010', td: 0.45, name: 'Black' },
    { id: 'red', color: '#ef3038', td: 0.8, name: 'Red' },
    { id: 'white', color: '#f4f2ea', td: 1.2, name: 'White' },
];
const options = {
    layerHeight: 0.04,
    firstLayerHeight: 0.1,
    maximumRecipeThickness: 0.83,
    maximumSamples: 32,
    backingFilamentId: 'black',
};
const recipeKeys = (record: StackMatrixCalibrationV1) =>
    record.samples.map((sample) =>
        sample.stack
            .slice(sample.backingPaddingLayerCount ?? 0)
            .map((index) => record.filaments[index].id)
            .join(',')
    );

function reviewed(
    matrix: MatrixModule,
    planned: StackMatrixCalibrationV1
): StackMatrixCalibrationV1 {
    return matrix.completeStackMatrixCalibration(
        planned,
        planned.samples.map((sample) => [...sample.predictedColor.rgb]),
        'reviewed-matrix.jpg',
        false,
        '2026-09-12T10:00:00.000Z',
        { alignmentConfidence: 0.9, alignmentMethod: 'manual', alignmentVerified: true }
    );
}

test('adaptive Matrix caps physical recipe thickness and pads every shorter recipe to a flat top', async () => {
    const [matrix] = await modules;
    const record = matrix.buildStackMatrixCalibration(filaments, options);
    assert.equal(record.schemaVersion, 2);
    assert.equal(record.selection, 'adaptive-gamut');
    assert.equal(record.process.layerHeight, 0.04);
    assert.equal(record.process.firstLayerHeight, 0.1);
    assert.deepEqual(record.foundationLayerThicknesses, [0.1]);
    assert.equal(record.stackLayerCount, 20);
    assert.equal(record.planning?.maximumRecipeThickness, 0.83);
    assert.equal(record.totalCombinationCount, 3 ** 20);
    assert.equal(record.samples.length, 32);
    assert.equal(record.planning?.unmeasuredSampleCount, 32);
    assert.ok(new Set(record.samples.map((sample) => sample.recipeLayerCount)).size > 3);
    for (const sample of record.samples) {
        assert.equal(sample.stack.length, 20);
        assert.equal(sample.recipeLayerCount! + sample.backingPaddingLayerCount!, 20);
        assert.ok(sample.recipeLayerCount! * record.process.layerHeight <= 0.83);
        assert.ok(
            sample.stack.slice(0, sample.backingPaddingLayerCount).every((index) => index === 0)
        );
    }
    assert.equal(
        new Set(record.samples.map((sample) => sample.stack.join(','))).size,
        record.samples.length
    );
    for (const corner of record.cornerStacks) {
        assert.equal(corner.length, 20);
        assert.ok(corner.every((index) => index === corner[0]));
        assert.ok(record.samples.some((sample) => sample.stack.join(',') === corner.join(',')));
    }
});

test('adaptive planning is deterministic and progresses beyond reviewed recipes with bounded repeats', async () => {
    const [matrix] = await modules;
    const first = matrix.buildStackMatrixCalibration(filaments, options);
    const completed = reviewed(matrix, first);
    const nextOptions = { ...options, previousMatrices: [completed] };
    const next = matrix.buildStackMatrixCalibration(filaments, nextOptions);
    const repeated = matrix.buildStackMatrixCalibration(filaments, nextOptions);
    assert.deepEqual(next.samples, repeated.samples);
    const renamedEvidence = {
        ...completed,
        id: 'renamed-evidence',
        createdAt: '2020-01-01T00:00:00.000Z',
    };
    const reorderedHistory = matrix.buildStackMatrixCalibration(filaments, {
        ...options,
        previousMatrices: [first, renamedEvidence, completed],
    });
    const otherHistoryOrder = matrix.buildStackMatrixCalibration(filaments, {
        ...options,
        previousMatrices: [completed, renamedEvidence, first],
    });
    assert.deepEqual(next.samples, reorderedHistory.samples);
    assert.deepEqual(reorderedHistory.samples, otherHistoryOrder.samples);
    assert.equal(next.planning?.compatibleHistoryCount, 1);
    assert.equal(next.planning?.measuredRecipeCount, first.samples.length);
    const previousKeys = new Set(recipeKeys(first));
    const newKeys = recipeKeys(next);
    assert.ok(newKeys.filter((key) => previousKeys.has(key)).length <= 4);
    assert.ok(newKeys.filter((key) => !previousKeys.has(key)).length >= 28);
    assert.equal(
        next.planning?.unmeasuredSampleCount,
        newKeys.filter((key) => !previousKeys.has(key)).length
    );
    assert.ok(next.samples.some((sample) => sample.selectionReason === 'exploration'));
});

test('adaptive planning uses photographed color coverage, not only past recipe identifiers', async () => {
    const [matrix] = await modules;
    const first = reviewed(matrix, matrix.buildStackMatrixCalibration(filaments, options));
    const recolor = (rgb: [number, number, number]) => ({
        ...first,
        samples: first.samples.map((sample) => ({
            ...sample,
            measuredColor: { ...sample.measuredColor!, rgb },
        })),
    });
    const darkHistory = matrix.buildStackMatrixCalibration(filaments, {
        ...options,
        previousMatrices: [recolor([10, 10, 10])],
    });
    const lightHistory = matrix.buildStackMatrixCalibration(filaments, {
        ...options,
        previousMatrices: [recolor([245, 245, 245])],
    });
    assert.notDeepEqual(recipeKeys(darkHistory), recipeKeys(lightHistory));
});

test('incompatible, unreviewed and unverified history cannot affect adaptive acquisition', async () => {
    const [matrix] = await modules;
    const first = reviewed(matrix, matrix.buildStackMatrixCalibration(filaments, options));
    const withoutHistory = matrix.buildStackMatrixCalibration(filaments, options);
    const invalid: StackMatrixCalibrationV1[] = [
        { ...first, status: 'planned' },
        { ...first, alignmentVerified: false },
        {
            ...first,
            alignmentVerified: undefined,
            alignmentMethod: undefined,
            alignmentConfidence: undefined,
        },
        { ...first, process: { ...first.process, filamentProfileFingerprint: 'other-profile' } },
        { ...first, process: { ...first.process, layerHeight: 0.08 } },
        { ...first, process: { ...first.process, firstLayerHeight: 0.2 } },
        { ...first, backingFilamentIndex: 1 },
        { ...first, foundationLayerThicknesses: [0.1, 0.04] },
        {
            ...first,
            filaments: first.filaments.map((filament, index) =>
                index === 1 ? { ...filament, color: '#ff0000' } : filament
            ),
        },
    ];
    const ignored = matrix.buildStackMatrixCalibration(filaments, {
        ...options,
        previousMatrices: invalid,
    });
    assert.equal(ignored.planning?.compatibleHistoryCount, 0);
    assert.deepEqual(recipeKeys(ignored), recipeKeys(withoutHistory));
    const automaticallyReviewed = matrix.buildStackMatrixCalibration(filaments, {
        ...options,
        previousMatrices: [
            {
                ...first,
                alignmentVerified: undefined,
                alignmentMethod: 'detected',
                alignmentConfidence: 0.7,
            },
        ],
    });
    assert.equal(automaticallyReviewed.planning?.compatibleHistoryCount, 1);
});

test('history recipe identity survives a new thickness cap and material ordering', async () => {
    const [matrix] = await modules;
    // Cross-thickness reuse requires a backing that is opaque at its selected
    // first-layer height; translucent backing is covered separately.
    const opaqueFilaments = [{ ...filaments[0], td: 0.05 }, ...filaments.slice(1)];
    const first = reviewed(
        matrix,
        matrix.buildStackMatrixCalibration(opaqueFilaments, {
            ...options,
            maximumRecipeThickness: 0.24,
            ownerProfileFingerprint: 'owner',
        })
    );
    const record = matrix.buildStackMatrixCalibration(
        [opaqueFilaments[2], opaqueFilaments[0], opaqueFilaments[1]],
        {
            ...options,
            ownerProfileFingerprint: 'owner',
            previousMatrices: [first],
        }
    );
    assert.equal(record.planning?.compatibleHistoryCount, 1);
    assert.equal(record.planning?.measuredRecipeCount, first.samples.length);
    const old = new Set(recipeKeys(first));
    record.samples.forEach((sample, index) => {
        if (old.has(recipeKeys(record)[index])) assert.equal(sample.selectionReason, 'reference');
    });
});

test('material-change budget includes full-depth corners and never silently exceeds the cap', async () => {
    const [matrix, planning] = await modules;
    const expanded = [...filaments, { id: 'blue', color: '#1234ef', td: 0.7 }];
    const record = matrix.buildStackMatrixCalibration(expanded, {
        ...options,
        maximumSwapCycles: 60,
    });
    assert.ok(record.planning!.estimatedSwapCycles <= 60);
    assert.equal(
        record.planning?.estimatedSwapCycles,
        planning.estimateStackMatrixSwapCycles(
            [...record.samples.map((sample) => sample.stack), ...record.cornerStacks],
            record.backingFilamentIndex
        )
    );
    assert.throws(
        () => matrix.buildStackMatrixCalibration(expanded, { ...options, maximumSwapCycles: 1 }),
        /reference patches.*at least 60/i
    );
    assert.throws(
        () =>
            matrix.buildStackMatrixCalibration(expanded, {
                ...options,
                maximumSwapCycles: Number.NaN,
            }),
        /whole-number/i
    );
});

test('full-owner history reuses only selected-material patches when narrowing eight filaments to two', async () => {
    const [matrix] = await modules;
    const expanded = [
        ...filaments,
        ...Array.from({ length: 5 }, (_, index) => ({
            id: `extra-${index}`,
            color: '#2255aa',
            td: 0.5,
        })),
    ];
    const older = reviewed(
        matrix,
        matrix.buildStackMatrixCalibration(expanded, {
            layerHeight: 0.04,
            firstLayerHeight: 0.1,
            stackLayerCount: 3,
            maximumSamples: 512,
            backingFilamentId: 'black',
            ownerProfileFingerprint: 'full-owner',
        })
    );
    const next = matrix.buildStackMatrixCalibration(filaments.slice(0, 2), {
        ...options,
        ownerProfileFingerprint: 'full-owner',
        previousMatrices: [older],
    });
    assert.equal(next.planning?.compatibleHistoryCount, 1);
    assert.equal(next.planning?.measuredRecipeCount, 8);
    const unavailableLegacy = matrix.buildStackMatrixCalibration(filaments.slice(0, 2), {
        ...options,
        ownerProfileFingerprint: 'different-owner',
        previousMatrices: [older],
    });
    assert.equal(unavailableLegacy.planning?.compatibleHistoryCount, 0);
});

test('new Matrix foundations follow the first layer, independent of backing HD and color thickness', async () => {
    const [matrix] = await modules;
    for (const td of [0.01, 0.05, 0.45, 12]) {
        const record = matrix.buildStackMatrixCalibration(
            [{ ...filaments[0], td }, ...filaments.slice(1)],
            { ...options, maximumRecipeThickness: 0.4 }
        );
        assert.deepEqual(record.foundationLayerThicknesses, [0.1]);
        assert.equal(record.stackLayerCount, 10);
        assert.equal(record.foundationLayerThicknesses.length + record.stackLayerCount, 11);
        assert.equal(record.foundationLayerThicknesses[0] + record.stackLayerCount * 0.04, 0.5);
    }
    const thickerFirstLayer = matrix.buildStackMatrixCalibration(filaments, {
        ...options,
        firstLayerHeight: 0.16,
        maximumRecipeThickness: 0.4,
    });
    assert.deepEqual(thickerFirstLayer.foundationLayerThicknesses, [0.16]);
});

test('deep eight-material planning uses a bounded pool and a safe combination count', async () => {
    const [matrix] = await modules;
    const expanded = [
        ...filaments,
        { id: 'blue', color: '#2050df', td: 0.65 },
        { id: 'yellow', color: '#f2cf24', td: 0.7 },
        { id: 'green', color: '#20b050', td: 0.75 },
        { id: 'cyan', color: '#20cfe0', td: 0.9 },
        { id: 'magenta', color: '#d020b0', td: 0.85 },
    ];
    const started = performance.now();
    const record = matrix.buildStackMatrixCalibration(expanded, {
        ...options,
        maximumRecipeThickness: 2.56,
        maximumSamples: 64,
    });
    assert.equal(record.stackLayerCount, 64);
    assert.equal(record.samples.length, 64);
    assert.equal(record.totalCombinationCount, Number.MAX_SAFE_INTEGER);
    assert.equal(record.planning?.totalCombinationCountCapped, true);
    assert.ok(record.planning!.candidateCount <= 20_000);
    assert.ok(performance.now() - started < 15_000);
    assert.throws(
        () =>
            matrix.buildStackMatrixCalibration(filaments, {
                ...options,
                maximumRecipeThickness: 2.6,
            }),
        /64 regular print layers/
    );
    assert.throws(
        () =>
            matrix.buildStackMatrixCalibration(filaments, {
                ...options,
                maximumRecipeThickness: 0.01,
            }),
        /one and 64/
    );
    assert.throws(
        () =>
            matrix.buildStackMatrixCalibration(filaments, {
                ...options,
                maximumRecipeThickness: 2.57,
            }),
        /64 regular print layers/
    );
    for (const invalidHeights of [{ layerHeight: 10.01 }, { firstLayerHeight: 10.01 }]) {
        assert.throws(
            () => matrix.buildStackMatrixCalibration(filaments, { ...options, ...invalidHeights }),
            /valid regular and first-layer heights/
        );
    }
});

test('exploration still probes unseen thicknesses when predicted colors coincide', async () => {
    const [matrix] = await modules;
    const sameColors = filaments.map((filament) => ({ ...filament, color: '#808080' }));
    const first = matrix.buildStackMatrixCalibration(sameColors, options);
    assert.ok(new Set(first.samples.map((sample) => sample.recipeLayerCount)).size > 8);
    const next = matrix.buildStackMatrixCalibration(sameColors, {
        ...options,
        previousMatrices: [reviewed(matrix, first)],
    });
    assert.ok(recipeKeys(next).filter((key) => !new Set(recipeKeys(first)).has(key)).length >= 28);
});

test('an exhausted small recipe space reports reference-only output instead of claiming new measurements', async () => {
    const [matrix] = await modules;
    const limited = { ...options, maximumRecipeThickness: 0.04, maximumSamples: 64 };
    const first = matrix.buildStackMatrixCalibration(filaments.slice(0, 2), limited);
    assert.equal(first.planning?.unmeasuredSampleCount, 2);
    const next = matrix.buildStackMatrixCalibration(filaments.slice(0, 2), {
        ...limited,
        previousMatrices: [reviewed(matrix, first)],
    });
    assert.equal(next.samples.length, 2);
    assert.equal(next.planning?.unmeasuredSampleCount, 0);
    assert.ok(next.samples.every((sample) => sample.selectionReason === 'reference'));
});
