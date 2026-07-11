import assert from 'node:assert/strict';
import test from 'node:test';
import { generateAutoLayers } from '../src/lib/autoPaint.ts';
import {
    analyzeMultiHeadWindows,
    selectBestWindows,
    buildLUT,
    buildColorStack,
    runMultiHeadLayerAnalysis,
    type WindowResult,
    type PrinterLayer,
} from '../src/lib/multiHeadAnalysis.ts';
import type { Filament } from '../src/types/index.ts';

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
    const result = buildResult([BLACK, WHITE], SWATCHES_GREY);
    const selected = runMultiHeadLayerAnalysis(
        [BLACK, WHITE], result, SWATCHES_GREY, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 2
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
