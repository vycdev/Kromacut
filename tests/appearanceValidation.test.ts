import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { withViteTestServer } from './helpers/viteModule.ts';
import type { AppearanceProfileV1 } from '../src/lib/appearanceProfile.ts';
import type { AppearanceFitContext } from '../src/lib/appearanceModel.ts';

const modules = withViteTestServer(
    async (server) =>
        [
            (await server.ssrLoadModule(
                '/src/lib/appearanceValidation.ts'
            )) as typeof import('../src/lib/appearanceValidation.ts'),
            (await server.ssrLoadModule(
                '/src/lib/stackMatrixCalibration.ts'
            )) as typeof import('../src/lib/stackMatrixCalibration.ts'),
            (await server.ssrLoadModule(
                '/src/lib/appearanceProfile.ts'
            )) as typeof import('../src/lib/appearanceProfile.ts'),
            (await server.ssrLoadModule(
                '/src/lib/appearanceModel.ts'
            )) as typeof import('../src/lib/appearanceModel.ts'),
            (await server.ssrLoadModule(
                '/src/lib/effectiveOptics.ts'
            )) as typeof import('../src/lib/effectiveOptics.ts'),
            (await server.ssrLoadModule(
                '/src/lib/colorDifference.ts'
            )) as typeof import('../src/lib/colorDifference.ts'),
        ] as const
);

async function fixture(shiftOptics = false) {
    const [, matrix, profile, , optics] = await modules;
    const filaments = [
        { id: 'black', color: '#101010', td: 0.1 },
        { id: 'white', color: '#f4f2ea', td: 0.5 },
        { id: 'orange', color: '#d83400', td: 0.3 },
    ];
    const record = matrix.buildStackMatrixCalibration(
        filaments,
        {
            layerHeight: 0.08,
            firstLayerHeight: 0.4,
            stackLayerCount: 4,
            maximumSamples: 128,
            backingFilamentId: 'white',
        },
        '2026-09-05T12:00:00.000Z'
    );
    record.status = 'complete';
    record.id = 'validation-fixture';
    record.completedAt = record.createdAt;
    record.alignmentMethod = 'manual';
    record.alignmentVerified = true;
    record.referenceCorrection = false;
    record.photoName = 'board.jpg';
    const prior = optics.createPriorEffectiveOpticsModel(filaments);
    const truth = shiftOptics
        ? {
              ...prior,
              applied: true,
              filaments: prior.filaments.map((f) => ({
                  ...f,
                  effectiveHdChannels: f.effectiveHdChannels.map((hd) => hd * 1.7) as [
                      number,
                      number,
                      number,
                  ],
              })),
              substrateInteractions: filaments.flatMap((substrate) =>
                  filaments
                      .filter((f) => f.id !== substrate.id)
                      .map((foreground) => ({
                          foregroundFilamentId: foreground.id,
                          substrateFilamentId: substrate.id,
                          hdMultiplier: 1,
                          sampleCount: 81,
                          maxObservedThickness: 1,
                      }))
              ),
          }
        : prior;
    for (const sample of record.samples) {
        const prediction = optics.predictEffectiveRecipeColor(
            truth,
            'white',
            sample.stack.map((i) => ({
                filamentId: record.filaments[i].id,
                thickness: 0.08,
            }))
        );
        assert.ok(prediction);
        const rgb = prediction.map(Math.round) as [number, number, number];
        sample.measuredColor = { ...sample.predictedColor, rgb };
    }
    const appearance: AppearanceProfileV1 = {
        ...profile.createEmptyAppearanceProfile(),
        stackMatrices: [record],
    };
    const context: AppearanceFitContext = {
        filaments,
        filamentProfileFingerprint: profile.fingerprintAppearanceFilaments(filaments),
        layerHeight: 0.08,
        firstLayerHeight: 0.4,
        transitionOpacity: 0.9,
    };
    return { appearance, context, record };
}

test('recipe folds keep physical duplicates together and do not depend on array ordering', async () => {
    const [validation] = await modules;
    const { appearance, context, record } = await fixture();
    appearance.stackMatrices!.push({ ...structuredClone(record), id: 'duplicate' });
    const plan = validation.planAppearanceValidation(appearance, context, {
        scenarios: ['recipe'],
        folds: 3,
    });
    for (const fold of plan.folds) {
        const trainingKeys = new Set(
            plan.observations.filter((s) => fold.trainingIds.includes(s.id)).map((s) => s.recipeKey)
        );
        assert.ok(
            plan.observations
                .filter((s) => fold.validationIds.includes(s.id))
                .every((s) => !trainingKeys.has(s.recipeKey))
        );
        assert.ok(fold.trainingIds.length > 0);
    }
    const reversed = structuredClone(appearance);
    reversed.stackMatrices!.reverse().forEach((m) => m.samples.reverse());
    assert.deepEqual(
        validation.planAppearanceValidation(reversed, context, { scenarios: ['recipe'], folds: 3 })
            .folds,
        plan.folds
    );
});

test('unseen-pair folds purge that pair from intermediate runs as well as terminal runs', async () => {
    const [validation] = await modules;
    const { appearance, context } = await fixture();
    const plan = validation.planAppearanceValidation(appearance, context, {
        scenarios: ['interaction'],
        folds: 3,
    });
    assert.ok(plan.folds.some((fold) => fold.purgedIds.length > 0));
    for (const fold of plan.folds) {
        const heldPairs = new Set(fold.heldOutGroups);
        assert.ok(
            plan.observations
                .filter((s) => fold.trainingIds.includes(s.id))
                .every((s) => s.interactions.every((pair) => !heldPairs.has(pair)))
        );
        assert.ok(
            plan.observations
                .filter((s) => fold.validationIds.includes(s.id))
                .every((s) => heldPairs.has(s.terminalInteraction!))
        );
    }
});

test('board holdouts do not split shared photos, duplicate imports, or explicit sessions', async () => {
    const [validation] = await modules;
    const { appearance, context, record } = await fixture();
    const second = structuredClone(record);
    second.id = 'second';
    second.samples.reverse();
    second.photoName = 'renamed.jpg';
    appearance.stackMatrices!.push(second);
    assert.equal(
        validation.planAppearanceValidation(appearance, context).boardGroupCount,
        1,
        'duplicate import'
    );
    second.samples[0].measuredColor!.rgb = [10, 20, 30];
    second.photoName = record.photoName!.toUpperCase();
    assert.equal(
        validation.planAppearanceValidation(appearance, context).boardGroupCount,
        1,
        'same photo'
    );
    second.photoName = 'another.jpg';
    assert.equal(validation.planAppearanceValidation(appearance, context).boardGroupCount, 2);
    assert.equal(
        validation.planAppearanceValidation(appearance, context, {
            sessions: { [record.id]: 'session-a', second: 'session-a' },
        }).boardGroupCount,
        1
    );
    assert.throws(
        () =>
            validation.planAppearanceValidation(appearance, context, {
                sessions: { second: 'session-a' },
            }),
        /every compatible Matrix/
    );
});

test('withheld measurements cannot influence their fitted model, coordinates, or predictions', async () => {
    const [validation] = await modules;
    const { appearance, context } = await fixture(true);
    const options = { folds: 2, scenarios: ['recipe'] as const };
    const before = JSON.stringify({ appearance, context });
    const first = validation.runAppearanceValidation(appearance, context, options);
    assert.ok(first.folds[0].opticsApplied, 'exercise an accepted refit, not only fallback');
    assert.equal(JSON.stringify({ appearance, context }), before, 'inputs remain unchanged');
    const heldIds = new Set(first.folds[0].validationIds);
    const poisoned = structuredClone(appearance);
    for (const matrix of poisoned.stackMatrices!) {
        for (const sample of matrix.samples) {
            // Poison all historical predicted coordinates; the training copy must rebuild them.
            sample.predictedColor = {
                ...sample.predictedColor,
                rgb: [255, 0, 255],
                hex: '#ff00ff',
            };
            if (heldIds.has(`${matrix.id}:${sample.index}`))
                sample.measuredColor = {
                    ...sample.measuredColor!,
                    rgb: [0, 255, 0],
                    hex: '#00ff00',
                };
        }
    }
    const second = validation.runAppearanceValidation(poisoned, context, options);
    assert.equal(second.folds[0].fittedModelFingerprint, first.folds[0].fittedModelFingerprint);
    assert.deepEqual(
        second.folds[0].predictions.map((s) => s.predictedLab),
        first.folds[0].predictions.map((s) => s.predictedLab)
    );
    assert.notDeepEqual(
        second.folds[0].predictions.map((s) => s.errors),
        first.folds[0].predictions.map((s) => s.errors)
    );
    for (const row of first.folds[0].predictions)
        assert.ok(row.empiricalSampleIds.every((id) => first.folds[0].trainingIds.includes(id)));
    const copy = validation.appearanceValidationTrainingProfile(
        appearance.stackMatrices!,
        first.folds[0].trainingIds,
        context
    );
    assert.equal(copy.proofs.length + copy.viewingSessions.length + copy.targetJudgments.length, 0);
    assert.ok(
        copy
            .stackMatrices!.flatMap((m) => m.samples.map((s) => `${m.id}:${s.index}`))
            .every((id) => !heldIds.has(id))
    );
});

test('reported full predictions are exactly the public training-only runtime pipeline', async () => {
    const [validation, , , model, optics, color] = await modules;
    const { appearance, context, record } = await fixture();
    const report = validation.runAppearanceValidation(appearance, context, {
        scenarios: ['recipe'],
        folds: 2,
    });
    const fold = report.folds[0];
    const trained = model.fitAppearanceRankModel(
        validation.appearanceValidationTrainingProfile(
            appearance.stackMatrices!,
            fold.trainingIds,
            context
        ),
        context
    );
    assert.equal(trained.fingerprint, fold.fittedModelFingerprint);
    assert.equal(fold.empiricalTrainingSampleCount, fold.trainingIds.length);
    let coalescedLookupDifferences = 0;
    for (const row of fold.predictions) {
        const sample = record.samples.find((entry) => `${record.id}:${entry.index}` === row.id)!;
        const backing = record.filaments[record.backingFilamentIndex];
        // Reconstruct from the saved physical plan, independently of report recipe formatting.
        const physicalLayers = [
            ...record.foundationLayerThicknesses.map((thickness) => ({
                filamentId: backing.id,
                filamentColor: backing.color,
                thickness,
            })),
            ...sample.stack.map((index) => ({
                filamentId: record.filaments[index].id,
                filamentColor: record.filaments[index].color,
                thickness: record.process.layerHeight,
            })),
        ];
        assert.deepEqual(row.physicalLayers, physicalLayers);
        const rgb = optics.predictEffectiveAutoPaintColor(trained.effectiveOptics!, row.recipe);
        assert.ok(rgb);
        const base = color.rgbToLab(rgb);
        const predicted = model.resolveAppearanceRankModel(base, trained, physicalLayers);
        assert.deepEqual(predicted.lab, row.predictedLab.full);
        assert.equal(color.deltaE2000Lab(predicted.lab, row.measuredLab), row.errors.full);
        const coalesced = model.resolveAppearanceRankModel(base, trained, row.recipe);
        if (color.deltaE2000Lab(coalesced.lab, predicted.lab) > 1e-8) coalescedLookupDifferences++;
    }
    assert.ok(coalescedLookupDifferences > 0, 'exercise the fixed-depth lookup lost by coalescing');
    assert.ok(
        report.scenarios[0].baseline!.worst < 1,
        `8-bit synthetic observations differ only by quantization: ${report.scenarios[0].baseline!.worst}`
    );
    const rerun = validation.runAppearanceValidation(appearance, context, {
        scenarios: ['recipe'],
        folds: 2,
    });
    assert.deepEqual(rerun, report, 'deterministic complete report');
});

test('corrected or incompatible observations are excluded and absent validation is not perfect accuracy', async () => {
    const [validation] = await modules;
    const { appearance, context, record } = await fixture();
    const report = validation.runAppearanceValidation(appearance, context, {
        scenarios: ['board'],
    });
    assert.equal(report.scenarios[0].full, null);
    assert.equal(report.skipped.length, 1);
    record.referenceCorrection = true;
    const excluded = validation.runAppearanceValidation(appearance, context);
    assert.equal(excluded.measuredSampleCount, 0);
    assert.deepEqual(excluded.excludedMatrixIds, [record.id]);
    assert.ok(excluded.scenarios.every((s) => s.full === null));
    record.referenceCorrection = false;
    record.process.layerHeight = 0.16;
    assert.equal(validation.planAppearanceValidation(appearance, context).observations.length, 0);
    assert.throws(
        () => validation.planAppearanceValidation(appearance, context, { folds: 1 }),
        /2–10/
    );
    assert.throws(
        () => validation.planAppearanceValidation(appearance, context, { maximumDeltaE: NaN }),
        /positive/
    );
});

test('validation CLI documents its scope and refuses existing output directories before writing', () => {
    const script = resolve('scripts/validate-appearance.ts');
    const help = spawnSync(
        process.execPath,
        ['--no-warnings', '--experimental-strip-types', script, '--help'],
        { encoding: 'utf8' }
    );
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /diagnostics-only/);
    const existing = spawnSync(
        process.execPath,
        [
            '--no-warnings',
            '--experimental-strip-types',
            script,
            '--input',
            'nonexistent-input.kfil',
            '--out',
            resolve('tests/assets'),
        ],
        { encoding: 'utf8' }
    );
    assert.equal(existing.status, 1);
    assert.match(existing.stderr, /Output directory already exists/);
    const unknown = spawnSync(
        process.execPath,
        ['--no-warnings', '--experimental-strip-types', script, '--not-an-option', 'value'],
        { encoding: 'utf8' }
    );
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Invalid or duplicate option/);
});
