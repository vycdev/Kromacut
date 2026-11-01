import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import JSZip from 'jszip';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import type { AutoPaintResult } from '../src/lib/autoPaint.ts';
import type { ThreeDControlsStateShape } from '../src/types/index.ts';
import type { MultiHeadMeshPart } from '../src/lib/multiHeadGeometry.ts';
import type { WindowResult } from '../src/lib/multiHeadAnalysis.ts';
import { inspectMeshIntegrity } from './meshDiagnostics.ts';
import { withViteTestServer } from './helpers/viteModule.ts';

const {
    generateAutoLayers,
    rgbToHex,
    hexToRgb,
    rgbToLab,
    expandZonesToPrinterLayers,
    buildColorStack,
    runMultiHeadLayerAnalysisColorFirst,
    buildMultiHeadSchedule,
    optimizeNozzleAssignments,
    multiHeadBuildSnapshot,
    getMultiHeadRoutingPlan,
    resolveNozzleIndex,
    multiHeadExportOptions,
    generateMultiHeadMeshes,
    createMultiHeadTargetHeightCache,
    multiHeadColorTopLayers,
    exportObjectTo3MFBlob,
    useSwapPlan,
    i18n,
    quantizeHeightMap,
} = await withViteTestServer(async (server) => ({
    ...((await server.ssrLoadModule(
        '/src/lib/autoPaint.ts'
    )) as typeof import('../src/lib/autoPaint.ts')),
    ...((await server.ssrLoadModule(
        '/src/lib/multiHeadAnalysis.ts'
    )) as typeof import('../src/lib/multiHeadAnalysis.ts')),
    ...((await server.ssrLoadModule(
        '/src/lib/multiHeadAnalysisColorFirst.ts'
    )) as typeof import('../src/lib/multiHeadAnalysisColorFirst.ts')),
    ...((await server.ssrLoadModule(
        '/src/lib/multiHeadSchedule.ts'
    )) as typeof import('../src/lib/multiHeadSchedule.ts')),
    ...((await server.ssrLoadModule(
        '/src/lib/multiHeadBuild.ts'
    )) as typeof import('../src/lib/multiHeadBuild.ts')),
    ...((await server.ssrLoadModule(
        '/src/lib/multiHeadGeometry.ts'
    )) as typeof import('../src/lib/multiHeadGeometry.ts')),
    ...((await server.ssrLoadModule(
        '/src/lib/multiHeadColorHeights.ts'
    )) as typeof import('../src/lib/multiHeadColorHeights.ts')),
    ...((await server.ssrLoadModule(
        '/src/lib/export3mf.ts'
    )) as typeof import('../src/lib/export3mf.ts')),
    ...((await server.ssrLoadModule(
        '/src/hooks/useSwapPlan.ts'
    )) as typeof import('../src/hooks/useSwapPlan.ts')),
    ...((await server.ssrLoadModule('/src/lib/i18n.ts')) as typeof import('../src/lib/i18n.ts')),
    ...((await server.ssrLoadModule(
        '/src/lib/heightDithering.ts'
    )) as typeof import('../src/lib/heightDithering.ts')),
}));

/** Three one-layer runs: reconciliation replaces the red run with white. */
function unusedFilamentFixture(topLayer = 2, sequence = [0, 1, 2]) {
    const filaments = [
        { id: 'base', color: '#101010', td: 0.4 },
        { id: 'unused-red', color: '#b81c1c', td: 0.8 },
        { id: 'white', color: '#e8e8e8', td: 0.8 },
    ];
    const ideal = [0, 2, 2].map((fi, i) => ({
        filamentIdx: fi,
        filamentRgb: hexToRgb(filaments[fi].color),
        td: filaments[fi].td,
        startZ: i * 0.25,
        thickness: 0.25,
    }));
    const swatches = [{ hex: rgbToHex(buildColorStack(ideal)[topLayer]), count: 1 }];
    const seed = generateAutoLayers(filaments, swatches, 0.25, 0.25);
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
        totalHeight: sequence.length * 0.25,
        finalStack: {
            ...seed.finalStack,
            totalHeight: sequence.length * 0.25,
            layers: zones.map((zone, i) => ({
                ...seed.finalStack.layers[0],
                ...zone,
                zoneIndex: i,
                thickness: 0.25,
            })),
            targetMappings: seed.finalStack.targetMappings.map((mapping) => ({
                ...mapping,
                projectedHeight: (topLayer + 1) * 0.25,
            })),
        },
    };
    const original = expandZonesToPrinterLayers(result, filaments, 0.25, 0.25);
    const colors = buildColorStack(original);
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
    const rgb = colors[topLayer];
    result.finalStack.targetMappings[0].predictedColor = {
        ...result.finalStack.targetMappings[0].predictedColor,
        hex: rgbToHex(rgb),
        rgb: [rgb.r, rgb.g, rgb.b],
    };
    return { filaments, swatches, result };
}

function fixtureState({
    filaments,
    result,
}: ReturnType<typeof unusedFilamentFixture>): ThreeDControlsStateShape {
    return {
        layerHeight: 0.25,
        slicerFirstLayerHeight: 0.25,
        colorOrder: [],
        colorSliceHeights: [],
        filteredSwatches: [],
        pixelSize: 0.4,
        paintMode: 'autopaint',
        filaments,
        autoPaintResult: result,
        multiHeadMode: true,
        multiHeadCount: 2,
    };
}

test('reconciled windows do not schedule a filament that no color prints', () => {
    const { filaments, swatches, result } = unusedFilamentFixture();
    const analysis = runMultiHeadLayerAnalysisColorFirst(
        filaments,
        result,
        swatches,
        0.25,
        0.25,
        2
    );
    assert.deepEqual(
        analysis.windows.map((w) => [w.windowStart, w.windowEnd]),
        [[1, 2]]
    );
    assert.deepEqual(analysis.colorLayerFilaments.get(swatches[0].hex), [0, 2, 2]);
    const schedule = buildMultiHeadSchedule({
        ...analysis,
        multiHeadWindows: analysis.windows,
        filaments,
    })!;
    // The old uniqueIndices-based plan made one red reload at physical layer 2.
    const legacy = buildMultiHeadSchedule({
        multiHeadWindows: analysis.windows,
        filaments,
        windowRunFilaments: [['unused-red', 'white']],
        nozzleAssignments: [[0, 1]],
        nonWindowedRanges: [{ rangeStart: 0, rangeEnd: 0, nozzleFilaments: ['base', ''] }],
    })!;
    assert.equal(
        legacy.reduce((sum, event) => sum + event.swapCount, 0),
        1
    );
    assert.equal(legacy[1].startLayer, 2);
    assert.deepEqual(analysis.windowRunFilaments, [['white']]);
    assert.deepEqual(analysis.windows[0].filamentIds, ['unused-red', 'white']);
    assert.deepEqual(analysis.colorAssignments[0].get(swatches[0].hex), [1, 1]);
    assert.deepEqual(analysis.nozzleAssignments, [[-1, 0]], 'nozzle slots index the pruned list');
    assert.ok(
        schedule.every((event) => event.nozzles.every((head) => head.filamentId !== 'unused-red'))
    );
    assert.equal(
        schedule.reduce((sum, event) => sum + event.swapCount, 0),
        0
    );
});

test('colors below a phase and unprinted path suffixes do not require filament loads', () => {
    const { filaments, swatches, result } = unusedFilamentFixture(1, [0, 1, 2, 1]);
    swatches.push({ hex: '#101010', count: 1 });
    result.finalStack.targetMappings = [
        ...result.finalStack.targetMappings,
        {
            ...result.finalStack.targetMappings[0],
            targetColor: {
                ...result.finalStack.targetMappings[0].targetColor,
                hex: '#101010',
                rgb: [16, 16, 16],
            },
            projectedHeight: 0.25,
        },
    ];
    const analysis = runMultiHeadLayerAnalysisColorFirst(
        filaments,
        result,
        swatches,
        0.25,
        0.25,
        2
    );
    const path = analysis.colorLayerFilaments.get(swatches[0].hex)!;
    assert.deepEqual(
        analysis.windows.map((w) => [w.windowStart, w.windowEnd]),
        [[1, 2]]
    );
    assert.deepEqual(
        path,
        [0, 2, 1, 1],
        'retain complete paths, including their unused red suffix'
    );
    assert.deepEqual(analysis.windowRunFilaments, [['white']]);
    assert.equal(analysis.colorAssignments[0].has('#101010'), false);
    assert.deepEqual(
        analysis.nonWindowedRanges.map((r) => [r.rangeStart, r.rangeEnd]),
        [
            [0, 0],
            [3, 3],
        ]
    );
    const schedule = buildMultiHeadSchedule({
        ...analysis,
        multiHeadWindows: analysis.windows,
        filaments,
    })!;
    assert.equal(
        schedule.reduce((sum, event) => sum + event.swapCount, 0),
        0
    );
    assert.ok(schedule.every((e) => e.nozzles.every((head) => head.filamentId !== 'unused-red')));
});

test('a filament used only by a zero-weight visible color remains required', () => {
    const { filaments, swatches, result } = unusedFilamentFixture();
    const original = expandZonesToPrinterLayers(result, filaments, 0.25, 0.25);
    const rgb = buildColorStack(original)[1];
    const hex = rgbToHex(rgb);
    swatches.push({ hex, count: 0 });
    result.finalStack.targetMappings = [
        ...result.finalStack.targetMappings,
        {
            ...result.finalStack.targetMappings[0],
            targetColor: {
                ...result.finalStack.targetMappings[0].targetColor,
                hex,
                rgb: [rgb.r, rgb.g, rgb.b],
            },
            projectedHeight: 0.5,
            usageWeight: 0,
        },
    ];
    for (const mode of ['luminance', 'color'] as const) {
        const analysis = runMultiHeadLayerAnalysisColorFirst(
            filaments,
            result,
            swatches,
            0.25,
            0.25,
            2,
            'balanced',
            mode
        );
        assert.equal(analysis.colorLayerFilaments.get(hex)![1], 1);
        assert.deepEqual(analysis.windowRunFilaments, [['unused-red', 'white']]);
    }
});

test('routing validates active layers without requiring heads for complete unprinted suffixes', () => {
    const fixture = unusedFilamentFixture(1, [0, 1, 2, 1]);
    const { filaments, swatches, result } = fixture;
    const analysis = runMultiHeadLayerAnalysisColorFirst(
        filaments,
        result,
        swatches,
        0.25,
        0.25,
        2
    );
    const built = multiHeadBuildSnapshot(fixtureState(fixture), analysis);
    const plan = getMultiHeadRoutingPlan(built);
    assert.ok(plan, 'suffix pruning must not cause a valid build to fall back');
    const path = plan.colorLayerFilaments.get(swatches[0].hex)!;
    assert.equal(path.length, 4);
    assert.equal(resolveNozzleIndex(plan, path[0], 0), 1);
    assert.equal(resolveNozzleIndex(plan, path[1], 1), 2);
    assert.equal(
        resolveNozzleIndex(plan, path[2], 2),
        undefined,
        'unprinted red has no assigned head'
    );
    for (const invalidPath of [
        [0, 1, 1, 1],
        [0, 2, -1, 1],
        [0, 2, 1],
    ]) {
        assert.equal(
            getMultiHeadRoutingPlan({
                ...built,
                colorLayerFilaments: new Map([[swatches[0].hex, invalidPath]]),
            }),
            undefined,
            'reject an unloaded active filament, invalid suffix index, or incomplete path'
        );
    }
});

test('height dithering retains a required upper neighbor without moving the search home layer', () => {
    const fixture = unusedFilamentFixture(1);
    const { filaments, swatches, result } = fixture;
    // A local fractional target above the mapped surface can print layer 2.
    // Search still optimizes the original layer 1; the red suffix now matters.
    result.finalStack.palette.forEach((entry, i) => {
        entry.predictedLab = [i * 30, 0, 0];
        entry.exactAnchorTargetLab = undefined;
        entry.predictionConfidence = undefined;
    });
    result.finalStack.targetMappings[0].paletteIndex = 1;
    result.finalStack.targetMappings[0].targetLab = [40, 0, 0];
    const plain = runMultiHeadLayerAnalysisColorFirst(filaments, result, swatches, 0.25, 0.25, 2);
    const dithered = runMultiHeadLayerAnalysisColorFirst(
        filaments,
        result,
        swatches,
        0.25,
        0.25,
        2,
        'balanced',
        'luminance',
        true
    );
    assert.deepEqual(plain.colorLayerFilaments, dithered.colorLayerFilaments);
    assert.deepEqual(plain.colorAssignments, dithered.colorAssignments);
    assert.deepEqual(plain.windowRunFilaments, [['white']]);
    assert.deepEqual(dithered.windowRunFilaments, [['unused-red', 'white']]);
    const tops = [0.25, 0.5, 0.75];
    assert.equal(
        multiHeadColorTopLayers(result.finalStack, [swatches[0].hex], tops).get(swatches[0].hex),
        1
    );
    assert.equal(
        multiHeadColorTopLayers(result.finalStack, [swatches[0].hex], tops, 0.25).get(
            swatches[0].hex
        ),
        2
    );
    const state = { ...fixtureState(fixture), heightDithering: true };
    assert.equal(
        multiHeadBuildSnapshot(state, plain).multiHeadMode,
        false,
        'detect missing dither-layer routing'
    );
    assert.equal(multiHeadBuildSnapshot(state, dithered).multiHeadMode, true);
    assert.equal(
        multiHeadBuildSnapshot({ ...state, preserveSeparation: true }, plain).multiHeadMode,
        true
    );
});

test('routing bounds cover shared dither blocks, including colors separated by transparency', () => {
    const { result } = unusedFilamentFixture(1);
    result.finalStack.palette.forEach((entry, i) => {
        entry.predictedLab = [i * 30, 0, 0];
        entry.exactAnchorTargetLab = undefined;
        entry.predictionConfidence = undefined;
    });
    const width = 32,
        height = 16;
    for (const separated of [false, true]) {
        const mappings = [
            {
                hex: '#777777',
                rgb: [119, 119, 119] as [number, number, number],
                home: separated ? 0 : 1,
                targetL: separated ? 6 : 27,
            },
            {
                hex: '#888888',
                rgb: [136, 136, 136] as [number, number, number],
                home: separated ? 2 : 1,
                targetL: separated ? 54 : 42,
            },
            { hex: '#101010', rgb: [16, 16, 16] as [number, number, number], home: 0, targetL: 0 },
        ];
        result.finalStack.targetMappings = mappings.map(({ hex, rgb, home, targetL }) => ({
            ...result.finalStack.targetMappings[0],
            targetColor: { ...result.finalStack.targetMappings[0].targetColor, hex, rgb },
            projectedHeight: (home + 1) * 0.25,
            paletteIndex: home,
            targetLab: [targetL, 0, 0],
        }));
        const colors = mappings.map((mapping) => mapping.hex);
        const targets = createMultiHeadTargetHeightCache(result.finalStack, colors, 0.25, 0.75, {
            layerHeight: 0.25,
        });
        const targetHeights = mappings.map(
            (mapping) => targets.get(parseInt(mapping.hex.slice(1), 16))!
        );
        const labels = Array.from({ length: width * height }, (_, i) => {
            const x = (i % width) % 4,
                y = Math.floor(i / width) % 4;
            if (x === 0 && y === 0) return 0;
            return !separated || (x >= 2 && y >= 2) ? 1 : -1;
        });
        const pixelHeights = Float32Array.from(labels, (label) =>
            label < 0 ? 0 : targetHeights[label]
        );
        quantizeHeightMap(pixelHeights, width, height, {
            layerHeight: 0.25,
            slicerFirstLayerHeight: 0.25,
            minModelH: 0.25,
            maxModelH: 0.75,
            heightDithering: true,
            ditherLineWidth: 0.4,
            pixelSize: 0.1,
        });
        assert.ok(
            [...pixelHeights].some((h, i) => labels[i] === 0 && h === 0.75),
            'shared blocks lift the lower color above its own fractional upper surface'
        );
        const tops = multiHeadColorTopLayers(result.finalStack, colors, [0.25, 0.5, 0.75], 0.25);
        for (let i = 0; i < labels.length; i++) {
            if (labels[i] < 0) continue;
            assert.ok(tops.get(colors[labels[i]])! >= Math.round(pixelHeights[i] / 0.25) - 1);
        }
        assert.equal(tops.get('#101010'), 0, 'exact colors retain their original physical surface');
        const data = new Uint8ClampedArray(width * height * 4);
        const observed = new Map(colors.map((hex) => [hex, -1]));
        for (let i = 0; i < labels.length; i++) {
            if (labels[i] < 0) continue;
            const hex = colors[labels[i]],
                key = parseInt(hex.slice(1), 16);
            data.set([key >> 16, (key >> 8) & 255, key & 255, 255], i * 4);
            observed.set(hex, Math.max(observed.get(hex)!, Math.round(pixelHeights[i] / 0.25) - 1));
        }
        assert.deepEqual(
            multiHeadColorTopLayers(result.finalStack, colors, [0.25, 0.5, 0.75], 0.25, {
                pixels: { width, height, data },
                pixelSize: 0.1,
                ditherLineWidth: 0.4,
            }),
            observed,
            'pixel context resolves exact tops through mixed and disconnected blocks'
        );
    }
});

test('dither scheduling prunes suffixes using the actual cropped pixel blocks', async () => {
    const fixture = unusedFilamentFixture(1);
    const { filaments, swatches, result } = fixture;
    swatches[0].count = 0; // Regional priorities must not discard this visible region.
    const ideal = [0, 2, 2].map((fi, i) => ({
        filamentIdx: fi,
        filamentRgb: hexToRgb(filaments[fi].color),
        td: filaments[fi].td,
        startZ: i * 0.25,
        thickness: 0.25,
    }));
    const rgb = buildColorStack(ideal)[2];
    const upperHex = rgbToHex(rgb);
    swatches.push({ hex: upperHex, count: 1 });
    result.finalStack.targetMappings = [
        result.finalStack.targetMappings[0],
        {
            ...result.finalStack.targetMappings[0],
            targetColor: {
                ...result.finalStack.targetMappings[0].targetColor,
                hex: upperHex,
                rgb: [Math.round(rgb.r), Math.round(rgb.g), Math.round(rgb.b)],
            },
            projectedHeight: 0.75,
        },
    ];
    result.finalStack.palette.forEach((entry, i) => {
        entry.predictedLab = [i * 30, 0, 0];
        entry.exactAnchorTargetLab = undefined;
        entry.predictionConfidence = undefined;
    });
    for (const [i, targetL] of [27, 42].entries()) {
        result.finalStack.targetMappings[i].paletteIndex = i + 1;
        result.finalStack.targetMappings[i].targetLab = [targetL, 0, 0];
    }
    result.finalStack.targetMappings[0].usageWeight = 0;
    const width = 20,
        height = 12;
    const data = new Uint8ClampedArray(width * height * 4);
    // Transparent padding must not shift the geometry's crop-local dither grid.
    for (let y = 2; y < 10; y++)
        for (let x = 2; x < 18; x++) {
            const key = parseInt(swatches[x < 10 ? 0 : 1].hex.slice(1), 16);
            data.set([key >> 16, (key >> 8) & 255, key & 255, 255], (y * width + x) * 4);
        }
    const context = { pixels: { width, height, data }, pixelSize: 0.1, ditherLineWidth: 0.4 };
    const conservative = runMultiHeadLayerAnalysisColorFirst(
        filaments,
        result,
        swatches,
        0.25,
        0.25,
        2,
        'balanced',
        'color',
        true
    );
    assert.deepEqual(conservative.colorLayerFilaments.get(swatches[0].hex), [0, 2, 1]);
    assert.deepEqual(conservative.colorLayerFilaments.get(swatches[1].hex), [0, 2, 2]);
    assert.deepEqual(conservative.windowRunFilaments, [['unused-red', 'white']]);
    const exact = runMultiHeadLayerAnalysisColorFirst(
        filaments,
        result,
        swatches,
        0.25,
        0.25,
        2,
        'balanced',
        'color',
        true,
        context
    );
    assert.deepEqual(exact.colorLayerFilaments, conservative.colorLayerFilaments);
    assert.deepEqual(
        exact.windowRunFilaments,
        [['white']],
        'no printed region reaches the red suffix'
    );
    assert.deepEqual(
        exact.colorPrintTopLayers,
        new Map([
            [swatches[0].hex, 1],
            [upperHex, 2],
        ])
    );
    const state = {
        ...fixtureState(fixture),
        heightDithering: true,
        pixelSize: context.pixelSize,
        ditherLineWidth: context.ditherLineWidth,
        printableFeaturePixels: { ...context.pixels, fingerprint: 'dither-blocks' },
    };
    const built = multiHeadBuildSnapshot(state, exact);
    const plan = getMultiHeadRoutingPlan(built);
    assert.ok(plan, 'actual tops must prevent conservative revalidation from rejecting this build');
    assert.equal(
        getMultiHeadRoutingPlan({ ...built, colorPrintTopLayers: new Map([[upperHex, 3]]) }),
        undefined
    );
    assert.equal(
        getMultiHeadRoutingPlan({
            ...built,
            colorLayerFilaments: new Map([
                [swatches[0].hex, [0, 2, 1]],
                [upperHex, [0, 2, 1]],
            ]),
        }),
        undefined,
        'every active upper layer still needs a loaded head'
    );
    const schedule = buildMultiHeadSchedule(plan)!;
    assert.equal(
        schedule.reduce((sum, event) => sum + event.swapCount, 0),
        0
    );
    const previous = buildMultiHeadSchedule({
        ...conservative,
        multiHeadWindows: conservative.windows,
        filaments,
    })!;
    assert.equal(
        previous.reduce((sum, event) => sum + event.swapCount, 0),
        1
    );
    const targets = createMultiHeadTargetHeightCache(
        result.finalStack,
        swatches.map((s) => s.hex),
        0.25,
        0.75,
        { layerHeight: 0.25 }
    );
    const pixelHeights = Float32Array.from(
        { length: 16 * 8 },
        (_, i) => targets.get(parseInt(swatches[i % 16 < 8 ? 0 : 1].hex.slice(1), 16))!
    );
    quantizeHeightMap(pixelHeights, 16, 8, {
        layerHeight: 0.25,
        slicerFirstLayerHeight: 0.25,
        minModelH: 0.25,
        maxModelH: 0.75,
        heightDithering: true,
        ditherLineWidth: 0.4,
        pixelSize: 0.1,
    });
    const parts: MultiHeadMeshPart[] = [];
    for await (const part of generateMultiHeadMeshes({
        plan,
        data,
        imageWidth: width,
        minX: 2,
        minY: 2,
        width: 16,
        height: 8,
        pixelHeights,
        pixelSize: 0.1,
        heightScale: 1,
        strength: 'none',
        yieldIntervalMs: Infinity,
    }))
        parts.push(part);
    assert.ok(parts.some((part) => part.layerIndex === 2));
    for (const part of parts) {
        assert.notEqual(part.mesh.userData.kromacutFilamentHex, filaments[1].color);
        assert.equal(
            part.mesh.userData.kromacutFilamentHex,
            schedule[0].nozzles[part.mesh.userData.nozzleIndex - 1].filamentHex
        );
        assert.equal(
            inspectMeshIntegrity(part.mesh.geometry.userData.kromacutExportGeometry).isValid,
            true
        );
    }
    const root = new THREE.Group();
    root.add(...parts.map((part) => part.mesh));
    const zip = await JSZip.loadAsync(
        await (
            await exportObjectTo3MFBlob(root, {
                ...multiHeadExportOptions(plan),
                layerHeight: 0.25,
                firstLayerHeight: 0.25,
            })
        ).arrayBuffer()
    );
    const model = await zip.file('3D/3dmodel.model')!.async('string');
    const pauses = (await zip.file('Metadata/custom_gcode_per_layer.xml')?.async('string')) ?? '';
    assert.ok(!model.includes('B81C1C'));
    assert.ok(!pauses.includes('M600'));
    parts.forEach((part) => part.mesh.geometry.dispose());
});

test('pruned real analysis keeps mesh heads, copied instructions, and physical 3MF exports in sync', async () => {
    const fixture = unusedFilamentFixture();
    const { filaments, swatches, result } = fixture;
    const analysis = runMultiHeadLayerAnalysisColorFirst(
        filaments,
        result,
        swatches,
        0.25,
        0.25,
        2
    );
    const built = multiHeadBuildSnapshot(fixtureState(fixture), analysis);
    const plan = getMultiHeadRoutingPlan(built)!;
    assert.ok(plan);
    const schedule = buildMultiHeadSchedule(plan)!;
    const targets = createMultiHeadTargetHeightCache(
        result.finalStack,
        plan.colorLayerFilaments.keys(),
        0.25,
        0.75
    );
    const color = parseInt(swatches[0].hex.slice(1), 16);
    const parts: MultiHeadMeshPart[] = [];
    for await (const part of generateMultiHeadMeshes({
        plan,
        data: new Uint8ClampedArray([color >> 16, (color >> 8) & 255, color & 255, 255]),
        imageWidth: 1,
        minX: 0,
        minY: 0,
        width: 1,
        height: 1,
        pixelHeights: new Float32Array([targets.get(color)!]),
        pixelSize: 0.4,
        heightScale: 1,
        strength: 'none',
        yieldIntervalMs: Infinity,
    }))
        parts.push(part);
    assert.deepEqual(
        parts.map((part) => part.layerIndex),
        [0, 1, 2]
    );
    for (const part of parts) {
        const head = part.mesh.userData.nozzleIndex;
        const event = schedule.findLast((event) => event.startLayer <= part.layerIndex + 1)!;
        assert.equal(part.mesh.userData.kromacutFilamentHex, event.nozzles[head - 1].filamentHex);
        assert.equal(
            inspectMeshIntegrity(part.mesh.geometry.userData.kromacutExportGeometry).isValid,
            true
        );
    }
    const root = new THREE.Group();
    root.add(...parts.map((part) => part.mesh));
    const zip = await JSZip.loadAsync(
        await (
            await exportObjectTo3MFBlob(root, {
                ...multiHeadExportOptions(plan),
                layerHeight: 0.25,
                firstLayerHeight: 0.25,
            })
        ).arrayBuffer()
    );
    const model = await zip.file('3D/3dmodel.model')!.async('string');
    const settings = await zip.file('Metadata/model_settings.config')!.async('string');
    const pauses = (await zip.file('Metadata/custom_gcode_per_layer.xml')?.async('string')) ?? '';
    assert.equal([...model.matchAll(/<mesh>/g)].length, 3, 'preserve all three physical layers');
    assert.ok(model.includes('101010') && model.includes('E8E8E8'));
    assert.ok(!model.includes('B81C1C'), 'no unprinted red material');
    assert.deepEqual(
        [...settings.matchAll(/<part id="\d+"[\s\S]*?<metadata key="extruder" value="(\d+)"/g)].map(
            (match) => Number(match[1])
        ),
        parts.map((part) => part.mesh.userData.nozzleIndex)
    );
    assert.ok(!pauses.includes('M600'), 'removing the obsolete reload removes its pause');
    await i18n.changeLanguage('en');
    let instructions!: ReturnType<typeof useSwapPlan>;
    function Probe() {
        instructions = useSwapPlan({
            ...plan,
            colorOrder: built.patchedSliceData!.colorOrder,
            colorSliceHeights: built.patchedSliceData!.colorSliceHeights,
            filtered: built.patchedSliceData!.swatches,
            layerHeight: 0.25,
            slicerFirstLayerHeight: 0.25,
            paintMode: 'autopaint',
            autoPaintResult: result,
        });
        return null;
    }
    renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(Probe)));
    assert.deepEqual(instructions.multiHeadPlan, schedule);
    let copied = '';
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    try {
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: {
                clipboard: {
                    writeText: async (text: string) => {
                        copied = text;
                    },
                },
            },
        });
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { setTimeout: () => 1, clearTimeout: () => {} },
        });
        await instructions.copyToClipboard();
        assert.ok(copied.includes(i18n.t('printing:multiHead.schedule')));
        assert.ok(copied.includes('#101010') && copied.includes('#e8e8e8'));
        assert.ok(!copied.includes('#b81c1c'));
        assert.ok(
            !copied.includes(
                i18n.t('printing:multiHead.swapCheckpointText', { layer: 2, swaps: 1 })
            )
        );
    } finally {
        if (navigatorDescriptor)
            Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
        else Reflect.deleteProperty(globalThis, 'navigator');
        if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
        else Reflect.deleteProperty(globalThis, 'window');
        parts.forEach((part) => part.mesh.geometry.dispose());
    }
});

test('pruning phase requirements preserves useful preloads and never increases optimal total swaps', (t) => {
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'group', () => {});
    t.mock.method(console, 'groupEnd', () => {});
    const filaments = ['A', 'B', 'C'].map((id) => ({ id, color: '#000000', td: 1 }));
    const scheduleFor = (requirements: string[][]) =>
        buildMultiHeadSchedule({
            multiHeadWindows: requirements.map((_, i) => ({
                windowStart: i,
                windowEnd: i,
            })) as WindowResult[],
            windowRunFilaments: requirements,
            nozzleAssignments: optimizeNozzleAssignments(requirements, 2),
            filaments,
        })!;
    const swaps = (requirements: string[][]) =>
        scheduleFor(requirements).reduce((sum, event) => sum + event.swapCount, 0);
    // B is absent from the first two phases but useful to load before printing.
    const later = [['A'], ['A'], ['B', 'C']];
    const schedule = scheduleFor(later);
    assert.ok(schedule[0].nozzles.some((head) => head.filamentId === 'B'));
    assert.equal(swaps(later), swaps([['A', 'B'], ['A'], ['B', 'C']]));

    // Independent oracle: enumerate all two-head load states, including arbitrary
    // free preprint loads. No assumptions about victim choice or head labeling.
    const ids = ['', 'A', 'B', 'C'];
    const states = ids.flatMap((a) => ids.filter((b) => !a || a !== b).map((b) => [a, b]));
    const optimalSwaps = (requirements: string[][]) => {
        let costs = states.map(() => 0);
        for (const required of requirements) {
            costs = states.map((next) =>
                required.every((id) => next.includes(id))
                    ? Math.min(
                          ...states.map(
                              (prev, i) => costs[i] + next.filter((id, k) => id !== prev[k]).length
                          )
                      )
                    : Infinity
            );
        }
        return Math.min(...costs);
    };
    const events = [[], ['A'], ['B'], ['C'], ['A', 'B'], ['A', 'C'], ['B', 'C']];
    for (let code = 0; code < events.length ** 3; code++) {
        let digits = code;
        const required = Array.from({ length: 3 }, () => {
            const event = events[digits % events.length];
            digits = Math.floor(digits / events.length);
            return event;
        });
        const cost = swaps(required);
        assert.equal(cost, optimalSwaps(required), JSON.stringify(required));
        for (let phase = 0; phase < required.length; phase++) {
            for (const id of required[phase]) {
                const pruned = required.map((event, i) =>
                    i === phase ? event.filter((f) => f !== id) : event
                );
                assert.ok(
                    swaps(pruned) <= cost,
                    `pruning ${id} increased swaps: ${JSON.stringify(required)}`
                );
            }
        }
    }
});
