import type { Filament } from '../types';
import type { CanonicalSrgbColor } from '../types/appearance';
import { fingerprintAppearanceFilaments, type StackMatrixCalibrationV1 } from './appearanceProfile';
import { rgbToLab, type Lab } from './colorDifference';
import {
    createPriorEffectiveOpticsModel,
    minimumOpaqueFoundationThickness,
} from './effectiveOptics';

type SelectionReason = 'coverage' | 'exploration' | 'reference';

export interface AdaptiveMatrixCandidate {
    /** Complete physical stack, including the backing padding below the recipe. */
    stack: number[];
    recipeLayerCount: number;
    backingPaddingLayerCount: number;
    predictedColor: CanonicalSrgbColor;
    selectionReason: SelectionReason;
}

interface Candidate extends AdaptiveMatrixCandidate {
    key: string;
    lab: Lab;
    pairMaskLow: number;
    pairMaskHigh: number;
    historyDistance: number;
    uncertainty: number;
    measured: boolean;
    selected: boolean;
}

export interface AdaptiveMatrixPlanOptions {
    filaments: readonly Filament[];
    backingIndex: number;
    layerCount: number;
    layerHeight: number;
    firstLayerHeight: number;
    foundationLayerThicknesses: readonly number[];
    ownerProfileFingerprint: string;
    maximumSamples: number;
    maximumSwapCycles?: number;
    previousMatrices?: readonly StackMatrixCalibrationV1[];
    predictColor: (stack: readonly number[]) => CanonicalSrgbColor;
}

export interface AdaptiveMatrixPlan {
    candidates: AdaptiveMatrixCandidate[];
    cornerStacks: number[][];
    candidateCount: number;
    compatibleHistoryCount: number;
    measuredRecipeCount: number;
    referenceSampleCount: number;
    unmeasuredSampleCount: number;
    estimatedSwapCycles: number;
}

/**
 * Keep neighboring cells on new boards similar from the bottom layer upward.
 * Compare the full physical stacks, including backing padding, so adjacent
 * recipes can share contiguous printed regions. Comparing one layer at a time
 * also avoids the precision loss of base-N numeric keys for deep recipes.
 * This only reorders the supplied candidates; it does not change acquisition.
 */
export function orderStackMatrixCandidatesForLayout<T extends AdaptiveMatrixCandidate>(
    candidates: readonly T[]
): T[] {
    return [...candidates].sort((left, right) => {
        const sharedDepth = Math.min(left.stack.length, right.stack.length);
        for (let layer = 0; layer < sharedDepth; layer++) {
            const difference = left.stack[layer] - right.stack[layer];
            if (difference !== 0) return difference;
        }
        return left.stack.length - right.stack.length;
    });
}

function squaredDistance(left: Lab, right: Lab): number {
    return (left.L - right.L) ** 2 + (left.a - right.a) ** 2 + (left.b - right.b) ** 2;
}

function sameHeights(left: readonly number[], right: readonly number[]): boolean {
    return (
        left.length === right.length &&
        left.every((height, index) => Math.abs(height - right[index]) < 1e-6)
    );
}

function normalizedRecipe(stack: readonly number[], backingIndex: number): number[] {
    let first = 0;
    while (first < stack.length - 1 && stack[first] === backingIndex) first++;
    return stack.slice(first);
}

function recipeKey(recipe: readonly number[], filaments: readonly Filament[]): string {
    return JSON.stringify(
        recipe.map((index) => [filaments[index].id, filaments[index].color.toLowerCase()])
    );
}

function pairKeys(recipe: readonly number[], backingIndex: number): string[] {
    const pairs = new Set<string>();
    if (recipe.length && recipe[0] !== backingIndex) pairs.add(`${backingIndex}:${recipe[0]}`);
    for (let index = 1; index < recipe.length; index++) {
        if (recipe[index] !== recipe[index - 1]) {
            pairs.add(`${recipe[index - 1]}:${recipe[index]}`);
        }
    }
    return [...pairs];
}

function pairMasks(keys: Iterable<string>): [number, number] {
    let low = 0;
    let high = 0;
    for (const key of keys) {
        const [bottom, top] = key.split(':').map(Number);
        const bit = bottom * 8 + top;
        if (bit < 32) low |= 1 << bit;
        else high |= 1 << (bit - 32);
    }
    return [low, high];
}

function countBits(input: number): number {
    let value = input - ((input >>> 1) & 0x55555555);
    value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
    return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function compatibleHistory(options: AdaptiveMatrixPlanOptions): StackMatrixCalibrationV1[] {
    const currentById = new Map(options.filaments.map((filament) => [filament.id, filament]));
    return (options.previousMatrices ?? [])
        .filter((matrix) => {
            if (
                matrix.status !== 'complete' ||
                matrix.alignmentVerified === false ||
                !(
                    matrix.alignmentVerified === true ||
                    (matrix.alignmentMethod === 'detected' &&
                        (matrix.alignmentConfidence ?? 0) >= 0.55)
                )
            )
                return false;
            const subset = matrix.filaments.map((filament) => currentById.get(filament.id));
            if (
                subset.some(
                    (filament, index) =>
                        filament &&
                        filament.color.toLowerCase() !== matrix.filaments[index].color.toLowerCase()
                )
            )
                return false;
            const profileMatches =
                matrix.process.filamentProfileFingerprint === options.ownerProfileFingerprint ||
                (subset.every((filament) => filament !== undefined) &&
                    matrix.process.filamentProfileFingerprint ===
                        fingerprintAppearanceFilaments(subset as Filament[]));
            return (
                profileMatches &&
                matrix.filaments[matrix.backingFilamentIndex]?.id ===
                    options.filaments[options.backingIndex].id &&
                Math.abs(matrix.process.layerHeight - options.layerHeight) < 1e-6 &&
                Math.abs(matrix.process.firstLayerHeight - options.firstLayerHeight) < 1e-6 &&
                matrix.process.unknownFields.length === 0 &&
                sameHeights(matrix.foundationLayerThicknesses, options.foundationLayerThicknesses)
            );
        })
        .sort(
            (left, right) =>
                (right.completedAt ?? right.createdAt).localeCompare(
                    left.completedAt ?? left.createdAt
                ) || left.id.localeCompare(right.id)
        );
}

/** A slicer-order-independent upper bound, not a purge or duration estimate. */
export function estimateStackMatrixSwapCycles(
    stacks: readonly (readonly number[])[],
    backingIndex: number
): number {
    const layerCount = Math.max(0, ...stacks.map((stack) => stack.length));
    let previous = new Set([backingIndex]);
    let cycles = 0;
    for (let layer = 0; layer < layerCount; layer++) {
        const materials = new Set(stacks.map((stack) => stack[layer] ?? backingIndex));
        if (materials.size > 1) cycles += materials.size;
        else if (previous.size !== 1 || !previous.has([...materials][0])) cycles++;
        previous = materials;
    }
    return cycles;
}

function materialMask(stack: readonly number[]): number[] {
    return stack.map((index) => 1 << index);
}

function maskCycles(masks: readonly number[], backingIndex: number): number {
    let previous = 1 << backingIndex;
    let cycles = 0;
    for (const mask of masks) {
        let count = 0;
        for (let remaining = mask; remaining; remaining &= remaining - 1) count++;
        if (count > 1) cycles += count;
        else if (previous !== mask) cycles++;
        previous = mask;
    }
    return cycles;
}

export function planAdaptiveStackMatrix(options: AdaptiveMatrixPlanOptions): AdaptiveMatrixPlan {
    const { filaments, backingIndex, layerCount, maximumSamples } = options;
    const history = compatibleHistory(options);
    const priorOptics = createPriorEffectiveOpticsModel(filaments);
    const opaqueBackingThickness = minimumOpaqueFoundationThickness(
        priorOptics,
        filaments[backingIndex].id
    );
    const foundationThickness = options.foundationLayerThicknesses.reduce(
        (total, thickness) => total + thickness,
        0
    );
    const physicalRecipeKey = (
        stack: readonly number[],
        recipe: readonly number[],
        foundation: number,
        layerHeight: number
    ) => {
        const key = recipeKey(recipe, filaments);
        let backingLayers = 0;
        while (backingLayers < stack.length && stack[backingLayers] === backingIndex)
            backingLayers++;
        const backingThickness = foundation + backingLayers * layerHeight;
        // Padding can be ignored only after the physical backing is opaque.
        // Otherwise the same useful recipe over a different translucent base
        // remains an unmeasured stack, even when its filament sequence matches.
        return backingThickness + 1e-8 >= opaqueBackingThickness
            ? key
            : JSON.stringify({
                  recipe: key,
                  backingThickness: Number(backingThickness.toFixed(8)),
              });
    };
    const currentIndexById = new Map(filaments.map((filament, index) => [filament.id, index]));
    const measurements = new Map<string, { recipe: number[]; measured: Lab; predicted: Lab }>();
    for (const matrix of history) {
        const measuredFoundationThickness = matrix.foundationLayerThicknesses.reduce(
            (total, thickness) => total + thickness,
            0
        );
        for (const sample of matrix.samples) {
            if (!sample.measuredColor) continue;
            const remapped = sample.stack.map((index) =>
                currentIndexById.get(matrix.filaments[index]?.id)
            );
            // A full-profile board can still teach a smaller next board, but
            // only through patches made entirely from its selected materials.
            if (remapped.some((index) => index === undefined)) continue;
            const recipe = normalizedRecipe(remapped as number[], backingIndex);
            const key = physicalRecipeKey(
                remapped as number[],
                recipe,
                measuredFoundationThickness,
                matrix.process.layerHeight
            );
            if (!measurements.has(key))
                measurements.set(key, {
                    recipe,
                    measured: rgbToLab([...sample.measuredColor.rgb]),
                    predicted: rgbToLab([...sample.predictedColor.rgb]),
                });
        }
    }
    const measuredDepths = new Set([...measurements.values()].map((entry) => entry.recipe.length));
    const measuredPairs = new Set(
        [...measurements.values()].flatMap((entry) => pairKeys(entry.recipe, backingIndex))
    );
    // Bound nearest-colour work even after many large imported matrices. Keep one
    // point per small measured-colour bin before deterministic downsampling.
    const colorBins = new Map<string, { measured: Lab; predicted: Lab }>();
    for (const entry of measurements.values()) {
        const key = [entry.measured.L, entry.measured.a, entry.measured.b]
            .map((value) => Math.round(value / 2))
            .join(':');
        if (!colorBins.has(key)) colorBins.set(key, entry);
    }
    const allCoverage = [...colorBins.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, entry]) => entry);
    const coverage =
        allCoverage.length <= 2_048
            ? allCoverage
            : Array.from(
                  { length: 2_048 },
                  (_, index) => allCoverage[Math.floor((index * allCoverage.length) / 2_048)]
              );

    const poolLimit = Math.max(8_192, Math.min(20_000, maximumSamples * 8));
    const candidates: Candidate[] = [];
    const byKey = new Map<string, Candidate>();
    const addRecipe = (input: readonly number[]): Candidate | undefined => {
        const recipe = normalizedRecipe(input, backingIndex);
        if (recipe.length < 1 || recipe.length > layerCount) return undefined;
        const stack = [...Array<number>(layerCount - recipe.length).fill(backingIndex), ...recipe];
        const key = physicalRecipeKey(stack, recipe, foundationThickness, options.layerHeight);
        const existing = byKey.get(key);
        if (existing) return existing;
        if (candidates.length >= poolLimit) return undefined;
        const predictedColor = options.predictColor(stack);
        const lab = rgbToLab([...predictedColor.rgb]);
        let historyDistance = Infinity;
        let nearestPrediction = Infinity;
        let nearestError = 0;
        for (const entry of coverage) {
            historyDistance = Math.min(historyDistance, squaredDistance(lab, entry.measured));
            const distance = squaredDistance(lab, entry.predicted);
            if (distance < nearestPrediction) {
                nearestPrediction = distance;
                nearestError = Math.sqrt(squaredDistance(entry.predicted, entry.measured));
            }
        }
        const [pairMaskLow, pairMaskHigh] = pairMasks(pairKeys(recipe, backingIndex));
        const candidate: Candidate = {
            stack,
            key,
            lab,
            predictedColor,
            recipeLayerCount: recipe.length,
            backingPaddingLayerCount: layerCount - recipe.length,
            selectionReason: 'coverage',
            pairMaskLow,
            pairMaskHigh,
            historyDistance: Math.sqrt(historyDistance),
            measured: measurements.has(key),
            selected: false,
            // This is an acquisition heuristic, not a calibrated confidence interval.
            uncertainty:
                Math.min(1, nearestError / 25) +
                (coverage.length ? Math.min(1, Math.sqrt(nearestPrediction) / 30) : 1),
        };
        candidates.push(candidate);
        byKey.set(key, candidate);
        return candidate;
    };

    // Full-depth pure references preserve marker contrast and photo correction.
    // Their physical material usage is included in the board's swap budget.
    const referenceDepth = layerCount;
    const markerIndices = [
        backingIndex,
        0,
        Math.floor((filaments.length - 1) / 2),
        filaments.length - 1,
    ];
    const markerCandidates = markerIndices.map(
        (index) => addRecipe(Array<number>(referenceDepth).fill(index))!
    );
    const cornerStacks = markerCandidates.map((candidate) => candidate.stack);

    // Seed every depth before more expensive pair/run exploration.
    for (let depth = 1; depth <= layerCount; depth++) {
        for (let filament = 0; filament < filaments.length; filament++)
            addRecipe(Array<number>(depth).fill(filament));
    }
    const priorCandidates = [...measurements.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
    );
    // Prior evidence must not fill the pool before any unseen recipes are tried.
    for (let index = 0; index < Math.min(128, priorCandidates.length); index++) {
        addRecipe(
            priorCandidates[
                Math.floor((index * priorCandidates.length) / Math.min(128, priorCandidates.length))
            ][1].recipe
        );
    }
    for (let depth = 2; depth <= layerCount; depth++) {
        const splits = new Set([
            1,
            Math.floor(depth / 4),
            Math.floor(depth / 2),
            Math.floor((depth * 3) / 4),
            depth - 1,
        ]);
        for (const split of splits) {
            if (split < 1 || split >= depth) continue;
            for (let bottom = 0; bottom < filaments.length; bottom++) {
                for (let top = 0; top < filaments.length; top++) {
                    if (bottom !== top && candidates.length < poolLimit / 2)
                        addRecipe([
                            ...Array<number>(split).fill(bottom),
                            ...Array<number>(depth - split).fill(top),
                        ]);
                }
            }
        }
    }
    // Recipe-key-seeded 32-bit PRNG avoids unsafe base-N indices for deep
    // recipes and refreshes exploration after new measurements. Sorted physical
    // evidence keys keep draft plans, dates, IDs and history order out of the seed.
    let randomState = 0x6d2b79f5;
    for (const [key] of priorCandidates) {
        for (let index = 0; index < key.length; index++) {
            randomState = Math.imul(randomState ^ key.charCodeAt(index), 0x01000193);
        }
        randomState = Math.imul(randomState, 0x01000193);
    }
    if (randomState === 0) randomState = 0x6d2b79f5;
    const random = () => {
        randomState ^= randomState << 13;
        randomState ^= randomState >>> 17;
        randomState ^= randomState << 5;
        return (randomState >>> 0) / 0x1_0000_0000;
    };
    for (let attempt = 0; attempt < poolLimit * 8 && candidates.length < poolLimit; attempt++) {
        const depth = 1 + (attempt % layerCount);
        const runCount = Math.min(depth, 2 + Math.floor(random() * 4));
        const breaks = new Set<number>();
        while (breaks.size < runCount - 1) breaks.add(1 + Math.floor(random() * (depth - 1)));
        const ends = [...breaks].sort((left, right) => left - right).concat(depth);
        const recipe: number[] = [];
        let previous = -1;
        for (const end of ends) {
            let filament = Math.floor(random() * filaments.length);
            if (filament === previous) filament = (filament + 1) % filaments.length;
            recipe.push(...Array<number>(end - recipe.length).fill(filament));
            previous = filament;
        }
        addRecipe(recipe);
    }

    const selected: Candidate[] = [];
    const selectedKeys = new Set<string>();
    const selectedDepths = new Set<number>();
    let [seenPairMaskLow, seenPairMaskHigh] = pairMasks(measuredPairs);
    const overBudget = new Set<string>();
    let masks = Array<number>(layerCount).fill(1 << backingIndex);
    const distances = new Float64Array(candidates.length);
    distances.fill(Infinity);
    const mergedMasks = (candidate: Candidate) =>
        materialMask(candidate.stack).map((mask, layer) => mask | masks[layer]);
    const fitsBudget = (candidate: Candidate) => {
        if (options.maximumSwapCycles === undefined) return true;
        if (overBudget.has(candidate.key)) return false;
        if (maskCycles(mergedMasks(candidate), backingIndex) <= options.maximumSwapCycles)
            return true;
        // Adding another sample cannot remove material from a layer, so a
        // candidate rejected now cannot become cheaper later in this board.
        overBudget.add(candidate.key);
        return false;
    };
    const select = (candidate: Candidate, reason: SelectionReason) => {
        if (selectedKeys.has(candidate.key) || selected.length >= maximumSamples) return;
        candidate.selectionReason = reason;
        selected.push(candidate);
        candidate.selected = true;
        selectedKeys.add(candidate.key);
        selectedDepths.add(candidate.recipeLayerCount);
        seenPairMaskLow |= candidate.pairMaskLow;
        seenPairMaskHigh |= candidate.pairMaskHigh;
        masks = mergedMasks(candidate);
        for (let index = 0; index < candidates.length; index++) {
            distances[index] = Math.min(
                distances[index],
                squaredDistance(candidates[index].lab, candidate.lab)
            );
        }
    };
    for (const candidate of markerCandidates) select(candidate, 'reference');
    const minimumBudget = maskCycles(masks, backingIndex);
    if (options.maximumSwapCycles !== undefined && minimumBudget > options.maximumSwapCycles) {
        throw new Error(
            `The reference patches need a budget of at least ${minimumBudget} planned material changes. Increase the budget, reduce the thickness cap, or select fewer filaments.`
        );
    }

    const repeatLimit = Math.min(4, Math.max(1, Math.floor(maximumSamples * 0.08)));
    let repeats = selected.filter((candidate) => measurements.has(candidate.key)).length;
    for (const [key] of priorCandidates) {
        if (repeats >= repeatLimit) break;
        const candidate = byKey.get(key);
        if (!candidate || selectedKeys.has(key) || !fitsBudget(candidate)) continue;
        select(candidate, 'reference');
        repeats++;
    }
    while (selected.length < maximumSamples) {
        const explore = selected.length % 5 === 4;
        let best: Candidate | undefined;
        let bestScore = -Infinity;
        for (let index = 0; index < candidates.length; index++) {
            const candidate = candidates[index];
            if (candidate.selected || candidate.measured) continue;
            const newDepth =
                !measuredDepths.has(candidate.recipeLayerCount) &&
                !selectedDepths.has(candidate.recipeLayerCount)
                    ? 1
                    : 0;
            const newPairs =
                countBits(candidate.pairMaskLow & ~seenPairMaskLow) +
                countBits(candidate.pairMaskHigh & ~seenPairMaskHigh);
            const novelty = newDepth * 10 + Math.min(2, newPairs) * 5 + candidate.uncertainty * 5;
            const coverageScore =
                Math.min(40, candidate.historyDistance) + Math.min(30, Math.sqrt(distances[index]));
            const score =
                (explore ? novelty * 3 + coverageScore * 0.3 : coverageScore + novelty) -
                (candidate.recipeLayerCount / layerCount) * 0.1;
            if (score <= bestScore + 1e-9 || !fitsBudget(candidate)) continue;
            best = candidate;
            bestScore = score;
        }
        if (!best) break;
        select(best, explore ? 'exploration' : 'coverage');
    }
    return {
        candidates: orderStackMatrixCandidatesForLayout(selected).map(
            ({
                stack,
                recipeLayerCount,
                backingPaddingLayerCount,
                predictedColor,
                selectionReason,
            }) => ({
                stack,
                recipeLayerCount,
                backingPaddingLayerCount,
                predictedColor,
                selectionReason,
            })
        ),
        cornerStacks,
        candidateCount: candidates.length,
        compatibleHistoryCount: history.length,
        measuredRecipeCount: measurements.size,
        referenceSampleCount: selected.filter(
            (candidate) => candidate.selectionReason === 'reference'
        ).length,
        unmeasuredSampleCount: selected.filter((candidate) => !candidate.measured).length,
        estimatedSwapCycles: maskCycles(masks, backingIndex),
    };
}
