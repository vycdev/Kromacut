/**
 * Advanced Filament Order Optimizer
 *
 * Implements sophisticated optimization algorithms to find the best filament ordering
 * for multi-material lithophanes. Supports:
 * - Simulated Annealing: Probabilistic global optimization with temperature scheduling
 * - Genetic Algorithm: Population-based evolutionary optimization
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

export interface OptimizerOptions {
    algorithm: 'exhaustive' | 'simulated-annealing' | 'genetic' | 'auto';
    seed?: number; // For deterministic results
    maxIterations?: number; // Algorithm-specific iteration limit
    temperature?: number; // Initial temperature for SA
    coolingRate?: number; // Temperature decay for SA
    populationSize?: number; // Population size for GA
    mutationRate?: number; // Mutation probability for GA
    eliteCount?: number; // Number of elite individuals to preserve in GA
    cachingEnabled?: boolean; // Enable result caching
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
        maxIterations: options.maxIterations ?? null,
        temperature: options.temperature ?? null,
        coolingRate: options.coolingRate ?? null,
        populationSize: options.populationSize ?? null,
        mutationRate: options.mutationRate ?? null,
        eliteCount: options.eliteCount ?? null,
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
        const sequenceKey = filaments.map((filament) => `${filament.id}:${filament.color}:${filament.td}`).join('|');
        let palette = paletteCache.get(sequenceKey);
        if (!palette) {
            palette = buildAchievableColorPalette(
                filaments,
                context.layerHeight,
                context.firstLayerHeight,
                context.maxHeight,
                transitionThicknessCache
            );
            paletteCache.set(sequenceKey, palette);
        }
        return scoreSequenceAgainstImage(palette, context.imageColors);
    };
}

export function scoreFilamentSequence(filaments: Filament[], context: ScoringContext): number {
    return createSequenceScorer(context)(filaments);
}

// ============================================================================
// Exhaustive Search (Optimal but slow for >8 filaments)
// ============================================================================

function optimizeExhaustive(
    filaments: Filament[],
    scoreSequence: (filaments: Filament[]) => number
): OptimizerResult {
    if (filaments.length === 0) {
        return {
            order: [],
            score: Infinity,
            iterations: 0,
            converged: true,
        };
    }

    if (filaments.length === 1) {
        return {
            order: [filaments[0]],
            score: scoreSequence(filaments),
            iterations: 1,
            converged: true,
        };
    }

    let bestOrder = filaments;
    let bestScore = scoreSequence(filaments);
    let iterations = 0;

    // Generate all permutations
    const permute = (arr: Filament[], start = 0): void => {
        if (start === arr.length - 1) {
            iterations++;
            const score = scoreSequence(arr);
            if (score < bestScore) {
                bestScore = score;
                bestOrder = [...arr];
            }
            return;
        }

        for (let i = start; i < arr.length; i++) {
            [arr[start], arr[i]] = [arr[i], arr[start]];
            permute(arr, start + 1);
            [arr[start], arr[i]] = [arr[i], arr[start]];
        }
    };

    permute([...filaments]);

    return {
        order: bestOrder,
        score: bestScore,
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
function optimizeSimulatedAnnealing(
    filaments: Filament[],
    scoreSequence: (filaments: Filament[]) => number,
    options: OptimizerOptions
): OptimizerResult {
    if (filaments.length <= 1) {
        return optimizeExhaustive(filaments, scoreSequence);
    }

    const rng = new SeededRandom(options.seed);
    const maxIterations = options.maxIterations ?? Math.max(1000, filaments.length * 100);
    const initialTemp = options.temperature ?? 10.0;
    const coolingRate = options.coolingRate ?? 0.995;
    const minTemp = 0.01;

    let currentOrder = rng.shuffle(filaments);
    let currentScore = scoreSequence(currentOrder);
    let bestOrder = [...currentOrder];
    let bestScore = currentScore;
    let temperature = initialTemp;
    let iterations = 0;

    while (iterations < maxIterations && temperature > minTemp) {
        iterations++;

        // Generate neighbor by swapping two random filaments
        const newOrder = [...currentOrder];
        const i = rng.nextInt(0, newOrder.length);
        let j = rng.nextInt(0, newOrder.length - 1);
        if (j >= i) j++;
        [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];

        const newScore = scoreSequence(newOrder);
        const deltaE = newScore - currentScore;

        // Accept if better, or with probability exp(-ΔE/T) if worse
        const acceptProbability = deltaE < 0 ? 1.0 : Math.exp(-deltaE / temperature);

        if (rng.next() < acceptProbability) {
            currentOrder = newOrder;
            currentScore = newScore;

            if (currentScore < bestScore) {
                bestScore = currentScore;
                bestOrder = [...currentOrder];
            }
        }

        temperature *= coolingRate;
    }

    // Convergence check: did we stabilize?
    const converged = temperature <= minTemp || iterations >= maxIterations;

    return {
        order: bestOrder,
        score: bestScore,
        iterations,
        converged,
    };
}

// ============================================================================
// Genetic Algorithm (Great for large search spaces)
// ============================================================================

/**
 * Genetic Algorithm optimizer with elitism and tournament selection.
 *
 * Maintains a population of candidate solutions, evolves them through
 * selection, crossover, and mutation.
 */
function optimizeGenetic(
    filaments: Filament[],
    scoreSequence: (filaments: Filament[]) => number,
    options: OptimizerOptions
): OptimizerResult {
    if (filaments.length <= 1) {
        return optimizeExhaustive(filaments, scoreSequence);
    }

    const rng = new SeededRandom(options.seed);
    const populationSize = options.populationSize ?? Math.max(50, filaments.length * 10);
    const maxGenerations = options.maxIterations ?? 100;
    const mutationRate = options.mutationRate ?? 0.1;
    const eliteCount = options.eliteCount ?? Math.max(2, Math.floor(populationSize * 0.1));

    // Initialize population with random orderings
    let population: Array<{ order: Filament[]; score: number }> = [];
    for (let i = 0; i < populationSize; i++) {
        const order = rng.shuffle(filaments);
        const score = scoreSequence(order);
        population.push({ order, score });
    }

    let bestEver = { ...population[0] };
    let generations = 0;
    let stagnantGenerations = 0;
    const maxStagnant = 20;

    while (generations < maxGenerations && stagnantGenerations < maxStagnant) {
        generations++;

        // Sort by score (lower is better)
        population.sort((a, b) => a.score - b.score);

        // Check for improvement
        if (population[0].score < bestEver.score) {
            bestEver = { order: [...population[0].order], score: population[0].score };
            stagnantGenerations = 0;
        } else {
            stagnantGenerations++;
        }

        // Elitism: preserve best individuals
        const nextGeneration = population.slice(0, eliteCount).map((ind) => ({
            order: [...ind.order],
            score: ind.score,
        }));

        // Generate offspring
        while (nextGeneration.length < populationSize) {
            // Tournament selection: pick 3 random, choose best
            const parent1 = tournamentSelect(population, 3, rng);
            const parent2 = tournamentSelect(population, 3, rng);

            // Order crossover (OX)
            const child = orderCrossover(parent1.order, parent2.order, rng);

            // Mutation: swap two positions with probability
            if (rng.next() < mutationRate) {
                const i = rng.nextInt(0, child.length);
                const j = rng.nextInt(0, child.length);
                [child[i], child[j]] = [child[j], child[i]];
            }

            const score = scoreSequence(child);
            nextGeneration.push({ order: child, score });
        }

        population = nextGeneration;
    }

    return {
        order: bestEver.order,
        score: bestEver.score,
        iterations: generations,
        converged: stagnantGenerations >= maxStagnant,
    };
}

/**
 * Tournament selection: pick k random individuals, return best one
 */
function tournamentSelect(
    population: Array<{ order: Filament[]; score: number }>,
    tournamentSize: number,
    rng: SeededRandom
): { order: Filament[]; score: number } {
    let best = population[rng.nextInt(0, population.length)];

    for (let i = 1; i < tournamentSize; i++) {
        const candidate = population[rng.nextInt(0, population.length)];
        if (candidate.score < best.score) {
            best = candidate;
        }
    }

    return { order: [...best.order], score: best.score };
}

/**
 * Order crossover (OX): preserves relative order from both parents
 */
function orderCrossover(parent1: Filament[], parent2: Filament[], rng: SeededRandom): Filament[] {
    const length = parent1.length;
    const start = rng.nextInt(0, length);
    const end = rng.nextInt(start + 1, length + 1);

    // Copy segment from parent1
    const child: (Filament | null)[] = new Array(length).fill(null);
    for (let i = start; i < end; i++) {
        child[i] = parent1[i];
    }

    // Fill remaining from parent2, preserving order
    const remaining = parent2.filter((f) => !child.includes(f));
    let remainingIdx = 0;

    for (let i = 0; i < length; i++) {
        if (child[i] === null) {
            child[i] = remaining[remainingIdx++];
        }
    }

    return child as Filament[];
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
        algorithm: 'auto',
        cachingEnabled: true,
        ...options,
    };

    // Auto-select algorithm based on problem size (before cache check)
    let algorithm = opts.algorithm;
    if (algorithm === 'auto') {
        if (filaments.length <= 6) {
            algorithm = 'exhaustive';
        } else if (filaments.length <= 10) {
            algorithm = 'simulated-annealing';
        } else {
            algorithm = 'genetic';
        }
    }

    const defaultSeedInput = canonicalOptimizerInput(filaments, context, algorithm, opts);
    const seed = opts.seed ?? stableHash32(defaultSeedInput);
    opts.seed = seed;
    const cacheKey = canonicalOptimizerInput(filaments, context, algorithm, opts, seed);

    if (opts.cachingEnabled) {
        const cached = globalCache.get(cacheKey);
        if (cached) {
            return { ...cached, cacheHit: true };
        }
    }

    let result: OptimizerResult;
    const scoreSequence = createSequenceScorer(context);

    switch (algorithm) {
        case 'exhaustive':
            result = optimizeExhaustive(filaments, scoreSequence);
            break;
        case 'simulated-annealing':
            result = optimizeSimulatedAnnealing(filaments, scoreSequence, opts);
            break;
        case 'genetic':
            result = optimizeGenetic(filaments, scoreSequence, opts);
            break;
        default:
            throw new Error(`Unknown algorithm: ${algorithm}`);
    }

    // Tag the result with the resolved algorithm
    result.resolvedAlgorithm = algorithm;

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
