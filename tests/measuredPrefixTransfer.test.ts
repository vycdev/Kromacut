import assert from 'node:assert/strict';
import test from 'node:test';

import type {
    AppearanceAnchorLayer,
    AppearanceEffectiveOpticsModelV1,
    AppearanceEmpiricalLutV1,
    AppearanceRankModelV1,
} from '../src/types/appearance.ts';
import { deltaE2000Lab, labToRgb, rgbToLab } from '../src/lib/colorDifference.ts';
import { srgbChannelToLinear } from '../src/lib/colorSpace.ts';
import { withViteTestServer } from './helpers/viteModule.ts';

type ModelModule = typeof import('../src/lib/appearanceModel.ts');
type OpticsModule = typeof import('../src/lib/effectiveOptics.ts');

const modules = withViteTestServer(async (server) => ({
    appearance: (await server.ssrLoadModule('/src/lib/appearanceModel.ts')) as ModelModule,
    optics: (await server.ssrLoadModule('/src/lib/effectiveOptics.ts')) as OpticsModule,
}));

const colors = {
    substrate: '#202820',
    alternate: '#345ac4',
    'other-substrate': '#202820',
    cover: '#28c689',
    accent: '#c87890',
} as const;
type Material = keyof typeof colors;
const measuredRgb: [number, number, number] = [91, 136, 118];
const asTuple = (lab: ReturnType<typeof rgbToLab>) => [lab.L, lab.a, lab.b] as const;
const layer = (filamentId: Material, thickness: number): AppearanceAnchorLayer => ({
    filamentId,
    filamentColor: colors[filamentId],
    thickness,
});

async function fixture(coverHd = 0.16) {
    const { appearance, optics } = await modules;
    const identity = appearance.createIdentityAppearanceRankModel();
    const effectiveOptics: AppearanceEffectiveOpticsModelV1 = {
        schemaVersion: 1,
        modelVersion: 'matrix-effective-optics-v4',
        fingerprint: `prefix-optics-${coverHd}`,
        applied: true,
        gateReason: 'applied',
        matrixCount: 1,
        sampleCount: 1,
        baselineMeanDeltaE: 12,
        fittedMeanDeltaE: 10,
        crossValidationMeanDeltaE: 12,
        crossValidationP90DeltaE: 16,
        crossValidationSampleCount: 1,
        confidence: 0.7,
        filaments: (Object.keys(colors) as Material[]).map((filamentId) => {
            const rgb = [1, 3, 5].map((start) =>
                parseInt(colors[filamentId].slice(start, start + 2), 16)
            ) as [number, number, number];
            const hd = filamentId === 'cover' ? coverHd : 0.12;
            return {
                filamentId,
                priorHdChannels: [hd, hd, hd] as const,
                effectiveHdChannels: [hd, hd, hd] as const,
                fallbackHdChannels: [0.3, 0.3, 0.3] as const,
                priorOpaqueColor: rgb,
                effectiveOpaqueColor: rgb,
                transmissionExponent: filamentId === 'cover' ? 1.35 : 1,
                sampleCount: 1,
            };
        }),
        substrateInteractions: [
            {
                foregroundFilamentId: 'substrate',
                substrateFilamentId: 'alternate',
                hdMultiplier: 1,
                sampleCount: 1,
                maxObservedThickness: 0.4,
            },
            {
                foregroundFilamentId: 'cover',
                substrateFilamentId: 'substrate',
                hdMultiplier: 1,
                sampleCount: 1,
                maxObservedThickness: 0.4,
            },
        ],
    };
    const recipe = [layer('cover', 0.08), layer('cover', 0.08), layer('cover', 0.08)];
    const foundation = [layer('substrate', 0.64)];
    const alternateFoundation = [layer('alternate', 0.64), layer('substrate', 0.08)];
    const referenceRgb = optics.predictEffectiveAutoPaintColor(effectiveOptics, [
        ...foundation,
        ...recipe,
    ])!;
    const sample = {
        id: 'measured-green-sample',
        sourceStackKey: 'measured-green-stack',
        recipeFilamentIds: recipe.map((entry) => entry.filamentId),
        predictedLab: asTuple(rgbToLab(referenceRgb)),
        measuredLab: asTuple(rgbToLab(measuredRgb)),
        confidence: 0.9,
        crossValidationDeltaE: 4,
        exactAnchorId: 'measured-green-anchor',
    };
    const lut: AppearanceEmpiricalLutV1 = {
        id: 'prefix-transfer-lut',
        sourceMatrixId: 'prefix-transfer-matrix',
        observedAt: '2026-09-05T10:00:00.000Z',
        layerHeight: 0.08,
        stackLayerCount: 3,
        backingFilamentId: 'substrate',
        foundationLayers: foundation,
        filamentIds: Object.keys(colors),
        alignmentWeight: 1,
        coverageWeight: 1,
        recencyWeight: 1,
        agreementWeight: 1,
        matrixWeight: 1,
        coverageRadius: 30,
        crossValidationMeanDeltaE: 4,
        crossValidationP90DeltaE: 6,
        crossValidationSampleCount: 1,
        samples: [sample],
    };
    const model: AppearanceRankModelV1 = {
        ...identity,
        effectiveOptics,
        empiricalLuts: [lut],
        exactAnchors: [
            {
                id: sample.exactAnchorId,
                proofId: lut.sourceMatrixId,
                source: 'stack-matrix',
                sourceStackKey: sample.sourceStackKey,
                targetLab: sample.measuredLab,
                suffixLayers: recipe,
                maxSubstrateTransmission: 0,
                confidence: sample.confidence,
            },
        ],
    };
    const base = (layers: readonly AppearanceAnchorLayer[]) =>
        rgbToLab(optics.predictEffectiveAutoPaintColor(effectiveOptics, layers)!);
    const resolve = (layers: readonly AppearanceAnchorLayer[]) =>
        appearance.resolveAppearanceRankModel(base(layers), model, layers, {
            includeContributions: true,
        });
    return {
        appearance,
        optics,
        effectiveOptics,
        model,
        recipe,
        foundation,
        alternateFoundation,
        referenceRgb,
        sample,
        base,
        resolve,
    };
}

test('same exact recipe can transfer measured evidence across an estimated substrate match without claiming exactness', async () => {
    const f = await fixture();
    const query = [...f.alternateFoundation, ...f.recipe];
    assert.ok(
        deltaE2000Lab(f.base(f.foundation), f.base(f.alternateFoundation)) > 1,
        'the fixture must fail strict substrate equivalence'
    );
    assert.ok(
        deltaE2000Lab(f.base([...f.foundation, ...f.recipe]), f.base(query)) <= 1,
        'the identical full recipe must make the simulated final colors close'
    );
    const exact = f.resolve([...f.foundation, ...f.recipe]);
    const transfer = f.resolve(query);
    assert.equal(exact.predictionConfidence.method, 'exact');
    assert.ok(transfer.empiricalMatch, 'the matching photographed recipe should supply evidence');
    assert.deepEqual(transfer.empiricalMatch.sampleIds, [f.sample.id]);
    assert.equal(transfer.empiricalMatch.kind, 'interpolated');
    assert.notEqual(transfer.predictionConfidence.method, 'exact');
    assert.equal(transfer.exactAnchor, undefined);
    assert.ok(
        deltaE2000Lab(transfer.lab, rgbToLab(measuredRgb)) < 2,
        'a tiny modeled context difference should preserve the measured correction'
    );
    assert.ok(deltaE2000Lab(transfer.lab, f.base(query)) > 5);
    assert.ok(transfer.predictionConfidence.confidence < exact.predictionConfidence.confidence);
    assert.deepEqual(
        transfer.empiricalMatch.transfers?.map((entry) => entry.mode),
        ['substrate']
    );
    assert.ok((transfer.empiricalMatch.transfers?.[0].substrateDeltaE ?? 0) > 1);
    assert.ok((transfer.empiricalMatch.transfers?.[0].outputDeltaE ?? Infinity) <= 1);
    assert.equal(transfer.empiricalMatch.transfers?.[0].extraThicknessMm, 0);
});

test('estimated substrate transfer rejects mismatched material IDs, recipes, thicknesses, and insufficient foundations', async () => {
    const f = await fixture();
    const cases: Array<[string, AppearanceAnchorLayer[]]> = [
        [
            'different immediate substrate, even when its swatch is identical',
            [layer('alternate', 0.64), layer('other-substrate', 0.08), ...f.recipe],
        ],
        [
            'changed recipe ID',
            [...f.alternateFoundation, ...f.recipe.slice(0, 2), layer('accent', 0.08)],
        ],
        [
            'changed recipe thickness',
            [...f.alternateFoundation, ...f.recipe.slice(0, 2), layer('cover', 0.079)],
        ],
        [
            'nonopaque starting foundation',
            [layer('alternate', 0.001), layer('substrate', 0.08), ...f.recipe],
        ],
        [
            'changed recipe swatch',
            [
                ...f.alternateFoundation,
                ...f.recipe.slice(0, 2),
                { ...layer('cover', 0.08), filamentColor: '#ffffff' },
            ],
        ],
        [
            'changed buried foundation swatch with unchanged ID',
            [
                { ...layer('alternate', 0.64), filamentColor: '#ffffff' },
                layer('substrate', 0.08),
                ...f.recipe,
            ],
        ],
        [
            'changed immediate substrate swatch with unchanged ID',
            [
                layer('alternate', 0.64),
                { ...layer('substrate', 0.08), filamentColor: '#ffffff' },
                ...f.recipe,
            ],
        ],
    ];
    for (const [description, query] of cases) {
        const resolved = f.resolve(query);
        assert.equal(resolved.empiricalMatch, undefined, description);
        assert.equal(resolved.exactAnchor, undefined, description);
        assert.deepEqual(resolved.lab, f.base(query), description);
    }
});

test('estimated substrate transfer rejects a materially different simulated final color', async () => {
    const f = await fixture(0.6);
    const query = [...f.alternateFoundation, ...f.recipe];
    assert.ok(deltaE2000Lab(f.base([...f.foundation, ...f.recipe]), f.base(query)) > 1);
    const resolved = f.resolve(query);
    assert.equal(resolved.empiricalMatch, undefined);
    assert.equal(resolved.exactAnchor, undefined);
    assert.deepEqual(resolved.lab, f.base(query));
});

test('estimated recipe transfer retains a saved-prior foundation when the runtime fit raises its floor', async () => {
    const f = await fixture();
    const effectiveOptics: AppearanceEffectiveOpticsModelV1 = {
        ...f.effectiveOptics,
        fingerprint: 'raised-foundation-floor',
        filaments: f.effectiveOptics.filaments.map((filament) =>
            filament.filamentId === 'alternate'
                ? { ...filament, effectiveHdChannels: [0.7, 0.7, 0.7] }
                : filament
        ),
    };
    const model = { ...f.model, effectiveOptics };
    const actualFoundationThickness = 0.64;
    const query = [...f.alternateFoundation, ...f.recipe];
    const priorFloor = 0.12 * Math.log10(20);
    const fittedFloor = f.optics.minimumOpaqueFoundationThickness(effectiveOptics, 'alternate');
    assert.ok(actualFoundationThickness < fittedFloor);
    assert.ok(actualFoundationThickness > priorFloor);
    const resolved = f.appearance.resolveAppearanceRankModel(f.base(query), model, query);
    assert.equal(resolved.empiricalMatch?.kind, 'interpolated');
    assert.equal(resolved.exactAnchor, undefined);
    assert.equal(resolved.empiricalMatch?.transfers?.[0].foundationBasis, 'saved-prior');
    assert.equal(
        resolved.empiricalMatch?.transfers?.[0].foundationThicknessMm,
        actualFoundationThickness
    );
    assert.ok(
        Math.abs(
            (resolved.empiricalMatch?.transfers?.[0].requiredFoundationThicknessMm ?? 0) -
                priorFloor
        ) < 1e-10
    );
    const tooThin = [layer('alternate', 0.001), layer('substrate', 0.08), ...f.recipe];
    const rejected = f.appearance.resolveAppearanceRankModel(f.base(tooThin), model, tooThin);
    assert.equal(rejected.empiricalMatch, undefined);
    assert.equal(rejected.exactAnchor, undefined);
});

test('relaxed final-color similarity never opens general recipe interpolation on a different substrate', async () => {
    const f = await fixture(0.08);
    const secondRecipe = [layer('accent', 0.08), layer('cover', 0.08), layer('cover', 0.08)];
    const secondSample = {
        ...f.sample,
        id: 'second-measured-sample',
        exactAnchorId: 'second-measured-anchor',
        recipeFilamentIds: secondRecipe.map((entry) => entry.filamentId),
        predictedLab: asTuple(f.base([...f.foundation, ...secondRecipe])),
    };
    const model: AppearanceRankModelV1 = {
        ...f.model,
        empiricalLuts: [{ ...f.model.empiricalLuts[0], samples: [f.sample, secondSample] }],
        exactAnchors: [
            ...f.model.exactAnchors,
            {
                ...f.model.exactAnchors[0],
                id: secondSample.exactAnchorId,
                suffixLayers: secondRecipe,
            },
        ],
    };
    const unseenRecipe = [layer('substrate', 0.08), layer('cover', 0.08), layer('cover', 0.08)];
    const referenceQuery = [...f.foundation, ...unseenRecipe];
    const alternateQuery = [...f.alternateFoundation, ...unseenRecipe];
    assert.ok(deltaE2000Lab(f.base(referenceQuery), f.base(alternateQuery)) <= 1);
    const reference = f.appearance.resolveAppearanceRankModel(
        f.base(referenceQuery),
        model,
        referenceQuery
    );
    const alternate = f.appearance.resolveAppearanceRankModel(
        f.base(alternateQuery),
        model,
        alternateQuery
    );
    assert.equal(reference.empiricalMatch?.kind, 'interpolated');
    assert.ok((reference.empiricalMatch?.sampleIds.length ?? 0) >= 2);
    assert.equal(alternate.empiricalMatch, undefined);
    assert.equal(alternate.exactAnchor, undefined);
    assert.deepEqual(alternate.lab, f.base(alternateQuery));
});

test('measured prefix continuation transports its residual through the original nonlinear run', async () => {
    const f = await fixture();
    const anchorLayers = [...f.foundation, ...f.recipe];
    const query = [...anchorLayers, layer('cover', 0.08)];
    const anchor = f.resolve(anchorLayers);
    const resolved = f.resolve(query);
    const transition = f.optics.resolveEffectiveTransitionOptics(
        f.effectiveOptics,
        'cover',
        'substrate'
    )!;
    const startTransmission = f.optics.effectiveTransitionTransmission(transition, 0.24);
    const endTransmission = f.optics.effectiveTransitionTransmission(transition, 0.32);
    const baseRgb = f.optics.predictEffectiveAutoPaintColor(f.effectiveOptics, query)!;
    assert.equal(anchor.predictionConfidence.method, 'exact');
    assert.ok(
        resolved.empiricalMatch,
        'a later same-material layer must not discard known prefix evidence'
    );
    assert.deepEqual(resolved.empiricalMatch.sampleIds, [f.sample.id]);
    assert.equal(resolved.exactAnchor, undefined);
    assert.notEqual(resolved.predictionConfidence.method, 'exact');
    const provenance = resolved.empiricalMatch.transfers;
    assert.deepEqual(
        provenance?.map((entry) => entry.mode),
        ['same-material-continuation']
    );
    assert.ok(Math.abs((provenance?.[0].extraThicknessMm ?? 0) - 0.08) < 1e-10);
    assert.ok(Math.abs((provenance?.[0].sourceHeightMm ?? 0) - 0.88) < 1e-10);
    const resolvedRgb = labToRgb(resolved.lab, false);
    const supportWeights = resolvedRgb.map((channel, index) => {
        const transportedResidual =
            (srgbChannelToLinear(measuredRgb[index]) - srgbChannelToLinear(f.referenceRgb[index])) *
            (endTransmission[index] / startTransmission[index]);
        return (
            (srgbChannelToLinear(channel) - srgbChannelToLinear(baseRgb[index])) /
            transportedResidual
        );
    });
    assert.ok(supportWeights.every((weight) => weight > 0 && weight <= 1 + 1e-5));
    assert.ok(
        Math.max(...supportWeights) - Math.min(...supportWeights) < 1e-5,
        'support fading may reduce the residual, but must preserve per-channel transmission ratios'
    );
    assert.ok(deltaE2000Lab(resolved.lab, f.base(query)) > 0.1);
    assert.ok(
        resolved.predictionConfidence.confidence <= anchor.predictionConfidence.confidence,
        'an extrapolated surface must not be more certain than its measured prefix'
    );
});

test('measured continuation starts continuously and is invariant to continuation segmentation', async () => {
    const f = await fixture();
    const anchorLayers = [...f.foundation, ...f.recipe];
    const anchor = f.resolve(anchorLayers);
    const tinyExtension = f.resolve([...anchorLayers, layer('cover', 0.000001)]);
    assert.ok(deltaE2000Lab(anchor.lab, tinyExtension.lab) < 0.01);
    const combined = f.resolve([...anchorLayers, layer('cover', 0.16)]);
    const split = f.resolve([...anchorLayers, layer('cover', 0.08), layer('cover', 0.08)]);
    assert.ok(deltaE2000Lab(combined.lab, split.lab) < 1e-8);
    assert.deepEqual(combined.empiricalMatch?.sampleIds, split.empiricalMatch?.sampleIds);
    assert.ok(labToRgb(combined.lab).every(Number.isFinite));
});

test('same-material continuation fades continuously into ordinary optics at its support limit', async () => {
    const f = await fixture();
    const anchorLayers = [...f.foundation, ...f.recipe];
    const maximumExtraThickness = 0.24;
    const below = [...anchorLayers, layer('cover', maximumExtraThickness - 0.000001)];
    const boundary = [...anchorLayers, layer('cover', maximumExtraThickness)];
    const above = [...anchorLayers, layer('cover', maximumExtraThickness + 0.000001)];
    const resolvedBelow = f.resolve(below);
    const resolvedBoundary = f.resolve(boundary);
    const resolvedAbove = f.resolve(above);
    assert.ok(deltaE2000Lab(resolvedBelow.lab, resolvedBoundary.lab) < 0.01);
    assert.ok(deltaE2000Lab(resolvedBoundary.lab, resolvedAbove.lab) < 0.01);
    assert.ok(deltaE2000Lab(resolvedBoundary.lab, f.base(boundary)) < 1e-8);
    assert.ok(deltaE2000Lab(resolvedAbove.lab, f.base(above)) < 1e-8);
});

test('measured continuation stays continuous where fitted optics hand off to their fallback', async () => {
    const f = await fixture();
    const anchorLayers = [...f.foundation, ...f.recipe];
    const below = f.resolve([...anchorLayers, layer('cover', 0.16 - 0.000001)]);
    const above = f.resolve([...anchorLayers, layer('cover', 0.16 + 0.000001)]);
    assert.ok(deltaE2000Lab(below.lab, above.lab) < 0.01);
});

test('measured continuation does not pull a later photograph backward into thinner prefixes', async () => {
    const f = await fixture();
    for (const recipeCount of [0, 1, 2]) {
        const query = [...f.foundation, ...f.recipe.slice(0, recipeCount)];
        const resolved = f.resolve(query);
        assert.equal(resolved.empiricalMatch, undefined);
        assert.equal(resolved.exactAnchor, undefined);
        assert.deepEqual(resolved.lab, f.base(query));
    }
});

test('measured prefix continuation does not transfer through a different added material', async () => {
    const f = await fixture();
    const query = [...f.foundation, ...f.recipe, layer('accent', 0.08)];
    const resolved = f.resolve(query);
    assert.equal(resolved.empiricalMatch, undefined);
    assert.equal(resolved.exactAnchor, undefined);
    assert.deepEqual(resolved.lab, f.base(query));
});

test('a direct measurement of the final recipe outranks continuation from an earlier prefix', async () => {
    const f = await fixture();
    const longerRecipe = [...f.recipe, layer('cover', 0.08)];
    const query = [...f.foundation, ...longerRecipe];
    const finalSample = {
        ...f.sample,
        id: 'direct-final-sample',
        exactAnchorId: 'direct-final-anchor',
        recipeFilamentIds: longerRecipe.map((entry) => entry.filamentId),
        predictedLab: asTuple(f.base(query)),
        measuredLab: asTuple(rgbToLab([118, 152, 131])),
    };
    const finalLut = {
        ...f.model.empiricalLuts[0],
        id: 'direct-final-lut',
        sourceMatrixId: 'direct-final-matrix',
        stackLayerCount: 4,
        samples: [finalSample],
    };
    const model: AppearanceRankModelV1 = {
        ...f.model,
        empiricalLuts: [...f.model.empiricalLuts, finalLut],
        exactAnchors: [
            ...f.model.exactAnchors,
            {
                ...f.model.exactAnchors[0],
                id: finalSample.exactAnchorId,
                proofId: finalLut.sourceMatrixId,
                suffixLayers: longerRecipe,
                targetLab: finalSample.measuredLab,
            },
        ],
    };
    const resolved = f.appearance.resolveAppearanceRankModel(f.base(query), model, query);
    assert.equal(resolved.empiricalMatch?.kind, 'exact');
    assert.deepEqual(resolved.empiricalMatch?.sampleIds, [finalSample.id]);
    assert.equal(resolved.exactAnchor?.id, finalSample.exactAnchorId);
    assert.equal(resolved.predictionConfidence.method, 'exact');
    assert.deepEqual(asTuple(resolved.lab), finalSample.measuredLab);
});

test('a Palette Proof source correction prevents carrying a superseded Matrix prefix', async () => {
    const f = await fixture();
    const anchorLayers = [...f.foundation, ...f.recipe];
    const model: AppearanceRankModelV1 = {
        ...f.model,
        exactAnchors: [
            ...f.model.exactAnchors,
            {
                id: 'source-proof-anchor',
                proofId: 'source-proof',
                source: 'palette-proof',
                sourceStackKey: 'source-proof-stack',
                targetLab: [60, -10, 4],
                suffixLayers: anchorLayers,
                maxSubstrateTransmission: 0,
                confidence: 1,
            },
        ],
    };
    const source = f.appearance.resolveAppearanceRankModel(
        f.base(anchorLayers),
        model,
        anchorLayers
    );
    assert.equal(source.exactAnchor?.id, 'source-proof-anchor');
    const query = [...anchorLayers, layer('cover', 0.08)];
    const resolved = f.appearance.resolveAppearanceRankModel(f.base(query), model, query);
    assert.equal(resolved.empiricalMatch, undefined);
    assert.equal(resolved.exactAnchor, undefined);
});

test('a local source correction prevents carrying its superseded Matrix color', async () => {
    const f = await fixture();
    const anchorLayers = [...f.foundation, ...f.recipe];
    const sourceBase = asTuple(f.base(anchorLayers));
    const model: AppearanceRankModelV1 = {
        ...f.model,
        localEvidence: [
            {
                id: 'source-local-correction',
                proofIds: ['source-local-proof'],
                judgmentIds: ['source-local-judgment'],
                sourceStackKey: 'source-local-stack',
                baseLab: sourceBase,
                targetLab: sourceBase,
                suffixLayers: anchorLayers,
                observedAt: '2026-09-05T11:00:00.000Z',
                winnerCount: 1,
                loserCount: 0,
                noneCount: 0,
                tieWinnerCount: 0,
                supportWeight: 1,
                rejectionWeight: 0,
                preference: -1,
                confidence: 1,
                correctionTargetLab: [sourceBase[0] + 2, sourceBase[1], sourceBase[2]],
                correctionStrength: 1,
            },
        ],
    };
    const source = f.appearance.resolveAppearanceRankModel(
        f.base(anchorLayers),
        model,
        anchorLayers
    );
    assert.ok((source.localMatch?.correctionStrength ?? 0) > 0);
    assert.equal(source.exactAnchor, undefined);
    const query = [...anchorLayers, layer('cover', 0.08)];
    const resolved = f.appearance.resolveAppearanceRankModel(f.base(query), model, query);
    assert.equal(resolved.empiricalMatch, undefined);
});

test('multiple measured-prefix contributors retain transfer provenance and continuous support decay', async () => {
    const f = await fixture(0.26);
    const secondSample = {
        ...f.sample,
        id: 'second-board-sample',
        exactAnchorId: 'second-board-anchor',
        measuredLab: asTuple(rgbToLab([105, 145, 122])),
    };
    const secondLut = {
        ...f.model.empiricalLuts[0],
        id: 'second-board-lut',
        sourceMatrixId: 'second-board-matrix',
        samples: [secondSample],
    };
    const model: AppearanceRankModelV1 = {
        ...f.model,
        empiricalLuts: [...f.model.empiricalLuts, secondLut],
        exactAnchors: [
            ...f.model.exactAnchors,
            {
                ...f.model.exactAnchors[0],
                id: secondSample.exactAnchorId,
                proofId: secondLut.sourceMatrixId,
                targetLab: secondSample.measuredLab,
            },
        ],
    };
    const query = [...f.foundation, ...f.recipe, layer('cover', 0.08)];
    const resolved = f.appearance.resolveAppearanceRankModel(f.base(query), model, query);
    assert.equal(resolved.empiricalMatch?.transfers?.length, 2);
    assert.equal(new Set(resolved.empiricalMatch.transfers.map((entry) => entry.lutId)).size, 2);
    const below = [...f.foundation, ...f.recipe, layer('cover', 0.24 - 0.000001)];
    const boundary = [...f.foundation, ...f.recipe, layer('cover', 0.24)];
    const resolvedBelow = f.appearance.resolveAppearanceRankModel(f.base(below), model, below);
    const resolvedBoundary = f.appearance.resolveAppearanceRankModel(
        f.base(boundary),
        model,
        boundary
    );
    assert.ok(deltaE2000Lab(resolvedBelow.lab, resolvedBoundary.lab) < 0.01);
    assert.equal(resolvedBelow.exactAnchor, undefined);
    assert.equal(resolvedBoundary.exactAnchor, undefined);
});
