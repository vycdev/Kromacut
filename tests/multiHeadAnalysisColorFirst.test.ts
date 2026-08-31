import assert from 'node:assert/strict';
import test from 'node:test';
import { generateAutoLayers, hexToRgb } from '../src/lib/autoPaint.ts';
import {
    buildColorStack,
    expandZonesToPrinterLayers,
} from '../src/lib/multiHeadAnalysis.ts';
import {
    buildPixelDataColorFirst,
    buildColorGroupedPixels,
    buildColorRuns,
    analyzeMultiHeadWindowsColorFirst,
    computeColorOptimalAssignments,
    optimizeNozzleAssignments,
    runMultiHeadLayerAnalysisColorFirst,
    COLOR_GROUP_CAP,
} from '../src/lib/multiHeadAnalysisColorFirst.ts';
import type { WindowFilament } from '../src/lib/multiHeadAnalysis.ts';
import { channelHds } from '../src/lib/calibration.ts';
import type { Filament } from '../src/types/index.ts';

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
        result.transitionZones, result.totalHeight, FIRST_LAYER_HEIGHT
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
        result.transitionZones, result.totalHeight, FIRST_LAYER_HEIGHT
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
        result.transitionZones, result.totalHeight, FIRST_LAYER_HEIGHT
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
        swatches, layers, colorAtLayer, result.transitionZones, result.totalHeight, FIRST_LAYER_HEIGHT
    );
    if (runs.length < 3) return; // need at least 3 runs to pick a non-foundation window

    const N = 2;
    const windowRuns = runs.slice(1, 1 + N); // skip run 0 (foundation)
    const wEnd = windowRuns[N - 1].endLayerIdx;
    const uniqueIndices = [...new Set(windowRuns.map((r) => r.filamentIdx))];
    const windowFilaments: WindowFilament[] = uniqueIndices.map((fi) => ({
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
        swatches, layers, colorAtLayer, result.transitionZones, result.totalHeight, FIRST_LAYER_HEIGHT
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
        swatches, layers, colorAtLayer, result.transitionZones, result.totalHeight, FIRST_LAYER_HEIGHT
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
        swatches, layers, colorAtLayer, result.transitionZones, result.totalHeight, FIRST_LAYER_HEIGHT
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
        result.transitionZones, result.totalHeight, FIRST_LAYER_HEIGHT, COLOR_GROUP_CAP
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
        result.transitionZones, result.totalHeight, FIRST_LAYER_HEIGHT, COLOR_GROUP_CAP
    );
    const collapsed = buildPixelDataColorFirst(
        colors, layers, colorAtLayer,
        result.transitionZones, result.totalHeight, FIRST_LAYER_HEIGHT
    );

    assert.ok(collapsed.length <= layers.length, 'layer collapse is bounded by layer count');
    assert.ok(
        grouped.pixels.length > collapsed.length,
        `color grouping (${grouped.pixels.length}) should exceed layer collapse (${collapsed.length})`
    );
});

test('buildColorGroupedPixels — never exceeds the group cap', () => {
    const colors = distinctColors(COLOR_GROUP_CAP + 30);
    const { result, layers, colorAtLayer } = shortModel(colors);
    const grouped = buildColorGroupedPixels(
        colors, layers, colorAtLayer,
        result.transitionZones, result.totalHeight, FIRST_LAYER_HEIGHT, COLOR_GROUP_CAP
    );
    assert.equal(grouped.pixels.length, COLOR_GROUP_CAP);
    // Every original color still maps to some surviving cluster.
    assert.equal(grouped.hexToGroupIdx.size, colors.length);
    for (const idx of grouped.hexToGroupIdx.values()) {
        assert.ok(idx >= 0 && idx < COLOR_GROUP_CAP);
    }
});

test('buildColorGroupedPixels — deterministic for identical input', () => {
    const colors = distinctColors(120);
    const { result, layers, colorAtLayer } = shortModel(colors);
    const args = [
        colors, layers, colorAtLayer,
        result.transitionZones, result.totalHeight, FIRST_LAYER_HEIGHT, COLOR_GROUP_CAP,
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
