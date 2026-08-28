import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';

import { readPngFixture } from '../imageFixtures.ts';
import { rgbToHsl } from '../../src/lib/color.ts';

interface CalibratedOptimizerCase {
    profile: string;
    sourceImage: string;
    settings: {
        layerHeight: number;
        firstLayerHeight: number;
        maxHeight: number | null;
        maxHeightMode: 'manual' | 'auto-resolved';
        maximumExtraFilamentAppearances: number;
        preserveColorSeparation: boolean;
        maximumColorErrorDeltaE: number;
        failIfAnyColorIsMissed: boolean;
        optimizerAlgorithm: 'fast' | 'balanced' | 'thorough' | 'deep' | 'exact';
        transitionOpacity: number;
    };
    observedResult: {
        processedOpaqueColorCount: number;
        optimizerIterations: number;
        optimizerScore: number | null;
        optimizerConverged: boolean;
        colorsWithinThreshold: number;
        fallbackColorCount: number;
        worstDeltaE: number;
        additionalFilamentRunsUsed: number;
        transitionZoneCount: number;
        physicalLayerCount: number;
        totalHeight: number;
        finalStackFingerprint: string | null;
        filamentOrderColors: string[];
    };
    /**
     * Deterministic production-code replay when the supplied artifacts cannot
     * be reconstructed exactly from their exported inputs alone. The captured
     * UI/3MF result remains in observedResult as the physical reference truth.
     */
    replayResult?: CalibratedOptimizerCase['observedResult'];
}

type CalibratedOptimizerSettings = CalibratedOptimizerCase['settings'];

interface StableOptimizerResult {
    score: number;
    iterations: number;
    converged: boolean;
    extraRepeatCount: number;
    orderColors: string[];
    transitionZones: number;
    physicalLayers: number;
    totalHeight: number;
    finalStackFingerprint: string;
    separation?: {
        requestedColorCount: number;
        printableColorCount: number;
        assignedDistinctColorCount: number;
        unacceptableColorCount: number;
        maximumDeltaE: number;
        maximumAllowedDeltaE: number;
        satisfied: boolean;
    };
}

interface CalibratedOptimizerVariantGoldens {
    schemaVersion: 1;
    results: Record<string, Record<string, StableOptimizerResult>>;
}

const VARIANT_OVERRIDES: Record<string, Partial<CalibratedOptimizerSettings>> = {
    baseline: {},
    'separation-off': { preserveColorSeparation: false },
    'repeats-0': { maximumExtraFilamentAppearances: 0 },
    thorough: { optimizerAlgorithm: 'thorough' },
    'height-4': { maxHeight: 4, maxHeightMode: 'manual' },
    'height-8': { maxHeight: 8, maxHeightMode: 'manual' },
    'delta-e-6': { maximumColorErrorDeltaE: 6 },
    'delta-e-40': { maximumColorErrorDeltaE: 40 },
};

type LoadedModules = {
    autoPaint: typeof import('../../src/lib/autoPaint.ts');
    appearanceModel: typeof import('../../src/lib/appearanceModel.ts');
    appearanceProfile: typeof import('../../src/lib/appearanceProfile.ts');
    profileManager: typeof import('../../src/lib/profileManager.ts');
};

async function loadModules(): Promise<LoadedModules> {
    const server = await createServer({
        appType: 'custom',
        cacheDir: 'dist/.vite-test-cache',
        configFile: false,
        logLevel: 'error',
        optimizeDeps: { noDiscovery: true },
        resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
        root: process.cwd(),
        server: { hmr: false, middlewareMode: true },
    });
    try {
        const [autoPaint, appearanceModel, appearanceProfile, profileManager] = await Promise.all([
            server.ssrLoadModule('/src/lib/autoPaint.ts'),
            server.ssrLoadModule('/src/lib/appearanceModel.ts'),
            server.ssrLoadModule('/src/lib/appearanceProfile.ts'),
            server.ssrLoadModule('/src/lib/profileManager.ts'),
        ]);
        return {
            autoPaint: autoPaint as LoadedModules['autoPaint'],
            appearanceModel: appearanceModel as LoadedModules['appearanceModel'],
            appearanceProfile: appearanceProfile as LoadedModules['appearanceProfile'],
            profileManager: profileManager as LoadedModules['profileManager'],
        };
    } finally {
        await server.close();
    }
}

function imageSwatches(path: string): Array<{ hex: string; count: number }> {
    const image = readPngFixture(path);
    const counts = new Map<number, number>();
    for (let index = 0; index < image.rgba.length; index += 4) {
        if (image.rgba[index + 3] === 0) continue;
        const key =
            (image.rgba[index] << 16) | (image.rgba[index + 1] << 8) | image.rgba[index + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const swatches = Array.from(counts, ([rgb, count]) => {
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = rgb & 0xff;
        return {
            hex: `#${rgb.toString(16).padStart(6, '0')}`,
            count,
            hsl: rgbToHsl(r, g, b),
        };
    });
    swatches.sort((left, right) => {
        if (left.hsl.h !== right.hsl.h) return left.hsl.h - right.hsl.h;
        if (left.hsl.s !== right.hsl.s) return right.hsl.s - left.hsl.s;
        return right.hsl.l - left.hsl.l;
    });
    // Match useSwatches exactly: colors are presented darkest-to-lightest by
    // reversing the shared HSL ordering before they enter auto-paint.
    return swatches.reverse().map(({ hex, count }) => ({ hex, count }));
}

const caseName = process.argv[2] ?? 'k-logo';
if (!/^[a-z0-9-]+$/.test(caseName)) {
    throw new Error(`Invalid calibrated optimizer case name: ${caseName}`);
}
const variantName = process.argv[3] ?? 'baseline';
if (!/^[a-z0-9-]+$/.test(variantName) || !(variantName in VARIANT_OVERRIDES)) {
    throw new Error(`Invalid calibrated optimizer variant name: ${variantName}`);
}
const fixtureRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../assets/performance/8-colors-frontlit-2026-08-26'
);
const fixtureDirectory = resolve(fixtureRoot, caseName);
const fixture = JSON.parse(
    readFileSync(resolve(fixtureDirectory, 'case.json'), 'utf8')
) as CalibratedOptimizerCase;
const variantGoldens = JSON.parse(
    readFileSync(resolve(fixtureRoot, 'optimizer-variant-goldens.json'), 'utf8')
) as CalibratedOptimizerVariantGoldens;
assert.equal(variantGoldens.schemaVersion, 1, 'Unsupported calibrated optimizer golden schema');
const expectedVariantResult =
    variantName === 'baseline' ? undefined : variantGoldens.results[caseName]?.[variantName];
if (variantName !== 'baseline' && !expectedVariantResult) {
    throw new Error(
        `Unsupported calibrated optimizer variant ${caseName}/${variantName}: add an explicit known-good result to optimizer-variant-goldens.json before benchmarking it`
    );
}
const settings: CalibratedOptimizerSettings = {
    ...fixture.settings,
    ...VARIANT_OVERRIDES[variantName],
};
const modules = await loadModules();
const parsedProfiles = modules.profileManager.parseProfileFile(
    readFileSync(resolve(fixtureDirectory, fixture.profile), 'utf8')
);
assert.ok(parsedProfiles, 'Calibrated optimizer profile fixture must parse');
const profile = modules.profileManager.importProfiles([], parsedProfiles).imported[0];
assert.ok(profile, 'Calibrated optimizer profile fixture must import');

const swatches = imageSwatches(resolve(fixtureDirectory, fixture.sourceImage));
assert.equal(swatches.length, fixture.observedResult.processedOpaqueColorCount);

globalThis.gc?.();
const heapBefore = process.memoryUsage().heapUsed;
const fitStartedAt = performance.now();
const appearanceModel = modules.appearanceModel.fitAppearanceRankModel(profile.appearance, {
    filamentProfileFingerprint: modules.appearanceProfile.fingerprintAppearanceFilaments(
        profile.filaments
    ),
    layerHeight: settings.layerHeight,
    firstLayerHeight: Math.max(settings.layerHeight, settings.firstLayerHeight),
    transitionOpacity: settings.transitionOpacity,
    filaments: profile.filaments,
});
const appearanceFitMs = performance.now() - fitStartedAt;

const optimizationStartedAt = performance.now();
const result = modules.autoPaint.generateAutoLayers(
    profile.filaments,
    swatches,
    settings.layerHeight,
    settings.firstLayerHeight,
    settings.maxHeight ?? undefined,
    true,
    settings.maximumExtraFilamentAppearances > 0,
    {
        algorithm: settings.optimizerAlgorithm,
        cachingEnabled: false,
        maxExtraRepeats: settings.maximumExtraFilamentAppearances,
        preserveSeparation: settings.preserveColorSeparation,
        separationMaxDeltaE: settings.maximumColorErrorDeltaE,
        failOnSeparationError: settings.failIfAnyColorIsMissed,
        transitionOpacity: settings.transitionOpacity,
    },
    appearanceModel
);
const optimizationMs = performance.now() - optimizationStartedAt;
const heapAfter = process.memoryUsage().heapUsed;
globalThis.gc?.();
const memoryAfterGc = process.memoryUsage();

const colorByFilamentId = new Map(
    profile.filaments.map((filament) => [filament.id, filament.color.toLowerCase()])
);
const orderColors = result.filamentOrder.map((id) => colorByFilamentId.get(id));
const separation = result.colorSeparation;
const expectedResult = fixture.replayResult ?? fixture.observedResult;

try {
    assert.ok(Number.isFinite(result.optimizerMetadata?.score));
    assert.ok((result.optimizerMetadata?.iterations ?? 0) > 0);
    assert.ok(orderColors.every((color): color is string => Boolean(color)));
    assert.ok(result.transitionZones.length > 0);
    assert.ok(result.finalStack.layers.length > 0);
    assert.ok(result.finalStack.fingerprint.length > 0);
    if (settings.preserveColorSeparation) {
        assert.ok(separation, 'Expected a preserve-separation report');
    }
    if (variantName === 'baseline') {
        assert.equal(result.optimizerMetadata?.iterations, expectedResult.optimizerIterations);
        if (expectedResult.optimizerScore !== null) {
            assert.ok(
                Math.abs(
                    (result.optimizerMetadata?.score ?? Infinity) - expectedResult.optimizerScore
                ) < 1e-6
            );
        }
        assert.equal(result.optimizerMetadata?.converged, expectedResult.optimizerConverged);
        assert.equal(
            result.optimizerMetadata?.extraRepeatCount,
            expectedResult.additionalFilamentRunsUsed
        );
        assert.deepEqual(orderColors, expectedResult.filamentOrderColors);
        assert.equal(result.transitionZones.length, expectedResult.transitionZoneCount);
        assert.equal(result.finalStack.layers.length, expectedResult.physicalLayerCount);
        assert.equal(result.totalHeight, expectedResult.totalHeight);
        if (expectedResult.finalStackFingerprint !== null) {
            assert.equal(result.finalStack.fingerprint, expectedResult.finalStackFingerprint);
        }
        assert.ok(separation, 'Expected a preserve-separation report');
        assert.equal(
            separation.requestedColorCount - separation.unacceptableColorCount,
            expectedResult.colorsWithinThreshold
        );
        assert.equal(separation.unacceptableColorCount, expectedResult.fallbackColorCount);
        assert.equal(Number(separation.maximumDeltaE.toFixed(1)), expectedResult.worstDeltaE);
    } else {
        assertStableResult(
            {
                score: result.optimizerMetadata?.score ?? NaN,
                iterations: result.optimizerMetadata?.iterations ?? 0,
                converged: result.optimizerMetadata?.converged ?? false,
                extraRepeatCount: result.optimizerMetadata?.extraRepeatCount ?? 0,
                orderColors,
                transitionZones: result.transitionZones.length,
                physicalLayers: result.finalStack.layers.length,
                totalHeight: result.totalHeight,
                finalStackFingerprint: result.finalStack.fingerprint,
                separation,
            },
            expectedVariantResult
        );
    }
} catch (error) {
    console.error(
        JSON.stringify(
            {
                iterations: result.optimizerMetadata?.iterations,
                score: result.optimizerMetadata?.score,
                orderColors,
                transitionZones: result.transitionZones.length,
                physicalLayers: result.finalStack.layers.length,
                totalHeight: result.totalHeight,
                finalStackFingerprint: result.finalStack.fingerprint,
                separation,
            },
            null,
            2
        )
    );
    throw error;
}

console.log(
    JSON.stringify(
        {
            fixture: `8-colors-frontlit-2026-08-26/${caseName}`,
            variant: variantName,
            configuration: settings,
            evidence: {
                proofRecords: profile.appearance?.proofs.length ?? 0,
                targetJudgments: profile.appearance?.targetJudgments.length ?? 0,
                stackMatrices: profile.appearance?.stackMatrices?.length ?? 0,
                fittedExactAnchors: appearanceModel.exactAnchors.length,
                fittedLocalNeighborhoods: appearanceModel.localEvidence.length,
                fittedMatrixRecipes: appearanceModel.empiricalLuts.reduce(
                    (sum, lut) => sum + lut.samples.length,
                    0
                ),
            },
            timing: { appearanceFitMs, optimizationMs, totalMs: appearanceFitMs + optimizationMs },
            memory: {
                heapBeforeBytes: heapBefore,
                heapAfterBytes: heapAfter,
                retainedHeapDeltaBytes: heapAfter - heapBefore,
                heapAfterGcBytes: memoryAfterGc.heapUsed,
                retainedHeapAfterGcBytes: memoryAfterGc.heapUsed - heapBefore,
                residentSetAfterGcBytes: memoryAfterGc.rss,
                maximumResidentSetBytes: process.resourceUsage().maxRSS * 1024,
            },
            result: {
                score: result.optimizerMetadata?.score,
                iterations: result.optimizerMetadata?.iterations,
                converged: result.optimizerMetadata?.converged,
                extraRepeatCount: result.optimizerMetadata?.extraRepeatCount,
                orderColors,
                transitionZones: result.transitionZones.length,
                physicalLayers: result.finalStack.layers.length,
                totalHeight: result.totalHeight,
                finalStackFingerprint: result.finalStack.fingerprint,
                separation,
            },
        },
        null,
        2
    )
);

function assertStableResult(
    actual: StableOptimizerResult,
    expected: StableOptimizerResult | undefined
): void {
    assert.ok(expected, 'Expected an explicit calibrated optimizer variant golden');
    assert.ok(Math.abs(actual.score - expected.score) < 1e-6, 'Optimizer score changed');
    assert.ok(Math.abs(actual.totalHeight - expected.totalHeight) < 1e-9, 'Total height changed');
    if (actual.separation && expected.separation) {
        assert.ok(
            Math.abs(actual.separation.maximumDeltaE - expected.separation.maximumDeltaE) < 1e-9,
            'Maximum separation Delta-E changed'
        );
    }
    const actualExact: Partial<StableOptimizerResult> = { ...actual };
    const expectedExact: Partial<StableOptimizerResult> = { ...expected };
    delete actualExact.score;
    delete actualExact.totalHeight;
    delete expectedExact.score;
    delete expectedExact.totalHeight;
    if (actual.separation) {
        actualExact.separation = {
            ...actual.separation,
            maximumDeltaE: expected.separation?.maximumDeltaE ?? Number.NaN,
        };
    } else {
        delete actualExact.separation;
    }
    if (!expected.separation) delete expectedExact.separation;
    assert.deepEqual(actualExact, expectedExact);
}
