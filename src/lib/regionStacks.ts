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
import { hexToRgb, rgbToHex, rgbToLab } from './autoPaint.ts';
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
const DEFAULT_BEAM_WIDTH = 16;
/** Stacks per target re-ranked with the full appearance model. */
const SHORTLIST_SIZE = 24;
/** Ranked alternatives kept per target for the per-layer cap. */
const CANDIDATE_LIMIT = 12;
/**
 * A region leaves its shared prefix only when its own stack predicts a color
 * better by more than these costs: extra runs mean extra tool changes, and
 * shorter stacks win near-ties.
 */
const RUN_PENALTY = 0.2;
const LAYER_PENALTY = 0.005;
const DEFAULT_TOOL_CHANGE_COST = 0.01;
const HEIGHT_EPSILON = 1e-8;

export interface RegionStackPlanOptions {
    result: Pick<AutoPaintResult, 'finalStack'>;
    filaments: readonly Filament[];
    alignment: RegionStackAlignment;
    maxFilamentsPerLayer?: number;
    /** Runs a stack may add above the foundation. */
    maxRuns?: number;
    beamWidth?: number;
    /** Mean ΔE a stack must gain per extra filament it adds to a layer. */
    toolChangeCost?: number;
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
}

function runKey(runs: readonly RegionStackRun[]): string {
    return runs.map((run) => `${run.filamentId}x${run.layerCount}`).join('/');
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
 * cap. Returns null when the result has no printable stack or targets.
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
        const key = `${foreground}\u0000${substrate}`;
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
        color: readonly [number, number, number],
        shared: boolean
    ): ScoredStack => {
        // Score the published uint8 color, as the preview and the gain gate do.
        const predictedHex = correctedHex(color, runs);
        const deltaE = deltaE2000Lab(target.lab, rgbToLab(hexToRgb(predictedHex)));
        return {
            runs,
            layerCount,
            predictedHex,
            deltaE,
            score: shared ? deltaE : deltaE + stackCost(runs.length, layerCount),
            shared,
        };
    };

    const sharedLayers = stack.layers.map((layer) => ({
        filamentId: layer.filamentId,
        filamentColor: layer.filamentColor,
    }));
    const targets: Target[] = stack.targetMappings.map((mapping) => ({
        hex: mapping.targetColor.hex,
        lab: { L: mapping.targetLab[0], a: mapping.targetLab[1], b: mapping.targetLab[2] },
        weight: Math.max(0, mapping.usageWeight),
        sharedLayerCount: Math.min(
            stack.layers.length,
            Math.max(1, layersAtHeight(mapping.projectedHeight))
        ),
    }));

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
            ranked.push(scoreStack(target, node.runs, node.layerCount, node.color, false));
        }

        const sharedRuns = layersToRuns(sharedLayers.slice(0, target.sharedLayerCount));
        const sharedColor = predictEffectiveRecipeColor(
            optics,
            foundationId,
            anchorLayers(sharedRuns).slice(sharedRuns[0].layerCount)
        );
        const sharedKey = runKey(sharedRuns);
        const sharedStack = sharedColor
            ? scoreStack(target, sharedRuns, target.sharedLayerCount, sharedColor, true)
            : undefined;

        // Keep only stacks at least as good as the shared prefix, so trading
        // color for fewer tool changes never goes below the shared sequence.
        const sorted = ranked
            .filter(
                (entry) =>
                    runKey(entry.runs) !== sharedKey &&
                    (!sharedStack || entry.deltaE <= sharedStack.deltaE)
            )
            .sort((a, b) => a.score - b.score)
            .slice(0, CANDIDATE_LIMIT);
        if (sharedStack) {
            sorted.push(sharedStack);
            sorted.sort((a, b) => a.score - b.score);
        }
        return sorted;
    };

    const candidates = targets.map(candidatesFor);
    if (candidates.some((list) => list.length === 0)) return null;
    const setsFor = (stacks: ScoredStack[]) =>
        regionStackLayerSets(stacks, options.alignment, foundationId);
    const stacksFor = (choices: readonly number[]) =>
        choices.map((choice, t) => candidates[t][choice]);
    const layersOf = candidates.map((list) => list.map(regionStackLayerFilaments));
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
    const sharedStart = candidates.map((list) =>
        Math.max(
            0,
            list.findIndex((entry) => entry.shared)
        )
    );
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
                    if (c === choices[t]) continue;
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
    // prefixes, which always fit the limit; keep the better result.
    const [fromBest, fromShared] = [search(candidates.map(() => 0)), search(sharedStart)];
    const winner =
        fromShared.overflow < fromBest.overflow ||
        (fromShared.overflow === fromBest.overflow &&
            fromShared.objective < fromBest.objective - 1e-12)
            ? fromShared
            : fromBest;
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
            runs: entry.runs.map((run) => ({ ...run })),
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

function toRgb(color: readonly [number, number, number]): RGB {
    return { r: color[0], g: color[1], b: color[2] };
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
 * otherwise 1 + the index of the stack whose target color it matches. Colors
 * that are not a target exactly use the nearest target in CIEDE2000.
 */
export function regionStackLabels(options: RegionStackLabelOptions): Uint16Array {
    const { plan, data, imageWidth, minX, minY, width, height } = options;
    const labels = new Uint16Array(width * height);
    if (plan.stacks.length === 0) return labels;
    const byKey = new Map<number, number>();
    const targetLabs = plan.stacks.map((entry, index) => {
        const rgb = hexToRgb(entry.targetHex);
        const key = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
        if (!byKey.has(key)) byKey.set(key, index + 1);
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
                for (let i = 1; i < targetLabs.length; i++) {
                    if (deltaE2000Lab(lab, targetLabs[i]) < deltaE2000Lab(lab, targetLabs[best]))
                        best = i;
                }
                label = best + 1;
                byKey.set(key, label);
            }
            labels[y * width + x] = label;
        }
    }
    return labels;
}

export interface RegionStackLayoutOptions {
    plan: Pick<RegionStackPlan, 'stacks' | 'layerHeight' | 'firstLayerHeight'>;
    /** Region labels from regionStackLabels, already oriented for the scene. */
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
    const masks = plan.stacks.map(() => new Uint8Array(labels.length));
    const counts = plan.stacks.map(() => 0);
    for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        if (label === 0 || label > masks.length) continue;
        masks[label - 1][i] = 1;
        counts[label - 1]++;
    }
    const layerHexes = (entry: RegionStack) =>
        entry.runs.flatMap((run) =>
            Array.from({ length: run.layerCount }, () =>
                normalizeHexColor(run.filamentColor, '#888888')
            )
        );
    const relief = orientation === 'relief';
    return buildStackLayout({
        classes: plan.stacks.map((entry, index) => ({
            classIndex: index + 1,
            mask: masks[index],
            activeCount: counts[index],
            layerFilamentHexes: layerHexes(entry),
            faceHex: entry.predictedHex,
        })),
        pixelCount: labels.length,
        layerHeight: plan.layerHeight,
        carrierThickness: options.carrierThickness,
        orientation,
        firstLayerThickness: plan.firstLayerHeight,
        foundationHex: normalizeHexColor(plan.stacks[0]?.runs[0]?.filamentColor, '#888888'),
        ...(relief
            ? {
                  filamentGroup: (hex: string) => `region-stacks:filament:${hex}`,
                  filamentPartName: (hex: string) => `Filament (${hex})`,
              }
            : {}),
    });
}
