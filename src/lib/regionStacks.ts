/**
 * Per-region filament stacks for Auto-paint (#151).
 *
 * Normal Auto-paint gives every target color a prefix of one shared filament
 * sequence. Here each target picks its own short stack instead: the shared
 * opaque foundation followed by up to a few runs of any loaded filament, on
 * the same layer grid. Each target's shared prefix always stays a candidate,
 * so no target is predicted worse than with the shared sequence.
 *
 * Several filaments then share a printed layer, and every extra filament on a
 * layer costs a tool change. A cap limits how many distinct filaments any
 * layer may hold. Which stacks meet on a layer depends on their alignment:
 * relief stacks start together on the plate, Flat Paint stacks end together
 * at the viewing face with foundation filling the rest of each column.
 *
 * Planning is deterministic: ties always resolve by filament and target order.
 */

import type { AutoPaintResult, RGB } from './autoPaint.ts';
import { hexToRgb, mapTargetsToPrintablePalette, rgbToHex, rgbToLab } from './autoPaint.ts';
import { deltaE2000Lab, type Lab } from './colorDifference.ts';
import {
    blendEffectiveTransition,
    createPriorEffectiveOpticsModel,
    predictEffectiveRecipeColor,
    resolveEffectiveTransitionOptics,
    type EffectiveTransitionOptics,
} from './effectiveOptics.ts';
import { normalizeHexColor } from './colorUtils.ts';
import {
    buildStackLayout,
    type FlatPaintLayout,
    type StackLayoutOrientation,
} from './flatPaint.ts';
import { correctedStackColor } from './multiHeadAnalysis.ts';
import { escapeXmlAttribute } from './xml.ts';
import type {
    Filament,
    RegionStack,
    RegionStackAlignment,
    RegionStackPlan,
    RegionStackRun,
} from '../types/index.ts';
import type {
    AppearanceAnchorLayer,
    AppearanceEffectiveOpticsModelV1,
} from '../types/appearance.ts';

/** Runs a stack may add above the shared foundation. */
export const DEFAULT_REGION_STACK_RUNS = 3;
export const DEFAULT_MAX_FILAMENTS_PER_LAYER = 4;
export const MIN_MAX_FILAMENTS_PER_LAYER = 2;
/**
 * Most target colors planned per build. Every distinct stack needs its own
 * full-size mask, so larger palettes fall back to the shared sequence.
 */
export const MAX_REGION_STACK_TARGETS = 128;
/** Bytes all per-stack masks may use; one byte per pixel per distinct stack. */
export const REGION_STACK_MASK_BUDGET = 512 * 1024 * 1024;
export const MAX_MAX_FILAMENTS_PER_LAYER = 16;

/** Clamp a stored or typed per-layer filament cap to a whole number in range. */
export function normalizeMaxFilamentsPerLayer(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return DEFAULT_MAX_FILAMENTS_PER_LAYER;
    return Math.min(
        MAX_MAX_FILAMENTS_PER_LAYER,
        Math.max(MIN_MAX_FILAMENTS_PER_LAYER, Math.round(value))
    );
}
const DEFAULT_BEAM_WIDTH = 16;
/** Stacks per target re-ranked with the full appearance model. */
const SHORTLIST_SIZE = 24;
/** Ranked alternatives kept per target for the per-layer cap. */
const CANDIDATE_LIMIT = 12;
/**
 * Every stack, the shared prefix included, pays these costs on top of its
 * color error: extra runs mean extra tool changes, and shorter stacks win
 * near-ties. A long shared prefix whose deep layers no longer change the
 * color therefore loses to its own visible top.
 */
const RUN_PENALTY = 0.2;
const LAYER_PENALTY = 0.005;
/**
 * A stack may match its target up to this much CIEDE2000 worse than the
 * shared prefix, but only while it still looks like the shared prefix's
 * color, within SAME_LOOK_TOLERANCE.
 */
const SAME_COLOR_TOLERANCE = 0.1;
const SAME_LOOK_TOLERANCE = 0.5;
/**
 * With Preserve color separation, two kept-apart colors never end up closer
 * than they were on the shared sequence, up to this clearly visible CIEDE2000.
 */
const SEPARATION_FLOOR = 3;
const DEFAULT_TOOL_CHANGE_COST = 0.01;
const HEIGHT_EPSILON = 1e-8;

export interface RegionStackPlanOptions {
    result: Pick<AutoPaintResult, 'finalStack'>;
    filaments: readonly Filament[];
    alignment: RegionStackAlignment;
    maxFilamentsPerLayer?: number;
    /**
     * Runs the search may add above the foundation. Trims of a color's shared
     * prefix keep that prefix's own runs and are not limited by this.
     */
    maxRuns?: number;
    beamWidth?: number;
    /** Mean ΔE a stack must gain per extra filament it adds to a layer. */
    toolChangeCost?: number;
    /**
     * Every printable image color. Colors Auto-paint dropped from its targets
     * (zero regional weight) still get their own stack instead of borrowing
     * the nearest planned color's.
     */
    imageSwatches?: readonly { hex: string }[];
    /** Pixels in the image; with large images fewer colors fit the mask budget. */
    pixelCount?: number;
}

interface StackNode {
    runs: RegionStackRun[];
    layerCount: number;
    /** Base optical color before appearance correction, 0-255 floats. */
    color: [number, number, number];
}

interface ScoredStack {
    runs: RegionStackRun[];
    layerCount: number;
    predictedHex: string;
    deltaE: number;
    score: number;
    shared: boolean;
}

interface Target {
    hex: string;
    lab: Lab;
    weight: number;
    sharedLayerCount: number;
    /** Auto-paint's published color for the shared prefix. */
    sharedHex: string;
    /** Preserve color separation keeps this color apart from the others. */
    keepApart: boolean;
}

/** Unambiguous identity of a stack; imported filament IDs may contain any text. */
function runKey(runs: readonly RegionStackRun[]): string {
    return JSON.stringify(runs.map((run) => [run.filamentId, run.layerCount]));
}

/** Merge per-layer filaments into runs. */
function layersToRuns(
    layers: readonly { filamentId: string; filamentColor: string }[]
): RegionStackRun[] {
    const runs: RegionStackRun[] = [];
    for (const layer of layers) {
        const last = runs.at(-1);
        if (last?.filamentId === layer.filamentId) last.layerCount++;
        else
            runs.push({
                filamentId: layer.filamentId,
                filamentColor: layer.filamentColor,
                layerCount: 1,
            });
    }
    return runs;
}

/** Filament at each layer of a stack, bottom-up. */
export function regionStackLayerFilaments(stack: Pick<RegionStack, 'runs'>): string[] {
    const layers: string[] = [];
    for (const run of stack.runs) {
        for (let i = 0; i < run.layerCount; i++) layers.push(run.filamentId);
    }
    return layers;
}

/**
 * Distinct filaments on every printed layer, bottom-up. With 'top' alignment
 * shorter stacks sit on foundation so all of them end on the last layer.
 */
export function regionStackLayerSets(
    stacks: readonly Pick<RegionStack, 'runs' | 'layerCount'>[],
    alignment: RegionStackAlignment,
    foundationFilamentId: string
): Set<string>[] {
    const layerCount = stacks.reduce((max, stack) => Math.max(max, stack.layerCount), 0);
    const sets = Array.from({ length: layerCount }, () => new Set<string>());
    for (const stack of stacks) {
        const offset = alignment === 'top' ? layerCount - stack.layerCount : 0;
        for (let i = 0; i < offset; i++) sets[i].add(foundationFilamentId);
        regionStackLayerFilaments(stack).forEach((id, i) => sets[offset + i].add(id));
    }
    return sets;
}

/**
 * Per-layer filament counts for the current assignment, so a trial move of
 * one region only re-counts the layers whose filament it changes.
 */
export class RegionLayerUsage {
    private counts: Map<string, number>[] = [];
    private sizes: number[] = [];
    private layerCount = 0;
    private maxLength = 0;
    private maxLengthCount = 0;
    private secondLength = 0;
    overflow = 0;
    /** Sum over layers of distinct filaments; each one past the first is a tool change. */
    slots = 0;

    private readonly regions: string[][];
    private readonly alignment: RegionStackAlignment;
    private readonly foundation: string;
    private readonly cap: number;

    constructor(
        regions: string[][],
        alignment: RegionStackAlignment,
        foundation: string,
        cap: number
    ) {
        this.regions = regions;
        this.alignment = alignment;
        this.foundation = foundation;
        this.cap = cap;
        this.rebuild();
    }

    /** Filament at layer i when a region with these layers sits in a stack of `height` layers. */
    private at(layers: readonly string[], height: number, i: number): string | undefined {
        const offset = this.alignment === 'top' ? height - layers.length : 0;
        return i < offset ? this.foundation : layers[i - offset];
    }

    private rebuild(): void {
        const lengths = this.regions.map((layers) => layers.length);
        this.layerCount = Math.max(0, ...lengths);
        this.maxLength = this.layerCount;
        this.maxLengthCount = lengths.filter((length) => length === this.maxLength).length;
        this.secondLength = Math.max(0, ...lengths.filter((length) => length < this.maxLength));
        this.counts = Array.from({ length: this.layerCount }, () => new Map<string, number>());
        for (const layers of this.regions) {
            for (let i = 0; i < this.layerCount; i++) {
                const id = this.at(layers, this.layerCount, i);
                if (id !== undefined) this.counts[i].set(id, (this.counts[i].get(id) ?? 0) + 1);
            }
        }
        this.sizes = this.counts.map((count) => count.size);
        this.overflow = this.sizes.reduce((sum, size) => sum + Math.max(0, size - this.cap), 0);
        this.slots = this.sizes.reduce((sum, size) => sum + size, 0);
    }

    get peak(): number {
        return Math.max(0, ...this.sizes);
    }

    /** Overflow and filament slots if region t switched to these layers. */
    trial(t: number, layers: readonly string[]): { overflow: number; slots: number } {
        const current = this.regions[t];
        const others =
            current.length === this.maxLength && this.maxLengthCount === 1
                ? this.secondLength
                : this.maxLength;
        const height = Math.max(others, layers.length);
        if (this.alignment === 'top' && height !== this.layerCount) {
            // A new tallest stack moves every top-aligned column; count from scratch.
            const regions = [...this.regions];
            regions[t] = [...layers];
            const usage = new RegionLayerUsage(regions, this.alignment, this.foundation, this.cap);
            return { overflow: usage.overflow, slots: usage.slots };
        }
        let overflow = this.overflow;
        let slots = this.slots;
        for (let i = 0; i < Math.max(height, this.layerCount); i++) {
            const before = this.at(current, this.layerCount, i);
            const after = this.at(layers, height, i);
            if (before === after) continue;
            const count = this.counts[i];
            const size = this.sizes[i] ?? 0;
            const next =
                size -
                (before !== undefined && count?.get(before) === 1 ? 1 : 0) +
                (after !== undefined && !count?.get(after) ? 1 : 0);
            overflow += Math.max(0, next - this.cap) - Math.max(0, size - this.cap);
            slots += next - size;
        }
        return { overflow, slots };
    }

    apply(t: number, layers: readonly string[]): void {
        this.regions[t] = [...layers];
        this.rebuild();
    }
}

/**
 * Estimated tool changes: every extra filament within a layer is one change,
 * and moving to the next layer is free when it can start with a filament the
 * previous layer used.
 */
export function estimateRegionStackToolChanges(sets: readonly Set<string>[]): number {
    let changes = 0;
    for (let i = 0; i < sets.length; i++) {
        changes += Math.max(0, sets[i].size - 1);
        if (i > 0 && ![...sets[i]].some((id) => sets[i - 1].has(id))) changes++;
    }
    return changes;
}

/**
 * Plan one stack per Auto-paint target, then enforce the per-layer filament
 * cap. Returns null when the result has no printable stack or targets, when
 * its targets plus any zero-weight image swatches exceed MAX_REGION_STACK_TARGETS
 * or the image's share of REGION_STACK_MASK_BUDGET, or when no plan fits the cap.
 */
export function planRegionStacks(options: RegionStackPlanOptions): RegionStackPlan | null {
    const stack = options.result.finalStack;
    const cap = Math.max(
        1,
        Math.floor(options.maxFilamentsPerLayer ?? DEFAULT_MAX_FILAMENTS_PER_LAYER)
    );
    const maxRuns = Math.max(0, Math.floor(options.maxRuns ?? DEFAULT_REGION_STACK_RUNS));
    const beamWidth = Math.max(1, Math.floor(options.beamWidth ?? DEFAULT_BEAM_WIDTH));
    const slotCost = Math.max(0, options.toolChangeCost ?? DEFAULT_TOOL_CHANGE_COST);
    const { layerHeight, firstLayerHeight } = stack.settings;
    if (!stack.layers.length || !stack.targetMappings.length || !(layerHeight > 0)) return null;

    const foundationLayer = stack.layers[0];
    const foundationId = foundationLayer.filamentId;
    const rankModel = stack.appearanceModel;
    const optics: AppearanceEffectiveOpticsModelV1 = rankModel.effectiveOptics?.filaments.length
        ? rankModel.effectiveOptics
        : createPriorEffectiveOpticsModel([...options.filaments]);
    const foundationColor = predictEffectiveRecipeColor(optics, foundationId, []);
    if (!foundationColor) return null;

    const layersAtHeight = (height: number) =>
        height + HEIGHT_EPSILON < firstLayerHeight
            ? 0
            : 1 + Math.floor((height - firstLayerHeight) / layerHeight + 1e-6);
    const maxHeight =
        stack.settings.printableMaxHeight > 0
            ? stack.settings.printableMaxHeight
            : stack.totalHeight;
    const maxLayers = Math.max(stack.layers.length, layersAtHeight(maxHeight));
    // Reuse the shared sequence's foundation thickness, so a stack that only
    // needs foundation lines up with every shared prefix.
    const foundationLayers = Math.max(
        1,
        stack.layers.filter((layer) => layer.zoneIndex === stack.layers[0].zoneIndex).length
    );

    // Only filaments the optics model can predict take part; the shared
    // sequence's filaments always can, because it was built with this model.
    const filaments = options.filaments.filter(
        (filament) => predictEffectiveRecipeColor(optics, filament.id, []) !== undefined
    );
    const transitionCache = new Map<string, EffectiveTransitionOptics | undefined>();
    const transition = (foreground: string, substrate: string) => {
        // Imported filament IDs may contain any character, NUL included.
        const key = JSON.stringify([foreground, substrate]);
        if (!transitionCache.has(key)) {
            transitionCache.set(
                key,
                resolveEffectiveTransitionOptics(optics, foreground, substrate)
            );
        }
        return transitionCache.get(key);
    };

    const anchorLayers = (runs: readonly RegionStackRun[]): AppearanceAnchorLayer[] => {
        const layers: AppearanceAnchorLayer[] = [];
        for (const run of runs) {
            for (let i = 0; i < run.layerCount; i++) {
                layers.push({
                    filamentId: run.filamentId,
                    filamentColor: run.filamentColor,
                    thickness: layers.length === 0 ? firstLayerHeight : layerHeight,
                });
            }
        }
        return layers;
    };

    const correctedHex = (color: readonly [number, number, number], runs: RegionStackRun[]) =>
        rgbToHex(correctedStackColor(toRgb(color), rankModel, anchorLayers(runs)));

    const scoreStack = (
        target: Target,
        runs: RegionStackRun[],
        layerCount: number,
        color: readonly [number, number, number]
    ): ScoredStack => {
        // Score the published uint8 color, as the preview and the gain gate do.
        const predictedHex = correctedHex(color, runs);
        const deltaE = deltaE2000Lab(target.lab, rgbToLab(hexToRgb(predictedHex)));
        return {
            runs,
            layerCount,
            predictedHex,
            deltaE,
            score: deltaE + stackCost(runs.length, layerCount),
            shared: false,
        };
    };

    const sharedLayers = stack.layers.map((layer) => ({
        filamentId: layer.filamentId,
        filamentColor: layer.filamentColor,
    }));
    const separationLimit = stack.settings.separationMaxDeltaE;
    const sharedLayerCount = (height: number) =>
        Math.min(stack.layers.length, Math.max(1, layersAtHeight(height)));
    const targets: Target[] = stack.targetMappings.map((mapping) => ({
        hex: mapping.targetColor.hex,
        lab: { L: mapping.targetLab[0], a: mapping.targetLab[1], b: mapping.targetLab[2] },
        weight: Math.max(0, mapping.usageWeight),
        sharedLayerCount: sharedLayerCount(
            stack.palette[mapping.paletteIndex]?.height ?? mapping.projectedHeight
        ),
        sharedHex: mapping.predictedColor.hex,
        keepApart: separationLimit !== undefined && mapping.preservedWithinThreshold !== false,
    }));

    // Colors Auto-paint dropped for zero regional weight keep their own
    // shared baseline: the published palette entry they map to.
    const planned = new Set(targets.map((target) => rgbKey(target.hex)));
    for (const swatch of options.imageSwatches ?? []) {
        const key = rgbKey(swatch.hex);
        if (planned.has(key) || !stack.palette.length) continue;
        planned.add(key);
        const lab = rgbToLab(hexToRgb(swatch.hex));
        const [mapped] = mapTargetsToPrintablePalette(
            stack.palette.map((entry) => ({
                height: entry.height,
                rgb: {
                    r: entry.predictedColor.rgb[0],
                    g: entry.predictedColor.rgb[1],
                    b: entry.predictedColor.rgb[2],
                },
                lab: {
                    L: entry.predictedLab[0],
                    a: entry.predictedLab[1],
                    b: entry.predictedLab[2],
                },
                surfaceEligible: entry.surfaceEligible,
                predictionConfidence: entry.predictionConfidence,
                exactAnchorId: entry.exactAnchorId,
                exactAnchorTargetLab: entry.exactAnchorTargetLab
                    ? {
                          L: entry.exactAnchorTargetLab[0],
                          a: entry.exactAnchorTargetLab[1],
                          b: entry.exactAnchorTargetLab[2],
                      }
                    : undefined,
            })),
            [{ ...lab, weight: 1 }]
        );
        const entry = stack.palette[mapped.paletteIndex];
        targets.push({
            hex: rgbToHex(hexToRgb(swatch.hex)),
            lab,
            weight: 0,
            sharedLayerCount: sharedLayerCount(entry.height),
            sharedHex: entry.predictedColor.hex,
            keepApart: false,
        });
    }
    // Each distinct stack needs a full-size mask, so large images plan fewer colors.
    const targetLimit = Math.min(
        MAX_REGION_STACK_TARGETS,
        Math.floor(REGION_STACK_MASK_BUDGET / Math.max(1, options.pixelCount ?? 0))
    );
    if (targets.length > targetLimit) return null;

    const foundationRun: RegionStackRun = {
        filamentId: foundationId,
        filamentColor: foundationLayer.filamentColor,
        layerCount: foundationLayers,
    };

    const candidatesFor = (target: Target): ScoredStack[] => {
        const fastScore = (node: StackNode) =>
            deltaE2000Lab(target.lab, rgbToLab(toRgb(node.color))) +
            stackCost(node.runs.length, node.layerCount);
        const start: StackNode = {
            runs: [foundationRun],
            layerCount: foundationLayers,
            color: foundationColor,
        };
        const shortlist: Array<{ node: StackNode; score: number }> = [
            { node: start, score: fastScore(start) },
        ];
        let frontier = [start];
        for (let depth = 0; depth < maxRuns && frontier.length; depth++) {
            const children: Array<{ node: StackNode; score: number }> = [];
            for (const node of frontier) {
                const substrate = node.runs.at(-1)!.filamentId;
                for (const filament of filaments) {
                    if (filament.id === substrate) continue;
                    const runOptics = transition(filament.id, substrate);
                    if (!runOptics) continue;
                    for (let count = 1; node.layerCount + count <= maxLayers; count++) {
                        const child: StackNode = {
                            runs: [
                                ...node.runs,
                                {
                                    filamentId: filament.id,
                                    filamentColor: filament.color,
                                    layerCount: count,
                                },
                            ],
                            layerCount: node.layerCount + count,
                            color: blendEffectiveTransition(
                                node.color,
                                runOptics,
                                count * layerHeight
                            ),
                        };
                        children.push({ node: child, score: fastScore(child) });
                    }
                }
            }
            // Stable: equal scores keep generation order, which follows filament order.
            children.sort((a, b) => a.score - b.score);
            frontier = children.slice(0, beamWidth).map((entry) => entry.node);
            shortlist.push(...children.slice(0, SHORTLIST_SIZE));
        }
        shortlist.sort((a, b) => a.score - b.score);

        const seen = new Set<string>();
        const ranked: ScoredStack[] = [];
        for (const { node } of shortlist.slice(0, SHORTLIST_SIZE)) {
            const key = runKey(node.runs);
            if (seen.has(key)) continue;
            seen.add(key);
            ranked.push(scoreStack(target, node.runs, node.layerCount, node.color));
        }

        // The search builds stacks bottom-up, so it rarely reaches "just the
        // visible top of the shared prefix". Light stops within a few
        // layers, so try the foundation plus the top k layers of that prefix.
        const prefix = sharedLayers.slice(0, target.sharedLayerCount);
        for (let k = 1; k <= prefix.length - foundationLayers; k++) {
            const runs: RegionStackRun[] = [{ ...foundationRun }];
            for (const layer of prefix.slice(prefix.length - k)) {
                const last = runs.at(-1)!;
                if (last.filamentId === layer.filamentId) last.layerCount++;
                else runs.push({ ...layer, layerCount: 1 });
            }
            const layerCount = foundationLayers + k;
            const key = runKey(runs);
            if (seen.has(key)) continue;
            seen.add(key);
            const color = predictEffectiveRecipeColor(
                optics,
                foundationId,
                anchorLayers(runs).slice(foundationLayers)
            );
            if (color) ranked.push(scoreStack(target, runs, layerCount, color));
        }

        // The shared prefix keeps the color Auto-paint already published for
        // it, so the baseline never depends on re-predicting that stack.
        const sharedRuns = layersToRuns(sharedLayers.slice(0, target.sharedLayerCount));
        const sharedKey = runKey(sharedRuns);
        // Scored from the published uint8 color, like every alternative.
        const sharedDeltaE = deltaE2000Lab(target.lab, rgbToLab(hexToRgb(target.sharedHex)));
        const sharedStack: ScoredStack = {
            runs: sharedRuns,
            layerCount: target.sharedLayerCount,
            predictedHex: target.sharedHex,
            deltaE: sharedDeltaE,
            score: sharedDeltaE + stackCost(sharedRuns.length, target.sharedLayerCount),
            shared: true,
        };

        // Keep only stacks that look at least as good as the shared prefix, so
        // trading color for fewer tool changes never goes below the shared
        // sequence by more than an invisible tolerance.
        const sorted = ranked
            .filter(
                (entry) =>
                    runKey(entry.runs) !== sharedKey &&
                    (entry.deltaE <= sharedDeltaE ||
                        (entry.deltaE <= sharedDeltaE + SAME_COLOR_TOLERANCE &&
                            deltaE2000Lab(
                                rgbToLab(hexToRgb(entry.predictedHex)),
                                rgbToLab(hexToRgb(target.sharedHex))
                            ) <= SAME_LOOK_TOLERANCE)) &&
                    // A kept-apart color must stay within the separation limit.
                    (!target.keepApart || entry.deltaE <= separationLimit!)
            )
            .sort((a, b) => a.score - b.score)
            .slice(0, CANDIDATE_LIMIT);
        sorted.push(sharedStack);
        sorted.sort((a, b) => a.score - b.score);
        return sorted;
    };

    const candidates = targets.map(candidatesFor);
    const setsFor = (stacks: ScoredStack[]) =>
        regionStackLayerSets(stacks, options.alignment, foundationId);
    const stacksFor = (choices: readonly number[]) =>
        choices.map((choice, t) => candidates[t][choice]);
    const layersOf = candidates.map((list) => list.map(regionStackLayerFilaments));
    const sharedStart = candidates.map((list) => list.findIndex((entry) => entry.shared));

    // Preserve color separation: kept-apart colors may not move closer than
    // their shared colors were, up to SEPARATION_FLOOR. The shared start meets
    // this by construction, and every move below keeps it.
    const labs = candidates.map((list) =>
        list.map((entry) => rgbToLab(hexToRgb(entry.predictedHex)))
    );
    const apart = targets.flatMap((target, t) => (target.keepApart ? [t] : []));
    const required = new Map<number, number>();
    for (const t of apart) {
        for (const j of apart) {
            if (j <= t) continue;
            const distance = deltaE2000Lab(labs[t][sharedStart[t]], labs[j][sharedStart[j]]);
            required.set(t * targets.length + j, Math.min(distance, SEPARATION_FLOOR));
        }
    }
    const staysApart = (t: number, c: number, choices: readonly number[]) =>
        !targets[t].keepApart ||
        apart.every(
            (j) =>
                j === t ||
                deltaE2000Lab(labs[t][c], labs[j][choices[j]]) >=
                    required.get(Math.min(t, j) * targets.length + Math.max(t, j))! - 1e-9
        );
    const usageFor = (choices: readonly number[], limit: number) =>
        new RegionLayerUsage(
            choices.map((choice, t) => layersOf[t][choice]),
            options.alignment,
            foundationId,
            limit
        );

    // Every target's shared prefix together meets any cap in relief. Flat Paint
    // faces need one filament per distinct visible color, so there the cap never
    // drops below what the shared layout already uses.
    const limit = Math.max(cap, usageFor(sharedStart, cap).peak);

    // Objective: usage-weighted mean score plus a small cost per filament slot,
    // so near-equal colors favor stacks that reuse filaments already on a layer.
    const totalWeight = targets.reduce((sum, target) => sum + target.weight, 0) || 1;
    const share = targets.map((target) => target.weight / totalWeight);
    const objective = (choices: readonly number[], slots: number) =>
        choices.reduce((sum, choice, t) => sum + share[t] * candidates[t][choice].score, 0) +
        slotCost * slots;

    /**
     * Greedy local search from one starting assignment. First remove overflow
     * above the limit, taking the move with the least objective cost per unit
     * of overflow removed. Then take the best objective improvement that adds
     * no overflow, until no single region can improve.
     */
    const search = (start: readonly number[]) => {
        const choices = [...start];
        const usage = usageFor(choices, limit);
        for (let pass = 0; ; pass++) {
            const current = usage.overflow;
            const repairing = current > 0;
            let best: { t: number; c: number; rank: number } | undefined;
            for (let t = 0; t < targets.length; t++) {
                const before = candidates[t][choices[t]].score;
                for (let c = 0; c < candidates[t].length; c++) {
                    if (c === choices[t] || !staysApart(t, c, choices)) continue;
                    const after = usage.trial(t, layersOf[t][c]);
                    const delta =
                        share[t] * (candidates[t][c].score - before) +
                        slotCost * (after.slots - usage.slots);
                    let rank: number;
                    if (repairing) {
                        if (after.overflow >= current) continue;
                        rank = delta / (current - after.overflow);
                    } else {
                        if (after.overflow > current || delta >= -1e-12) continue;
                        rank = delta;
                    }
                    if (!best || rank < best.rank - 1e-12) best = { t, c, rank };
                }
            }
            // Every move lowers overflow or the objective, so this ends; the
            // pass limit only guards against floating-point cycling.
            if (!best || pass > targets.length * CANDIDATE_LIMIT * 4) break;
            choices[best.t] = best.c;
            usage.apply(best.t, layersOf[best.t][best.c]);
        }
        return { choices, overflow: usage.overflow, objective: objective(choices, usage.slots) };
    };

    // Start once from every target's best stack and once from the shared
    // prefixes, which always fit the limit; keep the better result. Kept-apart
    // colors start only from the shared prefixes, which already stay apart.
    const fromShared = search(sharedStart);
    const fromBest = apart.length > 1 ? fromShared : search(candidates.map(() => 0));
    const winner =
        fromShared.overflow < fromBest.overflow ||
        (fromShared.overflow === fromBest.overflow &&
            fromShared.objective < fromBest.objective - 1e-12)
            ? fromShared
            : fromBest;
    // The shared start always fits the limit, so this only guards against an
    // inconsistent result; fall back to the shared sequence rather than exceed it.
    if (winner.overflow > 0) return null;
    const chosen = () => stacksFor(winner.choices);

    const finalStacks = chosen();
    const sets = setsFor(finalStacks);
    const sharedError = candidates.reduce((sum, list, t) => {
        const shared = list.find((entry) => entry.shared) ?? list[0];
        return sum + targets[t].weight * shared.deltaE;
    }, 0);

    return {
        alignment: options.alignment,
        layerHeight,
        firstLayerHeight,
        foundationFilamentId: foundationId,
        stacks: finalStacks.map((entry, t) => ({
            targetHex: targets[t].hex,
            usageWeight: targets[t].weight,
            runs: entry.runs.map((run) => {
                const name = options.filaments.find((f) => f.id === run.filamentId)?.name;
                return name ? { ...run, filamentName: name } : { ...run };
            }),
            layerCount: entry.layerCount,
            predictedHex: entry.predictedHex,
            deltaE: entry.deltaE,
            shared: entry.shared,
        })),
        layerCount: sets.length,
        maxFilamentsPerLayer: cap,
        peakFilamentsPerLayer: sets.reduce((max, set) => Math.max(max, set.size), 0),
        toolChangeEstimate: estimateRegionStackToolChanges(sets),
        sharedDeltaE: sharedError / totalWeight,
        deltaE:
            finalStacks.reduce((sum, entry, t) => sum + targets[t].weight * entry.deltaE, 0) /
            totalWeight,
    };
}

function stackCost(runCount: number, layerCount: number): number {
    return RUN_PENALTY * Math.max(0, runCount - 1) + LAYER_PENALTY * layerCount;
}

function rgbKey(hex: string): number {
    const { r, g, b } = hexToRgb(hex);
    return (r << 16) | (g << 8) | b;
}

function toRgb(color: readonly [number, number, number]): RGB {
    return { r: color[0], g: color[1], b: color[2] };
}

/**
 * Group stacks that print identically, so each distinct stack gets one mask
 * and one set of parts however many target colors share it.
 */
export function regionStackClasses(plan: Pick<RegionStackPlan, 'stacks'>): {
    /** Class index of each stack. */
    classOf: number[];
    /** Index of the first stack in each class. */
    representatives: number[];
} {
    const byKey = new Map<string, number>();
    const representatives: number[] = [];
    const classOf = plan.stacks.map((entry, index) => {
        const key = `${runKey(entry.runs)}|${entry.predictedHex}`;
        let classIndex = byKey.get(key);
        if (classIndex === undefined) {
            classIndex = representatives.length;
            byKey.set(key, classIndex);
            representatives.push(index);
        }
        return classIndex;
    });
    return { classOf, representatives };
}

export interface RegionStackLabelOptions {
    plan: Pick<RegionStackPlan, 'stacks'>;
    /** RGBA pixels of the full image. */
    data: Uint8ClampedArray;
    imageWidth: number;
    minX: number;
    minY: number;
    width: number;
    height: number;
}

/**
 * Label every pixel of the crop with its region: 0 for transparent pixels,
 * otherwise 1 + the regionStackClasses class of the stack whose target color
 * it matches. Colors that are not a target exactly use the nearest target in
 * CIEDE2000.
 */
export function regionStackLabels(options: RegionStackLabelOptions): Uint16Array {
    const { plan, data, imageWidth, minX, minY, width, height } = options;
    const labels = new Uint16Array(width * height);
    if (plan.stacks.length === 0) return labels;
    const { classOf } = regionStackClasses(plan);
    const byKey = new Map<number, number>();
    const targetLabs = plan.stacks.map((entry, index) => {
        const rgb = hexToRgb(entry.targetHex);
        const key = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
        if (!byKey.has(key)) byKey.set(key, classOf[index] + 1);
        return rgbToLab(rgb);
    });

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const source = ((minY + y) * imageWidth + minX + x) * 4;
            if (!data[source + 3]) continue;
            const key = (data[source] << 16) | (data[source + 1] << 8) | data[source + 2];
            let label = byKey.get(key);
            if (label === undefined) {
                const lab = rgbToLab({ r: data[source], g: data[source + 1], b: data[source + 2] });
                let best = 0;
                let bestDistance = deltaE2000Lab(lab, targetLabs[0]);
                for (let i = 1; i < targetLabs.length; i++) {
                    const distance = deltaE2000Lab(lab, targetLabs[i]);
                    if (distance < bestDistance) {
                        best = i;
                        bestDistance = distance;
                    }
                }
                label = classOf[best] + 1;
                byKey.set(key, label);
            }
            labels[y * width + x] = label;
        }
    }
    return labels;
}

export interface RegionStackLayoutOptions {
    plan: Pick<RegionStackPlan, 'stacks' | 'layerHeight' | 'firstLayerHeight'>;
    /** Class labels from regionStackLabels, already oriented for the scene. */
    labels: Uint16Array;
    orientation: StackLayoutOrientation;
    /** Clear carrier under a face-down slab. */
    carrierThickness: number;
}

/**
 * Plan the solid parts for per-region stacks. Relief keeps every region's
 * own height; Flat Paint pads them with foundation into one uniform slab.
 * Parts are grouped for export by physical filament.
 */
export function buildRegionStackLayout(options: RegionStackLayoutOptions): FlatPaintLayout {
    const { plan, labels, orientation } = options;
    const classes = regionStackClasses(plan).representatives.map((index) => plan.stacks[index]);
    const counts = classes.map(() => 0);
    for (const label of labels) {
        if (label > 0 && label <= counts.length) counts[label - 1]++;
    }
    // Only classes present in the crop need a full-size mask.
    const masks = counts.map((count) => (count > 0 ? new Uint8Array(labels.length) : undefined));
    const opaque = { mask: new Uint8Array(labels.length), count: 0 };
    for (let i = 0; i < labels.length; i++) {
        const mask = masks[labels[i] - 1];
        if (!mask) continue;
        mask[i] = 1;
        opaque.mask[i] = 1;
        opaque.count++;
    }
    const perLayer = <T>(entry: RegionStack, value: (run: RegionStackRun) => T) =>
        entry.runs.flatMap((run) => Array.from({ length: run.layerCount }, () => value(run)));
    const hexOf = (run?: RegionStackRun) => normalizeHexColor(run?.filamentColor, '#888888');
    const foundation = plan.stacks[0]?.runs[0];

    // Name same-colored filaments apart, so each slicer object can be assigned.
    const idsByHex = new Map<string, Set<string>>();
    const nameById = new Map<string, string>();
    for (const run of plan.stacks.flatMap((entry) => entry.runs)) {
        const ids = idsByHex.get(hexOf(run)) ?? new Set<string>();
        ids.add(run.filamentId);
        idsByHex.set(hexOf(run), ids);
        if (run.filamentName) nameById.set(run.filamentId, run.filamentName);
    }
    const label = orientation === 'relief' ? 'Filament' : 'Flat Paint filament';
    // A profile name tells same-colored filaments apart unless the names
    // in that color collide; then every filament in it uses its unique ID.
    const tagsByHex = new Map<string, Map<string, string>>();
    for (const [hex, ids] of idsByHex) {
        const tags = new Map([...ids].map((id) => [id, nameById.get(id) ?? id]));
        // Compare as exported: XML replaces forbidden characters in names.
        const unique = new Set([...tags.values()].map(escapeXmlAttribute)).size === tags.size;
        tagsByHex.set(hex, unique ? tags : new Map([...ids].map((id) => [id, id])));
    }
    const tag = (hex: string, id: string) => tagsByHex.get(hex)?.get(id) ?? id;
    const partName = (hex: string, id: string) =>
        (idsByHex.get(hex)?.size ?? 0) > 1
            ? `${label} (${hex}, ${tag(hex, id)})`
            : `${label} (${hex})`;

    // Group parts by filament identity: two loaded filaments can share a color.
    const group = orientation === 'relief' ? 'region-stacks:filament' : 'flat-paint:filament';
    return buildStackLayout({
        classes: classes.flatMap((entry, index) => {
            const mask = masks[index];
            return mask
                ? [
                      {
                          classIndex: index + 1,
                          mask,
                          activeCount: counts[index],
                          layerFilamentHexes: perLayer(entry, hexOf),
                          layerFilamentKeys: perLayer(entry, (run) => run.filamentId),
                          faceHex: entry.predictedHex,
                      },
                  ]
                : [];
        }),
        pixelCount: labels.length,
        opaque,
        layerHeight: plan.layerHeight,
        carrierThickness: options.carrierThickness,
        orientation,
        firstLayerThickness: plan.firstLayerHeight,
        foundationHex: hexOf(foundation),
        foundationKey: foundation?.filamentId,
        filamentGroup: (id: string) => `${group}:${id}`,
        filamentPartName: partName,
    });
}
