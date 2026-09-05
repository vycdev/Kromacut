import assert from 'node:assert/strict';
import test from 'node:test';
import type { DiagnosticStripDesign } from '../src/lib/diagnosticPrint.ts';
import type { FinalPrintableStackSnapshot } from '../src/types/appearance.ts';
import { withViteTestServer } from './helpers/viteModule.ts';
import { verifyDiagnostic3mf } from './helpers/diagnostic3mf.ts';

const modules = withViteTestServer(async (server) => ({
    diagnostics: (await server.ssrLoadModule(
        '/src/lib/diagnosticPrint.ts'
    )) as typeof import('../src/lib/diagnosticPrint.ts'),
    fit: (await server.ssrLoadModule(
        '/src/lib/appearanceModel.ts'
    )) as typeof import('../src/lib/appearanceModel.ts'),
    profile: (await server.ssrLoadModule(
        '/src/lib/appearanceProfile.ts'
    )) as typeof import('../src/lib/appearanceProfile.ts'),
    optics: (await server.ssrLoadModule(
        '/src/lib/effectiveOptics.ts'
    )) as typeof import('../src/lib/effectiveOptics.ts'),
    matrix: (await server.ssrLoadModule(
        '/src/lib/stackMatrixCalibration.ts'
    )) as typeof import('../src/lib/stackMatrixCalibration.ts'),
}));
async function fixture() {
    const m = await modules;
    const filaments = [
        { id: 'purple', color: '#6300c5', td: 0.4 },
        { id: 'cyan', color: '#00b8c4', td: 0.3 },
        { id: 'black', color: '#000000', td: 0.05 },
        { id: 'orange', color: '#d83400', td: 0.4 },
        { id: 'white', color: '#ffffff', td: 0.7 },
    ];
    const context = {
        filaments,
        filamentProfileFingerprint: m.profile.fingerprintAppearanceFilaments(filaments),
        layerHeight: 0.08,
        firstLayerHeight: 0.4,
        transitionOpacity: 0.8,
    };
    const model = m.fit.fitAppearanceRankModel(m.profile.createEmptyAppearanceProfile(), context);
    const design: DiagnosticStripDesign = {
        id: 'A-orange',
        title: 'Orange',
        purpose: 'Reproduce the complete prefix',
        backing: [
            { color: '#6300c5', layers: 3 },
            { color: '#00b8c4', layers: 4 },
            { color: '#000000', layers: 1 },
        ],
        foreground: '#d83400',
        topLayers: [0, 1, 2, 3, 4, 5, 6, 5],
    };
    return { ...m, context, model, design };
}

test('diagnostic recipes preserve the first-layer schedule and complete backing without mutating input', async () => {
    const f = await fixture(),
        before = JSON.stringify(f);
    const strip = f.diagnostics.planDiagnosticStrip(f.design, f.context, f.model);
    assert.deepEqual(
        strip.patches[5].recipe.map((r) => [r.filamentId, r.thickness]),
        [
            ['purple', 0.56],
            ['cyan', 0.32],
            ['black', 0.08],
            ['orange', 0.4],
        ]
    );
    assert.equal(strip.patches[5].layerCount, 13);
    assert.equal(strip.patches[5].totalHeight, 1.36);
    assert.equal(strip.patches[7].repeatOf, 'A-orange-06');
    assert.deepEqual(strip.patches[5].prediction, strip.patches[7].prediction);
    assert.deepEqual(strip.patches[0].recipe, strip.backing);
    assert.equal(strip.layers[0].endHeight, 0.4);
    assert.equal(JSON.stringify(f), before);
    assert.deepEqual(
        strip,
        f.diagnostics.planDiagnosticStrip(f.design, f.context, JSON.parse(JSON.stringify(f.model)))
    );
});

test('opaque control foundations round up to the physical first-layer grid', async () => {
    const f = await fixture();
    const strip = f.diagnostics.planDiagnosticStrip(
        { ...f.design, backing: [{ color: '#ffffff', layers: 'opaque' }] },
        f.context,
        f.model
    );
    const required = f.optics.minimumOpaqueFoundationThickness(f.model.effectiveOptics!, 'white');
    assert.ok(strip.backing[0].thickness >= required);
    assert.ok(strip.backing[0].thickness - 0.08 < required);
    assert.equal(strip.warnings.length, 0);
    assert.equal(strip.backingLayerCount, 1 + Math.ceil((required - 0.4 - 1e-8) / 0.08));
});

test('diagnostic predictions resolve measured layer recipes without flattening them into runs', async () => {
    const f = await fixture();
    const record = f.matrix.buildStackMatrixCalibration(
        f.context.filaments,
        {
            layerHeight: 0.08,
            firstLayerHeight: 0.16,
            stackLayerCount: 5,
            maximumSamples: 32,
            backingFilamentId: 'black',
        },
        '2026-09-05T12:00:00.000Z'
    );
    const measured = record.samples.find((sample) =>
        sample.stack.every((index) => record.filaments[index].id === 'orange')
    )!;
    assert.ok(measured);
    measured.measuredColor = {
        space: 'srgb',
        encoding: 'uint8',
        whitePoint: 'D65',
        rgb: [127, 74, 48],
        hex: '#7f4a30',
    };
    record.status = 'complete';
    record.completedAt = record.createdAt;
    const appearance = { ...f.profile.createEmptyAppearanceProfile(), stackMatrices: [record] };
    const before = JSON.stringify(appearance);
    const model = f.fit.fitAppearanceRankModel(appearance, f.context);
    const design: DiagnosticStripDesign = {
        ...f.design,
        backing: [{ color: '#000000', layers: 1 }],
        topLayers: [0, 4, 5, 6, 5],
    };
    const strip = f.diagnostics.planDiagnosticStrip(design, f.context, model);
    for (const index of [2, 4]) {
        const patch = strip.patches[index];
        assert.deepEqual(patch.recipe.map((run) => run.thickness), [0.4, 0.4]);
        assert.equal(patch.predictedHex, '#7f4a30');
        assert.equal(patch.prediction.predictionConfidence.method, 'exact');
        assert.deepEqual(patch.prediction.empiricalMatch?.sampleIds, [
            `${record.id}:${measured.index}`,
        ]);
        assert.equal(patch.prediction.empiricalMatch?.contributions?.[0].weight, 1);
    }
    for (const index of [0, 1, 3]) {
        assert.notEqual(strip.patches[index].prediction.predictionConfidence.method, 'exact');
    }
    const differentBacking = f.diagnostics.planDiagnosticStrip(
        { ...design, backing: [{ color: '#ffffff', layers: 'opaque' }] },
        f.context,
        model
    );
    assert.notEqual(differentBacking.patches[2].prediction.predictionConfidence.method, 'exact');
    assert.equal(JSON.stringify(appearance), before);
});

test('thin known foundations and changed Matrix first-layer schedules are disclosed, not silently thickened', async () => {
    const f = await fixture();
    const strip = f.diagnostics.planDiagnosticStrip(
        {
            ...f.design,
            backing: [{ color: '#ffffff', layers: 4 }],
            topLayers: [2, 2],
            reference: {
                matrixId: 'known',
                sampleIndex: 5,
                measuredRgb: [190, 70, 35],
                originalFirstLayerHeight: 0.16,
            },
        },
        f.context,
        f.model
    );
    assert.equal(strip.backing[0].thickness, 0.64);
    assert.equal(strip.warnings.length, 2);
    assert.equal(strip.patches[1].repeatOf, 'A-orange-01');
});

test('diagnostic strip validation rejects ambiguous materials, invalid counts and unsafe file IDs', async () => {
    const f = await fixture();
    for (const change of [
        { id: '../bad' },
        { topLayers: [1, -1] },
        { topLayers: [1, 1.5] },
        { backing: [] },
        { backing: [{ color: '#ffffff', layers: 0 }] },
        {
            backing: [
                { color: '#ffffff', layers: 1 },
                { color: '#000000', layers: 'opaque' as const },
            ],
        },
        { foreground: '#123456' },
        { foreground: '#000000' },
    ]) {
        assert.throws(() =>
            f.diagnostics.planDiagnosticStrip({ ...f.design, ...change }, f.context, f.model)
        );
    }
    const filaments = [
        ...f.context.filaments,
        { ...f.context.filaments[0], id: 'duplicate-swatch' },
    ];
    const context = {
        ...f.context,
        filaments,
        filamentProfileFingerprint: f.profile.fingerprintAppearanceFilaments(filaments),
    };
    assert.throws(() => f.diagnostics.planDiagnosticStrip(f.design, context, f.model), /ambiguous/);
});

test('serialized diagnostic 3MF has closed outward meshes, exact pad stacks and physical materials', async () => {
    const f = await fixture();
    const strip = f.diagnostics.planDiagnosticStrip(f.design, f.context, f.model);
    const bytes = new Uint8Array(
        await (await f.diagnostics.exportDiagnosticStrip(strip)).arrayBuffer()
    );
    const report = await verifyDiagnostic3mf(bytes, strip);
    assert.equal(report.physicalLayers, 14);
    assert.equal(report.patchStacksVerified, true);
    assert.deepEqual(report.patchLayerCounts, [8, 9, 10, 11, 12, 13, 14, 13]);
});

test('serialized single-layer foundation references stay exposed while raised repeats remain separate', async () => {
    const f = await fixture();
    const strip = f.diagnostics.planDiagnosticStrip(
        { ...f.design, backing: [{ color: '#000000', layers: 1 }], topLayers: [0, 1, 4, 1] },
        f.context,
        f.model
    );
    const bytes = new Uint8Array(
        await (await f.diagnostics.exportDiagnosticStrip(strip)).arrayBuffer()
    );
    assert.deepEqual((await verifyDiagnostic3mf(bytes, strip)).patchLayerCounts, [1, 2, 5, 2]);
});

test('trace match verification rejects changed layers even when the total height is identical', async () => {
    const f = await fixture();
    const strip = f.diagnostics.planDiagnosticStrip(f.design, f.context, f.model);
    const patch = strip.patches[5];
    const snapshot = {
        fingerprint: 'recorded',
        layers: strip.layers,
        targetMappings: [
            {
                targetColor: { hex: '#eb2123' },
                projectedHeight: patch.totalHeight,
                predictedColor: { hex: patch.predictedHex },
            },
        ],
    } as unknown as FinalPrintableStackSnapshot;
    const result = f.diagnostics.verifyDiagnosticTraceMatch(strip, 6, '#eb2123', snapshot);
    assert.equal(result.physicalRecipeIdentical, true);
    assert.equal(result.roundedPredictionUnchanged, true);
    const changed = structuredClone(snapshot);
    changed.layers[0].filamentId = 'black';
    assert.throws(
        () => f.diagnostics.verifyDiagnosticTraceMatch(strip, 6, '#eb2123', changed),
        /does not reproduce/
    );
    assert.throws(
        () => f.diagnostics.verifyDiagnosticTraceMatch(strip, 5, '#eb2123', snapshot),
        /does not reproduce/
    );
});
