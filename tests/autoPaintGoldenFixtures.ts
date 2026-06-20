import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    colorSwatchesFromJpegBlocks,
    logoFixturePath,
    largeIssueFixturePath,
    readPngFixture,
    testAssetsRoot,
    type PngImage,
} from './imageFixtures.ts';

export interface AutoPaintGoldenScenario {
    name: string;
    filaments: Array<{ id: string; color: string; td: number }>;
    imageSwatches: Array<{ hex: string; count: number }>;
    imageDimensions: { width: number; height: number };
    enhancedColorMatch: boolean;
    allowRepeatedSwaps: boolean;
    seed: number;
}

interface FilamentProfileFixture {
    name: string;
    filaments: Array<{ id: string; color: string; td: number }>;
}

const PROFILE_FILES = [
    ['2_Colors.kapp', 2],
    ['4_Colors.kapp', 4],
    ['8_Colors.kapp', 8],
] as const;
const SWATCH_CAP = 2 ** 14;

function readProfile(fileName: string, expectedFilamentCount: number): FilamentProfileFixture {
    const profilePath = resolve(testAssetsRoot, 'filament-profiles', fileName);
    const parsed = JSON.parse(readFileSync(profilePath, 'utf8')) as Partial<FilamentProfileFixture>;

    if (!parsed.name || !parsed.filaments || parsed.filaments.length !== expectedFilamentCount) {
        throw new Error(`Unexpected auto-paint profile fixture: ${fileName}`);
    }

    return {
        name: parsed.name,
        filaments: parsed.filaments.map((filament) => ({
            id: filament.id,
            color: filament.color,
            td: filament.td,
        })),
    };
}

function rgbToHex(r: number, g: number, b: number) {
    return `#${[r, g, b]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')}`;
}

function pngSwatches(image: PngImage): Array<{ hex: string; count: number }> {
    const counts = new Map<string, number>();

    for (let index = 0; index < image.rgba.length; index += 4) {
        if (image.rgba[index + 3] === 0) continue;

        const hex = rgbToHex(image.rgba[index], image.rgba[index + 1], image.rgba[index + 2]);
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }

    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, SWATCH_CAP)
        .map(([hex, count]) => ({ hex, count }));
}

function scenarioSeed(profileIndex: number, fixtureIndex: number, enhanced: boolean, repeats: boolean) {
    return (
        0x4b524f4d +
        profileIndex * 1009 +
        fixtureIndex * 101 +
        (enhanced ? 17 : 0) +
        (repeats ? 3 : 0)
    );
}

export function autoPaintGoldenScenarios(): AutoPaintGoldenScenario[] {
    const png = readPngFixture(logoFixturePath);
    const fixtures = [
        {
            name: 'logo-png',
            imageSwatches: pngSwatches(png),
            imageDimensions: { width: png.width, height: png.height },
        },
        {
            name: 'large-jpeg',
            imageSwatches: colorSwatchesFromJpegBlocks(largeIssueFixturePath),
            imageDimensions: { width: 3888, height: 2916 },
        },
    ];

    return PROFILE_FILES.flatMap(([fileName, filamentCount], profileIndex) => {
        const profile = readProfile(fileName, filamentCount);

        return fixtures.flatMap((fixture, fixtureIndex) =>
            [false, true].flatMap((enhancedColorMatch) =>
                [false, true].map((allowRepeatedSwaps) => ({
                    name: `${profile.name} / ${fixture.name} / enhanced=${enhancedColorMatch} / repeats=${allowRepeatedSwaps}`,
                    filaments: profile.filaments,
                    imageSwatches: fixture.imageSwatches,
                    imageDimensions: fixture.imageDimensions,
                    enhancedColorMatch,
                    allowRepeatedSwaps,
                    seed: scenarioSeed(
                        profileIndex,
                        fixtureIndex,
                        enhancedColorMatch,
                        allowRepeatedSwaps
                    ),
                }))
            )
        );
    });
}
