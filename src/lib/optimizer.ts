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
import { rgbToLab, deltaELab, hexToRgb, blendColors, type RGB, type Lab } from './autoPaint';

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
    imageColors: Array<Lab & { weight: number }>; // Weighted Lab colors from image
    layerHeight: number;
    firstLayerHeight: number;
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

/**
 * Calculate quality score for a filament ordering.
 * Lower score = better color reproduction.
 *
 * Score is weighted deltaE between image colors and achievable blended colors.
 */
function scoreFilamentOrder(filaments: Filament[], context: ScoringContext): number {
    if (filaments.length === 0) return Infinity;

    let totalError = 0;
    let totalWeight = 0;

    // For each image color, find the best achievable match using this filament stack
    for (const targetColor of context.imageColors) {
        const achievableColor = findBestAchievableColor(targetColor, filaments);
        const error = deltaELab(targetColor, achievableColor);

        // Apply region weight if provided
        totalError += error * targetColor.weight;
        totalWeight += targetColor.weight;
    }

    return totalWeight > 0 ? totalError / totalWeight : Infinity;
}

/**
 * Find the best color achievable by stacking filaments to a certain height.
 * Uses Beer-Lambert simulation to predict the blended color at various heights.
 */
function findBestAchievableColor(targetLab: Lab, filaments: Filament[]): Lab {
    if (filaments.length === 0) return { L: 0, a: 0, b: 0 };
    if (filaments.length === 1) {
        return rgbToLab(hexToRgb(filaments[0].color));
    }

    // Sample heights from base to full stack
    const maxHeight = filaments.reduce((sum, f) => sum + f.td * 3, 0); // ~3x TD per filament
    const steps = 20;
    let bestLab = rgbToLab(hexToRgb(filaments[0].color));
    let bestDelta = deltaELab(targetLab, bestLab);

    for (let i = 0; i <= steps; i++) {
        const height = (i / steps) * maxHeight;
        const blendedColor = simulateStackAtHeight(filaments, height);
        const blendedLab = rgbToLab(blendedColor);
        const delta = deltaELab(targetLab, blendedLab);

        if (delta < bestDelta) {
            bestDelta = delta;
            bestLab = blendedLab;
        }
    }

    return bestLab;
}

/**
 * Simulate the blended color of stacked filaments at a given height.
 */
function simulateStackAtHeight(filaments: Filament[], targetHeight: number): RGB {
    let currentHeight = 0;
    let blendedColor = hexToRgb(filaments[0].color);

    for (let i = 1; i < filaments.length && currentHeight < targetHeight; i++) {
        const prevFilament = filaments[i - 1];
        const currentFilament = filaments[i];
        const transitionHeight = Math.min(prevFilament.td * 3, targetHeight - currentHeight);

        if (transitionHeight <= 0) break;

        const bgColor = blendedColor;
        const fgColor = hexToRgb(currentFilament.color);
        blendedColor = blendColors(bgColor, fgColor, currentFilament.td, transitionHeight);

        currentHeight += transitionHeight;
    }

    return blendedColor;
}

// ============================================================================
// Exhaustive Search (Optimal but slow for >8 filaments)
// ============================================================================

function optimizeExhaustive(filaments: Filament[], context: ScoringContext): OptimizerResult {
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
            score: scoreFilamentOrder(filaments, context),
            iterations: 1,
            converged: true,
        };
    }

    let bestOrder = filaments;
    let bestScore = scoreFilamentOrder(filaments, context);
    let iterations = 0;

    // Generate all permutations
    const permute = (arr: Filament[], start = 0): void => {
        if (start === arr.length - 1) {
            iterations++;
            const score = scoreFilamentOrder(arr, context);
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
    context: ScoringContext,
    options: OptimizerOptions
): OptimizerResult {
    if (filaments.length <= 1) {
        return optimizeExhaustive(filaments, context);
    }

    const rng = new SeededRandom(options.seed);
    const maxIterations = options.maxIterations ?? Math.max(1000, filaments.length * 100);
    const initialTemp = options.temperature ?? 100.0;
    const coolingRate = options.coolingRate ?? 0.995;
    const minTemp = 0.01;

    let currentOrder = rng.shuffle(filaments);
    let currentScore = scoreFilamentOrder(currentOrder, context);
    let bestOrder = [...currentOrder];
    let bestScore = currentScore;
    let temperature = initialTemp;
    let iterations = 0;

    while (iterations < maxIterations && temperature > minTemp) {
        iterations++;

        // Generate neighbor by swapping two random filaments
        const newOrder = [...currentOrder];
        const i = rng.nextInt(0, newOrder.length);
        const j = rng.nextInt(0, newOrder.length);
        [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];

        const newScore = scoreFilamentOrder(newOrder, context);
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
    context: ScoringContext,
    options: OptimizerOptions
): OptimizerResult {
    if (filaments.length <= 1) {
        return optimizeExhaustive(filaments, context);
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
        const score = scoreFilamentOrder(order, context);
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

            const score = scoreFilamentOrder(child, context);
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

    switch (algorithm) {
        case 'exhaustive':
            result = optimizeExhaustive(filaments, context);
            break;
        case 'simulated-annealing':
            result = optimizeSimulatedAnnealing(filaments, context, opts);
            break;
        case 'genetic':
            result = optimizeGenetic(filaments, context, opts);
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
