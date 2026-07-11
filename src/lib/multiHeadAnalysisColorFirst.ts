/**
 * Color-first multi-head analysis pipeline.
 *
 * Before running the sliding-window LUT simulation, swatches that map to the
 * same printer layer are merged into a single frequency-weighted entry.  This
 * trades a small amount of per-swatch fidelity for a proportional reduction in
 * the inner-loop work of analyzeWindowLUT.
 *
 * Use analyzeMultiHeadWindowsColorFirst as a drop-in alongside
 * analyzeMultiHeadWindows to compare errorFactor rankings side-by-side.
 */

import type { AutoPaintResult } from './autoPaint.ts';
import type { Filament, MultiHeadRangeAssignment } from '../types';
import {
    hexToRgb,
    blendColors,
    deltaE,
    getLuminance,
    type RGB,
} from './autoPaint.ts';
import {
    expandZonesToPrinterLayers,
    findLayerIdxAtHeight,
    buildColorStack,
    luminanceToHeight,
    type PrinterLayer,
    type WindowFilament,
    type WindowResult,
} from './multiHeadAnalysis.ts';


const FRONTLIT_TD_SCALE = 0.1;

/**
 * A swatch entry deduplicated by printer layer.
 * All swatches that share the same layerIdx are merged: targetRgb is their
 * frequency-weighted centroid and count is the sum of their pixel counts.
 */
export interface ColorFirstPixel {
    targetRgb: RGB;
    layerIdx: number;
    /** ΔE between the centroid color and the actual stack color at layerIdx. */
    actualErr: number;
    /** Total pixel count of all swatches merged into this entry. */
    count: number;
}

/**
 * Collapse imageSwatches into one ColorFirstPixel per unique printer layer.
 *
 * Swatches that land on the same layer are merged:
 *   - targetRgb  → frequency-weighted RGB centroid
 *   - actualErr  → ΔE between the centroid and colorAtLayer[layerIdx]
 *   - count      → sum of constituent swatch counts (or 1 each when absent)
 */
export function buildPixelDataColorFirst(
    imageSwatches: Array<{ hex: string; count?: number }>,
    layers: PrinterLayer[],
    colorAtLayer: RGB[],
    transitionZones: AutoPaintResult['transitionZones'],
    totalHeight: number,
    firstLayerHeight: number
): ColorFirstPixel[] {
    const byLayer = new Map<number, { r: number; g: number; b: number; count: number }>();

    for (const s of imageSwatches) {
        const rgb = hexToRgb(s.hex);
        const lum = getLuminance(rgb) / 255;
        const h = luminanceToHeight(lum, transitionZones, totalHeight, firstLayerHeight);
        const layerIdx = findLayerIdxAtHeight(layers, h);
        const cnt = s.count ?? 1;

        const existing = byLayer.get(layerIdx);
        if (existing) {
            const total = existing.count + cnt;
            existing.r = (existing.r * existing.count + rgb.r * cnt) / total;
            existing.g = (existing.g * existing.count + rgb.g * cnt) / total;
            existing.b = (existing.b * existing.count + rgb.b * cnt) / total;
            existing.count = total;
        } else {
            byLayer.set(layerIdx, { r: rgb.r, g: rgb.g, b: rgb.b, count: cnt });
        }
    }

    return Array.from(byLayer.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([layerIdx, { r, g, b, count }]) => {
            const targetRgb: RGB = { r, g, b };
            return {
                targetRgb,
                layerIdx,
                actualErr: deltaE(targetRgb, colorAtLayer[layerIdx]),
                count,
            };
        });
}

/**
 * A contiguous run of printer layers that all share the same filament.
 * Windows are defined in terms of runs, not individual layers.
 */
export interface ColorRun {
    filamentIdx: number;
    /** First printer-layer index in this run (inclusive). */
    startLayerIdx: number;
    /** Last printer-layer index in this run (inclusive). */
    endLayerIdx: number;
}

/**
 * Group consecutive same-filament printer layers into runs.
 * A run boundary occurs wherever the filamentIdx changes.
 */
export function buildColorRuns(layers: PrinterLayer[]): ColorRun[] {
    if (layers.length === 0) return [];
    const runs: ColorRun[] = [];
    let runStart = 0;
    for (let i = 1; i <= layers.length; i++) {
        if (i === layers.length || layers[i].filamentIdx !== layers[runStart].filamentIdx) {
            runs.push({ filamentIdx: layers[runStart].filamentIdx, startLayerIdx: runStart, endLayerIdx: i - 1 });
            runStart = i;
        }
    }
    return runs;
}

/**
 * Simulate all K^N filament combinations for a run-based window, finding the
 * optimal slot assignment for every color in a single pass per combination.
 *
 * Loop order: K^N combinations (outer) × colors (inner, updated at their layer).
 * Each combination is simulated once, advancing layer-by-layer through the window
 * and above. Every color's running minimum is updated the moment the simulation
 * reaches its target layerIdx — no per-color restart from baseColor.
 *
 * Returns per-color optimal slot assignments (direct number[] arrays, no LUT
 * indirection) alongside the frequency-weighted errorFactor.
 */
export function computeColorOptimalAssignments(
    windowRuns: ColorRun[],
    wEnd: number,
    layers: PrinterLayer[],
    baseColor: RGB,
    windowFilaments: WindowFilament[],
    pixels: ColorFirstPixel[]
): { errorFactor: number; affectedCount: number; assignments: (number[] | null)[] } {
    const K = windowFilaments.length;
    const N = windowRuns.length;
    const wStart = windowRuns[0].startLayerIdx;

    // Index pixels by layerIdx for O(1) lookup during the simulation sweep.
    const pixelsAtLayer = new Map<number, number[]>();
    const minErr = new Float64Array(pixels.length).fill(Infinity);
    const assignments: (number[] | null)[] = new Array(pixels.length).fill(null);
    let totalActualError = 0;
    let affectedCount = 0;
    let maxAffectedLayer = wStart - 1;

    for (let pxIdx = 0; pxIdx < pixels.length; pxIdx++) {
        const px = pixels[pxIdx];
        if (px.layerIdx < wStart) continue;
        affectedCount += px.count;
        totalActualError += px.actualErr * px.count;
        if (px.layerIdx > maxAffectedLayer) maxAffectedLayer = px.layerIdx;
        const bucket = pixelsAtLayer.get(px.layerIdx);
        if (bucket) bucket.push(pxIdx);
        else pixelsAtLayer.set(px.layerIdx, [pxIdx]);
    }

    const total = K ** N;

    for (let combo = 0; combo < total; combo++) {
        // Decode combo to slot assignments (base-K digits).
        const entry: number[] = new Array(N);
        let v = combo;
        for (let j = 0; j < N; j++) { entry[j] = v % K; v = Math.floor(v / K); }

        // Single incremental simulation through the window runs.
        let c: RGB = { ...baseColor };
        for (let r = 0; r < N; r++) {
            const run = windowRuns[r];
            const filament = windowFilaments[entry[r]];
            for (let i = run.startLayerIdx; i <= run.endLayerIdx; i++) {
                c = blendColors(c, filament.rgb, filament.td, layers[i].thickness);
                const bucket = pixelsAtLayer.get(i);
                if (bucket) {
                    for (const pxIdx of bucket) {
                        const err = deltaE(pixels[pxIdx].targetRgb, c);
                        if (err < minErr[pxIdx]) { minErr[pxIdx] = err; assignments[pxIdx] = entry.slice(); }
                    }
                }
            }
        }

        // Continue above the window for colors whose layerIdx > wEnd.
        for (let i = wEnd + 1; i <= maxAffectedLayer; i++) {
            c = blendColors(c, layers[i].filamentRgb, layers[i].td, layers[i].thickness);
            const bucket = pixelsAtLayer.get(i);
            if (bucket) {
                for (const pxIdx of bucket) {
                    const err = deltaE(pixels[pxIdx].targetRgb, c);
                    if (err < minErr[pxIdx]) { minErr[pxIdx] = err; assignments[pxIdx] = entry.slice(); }
                }
            }
        }
    }

    let totalMinError = 0;
    for (let pxIdx = 0; pxIdx < pixels.length; pxIdx++) {
        if (minErr[pxIdx] < Infinity) totalMinError += minErr[pxIdx] * pixels[pxIdx].count;
    }

    return { errorFactor: totalActualError - totalMinError, affectedCount, assignments };
}

/**
 * Drop-in parallel to analyzeMultiHeadWindows that uses the color-first pixel
 * pipeline.  The returned WindowResult is structurally identical to the base
 * pipeline's output and carries errorFactor for comparison purposes.
 *
 * Note: affectedSwatches in the returned WindowResult is the total weighted
 * pixel count, not the number of unique color groups.
 */
export function analyzeMultiHeadWindowsColorFirst(
    filaments: Filament[],
    result: AutoPaintResult,
    imageSwatches: Array<{ hex: string; count?: number }>,
    layerHeight: number,
    firstLayerHeight: number,
    n: number
): WindowResult[] {
    const N = Math.min(n, filaments.length);
    if (N < 2 || result.transitionZones.length === 0 || imageSwatches.length === 0) return [];

    const layers = expandZonesToPrinterLayers(result, filaments, layerHeight, firstLayerHeight);
    if (layers.length < N + 1) return [];

    const colorAtLayer = buildColorStack(layers);
    const runs = buildColorRuns(layers);
    const pixels = buildPixelDataColorFirst(
        imageSwatches, layers, colorAtLayer,
        result.transitionZones, result.totalHeight, firstLayerHeight
    );

    const windows: WindowResult[] = [];

    // Slide a window of N consecutive color runs (not N individual layers).
    // Each run covers all printer layers that share the same filament, so the
    // window always spans exactly N color zones regardless of how many layers
    // each zone occupies.
    for (let rStart = 0; rStart + N <= runs.length; rStart++) {
        const windowRuns = runs.slice(rStart, rStart + N);
        const wStart = windowRuns[0].startLayerIdx;
        const wEnd = windowRuns[N - 1].endLayerIdx;

        // Skip the foundation run (layer 0 is the opaque base).
        if (wStart === 0) continue;

        const uniqueIndices = [...new Set(windowRuns.map((r) => r.filamentIdx))];
        const windowFilaments: WindowFilament[] = uniqueIndices.map((fi) => ({
            rgb: hexToRgb(filaments[fi]?.color ?? '#000000'),
            td: (filaments[fi]?.td ?? 0.5) * FRONTLIT_TD_SCALE,
        }));

        const { errorFactor, affectedCount } = computeColorOptimalAssignments(
            windowRuns, wEnd, layers, colorAtLayer[wStart - 1], windowFilaments, pixels
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
            affectedSwatches: affectedCount,
            errorFactor,
            lut: [],
            pixelOptimalLUTIdx: [],
        });
    }

    return windows;
}

// ---------------------------------------------------------------------------
// Consensus combo + layer patching (iterative pipeline helpers)
// ---------------------------------------------------------------------------

/**
 * Find the single K^N filament combo that minimises the aggregate weighted
 * ΔE across all affected color groups for this window.
 *
 * Unlike computeColorOptimalAssignments (which gives each color its own best
 * combo), this returns one consensus ordering that the printer can actually
 * use — every pixel at the same height sees the same head assignment.
 *
 * Returns the winning entry, the improvement over the current stack, and the
 * total affected pixel count.
 */
function findConsensusCombo(
    windowRuns: ColorRun[],
    wEnd: number,
    layers: PrinterLayer[],
    baseColor: RGB,
    windowFilaments: WindowFilament[],
    pixels: ColorFirstPixel[]
): { entry: number[]; errorFactor: number; affectedCount: number } {
    const K = windowFilaments.length;
    const N = windowRuns.length;
    const wStart = windowRuns[0].startLayerIdx;

    const pixelsAtLayer = new Map<number, number[]>();
    let totalActualError = 0;
    let affectedCount = 0;
    let maxAffectedLayer = wStart - 1;

    for (let pxIdx = 0; pxIdx < pixels.length; pxIdx++) {
        const px = pixels[pxIdx];
        if (px.layerIdx < wStart) continue;
        affectedCount += px.count;
        totalActualError += px.actualErr * px.count;
        if (px.layerIdx > maxAffectedLayer) maxAffectedLayer = px.layerIdx;
        const bucket = pixelsAtLayer.get(px.layerIdx);
        if (bucket) bucket.push(pxIdx);
        else pixelsAtLayer.set(px.layerIdx, [pxIdx]);
    }

    const total = K ** N;
    let bestEntry: number[] = Array.from({ length: N }, () => 0);
    let bestError = Infinity;

    for (let combo = 0; combo < total; combo++) {
        const entry: number[] = new Array(N);
        let v = combo;
        for (let j = 0; j < N; j++) { entry[j] = v % K; v = Math.floor(v / K); }

        let comboError = 0;
        let c: RGB = { ...baseColor };

        for (let r = 0; r < N; r++) {
            const run = windowRuns[r];
            const filament = windowFilaments[entry[r]];
            for (let i = run.startLayerIdx; i <= run.endLayerIdx; i++) {
                c = blendColors(c, filament.rgb, filament.td, layers[i].thickness);
                const bucket = pixelsAtLayer.get(i);
                if (bucket) for (const pxIdx of bucket)
                    comboError += deltaE(pixels[pxIdx].targetRgb, c) * pixels[pxIdx].count;
            }
        }
        for (let i = wEnd + 1; i <= maxAffectedLayer; i++) {
            c = blendColors(c, layers[i].filamentRgb, layers[i].td, layers[i].thickness);
            const bucket = pixelsAtLayer.get(i);
            if (bucket) for (const pxIdx of bucket)
                comboError += deltaE(pixels[pxIdx].targetRgb, c) * pixels[pxIdx].count;
        }

        if (comboError < bestError) { bestError = comboError; bestEntry = entry; }
    }

    return {
        entry: bestEntry,
        errorFactor: Math.max(0, totalActualError - bestError),
        affectedCount,
    };
}

/**
 * Patch the mutable layer stack so that every printer layer within each run
 * slot carries the filament chosen by `entry`.  Updates filamentIdx,
 * filamentRgb, and td so subsequent buildColorStack calls reflect the new
 * ordering.
 */
function applyComboToLayers(
    layers: PrinterLayer[],
    windowRuns: ColorRun[],
    entry: number[],
    uniqueIndices: number[],
    filaments: Filament[]
): void {
    for (let r = 0; r < windowRuns.length; r++) {
        const run = windowRuns[r];
        const fi = uniqueIndices[entry[r]];
        const f = filaments[fi];
        const rgb = hexToRgb(f.color);
        const td = f.td * FRONTLIT_TD_SCALE;
        for (let i = run.startLayerIdx; i <= run.endLayerIdx; i++) {
            layers[i] = { ...layers[i], filamentIdx: fi, filamentRgb: rgb, td };
        }
    }
}

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

/**
 * Result of the color-first full pipeline.
 *
 * `colorAssignments[i]` maps every input swatch hex directly to its optimal
 * N-slot filament assignment for `windows[i]`.  No LUT indirection needed.
 *
 * Renderer lookup:
 *   windows[i].filamentIds[ colorAssignments[i].get(hex)![slotIndex] ]
 *   → filament ID for a pixel of color `hex` at run slot `slotIndex` in window i.
 *
 * Colors absent from the map fall below that window's start layer.
 */
export interface ColorFirstResult {
    /** Windows selected by the iterative consensus loop, in application order. */
    windows: WindowResult[];
    /**
     * One map per selected window.  Key: swatch hex string.
     * Value: number[] of length N — the optimal filament index (into
     * windows[i].filamentIds) for each run slot.
     */
    colorAssignments: Map<string, number[]>[];
    /** Number of unique printer layers the input swatches collapsed to. */
    uniqueLayerCount: number;
    /**
     * The full printer-layer stack after all window reorderings have been
     * applied.  Each entry's filamentIdx, filamentRgb, and td reflect the
     * consensus-optimal assignment chosen by the iterative loop.
     *
     * Use this as the source of truth for the swap plan and 3MF export.
     * Empty when no windows were applied.
     */
    patchedLayers: PrinterLayer[];
    /**
     * Per image-colour filament-per-layer sequence (length = patchedLayers.length).
     * colorLayerFilaments.get(hex)[layerIdx] is the palette filament index a pixel
     * of colour `hex` uses at that printer layer.  Outside selected windows every
     * colour shares the global (consensus) stack; inside a window each colour uses
     * its own optimal assignment.  This is what lets the renderer mix filaments
     * across pixels within a single height band.  Empty when no windows applied.
     */
    colorLayerFilaments: Map<string, number[]>;
    /**
     * Consensus filament ID per run slot per window (length = windows.length).
     * windowRunFilaments[w][r] is the filament ID that run slot r carries in
     * window w, derived from the consensus LUT entry selected during analysis.
     * Used by optimizeNozzleAssignments to decide which nozzle loads which filament.
     */
    windowRunFilaments: string[][];
    /**
     * Optimal nozzle-to-run-slot permutation per window, minimising total nozzle
     * filament swaps across all window transitions.  Idle nozzles (between windows)
     * keep their previous filament at zero swap cost.
     *
     * nozzleAssignments[w][k] = run-slot index that nozzle (k+1) handles in window w.
     * Empty when fewer than two windows are selected.
     */
    nozzleAssignments: number[][];
    /**
     * Unique filament IDs needed in non-windowed layers before the first window.
     * @deprecated Use nonWindowedRanges instead.
     */
    preWindowFilaments: string[];
    /**
     * Realized nozzle assignments for every non-windowed layer range (pre-window,
     * gaps between windows, post-window), in print order.
     * Each entry covers a contiguous range of 0-indexed layers and stores the
     * actual filament loaded on each head (carry-forward already applied).
     */
    nonWindowedRanges: MultiHeadRangeAssignment[];
}

/**
 * Find the permutation of run-slot-to-nozzle assignment for each window that
 * minimises the total number of nozzle filament swaps across all transitions.
 *
 * A swap is counted whenever a nozzle changes its loaded filament between
 * consecutive windows.  Nozzles that are idle between windows keep their
 * filament at zero swap cost — the DP state tracks all N nozzles so that a
 * filament parked on an idle nozzle is reused for free if the same filament
 * is needed again in a later window.
 *
 * @param windowRunFilaments  [w][r] = filament ID for run slot r in window w
 * @param N                   Number of physical nozzles
 * @returns nozzleAssignments[w][k] = run-slot index for nozzle (k+1) in window w
 */
export function optimizeNozzleAssignments(
    windowRunFilaments: string[][],
    N: number
): number[][] {
    const W = windowRunFilaments.length;
    if (W === 0) return [];

    // nozzleAssignments[w][k] = run-slot index (0-based) assigned to nozzle k+1 in window w,
    // or IDLE (-1) when the nozzle is not needed and keeps its previous filament.
    const IDLE = -1;

    // Generate all K-permutations (injections) of K run slots into N nozzle positions.
    // result[k] = run-slot assigned to nozzle k, or IDLE.
    // For each of the K slots, exactly one nozzle is chosen; the rest are IDLE.
    function generateInjections(K: number): number[][] {
        const result: number[][] = [];
        const assignment = new Array(N).fill(IDLE);
        const used = new Array(N).fill(false);
        function bt(slot: number) {
            if (slot === K) { result.push(assignment.slice()); return; }
            for (let k = 0; k < N; k++) {
                if (!used[k]) {
                    used[k] = true;
                    assignment[k] = slot;
                    bt(slot + 1);
                    used[k] = false;
                    assignment[k] = IDLE;
                }
            }
        }
        bt(0);
        return result;
    }

    // Precompute injections per window (keyed by K = number of required filaments).
    const injectionCache = new Map<number, number[][]>();
    const windowInjections: number[][][] = windowRunFilaments.map((runs) => {
        const K = runs.length;
        if (!injectionCache.has(K)) injectionCache.set(K, generateInjections(K));
        return injectionCache.get(K)!;
    });

    // DP state: N-tuple of loaded filament IDs (EMPTY sentinel for never-loaded nozzles).
    const EMPTY = '\x01';
    const encodeState = (s: string[]) => s.join('\x00');

    interface DPEntry { cost: number; injIdx: number; prevKey: string }

    // Window 0: idle nozzles start empty (no filament loaded yet).
    let dp = new Map<string, DPEntry>();
    const w0Inj = windowInjections[0];
    const w0Runs = windowRunFilaments[0];
    for (let ii = 0; ii < w0Inj.length; ii++) {
        const state = w0Inj[ii].map((r) => r === IDLE ? EMPTY : w0Runs[r]);
        const key = encodeState(state);
        // Every nozzle that starts non-empty counts as one initial load (cost 0 — first window
        // always requires loading; we only optimise swaps *between* windows).
        if (!dp.has(key)) dp.set(key, { cost: 0, injIdx: ii, prevKey: '' });
    }

    const history: Map<string, DPEntry>[] = [new Map(dp)];

    for (let w = 1; w < W; w++) {
        const next = new Map<string, DPEntry>();
        const injs = windowInjections[w];
        const runs = windowRunFilaments[w];

        for (const [prevKey, prevEntry] of dp) {
            const prevState = prevKey.split('\x00');

            for (let ii = 0; ii < injs.length; ii++) {
                const inj = injs[ii];
                // Active nozzles take their new filament; idle nozzles keep the previous one.
                const newState = inj.map((r, k) => r === IDLE ? prevState[k] : runs[r]);
                let swaps = 0;
                for (let k = 0; k < N; k++) {
                    if (newState[k] !== prevState[k]) swaps++;
                }
                const cost = prevEntry.cost + swaps;
                const key = encodeState(newState);
                const existing = next.get(key);
                if (!existing || cost < existing.cost) {
                    next.set(key, { cost, injIdx: ii, prevKey });
                }
            }
        }

        dp = next;
        history.push(new Map(dp));
    }

    // Find minimum-cost final state.
    let bestKey = '';
    let bestCost = Infinity;
    for (const [key, entry] of dp) {
        if (entry.cost < bestCost) { bestCost = entry.cost; bestKey = key; }
    }

    // Backtrack to recover injection sequence.
    const result: number[][] = new Array(W);
    let key = bestKey;
    for (let w = W - 1; w >= 0; w--) {
        const entry = history[w].get(key)!;
        result[w] = windowInjections[w][entry.injIdx];
        key = entry.prevKey;
    }

    console.group(`[optimizeNozzleAssignments] ${W} windows × ${N} nozzles → min swaps: ${bestCost}`);
    for (let w = 0; w < W; w++) {
        const runs = windowRunFilaments[w];
        const assgn = result[w];
        console.log(
            `  w${w}: ` +
            assgn.map((r, k) =>
                `N${k+1}→${r === -1 ? 'idle' : (runs[r] ?? '?')}`
            ).join('  ') +
            `  (${assgn.filter(r => r !== -1).length} active)`
        );
    }
    // Show what each nozzle carries at each window (including idle carry-forward).
    let state = new Array(N).fill('\x01');
    console.log('  Nozzle state trace:');
    for (let w = 0; w < W; w++) {
        const runs = windowRunFilaments[w];
        const assgn = result[w];
        const newState = assgn.map((r, k) => r === -1 ? state[k] : (runs[r] ?? '?'));
        const changes = newState.filter((fid, k) => fid !== state[k]).length;
        console.log(`    w${w}: [${newState.join(' | ')}]  (+${changes} swaps)`);
        state = newState;
    }
    console.groupEnd();
    return result;
}

/**
 * Full color-first analysis pipeline — analogue of runMultiHeadLayerAnalysis.
 *
 * Instead of a per-swatch pixelOptimalLUTIdx array, the result carries one
 * Map<hex, lutIdx> per selected window so any downstream renderer can resolve
 * a pixel color directly to the optimal filament sequence without needing to
 * maintain a swatch-index mapping.
 */
export function runMultiHeadLayerAnalysisColorFirst(
    filaments: Filament[],
    result: AutoPaintResult,
    imageSwatches: Array<{ hex: string; count?: number }>,
    layerHeight: number,
    firstLayerHeight: number,
    n: number,
    searchDepth: 'fast' | 'balanced' | 'thorough' = 'balanced'
): ColorFirstResult {
    const N = Math.min(n, filaments.length);
    const empty: ColorFirstResult = { windows: [], colorAssignments: [], uniqueLayerCount: 0, patchedLayers: [], colorLayerFilaments: new Map(), windowRunFilaments: [], nozzleAssignments: [], preWindowFilaments: [], nonWindowedRanges: [] };

    if (N < 2 || result.transitionZones.length === 0 || imageSwatches.length === 0) {
        console.log('[MultiHead ColorFirst] Insufficient data (need ≥2 filaments and image swatches).');
        return empty;
    }

    // Mutable layer stack — patched in-place each iteration as windows are applied.
    const layers = expandZonesToPrinterLayers(result, filaments, layerHeight, firstLayerHeight);
    if (layers.length < N + 1) {
        console.log(`[MultiHead ColorFirst] Not enough printer layers for window size N=${N}.`);
        return empty;
    }

    // Run boundaries are fixed for the life of the analysis; only filament
    // assignments within runs change as windows are applied.
    const runs = buildColorRuns(layers);

    // Color groups are fixed (derived from image content, not the stack).
    const initialColorAtLayer = buildColorStack(layers);
    const pixels = buildPixelDataColorFirst(
        imageSwatches, layers, initialColorAtLayer,
        result.transitionZones, result.totalHeight, firstLayerHeight
    );

    const layerIdxToGroupIdx = new Map<number, number>(pixels.map((p, i) => [p.layerIdx, i]));
    const hexToGroupIdx = new Map<string, number>();
    for (const s of imageSwatches) {
        if (hexToGroupIdx.has(s.hex)) continue;
        const rgb = hexToRgb(s.hex);
        const lum = getLuminance(rgb) / 255;
        const h = luminanceToHeight(lum, result.transitionZones, result.totalHeight, firstLayerHeight);
        const layerIdx = findLayerIdxAtHeight(layers, h);
        const groupIdx = layerIdxToGroupIdx.get(layerIdx);
        if (groupIdx !== undefined) hexToGroupIdx.set(s.hex, groupIdx);
    }

    const selectedWindows: WindowResult[] = [];
    const selectedAssignments: Map<string, number[]>[] = [];
    // Per selected window: the run decomposition + unique filament indices, used
    // after the loop to build the per-colour filament-per-layer map.
    const windowRunInfo: { runs: ColorRun[]; uniqueIndices: number[] }[] = [];
    // Consensus LUT entry per selected window (bestEntry[r] = index into uniqueIndices).
    const windowBestEntries: number[][] = [];
    // Layers already claimed by a selected window — windows must not overlap so
    // that each layer has exactly one per-colour assignment source.
    const layerUsed: boolean[] = new Array(layers.length).fill(false);
    const heads = filaments.slice(0, N).map((f, i) => `[${i}] ${f.name ?? f.color}`).join('  ');
    // fast:      high threshold + half the iteration budget → fewer windows, quick exit
    // balanced:  default values
    // thorough:  low threshold + full budget → more windows, longer search
    const MIN_IMPROVEMENT = searchDepth === 'fast' ? 5e-4 : searchDepth === 'thorough' ? 2e-5 : 1e-4;
    // Upper bound: at most floor(runs/N) non-overlapping windows.
    const maxIter = searchDepth === 'fast'
        ? Math.max(1, Math.floor(runs.length / N / 2))
        : Math.floor(runs.length / N);

    console.group(
        `[MultiHead ColorFirst] N=${N} heads | ${pixels.length} color groups` +
        ` (from ${imageSwatches.length} swatches) | iterative`
    );
    console.log(`  Heads: ${heads}`);

    for (let iter = 0; iter < maxIter; iter++) {
        // Rebuild the blended color stack from the (possibly patched) layers.
        const colorAtLayer = buildColorStack(layers);

        // Refresh each pixel's actual error against the current stack.
        for (let pxIdx = 0; pxIdx < pixels.length; pxIdx++) {
            pixels[pxIdx].actualErr = deltaE(pixels[pxIdx].targetRgb, colorAtLayer[pixels[pxIdx].layerIdx]);
        }

        // Scan every candidate N-run window and find the one whose consensus
        // optimal ordering yields the greatest aggregate improvement.
        let bestWindowRuns: ColorRun[] | null = null;
        let bestUniqueIndices: number[] | null = null;
        let bestEntry: number[] | null = null;
        let bestErrorFactor = MIN_IMPROVEMENT;
        let bestAffectedCount = 0;

        for (let rStart = 0; rStart + N <= runs.length; rStart++) {
            const windowRuns = runs.slice(rStart, rStart + N);
            const wStart = windowRuns[0].startLayerIdx;
            if (wStart === 0) continue; // skip foundation

            const wEnd = windowRuns[N - 1].endLayerIdx;

            // Skip windows overlapping a layer already claimed by a prior window.
            let overlaps = false;
            for (let i = wStart; i <= wEnd; i++) {
                if (layerUsed[i]) { overlaps = true; break; }
            }
            if (overlaps) continue;

            // Read current filament assignment from the (possibly patched) layers.
            const uniqueIndices = [...new Set(
                windowRuns.map((r) => layers[r.startLayerIdx].filamentIdx)
            )];
            const windowFilaments: WindowFilament[] = uniqueIndices.map((fi) => ({
                rgb: hexToRgb(filaments[fi]?.color ?? '#000000'),
                td: (filaments[fi]?.td ?? 0.5) * FRONTLIT_TD_SCALE,
            }));

            const { entry, errorFactor, affectedCount } = findConsensusCombo(
                windowRuns, wEnd, layers, colorAtLayer[wStart - 1], windowFilaments, pixels
            );

            if (errorFactor > bestErrorFactor) {
                bestWindowRuns = windowRuns;
                bestUniqueIndices = uniqueIndices;
                bestEntry = entry;
                bestErrorFactor = errorFactor;
                bestAffectedCount = affectedCount;
            }
        }

        if (!bestWindowRuns || !bestEntry || !bestUniqueIndices) break;

        const wStart = bestWindowRuns[0].startLayerIdx;
        const wEnd = bestWindowRuns[N - 1].endLayerIdx;

        const w: WindowResult = {
            windowStart: wStart,
            windowEnd: wEnd,
            windowBottomZ: layers[wStart].startZ,
            windowTopZ: layers[wEnd].startZ + layers[wEnd].thickness,
            currentFilaments: bestUniqueIndices.map(
                (fi) => filaments[fi]?.name ?? filaments[fi]?.color ?? `f${fi}`
            ),
            filamentIds: bestUniqueIndices.map((fi) => filaments[fi]?.id ?? `f${fi}`),
            affectedSwatches: bestAffectedCount,
            errorFactor: bestErrorFactor,
            lut: [],
            pixelOptimalLUTIdx: [],
        };

        // Per-color optimal assignments for this window, computed against the
        // current stack (below this window already reflects prior iterations).
        // Window *selection* used the consensus combo, but each colour now gets
        // its OWN optimal filament-per-run-slot so the render can mix filaments
        // across pixels within the same height band.
        const bestWindowFilaments: WindowFilament[] = bestUniqueIndices.map((fi) => ({
            rgb: hexToRgb(filaments[fi]?.color ?? '#000000'),
            td: (filaments[fi]?.td ?? 0.5) * FRONTLIT_TD_SCALE,
        }));
        const { assignments } = computeColorOptimalAssignments(
            bestWindowRuns, wEnd, layers, colorAtLayer[wStart - 1], bestWindowFilaments, pixels
        );

        const colorMap = new Map<string, number[]>();
        for (const [hex, groupIdx] of hexToGroupIdx) {
            const assignment = assignments[groupIdx];
            if (assignment) colorMap.set(hex, assignment);
        }

        // Patch the layer stack with the consensus ordering so the next
        // iteration's base (and any non-window layers) stay a single realisable
        // stack for window selection.
        applyComboToLayers(layers, bestWindowRuns, bestEntry, bestUniqueIndices, filaments);

        // Claim this window's layers so later iterations cannot overlap them.
        for (let i = wStart; i <= wEnd; i++) layerUsed[i] = true;

        selectedWindows.push(w);
        selectedAssignments.push(colorMap);
        windowRunInfo.push({ runs: bestWindowRuns, uniqueIndices: bestUniqueIndices });
        windowBestEntries.push(bestEntry);

        console.log(
            `  ★ iter ${iter + 1}  W[${String(wStart).padStart(3)}–${String(wEnd).padStart(3)}]` +
            `  Z: ${layers[wStart].startZ.toFixed(3)}–${(layers[wEnd].startZ + layers[wEnd].thickness).toFixed(3)} mm` +
            `  |  [${w.currentFilaments.join(' → ')}]` +
            `  |  errorFactor: ${bestErrorFactor.toFixed(4)}` +
            `  |  colors: ${colorMap.size}`
        );
    }

    console.log(`  Total: ${selectedWindows.length} window(s) applied.`);
    console.groupEnd();

    // Build the per-colour filament-per-layer map the renderer consumes.
    // Default every colour to the global (consensus) stack, then overwrite the
    // layers of each non-overlapping window with that colour's own assignment.
    const globalSeq = layers.map((l) => l.filamentIdx);
    const colorLayerFilaments = new Map<string, number[]>();
    for (const hex of hexToGroupIdx.keys()) {
        const seq = globalSeq.slice();
        for (let wi = 0; wi < selectedWindows.length; wi++) {
            const slots = selectedAssignments[wi].get(hex);
            if (!slots) continue;
            const { runs: wRuns, uniqueIndices } = windowRunInfo[wi];
            for (let r = 0; r < wRuns.length; r++) {
                const filamentIdx = uniqueIndices[slots[r]];
                for (let i = wRuns[r].startLayerIdx; i <= wRuns[r].endLayerIdx; i++) {
                    seq[i] = filamentIdx;
                }
            }
        }
        colorLayerFilaments.set(hex, seq);
    }

    // One unique filament ID per window — used by the nozzle optimizer.
    // uniqueIndices already holds the deduplicated set of filament indices for the
    // window; bestEntry maps run slots onto those indices but a single index can
    // appear for multiple slots.  The optimizer assigns one nozzle per unique
    // filament (not one per run slot), so we use uniqueIndices directly.
    const windowRunFilaments: string[][] = windowRunInfo.map(({ uniqueIndices }) =>
        uniqueIndices.map((fi) => filaments[fi]?.id ?? `f${fi}`)
    );

    // Build the full print-order event list: real windows interleaved with virtual
    // events for every non-windowed range (pre-window, gaps, post-window).
    // Each event carries the unique filament IDs needed in its layer range.
    // Non-windowed layers are single-filament (all pixels use globalSeq[l]),
    // so we collect unique filament IDs per range directly from globalSeq.
    interface PrintEvent {
        type: 'window' | 'virtual';
        selIdx?: number;       // selection-order window index (for 'window' type)
        rangeStart: number;
        rangeEnd: number;
        filaments: string[];   // unique IDs needed (optimizer input slots)
    }

    const sortedByStart = Array.from({ length: selectedWindows.length }, (_, i) => i)
        .sort((a, b) => selectedWindows[a].windowStart - selectedWindows[b].windowStart);

    // Add virtual events for a layer range, splitting into ≤N sub-ranges if needed.
    const allPrintEvents: PrintEvent[] = [];
    const addVirtualRange = (rangeStart: number, rangeEnd: number) => {
        let subStart = rangeStart;
        const curFils: string[] = [];
        const inCur = new Set<string>();
        for (let l = rangeStart; l <= rangeEnd; l++) {
            const fi = globalSeq[l];
            if (fi < 0 || fi >= filaments.length) continue;
            const fid = filaments[fi].id;
            if (!inCur.has(fid)) {
                if (inCur.size >= N) {
                    allPrintEvents.push({ type: 'virtual', rangeStart: subStart, rangeEnd: l - 1, filaments: [...curFils] });
                    subStart = l;
                    curFils.length = 0;
                    inCur.clear();
                }
                curFils.push(fid);
                inCur.add(fid);
            }
        }
        if (curFils.length > 0) {
            allPrintEvents.push({ type: 'virtual', rangeStart: subStart, rangeEnd: rangeEnd, filaments: [...curFils] });
        }
    };

    // Pre-window range
    if (sortedByStart.length > 0 && selectedWindows[sortedByStart[0]].windowStart > 0) {
        addVirtualRange(0, selectedWindows[sortedByStart[0]].windowStart - 1);
    }
    // Real windows interleaved with gap virtual ranges
    for (let ri = 0; ri < sortedByStart.length; ri++) {
        const selIdx = sortedByStart[ri];
        const w = selectedWindows[selIdx];
        allPrintEvents.push({ type: 'window', selIdx, rangeStart: w.windowStart, rangeEnd: w.windowEnd, filaments: windowRunFilaments[selIdx] });
        if (ri + 1 < sortedByStart.length) {
            const gapStart = w.windowEnd + 1;
            const gapEnd = selectedWindows[sortedByStart[ri + 1]].windowStart - 1;
            if (gapStart <= gapEnd) addVirtualRange(gapStart, gapEnd);
        }
    }
    // Post-window range
    if (sortedByStart.length > 0) {
        const lastW = selectedWindows[sortedByStart[sortedByStart.length - 1]];
        if (lastW.windowEnd + 1 < layers.length) {
            addVirtualRange(lastW.windowEnd + 1, layers.length - 1);
        }
    }

    // Run the optimizer over ALL events (real + virtual) in print order.
    const allAssignments = optimizeNozzleAssignments(
        allPrintEvents.map(e => e.filaments),
        N
    );

    // Map optimizer results back:
    //  - real windows  → nozzleAssignments[selIdx] (injection, for useSwapPlan)
    //  - virtual ranges → nonWindowedRanges with realized head state
    const nozzleAssignments: number[][] = new Array(selectedWindows.length);
    const nonWindowedRanges: MultiHeadRangeAssignment[] = [];
    let headState = new Array<string>(N).fill('');

    for (let ei = 0; ei < allPrintEvents.length; ei++) {
        const event = allPrintEvents[ei];
        const inj = allAssignments[ei];
        const runs = event.filaments;
        // Apply injection: active heads get new filament; IDLE (-1) keeps previous.
        headState = inj.map((r, k) => r === -1 ? headState[k] : (runs[r] ?? ''));
        if (event.type === 'window') {
            nozzleAssignments[event.selIdx!] = inj;
        } else {
            nonWindowedRanges.push({
                rangeStart: event.rangeStart,
                rangeEnd: event.rangeEnd,
                nozzleFilaments: [...headState],
            });
        }
    }

    // Backward-compat: preWindowFilaments from the first non-windowed range (if any).
    const preWindowFilaments = nonWindowedRanges.length > 0 && nonWindowedRanges[0].rangeStart === 0
        ? nonWindowedRanges[0].nozzleFilaments.filter(Boolean)
        : [];

    // Debug: show what filaments each window/range needs and what the optimizer chose.
    console.group('[MultiHead] full print-order schedule');
    for (const evt of allPrintEvents) {
        if (evt.type === 'window') {
            const selIdx = evt.selIdx!;
            const w = selectedWindows[selIdx];
            const { uniqueIndices } = windowRunInfo[selIdx];
            const runs = windowRunFilaments[selIdx];
            const assgn = nozzleAssignments[selIdx] ?? [];
            console.log(
                `  WIN  W[${w.windowStart}–${w.windowEnd}]` +
                ` Z:${w.windowBottomZ.toFixed(3)}–${w.windowTopZ.toFixed(3)} mm` +
                `  filaments: [${runs.map((id, r) => {
                    const hex = filaments.find(f => f.id === id)?.color ?? id;
                    return `${hex}(idx${uniqueIndices[r]})`;
                }).join(', ')}]`
            );
            console.log(
                `    nozzle assignments: ` +
                assgn.map((r, k) => {
                    const fid = r === -1 ? 'idle' : (runs[r] ?? '?');
                    const hex = r === -1 ? '-' : (filaments.find(f => f.id === fid)?.color ?? fid);
                    return `N${k+1}→${r === -1 ? 'idle' : hex}`;
                }).join('  ')
            );
        } else {
            const nr = nonWindowedRanges.find(r => r.rangeStart === evt.rangeStart);
            console.log(
                `  VIRT L[${evt.rangeStart}–${evt.rangeEnd}]` +
                `  filaments: [${evt.filaments.map(id => filaments.find(f => f.id === id)?.color ?? id).join(', ')}]`
            );
            if (nr) {
                console.log(
                    `    realized: ` +
                    nr.nozzleFilaments.map((fid, k) => {
                        const hex = fid ? (filaments.find(f => f.id === fid)?.color ?? fid) : 'idle';
                        return `N${k+1}→${hex}`;
                    }).join('  ')
                );
            }
        }
    }
    console.groupEnd();

    if (selectedWindows.length === 0) {
        console.log('[MultiHead ColorFirst] No windows selected — returning empty result.');
        return empty;
    }

    return {
        windows: selectedWindows,
        colorAssignments: selectedAssignments,
        uniqueLayerCount: pixels.length,
        patchedLayers: layers.slice(),
        colorLayerFilaments,
        windowRunFilaments,
        nozzleAssignments,
        preWindowFilaments,
        nonWindowedRanges,
    };
}
