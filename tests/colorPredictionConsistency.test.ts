import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { withViteTestServer } from './helpers/viteModule.ts';
import { deltaE2000Lab, rgbToLab } from '../src/lib/colorDifference.ts';
import type { Filament } from '../src/types/index.ts';
import type { AppearanceRankModelV1, AppearanceEmpiricalLutV1 } from '../src/types/appearance.ts';

const modules = withViteTestServer(async (server) => ({
    auto: (await server.ssrLoadModule(
        '/src/lib/autoPaint.ts'
    )) as typeof import('../src/lib/autoPaint.ts'),
    optics: (await server.ssrLoadModule(
        '/src/lib/effectiveOptics.ts'
    )) as typeof import('../src/lib/effectiveOptics.ts'),
    appearance: (await server.ssrLoadModule(
        '/src/lib/appearanceModel.ts'
    )) as typeof import('../src/lib/appearanceModel.ts'),
    preview: (await server.ssrLoadModule(
        '/src/lib/previewRenderMode.ts'
    )) as typeof import('../src/lib/previewRenderMode.ts'),
    proof: (await server.ssrLoadModule(
        '/src/lib/paletteProof.ts'
    )) as typeof import('../src/lib/paletteProof.ts'),
}));

const filaments: Filament[] = [
    { id: 'black', color: '#000000', td: 0.05 },
    { id: 'white', color: '#ffffff', td: 0.5 },
];

async function fittedFixture() {
    const { optics, appearance } = await modules;
    const prior = optics.createPriorEffectiveOpticsModel(filaments);
    const effectiveOptics = {
        ...prior,
        applied: true,
        filaments: prior.filaments.map((f) =>
            f.filamentId === 'white'
                ? {
                      ...f,
                      effectiveHdChannels: [1, 1.1, 1.2] as const,
                      effectiveOpaqueColor: [235, 240, 245] as const,
                  }
                : f
        ),
        substrateInteractions: [
            {
                foregroundFilamentId: 'white',
                substrateFilamentId: 'black',
                hdMultiplier: 1,
                sampleCount: 10,
                maxObservedThickness: 0.16,
            },
        ],
    };
    return { ...appearance.createIdentityAppearanceRankModel(), effectiveOptics };
}

test('a valid unique match survives grouping with an earlier out-of-limit neighbor', async () => {
    const { auto } = await modules;
    const palette = [38.5, 40].map((L, index) => ({
        height: 0.4 + index * 0.08,
        lab: { L, a: 0, b: 0 },
        rgb: { r: 0, g: 0, b: 0 },
    }));
    const target = { L: 50, a: 0, b: 0, weight: 1 };
    for (const entries of [palette, [...palette].reverse()]) {
        const result = auto.mapTargetsWithSeparation(entries, [target], 10);
        assert.equal(result.report.uniquelyPreservedWithinThresholdCount, 1);
        assert.equal(result.mappedTargets[0].mappedLab.L, 40);
        assert.ok(Math.abs(result.mappedTargets[0].projectedHeight - 0.48) < 1e-8);
    }
});

test('dropped targets reuse the actual preserved group member rather than another member', async () => {
    const { auto } = await modules;
    const palette = [38.5, 40].map((L, index) => ({
        height: 0.4 + index * 0.08,
        lab: { L, a: 0, b: 0 },
        rgb: { r: 0, g: 0, b: 0 },
    }));
    const result = auto.mapTargetsWithSeparation(
        palette,
        [
            { L: 50, a: 0, b: 0, weight: 0.9 },
            { L: 38.5, a: 0, b: 0, weight: 0.1 },
        ],
        10
    );
    assert.equal(result.report.uniquelyPreservedWithinThresholdCount, 1);
    assert.deepEqual(
        result.mappedTargets.map((entry) => entry.mappedLab.L),
        [40, 40]
    );
    assert.equal(result.mappedTargets[1].preservedWithinThreshold, false);
});

test('actual printable prefixes and the calibration recipe predictor agree', async () => {
    const { auto, optics } = await modules;
    const model = await fittedFixture();
    for (const cap of [undefined, 0.8, 1.04]) {
        const palette = auto.buildAchievableColorPalette(
            filaments,
            0.08,
            0.4,
            cap,
            0.8,
            undefined,
            model
        );
        const layers: Array<{ filamentId: string; thickness: number }> = [];
        let previous = 0;
        for (const entry of palette) {
            layers.push({
                filamentId: entry.filamentId!,
                thickness: Number((entry.height - previous).toFixed(8)),
            });
            previous = entry.height;
            const color = optics.predictEffectiveAutoPaintColor(model.effectiveOptics, layers)!;
            assert.ok(
                deltaE2000Lab(entry.lab, rgbToLab(color)) < 1e-7,
                `prefix ${entry.height} at cap ${cap}`
            );
        }
    }
});

test('fitted thickness support has continuous colors and conservative opaque limits', async () => {
    const { optics } = await modules;
    const model = (await fittedFixture()).effectiveOptics;
    const predict = (thickness: number) =>
        optics.predictEffectiveRecipeColor(model, 'black', [{ filamentId: 'white', thickness }])!;
    assert.ok(deltaE2000Lab(rgbToLab(predict(0.16)), rgbToLab(predict(0.16001))) < 0.01);
    assert.ok(deltaE2000Lab(rgbToLab(predict(20)), rgbToLab([255, 255, 255])) < 0.001);
    assert.deepEqual(
        predict(0.24),
        optics.predictEffectiveRecipeColor(model, 'black', [
            { filamentId: 'white', thickness: 0.08 },
            { filamentId: 'white', thickness: 0.16 },
        ])
    );
});

test('foundation-only targets cannot trim or map below the opaque foundation', async () => {
    const { auto } = await modules;
    const pink = { id: 'pink', color: '#ff7eb4', td: 2 };
    const result = auto.generateAutoLayers(
        [pink, filaments[0]],
        [{ hex: pink.color, count: 1 }],
        0.08,
        0.16,
        undefined,
        true,
        false,
        {
            algorithm: 'exact',
            seed: 42,
            preserveSeparation: true,
            separationMaxDeltaE: 1,
            failOnSeparationError: false,
        }
    );
    assert.ok(result.totalHeight >= 2.6);
    assert.ok(result.finalStack.targetMappings.every((entry) => entry.projectedHeight >= 2.6));
});

test('color-accurate first entry restores original opacity and color writes from every mode', async () => {
    const { preview } = await modules;
    for (const mode of ['shaded', 'transparent', 'wireframe'] as const) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(),
            new THREE.MeshStandardMaterial({ color: '#d83400' })
        );
        const baselines = preview.createPreviewMaterialBaselines();
        preview.applyPreviewRenderMode(mesh, mode, baselines);
        preview.applyPreviewRenderMode(mesh, 'color-accurate', baselines);
        assert.equal(mesh.material.opacity, 1, mode);
        assert.equal(mesh.material.colorWrite, true, mode);
        assert.equal(mesh.material.depthTest, true, mode);
    }
});

test('empirical interpolation fades continuously while exact Matrix recipes remain authoritative', async () => {
    const { appearance } = await modules;
    const layers = (ids: readonly string[]) =>
        ids.map((filamentId) => ({ filamentId, filamentColor: '#808080', thickness: 0.08 }));
    const samples = [
        ['b', 'a', 'a'],
        ['a', 'b', 'a'],
    ].map((recipeFilamentIds, index) => ({
        id: `sample-${index}`,
        exactAnchorId: `anchor-${index}`,
        sourceStackKey: `stack-${index}`,
        recipeFilamentIds,
        predictedLab: [50, 0, 0] as const,
        measuredLab: [65, 0, 0] as const,
        confidence: 1,
    }));
    const foundationLayers = [
        { filamentId: 'foundation', filamentColor: '#000000', thickness: 0.4 },
    ];
    const lut: AppearanceEmpiricalLutV1 = {
        id: 'lut',
        sourceMatrixId: 'matrix',
        observedAt: '2026-09-05T00:00:00Z',
        layerHeight: 0.08,
        stackLayerCount: 3,
        backingFilamentId: 'foundation',
        foundationLayers,
        filamentIds: ['a', 'b'],
        alignmentWeight: 1,
        coverageWeight: 1,
        recencyWeight: 1,
        agreementWeight: 1,
        matrixWeight: 1,
        coverageRadius: 10,
        samples,
    };
    const model: AppearanceRankModelV1 = {
        ...appearance.createIdentityAppearanceRankModel(),
        empiricalLuts: [lut],
        exactAnchors: samples.map((sample) => ({
            id: sample.exactAnchorId,
            proofId: 'matrix',
            source: 'stack-matrix',
            sourceStackKey: sample.sourceStackKey,
            targetLab: sample.measuredLab,
            suffixLayers: layers(sample.recipeFilamentIds),
            maxSubstrateTransmission: 0,
        })),
    };
    const recipe = [...foundationLayers, ...layers(['a', 'a', 'a'])];
    const before = appearance.resolveAppearanceRankModel(
        { L: 59.99999, a: 0, b: 0 },
        model,
        recipe
    );
    const after = appearance.resolveAppearanceRankModel({ L: 60.00001, a: 0, b: 0 }, model, recipe);
    assert.ok(deltaE2000Lab(before.lab, after.lab) < 0.001);
    assert.equal(before.empiricalMatch?.kind, 'interpolated');
    assert.equal(after.empiricalMatch, undefined);
    const exact = appearance.resolveAppearanceRankModel({ L: 95, a: 0, b: 0 }, model, [
        ...foundationLayers,
        ...layers(samples[0].recipeFilamentIds),
    ]);
    assert.equal(exact.lab.L, 65);
    assert.equal(exact.empiricalMatch?.kind, 'exact');
});

test('too-small Max Height does not compress a foundation and claim opaque colors', async () => {
    const { auto } = await modules;
    const pink = { id: 'pink', color: '#ff7eb4', td: 2 };
    assert.deepEqual(auto.buildAchievableColorPalette([pink], 0.08, 0.16, 0.4), []);
    assert.throws(
        () => auto.generateAutoLayers([pink], [{ hex: pink.color }], 0.08, 0.16, 0.4),
        /opaque foundation/
    );
});

test('ordinary mapping and Palette Proof retain foundation thickness without changing physical indices', async () => {
    const { auto, proof } = await modules;
    const result = auto.generateAutoLayers(
        [{ ...filaments[0], td: 0.5 }, filaments[1]],
        [{ hex: '#000000' }, { hex: '#ffffff' }],
        0.08,
        0.16
    );
    const snapshot = result.finalStack;
    const minimum = result.transitionZones[0].minimumThickness!;
    assert.ok(minimum > 0.16);
    assert.equal(snapshot.layers.length, snapshot.palette.length);
    assert.ok(snapshot.targetMappings.every((mapping) => mapping.projectedHeight >= minimum));
    const spec = proof.buildPaletteProofSpec(snapshot);
    assert.ok(spec.cells.length > 0);
    assert.ok(
        spec.cells.every((cell) => snapshot.palette[cell.prefixIndex].surfaceEligible !== false)
    );
    assert.deepEqual(proof.validatePaletteProofSpec(snapshot, spec), []);
});

test('the physical layer-count safety cap cannot silently truncate the opaque foundation', async () => {
    const { auto } = await modules;
    assert.throws(
        () =>
            auto.generateAutoLayers(
                [{ id: 'thick', color: '#ffffff', td: 12 }],
                [{ hex: '#ffffff' }],
                0.02,
                0.16
            ),
        /opaque foundation/
    );
});
