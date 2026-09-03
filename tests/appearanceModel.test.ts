import assert from 'node:assert/strict';
import test from 'node:test';

import type { Filament } from '../src/types/index.ts';
import type { CanonicalSrgbColor, FinalPrintableStackSnapshot } from '../src/types/appearance.ts';
import type { PaletteTargetMatchQuality } from '../src/lib/appearanceProfile.ts';
import {
    deltaE2000Lab,
    deltaE2000LabWithinRadius,
    deltaE2000LabWithinRadiusPrepared,
    deltaE2000LightnessLowerBound,
    labToRgb,
    rgbToLab,
} from '../src/lib/colorDifference.ts';
import { buildPaletteProofSnapshot } from './helpers/paletteProofFixture.ts';
import { withViteTestServer } from './helpers/viteModule.ts';

type AppearanceModelModule = typeof import('../src/lib/appearanceModel.ts');
type AppearanceProfileModule = typeof import('../src/lib/appearanceProfile.ts');
type PaletteProofModule = typeof import('../src/lib/paletteProof.ts');
type PaletteProofHistoryModule = typeof import('../src/lib/paletteProofHistory.ts');

async function loadModules(): Promise<{
    model: AppearanceModelModule;
    profile: AppearanceProfileModule;
    proof: PaletteProofModule;
    history: PaletteProofHistoryModule;
}> {
    return withViteTestServer(async (server) => {
        return {
            model: (await server.ssrLoadModule(
                '/src/lib/appearanceModel.ts'
            )) as AppearanceModelModule,
            profile: (await server.ssrLoadModule(
                '/src/lib/appearanceProfile.ts'
            )) as AppearanceProfileModule,
            proof: (await server.ssrLoadModule('/src/lib/paletteProof.ts')) as PaletteProofModule,
            history: (await server.ssrLoadModule(
                '/src/lib/paletteProofHistory.ts'
            )) as PaletteProofHistoryModule,
        };
    });
}

const modules = loadModules();

test('CIEDE2000 lightness lower bound never exceeds the full distance', () => {
    const labs = [
        { L: 0, a: 0, b: 0 },
        { L: 8, a: 70, b: -90 },
        { L: 24, a: -110, b: 45 },
        { L: 42, a: 35, b: 100 },
        { L: 50, a: -75, b: -60 },
        { L: 68, a: 95, b: 15 },
        { L: 84, a: -30, b: 75 },
        { L: 100, a: 0, b: 0 },
    ];
    for (const left of labs) {
        for (const right of labs) {
            assert.ok(
                deltaE2000LightnessLowerBound(left, right) <= deltaE2000Lab(left, right) + 1e-12
            );
        }
    }
});

test('CIEDE2000 radius rejection preserves every surviving distance exactly', () => {
    const labs = [
        { L: 0, a: 0, b: 0 },
        { L: 8, a: 70, b: -90 },
        { L: 24, a: -110, b: 45 },
        { L: 42, a: 35, b: 100 },
        { L: 50, a: -75, b: -60 },
        { L: 68, a: 95, b: 15 },
        { L: 84, a: -30, b: 75 },
        { L: 100, a: 0, b: 0 },
    ];
    for (const left of labs) {
        for (const right of labs) {
            const fullDistance = deltaE2000Lab(left, right);
            for (const radius of [6, 12, 20, 40]) {
                const boundedDistance = deltaE2000LabWithinRadius(left, right, radius);
                const preparedDistance = deltaE2000LabWithinRadiusPrepared(
                    left,
                    Math.hypot(left.a, left.b),
                    right,
                    Math.hypot(right.a, right.b),
                    radius
                );
                assert.equal(preparedDistance, boundedDistance);
                if (fullDistance <= radius) assert.equal(boundedDistance, fullDistance);
                else assert.ok(boundedDistance === fullDistance || boundedDistance === Infinity);
            }
        }
    }
});

const filaments: Filament[] = [
    { id: 'filament-0', color: '#000000', td: 0.1 },
    { id: 'filament-1', color: '#ffffff', td: 0.4 },
    { id: 'filament-2', color: '#ff0000', td: 0.2 },
    { id: 'filament-3', color: '#00ffff', td: 0.3 },
];

function canonical(rgb: readonly [number, number, number]): CanonicalSrgbColor {
    return {
        space: 'srgb',
        encoding: 'uint8',
        whitePoint: 'D65',
        rgb,
        hex: `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
    };
}

function shiftedProofSnapshot(group: number): FinalPrintableStackSnapshot {
    const original = buildPaletteProofSnapshot(33, 10);
    const layers = original.layers.map((layer, index) => {
        const rgb = labToRgb({ L: 5 + index * 2.8, a: 0, b: 0 });
        const color = canonical(rgb);
        const lab = rgbToLab(rgb);
        return {
            ...layer,
            filamentColor: color.hex,
            basePredictedColor: color,
            basePredictedLab: [lab.L, lab.a, lab.b] as const,
            predictedColor: color,
            predictedLab: [lab.L, lab.a, lab.b] as const,
        };
    });
    const palette = layers.map((layer) => ({
        id: `prefix-${layer.index + 1}`,
        index: layer.index,
        layerId: layer.id,
        height: layer.endHeight,
        canonicalStackKey: layer.canonicalStackKey,
        basePredictedColor: layer.basePredictedColor,
        basePredictedLab: layer.basePredictedLab,
        predictedColor: layer.predictedColor,
        predictedLab: layer.predictedLab,
        appearanceStatus: 'estimated' as const,
    }));
    const firstIndex = 1 + group * 10;
    const targetMappings = original.targetMappings.map((target, column) => {
        const paletteIndex = firstIndex + column;
        const currentLab = palette[paletteIndex].predictedLab;
        const nextLab = palette[paletteIndex + 1].predictedLab;
        const targetRgb = labToRgb({
            L: (currentLab[0] + nextLab[0]) / 2 + 0.2,
            a: 0,
            b: 0,
        });
        const targetColor = canonical(targetRgb);
        const targetLab = rgbToLab(targetRgb);
        return {
            ...target,
            targetColor,
            targetLab: [targetLab.L, targetLab.a, targetLab.b] as const,
            paletteIndex,
            paletteEntryId: palette[paletteIndex].id,
            canonicalStackKey: palette[paletteIndex].canonicalStackKey,
            projectedHeight: palette[paletteIndex].height,
            predictedColor: palette[paletteIndex].predictedColor,
            predictedLab: palette[paletteIndex].predictedLab,
        };
    });
    return {
        ...original,
        fingerprint: `appearance-fit-snapshot-${group}`,
        layers,
        palette,
        targetMappings,
    };
}

async function buildSyntheticAppearance(
    response: 'closest' | 'none',
    targetCounts: readonly number[] = [10, 10, 10],
    matchQuality: PaletteTargetMatchQuality = 'best-available'
) {
    const {
        buildPaletteProofRecord,
        completePaletteProofEvaluation,
        createEmptyAppearanceProfile,
        setPaletteTargetResponse,
        upsertPaletteProofRecord,
    } = (await modules).profile;
    const { buildPaletteProofSpec } = (await modules).proof;
    let appearance = createEmptyAppearanceProfile();

    for (let group = 0; group < targetCounts.length; group++) {
        const snapshot = shiftedProofSnapshot(group);
        const proof = buildPaletteProofSpec(snapshot, {
            targetCount: targetCounts[group],
            candidateCount: 5,
        });
        const timestamp = `2026-07-1${group + 1}T12:00:00.000Z`;
        appearance = upsertPaletteProofRecord(
            appearance,
            buildPaletteProofRecord(filaments, snapshot, proof, timestamp)
        );
        for (const column of proof.columns) {
            const target = snapshot.targetMappings.find(
                (mapping) => mapping.id === column.targetMappingId
            )!;
            const winner = proof.cells.find(
                (cell) =>
                    cell.column === column.column &&
                    cell.canonicalStackKey === target.canonicalStackKey
            )!;
            appearance = setPaletteTargetResponse(
                appearance,
                proof.id,
                column.column,
                response === 'none'
                    ? { response: 'none' }
                    : {
                          response: 'closest',
                          closestCellIds: [winner.id],
                          matchQuality,
                      },
                `2026-07-1${group + 1}T12:${String(column.column).padStart(2, '0')}:00.000Z`
            );
        }
        appearance = completePaletteProofEvaluation(
            appearance,
            proof.id,
            `2026-07-1${group + 1}T13:00:00.000Z`
        );
    }
    return appearance;
}

test('Lab conversion round-trips representative sRGB colors', () => {
    for (const rgb of [
        [0, 0, 0],
        [255, 255, 255],
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [123, 45, 210],
    ] as const) {
        const roundTrip = labToRgb(rgbToLab([rgb[0], rgb[1], rgb[2]]));
        assert.ok(roundTrip.every((channel, index) => Math.abs(channel - rgb[index]) <= 1));
    }
    assert.ok(
        labToRgb({ L: 150, a: 300, b: -300 }).every(
            (channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255
        )
    );
});

test('appearance transforms score the same gamut-mapped color they render', async () => {
    const { appearanceLabToRgb, applyAppearanceRankModel, createIdentityAppearanceRankModel } = (
        await modules
    ).model;
    const base = rgbToLab([255, 0, 0]);
    const model = {
        ...createIdentityAppearanceRankModel(),
        applied: true,
        gateReason: 'applied' as const,
        deltaL: 6,
        logChromaScale: 0.1,
    };

    const corrected = applyAppearanceRankModel(base, model);
    const rendered = appearanceLabToRgb(corrected);
    const realized = rgbToLab(rendered);

    assert.deepEqual(rendered, [255, 0, 0]);
    assert.ok(Math.abs(corrected.L - realized.L) < 1e-12);
    assert.ok(Math.abs(corrected.a - realized.a) < 1e-12);
    assert.ok(Math.abs(corrected.b - realized.b) < 1e-12);
});

test('conflicting exact anchors prefer reviewed Palette Proof evidence over simulator proximity', async () => {
    const { model } = await modules;
    const suffixLayers = [{ filamentId: 'purple', filamentColor: '#663399', thickness: 0.08 }];
    const identity = model.createIdentityAppearanceRankModel();
    const withAnchors = {
        ...identity,
        exactAnchors: [
            {
                id: 'matrix-newer',
                proofId: 'matrix-proof',
                source: 'stack-matrix' as const,
                sourceStackKey: 'matrix-stack',
                targetLab: [50, 1, 1] as [number, number, number],
                suffixLayers,
                maxSubstrateTransmission: 0,
                observedAt: '2026-08-08T12:00:00.000Z',
                confidence: 0.99,
            },
            {
                id: 'palette-reviewed',
                proofId: 'palette-proof',
                source: 'palette-proof' as const,
                sourceStackKey: 'proof-stack',
                targetLab: [72, 30, -20] as [number, number, number],
                suffixLayers,
                maxSubstrateTransmission: 0,
                observedAt: '2026-08-07T12:00:00.000Z',
                confidence: 1,
            },
        ],
    };

    const resolved = model.resolveAppearanceRankModel(
        { L: 50, a: 0, b: 0 },
        withAnchors,
        suffixLayers
    );
    assert.equal(resolved.exactAnchor?.id, 'palette-reviewed');
    assert.deepEqual(resolved.lab, { L: 72, a: 30, b: -20 });
});

test('deep Palette Proof exact-anchor suffixes retain confidence precedence after indexing', async () => {
    const { model } = await modules;
    const suffixLayers = [
        { filamentId: 'black', filamentColor: '#000000', thickness: 0.08 },
        { filamentId: 'cyan', filamentColor: '#00b8c4', thickness: 0.08 },
        { filamentId: 'purple', filamentColor: '#663399', thickness: 0.08 },
    ];
    const identity = model.createIdentityAppearanceRankModel();
    const anchor = (id: string, confidence: number, targetLab: [number, number, number]) => ({
        id,
        proofId: `proof-${id}`,
        source: 'palette-proof' as const,
        sourceStackKey: `stack-${id}`,
        targetLab,
        suffixLayers,
        maxSubstrateTransmission: 0,
        observedAt: '2026-08-08T12:00:00.000Z',
        confidence,
    });
    const withAnchors = {
        ...identity,
        exactAnchors: [
            anchor('lower-confidence', 0.7, [40, 10, 5]),
            anchor('winner', 0.95, [65, -5, 20]),
        ],
    };

    const resolved = model.resolveAppearanceRankModel({ L: 50, a: 0, b: 0 }, withAnchors, [
        { filamentId: 'foundation', filamentColor: '#ffffff', thickness: 0.4 },
        ...suffixLayers,
    ]);

    assert.equal(resolved.exactAnchor?.id, 'winner');
    assert.deepEqual(resolved.lab, { L: 65, a: -5, b: 20 });
});

test('every prediction reports ordered exact, interpolated, fitted, or simulated confidence', async () => {
    const { model } = await modules;
    const identity = model.createIdentityAppearanceRankModel();
    const sample = (
        id: string,
        recipeFilamentIds: readonly string[],
        predictedLab: readonly [number, number, number],
        measuredLab: readonly [number, number, number]
    ) => ({
        id,
        sourceStackKey: `stack-${id}`,
        recipeFilamentIds,
        predictedLab,
        measuredLab,
        confidence: 0.9,
        crossValidationDeltaE: 2,
        exactAnchorId: `anchor-${id}`,
    });
    const empiricalSamples = [
        sample('bottom', ['b', 'a', 'a'], [49, 0, 0], [51, 0, 0]),
        sample('middle', ['a', 'b', 'a'], [51, 0, 0], [53, 0, 0]),
        sample('top', ['a', 'a', 'b'], [50, 1, 0], [52, 1, 0]),
    ];
    const layers = (ids: readonly string[]) =>
        ids.map((filamentId) => ({ filamentId, filamentColor: '#808080', thickness: 0.08 }));
    const foundationLayers = [
        { filamentId: 'foundation', filamentColor: '#ffffff', thickness: 0.4 },
    ];
    const matrixLayers = (ids: readonly string[]) => [
        ...foundationLayers,
        ...layers(ids),
    ];
    const empiricalLut = {
        id: 'empirical-confidence',
        sourceMatrixId: 'matrix-confidence',
        observedAt: '2026-08-16T12:00:00.000Z',
        layerHeight: 0.08,
        stackLayerCount: 3,
        backingFilamentId: 'foundation',
        foundationLayers,
        filamentIds: ['a', 'b'],
        alignmentWeight: 0.9,
        coverageWeight: 1,
        recencyWeight: 1,
        agreementWeight: 0.9,
        matrixWeight: 0.9,
        coverageRadius: 30,
        crossValidationMeanDeltaE: 2,
        crossValidationP90DeltaE: 3,
        crossValidationSampleCount: 3,
        samples: empiricalSamples,
    };
    const withMatrix = {
        ...identity,
        exactAnchors: empiricalSamples.map((entry) => ({
            id: entry.exactAnchorId,
            proofId: empiricalLut.sourceMatrixId,
            source: 'stack-matrix' as const,
            sourceStackKey: entry.sourceStackKey,
            targetLab: entry.measuredLab,
            suffixLayers: layers(entry.recipeFilamentIds),
            maxSubstrateTransmission: 0,
        })),
        empiricalLuts: [empiricalLut],
    };
    const exact = model.resolveAppearanceRankModel(
        { L: 49, a: 0, b: 0 },
        withMatrix,
        matrixLayers(['b', 'a', 'a'])
    );
    const interpolated = model.resolveAppearanceRankModel(
        { L: 50, a: 0, b: 0 },
        withMatrix,
        matrixLayers(['a', 'a', 'a'])
    );
    const explainedInterpolation = model.resolveAppearanceRankModel(
        { L: 50, a: 0, b: 0 },
        withMatrix,
        matrixLayers(['a', 'a', 'a']),
        { includeContributions: true }
    );
    const fitted = model.resolveAppearanceRankModel(
        { L: 50, a: 0, b: 0 },
        { ...identity, applied: true, gateReason: 'applied', confidence: 0.8, deltaL: 1 },
        matrixLayers(['a', 'a', 'a'])
    );
    const simulated = model.resolveAppearanceRankModel(
        { L: 50, a: 0, b: 0 },
        identity,
        matrixLayers(['a', 'a', 'a'])
    );

    assert.equal(exact.predictionConfidence.method, 'exact');
    assert.equal(exact.predictionConfidence.nearestMeasuredDeltaE, 0);
    assert.equal(interpolated.predictionConfidence.method, 'interpolated');
    assert.ok((interpolated.predictionConfidence.nearestMeasuredDeltaE ?? Infinity) < 2);
    assert.ok(interpolated.predictionConfidence.evidenceSampleCount >= 2);
    assert.equal(interpolated.predictionConfidence.crossValidationDeltaE, 2);
    assert.equal(interpolated.empiricalMatch?.contributions, undefined);
    assert.ok((explainedInterpolation.empiricalMatch?.contributions?.length ?? 0) >= 2);
    assert.ok(
        Math.abs(
            (explainedInterpolation.empiricalMatch?.contributions ?? []).reduce(
                (sum, contribution) => sum + contribution.weight,
                0
            ) - 1
        ) < 1e-9
    );
    assert.equal(fitted.predictionConfidence.method, 'fitted');
    assert.equal(simulated.predictionConfidence.method, 'simulated');
    assert.equal(simulated.predictionConfidence.nearestMeasuredDeltaE, null);
    assert.ok(exact.predictionConfidence.confidence > interpolated.predictionConfidence.confidence);
    assert.ok(
        interpolated.predictionConfidence.confidence > fitted.predictionConfidence.confidence
    );
    assert.ok(fitted.predictionConfidence.confidence > simulated.predictionConfidence.confidence);
});

test('repeated nearby recipe losses reinforce one target-local uncertainty signal', async () => {
    const { model } = await modules;
    const identity = model.createIdentityAppearanceRankModel();
    const base = { L: 50, a: -30, b: 10 };
    const targetLab = [50, -30, 10] as const;
    const queryLayers = [
        { filamentId: 'green', filamentColor: '#16834a', thickness: 0.08 },
        { filamentId: 'green', filamentColor: '#16834a', thickness: 0.08 },
        { filamentId: 'white', filamentColor: '#f4f4f4', thickness: 0.08 },
    ];
    const rejectedEvidence = (id: string, suffixLayers: typeof queryLayers) => ({
        id,
        proofIds: [`proof-${id}`],
        judgmentIds: [`judgment-${id}`],
        sourceStackKey: `stack-${id}`,
        baseLab: [base.L, base.a, base.b] as const,
        targetLab,
        suffixLayers,
        observedAt: '2026-08-16T12:00:00.000Z',
        winnerCount: 0,
        loserCount: 1,
        noneCount: 0,
        tieWinnerCount: 0,
        supportWeight: 0,
        rejectionWeight: 0.8,
        preference: 0.44,
        confidence: 0.7,
        correctionStrength: 0,
    });
    const first = rejectedEvidence('green-loss-a', queryLayers);
    const second = rejectedEvidence('green-loss-b', queryLayers.slice(1));
    const single = model.resolveAppearanceRankModel(
        base,
        { ...identity, localEvidence: [first] },
        queryLayers
    );
    const repeated = model.resolveAppearanceRankModel(
        base,
        { ...identity, localEvidence: [first, second] },
        queryLayers
    );

    assert.ok(single.localMatch);
    assert.ok(repeated.localMatch);
    assert.ok(single.localMatch.preferences[0].preference > 0);
    assert.ok(
        repeated.localMatch.preferences[0].confidence > single.localMatch.preferences[0].confidence,
        'consistent losses from similar green recipes should reinforce confidence'
    );
    assert.deepEqual(repeated.lab, base, 'rejection evidence must not invent a color correction');
});

test('appearance fit is deterministic and only applies after held-out improvement', async () => {
    const { model, profile } = await modules;
    const { fitAppearanceRankModel } = model;
    const { fingerprintAppearanceFilaments } = profile;
    const appearance = await buildSyntheticAppearance('closest');
    const context = {
        filamentProfileFingerprint: fingerprintAppearanceFilaments(filaments),
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
        transitionOpacity: 0.9,
    };
    const first = fitAppearanceRankModel(appearance, context);
    const second = fitAppearanceRankModel(
        { ...appearance, proofs: [...appearance.proofs].reverse() },
        context
    );

    assert.equal(first.applied, true);
    assert.ok(first.deltaL > 0);
    assert.ok(first.fittedAgreement >= 0.7);
    assert.ok(first.fittedAgreement >= first.baselineAgreement + 0.1);
    assert.equal(first.trainingObservationCount, 20);
    assert.ok(first.trainingDistinctStackCount >= 8);
    assert.equal(first.heldOutCount, 10);
    assert.ok(first.heldOutDistinctStackCount >= 2);
    assert.deepEqual(second, first);
});

test('match quality participates in deterministic absolute color anchoring', async () => {
    const { model, profile } = await modules;
    const context = {
        filamentProfileFingerprint: profile.fingerprintAppearanceFilaments(filaments),
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
        transitionOpacity: 0.9,
    };
    const bestAvailable = model.fitAppearanceRankModel(
        await buildSyntheticAppearance('closest', [10, 10, 10], 'best-available'),
        context
    );
    const close = model.fitAppearanceRankModel(
        await buildSyntheticAppearance('closest', [10, 10, 10], 'close'),
        context
    );
    const exact = model.fitAppearanceRankModel(
        await buildSyntheticAppearance('closest', [10, 10, 10], 'exact'),
        context
    );

    assert.equal(bestAvailable.modelVersion, 'lab-rank-local-v9');
    assert.equal(bestAvailable.applied, true);
    assert.equal(close.applied, true);
    assert.equal(exact.applied, true);
    assert.ok(close.deltaL >= bestAvailable.deltaL);
    assert.ok(exact.deltaL >= close.deltaL);
    assert.notEqual(bestAvailable.fingerprint, close.fingerprint);
    assert.notEqual(close.fingerprint, exact.fingerprint);

    const bestWinner = bestAvailable.localEvidence.find((evidence) => evidence.winnerCount > 0)!;
    const bestLoser = bestAvailable.localEvidence.find((evidence) => evidence.loserCount > 0)!;
    assert.ok(bestWinner.preference < 0, 'Best available should locally support its winner');
    assert.ok(bestLoser.preference > 0, 'Best available should locally reject its losers');
    assert.equal(bestWinner.correctionStrength, 0, 'Best available is not an absolute color');

    const closeWinner = close.localEvidence.find((evidence) => evidence.winnerCount > 0)!;
    const exactWinner = exact.localEvidence.find((evidence) => evidence.winnerCount > 0)!;
    assert.equal(closeWinner.correctionStrength, 0.65);
    assert.equal(exactWinner.correctionStrength, 1);

    const resolveEvidence = (
        fitted: typeof bestAvailable,
        evidence: (typeof fitted.localEvidence)[number],
        perturbTopThickness = false
    ) => {
        const isolated = {
            ...fitted,
            applied: false,
            gateReason: 'insufficient-evidence' as const,
            deltaL: 0,
            logChromaScale: 0,
            localEvidence: [evidence],
            empiricalLuts: [],
        };
        const base = { L: evidence.baseLab[0], a: evidence.baseLab[1], b: evidence.baseLab[2] };
        const suffixLayers = evidence.suffixLayers.map((layer, index) =>
            perturbTopThickness && index === evidence.suffixLayers.length - 1
                ? { ...layer, thickness: layer.thickness + 0.001 }
                : { ...layer }
        );
        return {
            base,
            noLocal: model.resolveAppearanceRankModel(
                base,
                { ...isolated, localEvidence: [] },
                suffixLayers
            ),
            local: model.resolveAppearanceRankModel(base, isolated, suffixLayers),
        };
    };

    const bestResolved = resolveEvidence(bestAvailable, bestWinner);
    assert.deepEqual(bestResolved.local.lab, bestResolved.noLocal.lab);
    assert.equal(bestResolved.local.localMatch?.correctionStrength, 0);
    assert.ok(
        bestResolved.local.localMatch?.preferences.some((preference) => preference.preference < 0)
    );

    const closeResolved = resolveEvidence(close, closeWinner);
    const closeTarget = {
        L: closeWinner.targetLab[0],
        a: closeWinner.targetLab[1],
        b: closeWinner.targetLab[2],
    };
    assert.ok(
        deltaE2000Lab(closeResolved.local.lab, closeTarget) <
            deltaE2000Lab(closeResolved.noLocal.lab, closeTarget),
        'Close should pull nearby recipes toward the reviewed target'
    );

    const exactResolved = resolveEvidence(exact, exactWinner, true);
    const exactTarget = {
        L: exactWinner.targetLab[0],
        a: exactWinner.targetLab[1],
        b: exactWinner.targetLab[2],
    };
    assert.equal(exactResolved.local.exactAnchor, undefined, 'the perturbed recipe is not exact');
    assert.ok(
        deltaE2000Lab(exactResolved.local.lab, exactTarget) <
            deltaE2000Lab(exactResolved.noLocal.lab, exactTarget),
        'Dead-on should transfer a stronger correction to a nearby physical recipe'
    );

    const unrelated = model.resolveAppearanceRankModel(bestResolved.base, bestAvailable, [
        { filamentId: 'unrelated', filamentColor: '#123456', thickness: 0.08 },
    ]);
    assert.equal(
        unrelated.localMatch,
        undefined,
        'local evidence must not leak to unrelated recipes'
    );
    const unrelatedColor = model.resolveAppearanceRankModel(
        { L: 5, a: 90, b: -90 },
        bestAvailable,
        bestWinner.suffixLayers
    );
    assert.equal(
        unrelatedColor.localMatch,
        undefined,
        'local evidence must also decay outside the reviewed color neighborhood'
    );
});

test('Dead-on evidence transfers through the complete opaque top run without pinning the foundation', async () => {
    const { model, profile, proof } = await modules;
    const proofFilaments: Filament[] = [
        { id: 'foundation', color: '#111111', td: 0.08 },
        { id: 'purple', color: '#4a2378', td: 0.16 },
    ];
    const original = buildPaletteProofSnapshot(4, 1);
    const targetColor = canonical([62, 62, 96]);
    const targetLab = rgbToLab([targetColor.rgb[0], targetColor.rgb[1], targetColor.rgb[2]]);
    const layers = original.layers.map((layer, index) => ({
        ...layer,
        filamentId: index === 0 ? 'foundation' : 'purple',
        filamentColor: index === 0 ? '#111111' : '#4a2378',
        canonicalStackKey: `dead-on-stack-${index + 1}`,
    }));
    const palette = original.palette.map((entry, index) => ({
        ...entry,
        canonicalStackKey: layers[index].canonicalStackKey,
    }));
    const selected = palette[3];
    const snapshot: FinalPrintableStackSnapshot = {
        ...original,
        fingerprint: 'dead-on-suffix-snapshot',
        layers,
        palette,
        targetMappings: [
            {
                ...original.targetMappings[0],
                targetColor,
                targetLab: [targetLab.L, targetLab.a, targetLab.b],
                paletteIndex: selected.index,
                paletteEntryId: selected.id,
                canonicalStackKey: selected.canonicalStackKey,
                projectedHeight: selected.height,
                predictedColor: selected.predictedColor,
                predictedLab: selected.predictedLab,
            },
        ],
    };
    const spec = proof.buildPaletteProofSpec(snapshot, { targetCount: 1, candidateCount: 4 });
    const winner = spec.cells.find(
        (cell) => cell.canonicalStackKey === selected.canonicalStackKey
    )!;
    let appearance = profile.upsertPaletteProofRecord(
        profile.createEmptyAppearanceProfile(),
        profile.buildPaletteProofRecord(proofFilaments, snapshot, spec, '2026-07-20T12:00:00.000Z')
    );
    appearance = profile.setPaletteTargetResponse(
        appearance,
        spec.id,
        0,
        { response: 'closest', closestCellIds: [winner.id], matchQuality: 'exact' },
        '2026-07-20T12:01:00.000Z'
    );
    appearance = profile.completePaletteProofEvaluation(
        appearance,
        spec.id,
        '2026-07-20T12:02:00.000Z'
    );

    const fitted = model.fitAppearanceRankModel(appearance, {
        filamentProfileFingerprint: profile.fingerprintAppearanceFilaments(proofFilaments),
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
        transitionOpacity: 0.9,
        filaments: proofFilaments,
    });
    const differentTransitionDetail = model.fitAppearanceRankModel(appearance, {
        filamentProfileFingerprint: profile.fingerprintAppearanceFilaments(proofFilaments),
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
        transitionOpacity: 0.95,
        filaments: proofFilaments,
    });

    assert.equal(fitted.applied, false, 'a local anchor must not bypass the global-fit gate');
    assert.equal(fitted.exactAnchors.length, 1);
    assert.equal(differentTransitionDetail.observationCount, 0);
    assert.equal(differentTransitionDetail.exactAnchors.length, 1);
    assert.deepEqual(
        fitted.exactAnchors[0].suffixLayers.map((layer) => layer.filamentId),
        ['purple', 'purple', 'purple']
    );
    assert.ok(fitted.exactAnchors[0].maxSubstrateTransmission <= 0.1);

    const differentFoundation = {
        filamentId: 'other-foundation',
        filamentColor: '#eeeeee',
        thickness: 0.16,
    };
    const purpleLayers = fitted.exactAnchors[0].suffixLayers;
    const base = rgbToLab([80, 40, 120]);
    const transferred = model.resolveAppearanceRankModel(base, fitted, [
        differentFoundation,
        ...purpleLayers,
    ]);
    const tooShort = model.resolveAppearanceRankModel(base, fitted, [
        differentFoundation,
        ...purpleLayers.slice(1),
    ]);

    assert.equal(transferred.exactAnchor?.id, fitted.exactAnchors[0].id);
    assert.deepEqual(transferred.lab, targetLab);
    assert.equal(tooShort.exactAnchor, undefined);
});

test('held-out split chooses the proof closest to the validation target', async () => {
    const { model, profile } = await modules;
    const appearance = await buildSyntheticAppearance('closest', [10, 2]);
    const fitted = model.fitAppearanceRankModel(appearance, {
        filamentProfileFingerprint: profile.fingerprintAppearanceFilaments(filaments),
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
        transitionOpacity: 0.9,
    });

    assert.equal(fitted.trainingObservationCount, 10);
    assert.equal(fitted.heldOutCount, 2);
});

test('none answers add uncertainty but never direct the fitted correction', async () => {
    const { model: modelModule, profile } = await modules;
    const { fitAppearanceRankModel } = modelModule;
    const { fingerprintAppearanceFilaments } = profile;
    const appearance = await buildSyntheticAppearance('none');
    const model = fitAppearanceRankModel(appearance, {
        filamentProfileFingerprint: fingerprintAppearanceFilaments(filaments),
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
        transitionOpacity: 0.9,
    });

    assert.equal(model.applied, false);
    assert.equal(model.deltaL, 0);
    assert.equal(model.logChromaScale, 0);
    assert.equal(model.observationCount, 0);
    assert.equal(model.trainingObservationCount, 0);
    assert.equal(model.trainingDistinctStackCount, 0);
    assert.equal(model.noneCount, 30);
    assert.ok(model.comparedStackKeys.length >= 8);
    assert.ok(model.distinctStackCount >= 8);
    assert.ok(model.localEvidence.length > 0);
    assert.ok(
        model.localEvidence.every(
            (evidence) =>
                evidence.noneCount > 0 &&
                evidence.preference > 0 &&
                evidence.correctionStrength === 0
        ),
        'None should add only local rejection evidence'
    );
    const rejected = model.localEvidence[0];
    const resolved = modelModule.resolveAppearanceRankModel(
        { L: rejected.baseLab[0], a: rejected.baseLab[1], b: rejected.baseLab[2] },
        model,
        rejected.suffixLayers
    );
    assert.ok(resolved.localMatch?.uncertainty && resolved.localMatch.uncertainty > 0);
    assert.ok(resolved.localMatch?.preferences.some((preference) => preference.preference > 0));
});

test('appearance evidence does not transfer across a changed print process', async () => {
    const { fitAppearanceRankModel } = (await modules).model;
    const appearance = await buildSyntheticAppearance('closest');
    const model = fitAppearanceRankModel(appearance, {
        filamentProfileFingerprint: 'different-filaments',
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
        transitionOpacity: 0.9,
    });

    assert.equal(model.applied, false);
    assert.equal(model.observationCount, 0);
    assert.equal(model.comparedStackKeys.length, 0);
});

test('proof history counts target visits and rejects evidence from another filament profile', async () => {
    const { profile, proof, history } = await modules;
    const snapshot = buildPaletteProofSnapshot(8, 1);
    const spec = proof.buildPaletteProofSpec(snapshot, { targetCount: 1, candidateCount: 2 });
    let appearance = profile.upsertPaletteProofRecord(
        profile.createEmptyAppearanceProfile(),
        profile.buildPaletteProofRecord(filaments, snapshot, spec, '2026-07-18T12:00:00.000Z')
    );
    appearance = profile.setPaletteTargetResponse(
        appearance,
        spec.id,
        0,
        { response: 'none' },
        '2026-07-18T12:01:00.000Z'
    );
    appearance = profile.completePaletteProofEvaluation(
        appearance,
        spec.id,
        '2026-07-18T12:02:00.000Z'
    );

    const result = history.buildPaletteProofHistory(appearance, {
        ...snapshot,
        fingerprint: 'reoptimized-stack',
    });
    assert.equal(result.selectionHistory.targetPriorityById.get(snapshot.targetMappings[0].id), 1);
    assert.equal(result.hasUnseenEvidence, true);
    const candidateHistory = result.selectionHistory.candidateHistoryByTargetId.get(
        snapshot.targetMappings[0].id
    );
    assert.deepEqual(candidateHistory?.anchorStackKeys, []);
    assert.equal(candidateHistory?.anchorStackKey, undefined);
    const continuationCandidates = proof.selectPrefixCandidates(
        snapshot.targetMappings[0],
        proof.enumerateFinalStackPrefixes(snapshot),
        undefined,
        5,
        candidateHistory,
        'local-refinement'
    );
    assert.ok(continuationCandidates.length > 0);
    assert.ok(continuationCandidates.every((candidate) => candidate.role === 'unseen-alternative'));
    assert.ok(
        continuationCandidates.every(
            (candidate) =>
                !candidateHistory?.testedStackKeys.has(candidate.prefix.canonicalStackKey)
        )
    );
    const nextProofCandidates = proof.selectPrefixCandidates(
        snapshot.targetMappings[0],
        proof.enumerateFinalStackPrefixes(snapshot),
        undefined,
        5,
        candidateHistory
    );
    assert.ok(nextProofCandidates.length > 0);
    assert.ok(nextProofCandidates.every((candidate) => candidate.role === 'unseen-alternative'));
    const rejected = history.buildPaletteProofHistory(
        appearance,
        snapshot,
        undefined,
        'different-filament-profile'
    );
    assert.equal(
        rejected.selectionHistory.targetPriorityById.get(snapshot.targetMappings[0].id),
        0
    );
    const fittedMode = history.buildPaletteProofHistory(
        appearance,
        snapshot,
        undefined,
        undefined,
        undefined,
        'fitted'
    );
    assert.equal(
        fittedMode.selectionHistory.targetPriorityById.get(snapshot.targetMappings[0].id),
        0
    );
});

test('proof history preserves tied previous-best stacks as the continuation anchor set', async () => {
    const { profile, proof, history } = await modules;
    const snapshot = buildPaletteProofSnapshot(8, 1);
    const spec = proof.buildPaletteProofSpec(snapshot, { targetCount: 1, candidateCount: 3 });
    const tiedCellIds = spec.columns[0].cellIds.slice(0, 2);
    let appearance = profile.upsertPaletteProofRecord(
        profile.createEmptyAppearanceProfile(),
        profile.buildPaletteProofRecord(filaments, snapshot, spec, '2026-07-18T12:00:00.000Z')
    );
    appearance = profile.setPaletteTargetResponse(
        appearance,
        spec.id,
        0,
        { response: 'closest', closestCellIds: [...tiedCellIds] },
        '2026-07-18T12:01:00.000Z'
    );
    appearance = profile.completePaletteProofEvaluation(
        appearance,
        spec.id,
        '2026-07-18T12:02:00.000Z'
    );

    const result = history.buildPaletteProofHistory(appearance, snapshot);
    const candidateHistory = result.selectionHistory.candidateHistoryByTargetId.get(
        snapshot.targetMappings[0].id
    );
    const cellsById = new Map(spec.cells.map((cell) => [cell.id, cell]));

    assert.deepEqual(
        candidateHistory?.anchorStackKeys,
        tiedCellIds.map((cellId) => cellsById.get(cellId)!.canonicalStackKey)
    );

    const fitted = (await modules).model.fitAppearanceRankModel(appearance, {
        filamentProfileFingerprint: profile.fingerprintAppearanceFilaments(filaments),
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
        transitionOpacity: 0.9,
    });
    const tiedStackKeys = new Set(
        tiedCellIds.map((cellId) => cellsById.get(cellId)!.canonicalStackKey)
    );
    const tiedEvidence = fitted.localEvidence.filter((evidence) =>
        tiedStackKeys.has(evidence.sourceStackKey)
    );
    assert.equal(tiedEvidence.length, 2);
    assert.ok(
        tiedEvidence.every(
            (evidence) =>
                evidence.winnerCount === 1 &&
                evidence.tieWinnerCount === 1 &&
                evidence.preference < 0
        ),
        'every tied winner should receive local support'
    );
    assert.ok(
        fitted.localEvidence.some(
            (evidence) => !tiedStackKeys.has(evidence.sourceStackKey) && evidence.preference > 0
        ),
        'unselected candidates should still receive local rejection evidence'
    );
});

test('proof history ignores tested stacks that are absent from the current printable stack', async () => {
    const { profile, proof, history } = await modules;
    const snapshot = buildPaletteProofSnapshot(8, 1);
    const spec = proof.buildPaletteProofSpec(snapshot, { targetCount: 1, candidateCount: 2 });
    let appearance = profile.upsertPaletteProofRecord(
        profile.createEmptyAppearanceProfile(),
        profile.buildPaletteProofRecord(filaments, snapshot, spec, '2026-07-18T12:00:00.000Z')
    );
    appearance = profile.setPaletteTargetResponse(
        appearance,
        spec.id,
        0,
        { response: 'none' },
        '2026-07-18T12:01:00.000Z'
    );
    appearance = profile.completePaletteProofEvaluation(
        appearance,
        spec.id,
        '2026-07-18T12:02:00.000Z'
    );

    const palette = snapshot.palette.map((entry, index) => ({
        ...entry,
        canonicalStackKey: `current-stack-${index + 1}`,
    }));
    const currentSnapshot: FinalPrintableStackSnapshot = {
        ...snapshot,
        fingerprint: 'current-reoptimized-stack',
        layers: snapshot.layers.map((layer, index) => ({
            ...layer,
            canonicalStackKey: palette[index].canonicalStackKey,
        })),
        palette,
        targetMappings: snapshot.targetMappings.map((target) => ({
            ...target,
            canonicalStackKey: palette[target.paletteIndex].canonicalStackKey,
        })),
    };
    const result = history.buildPaletteProofHistory(appearance, currentSnapshot);
    const targetId = currentSnapshot.targetMappings[0].id;

    assert.equal(result.selectionHistory.candidateHistoryByTargetId.has(targetId), false);
    assert.equal(result.selectionHistory.targetPriorityById.get(targetId), 1);
    assert.equal(result.hasUnseenEvidence, true);
});

test('new-target history does not repeat the immediately previous target set', async () => {
    const { profile, proof, history } = await modules;
    const snapshot = buildPaletteProofSnapshot(8, 12);
    let appearance = profile.createEmptyAppearanceProfile();

    const completeWithNone = (
        spec: ReturnType<typeof proof.buildPaletteProofSpec>,
        hour: number
    ) => {
        const baseTime = `2026-07-18T${String(hour).padStart(2, '0')}:00:00.000Z`;
        appearance = profile.upsertPaletteProofRecord(
            appearance,
            profile.buildPaletteProofRecord(filaments, snapshot, spec, baseTime)
        );
        for (const column of spec.columns) {
            appearance = profile.setPaletteTargetResponse(
                appearance,
                spec.id,
                column.column,
                { response: 'none' },
                baseTime
            );
        }
        appearance = profile.completePaletteProofEvaluation(appearance, spec.id, baseTime);
    };

    const first = proof.buildPaletteProofSpec(snapshot, { targetCount: 4, candidateCount: 2 });
    completeWithNone(first, 13);
    const firstIds = new Set(first.columns.map((column) => column.targetMappingId));
    const secondHistory = history.buildPaletteProofHistory(
        appearance,
        snapshot,
        undefined,
        undefined,
        firstIds
    );
    const second = proof.buildPaletteProofSpec(snapshot, {
        targetCount: 4,
        candidateCount: 2,
        selectionHistory: secondHistory.selectionHistory,
    });
    completeWithNone(second, 14);
    const secondIds = new Set(second.columns.map((column) => column.targetMappingId));
    const thirdHistory = history.buildPaletteProofHistory(
        appearance,
        snapshot,
        undefined,
        undefined,
        secondIds
    );
    const third = proof.buildPaletteProofSpec(snapshot, {
        targetCount: 4,
        candidateCount: 2,
        selectionHistory: thirdHistory.selectionHistory,
    });
    const thirdIds = new Set(third.columns.map((column) => column.targetMappingId));

    assert.equal(
        [...firstIds].some((targetId) => secondIds.has(targetId)),
        false
    );
    assert.equal(
        [...secondIds].some((targetId) => thirdIds.has(targetId)),
        false
    );
});
