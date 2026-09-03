import assert from 'node:assert/strict';
import test from 'node:test';

import { withViteTestServer } from './helpers/viteModule.ts';

type AutoPaintModule = typeof import('../src/lib/autoPaint.ts');
type DiagnosticsModule = typeof import('../src/lib/autoPaintDiagnostics.ts');
type AppearanceModule = typeof import('../src/lib/appearanceModel.ts');
type OptimizerModule = typeof import('../src/lib/optimizer.ts');
type OptimizerDiagnosticEvent = import('../src/lib/optimizer.ts').OptimizerDiagnosticEvent;

const modules = withViteTestServer(async (server) => ({
    autoPaint: (await server.ssrLoadModule('/src/lib/autoPaint.ts')) as AutoPaintModule,
    diagnostics: (await server.ssrLoadModule(
        '/src/lib/autoPaintDiagnostics.ts'
    )) as DiagnosticsModule,
    appearance: (await server.ssrLoadModule('/src/lib/appearanceModel.ts')) as AppearanceModule,
    optimizer: (await server.ssrLoadModule('/src/lib/optimizer.ts')) as OptimizerModule,
}));

const filaments = [
    { id: 'black', color: '#000000', td: 0.4 },
    { id: 'orange', color: '#E85A12', td: 0.8 },
    { id: 'white', color: '#FFFFFF', td: 1.2 },
];

const swatches = [
    { hex: '#151515', count: 60 },
    { hex: '#D64520', count: 30 },
    { hex: '#F4E8C8', count: 10 },
];

test('diagnostic result explains every final target against every printable candidate', async () => {
    const { autoPaint, diagnostics, appearance } = await modules;
    const result = autoPaint.generateAutoLayers(
        filaments,
        swatches,
        0.08,
        0.4,
        3.2,
        false,
        false,
        { algorithm: 'fast', transitionOpacity: 0.9 },
        appearance.createIdentityAppearanceRankModel()
    );
    const trace = diagnostics.buildAutoPaintDiagnosticRunResult(result, [], {
        appearanceFitMs: 1,
        generationMs: 2,
        traceAssemblyMs: 3,
        totalWorkerMs: 6,
    });

    assert.equal(trace.schemaVersion, diagnostics.AUTO_PAINT_DIAGNOSTIC_TRACE_SCHEMA_VERSION);
    assert.equal(trace.result.finalStack.fingerprint, result.finalStack.fingerprint);
    assert.equal(trace.analysis.printablePalette.length, result.finalStack.palette.length);
    assert.equal(trace.analysis.targetMappings.length, result.finalStack.targetMappings.length);
    for (const mapping of trace.analysis.targetMappings) {
        assert.equal(mapping.candidates.length, result.finalStack.palette.length);
        assert.equal(mapping.candidates.filter((candidate) => candidate.selected).length, 1);
        assert.ok(mapping.selectedCandidateRankByDeltaE2000 >= 1);
        assert.ok(Number.isFinite(mapping.selectedDeltaE2000));
    }
    for (const entry of trace.analysis.printablePalette) {
        assert.deepEqual(entry.physicalStackLayerRange, [0, entry.paletteIndex]);
        assert.equal(entry.snapshotResolutionDeltaE, 0);
    }
    assert.ok(trace.analysis.objective.weightedMeanDeltaE2000 >= 0);
    assert.ok(trace.analysis.objective.weightedP95DeltaE2000 >= 0);
    assert.ok(trace.analysis.objective.coverageWithinDeltaE6 >= 0);
    assert.ok(trace.analysis.objective.coverageWithinDeltaE6 <= 1);
});

test('optimizer diagnostics are bounded to decisions and do not change the selected result', async () => {
    const { autoPaint, optimizer } = await modules;
    const events: OptimizerDiagnosticEvent[] = [];
    const context = {
        imageColors: swatches.map((swatch) => ({
            ...autoPaint.rgbToLab(autoPaint.hexToRgb(swatch.hex)),
            weight: (swatch.count ?? 1) / 100,
        })),
        layerHeight: 0.08,
        firstLayerHeight: 0.4,
        maxHeight: 3.2,
        preserveSeparation: true,
        separationMaxDeltaE: 20,
    };
    const options = {
        algorithm: 'exhaustive' as const,
        maxExtraRepeats: 2,
        preserveSeparation: true,
        separationMaxDeltaE: 20,
        seed: 1234,
        cachingEnabled: false,
    };
    const traced = optimizer.optimizeFilamentOrder(filaments, context, {
        ...options,
        onDiagnostic: (event) => events.push(event),
    });
    const untraced = optimizer.optimizeFilamentOrder(filaments, context, options);

    assert.deepEqual(
        traced.order.map((filament) => filament.id),
        untraced.order.map((filament) => filament.id)
    );
    assert.equal(traced.score, untraced.score);
    assert.equal(events[0]?.type, 'configuration');
    assert.equal(events.at(-1)?.type, 'complete');
    assert.ok(events.filter((event) => event.type === 'repeat-tier').length <= 3);
    assert.ok(events.length <= 6);
    assert.ok(events.some((event) => event.type === 'minimization'));
});
