import assert from 'node:assert/strict';
import test from 'node:test';
import { loadViteModule } from './helpers/viteModule.ts';
import type { WindowResult, PrinterLayer } from '../src/lib/multiHeadAnalysis.ts';
import type { Filament } from '../src/types/index.ts';
import type { AppearanceEffectiveOpticsModelV1, AppearanceRankModelV1 } from '../src/types/appearance.ts';

// autoPaint + multiHeadAnalysis reach an extensionless-import graph, so load them
// through Vite (matching the rest of the suite) rather than node's strip-types loader.
const { generateAutoLayers, deltaE, hexToRgb, rgbToHex, mapTargetsToPrintablePalette, rgbToLab } =
    await loadViteModule<typeof import('../src/lib/autoPaint.ts')>('/src/lib/autoPaint.ts');
const {
    analyzeMultiHeadWindows,
    selectBestWindows,
    buildLUT,
    buildColorStack,
    runMultiHeadLayerAnalysis,
    expandZonesToPrinterLayers,
    buildPixelData,
    analyzeWindowLUT,
    findLayerIdxAtHeight,
} = await loadViteModule<typeof import('../src/lib/multiHeadAnalysis.ts')>(
    '/src/lib/multiHeadAnalysis.ts'
);
const { createPriorEffectiveOpticsModel, predictEffectiveAutoPaintColor } =
    await loadViteModule<typeof import('../src/lib/effectiveOptics.ts')>('/src/lib/effectiveOptics.ts');
const { createIdentityAppearanceRankModel, resolveAppearanceRankModel, appearanceLabToRgb } =
    await loadViteModule<typeof import('../src/lib/appearanceModel.ts')>('/src/lib/appearanceModel.ts');

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

const LAYER_HEIGHT = 0.12;
const FIRST_LAYER_HEIGHT = 0.20;

function filament(id: string, color: string, td: number, name?: string): Filament {
    return { id, color, td, name };
}

/** Build an AutoPaintResult for a set of filaments against some swatches. */
function buildResult(filaments: Filament[], swatches: Array<{ hex: string }>) {
    return generateAutoLayers(filaments, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
}

// A simple 2-colour image: mid-grey and near-white
const SWATCHES_GREY = [{ hex: '#808080' }, { hex: '#e0e0e0' }];

// Black and white filaments — high TD so the model is tall enough for windowed analysis
const BLACK = filament('black', '#000000', 5.0, 'Black');
const WHITE = filament('white', '#ffffff', 5.0, 'White');

test('printer layers match the final printable grid and filament boundaries', () => {
    for (const layerHeight of [0.12, 0.1]) {
        const filaments = [BLACK, WHITE];
        const result = generateAutoLayers(filaments, SWATCHES_GREY, layerHeight, FIRST_LAYER_HEIGHT);
        const layers = expandZonesToPrinterLayers(result, filaments, layerHeight, FIRST_LAYER_HEIGHT);
        const windows = analyzeMultiHeadWindows(
            filaments, result, SWATCHES_GREY, layerHeight, FIRST_LAYER_HEIGHT, 2
        );
        assert.equal(windows.length, layers.length - 2);
        assert.ok(Math.abs(windows.at(-1)!.windowTopZ - result.finalStack.totalHeight) < 1e-8);
        assert.deepEqual(
            layers.map((layer) => ({
                start: layer.startZ,
                thickness: layer.thickness,
                filamentId: filaments[layer.filamentIdx].id,
            })),
            result.finalStack.layers.map((layer) => ({
                start: layer.startHeight,
                thickness: layer.thickness,
                filamentId: layer.filamentId,
            }))
        );
    }
});

test('printer layers reject a grid that differs from the final stack', () => {
    const result = buildResult([BLACK, WHITE], SWATCHES_GREY);
    assert.throws(() => expandZonesToPrinterLayers(result, [BLACK, WHITE], 0.1, FIRST_LAYER_HEIGHT),
        /slice grid/);
});

test('swatch layers and baseline errors use final-stack surface mappings', () => {
    const result = buildResult([BLACK, WHITE], SWATCHES_GREY);
    const layers = expandZonesToPrinterLayers(result, [BLACK, WHITE], LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const colors = buildColorStack(layers);
    const swatches = [...SWATCHES_GREY].reverse();
    const pixels = buildPixelData(swatches, layers, colors, result.finalStack);
    for (let index = 0; index < swatches.length; index++) {
        const mapping = result.finalStack.targetMappings.find(
            (entry) => entry.targetColor.hex === swatches[index].hex
        )!;
        const expectedIndex = result.finalStack.layers.findIndex(
            (layer) => Math.abs(layer.endHeight - mapping.projectedHeight) < 1e-6
        );
        assert.equal(pixels[index].layerIdx, expectedIndex);
        const [r, g, b] = result.finalStack.layers[expectedIndex].predictedColor.rgb;
        assert.equal(pixels[index].actualErr, deltaE(pixels[index].targetRgb, { r, g, b }));
    }
    const windows = analyzeMultiHeadWindows(
        [BLACK, WHITE], result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    for (const window of windows) {
        assert.equal(window.affectedSwatches, pixels.filter((px) => px.layerIdx >= window.windowStart).length);
        for (let index = 0; index < pixels.length; index++) {
            assert.equal(window.pixelOptimalLUTIdx[index] === -1, pixels[index].layerIdx < window.windowStart);
        }
    }
});

test('unmapped swatches use the shared palette mapper and exact surface boundaries', () => {
    const result = buildResult([BLACK, WHITE], SWATCHES_GREY);
    const layers = expandZonesToPrinterLayers(result, [BLACK, WHITE], LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const swatches = [{ hex: '#4A4A4A' }, { hex: '#AbAbAb' }];
    const pixels = buildPixelData(swatches, layers, buildColorStack(layers), result.finalStack);
    const palette = result.finalStack.palette.map((entry) => ({
        height: entry.height,
        surfaceEligible: entry.surfaceEligible,
        predictionConfidence: entry.predictionConfidence,
        rgb: hexToRgb(entry.predictedColor.hex),
        lab: { L: entry.predictedLab[0], a: entry.predictedLab[1], b: entry.predictedLab[2] },
    }));
    const mappings = mapTargetsToPrintablePalette(palette,
        swatches.map((s) => ({ ...rgbToLab(hexToRgb(s.hex)), weight: 1 })));
    for (let index = 0; index < pixels.length; index++) {
        const layerIdx = findLayerIdxAtHeight(layers, mappings[index].projectedHeight);
        assert.equal(pixels[index].layerIdx, layerIdx);
        const surface = result.finalStack.layers[layerIdx].endHeight;
        assert.equal(findLayerIdxAtHeight(layers, surface), layerIdx);
        assert.equal(findLayerIdxAtHeight(layers, surface + 1e-10), layerIdx);
    }
});

function appearanceFixture() {
    const filaments = [
        filament('black', '#000000', 0.05),
        filament('grey', '#808080', 0.5),
        filament('white', '#ffffff', 0.5),
    ];
    const model: AppearanceRankModelV1 = {
        ...createIdentityAppearanceRankModel(),
        applied: true,
        gateReason: 'applied',
        deltaL: 6,
    };
    const result = generateAutoLayers(filaments, SWATCHES_GREY, 0.08, 0.16,
        undefined, false, false, undefined, model);
    const layers = expandZonesToPrinterLayers(result, filaments, 0.08, 0.16);
    return { filaments, model, result, layers };
}

test('baseline errors use appearance-corrected snapshot colors for mapped and new swatches', () => {
    const { result, layers } = appearanceFixture();
    const swatches = [...SWATCHES_GREY].reverse().concat({ hex: '#b0b0b0' });
    const pixels = buildPixelData(swatches, layers, buildColorStack(layers), result.finalStack);
    for (const px of pixels) {
        const [r, g, b] = result.finalStack.layers[px.layerIdx].predictedColor.rgb;
        assert.equal(px.actualErr, deltaE(px.targetRgb, { r, g, b }));
    }
});

test('window assignments minimize error under the full appearance model', () => {
    const { filaments, model, result, layers } = appearanceFixture();
    const pixels = buildPixelData(SWATCHES_GREY, layers, buildColorStack(layers), result.finalStack);
    const optics = createPriorEffectiveOpticsModel(filaments);
    const windows = analyzeMultiHeadWindows(filaments, result, SWATCHES_GREY, 0.08, 0.16, 2);
    assert.ok(windows.some((window) => window.windowStart === 5 && window.windowEnd === 6));
    for (const window of windows) {
        let improvement = 0;
        for (let index = 0; index < pixels.length; index++) {
            const px = pixels[index];
            if (px.layerIdx < window.windowStart) continue;
            const errors = window.lut.map((entry) => {
                const recipe = result.finalStack.layers.slice(0, px.layerIdx + 1).map((layer) => {
                    const filamentId = layer.index >= window.windowStart && layer.index <= window.windowEnd
                        ? window.filamentIds[entry[layer.index - window.windowStart]] : layer.filamentId;
                    return {
                        filamentId,
                        filamentColor: filaments.find((f) => f.id === filamentId)!.color,
                        thickness: layer.thickness,
                    };
                });
                const [r, g, b] = predictEffectiveAutoPaintColor(optics, recipe)!;
                const prediction = resolveAppearanceRankModel(rgbToLab({ r, g, b }), model, recipe);
                const corrected = appearanceLabToRgb(prediction.lab);
                return deltaE(px.targetRgb, { r: corrected[0], g: corrected[1], b: corrected[2] });
            });
            const bestError = Math.min(...errors);
            const chosenError = errors[window.pixelOptimalLUTIdx[index]];
            const [r, g, b] = result.finalStack.layers[px.layerIdx].predictedColor.rgb;
            const baselineError = deltaE(px.targetRgb, { r, g, b });
            assert.ok(chosenError <= baselineError + 1e-8,
                `window ${window.windowStart} worsens swatch ${index}: ${baselineError} -> ${chosenError}`);
            assert.ok(Math.abs(chosenError - bestError) < 1e-8);
            improvement += baselineError - bestError;
        }
        assert.ok(Math.abs(window.errorFactor - improvement) < 1e-8);
    }
});

test('candidate appearance resolution uses physical recipe prefixes even without a global fit', () => {
    const { filaments, model: optics, result, layers } = fittedFixture();
    const colors = buildColorStack(layers);
    const start = layers.findIndex((layer) => layer.filamentId === 'white') - 1;
    const surface = layers.length - 1;
    const windowFilaments = filaments.map((f, filamentIdx) => ({
        filamentIdx, filamentId: f.id, rgb: hexToRgb(f.color), td: f.td,
    }));
    const lut = buildLUT(2, filaments.length);
    const targetRgb = hexToRgb('#fa50a0');
    const targetLab = rgbToLab(targetRgb);
    const recipe = result.finalStack.layers.map((layer) => ({
        filamentId: layer.index >= start && layer.index < start + 2 ? 'white' : layer.filamentId,
        filamentColor: layer.index >= start && layer.index < start + 2 ? '#ffffff' : layer.filamentColor,
        thickness: layer.thickness,
    }));
    const model: AppearanceRankModelV1 = {
        ...createIdentityAppearanceRankModel(),
        effectiveOptics: optics,
        exactAnchors: [{
            id: 'test-anchor', proofId: 'test-proof', source: 'palette-proof', sourceStackKey: 'test-stack',
            targetLab: [targetLab.L, targetLab.a, targetLab.b], suffixLayers: recipe,
            maxSubstrateTransmission: 0.05,
        }],
    };
    const analysis = analyzeWindowLUT(start, 2, layers, colors[start - 1], windowFilaments, lut,
        [{ targetRgb, layerIdx: surface, actualErr: deltaE(targetRgb, colors[surface]) }],
        optics, model);
    assert.deepEqual(lut[analysis.pixelOptimalLUTIdx[0]], [2, 2]);
});

test('window assignments preserve every required opaque foundation layer', () => {
    const filaments = [filament('black', '#000000', 0.5), filament('white', '#ffffff', 0.5)];
    const result = generateAutoLayers(filaments, SWATCHES_GREY, 0.08, 0.16);
    const minimum = result.finalStack.zones[0].minimumThickness!;
    assert.equal(minimum, 0.72);
    const windows = analyzeMultiHeadWindows(filaments, result, SWATCHES_GREY, 0.08, 0.16, 2);
    assert.ok(windows.some((window) => window.windowStart === 7 && window.windowEnd === 8));
    for (const window of windows) {
        for (const bestIndex of window.pixelOptimalLUTIdx) {
            if (bestIndex < 0) continue;
            const entry = window.lut[bestIndex];
            const recipe = result.finalStack.layers.map((layer) => ({
                ...layer,
                filamentId: layer.index >= window.windowStart && layer.index <= window.windowEnd
                    ? window.filamentIds[entry[layer.index - window.windowStart]] : layer.filamentId,
            }));
            const firstTransition = recipe.find((layer) => layer.filamentId !== recipe[0].filamentId);
            assert.ok(!firstTransition || firstTransition.startHeight + 1e-8 >= minimum,
                `window ${window.windowStart} shortens the foundation to ${firstTransition?.startHeight}`);
            for (const layer of recipe) {
                if (layer.startHeight + 1e-8 < minimum) {
                    assert.equal(layer.filamentId, result.finalStack.layers[layer.index].filamentId);
                }
            }
        }
    }
});

function fittedFixture() {
    const filaments = [
        filament('black', '#000000', 0.1),
        filament('grey', '#888844', 0.3),
        filament('white', '#ffffff', 0.5),
    ];
    const prior = createPriorEffectiveOpticsModel(filaments);
    const model: AppearanceEffectiveOpticsModelV1 = {
        ...prior,
        applied: true,
        gateReason: 'applied',
        filaments: prior.filaments.map((entry) => entry.filamentId === 'white' ? {
            ...entry,
            effectiveOpaqueColor: [235, 240, 245],
            effectiveHdChannels: [1, 1.1, 1.2],
            transmissionExponent: 1.3,
        } : entry.filamentId === 'black' ? { ...entry, effectiveOpaqueColor: [8, 5, 3] } : entry),
        substrateInteractions: filaments.flatMap((foreground, index) => filaments
            .filter((substrate) => substrate.id !== foreground.id)
            .map((substrate) => ({
                foregroundFilamentId: foreground.id,
                substrateFilamentId: substrate.id,
                hdMultiplier: substrate.id === 'black' ? 1 : 1.4 + index * 0.2,
                sampleCount: 20,
                maxObservedThickness: 0.25,
            }))),
    };
    const swatches = [{ hex: '#000000' }, { hex: '#888844' }, { hex: '#ffffff' }];
    const identity = buildResult(filaments, swatches).finalStack.appearanceModel;
    const result = generateAutoLayers(filaments, swatches, 0.125, 0.25,
        undefined, false, false, undefined, { ...identity, effectiveOptics: model });
    const layers = expandZonesToPrinterLayers(result, filaments, 0.125, 0.25);
    return { filaments, model, result, layers, swatches };
}

test('color stack preserves fitted optics across whole runs and beyond fitted support', () => {
    const { result, layers } = fittedFixture();
    const colors = buildColorStack(layers);
    for (let index = 0; index < layers.length; index++) {
        const expected = result.finalStack.layers[index].basePredictedColor.rgb;
        assert.ok(Math.abs(colors[index].r - expected[0]) <= 0.5, `red at layer ${index}`);
        assert.ok(Math.abs(colors[index].g - expected[1]) <= 0.5, `green at layer ${index}`);
        assert.ok(Math.abs(colors[index].b - expected[2]) <= 0.5, `blue at layer ${index}`);
    }
});

test('LUT candidates resolve changed substrates, continued runs, and the suffix with fitted optics', () => {
    const { filaments, model, layers } = fittedFixture();
    const colors = buildColorStack(layers);
    const whiteStart = layers.findIndex((layer) => filaments[layer.filamentIdx].id === 'white');
    const lut = buildLUT(2, filaments.length);
    const windowFilaments = filaments.map((filament, filamentIdx) => ({
        filamentIdx,
        filamentId: filament.id,
        rgb: hexToRgb(filament.color),
        td: filament.td,
    }));
    for (const start of [1, whiteStart - 1, whiteStart + 1]) {
        for (const surface of [start, start + 1, Math.min(start + 4, layers.length - 1)]) {
            const predictions = lut.map((entry) => {
                const recipe = layers.slice(0, surface + 1).map((layer, index) => ({
                    filamentId: filaments[index >= start && index < start + 2
                        ? entry[index - start] : layer.filamentIdx].id,
                    thickness: layer.thickness,
                }));
                const [r, g, b] = predictEffectiveAutoPaintColor(model, recipe)!;
                return { r, g, b };
            });
            const pixels = predictions.map((targetRgb) => ({
                targetRgb, layerIdx: surface, actualErr: deltaE(targetRgb, colors[surface]),
            }));
            const analysis = analyzeWindowLUT(start, 2, layers, colors[start - 1], windowFilaments, lut, pixels, model);
            let expectedImprovement = 0;
            for (let index = 0; index < pixels.length; index++) {
                const errors = predictions.map((color) => deltaE(pixels[index].targetRgb, color));
                const bestError = Math.min(...errors);
                assert.ok(Math.abs(errors[analysis.pixelOptimalLUTIdx[index]] - bestError) < 1e-8,
                    `window ${start}, target ${index}`);
                expectedImprovement += pixels[index].actualErr - bestError;
            }
            assert.ok(Math.abs(analysis.errorFactor - expectedImprovement) < 1e-8);
        }
    }
});

test('window analysis uses the result optical model for every candidate', () => {
    const { filaments, model, result, layers, swatches } = fittedFixture();
    const pixels = buildPixelData(swatches, layers, buildColorStack(layers), result.finalStack);
    const windows = analyzeMultiHeadWindows(filaments, result, swatches, 0.125, 0.25, 2);
    for (const window of windows) {
        let improvement = 0;
        for (let index = 0; index < pixels.length; index++) {
            const px = pixels[index];
            if (px.layerIdx < window.windowStart) continue;
            const errors = window.lut.map((entry) => {
                const recipe = layers.slice(0, px.layerIdx + 1).map((layer, layerIdx) => ({
                    filamentId: layerIdx >= window.windowStart && layerIdx <= window.windowEnd
                        ? window.filamentIds[entry[layerIdx - window.windowStart]]
                        : filaments[layer.filamentIdx].id,
                    thickness: layer.thickness,
                }));
                const [r, g, b] = predictEffectiveAutoPaintColor(model, recipe)!;
                return deltaE(px.targetRgb, hexToRgb(rgbToHex({ r, g, b })));
            });
            const minimum = Math.min(...errors);
            assert.ok(Math.abs(errors[window.pixelOptimalLUTIdx[index]] - minimum) < 1e-8);
            improvement += px.actualErr - minimum;
        }
        assert.ok(Math.abs(window.errorFactor - improvement) < 1e-8);
    }
});

// Two identical filaments (same colour, same TD)
const RED_A = filament('red-a', '#cc2200', 5.0, 'RedA');
const RED_B = filament('red-b', '#cc2200', 5.0, 'RedB');

// ---------------------------------------------------------------------------
// buildLUT
// ---------------------------------------------------------------------------

test('buildLUT — generates filamentCount^windowSize entries', () => {
    assert.equal(buildLUT(2, 3).length, 9);    // 3^2
    assert.equal(buildLUT(3, 2).length, 8);    // 2^3
    assert.equal(buildLUT(4, 4).length, 256);  // 4^4
});

test('buildLUT — each entry has windowSize elements in [0, filamentCount)', () => {
    const lut = buildLUT(3, 4);
    for (const entry of lut) {
        assert.equal(entry.length, 3);
        for (const idx of entry) {
            assert.ok(idx >= 0 && idx < 4, `index ${idx} out of range [0, 4)`);
        }
    }
});

test('buildLUT — all combinations are unique', () => {
    const lut = buildLUT(2, 3); // 3^2 = 9 entries
    const strs = new Set(lut.map((e) => e.join(',')));
    assert.equal(strs.size, lut.length, 'duplicate entries found');
});

test('buildLUT — single filament produces one all-zero entry', () => {
    const lut = buildLUT(4, 1);
    assert.equal(lut.length, 1);
    assert.deepEqual(lut[0], [0, 0, 0, 0]);
});

// ---------------------------------------------------------------------------
// buildColorStack
// ---------------------------------------------------------------------------

const LAYER_DARK: PrinterLayer = {
    filamentIdx: 0,
    filamentRgb: { r: 20, g: 20, b: 20 },
    td: 0.05,
    thickness: 0.20,
    startZ: 0,
};
const LAYER_LIGHT: PrinterLayer = {
    filamentIdx: 1,
    filamentRgb: { r: 240, g: 240, b: 240 },
    td: 0.05,
    thickness: 0.12,
    startZ: 0.20,
};

test('buildColorStack — layer 0 is the raw foundation color', () => {
    const stack = buildColorStack([LAYER_DARK, LAYER_LIGHT]);
    assert.deepEqual(stack[0], LAYER_DARK.filamentRgb);
});

test('buildColorStack — stack length equals layer count', () => {
    const layers = [LAYER_DARK, LAYER_LIGHT, { ...LAYER_DARK, startZ: 0.32 }];
    assert.equal(buildColorStack(layers).length, layers.length);
});

test('buildColorStack — blending light layer on dark foundation brightens the stack', () => {
    const stack = buildColorStack([LAYER_DARK, LAYER_LIGHT]);
    assert.ok(stack[1].r > stack[0].r, 'blending light should raise red channel');
});

// ---------------------------------------------------------------------------
// analyzeMultiHeadWindows
// ---------------------------------------------------------------------------

test('analyzeMultiHeadWindows — errorFactor is never negative', () => {
    const result = buildResult([BLACK, WHITE], SWATCHES_GREY);
    const windows = analyzeMultiHeadWindows(
        [BLACK, WHITE], result, SWATCHES_GREY, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );

    assert.ok(windows.length > 0, 'should produce at least one window');

    for (const w of windows) {
        assert.ok(
            w.errorFactor >= -1e-9,
            `window [${w.windowStart}–${w.windowEnd}] errorFactor=${w.errorFactor} is negative`
        );
    }
});

test('analyzeMultiHeadWindows — identical filaments give errorFactor of zero', () => {
    const result = buildResult([RED_A, RED_B], SWATCHES_GREY);
    const windows = analyzeMultiHeadWindows(
        [RED_A, RED_B], result, SWATCHES_GREY, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );

    assert.ok(windows.length > 0, 'should produce at least one window');

    for (const w of windows) {
        assert.ok(
            Math.abs(w.errorFactor) < 1e-6,
            `identical filaments: window [${w.windowStart}–${w.windowEnd}] ` +
            `errorFactor=${w.errorFactor} should be ~0`
        );
    }
});

test('analyzeMultiHeadWindows — window count matches expected sliding range', () => {
    const result = buildResult([BLACK, WHITE], SWATCHES_GREY);
    const windows = analyzeMultiHeadWindows(
        [BLACK, WHITE], result, SWATCHES_GREY, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );

    for (let i = 0; i < windows.length; i++) {
        assert.equal(windows[i].windowStart, i + 1, `window ${i} start`);
        assert.equal(windows[i].windowEnd, i + 2, `window ${i} end`);
    }
});

test('analyzeMultiHeadWindows — affectedSwatches is non-increasing as window moves up', () => {
    const result = buildResult([BLACK, WHITE], SWATCHES_GREY);
    const windows = analyzeMultiHeadWindows(
        [BLACK, WHITE], result, SWATCHES_GREY, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );

    for (let i = 1; i < windows.length; i++) {
        assert.ok(
            windows[i].affectedSwatches <= windows[i - 1].affectedSwatches,
            `affectedSwatches should be non-increasing: ` +
            `window ${i} has ${windows[i].affectedSwatches} > ` +
            `window ${i - 1} has ${windows[i - 1].affectedSwatches}`
        );
    }
});

test('analyzeMultiHeadWindows — windowBottomZ increases monotonically', () => {
    const result = buildResult([BLACK, WHITE], SWATCHES_GREY);
    const windows = analyzeMultiHeadWindows(
        [BLACK, WHITE], result, SWATCHES_GREY, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );

    for (let i = 1; i < windows.length; i++) {
        assert.ok(
            windows[i].windowBottomZ > windows[i - 1].windowBottomZ,
            `windowBottomZ not increasing at window ${i}`
        );
    }
});

test('analyzeMultiHeadWindows — returns empty when fewer than 2 filaments', () => {
    const result = buildResult([BLACK, WHITE], SWATCHES_GREY);
    assert.equal(
        analyzeMultiHeadWindows([BLACK], result, SWATCHES_GREY, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2).length,
        0
    );
});

test('analyzeMultiHeadWindows — returns empty when no swatches', () => {
    const result = buildResult([BLACK, WHITE], SWATCHES_GREY);
    assert.equal(
        analyzeMultiHeadWindows([BLACK, WHITE], result, [], LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2).length,
        0
    );
});

test('analyzeMultiHeadWindows — 4-head mode produces N^N=256 LUT entries', () => {
    const filaments = [
        filament('f0', '#000000', 5.0),
        filament('f1', '#ff0000', 5.0),
        filament('f2', '#00ff00', 5.0),
        filament('f3', '#ffffff', 5.0),
    ];
    const swatches = [
        { hex: '#202020' }, { hex: '#606060' }, { hex: '#a0a0a0' }, { hex: '#e0e0e0' },
    ];
    const result = buildResult(filaments, swatches);
    const windows = analyzeMultiHeadWindows(
        filaments, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 4
    );

    assert.ok(windows.length > 0, 'should produce windows with 4 filaments');
    for (const w of windows) {
        assert.equal(w.windowEnd - w.windowStart + 1, 4, 'each window should span 4 positions');
        assert.ok(w.currentFilaments.length <= 4, 'unique filaments cannot exceed window size');
        assert.ok(w.errorFactor >= -1e-9, 'errorFactor must not be negative');
    }
});

test('analyzeMultiHeadWindows — currentFilaments aligns with LUT indices', () => {
    const filaments = [BLACK, WHITE];
    const result = buildResult(filaments, SWATCHES_GREY);
    const windows = analyzeMultiHeadWindows(
        filaments, result, SWATCHES_GREY, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );

    const knownNames = new Set(filaments.map((f) => f.name ?? f.color));
    const N = 2;

    for (const w of windows) {
        for (const entry of w.lut) {
            for (const idx of entry) {
                assert.ok(
                    idx >= 0 && idx < w.currentFilaments.length,
                    `LUT index ${idx} out of bounds for currentFilaments (length ${w.currentFilaments.length})`
                );
            }
        }

        for (let p = 0; p < SWATCHES_GREY.length; p++) {
            const lutIdx = w.pixelOptimalLUTIdx[p];
            if (lutIdx === -1) continue;
            for (let n = 0; n < N; n++) {
                const name = w.currentFilaments[w.lut[lutIdx][n]];
                assert.ok(
                    knownNames.has(name),
                    `currentFilaments[lut[pixelOptimalLUTIdx[${p}]][${n}]] = "${name}" is not a known filament`
                );
            }
        }
    }
});

test('analyzeMultiHeadWindows — filamentIds chain resolves to known filament IDs', () => {
    const filaments = [BLACK, WHITE];
    const result = buildResult(filaments, SWATCHES_GREY);
    const windows = analyzeMultiHeadWindows(
        filaments, result, SWATCHES_GREY, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );

    const knownIds = new Set(filaments.map((f) => f.id));
    const N = 2;

    for (const w of windows) {
        assert.ok(w.filamentIds.length <= N, 'filamentIds cannot exceed window size');
        assert.equal(w.filamentIds.length, w.currentFilaments.length, 'filamentIds and currentFilaments must be same length');

        for (let p = 0; p < SWATCHES_GREY.length; p++) {
            const lutIdx = w.pixelOptimalLUTIdx[p];
            if (lutIdx === -1) continue;
            for (let n = 0; n < N; n++) {
                const id = w.filamentIds[w.lut[lutIdx][n]];
                assert.ok(knownIds.has(id), `filamentIds chain resolved to unknown ID "${id}"`);
            }
        }
    }
});

test('analyzeMultiHeadWindows — pixelOptimalLUTIdx contains valid indices or -1', () => {
    const result = buildResult([BLACK, WHITE], SWATCHES_GREY);
    const windows = analyzeMultiHeadWindows(
        [BLACK, WHITE], result, SWATCHES_GREY, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );

    for (const w of windows) {
        assert.equal(w.pixelOptimalLUTIdx.length, SWATCHES_GREY.length);
        for (let p = 0; p < SWATCHES_GREY.length; p++) {
            const idx = w.pixelOptimalLUTIdx[p];
            assert.ok(
                idx === -1 || (idx >= 0 && idx < w.lut.length),
                `pixelOptimalLUTIdx[${p}]=${idx} is invalid (lut has ${w.lut.length} entries)`
            );
        }
    }
});

// ---------------------------------------------------------------------------
// selectBestWindows
// ---------------------------------------------------------------------------

function fakeWindow(start: number, N: number, errorFactor: number): WindowResult {
    return {
        windowStart: start,
        windowEnd: start + N - 1,
        windowBottomZ: start * 0.12,
        windowTopZ: (start + N) * 0.12,
        currentFilaments: ['x'],
        filamentIds: ['x'],
        affectedSwatches: 1,
        errorFactor,
        lut: [[0]],
        pixelOptimalLUTIdx: [0],
    };
}

test('selectBestWindows — selects non-overlapping windows', () => {
    const N = 2;
    const windows = [
        fakeWindow(1, N, 10), // W[1-2]
        fakeWindow(2, N, 5),  // W[2-3] — overlaps with W[1-2] and W[3-4]
        fakeWindow(3, N, 8),  // W[3-4]
        fakeWindow(4, N, 2),  // W[4-5]
        fakeWindow(5, N, 15), // W[5-6]
    ];
    const selected = selectBestWindows(windows, N);
    // Optimal: W[1-2](10) + W[3-4](8) + W[5-6](15) = 33
    const total = selected.reduce((s, w) => s + w.errorFactor, 0);
    assert.equal(total, 33, `expected total 33, got ${total}`);
    assert.equal(selected.length, 3);
});

test('selectBestWindows — selected windows do not overlap', () => {
    const N = 4;
    const windows = Array.from({ length: 20 }, (_, i) =>
        fakeWindow(i + 1, N, Math.sin(i) * 100 + 100)
    );
    const selected = selectBestWindows(windows, N);
    for (let i = 1; i < selected.length; i++) {
        assert.ok(
            selected[i].windowStart > selected[i - 1].windowEnd,
            `windows ${i - 1} and ${i} overlap`
        );
    }
});

test('selectBestWindows — returns empty for empty input', () => {
    assert.deepEqual(selectBestWindows([], 4), []);
});

test('selectBestWindows — single window is always selected if errorFactor > 0', () => {
    const selected = selectBestWindows([fakeWindow(1, 4, 42)], 4);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].errorFactor, 42);
});

// ---------------------------------------------------------------------------
// runMultiHeadLayerAnalysis
// ---------------------------------------------------------------------------

test('runMultiHeadLayerAnalysis — returns non-overlapping selected windows', () => {
    const filaments = [
        filament('black', '#000000', 0.05),
        filament('grey', '#888844', 0.5),
        filament('white', '#ffffff', 0.5),
    ];
    const swatches = [...SWATCHES_GREY, { hex: '#906060' }];
    const result = generateAutoLayers(filaments, swatches, 0.08, 0.16);
    const selected = runMultiHeadLayerAnalysis(
        filaments, result, swatches, 0.08, 0.16, 2
    );
    assert.ok(Array.isArray(selected), 'should return an array');
    assert.ok(selected.length > 0, 'should select at least one window');
    for (let i = 1; i < selected.length; i++) {
        assert.ok(
            selected[i].windowStart > selected[i - 1].windowEnd,
            `returned windows ${i - 1} and ${i} overlap`
        );
    }
});

test('runMultiHeadLayerAnalysis — returns empty for insufficient data', () => {
    const result = buildResult([BLACK, WHITE], SWATCHES_GREY);
    assert.deepEqual(
        runMultiHeadLayerAnalysis([BLACK], result, SWATCHES_GREY, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2),
        []
    );
    assert.deepEqual(
        runMultiHeadLayerAnalysis([BLACK, WHITE], result, [], LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2),
        []
    );
});
