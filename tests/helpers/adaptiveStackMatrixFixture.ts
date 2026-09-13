import type { StackMatrixCalibrationV1 } from '../../src/lib/appearanceProfile.ts';
import type { CanonicalSrgbColor } from '../../src/types/appearance.ts';

export const adaptiveMatrixFilaments = [
    { id: 'backing', name: 'Black', color: '#101010', td: 0.1 },
    { id: 'red', name: 'Red', color: '#e03040', td: 0.4 },
    { id: 'white', name: 'White', color: '#eeeeee', td: 0.8 },
];

function color(rgb: [number, number, number]): CanonicalSrgbColor {
    return {
        space: 'srgb',
        encoding: 'uint8',
        whitePoint: 'D65',
        rgb,
        hex: `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
    };
}

export function adaptiveStackMatrixFixture(
    filamentProfileFingerprint = 'adaptive-fixture-profile'
): StackMatrixCalibrationV1 {
    const depth = 20;
    const recipes = [[1, 1], Array.from({ length: depth }, (_, index) => (index % 2) + 1), [2]];
    return {
        schemaVersion: 2,
        id: 'adaptive-fixture',
        status: 'complete',
        process: {
            filamentProfileFingerprint,
            layerHeight: 0.04,
            firstLayerHeight: 0.1,
            unknownFields: [],
        },
        filaments: adaptiveMatrixFilaments.map(({ id, name, color }) => ({ id, color, name })),
        backingFilamentIndex: 0,
        foundationLayerThicknesses: [0.1, ...Array.from({ length: 14 }, () => 0.04)],
        stackLayerCount: depth,
        grid: { rows: 1, columns: 3, patchSize: 5, gap: 0 },
        totalCombinationCount: (3 ** (depth + 1) - 3) / 2,
        selection: 'adaptive-gamut',
        planning: {
            maximumRecipeThickness: 0.8,
            candidateCount: 12,
            compatibleHistoryCount: 1,
            measuredRecipeCount: 3,
            referenceSampleCount: 1,
            maximumSwapCycles: 100,
            estimatedSwapCycles: 40,
        },
        samples: recipes.map((recipe, index) => ({
            index,
            row: 0,
            column: index,
            stack: [...Array.from({ length: depth - recipe.length }, () => 0), ...recipe],
            recipeLayerCount: recipe.length,
            backingPaddingLayerCount: depth - recipe.length,
            selectionReason: (['coverage', 'exploration', 'reference'] as const)[index],
            canonicalStackKey: `adaptive-stack-${index}`,
            predictedColor: color([60 + index * 10, 50, 40]),
            measuredColor: color([100 + index * 10, 70, 60]),
        })),
        cornerStacks: [1, 2, 1, 2].map((filament) => Array.from({ length: depth }, () => filament)),
        createdAt: '2026-09-12T10:00:00.000Z',
        completedAt: '2026-09-12T11:00:00.000Z',
        alignmentMethod: 'manual',
        alignmentVerified: true,
    };
}
