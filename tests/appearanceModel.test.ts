import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

import type { Filament } from '../src/types/index.ts';
import type { CanonicalSrgbColor, FinalPrintableStackSnapshot } from '../src/types/appearance.ts';
import type { PaletteTargetMatchQuality } from '../src/lib/appearanceProfile.ts';
import { labToRgb, rgbToLab } from '../src/lib/colorDifference.ts';
import { buildPaletteProofSnapshot } from './helpers/paletteProofFixture.ts';

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
    const server = await createServer({
        appType: 'custom',
        cacheDir: 'dist/.vite-test-cache',
        configFile: false,
        logLevel: 'error',
        optimizeDeps: { noDiscovery: true },
        resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
        root: process.cwd(),
        server: { hmr: false, middlewareMode: true },
    });
    try {
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
    } finally {
        await server.close();
    }
}

const modules = loadModules();

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

    assert.equal(bestAvailable.modelVersion, 'lab-rank-global-v4');
    assert.equal(bestAvailable.applied, true);
    assert.equal(close.applied, true);
    assert.equal(exact.applied, true);
    assert.ok(close.deltaL >= bestAvailable.deltaL);
    assert.ok(exact.deltaL >= close.deltaL);
    assert.notEqual(bestAvailable.fingerprint, close.fingerprint);
    assert.notEqual(close.fingerprint, exact.fingerprint);
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
