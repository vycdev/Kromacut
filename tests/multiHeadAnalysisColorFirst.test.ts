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
    buildColorRuns,
    analyzeMultiHeadWindowsColorFirst,
    computeColorOptimalAssignments,
    optimizeNozzleAssignments,
    runMultiHeadLayerAnalysisColorFirst,
    MAX_MULTI_HEAD_HEADS,
    windowComboIndices,
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

test('windowComboIndices — stays exhaustive at or below the budget', () => {
    const seen = [...windowComboIndices(3, 4, 81, [2, 0, 1, 1])];
    assert.equal(seen.length, 81);
    assert.equal(new Set(seen).size, 81);
});

test('windowComboIndices — sampled windows keep every change within one short block of runs', () => {
    // Seven runs and seven filaments exceed the Balanced budget, so the scan
    // samples. It must still try every order a four-run window could choose
    // there, or more heads can miss what fewer heads find.
    const K = 7;
    const N = 7;
    const budget = 65536;
    const current = [3, 1, 4, 1, 5, 2, 6];
    const yielded = [...windowComboIndices(K, N, budget, current)];
    assert.equal(yielded.length, budget + 1, 'sampling must not evaluate more than the budget allows');
    const seen = new Set(yielded);
    const index = (entry: number[]) => entry.reduce((sum, digit, j) => sum + digit * K ** j, 0);
    assert.equal(yielded[0], index(current));
    for (let p = 0; p + 4 <= N; p++) {
        for (let v = 0; v < K ** 4; v++) {
            const entry = current.slice();
            for (let t = 0, rest = v; t < 4; t++, rest = Math.floor(rest / K)) entry[p + t] = rest % K;
            assert.ok(seen.has(index(entry)), `missing ${entry.join(',')}`);
        }
    }
});

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
        filaments, result, colors, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 8, 'fast'
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

/** Single-layer runs (five by default), with one swatch explicitly mapped to each surface. */
function multiWindowFixture(
    filaments = [filament('dark', '#363636', 0.66), filament('light', '#e8e8e8', 1.1)],
    sequence = [0, 1, 0, 1, 0],
    hexes = ['#0b0b0b', '#2e2e2e', '#7d7d7d', '#ababab', '#c2c2c2']
) {
    const swatches = hexes.map((hex) => ({ hex, count: 1 }));
    const seed = generateAutoLayers(filaments, swatches, 0.25, 0.25);
    const totalHeight = sequence.length * 0.25;
    const zones = sequence.map((fi, i) => ({
        filamentId: filaments[fi].id, filamentColor: filaments[fi].color,
        filamentTd: filaments[fi].td,
        startHeight: i * 0.25, endHeight: (i + 1) * 0.25,
        idealThickness: 0.25, actualThickness: 0.25,
    }));
    const result: AutoPaintResult = {
        ...seed, totalHeight, transitionZones: zones,
        finalStack: {
            ...seed.finalStack, totalHeight,
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

test('more heads than runs above the foundation still search every run', () => {
    // Four filaments, but only three runs above the foundation: a four-run
    // window could only start on the foundation, which is never searched.
    const filaments = [
        filament('dark', '#363636', 0.66), filament('light', '#e8e8e8', 1.1),
        filament('red', '#b81c1c', 0.3), filament('blue', '#1c46b8', 0.3),
    ];
    const { swatches, result } = multiWindowFixture(
        filaments, [0, 1, 0, 1], ['#0b0b0b', '#2e2e2e', '#7d7d7d', '#ababab']
    );
    const fitting = runMultiHeadLayerAnalysisColorFirst(filaments, result, swatches, 0.25, 0.25, 3);
    const extra = runMultiHeadLayerAnalysisColorFirst(filaments, result, swatches, 0.25, 0.25, 4);
    assert.ok(fitting.windows.length > 0, 'fixture should find an improving window with three heads');
    // The spare head adds no run to reorder, so the routed stack matches three heads.
    assert.deepEqual(
        extra.windows.map((w) => [w.windowStart, w.windowEnd]),
        fitting.windows.map((w) => [w.windowStart, w.windowEnd])
    );
    assert.deepEqual(extra.patchedLayers, fitting.patchedLayers);
    assert.deepEqual(extra.colorLayerFilaments, fitting.colorLayerFilaments);
    // Windows are still scheduled across all four selected heads; the spare one stays idle.
    for (const heads of extra.nozzleAssignments) {
        assert.equal(heads.length, 4);
        assert.ok(heads.includes(-1), `expected an idle head in ${JSON.stringify(heads)}`);
    }
});

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
    for (const depth of ['balanced', 'thorough'] as const) {
        const analysis = runMultiHeadLayerAnalysisColorFirst(filaments, result, swatches, 0.25, 0.25, 2, depth);
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
