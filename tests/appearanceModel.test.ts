import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

import type { Filament } from '../src/types/index.ts';
import type { CanonicalSrgbColor, FinalPrintableStackSnapshot } from '../src/types/appearance.ts';
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

async function buildSyntheticAppearance(response: 'closest' | 'none') {
    const {
        buildPaletteProofRecord,
        completePaletteProofEvaluation,
        createEmptyAppearanceProfile,
        setPaletteTargetResponse,
        upsertPaletteProofRecord,
    } = (await modules).profile;
    const { buildPaletteProofSpec } = (await modules).proof;
    let appearance = createEmptyAppearanceProfile();

    for (let group = 0; group < 3; group++) {
        const snapshot = shiftedProofSnapshot(group);
        const proof = buildPaletteProofSpec(snapshot, { targetCount: 10, candidateCount: 5 });
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
                    : { response: 'closest', closestCellIds: [winner.id] },
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
    assert.ok(first.heldOutCount >= 2);
    assert.deepEqual(second, first);
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
    assert.equal(model.noneCount, 30);
    assert.ok(model.comparedStackKeys.length >= 8);
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
