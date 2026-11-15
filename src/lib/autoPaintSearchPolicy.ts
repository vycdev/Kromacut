/**
 * Measured with tests/benchmark/highTargetSearch.ts (seed 12345).
 * See tests/benchmark/high-target-search.md for the threshold evidence.
 */
export const HIGH_AUTO_PAINT_TARGET_COUNT = 1024;

export function needsAutoPaintSearchGuidance(
    targetCount: number,
    enhancedColorMatch: boolean
): boolean {
    return enhancedColorMatch && targetCount >= HIGH_AUTO_PAINT_TARGET_COUNT;
}
