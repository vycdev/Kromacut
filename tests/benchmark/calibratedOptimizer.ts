import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
    benchmarkSourceRoot,
    captureOptimizerProvenance,
    measurementSummary,
    persistOptimizerEvidence,
    sha256,
} from '../helpers/optimizerEvidence.ts';

import { imageSwatches } from '../helpers/calibratedSwatches.ts';
import { withViteTestServer } from '../helpers/viteModule.ts';

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
        seed: number | null;
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
     * be reconstructed exactly from their exported inputs alone, or when an
     * intentional behavior correction changes current output. The captured
     * UI/3MF result remains in observedResult as immutable captured artifact data.
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

function stableSeparationSnapshot(
    report: StableOptimizerResult['separation'] | undefined
): StableOptimizerResult['separation'] | undefined {
    if (!report) return undefined;
    return {
        requestedColorCount: report.requestedColorCount,
        printableColorCount: report.printableColorCount,
        assignedDistinctColorCount: report.assignedDistinctColorCount,
        unacceptableColorCount: report.unacceptableColorCount,
        maximumDeltaE: report.maximumDeltaE,
        maximumAllowedDeltaE: report.maximumAllowedDeltaE,
        satisfied: report.satisfied,
    };
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
    const prefix = '/' + relative(process.cwd(), sourceRoot).replaceAll('\\', '/');
    const modulePath = (path: string) => (sourceRoot === process.cwd() ? path : prefix + path);
    return withViteTestServer(async (server) => {
        const [autoPaint, appearanceModel, appearanceProfile, profileManager] = await Promise.all([
            server.ssrLoadModule(modulePath('/src/lib/autoPaint.ts')),
            server.ssrLoadModule(modulePath('/src/lib/appearanceModel.ts')),
            server.ssrLoadModule(modulePath('/src/lib/appearanceProfile.ts')),
            server.ssrLoadModule(modulePath('/src/lib/profileManager.ts')),
        ]);
        return {
            autoPaint: autoPaint as LoadedModules['autoPaint'],
            appearanceModel: appearanceModel as LoadedModules['appearanceModel'],
            appearanceProfile: appearanceProfile as LoadedModules['appearanceProfile'],
            profileManager: profileManager as LoadedModules['profileManager'],
        };
    });
}

function parseRunOptions(args: string[]): {
    reportOnly: boolean;
    seedOverride?: number;
    output?: string;
    sourceRef?: string;
    warmups: number;
    runs: number;
} {
    let reportOnly = false;
    let seedOverride: number | undefined;
    let warmups = 0;
    let runs = 1;
    let output: string | undefined;
    let sourceRef: string | undefined;
    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (argument === '--warmups' || argument === '--runs') {
            const count = Number(args[++index]);
            if (!Number.isInteger(count) || count < (argument === '--runs' ? 1 : 0) || count > 20)
                throw new Error(`Invalid ${argument} count`);
            if (argument === '--warmups') warmups = count;
            else runs = count;
            continue;
        }
        if (argument === '--source-ref') {
            sourceRef = args[++index];
            if (!sourceRef || sourceRef.startsWith('--'))
                throw new Error('--source-ref requires a Git ref');
            continue;
        }
        if (argument === '--output') {
            output = args[++index];
            if (!output || output.startsWith('--')) throw new Error('--output requires a path');
            continue;
        }
        if (argument === '--report-only') {
            reportOnly = true;
            continue;
        }
        if (argument === '--seed') {
            const rawSeed = args[++index];
            if (rawSeed === undefined) throw new Error('--seed requires an unsigned integer');
            const parsedSeed = Number(rawSeed);
            if (!Number.isInteger(parsedSeed) || parsedSeed < 0 || parsedSeed > 0xffffffff) {
                throw new Error(`Invalid calibrated optimizer seed: ${rawSeed}`);
            }
            seedOverride = parsedSeed;
            continue;
        }
        throw new Error(`Unknown calibrated optimizer option: ${argument}`);
    }
    return { reportOnly, seedOverride, output, sourceRef, warmups, runs };
}

function realizedQuality(
    autoPaint: LoadedModules['autoPaint'],
    result: ReturnType<LoadedModules['autoPaint']['generateAutoLayers']>,
    swatches: Array<{ hex: string; count: number }>,
    layerHeight: number,
    firstLayerHeight: number
): { weightedMean: number; p95: number; coverageAt6: number } {
    const slices = autoPaint.autoPaintToSliceHeights(result, layerHeight, firstLayerHeight);
    let totalHeight = 0;
    const heights = slices.colorOrder.map((colorIndex, position) => {
        totalHeight +=
            position === 0
                ? Math.max(slices.colorSliceHeights[colorIndex], firstLayerHeight)
                : slices.colorSliceHeights[colorIndex];
        return totalHeight;
    });
    const palette = slices.virtualSwatches.map((swatch, index) => {
        const rgb = autoPaint.hexToRgb(swatch.hex);
        return { height: heights[index], lab: autoPaint.rgbToLab(rgb), rgb };
    });
    const targets = swatches.map((swatch) => {
        const lab = autoPaint.rgbToLab(autoPaint.hexToRgb(swatch.hex));
        return { L: lab.L, a: lab.a, b: lab.b, weight: swatch.count };
    });
    const samples = autoPaint.mapTargetsToPrintablePalette(palette, targets).map((entry) => ({
        value: autoPaint.deltaE2000Lab(entry.mappedLab, entry.target),
        weight: entry.target.weight,
    }));
    const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
    const weightedMean =
        samples.reduce((sum, sample) => sum + sample.value * sample.weight, 0) / totalWeight;
    const p95 = autoPaint.weightedErrorPercentile(samples, 0.95);
    const coverageAt6 =
        samples
            .filter((sample) => sample.value <= 6)
            .reduce((sum, sample) => sum + sample.weight, 0) / totalWeight;
    return { weightedMean, p95, coverageAt6 };
}

const caseName = process.argv[2] ?? 'k-logo';
if (!/^[a-z0-9-]+$/.test(caseName)) {
    throw new Error(`Invalid calibrated optimizer case name: ${caseName}`);
}
const variantName = process.argv[3] ?? 'baseline';
if (!/^[a-z0-9-]+$/.test(variantName) || !(variantName in VARIANT_OVERRIDES)) {
    throw new Error(`Invalid calibrated optimizer variant name: ${variantName}`);
}
const { reportOnly, seedOverride, output, sourceRef, warmups, runs } = parseRunOptions(
    process.argv.slice(4)
);
const sourceRoot = benchmarkSourceRoot(sourceRef);
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
if (!reportOnly && variantName !== 'baseline' && !expectedVariantResult) {
    throw new Error(
        `Unsupported calibrated optimizer variant ${caseName}/${variantName}: add an explicit known-good result to optimizer-variant-goldens.json before benchmarking it`
    );
}
const settings: CalibratedOptimizerSettings = {
    ...fixture.settings,
    ...VARIANT_OVERRIDES[variantName],
    ...(seedOverride === undefined ? {} : { seed: seedOverride }),
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

const outputBase =
    output ??
    `.profiles/calibrated/${new Date().toISOString().replaceAll(':', '-')}-${caseName}-${variantName}.json`;
// Reject known collisions before doing an expensive fit/search; the exclusive
// write still protects against another process creating the path afterwards.
const outputPaths =
    warmups + runs === 1
        ? [outputBase]
        : [
              ...Array.from({ length: warmups }, (_, i) => `${outputBase}.warmup-${i + 1}.json`),
              ...Array.from({ length: runs }, (_, i) => `${outputBase}.measured-${i + 1}.json`),
          ];
for (const path of outputPaths) {
    if (existsSync(path))
        throw new Error(
            `Optimizer evidence already exists: ${path}. Choose a new --output prefix.`
        );
}
const provenance = captureOptimizerProvenance({
    fixture: resolve(fixtureDirectory, 'case.json'),
    profile: resolve(fixtureDirectory, fixture.profile),
    sourceImage: resolve(fixtureDirectory, fixture.sourceImage),
    sourceRef,
});
function runOnce(phase: string, sample: number) {
    const optimizerDiagnostics: import('../../src/lib/optimizer.ts').OptimizerDiagnosticEvent[] =
        [];
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
            seed: settings.seed ?? undefined,
            onDiagnostic: (event) => {
                optimizerDiagnostics.push(event);
                if (event.type === 'repeat-tier' && process.stderr.isTTY)
                    process.stderr.write(
                        `${phase} ${sample}: repeat limit ${event.repeatLimit}, ${event.iterations} iterations\n`
                    );
            },
        },
        appearanceModel
    );
    const optimizationMs = performance.now() - optimizationStartedAt;
    const heapAfter = process.memoryUsage().heapUsed;
    // Save the entire expensive result before quality calculations or golden assertions.
    const evidencePath = persistOptimizerEvidence({
        output: warmups + runs === 1 ? outputBase : `${outputBase}.${phase}-${sample}.json`,
        provenance,
        configuration: settings,
        variant: variantName,
        sourceRef,
        phase,
        sample,
        optimizerDiagnostics,
        filaments: profile.filaments,
        swatches,
        result,
        timing: { appearanceFitMs, optimizationMs },
    });
    if (process.stderr.isTTY)
        process.stderr.write(`Full optimizer evidence saved: ${evidencePath}\n`);
    globalThis.gc?.();
    const memoryAfterGc = process.memoryUsage();

    return {
        result,
        appearanceModel,
        appearanceFitMs,
        optimizationMs,
        heapBefore,
        heapAfter,
        memoryAfterGc,
        evidencePath,
    };
}
const samples: {
    phase: string;
    sample: number;
    appearanceFitMs: number;
    optimizationMs: number;
    resultSha256: string;
    evidencePath: string;
}[] = [];
let latest: ReturnType<typeof runOnce> | undefined;
let expectedHash: string | undefined;
for (let i = 0; i < warmups + runs; i++) {
    const phase = i < warmups ? 'warmup' : 'measured';
    const sample = i < warmups ? i + 1 : i - warmups + 1;
    latest = runOnce(phase, sample);
    const resultSha256 = sha256(JSON.stringify(latest.result));
    samples.push({
        phase,
        sample,
        appearanceFitMs: latest.appearanceFitMs,
        optimizationMs: latest.optimizationMs,
        resultSha256,
        evidencePath: latest.evidencePath,
    });
    // Each complete run is already durable, including a run that disagrees.
    expectedHash ??= resultSha256;
    assert.equal(resultSha256, expectedHash, 'Repeated optimizer result changed');
}
assert.ok(latest);
const {
    result,
    appearanceModel,
    appearanceFitMs,
    optimizationMs,
    heapBefore,
    heapAfter,
    memoryAfterGc,
    evidencePath,
} = latest;

const colorByFilamentId = new Map(
    profile.filaments.map((filament) => [filament.id, filament.color.toLowerCase()])
);
const orderColors = result.filamentOrder.map((id) => colorByFilamentId.get(id));
const separation = result.colorSeparation;
const realizedError = realizedQuality(
    modules.autoPaint,
    result,
    swatches,
    settings.layerHeight,
    Math.max(settings.layerHeight, settings.firstLayerHeight)
);
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
    if (reportOnly) {
        // Controlled A/B runs deliberately bypass revision-specific goldens while
        // retaining the structural sanity checks above.
    } else if (variantName === 'baseline') {
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
        // These immutable captured-fixture names predate the report split. They
        // intentionally retain the historical maximum-matching semantics.
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
                separation: stableSeparationSnapshot(separation),
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
                converged: result.optimizerMetadata?.converged,
                extraRepeatCount: result.optimizerMetadata?.extraRepeatCount,
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
            validationMode: reportOnly ? 'report-only' : 'golden',
            evidencePath,
            sourceRef: sourceRef ?? null,
            timingBoundaries: {
                appearanceFitMs:
                    'fitAppearanceRankModel from imported evidence, including effective optics and empirical/local fitting; excludes module loading, file IO and GC',
                optimizationMs:
                    'generateAutoLayers with result cache disabled, including Exact order search, repeat tiers, minimization, physical stack construction and target mapping; excludes evidence serialization, quality replay and assertions',
            },
            samples,
            timingSummary: Object.fromEntries(
                ['appearanceFitMs', 'optimizationMs'].map((key) => [
                    key,
                    measurementSummary(
                        samples
                            .filter((s) => s.phase === 'measured')
                            .map((s) => s[key as 'appearanceFitMs' | 'optimizationMs'])
                    ),
                ])
            ),
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
                realizedError,
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
