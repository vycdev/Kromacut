import assert from 'node:assert/strict';
import test from 'node:test';
import { loadViteModule } from './helpers/viteModule.ts';
import type { AutoPaintResult } from '../src/lib/autoPaint.ts';
import type { AppearanceEffectiveOpticsModelV1 } from '../src/types/appearance.ts';
import type { WindowFilament } from '../src/lib/multiHeadAnalysis.ts';
import type { Filament } from '../src/types/index.ts';

// These lib modules reach an extensionless-import graph, so load them through
// Vite (matching the rest of the suite) rather than node's strip-types loader.
const { generateAutoLayers, hexToRgb, deltaE } =
    await loadViteModule<typeof import('../src/lib/autoPaint.ts')>('/src/lib/autoPaint.ts');
const { buildColorStack, expandZonesToPrinterLayers, buildPixelData } = await loadViteModule<
    typeof import('../src/lib/multiHeadAnalysis.ts')
>('/src/lib/multiHeadAnalysis.ts');
const {
    buildPixelDataColorFirst,
    buildColorGroupedPixels,
    buildColorRuns,
    analyzeMultiHeadWindowsColorFirst,
    computeColorOptimalAssignments,
    optimizeNozzleAssignments,
    runMultiHeadLayerAnalysisColorFirst,
    COLOR_GROUP_CAP,
    MAX_MULTI_HEAD_HEADS,
} = await loadViteModule<typeof import('../src/lib/multiHeadAnalysisColorFirst.ts')>(
    '/src/lib/multiHeadAnalysisColorFirst.ts'
);
const { channelHds } =
    await loadViteModule<typeof import('../src/lib/calibration.ts')>('/src/lib/calibration.ts');

const { createPriorEffectiveOpticsModel, predictEffectiveAutoPaintColor } =
    await loadViteModule<typeof import('../src/lib/effectiveOptics.ts')>('/src/lib/effectiveOptics.ts');

const LAYER_HEIGHT = 0.12;
const FIRST_LAYER_HEIGHT = 0.20;

function filament(id: string, color: string, td: number, name?: string): Filament {
    return { id, color, td, name };
}

const BLACK = filament('black', '#000000', 5.0, 'Black');
const WHITE = filament('white', '#ffffff', 5.0, 'White');

// Four-filament fixture for run-based window tests.
// High TD → tall model → each zone spans several printer layers → runs are wide.
const F0 = filament('f0', '#000000', 5.0, 'VeryDark');
const F1 = filament('f1', '#555555', 5.0, 'Dark');
const F2 = filament('f2', '#aaaaaa', 5.0, 'Light');
const F3 = filament('f3', '#ffffff', 5.0, 'VeryLight');
const FOUR_FILAMENTS = [F0, F1, F2, F3];

function gradient(n: number, count = 1): Array<{ hex: string; count: number }> {
    return Array.from({ length: n }, (_, i) => {
        const v = Math.round((i / (n - 1)) * 255);
        const h = v.toString(16).padStart(2, '0');
        return { hex: `#${h}${h}${h}`, count };
    });
}

// ---------------------------------------------------------------------------
// buildColorRuns
// ---------------------------------------------------------------------------

test('buildColorRuns — single run when all layers share the same filament', () => {
    const swatches = [{ hex: '#808080' }];
    const result = generateAutoLayers([BLACK], swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, [BLACK], LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const runs = buildColorRuns(layers);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].startLayerIdx, 0);
    assert.equal(runs[0].endLayerIdx, layers.length - 1);
});

test('buildColorRuns — runs partition all layers with no gaps', () => {
    const swatches = gradient(10);
    const result = generateAutoLayers([BLACK, WHITE], swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, [BLACK, WHITE], LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const runs = buildColorRuns(layers);

    // Every layer index must appear in exactly one run.
    let covered = 0;
    for (const run of runs) {
        assert.ok(run.startLayerIdx <= run.endLayerIdx, 'run must have at least one layer');
        covered += run.endLayerIdx - run.startLayerIdx + 1;
    }
    assert.equal(covered, layers.length, 'runs must cover every printer layer exactly once');
});

test('buildColorRuns — adjacent layers with different filaments each become their own run', () => {
    const swatches = gradient(10);
    const result = generateAutoLayers([BLACK, WHITE], swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, [BLACK, WHITE], LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const runs = buildColorRuns(layers);

    for (let i = 1; i < runs.length; i++) {
        assert.notEqual(
            runs[i].filamentIdx, runs[i - 1].filamentIdx,
            `adjacent runs at indices ${i - 1} and ${i} should have different filaments`
        );
    }
});

// ---------------------------------------------------------------------------
// Optical model — hiding distance must not be rescaled
// ---------------------------------------------------------------------------

test('expandZonesToPrinterLayers — layer td comes straight from channelHds (no second x0.1 scale)', () => {
    // Schema v2 stores frontlit hiding distance directly in filament.td. The
    // multi-head path must consume it through the shared channelHds() model, the
    // same as normal auto-paint — not multiply it by 0.1 again.
    const filaments = [
        filament('a', '#101010', 0.71, 'A'),
        filament('b', '#e8e8e8', 0.42, 'B'),
    ];
    const swatches = gradient(24);
    const result = generateAutoLayers(filaments, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, filaments, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);

    assert.ok(layers.length > 1);
    for (const layer of layers) {
        const expected = channelHds(filaments[layer.filamentIdx]);
        assert.deepEqual(
            layer.td,
            expected,
            `layer td ${JSON.stringify(layer.td)} != channelHds ${JSON.stringify(expected)}`
        );
        // Guard the specific bug: the old code stored filament.td * 0.1.
        const scalarLo = Math.min(expected[0], expected[1], expected[2]);
        assert.ok(
            scalarLo > filaments[layer.filamentIdx].td * 0.1 + 1e-9,
            'layer td looks like it was rescaled by 0.1'
        );
    }
});

// ---------------------------------------------------------------------------
// buildPixelDataColorFirst
// ---------------------------------------------------------------------------

test('buildPixelDataColorFirst — produces fewer entries than input swatches for a dense gradient', () => {
    const swatches = gradient(200);
    const result = generateAutoLayers([BLACK, WHITE], swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, [BLACK, WHITE], LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const colorAtLayer = buildColorStack(layers);

    const pixels = buildPixelDataColorFirst(
        swatches, layers, colorAtLayer,
        result.finalStack
    );

    assert.ok(pixels.length < swatches.length,
        `expected color-first to collapse 200 swatches into fewer entries, got ${pixels.length}`);
    assert.ok(pixels.length > 0, 'must produce at least one entry');
});

test('buildPixelDataColorFirst — counts sum to total input count', () => {
    const swatches = gradient(200, 10);
    const result = generateAutoLayers([BLACK, WHITE], swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, [BLACK, WHITE], LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const colorAtLayer = buildColorStack(layers);

    const pixels = buildPixelDataColorFirst(
        swatches, layers, colorAtLayer,
        result.finalStack
    );

    const totalCount = pixels.reduce((s, p) => s + p.count, 0);
    const expectedCount = swatches.reduce((s, sw) => s + sw.count, 0);
    assert.equal(totalCount, expectedCount);
});

test('buildPixelDataColorFirst — all actualErr values are non-negative', () => {
    const swatches = gradient(100);
    const result = generateAutoLayers([BLACK, WHITE], swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, [BLACK, WHITE], LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const colorAtLayer = buildColorStack(layers);

    const pixels = buildPixelDataColorFirst(
        swatches, layers, colorAtLayer,
        result.finalStack
    );
    for (const p of pixels) {
        assert.ok(p.actualErr >= 0, `actualErr=${p.actualErr} at layerIdx=${p.layerIdx}`);
    }
});

// ---------------------------------------------------------------------------
// analyzeMultiHeadWindowsColorFirst (run-based windowing)
// ---------------------------------------------------------------------------

test('analyzeMultiHeadWindowsColorFirst — produces at least one window', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const windows = analyzeMultiHeadWindowsColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    assert.ok(windows.length > 0, 'should produce at least one run-based window');
});

test('analyzeMultiHeadWindowsColorFirst — windows never cover the foundation layer (layer 0)', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const windows = analyzeMultiHeadWindowsColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    for (const w of windows) {
        assert.ok(w.windowStart > 0, `window starts at layer 0 (foundation): windowStart=${w.windowStart}`);
    }
});

test('analyzeMultiHeadWindowsColorFirst — errorFactor is never negative', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const windows = analyzeMultiHeadWindowsColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    for (const w of windows) {
        assert.ok(w.errorFactor >= -1e-9,
            `window [${w.windowStart}–${w.windowEnd}] errorFactor=${w.errorFactor}`);
    }
});

test('analyzeMultiHeadWindowsColorFirst — windows span multiple layers (not just N)', () => {
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const windows = analyzeMultiHeadWindowsColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    const N = 2;
    const widerThanN = windows.some((w) => w.windowEnd - w.windowStart + 1 > N);
    assert.ok(widerThanN, 'at least one run-based window should span more than N=2 printer layers');
});

test('analyzeMultiHeadWindowsColorFirst — returns empty for insufficient data', () => {
    const result = generateAutoLayers(FOUR_FILAMENTS, gradient(10), LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    assert.equal(
        analyzeMultiHeadWindowsColorFirst([F0], result, gradient(10), LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2).length,
        0
    );
    assert.equal(
        analyzeMultiHeadWindowsColorFirst(FOUR_FILAMENTS, result, [], LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2).length,
        0
    );
});

test('analyzeMultiHeadWindowsColorFirst — lut and pixelOptimalLUTIdx are empty (populated by caller)', () => {
    // analyzeMultiHeadWindowsColorFirst intentionally leaves lut:[] and pixelOptimalLUTIdx:[]
    // on each WindowResult — the full pipeline (runMultiHeadLayerAnalysisColorFirst) fills these
    // in after window selection. Asserting empty here documents that contract explicitly.
    const swatches = gradient(20);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const windows = analyzeMultiHeadWindowsColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    for (const w of windows) {
        assert.deepEqual(w.lut, [], `expected lut to be empty on raw window`);
        assert.deepEqual(w.pixelOptimalLUTIdx, [], `expected pixelOptimalLUTIdx to be empty on raw window`);
    }
});

// ---------------------------------------------------------------------------
// runMultiHeadLayerAnalysisColorFirst
// ---------------------------------------------------------------------------

test('runMultiHeadLayerAnalysisColorFirst — returns empty for insufficient data', () => {
    const result = generateAutoLayers([BLACK, WHITE], gradient(10), LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const emptyShape = {
        windows: [], colorAssignments: [], uniqueLayerCount: 0, patchedLayers: [],
        colorLayerFilaments: new Map(), windowRunFilaments: [], nozzleAssignments: [],
        preWindowFilaments: [], nonWindowedRanges: [],
    };
    assert.deepEqual(
        runMultiHeadLayerAnalysisColorFirst([BLACK], result, gradient(10), LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2),
        emptyShape
    );
    assert.deepEqual(
        runMultiHeadLayerAnalysisColorFirst([BLACK, WHITE], result, [], LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2),
        emptyShape
    );
});

test('runMultiHeadLayerAnalysisColorFirst — colorAssignments length matches windows length', () => {
    const swatches = gradient(200);
    const result = generateAutoLayers([BLACK, WHITE], swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { windows, colorAssignments } = runMultiHeadLayerAnalysisColorFirst(
        [BLACK, WHITE], result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    assert.equal(colorAssignments.length, windows.length);
});

test('runMultiHeadLayerAnalysisColorFirst — colorAssignments only contain input hex colors', () => {
    const swatches = gradient(200);
    const knownHexes = new Set(swatches.map((s) => s.hex));
    const result = generateAutoLayers([BLACK, WHITE], swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { colorAssignments } = runMultiHeadLayerAnalysisColorFirst(
        [BLACK, WHITE], result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    for (let i = 0; i < colorAssignments.length; i++) {
        for (const hex of colorAssignments[i].keys()) {
            assert.ok(knownHexes.has(hex), `colorAssignments[${i}] contains unknown hex "${hex}"`);
        }
    }
});

test('runMultiHeadLayerAnalysisColorFirst — all slot indices in colorAssignments are valid', () => {
    const swatches = gradient(200);
    const result = generateAutoLayers([BLACK, WHITE], swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { windows, colorAssignments } = runMultiHeadLayerAnalysisColorFirst(
        [BLACK, WHITE], result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    for (let i = 0; i < windows.length; i++) {
        const numFilaments = windows[i].filamentIds.length;
        for (const [hex, slots] of colorAssignments[i]) {
            for (let s = 0; s < slots.length; s++) {
                assert.ok(
                    slots[s] >= 0 && slots[s] < numFilaments,
                    `colorAssignments[${i}].get("${hex}")[${s}] = ${slots[s]} out of range [0, ${numFilaments})`
                );
            }
        }
    }
});

test('runMultiHeadLayerAnalysisColorFirst — direct lookup resolves to known filament IDs', () => {
    const swatches = gradient(200);
    const filaments = [BLACK, WHITE];
    const knownIds = new Set(filaments.map((f) => f.id));
    const result = generateAutoLayers(filaments, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { windows, colorAssignments } = runMultiHeadLayerAnalysisColorFirst(
        filaments, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    for (let i = 0; i < windows.length; i++) {
        const w = windows[i];
        for (const [hex, slots] of colorAssignments[i]) {
            for (let s = 0; s < slots.length; s++) {
                const id = w.filamentIds[slots[s]];
                assert.ok(knownIds.has(id),
                    `window ${i}, hex "${hex}", slot ${s}: filamentId "${id}" unknown`);
            }
        }
    }
});

test('runMultiHeadLayerAnalysisColorFirst — uniqueLayerCount is less than swatch count for dense gradient', () => {
    const swatches = gradient(200);
    const result = generateAutoLayers([BLACK, WHITE], swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { uniqueLayerCount } = runMultiHeadLayerAnalysisColorFirst(
        [BLACK, WHITE], result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    assert.ok(uniqueLayerCount < swatches.length,
        `expected fewer unique layers than swatches (200), got ${uniqueLayerCount}`);
});

// ---------------------------------------------------------------------------
// colorLayerFilaments + non-overlapping windows
// ---------------------------------------------------------------------------

test('runMultiHeadLayerAnalysisColorFirst — selected windows never overlap', () => {
    const swatches = gradient(40);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { windows } = runMultiHeadLayerAnalysisColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    const sorted = [...windows].sort((a, b) => a.windowStart - b.windowStart);
    for (let i = 1; i < sorted.length; i++) {
        assert.ok(
            sorted[i].windowStart > sorted[i - 1].windowEnd,
            `windows overlap: [${sorted[i - 1].windowStart}-${sorted[i - 1].windowEnd}] and ` +
            `[${sorted[i].windowStart}-${sorted[i].windowEnd}]`
        );
    }
});

test('runMultiHeadLayerAnalysisColorFirst — colorLayerFilaments has one entry per input colour', () => {
    const swatches = gradient(40);
    const knownHexes = new Set(swatches.map((s) => s.hex));
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { windows, colorLayerFilaments } = runMultiHeadLayerAnalysisColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    if (windows.length === 0) return; // no windows selected with this input — invariant only applies when windows exist
    for (const hex of colorLayerFilaments.keys()) {
        assert.ok(knownHexes.has(hex), `colorLayerFilaments has unknown hex "${hex}"`);
    }
    assert.ok(colorLayerFilaments.size > 0, 'expected at least one colour mapping');
});

test('runMultiHeadLayerAnalysisColorFirst — every colour sequence has length = patchedLayers and valid indices', () => {
    const swatches = gradient(40);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { colorLayerFilaments, patchedLayers } = runMultiHeadLayerAnalysisColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    for (const [hex, seq] of colorLayerFilaments) {
        assert.equal(seq.length, patchedLayers.length, `seq length mismatch for "${hex}"`);
        for (const fi of seq) {
            assert.ok(fi >= 0 && fi < FOUR_FILAMENTS.length, `filamentIdx ${fi} out of range for "${hex}"`);
        }
    }
});

test('runMultiHeadLayerAnalysisColorFirst — at least two colours differ somewhere in their layer sequences', () => {
    const swatches = gradient(40);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { colorLayerFilaments, windows } = runMultiHeadLayerAnalysisColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    if (windows.length === 0) return; // nothing to mix
    const seqs = [...colorLayerFilaments.values()].map((s) => s.join(','));
    const distinct = new Set(seqs).size;
    assert.ok(distinct > 1, 'expected per-colour variety in filament sequences, all were identical');
});

// ---------------------------------------------------------------------------
// patchedLayers
// ---------------------------------------------------------------------------

test('runMultiHeadLayerAnalysisColorFirst — patchedLayers is empty when fewer than 2 filaments provided', () => {
    const result = generateAutoLayers([BLACK, WHITE], gradient(10), LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { patchedLayers } = runMultiHeadLayerAnalysisColorFirst(
        [BLACK], result, gradient(10), LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    assert.equal(patchedLayers.length, 0);
});

test('runMultiHeadLayerAnalysisColorFirst — patchedLayers is empty when window loop finds no valid windows', () => {
    // With only 2 filaments and N=2, buildColorRuns produces 2 runs. The only possible window
    // [run0, run1] starts at layer 0 (the opaque foundation) and is always skipped.
    // This exercises the "no windows after sliding" path, distinct from the N<2 early-return.
    const result = generateAutoLayers([BLACK, WHITE], gradient(10), LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { windows, patchedLayers } = runMultiHeadLayerAnalysisColorFirst(
        [BLACK, WHITE], result, gradient(10), LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    assert.equal(windows.length, 0, 'expected no windows when only window spans foundation');
    assert.equal(patchedLayers.length, 0);
});

test('runMultiHeadLayerAnalysisColorFirst — patchedLayers is non-empty when windows are found', () => {
    const swatches = gradient(200);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { windows, patchedLayers } = runMultiHeadLayerAnalysisColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    if (windows.length === 0) return; // guard: no windows found, skip
    assert.ok(patchedLayers.length > 0, 'patchedLayers must be non-empty when windows were applied');
});

test('runMultiHeadLayerAnalysisColorFirst — patchedLayers filamentIdx values are all in range', () => {
    const swatches = gradient(200);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { patchedLayers } = runMultiHeadLayerAnalysisColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    for (let i = 0; i < patchedLayers.length; i++) {
        assert.ok(
            patchedLayers[i].filamentIdx >= 0 && patchedLayers[i].filamentIdx < FOUR_FILAMENTS.length,
            `patchedLayers[${i}].filamentIdx = ${patchedLayers[i].filamentIdx} out of range`
        );
    }
});

test('runMultiHeadLayerAnalysisColorFirst — patchedLayers length matches original layer count', () => {
    const swatches = gradient(200);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { windows, patchedLayers } = runMultiHeadLayerAnalysisColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    if (windows.length === 0) return; // no windows selected with this input — invariant only applies when windows exist
    const originalLayers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    assert.equal(patchedLayers.length, originalLayers.length,
        'patchedLayers must have the same number of entries as the original layer stack');
});

test('runMultiHeadLayerAnalysisColorFirst — patchedLayers startZ values are monotonically non-decreasing', () => {
    const swatches = gradient(200);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const { patchedLayers } = runMultiHeadLayerAnalysisColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
    );
    for (let i = 1; i < patchedLayers.length; i++) {
        assert.ok(
            patchedLayers[i].startZ >= patchedLayers[i - 1].startZ,
            `patchedLayers[${i}].startZ=${patchedLayers[i].startZ} < patchedLayers[${i-1}].startZ=${patchedLayers[i-1].startZ}`
        );
    }
});

// ---------------------------------------------------------------------------
// analyzeMultiHeadWindowsColorFirst — layer count guard
// ---------------------------------------------------------------------------

test('analyzeMultiHeadWindowsColorFirst — returns empty when layers.length < N + 1', () => {
    const swatches = gradient(4);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    // N = min(n, filaments.length). Use n = layers.length so N = min(layers.length, 4).
    // The guard fires when layers.length < N + 1. With N = layers.length (when layers.length <= 4)
    // the guard is layers.length < layers.length + 1 which is always true.
    // When layers.length > 4, N = 4; skip the test — the guard isn't reachable with this fixture.
    if (layers.length > 4) return;
    const windows = analyzeMultiHeadWindowsColorFirst(
        FOUR_FILAMENTS, result, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, layers.length
    );
    assert.equal(windows.length, 0, 'should return [] when layers.length < N + 1');
});

// ---------------------------------------------------------------------------
// computeColorOptimalAssignments — direct unit tests
// ---------------------------------------------------------------------------

test('computeColorOptimalAssignments — errorFactor is non-negative', () => {
    const swatches = gradient(40, 5);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const colorAtLayer = buildColorStack(layers);
    const runs = buildColorRuns(layers);
    const pixels = buildPixelDataColorFirst(
        swatches, layers, colorAtLayer, result.finalStack
    );
    if (runs.length < 3) return; // need at least 3 runs to pick a non-foundation window

    const N = 2;
    const windowRuns = runs.slice(1, 1 + N); // skip run 0 (foundation)
    const wEnd = windowRuns[N - 1].endLayerIdx;
    const uniqueIndices = [...new Set(windowRuns.map((r) => r.filamentIdx))];
    const windowFilaments: WindowFilament[] = uniqueIndices.map((fi) => ({
        filamentIdx: fi,
        filamentId: FOUR_FILAMENTS[fi].id,
        rgb: hexToRgb(FOUR_FILAMENTS[fi].color),
        td: channelHds(FOUR_FILAMENTS[fi]),
    }));

    const { errorFactor } = computeColorOptimalAssignments(
        windowRuns, wEnd, layers, colorAtLayer[windowRuns[0].startLayerIdx - 1], windowFilaments, pixels
    );
    assert.ok(errorFactor >= -1e-9, `errorFactor should be >= 0, got ${errorFactor}`);
});

test('computeColorOptimalAssignments — affectedCount matches pixels in and above the window', () => {
    const swatches = gradient(40, 5);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const colorAtLayer = buildColorStack(layers);
    const runs = buildColorRuns(layers);
    const pixels = buildPixelDataColorFirst(
        swatches, layers, colorAtLayer, result.finalStack
    );
    if (runs.length < 3) return;

    const N = 2;
    const windowRuns = runs.slice(1, 1 + N);
    const wStart = windowRuns[0].startLayerIdx;
    const wEnd = windowRuns[N - 1].endLayerIdx;
    const uniqueIndices = [...new Set(windowRuns.map((r) => r.filamentIdx))];
    const windowFilaments: WindowFilament[] = uniqueIndices.map((fi) => ({
        rgb: colorAtLayer[wStart - 1],
        td: channelHds(FOUR_FILAMENTS[fi]),
    }));

    const { affectedCount } = computeColorOptimalAssignments(
        windowRuns, wEnd, layers, colorAtLayer[wStart - 1], windowFilaments, pixels
    );
    const expectedCount = pixels
        .filter((p) => p.layerIdx >= wStart)
        .reduce((s, p) => s + p.count, 0);
    assert.equal(affectedCount, expectedCount);
});

test('computeColorOptimalAssignments — non-null assignments have length equal to windowRuns.length', () => {
    const swatches = gradient(40, 5);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const colorAtLayer = buildColorStack(layers);
    const runs = buildColorRuns(layers);
    const pixels = buildPixelDataColorFirst(
        swatches, layers, colorAtLayer, result.finalStack
    );
    if (runs.length < 3) return;

    const N = 2;
    const windowRuns = runs.slice(1, 1 + N);
    const wStart = windowRuns[0].startLayerIdx;
    const uniqueIndices = [...new Set(windowRuns.map((r) => r.filamentIdx))];
    const windowFilaments: WindowFilament[] = uniqueIndices.map((fi) => ({
        rgb: colorAtLayer[wStart - 1],
        td: channelHds(FOUR_FILAMENTS[fi]),
    }));

    const { assignments } = computeColorOptimalAssignments(
        windowRuns, windowRuns[N - 1].endLayerIdx, layers,
        colorAtLayer[wStart - 1], windowFilaments, pixels
    );
    for (let i = 0; i < assignments.length; i++) {
        const a = assignments[i];
        if (a !== null) {
            assert.equal(a.length, N, `assignments[${i}] has wrong length`);
            for (const slot of a) {
                assert.ok(slot >= 0 && slot < windowFilaments.length,
                    `assignments[${i}] slot ${slot} out of range [0, ${windowFilaments.length})`);
            }
        }
    }
});

test('computeColorOptimalAssignments — pixels outside the window have null assignments', () => {
    const swatches = gradient(40, 5);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const colorAtLayer = buildColorStack(layers);
    const runs = buildColorRuns(layers);
    const pixels = buildPixelDataColorFirst(
        swatches, layers, colorAtLayer, result.finalStack
    );
    if (runs.length < 3) return;

    const N = 2;
    const windowRuns = runs.slice(1, 1 + N);
    const wStart = windowRuns[0].startLayerIdx;
    const uniqueIndices = [...new Set(windowRuns.map((r) => r.filamentIdx))];
    const windowFilaments: WindowFilament[] = uniqueIndices.map((fi) => ({
        rgb: colorAtLayer[wStart - 1],
        td: channelHds(FOUR_FILAMENTS[fi]),
    }));

    const { assignments } = computeColorOptimalAssignments(
        windowRuns, windowRuns[N - 1].endLayerIdx, layers,
        colorAtLayer[wStart - 1], windowFilaments, pixels
    );
    for (let i = 0; i < pixels.length; i++) {
        if (pixels[i].layerIdx < wStart) {
            assert.equal(assignments[i], null,
                `pixel at layerIdx ${pixels[i].layerIdx} (before window start ${wStart}) should have null assignment`);
        }
    }
});

// ---------------------------------------------------------------------------
// optimizeNozzleAssignments — direct unit tests
// ---------------------------------------------------------------------------

test('optimizeNozzleAssignments — returns empty for empty input', () => {
    assert.deepEqual(optimizeNozzleAssignments([], 2), []);
});

test('optimizeNozzleAssignments — output length equals number of windows', () => {
    assert.equal(optimizeNozzleAssignments([['A', 'B'], ['C', 'D'], ['E', 'F']], 2).length, 3);
});

test('optimizeNozzleAssignments — single window assigns every run to exactly one nozzle', () => {
    const result = optimizeNozzleAssignments([['A', 'B']], 2);
    assert.equal(result.length, 1);
    const assgn = result[0];
    assert.equal(assgn.length, 2); // one slot per nozzle
    const active = assgn.filter((r) => r !== -1);
    assert.equal(active.length, 2, 'both nozzles must be active when K = N');
    assert.ok(assgn.includes(0), 'run slot 0 must be assigned');
    assert.ok(assgn.includes(1), 'run slot 1 must be assigned');
});

test('optimizeNozzleAssignments — each run slot appears exactly once per window', () => {
    const windows = [['A', 'B', 'C'], ['D', 'E'], ['F', 'G', 'H']];
    const result = optimizeNozzleAssignments(windows, 3);
    for (let w = 0; w < windows.length; w++) {
        const K = windows[w].length;
        const assigned = result[w].filter((r) => r !== -1);
        assert.equal(new Set(assigned).size, K,
            `window ${w}: each of ${K} run slots must appear exactly once`);
    }
});

test('optimizeNozzleAssignments — slot indices are valid or -1', () => {
    const windows = [['A', 'B'], ['C'], ['D', 'E', 'F']];
    const result = optimizeNozzleAssignments(windows, 3);
    for (let w = 0; w < windows.length; w++) {
        const K = windows[w].length;
        for (const r of result[w]) {
            assert.ok(r === -1 || (r >= 0 && r < K),
                `window ${w}: slot ${r} is out of range [0, ${K})`);
        }
    }
});

test('optimizeNozzleAssignments — repeated identical windows produce zero swaps after window 0', () => {
    // Same two filaments every window — optimal schedule never changes nozzle load.
    const windows = [['A', 'B'], ['A', 'B'], ['A', 'B']];
    const result = optimizeNozzleAssignments(windows, 2);
    // Verify nozzle carry-forward: for windows 1 and 2, each nozzle gets the same
    // run index as window 0 (or remains idle with the same filament), meaning 0 swaps.
    // Since K = N = 2 and filaments repeat, the same injection is optimal every time.
    assert.equal(result[1][0], result[0][0], 'nozzle 1 should keep the same run assignment');
    assert.equal(result[1][1], result[0][1], 'nozzle 2 should keep the same run assignment');
    assert.equal(result[2][0], result[0][0]);
    assert.equal(result[2][1], result[0][1]);
});

test('optimizeNozzleAssignments — K < N windows leave some nozzles idle', () => {
    // Window with only 1 run and N=2 nozzles: exactly one nozzle active, one idle.
    const result = optimizeNozzleAssignments([['A']], 2);
    const assgn = result[0];
    const active = assgn.filter((r) => r !== -1);
    const idle   = assgn.filter((r) => r === -1);
    assert.equal(active.length, 1, 'exactly one nozzle should be active');
    assert.equal(idle.length,   1, 'exactly one nozzle should be idle');
});

// ---------------------------------------------------------------------------
// Color-based grouping (buildColorGroupedPixels) vs. layer collapse
// ---------------------------------------------------------------------------

// Low TD keeps the model short (few printer layers) so the layer-based collapse
// is forced to merge distinct colors, exposing the difference from color mode.
const LOW_BLACK = filament('lb', '#000000', 0.5, 'Black');
const LOW_WHITE = filament('lw', '#ffffff', 0.5, 'White');

// Deterministically produce `n` distinct colors spread across the RGB cube.
function distinctColors(n: number): Array<{ hex: string; count: number }> {
    const out: Array<{ hex: string; count: number }> = [];
    const seen = new Set<string>();
    let i = 0;
    while (out.length < n) {
        const r = (i * 37) % 256;
        const g = (i * 59) % 256;
        const b = (i * 83) % 256;
        const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        if (!seen.has(hex)) {
            seen.add(hex);
            out.push({ hex, count: 1 });
        }
        i++;
    }
    return out;
}

// Build a short printer-layer model + its blended stack for grouping tests.
function shortModel(swatches: Array<{ hex: string; count: number }>) {
    const filaments = [LOW_BLACK, LOW_WHITE];
    const result = generateAutoLayers(filaments, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, filaments, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const colorAtLayer = buildColorStack(layers);
    return { result, layers, colorAtLayer };
}

test('buildColorGroupedPixels — keeps every distinct color when under the cap', () => {
    const colors = distinctColors(60);
    const { result, layers, colorAtLayer } = shortModel(colors);
    const grouped = buildColorGroupedPixels(
        colors, layers, colorAtLayer,
        result.finalStack, COLOR_GROUP_CAP
    );
    // No merges below the cap: one group per distinct color.
    assert.equal(grouped.pixels.length, colors.length);
    // Every input hex is mapped to a valid, in-range group index.
    assert.equal(grouped.hexToGroupIdx.size, colors.length);
    for (const [hex, idx] of grouped.hexToGroupIdx) {
        assert.ok(idx >= 0 && idx < grouped.pixels.length, `group idx for ${hex} out of range`);
    }
});

test('buildColorGroupedPixels — preserves more colors than the layer-based collapse', () => {
    const colors = distinctColors(60);
    const { result, layers, colorAtLayer } = shortModel(colors);
    // Precondition: the short model has fewer layers than we have colors, so the
    // layer-based path is guaranteed to collapse.
    assert.ok(layers.length < colors.length, 'expected a short model for this test');

    const grouped = buildColorGroupedPixels(
        colors, layers, colorAtLayer,
        result.finalStack, COLOR_GROUP_CAP
    );
    const collapsed = buildPixelDataColorFirst(
        colors, layers, colorAtLayer,
        result.finalStack
    );

    assert.ok(collapsed.length <= layers.length, 'layer collapse is bounded by layer count');
    assert.ok(
        grouped.pixels.length > collapsed.length,
        `color grouping (${grouped.pixels.length}) should exceed layer collapse (${collapsed.length})`
    );
});

test('buildColorGroupedPixels — never exceeds the group cap', () => {
    const colors = distinctColors(256);
    const { result, layers, colorAtLayer } = shortModel(colors);
    const grouped = buildColorGroupedPixels(
        colors, layers, colorAtLayer,
        result.finalStack, COLOR_GROUP_CAP
    );
    assert.equal(grouped.pixels.length, COLOR_GROUP_CAP);
    // Every original color still maps to some surviving cluster.
    assert.equal(grouped.hexToGroupIdx.size, colors.length);
    for (const idx of grouped.hexToGroupIdx.values()) {
        assert.ok(idx >= 0 && idx < COLOR_GROUP_CAP);
    }
    const mapped = buildPixelData(colors, layers, colorAtLayer, result.finalStack);
    colors.forEach((swatch, i) => {
        assert.equal(grouped.pixels[grouped.hexToGroupIdx.get(swatch.hex)!].layerIdx, mapped[i].layerIdx);
    });
});

test('buildColorGroupedPixels — deterministic for identical input', () => {
    const colors = distinctColors(120);
    const { result, layers, colorAtLayer } = shortModel(colors);
    const args = [
        colors, layers, colorAtLayer,
        result.finalStack, COLOR_GROUP_CAP,
    ] as const;
    const a = buildColorGroupedPixels(...args);
    const b = buildColorGroupedPixels(...args);
    assert.equal(a.pixels.length, b.pixels.length);
    for (let i = 0; i < a.pixels.length; i++) {
        assert.deepEqual(a.pixels[i].targetRgb, b.pixels[i].targetRgb);
        assert.equal(a.pixels[i].layerIdx, b.pixels[i].layerIdx);
    }
    for (const [hex, idx] of a.hexToGroupIdx) {
        assert.equal(b.hexToGroupIdx.get(hex), idx);
    }
});

test('capped color groups retain member surfaces and ignore layers those members never print', () => {
    const { filaments, result } = multiWindowFixture();
    const swatches = [
        { hex: '#808080', count: 100 },
        { hex: '#080808', count: 99 },
        { hex: '#818181', count: 1 },
    ];
    const stack = {
        ...result.finalStack,
        targetMappings: swatches.map((swatch, i) => ({
            ...result.finalStack.targetMappings[0],
            targetColor: { ...result.finalStack.targetMappings[0].targetColor, hex: swatch.hex },
            projectedHeight: i === 0 ? 0.75 : 0.5,
        })),
    };
    const layers = expandZonesToPrinterLayers(result, filaments, 0.25, 0.25);
    const colors = buildColorStack(layers);
    // Without a layer constraint, the rare #818181 joins the high-frequency
    // #808080 seed on layer 2, although it physically stops on layer 1.
    const grouped = buildColorGroupedPixels(swatches, layers, colors, stack, 2);
    assert.equal(grouped.pixels.length, 2);
    const mapped = buildPixelData(swatches, layers, colors, stack);
    for (let i = 0; i < swatches.length; i++) {
        const group = grouped.pixels[grouped.hexToGroupIdx.get(swatches[i].hex)!];
        assert.equal(group.layerIdx, mapped[i].layerIdx, swatches[i].hex);
        assert.equal(group.actualErr, deltaE(group.targetRgb, colors[group.layerIdx]));
    }
    assert.deepEqual(grouped, buildColorGroupedPixels([...swatches].reverse(), layers, colors, stack, 2));

    const group = grouped.pixels[grouped.hexToGroupIdx.get('#818181')!];
    const windowRuns = [{ filamentIdx: 1, startLayerIdx: 1, endLayerIdx: 1 }];
    const windowFilaments = filaments.map((f, filamentIdx) => ({
        filamentIdx, filamentId: f.id, rgb: hexToRgb(f.color), td: channelHds(f),
    }));
    const score = (candidateLayers: typeof layers) => computeColorOptimalAssignments(
        windowRuns, 1, candidateLayers, colors[0], windowFilaments, [group]
    );
    const changedSuffix = layers.map((layer, i) => i < 2 ? layer : {
        ...layer, filamentIdx: 1, filamentId: filaments[1].id,
        filamentRgb: hexToRgb(filaments[1].color), td: channelHds(filaments[1]),
    });
    assert.deepEqual(score(layers), score(changedSuffix), 'an unprinted suffix cannot change the best order');
});

test('a color-group budget below the occupied layer count never merges physical surfaces', () => {
    const { filaments, swatches, result } = multiWindowFixture();
    const layers = expandZonesToPrinterLayers(result, filaments, 0.25, 0.25);
    const grouped = buildColorGroupedPixels(swatches, layers, buildColorStack(layers), result.finalStack, 2);
    assert.equal(grouped.pixels.length, 5, 'reserve one group per occupied layer');
    assert.deepEqual(grouped.pixels.map((pixel) => pixel.layerIdx).sort(), [0, 1, 2, 3, 4]);
});

test('runMultiHeadLayerAnalysisColorFirst — color mode produces a valid, complete result', () => {
    // Non-regression for the color-mode pipeline path. NOTE: color mode is *not*
    // guaranteed to yield more distinct printed colors than luminance mode — the
    // visible-color count is dominated by how many windows the optimizer opens
    // (the head/swap budget), not just the group count, so the benefit is
    // config-dependent. This test asserts the color-mode path runs end to end
    // and returns structurally consistent output, whether or not the analysis
    // finds an improving window. The strong grouping claim is covered by the
    // buildColorGroupedPixels tests above.
    //
    // Realistic per-channel hiding distances (~0.3 mm, consumed directly via
    // channelHds — no second ×0.1 scale) with a mixed grey + saturated palette:
    // enough opacity per layer that reordering a window measurably helps.
    const filaments = [
        filament('lf0', '#101010', 0.3, 'VeryDark'),
        filament('lf1', '#606060', 0.3, 'Dark'),
        filament('lf2', '#b0b0b0', 0.3, 'Light'),
        filament('lf3', '#f0f0f0', 0.3, 'VeryLight'),
        filament('lf4', '#c02020', 0.3, 'Red'),
        filament('lf5', '#2040c0', 0.3, 'Blue'),
    ];
    const grey = gradient(12).map((s) => ({ hex: s.hex, count: 1 }));
    const hues = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8000', '#8000ff']
        .map((hex) => ({ hex, count: 1 }));
    const colors = [...grey, ...hues];
    const knownHexes = new Set(colors.map((c) => c.hex));
    const result = generateAutoLayers(filaments, colors, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);

    const col = runMultiHeadLayerAnalysisColorFirst(
        filaments, result, colors, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 3, 'balanced', 'color'
    );

    // One colorAssignments map per window.
    assert.equal(col.colorAssignments.length, col.windows.length);

    if (col.patchedLayers.length === 0) {
        // A no-op result is a valid outcome — no window improved on the base
        // stack. Everything downstream must be able to treat it as "not a
        // multi-head build", so the whole result must be consistently empty.
        assert.equal(col.windows.length, 0);
        assert.equal(col.colorLayerFilaments.size, 0);
        assert.equal(col.nozzleAssignments.length, 0);
        return;
    }

    // Non-empty result: every color path is keyed by a real image hex and has
    // one in-range filament index per printer layer.
    assert.ok(col.windows.length > 0);
    for (const [hex, seq] of col.colorLayerFilaments) {
        assert.ok(knownHexes.has(hex), `unexpected hex ${hex}`);
        assert.equal(seq.length, col.patchedLayers.length);
        for (const idx of seq) {
            assert.ok(idx >= 0 && idx < filaments.length, `filament idx ${idx} out of range`);
        }
    }
});

// ---------------------------------------------------------------------------
// Search-depth combo budget (deterministic sampling) + head-count cap
// ---------------------------------------------------------------------------

/** Set up a real non-foundation window from the FOUR_FILAMENTS gradient fixture. */
function windowSetup() {
    const swatches = gradient(40, 5);
    const result = generateAutoLayers(FOUR_FILAMENTS, swatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const layers = expandZonesToPrinterLayers(result, FOUR_FILAMENTS, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const colorAtLayer = buildColorStack(layers);
    const runs = buildColorRuns(layers);
    const pixels = buildPixelDataColorFirst(
        swatches, layers, colorAtLayer, result.finalStack
    );
    const N = 3;
    const windowRuns = runs.slice(1, 1 + N);
    const uniqueIndices = [...new Set(windowRuns.map((r) => r.filamentIdx))];
    const windowFilaments: WindowFilament[] = uniqueIndices.map((fi) => ({
        filamentIdx: fi,
        filamentId: FOUR_FILAMENTS[fi].id,
        rgb: hexToRgb(FOUR_FILAMENTS[fi].color),
        td: channelHds(FOUR_FILAMENTS[fi]),
    }));
    const currentEntry = windowRuns.map((r) => uniqueIndices.indexOf(r.filamentIdx));
    return {
        windowRuns,
        wEnd: windowRuns[N - 1].endLayerIdx,
        layers,
        base: colorAtLayer[windowRuns[0].startLayerIdx - 1],
        windowFilaments,
        pixels,
        currentEntry,
        ok: runs.length >= 1 + N && uniqueIndices.length >= 2,
    };
}

test('computeColorOptimalAssignments — a small combo budget forces deterministic sampling', () => {
    const s = windowSetup();
    if (!s.ok) return;

    const call = () => computeColorOptimalAssignments(
        s.windowRuns, s.wEnd, s.layers, s.base, s.windowFilaments, s.pixels, 3, s.currentEntry
    );
    const a = call();
    const b = call();
    assert.equal(a.errorFactor, b.errorFactor);
    assert.deepEqual(a.assignments, b.assignments);
});

test('computeColorOptimalAssignments — budget ≥ K^N matches the exhaustive scan', () => {
    const s = windowSetup();
    if (!s.ok) return;
    const exhaustive = computeColorOptimalAssignments(
        s.windowRuns, s.wEnd, s.layers, s.base, s.windowFilaments, s.pixels, Infinity, s.currentEntry
    );
    const budgeted = computeColorOptimalAssignments(
        s.windowRuns, s.wEnd, s.layers, s.base, s.windowFilaments, s.pixels, 1_000_000, s.currentEntry
    );
    assert.equal(budgeted.errorFactor, exhaustive.errorFactor);
    assert.deepEqual(budgeted.assignments, exhaustive.assignments);
});

test('computeColorOptimalAssignments — an extreme budget of 1 still returns a valid, stable result', () => {
    const s = windowSetup();
    if (!s.ok) return;
    const call = () => computeColorOptimalAssignments(
        s.windowRuns, s.wEnd, s.layers, s.base, s.windowFilaments, s.pixels, 1, s.currentEntry
    );
    const a = call();
    const b = call();
    assert.ok(Number.isFinite(a.errorFactor), 'errorFactor must be finite (no NaN from budget math)');
    assert.equal(a.errorFactor, b.errorFactor);
    for (const entry of a.assignments) {
        if (entry === null) continue;
        assert.equal(entry.length, s.windowRuns.length);
        for (const slot of entry) {
            assert.ok(slot >= 0 && slot < s.windowFilaments.length);
        }
    }
});

test('findConsensusCombo path — same searchDepth run twice yields identical stacks', () => {
    // 10 filaments + a varied palette so windows form and K^N can exceed the
    // Fast combo budget, exercising the deterministic sampler end to end.
    const filaments = [
        filament('d0', '#101010', 0.3, 'd0'), filament('d1', '#383838', 0.3, 'd1'),
        filament('d2', '#606060', 0.3, 'd2'), filament('d3', '#909090', 0.3, 'd3'),
        filament('d4', '#c0c0c0', 0.3, 'd4'), filament('d5', '#ececec', 0.3, 'd5'),
        filament('d6', '#c41f1f', 0.3, 'd6'), filament('d7', '#1f4bc4', 0.3, 'd7'),
        filament('d8', '#1fa33f', 0.3, 'd8'), filament('d9', '#c9a41f', 0.3, 'd9'),
    ];
    const colors = [
        ...gradient(18).map((s) => ({ hex: s.hex, count: 1 })),
        ...['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'].map((hex) => ({ hex, count: 1 })),
    ];
    const result = generateAutoLayers(filaments, colors, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const run = () => runMultiHeadLayerAnalysisColorFirst(
        filaments, result, colors, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 8, 'fast', 'color'
    );
    const a = run();
    const b = run();
    assert.equal(a.patchedLayers.length, b.patchedLayers.length);
    for (let i = 0; i < a.patchedLayers.length; i++) {
        assert.equal(a.patchedLayers[i].filamentIdx, b.patchedLayers[i].filamentIdx);
    }
    assert.deepEqual(a.nozzleAssignments, b.nozzleAssignments);
    assert.deepEqual(
        [...a.colorLayerFilaments.entries()].sort(),
        [...b.colorLayerFilaments.entries()].sort()
    );
});

test('computeColorOptimalAssignments — sampling never beats the exhaustive optimum', () => {
    const s = windowSetup();
    if (!s.ok) return;
    const exhaustive = computeColorOptimalAssignments(
        s.windowRuns, s.wEnd, s.layers, s.base, s.windowFilaments, s.pixels
    ).errorFactor;
    const sampled = computeColorOptimalAssignments(
        s.windowRuns, s.wEnd, s.layers, s.base, s.windowFilaments, s.pixels, 2, s.currentEntry
    ).errorFactor;
    assert.ok(sampled <= exhaustive + 1e-9, `sampled ${sampled} > exhaustive ${exhaustive}`);
});

test('runMultiHeadLayerAnalysisColorFirst — head count clamped to MAX_MULTI_HEAD_HEADS', () => {
    assert.equal(MAX_MULTI_HEAD_HEADS, 8);
    // Ten distinct filaments so a request above the cap has room to be clamped.
    const filaments = [
        filament('c0', '#101010', 0.3, 'c0'), filament('c1', '#383838', 0.3, 'c1'),
        filament('c2', '#606060', 0.3, 'c2'), filament('c3', '#888888', 0.3, 'c3'),
        filament('c4', '#b0b0b0', 0.3, 'c4'), filament('c5', '#e0e0e0', 0.3, 'c5'),
        filament('c6', '#b81c1c', 0.3, 'c6'), filament('c7', '#1c46b8', 0.3, 'c7'),
        filament('c8', '#1c9a3c', 0.3, 'c8'), filament('c9', '#c8a41c', 0.3, 'c9'),
    ];
    const colors = [
        ...gradient(14).map((s) => ({ hex: s.hex, count: 1 })),
        ...['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'].map((hex) => ({ hex, count: 1 })),
    ];
    const result = generateAutoLayers(filaments, colors, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);

    const atCap = runMultiHeadLayerAnalysisColorFirst(
        filaments, result, colors, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, MAX_MULTI_HEAD_HEADS, 'balanced'
    );
    const overCap = runMultiHeadLayerAnalysisColorFirst(
        filaments, result, colors, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 999, 'balanced'
    );
    assert.equal(overCap.windows.length, atCap.windows.length);
    assert.equal(overCap.patchedLayers.length, atCap.patchedLayers.length);
    assert.deepEqual(
        [...overCap.colorLayerFilaments.entries()].sort(),
        [...atCap.colorLayerFilaments.entries()].sort()
    );
    for (const w of atCap.windows) {
        assert.ok(w.filamentIds.length <= MAX_MULTI_HEAD_HEADS);
    }
});

/** Five single-layer runs, with one swatch explicitly mapped to each surface. */
function multiWindowFixture() {
    const filaments = [filament('dark', '#363636', 0.66), filament('light', '#e8e8e8', 1.1)];
    const swatches = ['#0b0b0b', '#2e2e2e', '#7d7d7d', '#ababab', '#c2c2c2']
        .map((hex) => ({ hex, count: 1 }));
    const seed = generateAutoLayers(filaments, swatches, 0.25, 0.25);
    const sequence = [0, 1, 0, 1, 0];
    const zones = sequence.map((fi, i) => ({
        filamentId: filaments[fi].id, filamentColor: filaments[fi].color,
        filamentTd: filaments[fi].td,
        startHeight: i * 0.25, endHeight: (i + 1) * 0.25,
        idealThickness: 0.25, actualThickness: 0.25,
    }));
    const result: AutoPaintResult = {
        ...seed, totalHeight: 1.25, transitionZones: zones,
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
    return { filaments, swatches, result };
}

test('color-first groups follow final-stack mappings, including weighted centroids', () => {
    const { filaments, swatches, result } = multiWindowFixture();
    const layers = expandZonesToPrinterLayers(result, filaments, 0.25, 0.25);
    const colors = buildColorStack(layers);
    const groups = buildPixelDataColorFirst(swatches, layers, colors, result.finalStack);
    assert.deepEqual(groups.map((group) => group.layerIdx), [0, 1, 2, 3, 4]);
    assert.equal(groups[3].targetRgb.r, 171);

    const merged = buildPixelDataColorFirst([
        { hex: '#7d7d7d', count: 3 }, { hex: '#ababab', count: 1 },
    ], layers, colors, {
        ...result.finalStack,
        targetMappings: result.finalStack.targetMappings.map((mapping) => ({
            ...mapping, projectedHeight: 0.75,
        })),
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].layerIdx, 2);
    assert.equal(merged[0].count, 4);
    assert.equal(merged[0].targetRgb.r, (125 * 3 + 171) / 4);

    const grouped = buildColorGroupedPixels(swatches, layers, colors, {
        ...result.finalStack,
        targetMappings: result.finalStack.targetMappings.map((mapping) => ({
            ...mapping, projectedHeight: 0.75,
        })),
    }, COLOR_GROUP_CAP);
    assert.equal(grouped.pixels.length, swatches.length, 'color grouping retains separate targets');
    for (const swatch of swatches) {
        const pixel = grouped.pixels[grouped.hexToGroupIdx.get(swatch.hex)!];
        assert.equal(pixel.layerIdx, 2, 'color grouping honors the final mapped surface');
        assert.deepEqual(pixel.targetRgb, hexToRgb(swatch.hex));
        assert.equal(pixel.actualErr, deltaE(pixel.targetRgb, colors[2]));
    }
});

test('run-based candidates preserve fitted optics, merged runs, and changed suffix substrates', () => {
    const filaments = [
        filament('base', '#101010', 0.4), filament('grey', '#777777', 0.7),
        filament('white', '#ffffff', 1.2),
    ];
    const prior = createPriorEffectiveOpticsModel(filaments);
    const model: AppearanceEffectiveOpticsModelV1 = {
        ...prior, applied: true, gateReason: 'applied',
        filaments: prior.filaments.map((entry) => ({
            ...entry, effectiveOpaqueColor: entry.filamentId === 'white' ? [235, 240, 245] : entry.effectiveOpaqueColor,
            transmissionExponent: 1.3,
        })),
        substrateInteractions: [{
            foregroundFilamentId: 'white', substrateFilamentId: 'grey', hdMultiplier: 1.7,
            sampleCount: 20, maxObservedThickness: 0.25,
        }],
    };
    const sequence = [0, 1, 1, 2, 2, 1, 1];
    const layers = sequence.map((fi, i) => ({
        filamentIdx: fi, filamentId: filaments[fi].id,
        filamentRgb: hexToRgb(filaments[fi].color), td: channelHds(filaments[fi]),
        startZ: i * 0.25, thickness: 0.25,
    }));
    const windowRuns = buildColorRuns(layers).slice(1, 3);
    const windowFilaments = [1, 2].map((fi) => ({
        filamentIdx: fi, filamentId: filaments[fi].id,
        rgb: hexToRgb(filaments[fi].color), td: channelHds(filaments[fi]),
    }));
    for (const surface of [1, 2, 4, 6]) {
        const predictions = Array.from({ length: 4 }, (_, combo) => {
            const rgb = predictEffectiveAutoPaintColor(model, layers.slice(0, surface + 1).map((layer, i) => {
                const slot = windowRuns.findIndex((run) => i >= run.startLayerIdx && i <= run.endLayerIdx);
                return {
                    filamentId: slot === -1 ? layer.filamentId : windowFilaments[(combo >> slot) & 1].filamentId,
                    thickness: layer.thickness,
                };
            }))!;
            return { r: rgb[0], g: rgb[1], b: rgb[2] };
        });
        const pixels = predictions.map((targetRgb) => ({ targetRgb, layerIdx: surface, actualErr: 100, count: 1 }));
        const analysis = computeColorOptimalAssignments(
            windowRuns, 4, layers, layers[0].filamentRgb, windowFilaments, pixels, Infinity, undefined, model
        );
        for (let p = 0; p < pixels.length; p++) {
            const slots = analysis.assignments[p]!;
            const selected = slots[0] + slots[1] * 2;
            const errors = predictions.map((color) => deltaE(pixels[p].targetRgb, color));
            assert.ok(Math.abs(errors[selected] - Math.min(...errors)) < 1e-8,
                `surface ${surface}, target ${p}: run optics differ from the shared predictor`);
        }
        assert.ok(Math.abs(analysis.errorFactor - 400) < 1e-8);
    }
});

test('multiple windows use each color\'s realized prefix and suffix', () => {
    const { filaments, swatches, result } = multiWindowFixture();
    const original = expandZonesToPrinterLayers(result, filaments, 0.25, 0.25);
    const baseline = buildColorStack(original);
    const model = createPriorEffectiveOpticsModel(filaments);
    for (const [depth, mode] of [
        ['balanced', 'luminance'], ['thorough', 'luminance'],
        ['balanced', 'color'], ['thorough', 'color'],
    ] as const) {
        const analysis = runMultiHeadLayerAnalysisColorFirst(filaments, result, swatches, 0.25, 0.25, 2, depth, mode);
        assert.deepEqual(analysis.windows.map((w) => [w.windowStart, w.windowEnd]).sort(), [[1, 2], [3, 4]]);
        const pixels = buildPixelData(swatches, original, baseline, result.finalStack);
        const error = (seq: number[], px: typeof pixels[number]) => {
            const rgb = predictEffectiveAutoPaintColor(model, seq.slice(0, px.layerIdx + 1).map((fi, i) => ({
                filamentId: filaments[fi].id, thickness: original[i].thickness,
            })))!;
            return deltaE(px.targetRgb, { r: rgb[0], g: rgb[1], b: rgb[2] });
        };
        for (let p = 0; p < swatches.length; p++) {
            const hex = swatches[p].hex;
            const seq = analysis.colorLayerFilaments.get(hex)!;
            const actual = error(seq, pixels[p]);
            assert.ok(actual <= pixels[p].actualErr + 1e-8, `${hex} worsened from the original stack`);
            for (let wi = 0; wi < analysis.windows.length; wi++) {
                const w = analysis.windows[wi];
                if (pixels[p].layerIdx < w.windowStart) {
                    assert.equal(analysis.colorAssignments[wi].has(hex), false);
                    continue;
                }
                const slots = analysis.colorAssignments[wi].get(hex)!;
                for (let r = 0; r < slots.length; r++) {
                    assert.equal(filaments[seq[w.windowStart + r]].id, w.filamentIds[slots[r]]);
                }
                // Independently try every assignment in either selected window,
                // keeping this color's realized prefix and suffix fixed.
                for (let combo = 0; combo < 4; combo++) {
                    const candidate = seq.slice();
                    for (let r = 0; r < 2; r++) {
                        const id = w.filamentIds[(combo >> r) & 1];
                        candidate[w.windowStart + r] = filaments.findIndex((f) => f.id === id);
                    }
                    assert.ok(actual <= error(candidate, pixels[p]) + 1e-8,
                        `${hex}: window ${w.windowStart} can improve the returned stack`);
                }
            }
        }
    }
});

function nozzleSwapCount(windows: string[][], assignments: number[][]): number {
    let state = new Array<string>(assignments[0].length).fill('');
    let cost = 0;
    for (let w = 0; w < windows.length; w++) {
        const next = assignments[w].map((r, k) => r === -1 ? state[k] : windows[w][r]);
        if (w > 0) cost += next.filter((id, k) => id !== state[k]).length;
        state = next;
    }
    return cost;
}

/** Exhaustive oracle on small inputs, including all labeled nozzle injections. */
function exhaustiveNozzleCost(windows: string[][], N: number): number {
    const memo = new Map<string, number>();
    function visit(w: number, state: string[]): number {
        if (w === windows.length) return 0;
        const key = JSON.stringify([w, state]);
        if (memo.has(key)) return memo.get(key)!;
        let best = Infinity;
        const used = new Set<number>();
        function assign(r: number, next: string[]): void {
            if (r === windows[w].length) {
                const swaps = w === 0 ? 0 : next.filter((id, k) => id !== state[k]).length;
                best = Math.min(best, swaps + visit(w + 1, next));
                return;
            }
            for (let k = 0; k < N; k++) {
                if (used.has(k)) continue;
                used.add(k);
                const candidate = next.slice();
                candidate[k] = windows[w][r];
                assign(r + 1, candidate);
                used.delete(k);
            }
        }
        assign(0, state.slice());
        memo.set(key, best);
        return best;
    }
    return visit(0, new Array<string>(N).fill(''));
}

test('nozzle scheduling matches exhaustive optima across full and idle events', (t) => {
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'group', () => {});
    t.mock.method(console, 'groupEnd', () => {});
    const events = [[], ['A'], ['B'], ['C'], ['A', 'B'], ['A', 'C'], ['B', 'C']];
    for (let code = 0; code < events.length ** 4; code++) {
        let digits = code;
        const windows = Array.from({ length: 4 }, () => {
            const event = events[digits % events.length];
            digits = Math.floor(digits / events.length);
            return event;
        });
        assert.equal(nozzleSwapCount(windows, optimizeNozzleAssignments(windows, 2)),
            exhaustiveNozzleCost(windows, 2), JSON.stringify(windows));
    }
    const windows = [['A', 'B', 'C'], ['D'], ['B', 'E'], [], ['A', 'B', 'E']];
    assert.equal(nozzleSwapCount(windows, optimizeNozzleAssignments(windows, 3)),
        exhaustiveNozzleCost(windows, 3));
});

test('consecutive full-head windows at the eight-head cap finish without permutations', (t) => {
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'group', () => {});
    t.mock.method(console, 'groupEnd', () => {});
    const full = Array.from({ length: MAX_MULTI_HEAD_HEADS }, (_, i) => `f${i}`);
    const windows = [full, full, [...full].reverse(), [...full.slice(1), 'new']];
    const start = performance.now();
    const assignments = optimizeNozzleAssignments(windows, MAX_MULTI_HEAD_HEADS);
    assert.ok(performance.now() - start < 1000, 'eight-head scheduling must remain bounded');
    assert.equal(nozzleSwapCount(windows, assignments), 1);
    assert.deepEqual(assignments, optimizeNozzleAssignments(windows, MAX_MULTI_HEAD_HEADS));
    for (const assignment of assignments) {
        assert.deepEqual([...assignment].sort((a, b) => a - b), full.map((_, i) => i));
    }
});
