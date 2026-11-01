/**
 * Run-based multi-head search. Cheap fitted-optics simulation nominates a bounded
 * shortlist; the full appearance model chooses windows and reconciles each group
 * using its original targets, usage weights, and realized physical stack.
 */

import type { AutoPaintResult } from './autoPaint.ts';
import type { Filament, MultiHeadDitherContext, MultiHeadRangeAssignment } from '../types';
import type { AppearanceEffectiveOpticsModelV1, AppearanceRankModelV1 } from '../types/appearance';
import {
    hexToRgb,
    deltaE,
    deltaELab,
    rgbToLab,
    rgbToHex,
    type RGB,
} from './autoPaint.ts';
import {
    expandZonesToPrinterLayers,
    buildPixelData,
    buildColorStack,
    startColorStack,
    appendColorStackLayer,
    correctedStackColor,
    toAppearanceLayer,
    type PrinterLayer,
    type WindowFilament,
    type WindowResult,
} from './multiHeadAnalysis.ts';
import { channelHds } from './calibration.ts';
import { createPriorEffectiveOpticsModel, resolveEffectiveTransitionOptics } from './effectiveOptics.ts';
import { deltaE2000Lab, type Lab } from './colorDifference.ts';
import { multiHeadColorTopLayers } from './multiHeadColorHeights.ts';

/**
 * Fallback filament for a window that references a filament index no longer in
 * the profile. Its per-channel HD comes from `channelHds` like any other.
 */
const FALLBACK_FILAMENT = { color: '#000000', td: 0.5 };

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
    /** Original group members: full-model scoring must not score just the RGB centroid. */
    targets?: { lab: Lab; count: number }[];
}

/**
 * Collapse imageSwatches into one ColorFirstPixel per unique printer layer.
 * Heights come from the final printable stack's target mappings, as in the
 * layer-based analyzer; unmapped swatches use the shared palette mapper.
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
    stack: AutoPaintResult['finalStack']
): ColorFirstPixel[] {
    const byLayer = new Map<number, { r: number; g: number; b: number; count: number }>();

    const mappedPixels = buildPixelData(imageSwatches, layers, colorAtLayer, stack);
    for (let i = 0; i < mappedPixels.length; i++) {
        const { targetRgb: rgb, layerIdx } = mappedPixels[i];
        const s = imageSwatches[i];
        const cnt = s.count ?? 1;

        const existing = byLayer.get(layerIdx);
        if (existing) {
            const total = existing.count + cnt;
            // Keep zero-weight groups for routing. Their first finite color is
            // sufficient until a positive-weight target supplies the centroid.
            if (total > 0) {
                existing.r = (existing.r * existing.count + rgb.r * cnt) / total;
                existing.g = (existing.g * existing.count + rgb.g * cnt) / total;
                existing.b = (existing.b * existing.count + rgb.b * cnt) / total;
            }
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
 * How the palette is grouped into optimizer color groups.
 * - 'luminance': every swatch sharing a printer layer collapses into one
 *   centroid, so the number of distinct target colors ≤ printer-layer count.
 * - 'color': distinct hues stay distinct groups within their original home
 *   layers, subject to the color-group budget.
 */
export type MultiHeadColorMode = 'luminance' | 'color';

/**
 * Budget for color-based groups. Always reserve one group per occupied home
 * layer, even when that layer count exceeds the budget, as in layer-based mode.
 */
export const COLOR_GROUP_CAP = 200;

/**
 * Safe upper bound on the head count. Every candidate window scans K^N
 * filament-order combinations (K = distinct filaments in the window, K ≤ N)
 * for consensus selection and per-color reconciliation, so cost grows
 * explosively with N: 8 heads already
 * reaches 8^8 ≈ 16.7M combinations per window. Head counts above this are
 * clamped by both the UI and the analysis.
 */
export const MAX_MULTI_HEAD_HEADS = 8;

/**
 * Per-window K^N combination budget by search depth. When K^N exceeds the
 * tier's budget the scan evaluates that many deterministic sample points
 * instead of every combination: the window's current assignment (so a sampled
 * scan can never do worse than leaving the window unchanged), every
 * assignment that changes one short block of neighbouring runs (so a large
 * window keeps what smaller windows find), and evenly-spaced points for the
 * rest. At or below the budget the scan is exhaustive. No RNG is involved, so
 * repeated runs on the same input produce identical stacks.
 */
export const COMBO_BUDGET_BY_DEPTH: Record<'fast' | 'balanced' | 'thorough', number> = {
    fast: 4096,
    balanced: 65536,
    thorough: 1_048_576,
};

/** Full-model evaluations per window/group, plus the always-retained current order. */
export const APPEARANCE_SHORTLIST_SIZE = 32;

/** Encode a slot entry as its base-K combination index (slot 0 = least significant digit). */
function entryToComboIndex(entry: number[], K: number): number {
    let idx = 0;
    let pow = 1;
    for (let j = 0; j < entry.length; j++) {
        idx += entry[j] * pow;
        pow *= K;
    }
    return idx;
}

/**
 * Assignments that differ from `current` only inside one block of `block`
 * neighbouring slots, each counted once: a block at position p (below the
 * last position) must change slot p, so it never repeats a later block.
 */
function blockNeighborhoodSize(K: number, N: number, block: number): number {
    return (N - block) * (K - 1) * K ** (block - 1) + K ** block - 1;
}

/**
 * Combination indices to evaluate for a K^N window: every index in [0, K^N)
 * when K^N ≤ budget. Otherwise the current entry, then every assignment that
 * changes only the longest block of neighbouring slots fitting in half the
 * budget, then evenly-spaced indices (both endpoints included) for the rest.
 * The evaluation count stays within budget + 1. Deterministic.
 */
export function* windowComboIndices(
    K: number,
    N: number,
    budget: number,
    currentEntry?: number[]
): Generator<number> {
    const total = K ** N;
    const alwaysInclude = currentEntry ? entryToComboIndex(currentEntry, K) : 0;
    yield alwaysInclude;
    if (total <= budget) {
        for (let i = 0; i < total; i++) {
            if (i !== alwaysInclude) yield i;
        }
        return;
    }
    let neighbors = 0;
    if (currentEntry) {
        let block = 0;
        while (block + 1 < N && blockNeighborhoodSize(K, N, block + 1) <= Math.floor(budget / 2)) block++;
        if (block > 0) {
            neighbors = blockNeighborhoodSize(K, N, block);
            const powers = Array.from({ length: N }, (_, j) => K ** j);
            for (let p = 0; p <= N - block; p++) {
                let base = alwaysInclude;
                for (let t = 0; t < block; t++) base -= currentEntry[p + t] * powers[p + t];
                for (let v = 0; v < K ** block; v++) {
                    let idx = base;
                    let rest = v;
                    for (let t = 0; t < block; t++) {
                        idx += (rest % K) * powers[p + t];
                        rest = Math.floor(rest / K);
                    }
                    if (idx === alwaysInclude) continue;
                    // Below the last block position, only blocks that change their first slot.
                    if (p < N - block && v % K === currentEntry[p]) continue;
                    yield idx;
                }
            }
        }
    }
    const samples = budget - neighbors;
    const span = total - 1;
    const denom = Math.max(1, samples - 1);
    for (let i = 0; i < samples; i++) yield Math.round((i * span) / denom);
}

interface ColorGroupResult {
    pixels: ColorFirstPixel[];
    hexToGroupIdx: Map<string, number>;
}

/**
 * Color-based grouping (the alternative to buildPixelDataColorFirst).
 *
 * Instead of merging every swatch that lands on the same printer layer, this
 * keeps distinct hues as distinct optimizer groups. Above `cap`, palette colors
 * are assigned to frequency-selected seeds on the same original home layer.
 * Reserve one seed per occupied layer before filling the remaining budget;
 * never merge targets across physical surfaces just to meet the color cap.
 * The group count is bounded by max(cap, occupied layer count), and every hex
 * maps directly to its cluster, bypassing the one-group-per-layer assumption.
 *
 * Deterministic: colors start sorted by hex and seeds have a stable tie-break,
 * so the same input always yields the same grouping.
 */
export function buildColorGroupedPixels(
    imageSwatches: Array<{ hex: string; count?: number }>,
    layers: PrinterLayer[],
    colorAtLayer: RGB[],
    stack: AutoPaintResult['finalStack'],
    cap: number
): ColorGroupResult {
    // Deduplicate palette hexes, summing pixel frequency per unique color.
    const byHex = new Map<string, { rgb: RGB; count: number }>();
    for (const s of imageSwatches) {
        const cnt = s.count ?? 1;
        const existing = byHex.get(s.hex);
        if (existing) existing.count += cnt;
        else byHex.set(s.hex, { rgb: hexToRgb(s.hex), count: cnt });
    }

    interface Cluster {
        r: number;
        g: number;
        b: number;
        count: number;
        hexes: string[];
        layerIdx: number;
    }

    // One entry per unique color, sorted by hex for deterministic downstream order.
    const entries = Array.from(byHex.entries())
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const mappedPixels = buildPixelData(entries.map(([hex]) => ({ hex })), layers, colorAtLayer, stack);
    const uniq = entries.map(([hex, { rgb, count }], i) => ({
        hex, rgb, lab: rgbToLab(rgb), count, layerIdx: mappedPixels[i].layerIdx,
    }));

    let clusters: Cluster[];
    if (uniq.length <= cap) {
        // Under the cap: every distinct color keeps its own group.
        clusters = uniq.map((u) => ({
            r: u.rgb.r, g: u.rgb.g, b: u.rgb.b, count: u.count, hexes: [u.hex], layerIdx: u.layerIdx,
        }));
    } else {
        // Keep seed selection and assignment bounded without moving any member
        // to a centroid-derived layer. Frequency ties break on hex.
        const priority = uniq
            .slice()
            .sort((a, b) => (b.count - a.count) || (a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0));
        const firstByLayer = new Map<number, typeof uniq[number]>();
        for (const u of priority) {
            if (!firstByLayer.has(u.layerIdx)) firstByLayer.set(u.layerIdx, u);
        }
        const seeds = [...firstByLayer.values()];
        const seeded = new Set(seeds.map((u) => u.hex));
        for (const u of priority) {
            if (seeds.length >= cap) break;
            if (!seeded.has(u.hex)) seeds.push(u);
        }
        const acc = seeds.map((s) => ({
            r: 0, g: 0, b: 0, count: 0, hexes: [] as string[],
            seedLab: s.lab, seedRgb: s.rgb, layerIdx: s.layerIdx,
        }));
        const seedsByLayer = new Map<number, number[]>();
        acc.forEach((seed, i) => {
            const bucket = seedsByLayer.get(seed.layerIdx);
            if (bucket) bucket.push(i);
            else seedsByLayer.set(seed.layerIdx, [i]);
        });
        for (const u of uniq) {
            let best = 0;
            let bestD = Infinity;
            for (const si of seedsByLayer.get(u.layerIdx)!) {
                const d = deltaELab(u.lab, acc[si].seedLab);
                if (d < bestD) { bestD = d; best = si; }
            }
            const g = acc[best];
            g.r += u.rgb.r * u.count;
            g.g += u.rgb.g * u.count;
            g.b += u.rgb.b * u.count;
            g.count += u.count;
            g.hexes.push(u.hex);
        }
        clusters = acc
            // Regional priorities can give visible colors zero weight. Retain
            // their physical paths without adding weight or dividing by zero.
            .filter((g) => g.hexes.length > 0)
            .map((g) => ({
                r: g.count > 0 ? g.r / g.count : g.seedRgb.r,
                g: g.count > 0 ? g.g / g.count : g.seedRgb.g,
                b: g.count > 0 ? g.b / g.count : g.seedRgb.b,
                count: g.count, hexes: g.hexes, layerIdx: g.layerIdx,
            }));
    }

    const pixels: ColorFirstPixel[] = [];
    const hexToGroupIdx = new Map<string, number>();
    clusters.forEach((c, groupIdx) => {
        const targetRgb: RGB = { r: c.r, g: c.g, b: c.b };
        const layerIdx = c.layerIdx;
        pixels.push({
            targetRgb,
            layerIdx,
            actualErr: deltaE(targetRgb, colorAtLayer[layerIdx]),
            count: c.count,
        });
        for (const hex of c.hexes) hexToGroupIdx.set(hex, groupIdx);
    });

    return { pixels, hexToGroupIdx };
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

function assignedLayer(layer: PrinterLayer, filament: WindowFilament, fallbackIdx: number): PrinterLayer {
    return {
        filamentIdx: filament.filamentIdx ?? fallbackIdx,
        filamentId: filament.filamentId,
        filamentRgb: filament.rgb,
        td: filament.td,
        thickness: layer.thickness,
        startZ: layer.startZ,
    };
}

/** Cache resolved substrates so buildColorStack and exported layers agree. */
function refreshTransitionOptics(layers: PrinterLayer[], model: AppearanceEffectiveOpticsModelV1): void {
    for (let i = 1; i < layers.length; i++) {
        if (layers[i].filamentIdx === layers[i - 1].filamentIdx) continue;
        const id = layers[i].filamentId;
        const substrate = layers[i - 1].filamentId;
        if (id && substrate) {
            layers[i] = { ...layers[i], transitionOptics: resolveEffectiveTransitionOptics(model, id, substrate) };
        }
    }
}

/** Stable top-k: first visited wins ties, including the current order. */
class AppearanceShortlist {
    entries: { entry: number[]; error: number }[] = [];
    private readonly visibleRuns: number;

    constructor(visibleRuns: number) { this.visibleRuns = visibleRuns; }

    add(entry: number[], error: number): void {
        const last = this.entries[this.entries.length - 1];
        if (this.entries.length >= APPEARANCE_SHORTLIST_SIZE && error >= last.error) return;
        // Orders differing only above the scored surface are the same candidate.
        // Sampled broad scans may also visit the very same order twice.
        if (this.entries.some((candidate) => {
            for (let r = 0; r < this.visibleRuns; r++) if (entry[r] !== candidate.entry[r]) return false;
            return true;
        })) return;
        const at = this.entries.findIndex((candidate) => error < candidate.error);
        this.entries.splice(at < 0 ? this.entries.length : at, 0, { entry, error });
        if (this.entries.length > APPEARANCE_SHORTLIST_SIZE) this.entries.pop();
    }
}

function fullModelError(pixel: ColorFirstPixel, color: RGB): number {
    // Preview and the gain gate publish uint8 colors, including uncorrected ones.
    const lab = rgbToLab(hexToRgb(rgbToHex(color)));
    if (!pixel.targets?.length || pixel.count <= 0) return deltaE2000Lab(rgbToLab(pixel.targetRgb), lab);
    return pixel.targets.reduce((sum, target) => sum + deltaE2000Lab(target.lab, lab) * target.count, 0) / pixel.count;
}

/** Evaluate only shortlisted physical prefixes; never called from the broad sweep. */
function appearanceErrors(
    layers: PrinterLayer[],
    pixels: ColorFirstPixel[],
    model: AppearanceRankModelV1,
    windowRuns: ColorRun[] = [],
    windowFilaments: WindowFilament[] = [],
    entry: number[] = []
): number[] {
    const errors = new Array<number>(pixels.length).fill(0);
    const atLayer = new Map<number, number[]>();
    let lastLayer = 0;
    for (let p = 0; p < pixels.length; p++) {
        const layer = pixels[p].layerIdx;
        lastLayer = Math.max(lastLayer, layer);
        const bucket = atLayer.get(layer);
        if (bucket) bucket.push(p);
        else atLayer.set(layer, [p]);
    }
    const state = startColorStack(layers[0]);
    const prefix = [];
    let r = 0;
    for (let i = 0; i <= lastLayer; i++) {
        while (r < windowRuns.length && i > windowRuns[r].endLayerIdx) r++;
        const run = windowRuns[r];
        const layer = run && i >= run.startLayerIdx
            ? assignedLayer(layers[i], windowFilaments[entry[r]], entry[r]) : layers[i];
        if (i > 0) appendColorStackLayer(state, layer, model.effectiveOptics);
        prefix.push(toAppearanceLayer(layer));
        const bucket = atLayer.get(i);
        if (!bucket) continue;
        const color = correctedStackColor(state.color, model, prefix);
        for (const p of bucket) errors[p] = fullModelError(pixels[p], color);
    }
    return errors;
}

/** Full-model per-group choices, always retaining the current realized path. */
function rerankAssignments(
    shortlists: AppearanceShortlist[],
    layers: PrinterLayer[],
    pixels: ColorFirstPixel[],
    appearanceModel: AppearanceRankModelV1,
    windowRuns: ColorRun[],
    windowFilaments: WindowFilament[],
    currentEntry?: number[]
): { errors: number[]; assignments: (number[] | null)[] } {
    const errors = new Array<number>(pixels.length).fill(Infinity);
    const assignments: (number[] | null)[] = new Array(pixels.length).fill(null);
    for (let p = 0; p < pixels.length; p++) {
        if (pixels[p].layerIdx < windowRuns[0].startLayerIdx) continue;
        const score = (entry: number[]) => appearanceErrors(
            layers, [pixels[p]], appearanceModel, windowRuns, windowFilaments, entry
        )[0];
        if (currentEntry) {
            errors[p] = score(currentEntry);
            assignments[p] = currentEntry.slice();
        }
        for (const candidate of shortlists[p].entries) {
            const error = score(candidate.entry);
            if (error < errors[p]) { errors[p] = error; assignments[p] = candidate.entry; }
        }
    }
    return { errors, assignments };
}

type AssignmentCache = Map<string, { entry: number[]; error: number }>;

/** Only the physical prefix/suffix outside this window can change its candidates. */
function windowContext(layers: PrinterLayer[], surface: number, runs: ColorRun[]): string {
    const start = runs[0].startLayerIdx;
    const end = runs[runs.length - 1].endLayerIdx;
    return layers.slice(0, surface + 1).filter((_, i) => i < start || i > end)
        .map((layer) => layer.filamentIdx).join(',');
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
 * With appearanceModel, rerank a bounded cheap shortlist per group with the full
 * model and weighted member CIEDE2000. Otherwise return the cheap CIE76 optimum.
 * Returns direct slot assignments and the frequency-weighted errorFactor.
 */
export function computeColorOptimalAssignments(
    windowRuns: ColorRun[],
    wEnd: number,
    layers: PrinterLayer[],
    baseColor: RGB,
    windowFilaments: WindowFilament[],
    pixels: ColorFirstPixel[],
    /** Max K^N combos to evaluate; above this the scan samples deterministically. */
    comboBudget: number = Infinity,
    /** The window's current slot assignment, always included when sampling. */
    currentEntry?: number[],
    model?: AppearanceEffectiveOpticsModelV1,
    appearanceModel?: AppearanceRankModelV1
): { errorFactor: number; affectedCount: number; assignments: (number[] | null)[] } {
    const K = windowFilaments.length;
    const N = windowRuns.length;
    const wStart = windowRuns[0].startLayerIdx;

    // Index pixels by layerIdx for O(1) lookup during the simulation sweep.
    const pixelsAtLayer = new Map<number, number[]>();
    const minErr = new Float64Array(pixels.length).fill(Infinity);
    const assignments: (number[] | null)[] = new Array(pixels.length).fill(null);
    const shortlists = pixels.map((pixel) => new AppearanceShortlist(
        windowRuns.filter((run) => run.startLayerIdx <= pixel.layerIdx).length
    ));
    // Precompute each target's Lab once; the K^N × layers loop below reuses it
    // instead of re-running rgbToLab on the fixed target every combination.
    const targetLab = pixels.map((p) => rgbToLab(p.targetRgb));
    let totalActualError = 0;
    let affectedCount = 0;
    let maxAffectedLayer = wStart - 1;

    for (let pxIdx = 0; pxIdx < pixels.length; pxIdx++) {
        const px = pixels[pxIdx];
        if (px.layerIdx < wStart) continue;
        if (currentEntry) {
            minErr[pxIdx] = appearanceModel ? Infinity : px.actualErr;
            assignments[pxIdx] = currentEntry.slice();
        }
        affectedCount += px.count;
        totalActualError += px.actualErr * px.count;
        if (px.layerIdx > maxAffectedLayer) maxAffectedLayer = px.layerIdx;
        const bucket = pixelsAtLayer.get(px.layerIdx);
        if (bucket) bucket.push(pxIdx);
        else pixelsAtLayer.set(px.layerIdx, [pxIdx]);
    }

    const prefix = startColorStack(layers[0]);
    for (let i = 1; i < wStart; i++) appendColorStackLayer(prefix, layers[i], model);
    prefix.color = baseColor;

    for (const combo of windowComboIndices(K, N, comboBudget, currentEntry)) {
        // Decode combo to slot assignments (base-K digits).
        const entry: number[] = new Array(N);
        let v = combo;
        for (let j = 0; j < N; j++) { entry[j] = v % K; v = Math.floor(v / K); }

        // Single incremental simulation through the window runs.
        const state = { ...prefix };
        for (let r = 0; r < N; r++) {
            const run = windowRuns[r];
            const filament = windowFilaments[entry[r]];
            for (let i = run.startLayerIdx; i <= run.endLayerIdx; i++) {
                appendColorStackLayer(state, assignedLayer(layers[i], filament, entry[r]), model);
                const bucket = pixelsAtLayer.get(i);
                if (bucket) {
                    const cLab = rgbToLab(state.color);
                    for (const pxIdx of bucket) {
                        const err = deltaELab(targetLab[pxIdx], cLab);
                        if (appearanceModel) shortlists[pxIdx].add(entry, err);
                        if (err < minErr[pxIdx]) { minErr[pxIdx] = err; assignments[pxIdx] = entry.slice(); }
                    }
                }
            }
        }

        // Continue above the window for colors whose layerIdx > wEnd.
        for (let i = wEnd + 1; i <= maxAffectedLayer; i++) {
            appendColorStackLayer(state, layers[i], model);
            const bucket = pixelsAtLayer.get(i);
            if (bucket) {
                const cLab = rgbToLab(state.color);
                for (const pxIdx of bucket) {
                    const err = deltaELab(targetLab[pxIdx], cLab);
                    if (appearanceModel) shortlists[pxIdx].add(entry, err);
                    if (err < minErr[pxIdx]) { minErr[pxIdx] = err; assignments[pxIdx] = entry.slice(); }
                }
            }
        }
    }

    if (appearanceModel) {
        const ranked = rerankAssignments(shortlists, layers, pixels, appearanceModel,
            windowRuns, windowFilaments, currentEntry);
        for (let p = 0; p < pixels.length; p++) {
            if (pixels[p].layerIdx < wStart) continue;
            minErr[p] = ranked.errors[p];
            assignments[p] = ranked.assignments[p];
        }
    }

    let totalMinError = 0;
    for (let pxIdx = 0; pxIdx < pixels.length; pxIdx++) {
        if (minErr[pxIdx] < Infinity) totalMinError += minErr[pxIdx] * pixels[pxIdx].count;
    }

    return { errorFactor: totalActualError - totalMinError, affectedCount, assignments };
}

// ---------------------------------------------------------------------------
// Consensus combo + layer patching (iterative pipeline helpers)
// ---------------------------------------------------------------------------

/**
 * Nominate shared and per-group orders in one cheap sweep. Full-model reranking
 * chooses a shared context for later windows, while the independent regional
 * opportunities determine whether this window is worth routing.
 */
function findWindowCandidate(
    windowRuns: ColorRun[],
    wEnd: number,
    layers: PrinterLayer[],
    baseColor: RGB,
    windowFilaments: WindowFilament[],
    pixels: ColorFirstPixel[],
    /** Max K^N combos to evaluate; above this the scan samples deterministically. */
    comboBudget: number,
    /** The window's current slot assignment, always included when sampling. */
    currentEntry: number[],
    model: AppearanceEffectiveOpticsModelV1,
    appearanceModel: AppearanceRankModelV1
): { entry: number[]; errorFactor: number; affectedCount: number; regional: ReturnType<typeof rerankAssignments> } {
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

    // Precompute each target's Lab once (see computeColorOptimalAssignments).
    const targetLab = pixels.map((p) => rgbToLab(p.targetRgb));

    const prefix = startColorStack(layers[0]);
    for (let i = 1; i < wStart; i++) appendColorStackLayer(prefix, layers[i], model);
    prefix.color = baseColor;

    const shortlist = new AppearanceShortlist(windowRuns.filter((run) => run.startLayerIdx <= maxAffectedLayer).length);
    const regionalShortlists = pixels.map((pixel) => new AppearanceShortlist(
        windowRuns.filter((run) => run.startLayerIdx <= pixel.layerIdx).length
    ));

    for (const combo of windowComboIndices(K, N, comboBudget, currentEntry)) {
        const entry: number[] = new Array(N);
        let v = combo;
        for (let j = 0; j < N; j++) { entry[j] = v % K; v = Math.floor(v / K); }

        let comboError = 0;
        const state = { ...prefix };

        for (let r = 0; r < N; r++) {
            const run = windowRuns[r];
            const filament = windowFilaments[entry[r]];
            for (let i = run.startLayerIdx; i <= run.endLayerIdx; i++) {
                appendColorStackLayer(state, assignedLayer(layers[i], filament, entry[r]), model);
                const bucket = pixelsAtLayer.get(i);
                if (bucket) {
                    const cLab = rgbToLab(state.color);
                    for (const pxIdx of bucket) {
                        const error = deltaELab(targetLab[pxIdx], cLab);
                        comboError += error * pixels[pxIdx].count;
                        regionalShortlists[pxIdx].add(entry, error);
                    }
                }
            }
        }
        for (let i = wEnd + 1; i <= maxAffectedLayer; i++) {
            appendColorStackLayer(state, layers[i], model);
            const bucket = pixelsAtLayer.get(i);
            if (bucket) {
                const cLab = rgbToLab(state.color);
                for (const pxIdx of bucket) {
                    const error = deltaELab(targetLab[pxIdx], cLab);
                    comboError += error * pixels[pxIdx].count;
                    regionalShortlists[pxIdx].add(entry, error);
                }
            }
        }

        shortlist.add(entry, comboError);
    }

    const score = (entry: number[]) => appearanceErrors(
        layers, pixels, appearanceModel, windowRuns, windowFilaments, entry
    ).reduce((sum, error, p) => sum + (pixels[p].layerIdx >= wStart ? error * pixels[p].count : 0), 0);
    let bestEntry = currentEntry.slice();
    let bestError = score(bestEntry);
    for (const candidate of shortlist.entries) {
        const error = score(candidate.entry);
        if (error < bestError) { bestError = error; bestEntry = candidate.entry; }
    }
    // Windows route regions independently. A useful window need not improve
    // one global ordering; rank its realizable per-region opportunities.
    const regional = rerankAssignments(regionalShortlists, layers, pixels, appearanceModel,
        windowRuns, windowFilaments, currentEntry);
    bestError = regional.errors.reduce((sum, error, p) => sum + (
        pixels[p].layerIdx >= wStart ? error * pixels[p].count : 0
    ), 0);

    return {
        entry: bestEntry,
        errorFactor: Math.max(0, totalActualError - bestError),
        affectedCount,
        regional,
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
    filaments: Filament[],
    model: AppearanceEffectiveOpticsModelV1
): void {
    for (let r = 0; r < windowRuns.length; r++) {
        const run = windowRuns[r];
        const fi = uniqueIndices[entry[r]];
        const f = filaments[fi] ?? FALLBACK_FILAMENT;
        const rgb = hexToRgb(f.color);
        const td = channelHds(f);
        for (let i = run.startLayerIdx; i <= run.endLayerIdx; i++) {
            layers[i] = assignedLayer(layers[i], {
                filamentIdx: fi,
                filamentId: filaments[fi]?.id,
                rgb,
                td,
            }, fi);
        }
    }
    refreshTransitionOptics(layers, model);
}

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

/** Physical routing and schedule produced by the run-based search. */
export interface ColorFirstResult {
    /** Windows selected by the iterative consensus loop, in application order. */
    windows: WindowResult[];
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
     * Assignments are reconciled in bounded sweeps against each group's realized
     * prefix and suffix, retaining its original stack if no improvement is found.
     */
    colorLayerFilaments: Map<string, number[]>;
    /** Actual per-color printed tops when dither pixels were supplied. -1 means absent. */
    colorPrintTopLayers?: Map<string, number>;
    /**
     * Unique filament IDs required by final printable color paths in each window.
     * These slots index nozzleAssignments; windows[w].filamentIds retains the
     * original candidate set used by the search.
     */
    windowRunFilaments: string[][];
    /**
     * Optimal nozzle-to-run-slot permutation per window, minimising total nozzle
     * filament swaps across all window transitions.  Idle nozzles (between windows)
     * keep their previous filament at zero swap cost.
     *
     * nozzleAssignments[w][k] indexes windowRunFilaments[w] for nozzle (k+1).
     * -1 leaves a head idle, carrying its previous filament forward.
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
 * filament at zero swap cost — the schedule tracks all N nozzles so that a
 * filament parked on an idle nozzle is reused for free if the same filament
 * is needed again in a later window.
 *
 * @param windowRunFilaments  Unique required filament IDs per window (input slot r)
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

    // Nozzle labels are interchangeable: this is offline caching with all of an
    // event's filaments pinned at once. Keep hits and evict the unneeded filament
    // whose next use is farthest away (Belady's rule). Exchanging any earlier-used
    // victim for this one cannot add a later load, so the schedule is swap-optimal.
    // Precompute next uses in O(total slots); scheduling costs O(W * N^2), without
    // enumerating head permutations. Prefer an empty head to a loaded one on
    // ties, allowing the schedule to preload its first use before printing.
    // Other ties keep the lowest numbered nozzle.
    const nextUses: number[][] = new Array(W);
    const nextUse = new Map<string, number>();
    for (let w = W - 1; w >= 0; w--) {
        nextUses[w] = windowRunFilaments[w].map((id) => nextUse.get(id) ?? Infinity);
        for (const id of windowRunFilaments[w]) nextUse.set(id, w);
    }

    const state: (string | null)[] = new Array(N).fill(null);
    const result: number[][] = [];
    let bestCost = 0;
    for (let w = 0; w < W; w++) {
        const runs = windowRunFilaments[w];
        const required = new Set(runs);
        const assignment = new Array<number>(N).fill(IDLE);
        for (let r = 0; r < runs.length; r++) nextUse.set(runs[r], nextUses[w][r]);

        // Reserve every already-loaded requirement before loading missing ones.
        for (let r = 0; r < runs.length; r++) {
            const k = state.findIndex((id, k) => id === runs[r] && assignment[k] === IDLE);
            if (k !== -1) assignment[k] = r;
        }
        for (let r = 0; r < runs.length; r++) {
            if (assignment.includes(r)) continue;
            let victim = -1;
            let farthest = -1;
            for (let k = 0; k < N; k++) {
                if (assignment[k] !== IDLE || (state[k] !== null && required.has(state[k]!))) continue;
                const next = state[k] === null ? Infinity : (nextUse.get(state[k]!) ?? Infinity);
                if (next > farthest ||
                    (next === farthest && state[k] === null && victim >= 0 && state[victim] !== null)) {
                    victim = k; farthest = next;
                }
            }
            if (victim === -1) throw new Error('Window requires more filaments than available nozzles');
            state[victim] = runs[r];
            assignment[victim] = r;
            if (w > 0) bestCost++;
        }
        result.push(assignment);
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
    let traceState = new Array(N).fill('');
    console.log('  Nozzle state trace:');
    for (let w = 0; w < W; w++) {
        const runs = windowRunFilaments[w];
        const assgn = result[w];
        const newState = assgn.map((r, k) => r === -1 ? traceState[k] : (runs[r] ?? '?'));
        const changes = newState.filter((fid, k) => fid !== traceState[k]).length;
        console.log(`    w${w}: [${newState.join(' | ')}]  (+${changes} swaps)`);
        traceState = newState;
    }
    console.groupEnd();
    return result;
}

/** Select non-overlapping windows, then reconcile each group's realized path. */
export function runMultiHeadLayerAnalysisColorFirst(
    filaments: Filament[],
    result: AutoPaintResult,
    imageSwatches: Array<{ hex: string; count?: number }>,
    layerHeight: number,
    firstLayerHeight: number,
    n: number,
    searchDepth: 'fast' | 'balanced' | 'thorough' = 'balanced',
    colorMode: MultiHeadColorMode = 'luminance',
    heightDithering = false,
    ditherContext?: MultiHeadDitherContext
): ColorFirstResult {
    const N = Math.min(n, filaments.length, MAX_MULTI_HEAD_HEADS);
    const comboBudget = COMBO_BUDGET_BY_DEPTH[searchDepth];
    const empty: ColorFirstResult = { windows: [], patchedLayers: [], colorLayerFilaments: new Map(), windowRunFilaments: [], nozzleAssignments: [], preWindowFilaments: [], nonWindowedRanges: [] };

    if (N < 2 || result.transitionZones.length === 0 || imageSwatches.length === 0) {
        console.log('[MultiHead ColorFirst] Insufficient data (need ≥2 filaments and image swatches).');
        return empty;
    }

    // Mutable layer stack — patched in-place each iteration as windows are applied.
    const layers = expandZonesToPrinterLayers(result, filaments, layerHeight, firstLayerHeight);
    const originalLayers = layers.slice();

    // Run boundaries are fixed for the life of the analysis; only filament
    // assignments within runs change as windows are applied.
    const runs = buildColorRuns(layers);

    // A window reorders up to N consecutive runs above the foundation run. With
    // more heads than such runs, one window spans all of them and the spare
    // heads stay empty, so extra heads never leave nothing to search.
    const windowSize = Math.min(N, runs.length - 1);
    if (windowSize < 2) {
        console.log(`[MultiHead ColorFirst] Not enough color runs above the foundation for a window (${runs.length} runs).`);
        return empty;
    }
    const effectiveOptics = result.finalStack.appearanceModel.effectiveOptics;
    const model = effectiveOptics?.filaments.length ? effectiveOptics : createPriorEffectiveOpticsModel(filaments);
    const appearanceModel = { ...result.finalStack.appearanceModel, effectiveOptics: model };

    // Color groups are fixed (derived from image content, not the stack).
    const initialColorAtLayer = buildColorStack(layers);

    // Build optimizer color groups per the selected mode. 'luminance' (default)
    // collapses every swatch sharing a printer layer into one centroid, so the
    // distinct color count is capped at the printer-layer count. 'color' keeps
    // distinct hues as separate groups within a budget, without merging home
    // layers. Printed colors and error depend on the selected windows and paths.
    let pixels: ColorFirstPixel[];
    let hexToGroupIdx: Map<string, number>;
    if (colorMode === 'color') {
        const grouped = buildColorGroupedPixels(
            imageSwatches, layers, initialColorAtLayer,
            result.finalStack, COLOR_GROUP_CAP
        );
        pixels = grouped.pixels;
        hexToGroupIdx = grouped.hexToGroupIdx;
    } else {
        pixels = buildPixelDataColorFirst(
            imageSwatches, layers, initialColorAtLayer,
            result.finalStack
        );
        const layerIdxToGroupIdx = new Map<number, number>(pixels.map((p, i) => [p.layerIdx, i]));
        hexToGroupIdx = new Map<string, number>();
        const mappedPixels = buildPixelData(imageSwatches, layers, initialColorAtLayer, result.finalStack);
        for (let i = 0; i < imageSwatches.length; i++) {
            const groupIdx = layerIdxToGroupIdx.get(mappedPixels[i].layerIdx);
            if (groupIdx !== undefined) hexToGroupIdx.set(imageSwatches[i].hex, groupIdx);
        }
    }

    // Preserve regional priorities and the original targets within each group.
    // A centroid is only a cheap broad-search proxy for weighted CIEDE2000.
    for (const pixel of pixels) pixel.targets = [];
    for (const swatch of imageSwatches) {
        const group = hexToGroupIdx.get(swatch.hex);
        if (group !== undefined) pixels[group].targets!.push({
            lab: rgbToLab(hexToRgb(swatch.hex)), count: swatch.count ?? 1,
        });
    }

    const selectedWindows: WindowResult[] = [];
    // Per selected window: the run decomposition + unique filament indices, used
    // after the loop to build the per-colour filament-per-layer map.
    const windowRunInfo: { runs: ColorRun[]; uniqueIndices: number[]; assignmentCache: AssignmentCache[] }[] = [];
    // Layers already claimed by a selected window — windows must not overlap so
    // that each layer has exactly one per-colour assignment source.
    const layerUsed: boolean[] = new Array(layers.length).fill(false);
    const heads = filaments.slice(0, N).map((f, i) => `[${i}] ${f.name ?? f.color}`).join('  ');
    // searchDepth controls three knobs together, so the tier label is honest:
    //   fast:      high threshold + half the iteration budget + small combo budget
    //              → fewer windows opened, fewer filament orders tried, quick exit
    //   balanced:  default values
    //   thorough:  low threshold + full iteration budget + large combo budget
    //              → more windows, near-exhaustive filament-order search
    // (the combo budget is `comboBudget`, computed above from searchDepth).
    const MIN_IMPROVEMENT = searchDepth === 'fast' ? 5e-4 : searchDepth === 'thorough' ? 2e-5 : 1e-4;
    // Upper bound: at most floor(runs/windowSize) non-overlapping windows.
    const maxIter = searchDepth === 'fast'
        ? Math.max(1, Math.floor(runs.length / windowSize / 2))
        : Math.floor(runs.length / windowSize);

    console.group(
        `[MultiHead ColorFirst] N=${N} heads | ${pixels.length} color groups` +
        ` (from ${imageSwatches.length} swatches) | iterative`
    );
    console.log(`  Heads: ${heads}`);

    for (let iter = 0; iter < maxIter; iter++) {
        // Rebuild the blended color stack from the (possibly patched) layers.
        const colorAtLayer = buildColorStack(layers);

        // Refresh full-model errors against this realizable consensus stack.
        const errors = appearanceErrors(layers, pixels, appearanceModel);
        for (let pxIdx = 0; pxIdx < pixels.length; pxIdx++) {
            pixels[pxIdx].actualErr = errors[pxIdx];
        }

        // Select the window with the greatest full-model regional opportunity.
        let bestWindowRuns: ColorRun[] | null = null;
        let bestUniqueIndices: number[] | null = null;
        let bestEntry: number[] | null = null;
        let bestErrorFactor = MIN_IMPROVEMENT;
        let bestAffectedCount = 0;
        let bestRegional: ReturnType<typeof rerankAssignments> | null = null;

        for (let rStart = 0; rStart + windowSize <= runs.length; rStart++) {
            const windowRuns = runs.slice(rStart, rStart + windowSize);
            const wStart = windowRuns[0].startLayerIdx;
            if (wStart === 0) continue; // skip foundation

            const wEnd = windowRuns[windowSize - 1].endLayerIdx;

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
                filamentIdx: fi,
                filamentId: filaments[fi]?.id,
                rgb: hexToRgb(filaments[fi]?.color ?? '#000000'),
                td: channelHds(filaments[fi] ?? FALLBACK_FILAMENT),
            }));
            const currentEntry = windowRuns.map(
                (r) => uniqueIndices.indexOf(layers[r.startLayerIdx].filamentIdx)
            );

            const { entry, errorFactor, affectedCount, regional } = findWindowCandidate(
                windowRuns, wEnd, layers, colorAtLayer[wStart - 1], windowFilaments, pixels,
                comboBudget, currentEntry, model, appearanceModel
            );

            if (errorFactor > bestErrorFactor) {
                bestWindowRuns = windowRuns;
                bestUniqueIndices = uniqueIndices;
                bestEntry = entry;
                bestErrorFactor = errorFactor;
                bestAffectedCount = affectedCount;
                bestRegional = regional;
            }
        }

        if (!bestWindowRuns || !bestEntry || !bestUniqueIndices || !bestRegional) break;

        const wStart = bestWindowRuns[0].startLayerIdx;
        const wEnd = bestWindowRuns[windowSize - 1].endLayerIdx;

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
        };

        // Keep fully scored regional choices for unchanged physical contexts.
        const assignmentCache = pixels.map((pixel, p) => {
            const cache: AssignmentCache = new Map();
            const entry = bestRegional.assignments[p];
            if (entry) cache.set(windowContext(layers, pixel.layerIdx, bestWindowRuns), {
                entry, error: bestRegional.errors[p],
            });
            return cache;
        });

        // Patch the layer stack with the consensus ordering so the next
        // iteration's base (and any non-window layers) stay a single realisable
        // stack for window selection.
        applyComboToLayers(layers, bestWindowRuns, bestEntry, bestUniqueIndices, filaments, model);

        // Claim this window's layers so later iterations cannot overlap them.
        for (let i = wStart; i <= wEnd; i++) layerUsed[i] = true;

        selectedWindows.push(w);
        windowRunInfo.push({ runs: bestWindowRuns, uniqueIndices: bestUniqueIndices, assignmentCache });

        console.log(
            `  ★ iter ${iter + 1}  W[${String(wStart).padStart(3)}–${String(wEnd).padStart(3)}]` +
            `  Z: ${layers[wStart].startZ.toFixed(3)}–${(layers[wEnd].startZ + layers[wEnd].thickness).toFixed(3)} mm` +
            `  |  [${w.currentFilaments.join(' → ')}]` +
            `  |  errorFactor: ${bestErrorFactor.toFixed(4)}`
        );
    }

    console.log(`  Total: ${selectedWindows.length} window(s) applied.`);
    console.groupEnd();
    if (selectedWindows.length === 0) return empty;

    // Reconcile each color group on its own realized stack. Start with the
    // original assignment so no group's error can worsen; each coordinate scan
    // keeps the current combo on ties and includes it even in sampled searches.
    // Bounded sweeps allow earlier windows to respond to changed suffixes while
    // retaining the best realized stack if the search budget is exhausted.
    const globalSeq = layers.map((l) => l.filamentIdx);
    const colorLayerFilaments = new Map<string, number[]>();
    const sortedByStart = Array.from({ length: selectedWindows.length }, (_, i) => i)
        .sort((a, b) => selectedWindows[a].windowStart - selectedWindows[b].windowStart);
    const groupSequences: number[][] = [];
    for (const [p, pixel] of pixels.entries()) {
        const realized = originalLayers.slice();
        const entries = windowRunInfo.map(({ runs, uniqueIndices }) =>
            runs.map((run) => uniqueIndices.indexOf(originalLayers[run.startLayerIdx].filamentIdx))
        );
        for (let pass = 0; pass < 4; pass++) {
            let changed = false;
            for (const wi of sortedByStart) {
                const { runs: wRuns, uniqueIndices, assignmentCache } = windowRunInfo[wi];
                const wStart = wRuns[0].startLayerIdx;
                if (pixel.layerIdx < wStart) continue;
                const colors = buildColorStack(realized);
                const windowFilaments = uniqueIndices.map((fi) => ({
                    filamentIdx: fi,
                    filamentId: filaments[fi]?.id,
                    rgb: hexToRgb(filaments[fi]?.color ?? '#000000'),
                    td: channelHds(filaments[fi] ?? FALLBACK_FILAMENT),
                }));
                const actualErr = appearanceErrors(realized, [pixel], appearanceModel)[0];
                const context = windowContext(realized, pixel.layerIdx, wRuns);
                let cached = assignmentCache[p].get(context);
                if (!cached) {
                    const { assignments } = computeColorOptimalAssignments(
                        wRuns, wRuns[wRuns.length - 1].endLayerIdx, realized, colors[wStart - 1],
                        windowFilaments, [{ ...pixel, actualErr }], comboBudget, entries[wi], model, appearanceModel
                    );
                    const entry = assignments[0]!;
                    cached = { entry, error: appearanceErrors(realized, [pixel], appearanceModel,
                        wRuns, windowFilaments, entry)[0] };
                    assignmentCache[p].set(context, cached);
                }
                const entry = cached.error < actualErr ? cached.entry : entries[wi];
                if (entry.some((slot, r) => slot !== entries[wi][r])) {
                    applyComboToLayers(realized, wRuns, entry, uniqueIndices, filaments, model);
                    entries[wi] = entry;
                    changed = true;
                }
            }
            if (!changed) break;
        }
        const seq = globalSeq.slice();
        for (const wi of sortedByStart) {
            const w = selectedWindows[wi];
            if (pixel.layerIdx < w.windowStart) continue;
            for (let i = w.windowStart; i <= w.windowEnd; i++) seq[i] = realized[i].filamentIdx;
        }
        groupSequences.push(seq);
    }
    for (const [hex, groupIdx] of hexToGroupIdx) {
        colorLayerFilaments.set(hex, groupSequences[groupIdx]);
    }

    // Score/search groups retain their original home layers. Scheduling instead
    // considers only the layers each physical color can print, including those
    // reachable through shared height-dithering blocks. Zero-weight
    // regions remain requirements; complete path suffixes above them do not.
    const colorTopLayers = multiHeadColorTopLayers(
        result.finalStack, colorLayerFilaments.keys(),
        layers.map((layer) => layer.startZ + layer.thickness),
        heightDithering ? layerHeight : undefined,
        ditherContext
    );
    const lastPrintedLayer = [...colorTopLayers.values()].reduce((last, top) => Math.max(last, top), -1);
    const windowRunFilaments: string[][] = windowRunInfo.map(({ uniqueIndices }, wi) => {
        const required = new Set<number>();
        const window = selectedWindows[wi];
        for (const [hex, path] of colorLayerFilaments) {
            const top = Math.min(window.windowEnd, colorTopLayers.get(hex)!);
            for (let l = window.windowStart; l <= top; l++) required.add(path[l]);
        }
        // Keep the original order without changing the color-assignment indices.
        return uniqueIndices.filter((fi) => required.has(fi))
            .map((fi) => filaments[fi]?.id ?? `f${fi}`);
    });

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

    // Add virtual events for a layer range, splitting into ≤N sub-ranges if needed.
    const allPrintEvents: PrintEvent[] = [];
    const addVirtualRange = (rangeStart: number, rangeEnd: number) => {
        let subStart = rangeStart;
        const curFils: string[] = [];
        const inCur = new Set<string>();
        for (let l = rangeStart; l <= Math.min(rangeEnd, lastPrintedLayer); l++) {
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
        // Retain even wholly unprinted ranges as idle carryover, so physical
        // layer boundaries and foundation/gap/post-window routing stay intact.
        allPrintEvents.push({ type: 'virtual', rangeStart: subStart, rangeEnd, filaments: [...curFils] });
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
            const runs = windowRunFilaments[selIdx];
            const assgn = nozzleAssignments[selIdx] ?? [];
            console.log(
                `  WIN  W[${w.windowStart}–${w.windowEnd}]` +
                ` Z:${w.windowBottomZ.toFixed(3)}–${w.windowTopZ.toFixed(3)} mm` +
                `  filaments: [${runs.map((id) => {
                    const hex = filaments.find(f => f.id === id)?.color ?? id;
                    return `${hex}(idx${filaments.findIndex(f => f.id === id)})`;
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

    return {
        windows: selectedWindows,
        patchedLayers: layers.slice(),
        colorLayerFilaments,
        ...(heightDithering && ditherContext ? { colorPrintTopLayers: colorTopLayers } : {}),
        windowRunFilaments,
        nozzleAssignments,
        preWindowFilaments,
        nonWindowedRanges,
    };
}
