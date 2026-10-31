import assert from 'node:assert/strict';
import test from 'node:test';
import type { AutoPaintResult } from '../src/lib/autoPaint.ts';
import type { ThreeDControlsStateShape } from '../src/types/index.ts';
import type { MultiHeadMeshPart } from '../src/lib/multiHeadGeometry.ts';
import { inspectMeshIntegrity } from './meshDiagnostics.ts';
import { withViteTestServer } from './helpers/viteModule.ts';

const {
    generateAutoLayers,
    createFinalStackTargetHeightCache,
    rgbToHex,
    rgbToLab,
    expandZonesToPrinterLayers,
    buildColorStack,
    buildPixelData,
    runMultiHeadLayerAnalysisColorFirst,
    multiHeadBuildSnapshot,
    getMultiHeadRoutingPlan,
    multiHeadExportOptions,
    buildMultiHeadSchedule,
    createMultiHeadTargetHeightCache,
    generateMultiHeadMeshes,
    quantizeHeightMap,
} = (await withViteTestServer(async (server) => ({
    ...(await server.ssrLoadModule('/src/lib/autoPaint.ts')),
    ...(await server.ssrLoadModule('/src/lib/multiHeadAnalysis.ts')),
    ...(await server.ssrLoadModule('/src/lib/multiHeadAnalysisColorFirst.ts')),
    ...(await server.ssrLoadModule('/src/lib/multiHeadBuild.ts')),
    ...(await server.ssrLoadModule('/src/lib/multiHeadSchedule.ts')),
    ...(await server.ssrLoadModule('/src/lib/multiHeadGeometry.ts')),
    ...(await server.ssrLoadModule('/src/lib/heightDithering.ts')),
}))) as typeof import('../src/lib/autoPaint.ts') &
    typeof import('../src/lib/multiHeadAnalysis.ts') &
    typeof import('../src/lib/multiHeadAnalysisColorFirst.ts') &
    typeof import('../src/lib/multiHeadBuild.ts') &
    typeof import('../src/lib/multiHeadSchedule.ts') &
    typeof import('../src/lib/multiHeadGeometry.ts') &
    typeof import('../src/lib/heightDithering.ts');

function improvingAnalysisFixture() {
    const filaments = [
        { id: 'dark', color: '#363636', td: 0.66 },
        { id: 'light', color: '#e8e8e8', td: 1.1 },
    ];
    const swatches = ['#0b0b0b', '#2e2e2e', '#7d7d7d', '#ababab', '#c2c2c2', '#aa7755'].map(
        (hex, i) => ({ hex, count: 1, edgeWeight: i === 5 ? 0 : 1 })
    );
    const seed = generateAutoLayers(
        filaments,
        swatches.map((swatch) => ({ hex: swatch.hex, count: swatch.edgeWeight })),
        0.25,
        0.25
    );
    // A fixed alternating stack guarantees improving windows without depending
    // on the optimizer's choice of base order or repeated filament runs.
    const sequence = [0, 1, 0, 1, 0];
    const zones = sequence.map((fi, i) => ({
        filamentId: filaments[fi].id,
        filamentColor: filaments[fi].color,
        filamentTd: filaments[fi].td,
        startHeight: i * 0.25,
        endHeight: (i + 1) * 0.25,
        idealThickness: 0.25,
        actualThickness: 0.25,
    }));
    const result: AutoPaintResult = {
        ...seed,
        layers: zones,
        transitionZones: zones,
        totalHeight: 1.25,
        finalStack: {
            ...seed.finalStack,
            totalHeight: 1.25,
            layers: zones.map((zone, i) => ({
                ...seed.finalStack.layers[0],
                ...zone,
                zoneIndex: i,
                thickness: 0.25,
            })),
            targetMappings: seed.finalStack.targetMappings.map((mapping, i) => ({
                ...mapping,
                projectedHeight: (i + 1) * 0.25,
            })),
        },
    };
    const layers = expandZonesToPrinterLayers(result, filaments, 0.25, 0.25);
    const colors = buildColorStack(layers);
    result.finalStack.palette = colors.map((rgb, i) => {
        const lab = rgbToLab(rgb);
        return {
            ...seed.finalStack.palette[0],
            index: i,
            height: (i + 1) * 0.25,
            surfaceEligible: true,
            predictedColor: {
                ...seed.finalStack.palette[0].predictedColor,
                hex: rgbToHex(rgb),
                rgb: [rgb.r, rgb.g, rgb.b],
            },
            predictedLab: [lab.L, lab.a, lab.b],
        };
    });
    const analysis = runMultiHeadLayerAnalysisColorFirst(
        filaments,
        result,
        swatches,
        0.25,
        0.25,
        4,
        'balanced'
    );
    assert.ok(analysis.windows.length > 0, 'the fixture must produce an improving layout');
    const state: ThreeDControlsStateShape = {
        layerHeight: 0.25,
        slicerFirstLayerHeight: 0.25,
        colorOrder: sequence.map((_, i) => i),
        colorSliceHeights: sequence.map(() => 0.25),
        filteredSwatches: filaments.map((filament) => ({ hex: filament.color, a: 255 })),
        pixelSize: 0.1,
        filaments,
        paintMode: 'autopaint',
        autoPaintResult: result,
        multiHeadMode: true,
        multiHeadCount: 4,
    };
    return { state, analysis, swatches, layers, colors };
}

test('clamped analysis retains selected physical heads as EMPTY in the schedule and export', () => {
    const { state, analysis } = improvingAnalysisFixture();
    const original = structuredClone(analysis);
    assert.ok(analysis.nozzleAssignments.every((heads) => heads.length === 2));
    for (const headCount of [2, 4, 8]) {
        const built = multiHeadBuildSnapshot({ ...state, multiHeadCount: headCount }, analysis);
        const plan = getMultiHeadRoutingPlan(built);
        assert.ok(plan, `${headCount} selected heads must accept the two-filament plan`);
        assert.equal(plan.multiHeadCount, headCount);
        plan.nozzleAssignments.forEach((heads, i) => {
            assert.deepEqual(heads.slice(0, 2), original.nozzleAssignments[i]);
            assert.deepEqual(heads.slice(2), new Array(headCount - 2).fill(-1));
        });
        plan.nonWindowedRanges.forEach((range, i) => {
            assert.deepEqual(
                range.nozzleFilaments.slice(0, 2),
                original.nonWindowedRanges[i].nozzleFilaments
            );
            assert.deepEqual(range.nozzleFilaments.slice(2), new Array(headCount - 2).fill(''));
        });
        const schedule = buildMultiHeadSchedule(plan)!;
        assert.ok(schedule.length > 0);
        for (const event of schedule) {
            assert.equal(event.nozzles.length, headCount);
            assert.ok(event.nozzles.slice(2).every((head) => head.empty && !head.changed));
        }
        assert.equal(multiHeadExportOptions(plan).extruderCount, headCount);
    }
    assert.deepEqual(analysis, original, 'padding must not mutate the worker result');
});

test('zero-weight printable colors use the analyzer fallback and retain their routed geometry', async () => {
    const { state, analysis, swatches, layers, colors } = improvingAnalysisFixture();
    const stack = state.autoPaintResult!.finalStack;
    const missing = swatches.at(-1)!;
    assert.equal(missing.edgeWeight, 0);
    assert.ok(
        !stack.targetMappings.some(
            (mapping) => mapping.targetColor.hex === missing.hex.toUpperCase()
        )
    );
    assert.ok(analysis.colorLayerFilaments.has(missing.hex));
    const plan = getMultiHeadRoutingPlan(
        multiHeadBuildSnapshot({ ...state, multiHeadCount: 2 }, analysis)
    )!;
    const expected = buildPixelData([missing], layers, colors, stack)[0];
    for (const dithering of [undefined, { layerHeight: 0.25 }]) {
        const targets = createMultiHeadTargetHeightCache(
            stack,
            plan.colorLayerFilaments.keys(),
            0.25,
            1.25,
            dithering
        );
        const existing = createFinalStackTargetHeightCache(
            stack.targetMappings,
            0.25,
            1.25,
            dithering ? { ...dithering, palette: stack.palette } : undefined
        );
        for (const [key, height] of existing) assert.equal(targets.get(key), height);
        const height = targets.get(parseInt(missing.hex.slice(1), 16));
        assert.equal(
            height,
            layers[expected.layerIdx].startZ + layers[expected.layerIdx].thickness
        );
        const data = new Uint8ClampedArray(3 * 3 * 4);
        const pixelHeights = new Float32Array(9);
        for (let i = 0; i < 9; i++) {
            const key = parseInt((i === 4 ? missing.hex : swatches[3].hex).slice(1), 16);
            data.set([key >> 16, (key >> 8) & 255, key & 255, 255], i * 4);
            pixelHeights[i] = targets.get(key)!;
        }
        quantizeHeightMap(pixelHeights, 3, 3, {
            layerHeight: 0.25,
            slicerFirstLayerHeight: 0.25,
            minModelH: 0.25,
            maxModelH: 1.25,
            heightDithering: !!dithering,
            ditherLineWidth: 0.1,
            pixelSize: 0.1,
        });
        const parts: MultiHeadMeshPart[] = [];
        for await (const part of generateMultiHeadMeshes({
            plan,
            data,
            imageWidth: 3,
            minX: 0,
            minY: 0,
            width: 3,
            height: 3,
            pixelHeights,
            pixelSize: 0.1,
            heightScale: 1,
            strength: 'none',
            yieldIntervalMs: Infinity,
            onYield: async () => {},
        }))
            parts.push(part);
        const center = parts.filter((part) => part.activePixelCount === 1);
        assert.deepEqual(
            center.map((part) => part.layerIndex),
            Array.from({ length: expected.layerIdx + 1 }, (_, i) => i)
        );
        for (const part of center) {
            const filament =
                state.filaments[analysis.colorLayerFilaments.get(missing.hex)![part.layerIndex]];
            assert.equal(part.mesh.userData.kromacutFilamentHex, filament.color);
            const mesh = part.mesh.geometry.userData.kromacutExportGeometry;
            assert.equal(inspectMeshIntegrity(mesh).isValid, true);
        }
    }
});
