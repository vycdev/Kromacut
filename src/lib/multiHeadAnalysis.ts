/**
 * Multi-head layer selection analysis.
 *
 * Slides a window of N consecutive printer layers across the stack and, for each
 * window, builds a LUT of all K^N filament-to-position assignments (K = unique
 * filaments in that window). For every image swatch the per-pixel optimal LUT
 * entry is found via full Beer-Lambert simulation. The errorFactor for a window
 * is the sum of per-pixel improvements achievable by reordering its layers.
 *
 * Primary lookup chain for renderers / 3MF builders:
 *   filamentIds[ lut[ pixelOptimalLUTIdx[p] ][n] ]
 *   → the ID of the filament that gives pixel p its best color at window layer n.
 */

import type { AutoPaintResult } from './autoPaint.ts';
import type { Filament } from '../types';
import {
    hexToRgb,
    blendColors,
    deltaE,
    getLuminance,
    type RGB,
} from './autoPaint.ts';

const FRONTLIT_TD_SCALE = 0.1;

export interface PrinterLayer {
    /** Index into the original filaments array */
    filamentIdx: number;
    filamentRgb: RGB;
    /** TD already multiplied by FRONTLIT_TD_SCALE */
    td: number;
    thickness: number;
    startZ: number;
}

export interface WindowFilament {
    rgb: RGB;
    /** TD already multiplied by FRONTLIT_TD_SCALE */
    td: number;
}

export interface PixelData {
    targetRgb: RGB;
    /** Index of the printer layer this swatch maps to. */
    layerIdx: number;
    /** ΔE between target and actual stack color at layerIdx. */
    actualErr: number;
}

/** Per-window output from the sliding-window analysis. */
export interface WindowResult {
    /** Index of the first layer in the window (1-based; layer 0 is the opaque foundation). */
    windowStart: number;
    /** Index of the last layer in the window (inclusive). */
    windowEnd: number;
    windowBottomZ: number;
    windowTopZ: number;
    /**
     * Display names of the K unique filaments in this window, in LUT index order.
     * `currentFilaments[lut[entry][n]]` gives the name of the filament at position n
     * for a given LUT entry.
     */
    currentFilaments: string[];
    /**
     * IDs of the K unique filaments in this window, in LUT index order.
     * Full renderer lookup: `filamentIds[lut[pixelOptimalLUTIdx[p]][n]]`
     * gives the filament ID that minimises error for pixel p at window layer n.
     */
    filamentIds: string[];
    /** Number of palette swatches whose mapped height reaches this window. */
    affectedSwatches: number;
    /** Sum of (actualΔE − minPossibleΔE) across affected swatches. Always ≥ 0. */
    errorFactor: number;
    /** All K^N filament assignments for this window (K = unique filaments in window). */
    lut: number[][];
    /**
     * Per-swatch best LUT entry index (length = imageSwatches.length passed to analysis).
     * -1 for swatches whose mapped height falls below this window.
     * Use as: lut[pixelOptimalLUTIdx[p]][n] → index into filamentIds / currentFilaments.
     */
    pixelOptimalLUTIdx: number[];
}

/** Expand transition zones into individual printer-layer entries. */
export function expandZonesToPrinterLayers(
    result: AutoPaintResult,
    filaments: Filament[],
    layerHeight: number,
    firstLayerHeight: number
): PrinterLayer[] {
    const layers: PrinterLayer[] = [];
    const { transitionZones: zones, totalHeight } = result;
    if (zones.length === 0 || totalHeight <= 0) return layers;

    let currentZ = 0;
    let layerIndex = 0;

    while (currentZ < totalHeight) {
        const thickness =
            layerIndex === 0 ? Math.max(firstLayerHeight, layerHeight) : layerHeight;

        let activeZoneIdx = 0;
        for (let zi = 0; zi < zones.length; zi++) {
            if (currentZ >= zones[zi].startHeight) activeZoneIdx = zi;
        }

        const zone = zones[activeZoneIdx];
        const filamentIdx = filaments.findIndex((f) => f.id === zone.filamentId);
        const filament = filamentIdx >= 0 ? filaments[filamentIdx] : filaments[0];

        layers.push({
            filamentIdx: Math.max(0, filamentIdx),
            filamentRgb: hexToRgb(zone.filamentColor),
            td: filament.td * FRONTLIT_TD_SCALE,
            thickness,
            startZ: currentZ,
        });

        currentZ += thickness;
        layerIndex++;
        if (layerIndex > 500) break;
    }

    return layers;
}

/**
 * Generate all filamentCount^windowSize filament-index assignments.
 * Each entry assigns one of `filamentCount` filaments to each of
 * `windowSize` window positions, reading the digits of i in base filamentCount.
 *
 * The returned LUT is deterministic and can be reconstructed from the same inputs,
 * so callers may store only the index rather than the full entry when space matters.
 */
export function buildLUT(windowSize: number, filamentCount: number): number[][] {
    const total = Math.pow(filamentCount, windowSize);
    const lut: number[][] = new Array(total);
    for (let i = 0; i < total; i++) {
        const entry = new Array(windowSize);
        let v = i;
        for (let j = 0; j < windowSize; j++) {
            entry[j] = v % filamentCount;
            v = Math.floor(v / filamentCount);
        }
        lut[i] = entry;
    }
    return lut;
}

/** Return the index of the last printer layer whose startZ ≤ h. */
export function findLayerIdxAtHeight(layers: PrinterLayer[], h: number): number {
    let idx = 0;
    for (let i = 0; i < layers.length; i++) {
        if (layers[i].startZ <= h) idx = i;
        else break;
    }
    return idx;
}

/**
 * Accumulate the Beer-Lambert stack color at each printer layer.
 * Layer 0 is the opaque foundation (raw filament color); each subsequent
 * layer blends its filament on top of the running total.
 */
export function buildColorStack(layers: PrinterLayer[]): RGB[] {
    const colorAtLayer: RGB[] = new Array(layers.length);
    colorAtLayer[0] = { ...layers[0].filamentRgb };
    for (let i = 1; i < layers.length; i++) {
        colorAtLayer[i] = blendColors(
            colorAtLayer[i - 1],
            layers[i].filamentRgb,
            layers[i].td,
            layers[i].thickness
        );
    }
    return colorAtLayer;
}

/**
 * Map normalized pixel luminance to a target model height by linear
 * interpolation between the base (darkest) height and the total height.
 */
export function luminanceToHeight(
    normalizedLuminance: number,
    transitionZones: AutoPaintResult['transitionZones'],
    totalHeight: number,
    firstLayerHeight: number
): number {
    if (transitionZones.length === 0) {
        return firstLayerHeight;
    }

    const baseHeight = transitionZones[0].endHeight;

    if (normalizedLuminance <= 0) {
        return baseHeight;
    }

    if (normalizedLuminance >= 1) {
        return totalHeight;
    }

    return baseHeight + normalizedLuminance * (totalHeight - baseHeight);
}

/**
 * Map each image swatch to its target printer layer and precompute actual ΔE.
 * Luminance drives height via the Beer-Lambert inverse; the layer at that height
 * gives the current stack color for comparison.
 */
export function buildPixelData(
    imageSwatches: Array<{ hex: string }>,
    layers: PrinterLayer[],
    colorAtLayer: RGB[],
    transitionZones: AutoPaintResult['transitionZones'],
    totalHeight: number,
    firstLayerHeight: number
): PixelData[] {
    return imageSwatches.map((s) => {
        const rgb = hexToRgb(s.hex);
        const lum = getLuminance(rgb) / 255;
        const h = luminanceToHeight(lum, transitionZones, totalHeight, firstLayerHeight);
        const layerIdx = findLayerIdxAtHeight(layers, h);
        return { targetRgb: rgb, layerIdx, actualErr: deltaE(rgb, colorAtLayer[layerIdx]) };
    });
}

/**
 * Run the LUT simulation for a single window and return per-pixel optimal assignments.
 *
 * For each affected pixel (layerIdx ≥ wStart), every LUT entry is simulated:
 * - Layers below the window are captured in `baseColor` (colorAtLayer[wStart-1]).
 * - Window layers are applied in LUT order (up to the pixel's own layerIdx).
 * - Layers above the window continue in their original order.
 * The entry producing the lowest ΔE is recorded in `pixelOptimalLUTIdx`.
 *
 * @param wStart         First layer index in the window (1-based).
 * @param N              Window size (number of layers).
 * @param layers         Full printer-layer stack.
 * @param baseColor      Accumulated stack color just below the window (colorAtLayer[wStart-1]).
 * @param windowFilaments Unique filaments available in this window, in LUT index order.
 * @param lut            All K^N assignments from buildLUT(N, windowFilaments.length).
 * @param pixels         Swatch pixel data from buildPixelData.
 */
export function analyzeWindowLUT(
    wStart: number,
    N: number,
    layers: PrinterLayer[],
    baseColor: RGB,
    windowFilaments: WindowFilament[],
    lut: number[][],
    pixels: PixelData[]
): { errorFactor: number; affectedSwatches: number; pixelOptimalLUTIdx: number[] } {
    const wEnd = wStart + N - 1;
    let totalActualError = 0;
    let totalMinError = 0;
    let affectedSwatches = 0;
    const pixelOptimalLUTIdx: number[] = new Array(pixels.length).fill(-1);

    for (let pxIdx = 0; pxIdx < pixels.length; pxIdx++) {
        const px = pixels[pxIdx];
        if (px.layerIdx < wStart) continue;
        affectedSwatches++;
        totalActualError += px.actualErr;

        let minErr = Infinity;
        let bestLUTIdx = 0;
        const applyCount = Math.min(N, px.layerIdx - wStart + 1);

        for (let li = 0; li < lut.length; li++) {
            const entry = lut[li];
            let c: RGB = { ...baseColor };
            for (let j = 0; j < applyCount; j++) {
                const fi = entry[j];
                c = blendColors(c, windowFilaments[fi].rgb, windowFilaments[fi].td, layers[wStart + j].thickness);
            }
            for (let i = wEnd + 1; i <= px.layerIdx && i < layers.length; i++) {
                c = blendColors(c, layers[i].filamentRgb, layers[i].td, layers[i].thickness);
            }
            const err = deltaE(px.targetRgb, c);
            if (err < minErr) { minErr = err; bestLUTIdx = li; }
        }

        pixelOptimalLUTIdx[pxIdx] = bestLUTIdx;
        totalMinError += minErr;
    }

    return { errorFactor: totalActualError - totalMinError, affectedSwatches, pixelOptimalLUTIdx };
}

/**
 * Core sliding-window computation — returns one `WindowResult` per window
 * without any side effects. Use `runMultiHeadLayerAnalysis` for console output
 * and the selected non-overlapping subset.
 */
export function analyzeMultiHeadWindows(
    filaments: Filament[],
    result: AutoPaintResult,
    imageSwatches: Array<{ hex: string }>,
    layerHeight: number,
    firstLayerHeight: number,
    n: number
): WindowResult[] {
    const N = Math.min(n, filaments.length);
    if (N < 2 || result.transitionZones.length === 0 || imageSwatches.length === 0) return [];

    const layers = expandZonesToPrinterLayers(result, filaments, layerHeight, firstLayerHeight);
    if (layers.length < N + 1) return [];

    const colorAtLayer = buildColorStack(layers);
    const pixels = buildPixelData(
        imageSwatches, layers, colorAtLayer,
        result.transitionZones, result.totalHeight, firstLayerHeight
    );

    const windows: WindowResult[] = [];

    for (let wStart = 1; wStart + N <= layers.length; wStart++) {
        const wEnd = wStart + N - 1;

        const uniqueIndices = [...new Set(
            Array.from({ length: N }, (_, j) => layers[wStart + j].filamentIdx)
        )];
        const windowFilaments: WindowFilament[] = uniqueIndices.map((fi) => ({
            rgb: hexToRgb(filaments[fi]?.color ?? '#000000'),
            td: (filaments[fi]?.td ?? 0.5) * FRONTLIT_TD_SCALE,
        }));
        const lut = buildLUT(N, windowFilaments.length);

        const { errorFactor, affectedSwatches, pixelOptimalLUTIdx } = analyzeWindowLUT(
            wStart, N, layers, colorAtLayer[wStart - 1], windowFilaments, lut, pixels
        );

        windows.push({
            windowStart: wStart,
            windowEnd: wEnd,
            windowBottomZ: layers[wStart].startZ,
            windowTopZ: layers[wEnd].startZ + layers[wEnd].thickness,
            currentFilaments: uniqueIndices.map((fi) =>
                filaments[fi]?.name ?? filaments[fi]?.color ?? `f${fi}`
            ),
            filamentIds: uniqueIndices.map((fi) => filaments[fi]?.id ?? `f${fi}`),
            affectedSwatches,
            errorFactor,
            lut,
            pixelOptimalLUTIdx,
        });
    }

    return windows;
}

/**
 * Select the non-overlapping subset of windows that maximises the total errorFactor.
 *
 * Windows overlap when their layer ranges share any index.  Because every window
 * is width N and adjacent windows differ by one layer, the latest non-overlapping
 * predecessor for window i is always exactly N steps back — so the DP recurrence
 * is O(n) with no binary search needed.
 *
 *   dp[i] = max total errorFactor using windows[0..i-1]
 *   dp[i] = max(dp[i-1],  windows[i-1].errorFactor + dp[max(0, i-N)])
 */
export function selectBestWindows(windows: WindowResult[], windowSize: number): WindowResult[] {
    const n = windows.length;
    if (n === 0) return [];

    const dp = new Float64Array(n + 1); // dp[0] = 0

    for (let i = 1; i <= n; i++) {
        const predDp = i - windowSize >= 0 ? dp[i - windowSize] : 0;
        const withWindow = windows[i - 1].errorFactor + predDp;
        dp[i] = withWindow > dp[i - 1] ? withWindow : dp[i - 1];
    }

    // Traceback: at each step, check whether window i-1 was chosen
    const selected: WindowResult[] = [];
    let i = n;
    while (i > 0) {
        const predDp = i - windowSize >= 0 ? dp[i - windowSize] : 0;
        const withWindow = windows[i - 1].errorFactor + predDp;
        if (withWindow > dp[i - 1] + 1e-9) {
            selected.unshift(windows[i - 1]);
            i = Math.max(0, i - windowSize);
        } else {
            i -= 1;
        }
    }

    return selected;
}

/**
 * Run the full multi-head layer analysis, log results to the console, and return
 * the selected non-overlapping windows with the highest combined errorFactor.
 *
 * Each returned `WindowResult` carries the LUT and per-pixel optimal indices
 * needed by the renderer:
 *   filamentIds[ lut[ pixelOptimalLUTIdx[p] ][n] ]  →  filament ID for pixel p at layer n
 */
export function runMultiHeadLayerAnalysis(
    filaments: Filament[],
    result: AutoPaintResult,
    imageSwatches: Array<{ hex: string }>,
    layerHeight: number,
    firstLayerHeight: number,
    n: number
): WindowResult[] {
    const N = Math.min(n, filaments.length);

    if (N < 2 || result.transitionZones.length === 0 || imageSwatches.length === 0) {
        console.log('[MultiHead] Insufficient data (need ≥2 filaments and image swatches).');
        return [];
    }

    const windows = analyzeMultiHeadWindows(
        filaments, result, imageSwatches, layerHeight, firstLayerHeight, n
    );

    if (windows.length === 0) {
        console.log(`[MultiHead] Not enough printer layers for window size N=${N}.`);
        return [];
    }

    const heads = filaments.slice(0, N)
        .map((f, i) => `[${i}] ${f.name ?? f.color}`)
        .join('  ');

    console.group(
        `[MultiHead] N=${N} heads | LUT per window: up to ${Math.pow(N, N)} entries (${N}^${N}) | ` +
            `${windows.length + N} printer layers | ${imageSwatches.length} swatches`
    );
    console.log(`  Heads: ${heads}`);

    for (const w of windows) {
        console.log(
            `  W[${String(w.windowStart).padStart(3)}–${String(w.windowEnd).padStart(3)}]` +
                `  Z: ${w.windowBottomZ.toFixed(3)}–${w.windowTopZ.toFixed(3)} mm` +
                `  |  [${w.currentFilaments.join(' → ')}]` +
                `  |  swatches: ${w.affectedSwatches}/${imageSwatches.length}` +
                `  |  errorFactor: ${w.errorFactor.toFixed(4)}`
        );
    }

    const best = selectBestWindows(windows, N);
    const bestTotal = best.reduce((s, w) => s + w.errorFactor, 0);

    console.log('');
    console.log(
        `  ── Best non-overlapping selection (${best.length} windows, ` +
            `total errorFactor: ${bestTotal.toFixed(4)}) ──`
    );
    for (const w of best) {
        console.log(
            `  ★ W[${String(w.windowStart).padStart(3)}–${String(w.windowEnd).padStart(3)}]` +
                `  Z: ${w.windowBottomZ.toFixed(3)}–${w.windowTopZ.toFixed(3)} mm` +
                `  |  [${w.currentFilaments.join(' → ')}]` +
                `  |  errorFactor: ${w.errorFactor.toFixed(4)}`
        );
    }

    console.groupEnd();

    return best;
}
