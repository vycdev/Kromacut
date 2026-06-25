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
import {
    buildAchievableColorPalette,
    scoreSequenceAgainstImage,
    type WeightedLab,
} from './autoPaint';

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
}

export interface ScoringContext {
    imageColors: WeightedLab[];
    layerHeight: number;
    firstLayerHeight: number;
    maxHeight?: number;
    transitionOpacity?: number;
    preserveSeparation?: boolean;
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
        maxIterations: options.maxIterations ?? null,
        temperature: options.temperature ?? null,
        coolingRate: options.coolingRate ?? null,
        populationSize: options.populationSize ?? null,
        mutationRate: options.mutationRate ?? null,
        eliteCount: options.eliteCount ?? null,
        beamWidth: options.beamWidth ?? null,
    };
}

function canonicalOptimizerInput(
    filaments: Filament[],
    context: ScoringContext,
    algorithm: string,
    options: OptimizerOptions,
    seed?: number
): string {
    return JSON.stringify({
        filaments: filaments.map((filament) => ({
            id: filament.id,
            color: filament.color,
            td: filament.td,
            calibrationTd: filament.calibration?.td ?? null,
        })),
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

export function createSequenceScorer(context: ScoringContext): (filaments: Filament[]) => number {
    const paletteCache = new Map<string, ReturnType<typeof buildAchievableColorPalette>>();
    const transitionThicknessCache = new Map<string, number>();

    return (filaments) => {
        if (filaments.length === 0) return Infinity;
        const sequenceKey = filaments
            .map((filament) =>
                [filament.id, filament.color, filament.td, ...(filament.calibration?.td ?? [])].join(':')
            )
            .join('|');
        let palette = paletteCache.get(sequenceKey);
        if (!palette) {
            palette = buildAchievableColorPalette(
                filaments,
                context.layerHeight,
                context.firstLayerHeight,
                context.maxHeight,
                context.transitionOpacity,
                transitionThicknessCache
            );
            paletteCache.set(sequenceKey, palette);
        }
        return scoreSequenceAgainstImage(palette, context.imageColors, {
            preserveSeparation: context.preserveSeparation,
        });
    };
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

type SequenceScorer = (filaments: Filament[]) => number;
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

function hasConsecutiveDuplicates(sequence: Filament[]): boolean {
    return sequence.some((filament, index) => index > 0 && filament.id === sequence[index - 1].id);
}

function hasDuplicateIds(sequence: Filament[]): boolean {
    return new Set(sequence.map((filament) => filament.id)).size !== sequence.length;
}

function isValidSequence(sequence: Filament[], allowRepeatedSwaps: boolean): boolean {
    return (
        sequence.length > 0 &&
        !hasConsecutiveDuplicates(sequence) &&
        (allowRepeatedSwaps || !hasDuplicateIds(sequence))
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

function isBetterCandidate(
    candidate: ScoredSequence,
    current: ScoredSequence | null
): boolean {
    if (!current) return true;
    if (candidate.score !== current.score) return candidate.score < current.score;
    return sequenceKey(candidate.order) < sequenceKey(current.order);
}

function reportProgress(
    options: OptimizerOptions,
    iteration: number,
    total: number,
    bestScore: number
) {
    options.onProgress?.(Math.min(iteration, total), Math.max(total, 1), bestScore);
}

function withProgressSpan(
    options: OptimizerOptions,
    start: number,
    end: number
): OptimizerOptions {
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
                if (!isValidSequence(candidateOrder, true)) continue;

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

    const visit = (sequence: Filament[], remaining: Filament[]): void => {
        if (sequence.length > 0) {
            const candidate = { order: sequence, score: scoreSequence(sequence) };
            iterations++;
            if (isBetterCandidate(candidate, best)) best = candidate;
            reportProgress(options, iterations, totalIterations, best?.score ?? Infinity);
        }

        for (let index = 0; index < remaining.length; index++) {
            visit(
                [...sequence, remaining[index]],
                [...remaining.slice(0, index), ...remaining.slice(index + 1)]
            );
        }
    };

    visit([], filaments);
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
    const totalIterations =
        filaments.length + (maximumLength - 1) * beamWidth * filaments.length;
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
            ? sequenceKey(left.order).localeCompare(sequenceKey(right.order))
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
                    ? sequenceKey(left.order).localeCompare(sequenceKey(right.order))
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

        if (isValidSequence(candidate, allowRepeatedSwaps) && !sequenceEquals(candidate, sequence)) {
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

        const newOrder = buildVariableLengthNeighbor(
            currentOrder,
            filaments,
            maxExtraRepeats,
            rng
        );
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
            restart === 0
                ? best.order
                : randomInitialSequence(filaments, maxExtraRepeats, rng);

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

/**
 * Exact base-order search. Repeated swaps remain a separate larger space, so
 * when they are enabled retain Deep's repeat-aware result alongside exact base
 * enumeration and its greedy repeat refinement.
 */
function optimizeExactBase(
    filaments: Filament[],
    scoreSequence: SequenceScorer,
    options: OptimizerOptions
): OptimizerResult {
    if (resolveMaxExtraRepeats(options) === 0) {
        return optimizeExhaustive(filaments, scoreSequence, options);
    }

    const deep = optimizeDeep(filaments, scoreSequence, withProgressSpan(options, 0, 0.4));
    const exact = optimizeExhaustive(
        filaments,
        scoreSequence,
        withProgressSpan(options, 0.4, 1)
    );
    const exactCandidate = { order: exact.order, score: exact.score };
    const deepCandidate = { order: deep.order, score: deep.score };
    const best = isBetterCandidate(deepCandidate, exactCandidate) ? deepCandidate : exactCandidate;

    return {
        order: best.order,
        score: best.score,
        iterations: deep.iterations + exact.iterations,
        converged: true,
    };
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

    // Tiers share the same automatic seed so higher effort builds directly on
    // comparable deterministic search paths. The cache key still includes the
    // requested tier because their budgets and outputs can differ.
    const defaultSeedInput = canonicalOptimizerInput(filaments, context, 'tier-comparison', opts);
    const seed = opts.seed ?? stableHash32(defaultSeedInput);
    opts.seed = seed;
    const cacheKey = canonicalOptimizerInput(filaments, context, opts.algorithm, opts, seed);

    if (opts.cachingEnabled) {
        const cached = globalCache.get(cacheKey);
        if (cached) {
            reportProgress(opts, 1, 1, cached.score);
            return { ...cached, cacheHit: true };
        }
    }

    let result: OptimizerResult;
    // The scoring mode lives in OptimizerOptions; mirror it into the context the
    // scorer reads so callers only need to set it in one place.
    const scoreSequence = createSequenceScorer({
        ...context,
        preserveSeparation: opts.preserveSeparation ?? context.preserveSeparation,
    });

    switch (resolved) {
        case 'exhaustive':
            result = optimizeExhaustive(filaments, scoreSequence, opts);
            break;
        case 'beam':
            result = optimizeBeamSearch(filaments, scoreSequence, opts);
            break;
        case 'simulated-annealing':
            result = optimizeSimulatedAnnealing(filaments, scoreSequence, opts);
            break;
        case 'narrow-beam':
            result = optimizeBeamSearch(filaments, scoreSequence, {
                ...opts,
                beamWidth: opts.beamWidth ?? FAST_BEAM_WIDTH,
            });
            break;
        case 'thorough-hybrid':
            result = optimizeHybrid(filaments, scoreSequence, opts, THOROUGH_PLAN);
            break;
        case 'deep-hybrid':
            result = optimizeDeep(filaments, scoreSequence, opts);
            break;
        case 'exact-base':
            result = optimizeExactBase(filaments, scoreSequence, opts);
            break;
    }

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
