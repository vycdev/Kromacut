import assert from 'node:assert/strict';
import test from 'node:test';
import { loadViteModule } from './helpers/viteModule.ts';
import type { Filament } from '../src/types/index.ts';
import type { AutoPaintResult } from '../src/lib/autoPaint.ts';
import type { PrinterLayer } from '../src/lib/multiHeadAnalysis.ts';
import type { AppearanceEffectiveOpticsModelV1 } from '../src/types/appearance.ts';

// Loaded through Vite (extensionless-import graph — see the other multi-head tests).
const { generateAutoLayers, autoPaintToSliceHeights, hexToRgb, rgbToHex } =
    await loadViteModule<typeof import('../src/lib/autoPaint.ts')>('/src/lib/autoPaint.ts');
const { expandZonesToPrinterLayers } = await loadViteModule<
    typeof import('../src/lib/multiHeadAnalysis.ts')
>('/src/lib/multiHeadAnalysis.ts');
const { runMultiHeadLayerAnalysisColorFirst } = await loadViteModule<
    typeof import('../src/lib/multiHeadAnalysisColorFirst.ts')
>('/src/lib/multiHeadAnalysisColorFirst.ts');
const { patchedLayersToPlan, patchedLayersToSliceData, buildPerColorLayerColors } =
    await loadViteModule<typeof import('../src/lib/patchedLayersToPlan.ts')>(
        '/src/lib/patchedLayersToPlan.ts'
    );
const { channelHds } =
    await loadViteModule<typeof import('../src/lib/calibration.ts')>('/src/lib/calibration.ts');
const { createPriorEffectiveOpticsModel, predictEffectiveAutoPaintColor, resolveEffectiveTransitionOptics } =
    await loadViteModule<typeof import('../src/lib/effectiveOptics.ts')>('/src/lib/effectiveOptics.ts');

const LAYER_HEIGHT = 0.12;
const FIRST_LAYER_HEIGHT = 0.20;

function filament(id: string, color: string, td: number, name?: string): Filament {
    return { id, color, td, name };
}

const F0 = filament('f0', '#000000', 5.0, 'VeryDark');
const F1 = filament('f1', '#555555', 5.0, 'Dark');
const F2 = filament('f2', '#aaaaaa', 5.0, 'Light');
const F3 = filament('f3', '#ffffff', 5.0, 'VeryLight');
const FOUR_FILAMENTS = [F0, F1, F2, F3];

function gradient(n: number): Array<{ hex: string }> {
    return Array.from({ length: n }, (_, i) => {
        const v = Math.round((i / (n - 1)) * 255);
        const h = v.toString(16).padStart(2, '0');
        return { hex: `#${h}${h}${h}` };
    });
}

/** Alternating single-layer runs with a target explicitly mapped to each surface. */
function reorderedFixture() {
    const filaments = [filament('dark', '#363636', 0.66), filament('light', '#e8e8e8', 1.1)];
    const swatches = ['#0b0b0b', '#2e2e2e', '#7d7d7d', '#ababab', '#c2c2c2']
        .map((hex) => ({ hex }));
    const seed = generateAutoLayers(filaments, swatches, 0.25, 0.25);
    const sequence = [0, 1, 0, 1, 0];
    const transitionZones = sequence.map((fi, i) => ({
        filamentId: filaments[fi].id, filamentColor: filaments[fi].color,
        filamentTd: filaments[fi].td,
        startHeight: i * 0.25, endHeight: (i + 1) * 0.25,
        idealThickness: 0.25, actualThickness: 0.25,
    }));
    const result: AutoPaintResult = {
        ...seed, totalHeight: 1.25, transitionZones,
        finalStack: {
            ...seed.finalStack, totalHeight: 1.25,
            layers: sequence.map((fi, i) => ({
                ...seed.finalStack.layers[0],
                filamentId: filaments[fi].id, filamentColor: filaments[fi].color,
                zoneIndex: i, startHeight: i * 0.25, endHeight: (i + 1) * 0.25, thickness: 0.25,
            })),
            targetMappings: seed.finalStack.targetMappings.map((mapping, i) => ({
                ...mapping, projectedHeight: (i + 1) * 0.25,
            })),
        },
    };
    const analysis = runMultiHeadLayerAnalysisColorFirst(filaments, result, swatches, 0.25, 0.25, 2);
    assert.equal(analysis.windows.length, 2, 'fixture must select both non-overlapping windows');
    assert.equal(analysis.patchedLayers.length, sequence.length);
    assert.equal(analysis.colorLayerFilaments.size, swatches.length);
    return { filaments, result, ...analysis };
}

function coloredLayers(): { filaments: Filament[]; layers: PrinterLayer[] } {
    const filaments = [filament('base', '#101010', 0.4), filament('red', '#ed275c', 0.7)];
    const layers = [0, 1, 1].map((fi, i) => ({
        filamentIdx: fi, filamentId: filaments[fi].id,
        filamentRgb: hexToRgb(filaments[fi].color), td: channelHds(filaments[fi]),
        startZ: i === 0 ? 0 : 0.2 + (i - 1) * 0.1,
        thickness: i === 0 ? 0.2 : 0.1,
    }));
    return { filaments, layers };
}

function fittedModel(filaments: Filament[]): AppearanceEffectiveOpticsModelV1 {
    const prior = createPriorEffectiveOpticsModel(filaments);
    return {
        ...prior, applied: true, gateReason: 'applied',
        filaments: prior.filaments.map((entry) => ({
            ...entry,
            effectiveOpaqueColor: entry.filamentId === 'red' ? [220, 45, 85] : [20, 25, 30],
            effectiveHdChannels: [0.3, 0.8, 1.1], transmissionExponent: 1.35,
        })),
        substrateInteractions: [{
            foregroundFilamentId: 'red', substrateFilamentId: 'base',
            hdMultiplier: 1.6, sampleCount: 20, maxObservedThickness: 0.15,
        }],
    };
}

// ---------------------------------------------------------------------------
// patchedLayersToPlan — basic structural invariants
// ---------------------------------------------------------------------------

test('patchedLayersToPlan — returns empty for empty input', () => {
    assert.deepEqual(patchedLayersToPlan([], FOUR_FILAMENTS), []);
});

test('patchedLayersToPlan — zone count equals run count from the same layers', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const zones = patchedLayersToPlan(layers, FOUR_FILAMENTS);
    // One zone per contiguous same-filament run — count must be ≥ 1 and ≤ layers.length.
    assert.ok(zones.length >= 1, 'must produce at least one zone');
    assert.ok(zones.length <= layers.length, 'cannot have more zones than layers');
});

test('patchedLayersToPlan — zones are contiguous (endHeight[i] === startHeight[i+1])', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const zones = patchedLayersToPlan(layers, FOUR_FILAMENTS);

    for (let i = 1; i < zones.length; i++) {
        assert.ok(
            Math.abs(zones[i].startHeight - zones[i - 1].endHeight) < 1e-9,
            `gap between zone ${i - 1} (end ${zones[i - 1].endHeight}) and zone ${i} (start ${zones[i].startHeight})`
        );
    }
});

test('patchedLayersToPlan — startHeight values are monotonically increasing', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const zones = patchedLayersToPlan(layers, FOUR_FILAMENTS);

    for (let i = 1; i < zones.length; i++) {
        assert.ok(
            zones[i].startHeight > zones[i - 1].startHeight,
            `startHeight not increasing at zone ${i}: ${zones[i].startHeight} <= ${zones[i - 1].startHeight}`
        );
    }
});

test('patchedLayersToPlan — all zone heights are non-negative', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const zones = patchedLayersToPlan(layers, FOUR_FILAMENTS);

    for (const z of zones) {
        assert.ok(z.startHeight >= 0, `negative startHeight: ${z.startHeight}`);
        assert.ok(z.endHeight > 0,    `non-positive endHeight: ${z.endHeight}`);
        assert.ok(z.endHeight > z.startHeight, `zero-thickness zone at ${z.startHeight}`);
    }
});

test('patchedLayersToPlan — idealThickness equals actualThickness (no compression)', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const zones = patchedLayersToPlan(layers, FOUR_FILAMENTS);

    for (const z of zones) {
        assert.equal(z.idealThickness, z.actualThickness,
            `idealThickness ${z.idealThickness} !== actualThickness ${z.actualThickness}`);
    }
});

test('patchedLayersToPlan — filamentId and filamentColor round-trip to the correct filament', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const zones = patchedLayersToPlan(layers, FOUR_FILAMENTS);

    const knownIds    = new Set(FOUR_FILAMENTS.map((f) => f.id));
    const knownColors = new Set(FOUR_FILAMENTS.map((f) => f.color));

    for (const z of zones) {
        assert.ok(knownIds.has(z.filamentId),
            `filamentId "${z.filamentId}" not found in filaments`);
        assert.ok(knownColors.has(z.filamentColor),
            `filamentColor "${z.filamentColor}" not found in filaments`);
    }
});

test('patchedLayersToPlan — colored filament channel HDs survive zone-based rendering', () => {
    const { filaments, layers } = coloredLayers();
    const transitionZones = patchedLayersToPlan(layers, filaments);
    const seed = generateAutoLayers(filaments, [{ hex: '#872143' }], 0.1, 0.2);
    const converted = autoPaintToSliceHeights({ ...seed, transitionZones, finalStack: undefined }, 0.1, 0.2);
    const source = patchedLayersToSliceData(layers, filaments, 0.2);

    assert.equal(source.swatches[1].hex, '#872143');
    assert.deepEqual(converted.virtualSwatches, source.swatches);
    assert.deepEqual(transitionZones[1].filamentTdChannels, layers[1].td);
});

test('patchedLayersToPlan — fitted run optics survive conversion, including continuation beyond support', () => {
    const { filaments, layers } = coloredLayers();
    const model = fittedModel(filaments);
    const transitionOptics = resolveEffectiveTransitionOptics(model, 'red', 'base')!;
    const seed = generateAutoLayers(filaments, [{ hex: '#872143' }], 0.1, 0.2);
    // Exercise both legacy fitted fields and the bounded transition model added
    // by the lower layers of the multi-head stack.
    for (const bounded of [false, true]) {
        const fitted = layers.map((layer): PrinterLayer => ({
            ...layer,
            filamentRgb: layer.filamentIdx === 0 ? { r: 20, g: 25, b: 30 } : { r: 220, g: 45, b: 85 },
            td: [0.3, 0.8, 1.1], transmissionExponent: 1.35, substrateHdMultiplier: 1.6,
            transitionOptics: bounded && layer.filamentIdx === 1 ? transitionOptics : undefined,
        }));
        const transitionZones = patchedLayersToPlan(fitted, filaments);
        const converted = autoPaintToSliceHeights({ ...seed, transitionZones, finalStack: undefined }, 0.1, 0.2);
        const source = patchedLayersToSliceData(fitted, filaments, 0.2);
        assert.deepEqual(converted.virtualSwatches, source.swatches);
        assert.equal(transitionZones[1].filamentColor, filaments[1].color, 'retain physical export color');
    }
});

// ---------------------------------------------------------------------------
// patchedLayersToPlan — integration with the iterative analysis
// ---------------------------------------------------------------------------

test('patchedLayersToPlan — zones from patchedLayers cover the same total height as original layers', () => {
    const { filaments, result, patchedLayers } = reorderedFixture();

    const originalLayers = expandZonesToPrinterLayers(result, filaments, 0.25, 0.25);
    const originalTop = originalLayers.at(-1)!;
    const expectedTop = originalTop.startZ + originalTop.thickness;

    const zones = patchedLayersToPlan(patchedLayers, filaments);
    assert.ok(zones.length > 0);
    const actualTop = zones.at(-1)!.endHeight;

    assert.ok(
        Math.abs(actualTop - expectedTop) < 1e-6,
        `total height mismatch: patched=${actualTop.toFixed(4)} original=${expectedTop.toFixed(4)}`
    );
});

test('patchedLayersToPlan — all zone filamentIds are valid after iterative reordering', () => {
    const { filaments, patchedLayers } = reorderedFixture();

    const knownIds = new Set(filaments.map((f) => f.id));
    const zones = patchedLayersToPlan(patchedLayers, filaments);
    assert.ok(zones.length > 0);

    for (const z of zones) {
        assert.ok(knownIds.has(z.filamentId),
            `reordered zone has unknown filamentId "${z.filamentId}"`);
    }
});

// ---------------------------------------------------------------------------
// patchedLayersToSliceData
// ---------------------------------------------------------------------------

test('patchedLayersToSliceData — returns empty triple for empty input', () => {
    const result = patchedLayersToSliceData([], FOUR_FILAMENTS, FIRST_LAYER_HEIGHT);
    assert.deepEqual(result, { colorOrder: [], colorSliceHeights: [], swatches: [] });
});

test('patchedLayersToSliceData — colorOrder is the identity mapping', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { colorOrder } = patchedLayersToSliceData(layers, FOUR_FILAMENTS, FIRST_LAYER_HEIGHT);
    assert.deepEqual(colorOrder, Array.from({ length: colorOrder.length }, (_, i) => i));
});

test('patchedLayersToSliceData — all three arrays have the same length', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { colorOrder, colorSliceHeights, swatches: sw } = patchedLayersToSliceData(
        layers, FOUR_FILAMENTS, FIRST_LAYER_HEIGHT
    );
    assert.equal(colorSliceHeights.length, colorOrder.length);
    assert.equal(sw.length, colorOrder.length);
});

test('patchedLayersToSliceData — first slice height is at least firstLayerHeight', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { colorSliceHeights } = patchedLayersToSliceData(layers, FOUR_FILAMENTS, FIRST_LAYER_HEIGHT);
    assert.ok(
        colorSliceHeights[0] >= FIRST_LAYER_HEIGHT,
        `first slice height ${colorSliceHeights[0]} < firstLayerHeight ${FIRST_LAYER_HEIGHT}`
    );
});

test('patchedLayersToSliceData — cumulative heights match total model height', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { colorSliceHeights } = patchedLayersToSliceData(layers, FOUR_FILAMENTS, FIRST_LAYER_HEIGHT);

    const lastLayer = layers.at(-1)!;
    const expectedTotal = lastLayer.startZ + lastLayer.thickness;
    const actualTotal = colorSliceHeights.reduce((s, h) => s + h, 0);

    assert.ok(
        Math.abs(actualTotal - expectedTotal) < 1e-6,
        `cumulative height ${actualTotal.toFixed(4)} !== expected ${expectedTotal.toFixed(4)}`
    );
});

test('patchedLayersToSliceData — produces one slice per printer layer', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { colorOrder } = patchedLayersToSliceData(layers, FOUR_FILAMENTS, FIRST_LAYER_HEIGHT);
    // One slice per printer layer (matching autoPaintToSliceHeights granularity),
    // not one per color run — this preserves the smooth per-layer gradient.
    assert.equal(colorOrder.length, layers.length,
        `expected one slice per layer (${layers.length}), got ${colorOrder.length}`);
});

test('patchedLayersToSliceData — swatches are valid 6-digit hex with alpha 255', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { swatches: sw } = patchedLayersToSliceData(layers, FOUR_FILAMENTS, FIRST_LAYER_HEIGHT);

    // Colours are Beer-Lambert blends, not raw filament colours, so we only
    // assert valid hex format rather than membership in the filament palette.
    for (const s of sw) {
        assert.ok(/^#[0-9a-fA-F]{6}$/.test(s.hex), `invalid hex "${s.hex}"`);
        assert.equal(s.a, 255);
    }
});

test('patchedLayersToSliceData — foundation slice colour equals the foundation filament colour', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { swatches: sw } = patchedLayersToSliceData(layers, FOUR_FILAMENTS, FIRST_LAYER_HEIGHT);

    // Layer 0 is the opaque foundation — its blended colour is the raw filament.
    const foundationFilament = FOUR_FILAMENTS[layers[0].filamentIdx];
    assert.equal(sw[0].hex.toLowerCase(), foundationFilament.color.toLowerCase());
});

// ---------------------------------------------------------------------------
// buildPerColorLayerColors
// ---------------------------------------------------------------------------

test('buildPerColorLayerColors — returns empty for empty layers', () => {
    const out = buildPerColorLayerColors([], new Map(), FOUR_FILAMENTS);
    assert.equal(out.size, 0);
});

test('buildPerColorLayerColors — one colour-array per colour, length = layer count', () => {
    const { filaments, patchedLayers, colorLayerFilaments } = reorderedFixture();

    const perColor = buildPerColorLayerColors(patchedLayers, colorLayerFilaments, filaments);
    assert.equal(perColor.size, colorLayerFilaments.size);
    for (const [hex, colors] of perColor) {
        assert.equal(colors.length, patchedLayers.length, `wrong length for "${hex}"`);
        for (const c of colors) {
            assert.ok(/^#[0-9a-fA-F]{6}$/.test(c), `invalid blended hex "${c}" for "${hex}"`);
        }
    }
});

test('buildPerColorLayerColors — foundation layer colour is the foundation filament for every colour', () => {
    const { filaments, patchedLayers, colorLayerFilaments } = reorderedFixture();

    const perColor = buildPerColorLayerColors(patchedLayers, colorLayerFilaments, filaments);
    assert.equal(perColor.size, colorLayerFilaments.size);
    const foundationColor = filaments[patchedLayers[0].filamentIdx].color.toLowerCase();
    for (const [hex, colors] of perColor) {
        assert.equal(colors[0].toLowerCase(), foundationColor, `foundation mismatch for "${hex}"`);
    }
});

test('buildPerColorLayerColors — different filament paths produce different blended colours', () => {
    const { filaments, patchedLayers, colorLayerFilaments } = reorderedFixture();

    const perColor = buildPerColorLayerColors(patchedLayers, colorLayerFilaments, filaments);
    // Across all layers, there should be at least one layer index where two
    // colours produce different blended colours (i.e. mixing is visible).
    const L = patchedLayers.length;
    let foundDivergence = false;
    for (let i = 0; i < L && !foundDivergence; i++) {
        const seen = new Set<string>();
        for (const colors of perColor.values()) seen.add(colors[i]);
        if (seen.size > 1) foundDivergence = true;
    }
    assert.ok(foundDivergence, 'expected at least one layer where colours diverge');
});

test('buildPerColorLayerColors — every surface matches the color\'s own physical filament path', () => {
    const { filaments, patchedLayers, colorLayerFilaments } = reorderedFixture();
    const perColor = buildPerColorLayerColors(patchedLayers, colorLayerFilaments, filaments);
    const model = createPriorEffectiveOpticsModel(filaments);
    for (const [hex, sequence] of colorLayerFilaments) {
        const expected = sequence.map((_, i) => {
            const rgb = predictEffectiveAutoPaintColor(model, sequence.slice(0, i + 1).map((fi, l) => ({
                filamentId: filaments[fi].id, thickness: patchedLayers[l].thickness,
            })))!;
            return rgbToHex({ r: rgb[0], g: rgb[1], b: rgb[2] });
        });
        assert.deepEqual(perColor.get(hex), expected, `wrong physical path for ${hex}`);
    }
});

test('buildPerColorLayerColors — colored paths use their own fitted substrates and cumulative runs', () => {
    const { filaments, layers } = coloredLayers();
    const model = fittedModel(filaments);
    const paths = new Map([['#872143', [0, 1, 1]], ['#101010', [0, 0, 1]]]);
    // Cache consensus optics on every layer as the analysis does. They must
    // not follow a layer when a color assigns it to another filament.
    const consensus = layers.map((layer) => ({
        ...layer, transitionOptics: resolveEffectiveTransitionOptics(model, 'red', 'base'),
    }));
    const perColor = buildPerColorLayerColors(consensus, paths, filaments, model);
    for (const [hex, sequence] of paths) {
        const expected = sequence.map((_, i) => {
            const rgb = predictEffectiveAutoPaintColor(model, sequence.slice(0, i + 1).map((fi, l) => ({
                filamentId: filaments[fi].id, thickness: layers[l].thickness,
            })))!;
            return rgbToHex({ r: rgb[0], g: rgb[1], b: rgb[2] });
        });
        assert.deepEqual(perColor.get(hex), expected);
    }
});

// ---------------------------------------------------------------------------
// patchedLayersToPlan — edge cases
// ---------------------------------------------------------------------------

test('patchedLayersToPlan — single-layer input produces exactly one zone', () => {
    const swatches = gradient(2);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const allLayers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    assert.ok(allLayers.length > 0);

    const singleLayer = allLayers.slice(0, 1);
    const zones = patchedLayersToPlan(singleLayer, FOUR_FILAMENTS);

    assert.equal(zones.length, 1, 'one layer must produce exactly one zone');
    assert.ok(zones[0].endHeight > zones[0].startHeight, 'zone must have positive thickness');
    assert.ok(zones[0].startHeight >= 0);
});

test('patchedLayersToPlan — out-of-bounds filamentIdx falls back gracefully', () => {
    const swatches = gradient(4);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    assert.ok(layers.length > 0);

    // Patch a layer to use an index beyond the filaments array.
    const patched = layers.map((l, i) =>
        i === 0 ? { ...l, filamentIdx: 99 } : l
    );
    const zones = patchedLayersToPlan(patched, FOUR_FILAMENTS);

    assert.ok(zones.length >= 1);
    // The zone whose run covers layer 0 should fall back, not throw.
    const fallbackZone = zones[0];
    assert.equal(fallbackZone.filamentId, 'f99', 'expected fallback id f<idx>');
    assert.equal(fallbackZone.filamentColor, '#000000', 'expected fallback color #000000');
    assert.equal(fallbackZone.filamentTd, 0, 'expected fallback td 0');
});
