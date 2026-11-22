import assert from 'node:assert/strict';
import test from 'node:test';
import { loadViteModule } from './helpers/viteModule.ts';
import type { PrinterLayer } from '../src/lib/multiHeadAnalysis.ts';
import type { Filament } from '../src/types/index.ts';
import type { AppearanceEffectiveOpticsModelV1, AppearanceRankModelV1 } from '../src/types/appearance.ts';

// autoPaint + multiHeadAnalysis reach an extensionless-import graph, so load them
// through Vite (matching the rest of the suite) rather than node's strip-types loader.
const { generateAutoLayers, deltaE, hexToRgb, mapTargetsToPrintablePalette, rgbToLab } =
    await loadViteModule<typeof import('../src/lib/autoPaint.ts')>('/src/lib/autoPaint.ts');
const {
    buildColorStack,
    expandZonesToPrinterLayers,
    buildPixelData,
    findLayerIdxAtHeight,
} = await loadViteModule<typeof import('../src/lib/multiHeadAnalysis.ts')>(
    '/src/lib/multiHeadAnalysis.ts'
);
const { createPriorEffectiveOpticsModel } =
    await loadViteModule<typeof import('../src/lib/effectiveOptics.ts')>('/src/lib/effectiveOptics.ts');
const { createIdentityAppearanceRankModel } =
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

// buildColorStack

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
