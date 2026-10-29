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
import type { AppearanceEffectiveOpticsModelV1 } from '../types/appearance';
import {
    autoPaintResultMatchesSliceGrid,
    hexToRgb,
    blendColors,
    deltaE,
    rgbToHex,
    rgbToLab,
    mapTargetsToPrintablePalette,
    type RGB,
} from './autoPaint.ts';
import { channelHds, type CalibrationRgb } from './calibration.ts';
import {
    blendEffectiveTransition,
    createPriorEffectiveOpticsModel,
    resolveEffectiveTransitionOptics,
    type EffectiveTransitionOptics,
} from './effectiveOptics.ts';

/**
 * Fallback filament for the rare case where a window references a filament index
 * that is no longer in the profile. Its per-channel HD comes from `channelHds`
 * like any other filament.
 */
const FALLBACK_FILAMENT = { color: '#000000', td: 0.5 };

export interface PrinterLayer {
    /** Index into the original filaments array */
    filamentIdx: number;
    filamentId?: string;
    filamentRgb: RGB;
    /**
     * Effective or calibrated per-channel hiding distances (mm) from the zone.
     * Schema v2 stores frontlit HD directly; it is not rescaled. A scalar is
     * still accepted for hand-built test fixtures.
     */
    td: number | CalibrationRgb;
    transmissionExponent?: number;
    substrateHdMultiplier?: number;
    transitionOptics?: EffectiveTransitionOptics;
    thickness: number;
    startZ: number;
}

export interface WindowFilament {
    /** Original profile index and ID, for matching runs and resolving substrates. */
    filamentIdx?: number;
    filamentId?: string;
    rgb: RGB;
    /** Per-channel hiding distances (mm), from `channelHds()`. See PrinterLayer.td. */
    td: number | CalibrationRgb;
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
    if (!autoPaintResultMatchesSliceGrid(result, layerHeight, firstLayerHeight)) {
        throw new Error('Auto-paint final stack settings do not match the requested slice grid');
    }
    return result.finalStack.layers.map((layer) => {
        const zone = result.transitionZones[layer.zoneIndex];
        const filamentIdx = filaments.findIndex((f) => f.id === layer.filamentId);
        return {
            filamentIdx: Math.max(0, filamentIdx),
            filamentId: layer.filamentId,
            filamentRgb: zone.effectiveColor ?? hexToRgb(layer.filamentColor),
            td: zone.effectiveTdChannels ?? zone.filamentTdChannels ?? zone.filamentTd,
            transmissionExponent: zone.transmissionExponent,
            substrateHdMultiplier: zone.substrateHdMultiplier,
            transitionOptics: zone.transitionOptics,
            thickness: layer.thickness,
            startZ: layer.startHeight,
        };
    });
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

/** Return the first printable surface at or above h, clamped to the stack. */
export function findLayerIdxAtHeight(layers: PrinterLayer[], h: number): number {
    for (let i = 0; i < layers.length; i++) {
        if (layers[i].startZ + layers[i].thickness + 1e-8 >= h) return i;
    }
    return Math.max(0, layers.length - 1);
}

export interface ColorStackState {
    color: RGB;
    runBackground: RGB;
    run: PrinterLayer;
    runThickness: number;
    foundation: boolean;
}

export function startColorStack(layer: PrinterLayer): ColorStackState {
    return {
        color: { ...layer.filamentRgb },
        runBackground: { ...layer.filamentRgb },
        run: layer,
        runThickness: layer.thickness,
        foundation: true,
    };
}

/** Fitted exponents and support limits apply to a whole run, from its original substrate. */
export function appendColorStackLayer(
    state: ColorStackState,
    layer: PrinterLayer,
    model?: AppearanceEffectiveOpticsModelV1
): void {
    if (layer.filamentIdx !== state.run.filamentIdx) {
        const transitionOptics = model && layer.filamentId && state.run.filamentId
            ? resolveEffectiveTransitionOptics(model, layer.filamentId, state.run.filamentId)
            : undefined;
        state.runBackground = state.color;
        state.run = { ...layer, transitionOptics: transitionOptics ?? layer.transitionOptics };
        state.runThickness = 0;
        state.foundation = false;
    }
    state.runThickness = Number((state.runThickness + layer.thickness).toFixed(8));
    if (state.foundation) return;

    const run = state.run;
    if (run.transitionOptics) {
        const { r, g, b } = state.runBackground;
        const color = blendEffectiveTransition([r, g, b], run.transitionOptics, state.runThickness);
        state.color = { r: color[0], g: color[1], b: color[2] };
    } else {
        state.color = blendColors(state.runBackground, run.filamentRgb, run.td,
            state.runThickness, run.transmissionExponent, run.substrateHdMultiplier);
    }
}

/**
 * Accumulate the Beer-Lambert stack color at each printer layer.
 * The first contiguous run is opaque. Other runs use the fitted zone optics
 * and cumulative thickness, including conservative continuation beyond support.
 */
export function buildColorStack(layers: PrinterLayer[]): RGB[] {
    const colorAtLayer: RGB[] = new Array(layers.length);
    if (layers.length === 0) return colorAtLayer;
    const state = startColorStack(layers[0]);
    colorAtLayer[0] = state.color;
    for (let i = 1; i < layers.length; i++) {
        appendColorStackLayer(state, layers[i]);
        colorAtLayer[i] = state.color;
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
 * Reuse the final stack's swatch-to-surface assignments and precompute actual ΔE.
 * Swatches absent from that result use the shared printable-palette mapper.
 */
export function buildPixelData(
    imageSwatches: Array<{ hex: string }>,
    layers: PrinterLayer[],
    colorAtLayer: RGB[],
    stack: AutoPaintResult['finalStack']
): PixelData[] {
    if (layers.length === 0) return [];
    const mappings = new Map(stack.targetMappings.map((mapping) =>
        [mapping.targetColor.hex, mapping.projectedHeight]
    ));
    return imageSwatches.map((s) => {
        const rgb = hexToRgb(s.hex);
        let h = mappings.get(rgbToHex(rgb));
        if (h === undefined) {
            const palette = stack.palette.map((entry) => ({
                height: entry.height,
                rgb: { r: entry.predictedColor.rgb[0], g: entry.predictedColor.rgb[1], b: entry.predictedColor.rgb[2] },
                lab: { L: entry.predictedLab[0], a: entry.predictedLab[1], b: entry.predictedLab[2] },
                surfaceEligible: entry.surfaceEligible,
                predictionConfidence: entry.predictionConfidence,
                exactAnchorId: entry.exactAnchorId,
                exactAnchorTargetLab: entry.exactAnchorTargetLab ? {
                    L: entry.exactAnchorTargetLab[0], a: entry.exactAnchorTargetLab[1], b: entry.exactAnchorTargetLab[2],
                } : undefined,
            }));
            h = mapTargetsToPrintablePalette(palette, [{ ...rgbToLab(rgb), weight: 1 }])[0].projectedHeight;
        }
        const layerIdx = findLayerIdxAtHeight(layers, h);
        return { targetRgb: rgb, layerIdx, actualErr: deltaE(rgb, colorAtLayer[layerIdx]) };
    });
}

/**
 * Run the LUT simulation for a single window and return per-pixel optimal assignments.
 *
 * For each affected pixel (layerIdx ≥ wStart), every LUT entry is simulated:
 * - Layers below the window retain their run context and `baseColor`.
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
 * @param model          Result's optical model, for resolving changed substrates.
 */
export function analyzeWindowLUT(
    wStart: number,
    N: number,
    layers: PrinterLayer[],
    baseColor: RGB,
    windowFilaments: WindowFilament[],
    lut: number[][],
    pixels: PixelData[],
    model?: AppearanceEffectiveOpticsModelV1
): { errorFactor: number; affectedSwatches: number; pixelOptimalLUTIdx: number[] } {
    const wEnd = wStart + N - 1;
    let totalActualError = 0;
    let totalMinError = 0;
    let affectedSwatches = 0;
    const pixelOptimalLUTIdx: number[] = new Array(pixels.length).fill(-1);

    const minErrors: number[] = new Array(pixels.length).fill(Infinity);
    let lastLayer = wEnd;
    for (let pxIdx = 0; pxIdx < pixels.length; pxIdx++) {
        const px = pixels[pxIdx];
        if (px.layerIdx < wStart) continue;
        affectedSwatches++;
        totalActualError += px.actualErr;
        lastLayer = Math.max(lastLayer, px.layerIdx);
    }
    if (affectedSwatches === 0) return { errorFactor: 0, affectedSwatches, pixelOptimalLUTIdx };

    // A window may split a fitted run. Retain its original background and total
    // thickness rather than treating the cached boundary color as a new substrate.
    const prefix = startColorStack(layers[0]);
    for (let i = 1; i < wStart; i++) appendColorStackLayer(prefix, layers[i]);
    prefix.color = baseColor;

    for (let li = 0; li < lut.length; li++) {
        const entry = lut[li];
        const state = { ...prefix };
        const colors: RGB[] = [];
        for (let i = wStart; i <= lastLayer && i < layers.length; i++) {
            let layer = layers[i];
            if (i <= wEnd) {
                const fi = entry[i - wStart];
                const filament = windowFilaments[fi];
                layer = {
                    filamentIdx: filament.filamentIdx ?? fi,
                    filamentId: filament.filamentId,
                    filamentRgb: filament.rgb,
                    td: filament.td,
                    thickness: layer.thickness,
                    startZ: layer.startZ,
                };
            }
            appendColorStackLayer(state, layer, model);
            colors[i] = state.color;
        }
        for (let pxIdx = 0; pxIdx < pixels.length; pxIdx++) {
            const px = pixels[pxIdx];
            if (px.layerIdx < wStart) continue;
            const err = deltaE(px.targetRgb, colors[px.layerIdx]);
            if (err < minErrors[pxIdx]) {
                minErrors[pxIdx] = err;
                pixelOptimalLUTIdx[pxIdx] = li;
            }
        }
    }
    for (let pxIdx = 0; pxIdx < pixels.length; pxIdx++) {
        if (pixels[pxIdx].layerIdx >= wStart) totalMinError += minErrors[pxIdx];
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
        imageSwatches, layers, colorAtLayer, result.finalStack
    );
    const effectiveOptics = result.finalStack.appearanceModel.effectiveOptics;
    const model = effectiveOptics?.filaments.length ? effectiveOptics : createPriorEffectiveOpticsModel(filaments);

    const windows: WindowResult[] = [];

    for (let wStart = 1; wStart + N <= layers.length; wStart++) {
        const wEnd = wStart + N - 1;

        const uniqueIndices = [...new Set(
            Array.from({ length: N }, (_, j) => layers[wStart + j].filamentIdx)
        )];
        const windowFilaments: WindowFilament[] = uniqueIndices.map((fi) => ({
            filamentIdx: fi,
            filamentId: filaments[fi]?.id,
            rgb: hexToRgb(filaments[fi]?.color ?? '#000000'),
            td: channelHds(filaments[fi] ?? FALLBACK_FILAMENT),
        }));
        const lut = buildLUT(N, windowFilaments.length);

        const { errorFactor, affectedSwatches, pixelOptimalLUTIdx } = analyzeWindowLUT(
            wStart, N, layers, colorAtLayer[wStart - 1], windowFilaments, lut, pixels, model
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
