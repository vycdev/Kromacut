/**
 * Advanced Filament Order Optimizer
 *
 * Finds the best printable filament sequence for multi-material lithophanes.
 * Supports:
 * - Exhaustive ordered-subset search for small profiles
 * - Beam search for medium profiles
 * - Variable-length simulated annealing for large profiles
 * - Deterministic Seeding: Reproducible results for A/B testing
 * - Result Caching: Skip redundant computations
 */

import type { Filament } from '../types';
import type { AppearanceAnchorLayer, AppearanceRankModelV1 } from '../types/appearance';
import type { ResolvedAppearancePrediction } from './appearanceModel';
import {
    buildAchievableColorPalette,
    mapTargetsWithSeparation,
    normalizeSeparationMaxDeltaE,
    scoreSequenceAgainstImage,
    type AppearancePredictionCache,
    type ColorSeparationReport,
    type Lab,
    type WeightedLab,
} from './autoPaint';
import { BoundedCache } from './boundedCache';
import { activeFrontlitCalibration, channelHds } from './calibration';

// ============================================================================
// Type Definitions
// ============================================================================

/** User-facing optimizer effort tiers (persisted and shown in the UI). */
export type OptimizerTier = 'fast' | 'balanced' | 'thorough' | 'deep' | 'exact';

/**
 * Values the optimizer accepts: the user-facing tiers plus explicit concrete
 * searches (used by tests, benchmarks, and advanced callers). The UI only ever
 * stores a tier.
 */
export type OptimizerAlgorithm = OptimizerTier | 'exhaustive' | 'beam' | 'simulated-annealing';

/**
 * Map any persisted or legacy optimizer-algorithm value to a current UI tier.
 * Earlier releases stored 'auto' | 'exhaustive' | 'simulated-annealing' | 'genetic'.
 */
export function normalizeOptimizerTier(value: string | undefined | null): OptimizerTier {
    switch (value) {
        case 'fast':
        case 'balanced':
        case 'thorough':
        case 'deep':
        case 'exact':
            return value;
        case 'exhaustive': // explicit exact search → Exact base order
            return 'exact';
        case 'genetic': // legacy "max effort" option
            return 'deep';
        case 'beam':
            return 'balanced';
        // 'auto', 'simulated-annealing', anything unknown → the recommended default
        default:
            return 'balanced';
    }
}

export interface OptimizerOptions {
    algorithm: OptimizerAlgorithm;
    /** Legacy compatibility flag; new callers should set maxExtraRepeats. */
    allowRepeatedSwaps?: boolean;
    /** Maximum extra non-adjacent filament occurrences (0–12). */
    maxExtraRepeats?: number;
    /** Transition opacity target used by the shared printable-palette scorer. */
    transitionOpacity?: number;
    /** Assign each image color to a distinct printable color (no collapse). */
    preserveSeparation?: boolean;
    /** Maximum accepted ΔE00 for every separated printable color. */
    separationMaxDeltaE?: number;
    /** Reject the final build instead of allowing unmatched colors to fall back. */
    failOnSeparationError?: boolean;
    seed?: number; // For deterministic results
    maxIterations?: number; // Algorithm-specific iteration limit
    temperature?: number; // Initial temperature for SA
    coolingRate?: number; // Temperature decay for SA
    populationSize?: number; // Retained for persisted optimizer compatibility
    mutationRate?: number; // Retained for persisted optimizer compatibility
    eliteCount?: number; // Retained for persisted optimizer compatibility
    beamWidth?: number; // Number of partial stacks kept by beam search
    cachingEnabled?: boolean; // Enable result caching
    onProgress?: (iteration: number, total: number, bestScore: number) => void;
}

export interface OptimizerResult {
    order: Filament[]; // Best filament ordering found
    score: number; // Quality score (lower is better, deltaE-based)
    iterations: number; // Iterations performed
    converged: boolean; // Whether algorithm converged
    cacheHit?: boolean; // Whether result came from cache
    resolvedAlgorithm?: string; // Actual algorithm used (after 'auto' resolution)
    separation?: ColorSeparationReport;
    /** Actual repeated occurrences beyond the first use of each filament. */
    extraRepeatCount?: number;
}

export interface ScoringContext {
    imageColors: WeightedLab[];
    layerHeight: number;
    firstLayerHeight: number;
    maxHeight?: number;
    transitionOpacity?: number;
    preserveSeparation?: boolean;
    separationMaxDeltaE?: number;
    appearanceModel?: AppearanceRankModelV1;
}

export interface SequenceScorer {
    (filaments: Filament[]): number;
    /** Retained numeric scores; exposed for benchmarks and memory regressions. */
    cacheSize(): number;
    /** Retained evidence-aware prefix predictions. */
    appearanceCacheSize(): number;
}

// ============================================================================
// Deterministic Random Number Generator
// ============================================================================

/**
 * LCG (Linear Congruential Generator) for deterministic random numbers.
 * Uses parameters from Numerical Recipes (a=1664525, c=1013904223, m=2^32).
 */
class SeededRandom {
    private state: number;

    constructor(seed: number = Date.now()) {
        this.state = seed >>> 0; // Ensure unsigned 32-bit
    }

    /** Generate random float in [0, 1) */
    next(): number {
        this.state = (this.state * 1664525 + 1013904223) >>> 0;
        return this.state / 0x100000000;
    }

    /** Generate random integer in [min, max) */
    nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min)) + min;
    }

    /** Shuffle array in-place using Fisher-Yates */
    shuffle<T>(array: T[]): T[] {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = this.nextInt(0, i + 1);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}

// ============================================================================
// Result Caching
// ============================================================================

class OptimizerCache {
    private cache = new Map<string, OptimizerResult>();
    private maxSize = 100;

    get(key: string): OptimizerResult | null {
        return this.cache.get(key) || null;
    }

    set(key: string, result: OptimizerResult): void {
        // Evict oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }

        this.cache.set(key, result);
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}

const globalCache = new OptimizerCache();

function tuningFingerprint(options: OptimizerOptions) {
    return {
        allowRepeatedSwaps: options.allowRepeatedSwaps ?? false,
        maxExtraRepeats: options.maxExtraRepeats ?? null,
        transitionOpacity: options.transitionOpacity ?? null,
        preserveSeparation: options.preserveSeparation ?? false,
        separationMaxDeltaE: options.separationMaxDeltaE ?? null,
        failOnSeparationError: options.failOnSeparationError ?? true,
        maxIterations: options.maxIterations ?? null,
        temperature: options.temperature ?? null,
        coolingRate: options.coolingRate ?? null,
        populationSize: options.populationSize ?? null,
        mutationRate: options.mutationRate ?? null,
        eliteCount: options.eliteCount ?? null,
        beamWidth: options.beamWidth ?? null,
    };
}

function filamentOpticalFingerprint(filament: Filament) {
    const activeCalibration = activeFrontlitCalibration(filament);
    return {
        id: filament.id,
        color: filament.color,
        td: filament.td,
        channelHds: channelHds(filament),
        activeCalibrationColor:
            activeCalibration?.filamentColor ?? (activeCalibration ? '__legacy__' : null),
    };
}

function filamentOpticalKey(filament: Filament): string {
    const fingerprint = filamentOpticalFingerprint(filament);
    return [
        fingerprint.id,
        fingerprint.color,
        fingerprint.td,
        ...fingerprint.channelHds,
        fingerprint.activeCalibrationColor ?? '',
    ].join(':');
}

function canonicalOptimizerInput(
    filaments: Filament[],
    context: ScoringContext,
    algorithm: string,
    options: OptimizerOptions,
    seed?: number
): string {
    return JSON.stringify({
        filaments: filaments.map(filamentOpticalFingerprint),
        clusters: context.imageColors.map((color) => ({
            L: color.L,
            a: color.a,
            b: color.b,
            weight: color.weight,
        })),
        layerHeight: context.layerHeight,
        firstLayerHeight: context.firstLayerHeight,
        maxHeight: context.maxHeight ?? null,
        transitionOpacity: context.transitionOpacity ?? null,
        appearanceModelFingerprint: context.appearanceModel?.fingerprint ?? null,
        algorithm,
        seed: seed ?? null,
        tuning: tuningFingerprint(options),
    });
}

function stableHash32(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index++) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
    }
    return hash >>> 0;
}

// ============================================================================
// Scoring Functions
// ============================================================================

export const MAX_CACHED_SEQUENCE_SCORES = 8_192;
export const MAX_CACHED_APPEARANCE_PREDICTIONS = 128;

class BoundedAppearancePredictionCache implements AppearancePredictionCache {
    private readonly layerTokens = new Map<string, Map<string, Map<number, number>>>();
    private readonly prefixByEdge: BoundedCache<number | string, number>;
    private readonly predictionSlotByPrefix = new Map<number, number>();
    private readonly predictionPrefixBySlot: Float64Array;
    private readonly predictionBaseL: Float64Array;
    private readonly predictionBaseA: Float64Array;
    private readonly predictionBaseB: Float64Array;
    private readonly predictionBySlot: Array<ResolvedAppearancePrediction | undefined>;
    private readonly maxPredictions: number;
    private predictionCount = 0;
    private nextPredictionEvictionSlot = 0;
    private nextLayerToken = 0;
    private nextPrefixId = 1;

    constructor(maxPredictions: number) {
        this.maxPredictions = maxPredictions;
        this.prefixByEdge = new BoundedCache<number | string, number>(maxPredictions * 4);
        this.predictionPrefixBySlot = new Float64Array(maxPredictions);
        this.predictionBaseL = new Float64Array(maxPredictions);
        this.predictionBaseA = new Float64Array(maxPredictions);
        this.predictionBaseB = new Float64Array(maxPredictions);
        this.predictionBySlot = new Array(maxPredictions);
    }

    startPrefix(): number {
        return 0;
    }

    extendPrefix(parentPrefix: number, layer: AppearanceAnchorLayer): number {
        let byColor = this.layerTokens.get(layer.filamentId);
        if (!byColor) {
            byColor = new Map();
            this.layerTokens.set(layer.filamentId, byColor);
        }
        let byThickness = byColor.get(layer.filamentColor);
        if (!byThickness) {
            byThickness = new Map();
            byColor.set(layer.filamentColor, byThickness);
        }
        let layerToken = byThickness.get(layer.thickness);
        if (layerToken === undefined) {
            layerToken = this.nextLayerToken++;
            byThickness.set(layer.thickness, layerToken);
        }

        const sum = parentPrefix + layerToken;
        const paired = (sum * (sum + 1)) / 2 + layerToken;
        const edgeKey = Number.isSafeInteger(paired) ? paired : `${parentPrefix},${layerToken}`;
        let prefix = this.prefixByEdge.get(edgeKey);
        if (prefix === undefined) {
            prefix = this.nextPrefixId++;
            this.prefixByEdge.set(edgeKey, prefix);
        }
        return prefix;
    }

    get(prefix: number, base: Lab): ResolvedAppearancePrediction | undefined {
        const slot = this.predictionSlotByPrefix.get(prefix);
        return slot !== undefined &&
            this.predictionBaseL[slot] === base.L &&
            this.predictionBaseA[slot] === base.a &&
            this.predictionBaseB[slot] === base.b
            ? this.predictionBySlot[slot]
            : undefined;
    }

    set(prefix: number, base: Lab, value: ResolvedAppearancePrediction): void {
        let slot = this.predictionSlotByPrefix.get(prefix);
        if (slot === undefined) {
            if (this.predictionCount < this.maxPredictions) {
                slot = this.predictionCount++;
            } else {
                slot = this.nextPredictionEvictionSlot;
                this.predictionSlotByPrefix.delete(this.predictionPrefixBySlot[slot]);
                this.nextPredictionEvictionSlot =
                    (this.nextPredictionEvictionSlot + 1) % this.maxPredictions;
            }
            this.predictionSlotByPrefix.set(prefix, slot);
            this.predictionPrefixBySlot[slot] = prefix;
        }
        this.predictionBaseL[slot] = base.L;
        this.predictionBaseA[slot] = base.a;
        this.predictionBaseB[slot] = base.b;
        this.predictionBySlot[slot] = value;
    }

    get size(): number {
        return this.predictionSlotByPrefix.size;
    }
}

export function createSequenceScorer(
    context: ScoringContext,
    maxCachedScores: number = MAX_CACHED_SEQUENCE_SCORES,
    maxCachedAppearancePredictions: number = MAX_CACHED_APPEARANCE_PREDICTIONS
): SequenceScorer {
    // Retaining a rich palette for every Exact/Deep candidate can consume
    // hundreds of megabytes. Only the deterministic scalar score is reusable;
    // let each temporary palette be collected immediately after scoring.
    const scoreCache = new BoundedCache<string, number>(maxCachedScores);
    const transitionThicknessCache = new Map<string, number>();
    const appearancePredictionCache =
        maxCachedAppearancePredictions > 0
            ? new BoundedAppearancePredictionCache(
                  Math.max(1, Math.floor(maxCachedAppearancePredictions))
              )
            : undefined;
    const filamentTokenCache = new WeakMap<Filament, string>();
    const tokenByOpticalKey = new Map<string, string>();
    const exactAnchorTargets = context.appearanceModel?.exactAnchors
        ?.filter((anchor) => anchor.source !== 'stack-matrix')
        .map((anchor) => ({
            L: anchor.targetLab[0],
            a: anchor.targetLab[1],
            b: anchor.targetLab[2],
        }));

    const score = ((filaments: Filament[]) => {
        if (filaments.length === 0) return Infinity;
        let sequenceKey = '';
        for (let index = 0; index < filaments.length; index++) {
            const filament = filaments[index];
            let token = filamentTokenCache.get(filament);
            if (token === undefined) {
                const opticalKey = filamentOpticalKey(filament);
                token = tokenByOpticalKey.get(opticalKey);
                if (token === undefined) {
                    token = `${tokenByOpticalKey.size.toString(36)},`;
                    tokenByOpticalKey.set(opticalKey, token);
                }
                filamentTokenCache.set(filament, token);
            }
            sequenceKey += token;
        }
        const cachedScore = scoreCache.get(sequenceKey);
        if (cachedScore !== undefined) return cachedScore;
        const palette = buildAchievableColorPalette(
            filaments,
            context.layerHeight,
            context.firstLayerHeight,
            context.maxHeight,
            context.transitionOpacity,
            transitionThicknessCache,
            context.appearanceModel,
            appearancePredictionCache
        );
        const value = scoreSequenceAgainstImage(palette, context.imageColors, {
            preserveSeparation: context.preserveSeparation,
            separationMaxDeltaE: context.separationMaxDeltaE,
            exactAnchorTargets,
        });
        scoreCache.set(sequenceKey, value);
        return value;
    }) as SequenceScorer;
    score.cacheSize = () => scoreCache.size;
    score.appearanceCacheSize = () => appearancePredictionCache?.size ?? 0;
    return score;
}

export function scoreFilamentSequence(filaments: Filament[], context: ScoringContext): number {
    return createSequenceScorer(context)(filaments);
}

// ============================================================================
// Variable-length sequence helpers
// ============================================================================

const MAX_EXTRA_REPEATS = 12;
const LEGACY_EXTRA_REPEATS = 4;
const FAST_BEAM_WIDTH = 25;
const BALANCED_BEAM_WIDTH = 100;
const THOROUGH_BEAM_WIDTH = 100;
const DEEP_BEAM_WIDTH = 250;

type ResolvedOptimizerAlgorithm =
    | 'exhaustive'
    | 'beam'
    | 'simulated-annealing'
    | 'narrow-beam'
    | 'thorough-hybrid'
    | 'deep-hybrid'
    | 'exact-base';

const SA_MIN_TEMPERATURE = 0.01;
const SA_INITIAL_TEMPERATURE = 10.0;
const SA_DEFAULT_COOLING_RATE = 0.995;
// The hybrid tiers refine around good seeds at a temperature scaled to the
// CIEDE2000 objective (scores ~5–30), where
// the legacy SA temperature of 10 would just wander away from the seed.
const SA_HYBRID_TEMPERATURE = 2.0;

interface HybridSearchPlan {
    beamWidth: number;
    restarts: number;
    minimumIterationsPerRestart: number;
    iterationsPerFilament: number;
}

const THOROUGH_PLAN: HybridSearchPlan = {
    beamWidth: THOROUGH_BEAM_WIDTH,
    restarts: 12,
    minimumIterationsPerRestart: 1_500,
    iterationsPerFilament: 250,
};

const DEEP_PLAN: HybridSearchPlan = {
    beamWidth: DEEP_BEAM_WIDTH,
    restarts: 32,
    minimumIterationsPerRestart: 4_000,
    iterationsPerFilament: 500,
};

interface ScoredSequence {
    order: Filament[];
    score: number;
}

function sequenceKey(sequence: Filament[]): string {
    return sequence.map((filament) => filament.id).join('|');
}

function compareSequenceKeys(left: Filament[], right: Filament[]): number {
    const leftKey = sequenceKey(left);
    const rightKey = sequenceKey(right);
    if (leftKey === rightKey) return 0;
    return leftKey < rightKey ? -1 : 1;
}

function hasConsecutiveDuplicates(sequence: Filament[]): boolean {
    return sequence.some((filament, index) => index > 0 && filament.id === sequence[index - 1].id);
}

function hasDuplicateIds(sequence: Filament[]): boolean {
    return new Set(sequence.map((filament) => filament.id)).size !== sequence.length;
}

export function countExtraFilamentOccurrences(order: readonly Pick<Filament, 'id'>[]): number {
    return order.length - new Set(order.map((filament) => filament.id)).size;
}

export function isWithinTotalRepeatLimit(
    order: readonly Pick<Filament, 'id'>[],
    maxExtraRepeats: number
): boolean {
    return countExtraFilamentOccurrences(order) <= Math.max(0, Math.floor(maxExtraRepeats));
}

function isValidSequence(sequence: Filament[], maxExtraRepeats: number): boolean {
    return (
        sequence.length > 0 &&
        !hasConsecutiveDuplicates(sequence) &&
        (maxExtraRepeats > 0 || !hasDuplicateIds(sequence)) &&
        isWithinTotalRepeatLimit(sequence, maxExtraRepeats)
    );
}

function resolveMaxExtraRepeats(options: OptimizerOptions): number {
    if (Number.isFinite(options.maxExtraRepeats)) {
        return Math.max(0, Math.min(MAX_EXTRA_REPEATS, Math.floor(options.maxExtraRepeats!)));
    }
    return options.allowRepeatedSwaps ? LEGACY_EXTRA_REPEATS : 0;
}

function maxSequenceLength(filaments: Filament[], maxExtraRepeats: number): number {
    return filaments.length + maxExtraRepeats;
}

function isBetterCandidate(candidate: ScoredSequence, current: ScoredSequence | null): boolean {
    if (!current) return true;
    if (candidate.score !== current.score) return candidate.score < current.score;
    return compareSequenceKeys(candidate.order, current.order) < 0;
}

function reportProgress(
    options: OptimizerOptions,
    iteration: number,
    total: number,
    bestScore: number
) {
    options.onProgress?.(Math.min(iteration, total), Math.max(total, 1), bestScore);
}

function withProgressSpan(options: OptimizerOptions, start: number, end: number): OptimizerOptions {
    if (!options.onProgress) return { ...options, onProgress: undefined };

    return {
        ...options,
        onProgress: (iteration, total, bestScore) => {
            const phaseProgress = total > 0 ? Math.min(1, Math.max(0, iteration / total)) : 1;
            options.onProgress?.(start + (end - start) * phaseProgress, 1, bestScore);
        },
    };
}

function orderedSubsetCount(filamentCount: number): number {
    let total = 0;
    let permutations = 1;
    for (let length = 1; length <= filamentCount; length++) {
        permutations *= filamentCount - length + 1;
        total += permutations;
    }
    return total;
}

/** Number of no-repeat base sequences an Exact search would evaluate. */
export function getExactBaseOrderCount(filamentCount: number): number {
    return filamentCount > 0 ? orderedSubsetCount(filamentCount) : 0;
}

function repeatedInsertionUpperBound(filamentCount: number, maxExtraRepeats: number): number {
    let total = 0;
    for (let extra = 0; extra < maxExtraRepeats; extra++) {
        total += filamentCount * (filamentCount + extra + 1);
    }
    return total;
}

function expandWithRepeatedFilaments(
    initial: ScoredSequence,
    filaments: Filament[],
    scoreSequence: SequenceScorer,
    maxExtraRepeats: number
): { best: ScoredSequence; iterations: number } {
    const maxLength = maxSequenceLength(filaments, maxExtraRepeats);
    let best = initial;
    let iterations = 0;

    while (best.order.length < maxLength) {
        let next: ScoredSequence | null = null;

        for (const filament of filaments) {
            for (let position = 0; position <= best.order.length; position++) {
                const candidateOrder = [
                    ...best.order.slice(0, position),
                    filament,
                    ...best.order.slice(position),
                ];
                if (!isValidSequence(candidateOrder, maxExtraRepeats)) continue;

                const candidate = {
                    order: candidateOrder,
                    score: scoreSequence(candidateOrder),
                };
                iterations++;
                if (isBetterCandidate(candidate, next)) next = candidate;
            }
        }

        if (!next || next.score >= best.score) break;
        best = next;
    }

    return { best, iterations };
}

// ============================================================================
// Exhaustive Search (all ordered non-empty subsets)
// ============================================================================

function optimizeExhaustive(
    filaments: Filament[],
    scoreSequence: SequenceScorer,
    options: OptimizerOptions
): OptimizerResult {
    if (filaments.length === 0) {
        return {
            order: [],
            score: Infinity,
            iterations: 0,
            converged: true,
        };
    }

    const maxExtraRepeats = resolveMaxExtraRepeats(options);
    const allowRepeatedSwaps = maxExtraRepeats > 0;
    const totalIterations =
        orderedSubsetCount(filaments.length) +
        (allowRepeatedSwaps ? repeatedInsertionUpperBound(filaments.length, maxExtraRepeats) : 0);
    let best: ScoredSequence | null = null;
    let iterations = 0;
    reportProgress(options, 0, totalIterations, Infinity);

    const sequence: Filament[] = [];
    const used = new Uint8Array(filaments.length);
    const visit = (): void => {
        if (sequence.length > 0) {
            const candidateScore = scoreSequence(sequence);
            iterations++;
            if (
                !best ||
                candidateScore < best.score ||
                (candidateScore === best.score && compareSequenceKeys(sequence, best.order) < 0)
            ) {
                best = { order: [...sequence], score: candidateScore };
            }
            reportProgress(options, iterations, totalIterations, best?.score ?? Infinity);
        }

        for (let index = 0; index < filaments.length; index++) {
            if (used[index]) continue;
            used[index] = 1;
            sequence.push(filaments[index]);
            visit();
            sequence.pop();
            used[index] = 0;
        }
    };

    visit();
    const baseBest = best ?? { order: [filaments[0]], score: scoreSequence([filaments[0]]) };

    if (!allowRepeatedSwaps) {
        return {
            order: baseBest.order,
            score: baseBest.score,
            iterations,
            converged: true,
        };
    }

    const expanded = expandWithRepeatedFilaments(
        baseBest,
        filaments,
        scoreSequence,
        maxExtraRepeats
    );
    return {
        order: expanded.best.order,
        score: expanded.best.score,
        iterations: iterations + expanded.iterations,
        converged: true,
    };
}

// ============================================================================
// Beam Search (deterministic variable-length search for medium profiles)
// ============================================================================

function optimizeBeamSearch(
    filaments: Filament[],
    scoreSequence: SequenceScorer,
    options: OptimizerOptions
): OptimizerResult {
    if (filaments.length <= 1) {
        return optimizeExhaustive(filaments, scoreSequence, options);
    }

    const maxExtraRepeats = resolveMaxExtraRepeats(options);
    const allowRepeatedSwaps = maxExtraRepeats > 0;
    const maximumLength = maxSequenceLength(filaments, maxExtraRepeats);
    const beamWidth = options.beamWidth ?? BALANCED_BEAM_WIDTH;
    const totalIterations = filaments.length + (maximumLength - 1) * beamWidth * filaments.length;
    let iterations = 0;
    let best: ScoredSequence | null = null;
    reportProgress(options, 0, totalIterations, Infinity);

    let beam = filaments.map((filament) => {
        const candidate = { order: [filament], score: scoreSequence([filament]) };
        iterations++;
        if (isBetterCandidate(candidate, best)) best = candidate;
        reportProgress(options, iterations, totalIterations, best?.score ?? Infinity);
        return candidate;
    });
    beam.sort((left, right) =>
        left.score === right.score
            ? compareSequenceKeys(left.order, right.order)
            : left.score - right.score
    );
    beam = beam.slice(0, beamWidth);

    for (let depth = 1; depth < maximumLength && beam.length > 0; depth++) {
        const candidates = new Map<string, ScoredSequence>();

        for (const state of beam) {
            for (const filament of filaments) {
                if (state.order.at(-1)?.id === filament.id) continue;
                if (
                    !allowRepeatedSwaps &&
                    state.order.some((existing) => existing.id === filament.id)
                ) {
                    continue;
                }

                const order = [...state.order, filament];
                if (!isValidSequence(order, maxExtraRepeats)) continue;
                const key = sequenceKey(order);
                if (candidates.has(key)) continue;

                const candidate = { order, score: scoreSequence(order) };
                candidates.set(key, candidate);
                iterations++;
                if (isBetterCandidate(candidate, best)) best = candidate;
                reportProgress(options, iterations, totalIterations, best?.score ?? Infinity);
            }
        }

        beam = [...candidates.values()]
            .sort((left, right) =>
                left.score === right.score
                    ? compareSequenceKeys(left.order, right.order)
                    : left.score - right.score
            )
            .slice(0, beamWidth);
    }

    const bestSequence = best ?? { order: [filaments[0]], score: scoreSequence([filaments[0]]) };
    return {
        order: bestSequence.order,
        score: bestSequence.score,
        iterations,
        converged: true,
    };
}

// ============================================================================
// Simulated Annealing (Good balance of quality and speed)
// ============================================================================

/**
 * Simulated Annealing optimizer with geometric cooling schedule.
 *
 * SA is a probabilistic technique that can escape local minima by accepting
 * worse solutions with probability exp(-ΔE/T), where T decreases over time.
 */
function randomInitialSequence(
    filaments: Filament[],
    maxExtraRepeats: number,
    rng: SeededRandom
): Filament[] {
    const shuffled = rng.shuffle(filaments);
    const maximumLength = maxSequenceLength(filaments, maxExtraRepeats);
    const initialLength = rng.nextInt(1, Math.min(filaments.length, maximumLength) + 1);
    return shuffled.slice(0, initialLength);
}

function sequenceEquals(left: Filament[], right: Filament[]): boolean {
    return (
        left.length === right.length &&
        left.every((filament, index) => filament.id === right[index].id)
    );
}

function buildVariableLengthNeighbor(
    sequence: Filament[],
    filaments: Filament[],
    maxExtraRepeats: number,
    rng: SeededRandom
): Filament[] {
    const allowRepeatedSwaps = maxExtraRepeats > 0;
    const maximumLength = maxSequenceLength(filaments, maxExtraRepeats);
    const availableMoves: Array<'swap' | 'relocate' | 'insert' | 'remove' | 'replace'> = [];

    if (sequence.length > 1) {
        availableMoves.push('swap', 'relocate', 'remove');
    }
    if (sequence.length < maximumLength) availableMoves.push('insert');
    availableMoves.push('replace');

    for (let attempt = 0; attempt < 12; attempt++) {
        const move = availableMoves[rng.nextInt(0, availableMoves.length)];
        const candidate = [...sequence];

        if (move === 'swap' && candidate.length > 1) {
            const first = rng.nextInt(0, candidate.length);
            let second = rng.nextInt(0, candidate.length - 1);
            if (second >= first) second++;
            [candidate[first], candidate[second]] = [candidate[second], candidate[first]];
        } else if (move === 'relocate' && candidate.length > 1) {
            const from = rng.nextInt(0, candidate.length);
            const [moved] = candidate.splice(from, 1);
            candidate.splice(rng.nextInt(0, candidate.length + 1), 0, moved);
        } else if (move === 'insert' && candidate.length < maximumLength) {
            const eligible = allowRepeatedSwaps
                ? filaments
                : filaments.filter(
                      (filament) => !candidate.some((existing) => existing.id === filament.id)
                  );
            if (eligible.length === 0) continue;
            candidate.splice(
                rng.nextInt(0, candidate.length + 1),
                0,
                eligible[rng.nextInt(0, eligible.length)]
            );
        } else if (move === 'remove' && candidate.length > 1) {
            candidate.splice(rng.nextInt(0, candidate.length), 1);
        } else if (move === 'replace') {
            const position = rng.nextInt(0, candidate.length);
            const eligible = filaments.filter((filament) => {
                if (filament.id === candidate[position].id) return false;
                return (
                    allowRepeatedSwaps ||
                    !candidate.some(
                        (existing, index) => index !== position && existing.id === filament.id
                    )
                );
            });
            if (eligible.length === 0) continue;
            candidate[position] = eligible[rng.nextInt(0, eligible.length)];
        }

        if (isValidSequence(candidate, maxExtraRepeats) && !sequenceEquals(candidate, sequence)) {
            return candidate;
        }
    }

    return sequence;
}

/**
 * Core simulated-annealing loop from a given start. Deterministic for a fixed
 * seeded `rng`. `onStep` fires once per iteration with the running best score so
 * callers can drive progress. Reused by the balanced multi-start search.
 */
function runAnneal(
    initialOrder: Filament[],
    filaments: Filament[],
    scoreSequence: SequenceScorer,
    maxExtraRepeats: number,
    rng: SeededRandom,
    maxIterations: number,
    initialTemperature: number,
    coolingRate: number,
    onStep?: (bestScore: number) => void
): { best: ScoredSequence; iterations: number } {
    let currentOrder = initialOrder;
    let currentScore = scoreSequence(currentOrder);
    let best: ScoredSequence = { order: [...currentOrder], score: currentScore };
    let temperature = initialTemperature;
    let iterations = 0;

    while (iterations < maxIterations && temperature > SA_MIN_TEMPERATURE) {
        iterations++;

        const newOrder = buildVariableLengthNeighbor(currentOrder, filaments, maxExtraRepeats, rng);
        if (sequenceEquals(newOrder, currentOrder)) {
            temperature *= coolingRate;
            onStep?.(best.score);
            continue;
        }

        const newScore = scoreSequence(newOrder);
        const deltaE = newScore - currentScore;

        // Accept if better, or with probability exp(-ΔE/T) if worse
        const acceptProbability = deltaE < 0 ? 1.0 : Math.exp(-deltaE / temperature);

        if (rng.next() < acceptProbability) {
            currentOrder = newOrder;
            currentScore = newScore;

            if (currentScore < best.score) {
                best = { order: [...currentOrder], score: currentScore };
            }
        }

        temperature *= coolingRate;
        onStep?.(best.score);
    }

    return { best, iterations };
}

function optimizeSimulatedAnnealing(
    filaments: Filament[],
    scoreSequence: SequenceScorer,
    options: OptimizerOptions
): OptimizerResult {
    if (filaments.length <= 1) {
        return optimizeExhaustive(filaments, scoreSequence, options);
    }

    const maxExtraRepeats = resolveMaxExtraRepeats(options);
    const rng = new SeededRandom(options.seed);
    const maxIterations = options.maxIterations ?? Math.max(1000, filaments.length * 100);
    const initialTemp = options.temperature ?? SA_INITIAL_TEMPERATURE;
    const coolingRate = options.coolingRate ?? SA_DEFAULT_COOLING_RATE;

    const initialOrder = randomInitialSequence(filaments, maxExtraRepeats, rng);
    reportProgress(options, 0, maxIterations, scoreSequence(initialOrder));

    let reported = 0;
    const { best, iterations } = runAnneal(
        initialOrder,
        filaments,
        scoreSequence,
        maxExtraRepeats,
        rng,
        maxIterations,
        initialTemp,
        coolingRate,
        (bestScore) => {
            reported++;
            reportProgress(options, reported, maxIterations, bestScore);
        }
    );

    return {
        order: best.order,
        score: best.score,
        iterations,
        converged: true,
    };
}

/**
 * Refine a deterministic beam result with seeded multi-start annealing. A
 * supplied baseline is retained throughout, so a deeper tier can never return
 * a worse result than the tier it extends.
 */
function optimizeHybrid(
    filaments: Filament[],
    scoreSequence: SequenceScorer,
    options: OptimizerOptions,
    plan: HybridSearchPlan,
    baseline?: OptimizerResult
): OptimizerResult {
    if (filaments.length <= 1) {
        return optimizeExhaustive(filaments, scoreSequence, options);
    }

    const maxExtraRepeats = resolveMaxExtraRepeats(options);
    const rng = new SeededRandom(options.seed);
    const iterationsPerRestart =
        options.maxIterations ??
        Math.max(plan.minimumIterationsPerRestart, filaments.length * plan.iterationsPerFilament);
    const initialTemp = options.temperature ?? SA_HYBRID_TEMPERATURE;
    // Cool from the initial temperature to the floor across one restart so each
    // restart spends its whole budget refining instead of freezing early.
    const coolingRate =
        options.coolingRate ??
        Math.pow(SA_MIN_TEMPERATURE / initialTemp, 1 / Math.max(1, iterationsPerRestart));

    // Beam provides a strong deterministic seed before the broader local search.
    const beam = optimizeBeamSearch(filaments, scoreSequence, {
        ...options,
        beamWidth: options.beamWidth ?? plan.beamWidth,
        onProgress: undefined,
    });
    let best: ScoredSequence = { order: beam.order, score: beam.score };
    let iterations = beam.iterations;

    if (baseline && isBetterCandidate({ order: baseline.order, score: baseline.score }, best)) {
        best = { order: baseline.order, score: baseline.score };
    }
    iterations += baseline?.iterations ?? 0;

    const total = iterations + plan.restarts * iterationsPerRestart;
    let reported = iterations;
    reportProgress(options, reported, total, best.score);

    // Restart 0 refines the strongest retained candidate; the rest explore
    // seeded-random starts. Keep the global best across all restarts.
    for (let restart = 0; restart < plan.restarts; restart++) {
        const initialOrder =
            restart === 0 ? best.order : randomInitialSequence(filaments, maxExtraRepeats, rng);

        const outcome = runAnneal(
            initialOrder,
            filaments,
            scoreSequence,
            maxExtraRepeats,
            rng,
            iterationsPerRestart,
            initialTemp,
            coolingRate,
            (bestScore) => {
                reported++;
                reportProgress(options, reported, total, Math.min(bestScore, best.score));
            }
        );

        iterations += outcome.iterations;
        if (isBetterCandidate(outcome.best, best)) best = outcome.best;
    }

    reportProgress(options, total, total, best.score);

    return {
        order: best.order,
        score: best.score,
        iterations,
        converged: true,
    };
}

/** Deep is Thorough plus a wider, much larger hybrid pass. */
function optimizeDeep(
    filaments: Filament[],
    scoreSequence: SequenceScorer,
    options: OptimizerOptions
): OptimizerResult {
    const thorough = optimizeHybrid(
        filaments,
        scoreSequence,
        withProgressSpan(options, 0, 0.2),
        THOROUGH_PLAN
    );
    return optimizeHybrid(
        filaments,
        scoreSequence,
        withProgressSpan(options, 0.2, 1),
        DEEP_PLAN,
        thorough
    );
}

function resolveAlgorithm(
    requested: OptimizerAlgorithm,
    filamentCount: number
): ResolvedOptimizerAlgorithm {
    if (filamentCount <= 1) return 'exhaustive';

    switch (requested) {
        // Explicit concrete searches pass through unchanged.
        case 'exhaustive':
        case 'beam':
        case 'simulated-annealing':
            return requested;
        // Fast uses a deliberately narrow beam for rapid previews.
        case 'fast':
            return 'narrow-beam';
        // Balanced is the full deterministic beam baseline.
        case 'balanced':
            return 'beam';
        // Thorough and Deep are progressively broader deterministic hybrids.
        case 'thorough':
            return 'thorough-hybrid';
        case 'deep':
            return 'deep-hybrid';
        case 'exact':
            return 'exact-base';
    }
}

function runResolvedOptimizer(
    resolved: ResolvedOptimizerAlgorithm,
    filaments: Filament[],
    scoreSequence: SequenceScorer,
    options: OptimizerOptions,
    exactBase?: OptimizerResult
): OptimizerResult {
    switch (resolved) {
        case 'exhaustive':
            return optimizeExhaustive(filaments, scoreSequence, options);
        case 'beam':
            return optimizeBeamSearch(filaments, scoreSequence, options);
        case 'simulated-annealing':
            return optimizeSimulatedAnnealing(filaments, scoreSequence, options);
        case 'narrow-beam':
            return optimizeBeamSearch(filaments, scoreSequence, {
                ...options,
                beamWidth: options.beamWidth ?? FAST_BEAM_WIDTH,
            });
        case 'thorough-hybrid':
            return optimizeHybrid(filaments, scoreSequence, options, THOROUGH_PLAN);
        case 'deep-hybrid':
            return optimizeDeep(filaments, scoreSequence, options);
        case 'exact-base': {
            const repeatLimit = resolveMaxExtraRepeats(options);
            if (repeatLimit === 0) {
                return optimizeExhaustive(filaments, scoreSequence, options);
            }
            if (!exactBase) {
                // Preserve the established Exact behavior for ordinary enhanced
                // matching: combine the complete base-order enumeration with
                // Deep's wider repeat-placement search.
                const deep = optimizeDeep(
                    filaments,
                    scoreSequence,
                    withProgressSpan(options, 0, 0.4)
                );
                const exhaustive = optimizeExhaustive(
                    filaments,
                    scoreSequence,
                    withProgressSpan(options, 0.4, 1)
                );
                const best = isBetterCandidate(deep, exhaustive) ? deep : exhaustive;
                return {
                    ...best,
                    iterations: deep.iterations + exhaustive.iterations,
                    converged: true,
                };
            }
            // The no-repeat tier already enumerated every ordered base subset.
            // For a later repeat tier, retain that exact baseline, try targeted
            // insertions from it, and use Deep to explore alternate placements.
            const expanded = expandWithRepeatedFilaments(
                { order: exactBase.order, score: exactBase.score },
                filaments,
                scoreSequence,
                repeatLimit
            );
            const deep = optimizeDeep(filaments, scoreSequence, options);
            const expandedCandidate = expanded.best;
            const deepCandidate = { order: deep.order, score: deep.score };
            const best = isBetterCandidate(deepCandidate, expandedCandidate)
                ? deepCandidate
                : expandedCandidate;
            return {
                order: best.order,
                score: best.score,
                iterations: deep.iterations + expanded.iterations,
                converged: true,
            };
        }
    }
}

function sequenceSeparationReport(
    order: Filament[],
    context: ScoringContext
): ColorSeparationReport {
    const palette = buildAchievableColorPalette(
        order,
        context.layerHeight,
        context.firstLayerHeight,
        context.maxHeight,
        context.transitionOpacity,
        new Map<string, number>(),
        context.appearanceModel
    );
    return mapTargetsWithSeparation(palette, context.imageColors, context.separationMaxDeltaE)
        .report;
}

// ============================================================================
// Main Optimizer Interface
// ============================================================================

/**
 * Optimize filament ordering using specified algorithm.
 *
 * @param filaments - Filaments to order
 * @param context - Scoring context (image colors, layer heights)
 * @param options - Optimizer configuration
 * @returns Best ordering found with quality score
 */
export function optimizeFilamentOrder(
    filaments: Filament[],
    context: ScoringContext,
    options: Partial<OptimizerOptions> = {}
): OptimizerResult {
    const opts: OptimizerOptions = {
        algorithm: 'balanced',
        cachingEnabled: true,
        ...options,
    };

    const resolved = resolveAlgorithm(opts.algorithm, filaments.length);
    const scoringContext: ScoringContext = {
        ...context,
        preserveSeparation: opts.preserveSeparation ?? context.preserveSeparation ?? false,
        separationMaxDeltaE:
            (opts.preserveSeparation ?? context.preserveSeparation)
                ? normalizeSeparationMaxDeltaE(
                      opts.separationMaxDeltaE ?? context.separationMaxDeltaE
                  )
                : undefined,
    };
    opts.preserveSeparation = scoringContext.preserveSeparation;
    opts.separationMaxDeltaE = scoringContext.separationMaxDeltaE;

    // Tiers share the same automatic seed so higher effort builds directly on
    // comparable deterministic search paths. The cache key still includes the
    // requested tier because their budgets and outputs can differ.
    const defaultSeedInput = canonicalOptimizerInput(
        filaments,
        scoringContext,
        'tier-comparison',
        opts
    );
    const seed = opts.seed ?? stableHash32(defaultSeedInput);
    opts.seed = seed;
    const cacheKey = canonicalOptimizerInput(filaments, scoringContext, opts.algorithm, opts, seed);

    if (opts.cachingEnabled) {
        const cached = globalCache.get(cacheKey);
        if (cached) {
            reportProgress(opts, 1, 1, cached.score);
            return { ...cached, cacheHit: true };
        }
    }

    const scoreSequence = createSequenceScorer(scoringContext);
    const requestedRepeats = resolveMaxExtraRepeats(opts);
    let result: OptimizerResult;

    if (scoringContext.preserveSeparation && requestedRepeats > 0) {
        let retained: OptimizerResult | undefined;
        let exactBase: OptimizerResult | undefined;
        let totalIterations = 0;
        // Search physical complexity conservatively: completely search the
        // selected effort tier without repeats, then permit one additional
        // occurrence at a time and stop at the first valid separation.
        for (let repeatLimit = 0; repeatLimit <= requestedRepeats; repeatLimit++) {
            // This search may stop after any tier. Give the primary no-repeat
            // tier half the bar, then split the remainder geometrically instead
            // of making Exact appear stuck in 1/(repeat limit + 1) of the bar.
            const progressStart = repeatLimit === 0 ? 0 : 1 - 0.5 ** repeatLimit;
            const progressEnd = repeatLimit === requestedRepeats ? 1 : 1 - 0.5 ** (repeatLimit + 1);
            const tierOptions: OptimizerOptions = {
                ...opts,
                allowRepeatedSwaps: repeatLimit > 0,
                maxExtraRepeats: repeatLimit,
                onProgress: opts.onProgress
                    ? withProgressSpan(opts, progressStart, progressEnd).onProgress
                    : undefined,
            };
            const candidate = runResolvedOptimizer(
                resolved,
                filaments,
                scoreSequence,
                tierOptions,
                exactBase
            );
            totalIterations += candidate.iterations;
            candidate.separation = sequenceSeparationReport(candidate.order, scoringContext);
            candidate.extraRepeatCount = countExtraFilamentOccurrences(candidate.order);
            candidate.iterations = totalIterations;
            if (!retained || isBetterCandidate(candidate, retained)) retained = candidate;
            if (repeatLimit === 0 && resolved === 'exact-base') exactBase = candidate;
            if (candidate.separation.satisfied) {
                retained = candidate;
                break;
            }
        }
        result = retained!;
    } else {
        result = runResolvedOptimizer(resolved, filaments, scoreSequence, opts);
        if (scoringContext.preserveSeparation) {
            result.separation = sequenceSeparationReport(result.order, scoringContext);
        }
    }

    const actualExtraRepeats = countExtraFilamentOccurrences(result.order);
    if (!isWithinTotalRepeatLimit(result.order, requestedRepeats)) {
        throw new Error(
            `Optimizer produced ${actualExtraRepeats} repeated filament appearances with a limit of ${requestedRepeats}`
        );
    }
    result.extraRepeatCount = actualExtraRepeats;

    // Tag the result with the resolved algorithm
    result.resolvedAlgorithm = resolved;
    reportProgress(opts, result.iterations, result.iterations, result.score);

    if (opts.cachingEnabled) {
        globalCache.set(cacheKey, result);
    }

    return result;
}

/**
 * Clear the optimizer cache
 */
export function clearOptimizerCache(): void {
    globalCache.clear();
}

/**
 * Get optimizer cache statistics
 */
export function getOptimizerCacheStats(): { size: number; maxSize: number } {
    return {
        size: globalCache.size,
        maxSize: 100,
    };
}
