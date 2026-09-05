import assert from 'node:assert/strict';
import test from 'node:test';

import type { Filament } from '../src/types/index.ts';
import type { AppearanceEffectiveOpticsModelV1 } from '../src/types/appearance.ts';
import { loadViteModule } from './helpers/viteModule.ts';

type EffectiveOpticsModule = typeof import('../src/lib/effectiveOptics.ts');

const modulePromise = loadViteModule<EffectiveOpticsModule>('/src/lib/effectiveOptics.ts');

const filaments: Filament[] = [
    { id: 'foundation', color: '#242b32', td: 0.36 },
    { id: 'rose', color: '#d86f91', td: 0.45 },
    { id: 'teal', color: '#2aa79d', td: 0.5 },
];

function truthModel(): AppearanceEffectiveOpticsModelV1 {
    return {
        schemaVersion: 1,
        modelVersion: 'matrix-effective-optics-v3',
        fingerprint: 'synthetic-truth',
        applied: true,
        gateReason: 'applied',
        matrixCount: 1,
        sampleCount: 81,
        baselineMeanDeltaE: 0,
        fittedMeanDeltaE: 0,
        crossValidationMeanDeltaE: 0,
        crossValidationP90DeltaE: 0,
        crossValidationSampleCount: 0,
        confidence: 1,
        filaments: [
            {
                filamentId: 'foundation',
                priorHdChannels: [0.36, 0.36, 0.36],
                effectiveHdChannels: [0.29, 0.39, 0.46],
                priorOpaqueColor: [36, 43, 50],
                effectiveOpaqueColor: [29, 38, 48],
                transmissionExponent: 1.2,
                sampleCount: 81,
            },
            {
                filamentId: 'rose',
                priorHdChannels: [0.45, 0.45, 0.45],
                effectiveHdChannels: [0.58, 0.37, 0.5],
                priorOpaqueColor: [216, 111, 145],
                effectiveOpaqueColor: [207, 96, 139],
                transmissionExponent: 0.76,
                sampleCount: 81,
            },
            {
                filamentId: 'teal',
                priorHdChannels: [0.5, 0.5, 0.5],
                effectiveHdChannels: [0.41, 0.62, 0.53],
                priorOpaqueColor: [42, 167, 157],
                effectiveOpaqueColor: [33, 154, 147],
                transmissionExponent: 1.38,
                sampleCount: 81,
            },
        ],
        substrateInteractions: [
            {
                foregroundFilamentId: 'rose',
                substrateFilamentId: 'foundation',
                hdMultiplier: 1.38,
                sampleCount: 20,
                maxObservedThickness: 0.32,
            },
            {
                foregroundFilamentId: 'teal',
                substrateFilamentId: 'rose',
                hdMultiplier: 0.68,
                sampleCount: 20,
                maxObservedThickness: 0.32,
            },
            {
                foregroundFilamentId: 'foundation',
                substrateFilamentId: 'teal',
                hdMultiplier: 1.22,
                sampleCount: 20,
                maxObservedThickness: 0.32,
            },
            {
                foregroundFilamentId: 'foundation',
                substrateFilamentId: 'rose',
                hdMultiplier: 1,
                sampleCount: 20,
                maxObservedThickness: 0.32,
            },
            {
                foregroundFilamentId: 'rose',
                substrateFilamentId: 'teal',
                hdMultiplier: 1,
                sampleCount: 20,
                maxObservedThickness: 0.32,
            },
            {
                foregroundFilamentId: 'teal',
                substrateFilamentId: 'foundation',
                hdMultiplier: 1,
                sampleCount: 20,
                maxObservedThickness: 0.32,
            },
        ],
    };
}

function recipes(length: number): string[][] {
    const ids = filaments.map((filament) => filament.id);
    const result: string[][] = [];
    const visit = (prefix: string[]) => {
        if (prefix.length === length) {
            result.push(prefix);
            return;
        }
        for (const id of ids) visit([...prefix, id]);
    };
    visit([]);
    return result;
}

async function syntheticInput() {
    const optics = await modulePromise;
    const truth = truthModel();
    const samples = recipes(4).map((recipeFilamentIds, index) => {
        const measured = optics.predictEffectiveRecipeColor(
            truth,
            'foundation',
            recipeFilamentIds.map((filamentId) => ({ filamentId, thickness: 0.08 }))
        );
        assert.ok(measured);
        return {
            id: `sample-${index.toString().padStart(3, '0')}`,
            backingFilamentId: 'foundation',
            recipeFilamentIds,
            layerHeight: 0.08,
            measuredRgb: measured,
            weight: 1,
        };
    });
    return { filaments, matrixCount: 1, samples };
}

test('grouped validation holds every source matrix out as an indivisible group', async () => {
    const optics = await modulePromise;
    const input = await syntheticInput();
    const samples = input.samples.slice(0, 8).flatMap((sample) => [
        { ...sample, id: `matrix-a:${sample.id}`, sourceMatrixId: 'matrix-a' },
        { ...sample, id: `matrix-b:${sample.id}`, sourceMatrixId: 'matrix-b' },
    ]);

    const folds = optics.buildEffectiveOpticsValidationFolds(samples, 2);

    assert.ok(folds);
    assert.equal(folds.length, 2);
    const foldBySample = new Map(
        folds.flatMap((fold, foldIndex) => fold.map((sampleId) => [sampleId, foldIndex] as const))
    );
    assert.equal(new Set(samples.map((sample) => foldBySample.get(sample.id))).size, 2);
    assert.equal(
        new Set(
            samples
                .filter((sample) => sample.sourceMatrixId === 'matrix-a')
                .map((sample) => foldBySample.get(sample.id))
        ).size,
        1
    );
    assert.equal(
        new Set(
            samples
                .filter((sample) => sample.sourceMatrixId === 'matrix-b')
                .map((sample) => foldBySample.get(sample.id))
        ).size,
        1
    );
});

test('one-matrix validation keeps correlated terminal interaction recipes together', async () => {
    const optics = await modulePromise;
    const input = await syntheticInput();

    const folds = optics.buildEffectiveOpticsValidationFolds(input.samples, 1);

    assert.ok(folds);
    assert.equal(folds.length, 4);
    const foldBySample = new Map(
        folds.flatMap((fold, foldIndex) => fold.map((sampleId) => [sampleId, foldIndex] as const))
    );
    const foldsByTerminalInteraction = new Map<string, Set<number | undefined>>();
    for (const sample of input.samples) {
        let substrate = sample.backingFilamentId;
        let previous = '';
        let interaction = '';
        for (const filamentId of sample.recipeFilamentIds) {
            if (filamentId === previous) continue;
            interaction = `${filamentId}\0${substrate}`;
            substrate = filamentId;
            previous = filamentId;
        }
        const assigned = foldsByTerminalInteraction.get(interaction) ?? new Set();
        assigned.add(foldBySample.get(sample.id));
        foldsByTerminalInteraction.set(interaction, assigned);
    }
    assert.ok(foldsByTerminalInteraction.size > folds.length);
    assert.ok(
        [...foldsByTerminalInteraction.values()].every((assignedFolds) => assignedFolds.size === 1)
    );
});

test('joint matrix fit improves predictions and moves every effective property toward stacked-PLA truth', async () => {
    const optics = await modulePromise;
    const input = await syntheticInput();
    const fitted = optics.fitEffectiveOpticsFromMatrix(input);

    assert.equal(fitted.applied, true);
    assert.equal(fitted.sampleCount, 81);
    assert.equal(fitted.crossValidationSampleCount, 81);
    assert.ok(Number.isFinite(fitted.crossValidationMeanDeltaE));
    assert.ok(fitted.crossValidationMeanDeltaE > 0);
    assert.ok(fitted.crossValidationP90DeltaE >= fitted.crossValidationMeanDeltaE);
    assert.ok(
        fitted.fittedMeanDeltaE < fitted.baselineMeanDeltaE * 0.7,
        `${fitted.fittedMeanDeltaE} should materially improve ${fitted.baselineMeanDeltaE}`
    );

    const rose = fitted.filaments.find((entry) => entry.filamentId === 'rose');
    const teal = fitted.filaments.find((entry) => entry.filamentId === 'teal');
    assert.ok(rose && teal);
    assert.ok(Math.abs(rose.effectiveHdChannels[0] - 0.58) < Math.abs(0.45 - 0.58));
    assert.ok(
        Math.abs(rose.effectiveOpaqueColor[1] - 96) < Math.abs(rose.priorOpaqueColor[1] - 96)
    );
    assert.ok(Math.abs(rose.transmissionExponent - 0.76) < Math.abs(1 - 0.76));
    assert.ok(Math.abs(teal.transmissionExponent - 1.38) < Math.abs(1 - 1.38));

    const roseOverFoundation = fitted.substrateInteractions.find(
        (entry) =>
            entry.foregroundFilamentId === 'rose' && entry.substrateFilamentId === 'foundation'
    );
    const tealOverRose = fitted.substrateInteractions.find(
        (entry) => entry.foregroundFilamentId === 'teal' && entry.substrateFilamentId === 'rose'
    );
    assert.ok(roseOverFoundation && tealOverRose);
    assert.equal(roseOverFoundation.maxObservedThickness, 0.32);
    assert.equal(tealOverRose.maxObservedThickness, 0.24);
    assert.ok(
        Math.abs(roseOverFoundation.hdMultiplier - 1.38) < 0.38,
        `rose/foundation multiplier was ${roseOverFoundation.hdMultiplier}`
    );
    assert.ok(
        Math.abs(tealOverRose.hdMultiplier - 1) > 0.02,
        `teal/rose interaction should be fitted, got ${tealOverRose.hdMultiplier}`
    );
});

test('joint matrix fit is deterministic across input ordering and uses every sample', async () => {
    const optics = await modulePromise;
    const input = await syntheticInput();
    const forward = optics.fitEffectiveOpticsFromMatrix(input);
    const reversed = optics.fitEffectiveOpticsFromMatrix({
        ...input,
        filaments: [...input.filaments].reverse(),
        samples: [...input.samples].reverse(),
    });

    assert.equal(forward.fingerprint, reversed.fingerprint);
    assert.deepEqual(forward, reversed);
    assert.equal(forward.sampleCount, input.samples.length);
});

test('conflicting matrix families retain the prior instead of leaking across validation', async () => {
    const optics = await modulePromise;
    const input = await syntheticInput();
    const conflicting = optics.fitEffectiveOpticsFromMatrix({
        ...input,
        matrixCount: 2,
        samples: input.samples.flatMap((sample) => [
            { ...sample, id: `matrix-a:${sample.id}`, sourceMatrixId: 'matrix-a' },
            {
                ...sample,
                id: `matrix-b:${sample.id}`,
                sourceMatrixId: 'matrix-b',
                measuredRgb: sample.measuredRgb.map((channel) => 255 - channel) as [
                    number,
                    number,
                    number,
                ],
            },
        ]),
    });

    assert.equal(conflicting.applied, false);
    assert.equal(conflicting.gateReason, 'no-improvement');
    assert.equal(conflicting.crossValidationSampleCount, input.samples.length * 2);
});

test('grouped validation rejects a fitted model with a materially worse tail', async () => {
    const optics = await modulePromise;

    assert.equal(
        optics.groupedValidationSupportsFit(
            { mean: 10, p90: 15, sampleCount: 64 },
            { mean: 9, p90: 15.31, sampleCount: 64 }
        ),
        false
    );
});

test('sparse matrix evidence remains on the existing HD and swatch priors', async () => {
    const optics = await modulePromise;
    const input = await syntheticInput();
    const sparse = optics.fitEffectiveOpticsFromMatrix({
        ...input,
        samples: input.samples.slice(0, 5),
    });

    assert.equal(sparse.applied, false);
    assert.equal(sparse.gateReason, 'insufficient-samples');
    assert.equal(sparse.sampleCount, 5);
    assert.deepEqual(
        sparse.filaments.map((entry) => entry.effectiveHdChannels),
        sparse.filaments.map((entry) => entry.priorHdChannels)
    );
    assert.deepEqual(
        sparse.filaments.map((entry) => entry.effectiveOpaqueColor),
        sparse.filaments.map((entry) => entry.priorOpaqueColor)
    );
    assert.ok(sparse.filaments.every((entry) => entry.transmissionExponent === 1));
    assert.deepEqual(sparse.substrateInteractions, []);
});

test('nonlinear transmission is evaluated over a contiguous run', async () => {
    const optics = await modulePromise;
    const model = truthModel();
    const split = optics.predictEffectiveRecipeColor(model, 'foundation', [
        { filamentId: 'rose', thickness: 0.08 },
        { filamentId: 'rose', thickness: 0.08 },
    ]);
    const combined = optics.predictEffectiveRecipeColor(model, 'foundation', [
        { filamentId: 'rose', thickness: 0.16 },
    ]);
    assert.deepEqual(split, combined);
});

test('ordered substrate interaction only changes its matching material pair', async () => {
    const optics = await modulePromise;
    const model = truthModel();
    const roseOverFoundation = optics.effectiveSubstrateHdMultiplier(model, 'rose', 'foundation');
    const roseOverTeal = optics.effectiveSubstrateHdMultiplier(model, 'rose', 'teal');
    const reversePair = optics.effectiveSubstrateHdMultiplier(model, 'foundation', 'rose');

    assert.equal(roseOverFoundation, 1.38);
    assert.equal(roseOverTeal, 1);
    assert.equal(reversePair, 1);
});

test('Matrix transition support is bounded by the thickest observed run for that pair', async () => {
    const optics = await modulePromise;
    const model = truthModel();

    assert.equal(optics.effectiveOpticsSupportsTransition(model, 'rose', 'foundation', 0.32), true);
    assert.equal(optics.effectiveOpticsSupportsTransition(model, 'rose', 'foundation', 0.4), false);
    assert.equal(optics.effectiveOpticsSupportsTransition(model, 'rose', 'missing', 0.08), false);
});

test('Matrix recipe consumers continue from the supported boundary with conservative optics', async () => {
    const optics = await modulePromise;
    const model = truthModel();
    const rose = model.filaments.find((entry) => entry.filamentId === 'rose')!;
    const foundation = model.filaments.find((entry) => entry.filamentId === 'foundation')!;
    const limited = {
        ...model,
        substrateInteractions: model.substrateInteractions.map((interaction) =>
            interaction.foregroundFilamentId === 'rose' &&
            interaction.substrateFilamentId === 'foundation'
                ? { ...interaction, maxObservedThickness: 0.08 }
                : interaction
        ),
    };

    const predicted = optics.predictEffectiveRecipeColor(limited, 'foundation', [
        { filamentId: 'rose', thickness: 0.16 },
    ]);
    const boundary = optics.blendEffectiveSrgb(
        foundation.effectiveOpaqueColor,
        rose.effectiveOpaqueColor,
        rose.effectiveHdChannels,
        0.08,
        rose.transmissionExponent,
        optics.effectiveSubstrateHdMultiplier(limited, 'rose', 'foundation')
    );
    const expected = optics.blendEffectiveSrgb(
        boundary,
        rose.priorOpaqueColor,
        rose.fallbackHdChannels ?? rose.priorHdChannels,
        0.08,
        1,
        1
    );
    assert.deepEqual(predicted, expected);
});
