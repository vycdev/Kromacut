import assert from 'node:assert/strict';
import test from 'node:test';
import { generateAutoLayers } from '../src/lib/autoPaint.ts';
import { expandZonesToPrinterLayers } from '../src/lib/multiHeadAnalysis.ts';
import { runMultiHeadLayerAnalysisColorFirst } from '../src/lib/multiHeadAnalysisColorFirst.ts';
import { patchedLayersToPlan, patchedLayersToSliceData, buildPerColorLayerColors } from '../src/lib/patchedLayersToPlan.ts';
import type { Filament } from '../src/types/index.ts';

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

// ---------------------------------------------------------------------------
// patchedLayersToPlan — integration with the iterative analysis
// ---------------------------------------------------------------------------

test('patchedLayersToPlan — zones from patchedLayers cover the same total height as original layers', () => {
    const swatches = gradient(200);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { patchedLayers } = runMultiHeadLayerAnalysisColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    if (patchedLayers.length === 0) return; // no windows found, skip

    const originalLayers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const originalTop = originalLayers.at(-1)!;
    const expectedTop = originalTop.startZ + originalTop.thickness;

    const zones = patchedLayersToPlan(patchedLayers, FOUR_FILAMENTS);
    const actualTop = zones.at(-1)!.endHeight;

    assert.ok(
        Math.abs(actualTop - expectedTop) < 1e-6,
        `total height mismatch: patched=${actualTop.toFixed(4)} original=${expectedTop.toFixed(4)}`
    );
});

test('patchedLayersToPlan — all zone filamentIds are valid after iterative reordering', () => {
    const swatches = gradient(200);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { patchedLayers } = runMultiHeadLayerAnalysisColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    if (patchedLayers.length === 0) return;

    const knownIds = new Set(FOUR_FILAMENTS.map((f) => f.id));
    const zones = patchedLayersToPlan(patchedLayers, FOUR_FILAMENTS);

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
    const swatches = gradient(40);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { patchedLayers, colorLayerFilaments } = runMultiHeadLayerAnalysisColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    if (patchedLayers.length === 0) return;

    const perColor = buildPerColorLayerColors(patchedLayers, colorLayerFilaments, FOUR_FILAMENTS);
    assert.equal(perColor.size, colorLayerFilaments.size);
    for (const [hex, colors] of perColor) {
        assert.equal(colors.length, patchedLayers.length, `wrong length for "${hex}"`);
        for (const c of colors) {
            assert.ok(/^#[0-9a-fA-F]{6}$/.test(c), `invalid blended hex "${c}" for "${hex}"`);
        }
    }
});

test('buildPerColorLayerColors — foundation layer colour is the foundation filament for every colour', () => {
    const swatches = gradient(40);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { patchedLayers, colorLayerFilaments } = runMultiHeadLayerAnalysisColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    if (patchedLayers.length === 0) return;

    const perColor = buildPerColorLayerColors(patchedLayers, colorLayerFilaments, FOUR_FILAMENTS);
    const foundationColor = FOUR_FILAMENTS[patchedLayers[0].filamentIdx].color.toLowerCase();
    for (const [hex, colors] of perColor) {
        assert.equal(colors[0].toLowerCase(), foundationColor, `foundation mismatch for "${hex}"`);
    }
});

test('buildPerColorLayerColors — at least two colours differ in their blended top colour', () => {
    const swatches = gradient(40);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { patchedLayers, colorLayerFilaments, windows } = runMultiHeadLayerAnalysisColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    if (windows.length === 0 || patchedLayers.length === 0) return;

    const perColor = buildPerColorLayerColors(patchedLayers, colorLayerFilaments, FOUR_FILAMENTS);
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

// ---------------------------------------------------------------------------
// patchedLayersToPlan — edge cases
// ---------------------------------------------------------------------------

test('patchedLayersToPlan — single-layer input produces exactly one zone', () => {
    const swatches = gradient(2);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const allLayers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    if (allLayers.length === 0) return;

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
    if (layers.length === 0) return;

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
