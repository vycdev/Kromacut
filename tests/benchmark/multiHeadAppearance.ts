import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import {
    benchmarkEnvironment,
    captureOptimizerProvenance,
    measurementSummary,
    persistOptimizerEvidence,
} from '../helpers/optimizerEvidence.ts';
import { readPngFixture, testAssetsRoot } from '../imageFixtures.ts';
import { imageSwatches } from '../helpers/calibratedSwatches.ts';
import { withViteTestServer } from '../helpers/viteModule.ts';
import type { AutoPaintResult } from '../../src/lib/autoPaint.ts';
import type { Filament, ThreeDControlsStateShape } from '../../src/types/index.ts';

type Swatch = { hex: string; count: number };
interface Case {
    name: string;
    filaments: Filament[];
    swatches: Swatch[];
    layerHeight: number;
    firstLayerHeight: number;
    result: AutoPaintResult;
    provenance?: { kind: string; evidenceSha256: string; resultSha256: string };
}

const args = process.argv.slice(2);
function option(name: string, fallback: string): string {
    const i = args.indexOf(name);
    if (i < 0) return fallback;
    const value = args[i + 1];
    assert.ok(value && !value.startsWith('--'), `${name} requires a value`);
    return value;
}
const inputPath = resolve(option('--input', '.profiles/multi-head/cases.json'));
const outputPath = resolve(option('--output', '.profiles/multi-head/report.json'));
const heads = option('--heads', '2,3,4,5,6,7,8').split(',').map(Number);
const modes = option('--modes', 'luminance,color').split(',') as ('luminance' | 'color')[];
assert.ok(
    heads.every((head) => Number.isInteger(head) && head >= 2 && head <= 8),
    '--heads must contain integers from 2 through 8'
);
assert.ok(
    modes.every((mode) => mode === 'luminance' || mode === 'color'),
    '--modes must contain luminance or color'
);
const calibratedResult = option('--calibrated-result', '');
assert.ok(
    !calibratedResult || args.includes('--prepare'),
    '--calibrated-result requires --prepare'
);
const names = option('--cases', calibratedResult ? 'cats' : 'cats,rocco').split(',');
if (args.includes('--prepare')) {
    const supported = calibratedResult ? ['cats'] : ['cats', 'rocco'];
    assert.ok(
        names.every((name) => supported.includes(name)),
        `Unknown preparation case; supported: ${supported.join(',')}`
    );
}
const warmups = Number(option('--warmups', '0'));
const repeats = Number(option('--runs', '1'));
assert.ok(Number.isInteger(warmups) && warmups >= 0 && warmups <= 20);
assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 20);
const analysisRef = option('--analysis-ref', '');
const shortlistSize = Number(option('--shortlist', '32'));
assert.ok(Number.isInteger(shortlistSize) && shortlistSize > 0 && shortlistSize <= 256);
function sameFile(first: string, second: string): boolean {
    const pathKey = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path);
    if (pathKey(first) === pathKey(second)) return true;
    if (!existsSync(first) || !existsSync(second)) return false;
    const firstFile = statSync(first, { bigint: true });
    const secondFile = statSync(second, { bigint: true });
    return firstFile.dev === secondFile.dev && firstFile.ino === secondFile.ino;
}
if (!args.includes('--prepare') || args.includes('--run')) {
    for (const source of [inputPath, ...(calibratedResult ? [resolve(calibratedResult)] : [])]) {
        assert.ok(!sameFile(outputPath, source), 'Report output must differ from benchmark inputs');
    }
}
let analysisSource = analysisRef
    ? execFileSync('git', ['show', `${analysisRef}:src/lib/multiHeadAnalysisColorFirst.ts`], {
          encoding: 'utf8',
      })
    : readFileSync('src/lib/multiHeadAnalysisColorFirst.ts', 'utf8');
const temporary = Boolean(analysisRef) || args.includes('--shortlist');
if (!analysisRef && temporary)
    analysisSource = analysisSource.replace(
        /export const APPEARANCE_SHORTLIST_SIZE = \d+;/,
        `export const APPEARANCE_SHORTLIST_SIZE = ${shortlistSize};`
    );
const temporaryModule = `src/lib/multiHeadAnalysisColorFirst.benchmark-${process.pid}.ts`;
if (temporary) writeFileSync(temporaryModule, analysisSource);
// Rebuild the known cats order through the unchanged production stack builder.
// Assert the reconstructed fingerprint below; the historical Exact golden has
// drifted on develop. --reoptimize measures a freshly optimized case separately.
const replayModule = `src/lib/autoPaint.multi-head-benchmark-${process.pid}.ts`;
const replay = args.includes('--prepare') && !args.includes('--reoptimize') && !calibratedResult;
if (replay) {
    const source = readFileSync('src/lib/autoPaint.ts', 'utf8');
    const branch = 'if (enhancedColorMatch) {';
    assert.equal(source.split(branch).length, 2, 'Expected one order-selection branch');
    // Only inject the recorded order. Layer construction, mapping, corrections,
    // and all timed analysis/build code remain the production implementations.
    writeFileSync(
        replayModule,
        source.replace(
            branch,
            'if (enhancedColorMatch === false) { sortedFilaments = filaments; } else if (enhancedColorMatch) {'
        )
    );
}
const modules = await withViteTestServer(async (server) => ({
    auto: (await server.ssrLoadModule(
        '/src/lib/autoPaint.ts'
    )) as typeof import('../../src/lib/autoPaint.ts'),
    analysis: (await server.ssrLoadModule(
        temporary ? `/${temporaryModule}` : '/src/lib/multiHeadAnalysisColorFirst.ts'
    )) as typeof import('../../src/lib/multiHeadAnalysisColorFirst.ts'),
    build: (await server.ssrLoadModule(
        '/src/lib/multiHeadBuild.ts'
    )) as typeof import('../../src/lib/multiHeadBuild.ts'),
    preview: (await server.ssrLoadModule(
        '/src/lib/patchedLayersToPlan.ts'
    )) as typeof import('../../src/lib/patchedLayersToPlan.ts'),
    appearance: (await server.ssrLoadModule(
        '/src/lib/appearanceModel.ts'
    )) as typeof import('../../src/lib/appearanceModel.ts'),
    profile: (await server.ssrLoadModule(
        '/src/lib/profileManager.ts'
    )) as typeof import('../../src/lib/profileManager.ts'),
    fingerprint: (await server.ssrLoadModule(
        '/src/lib/appearanceProfile.ts'
    )) as typeof import('../../src/lib/appearanceProfile.ts'),
    replay: replay ? await server.ssrLoadModule(`/${replayModule}`) : null,
})).finally(() => {
    if (temporary) rmSync(temporaryModule);
    if (replay) rmSync(replayModule);
});

/** Rocco uses the existing regression's 5-bit buckets, every fourth pixel, top 64. */
function imagePalette(path: string, rocco = false): Swatch[] {
    if (!rocco) return imageSwatches(path);
    const image = readPngFixture(path);
    const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
    for (let p = 0; p < image.width * image.height; p += rocco ? 4 : 1) {
        const [r, g, b, a] = image.rgba.subarray(p * 4, p * 4 + 4);
        if (a < 128) continue;
        const key = rocco
            ? ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
            : (r << 16) | (g << 8) | b;
        const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
        e.r += r;
        e.g += g;
        e.b += b;
        e.n++;
        buckets.set(key, e);
    }
    const entries = [...buckets.values()];
    if (rocco) entries.sort((a, b) => b.n - a.n);
    const swatches = entries.slice(0, rocco ? 64 : Infinity).map((e) => ({
        hex: modules.auto.rgbToHex({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n }),
        count: e.n,
    }));
    return swatches;
}

if (args.includes('--prepare') && calibratedResult) {
    const serialized = readFileSync(calibratedResult, 'utf8');
    const saved = JSON.parse(serialized);
    assert.equal(saved.schemaVersion, 1);
    const fixture = JSON.parse(
        readFileSync('tests/assets/performance/8-colors-frontlit-2026-08-26/cats/case.json', 'utf8')
    );
    assert.equal(
        saved.inputs.sourceImage.sha256,
        fixture.sha256.sourceImage,
        'Expected the calibrated cats source'
    );
    assert.equal(
        saved.inputs.profile.sha256,
        fixture.sha256.profile,
        'Expected the measured cats profile'
    );
    assert.equal(
        saved.swatchesSha256,
        createHash('sha256').update(JSON.stringify(saved.swatches)).digest('hex')
    );
    assert.equal(saved.configuration.optimizerAlgorithm, 'exact');
    assert.equal(
        saved.resultSha256,
        createHash('sha256').update(JSON.stringify(saved.result)).digest('hex')
    );
    const optimizer = saved.result.optimizerMetadata;
    assert.equal(
        optimizer?.algorithm,
        'exact-base',
        'Saved result was not produced by the Exact optimizer'
    );
    assert.equal(optimizer.cacheHit, false, 'Saved result must come from an uncached Exact run');
    const settings = saved.result.finalStack.settings;
    assert.equal(
        saved.configuration.maxHeight ?? null,
        settings.requestedMaxHeight,
        'Saved height cap does not match the stack'
    );
    const preserveSeparation = saved.configuration.preserveColorSeparation === true;
    assert.equal(
        preserveSeparation,
        settings.separationMaxDeltaE !== undefined,
        'Saved separation mode does not match the stack'
    );
    if (preserveSeparation) {
        assert.equal(
            modules.auto.normalizeSeparationMaxDeltaE(saved.configuration.maximumColorErrorDeltaE),
            settings.separationMaxDeltaE,
            'Saved color-error limit does not match the stack'
        );
        assert.equal(
            saved.configuration.failIfAnyColorIsMissed !== false,
            settings.failOnSeparationError,
            'Saved separation failure policy does not match the stack'
        );
    }
    const repeatBudget = saved.configuration.maximumExtraFilamentAppearances;
    assert.ok(Number.isInteger(repeatBudget) && repeatBudget >= 0, 'Invalid saved repeat budget');
    const repeatsUsed =
        saved.result.filamentOrder.length - new Set(saved.result.filamentOrder).size;
    assert.equal(
        optimizer.extraRepeatCount,
        repeatsUsed,
        'Saved repeat metadata does not match the order'
    );
    assert.ok(repeatsUsed <= repeatBudget, 'Saved repeat budget is below the repeats in the order');
    if (optimizer.repeatTiersEvaluated !== undefined) {
        assert.ok(
            Number.isInteger(optimizer.repeatTiersEvaluated) &&
                optimizer.repeatTiersEvaluated > 0 &&
                optimizer.repeatTiersEvaluated <= repeatBudget + 1,
            'Saved repeat budget is below the evaluated tiers'
        );
    }
    assert.equal(
        saved.configuration.layerHeight,
        settings.layerHeight,
        'Saved layer height does not match the stack'
    );
    assert.equal(
        Math.max(saved.configuration.firstLayerHeight, saved.configuration.layerHeight),
        settings.firstLayerHeight,
        'Saved first-layer height does not match the stack'
    );
    assert.equal(
        saved.configuration.transitionOpacity,
        settings.transitionOpacity,
        'Saved transition opacity does not match the stack'
    );
    const root = resolve(testAssetsRoot, 'performance/8-colors-frontlit-2026-08-26');
    const parsed = modules.profile.parseProfileFile(
        readFileSync(resolve(root, 'profile.kfil'), 'utf8')
    );
    assert.ok(parsed);
    const profile = modules.profile.importProfiles([], parsed).imported[0];
    const profileFingerprint = modules.fingerprint.fingerprintAppearanceFilaments(
        profile.filaments
    );
    assert.equal(
        modules.fingerprint.fingerprintAppearanceFilaments(saved.filaments),
        profileFingerprint,
        'Saved filaments do not match the measured profile'
    );
    assert.equal(
        saved.swatchesSha256,
        createHash('sha256')
            .update(JSON.stringify(imageSwatches(resolve(root, 'cats/source.png'))))
            .digest('hex'),
        'Saved swatches do not match the cats image'
    );
    // Obtain the production context fingerprint without fitting evidence again.
    const context = modules.appearance.fitAppearanceRankModel(undefined, {
        filamentProfileFingerprint: profileFingerprint,
        layerHeight: settings.layerHeight,
        firstLayerHeight: settings.firstLayerHeight,
        transitionOpacity: settings.transitionOpacity,
        filaments: profile.filaments,
    });
    assert.equal(
        saved.result.finalStack.appearanceModel.contextFingerprint,
        context.contextFingerprint,
        'Saved appearance model does not match the physical context'
    );
    const prepared: Case[] = [
        {
            name: 'cats',
            filaments: saved.filaments,
            swatches: saved.swatches,
            layerHeight: settings.layerHeight,
            firstLayerHeight: settings.firstLayerHeight,
            result: saved.result,
            provenance: {
                kind: 'fresh-exact',
                evidenceSha256: createHash('sha256').update(serialized).digest('hex'),
                resultSha256: saved.resultSha256,
            },
        },
    ];
    mkdirSync(dirname(inputPath), { recursive: true });
    writeFileSync(inputPath, JSON.stringify(prepared), { flag: 'wx' });
    if (!args.includes('--run')) process.exit(0);
} else if (args.includes('--prepare')) {
    const root = resolve(testAssetsRoot, 'performance/8-colors-frontlit-2026-08-26');
    const parsed = modules.profile.parseProfileFile(
        readFileSync(resolve(root, 'profile.kfil'), 'utf8')
    );
    assert.ok(parsed);
    const profile = modules.profile.importProfiles([], parsed).imported[0];
    const cases: Case[] = [];
    for (const name of ['cats', 'rocco'].filter((name) => names.includes(name))) {
        const swatches = imagePalette(
            name === 'cats'
                ? resolve(root, 'cats/source.png')
                : resolve(testAssetsRoot, 'rocco__source.png'),
            name === 'rocco'
        );
        const settings = JSON.parse(readFileSync(resolve(root, 'cats/case.json'), 'utf8')).settings;
        const provenance = captureOptimizerProvenance({
            fixture: resolve(root, 'cats/case.json'),
            profile: resolve(root, 'profile.kfil'),
            sourceImage:
                name === 'cats'
                    ? resolve(root, 'cats/source.png')
                    : resolve(testAssetsRoot, 'rocco__source.png'),
            harnessPath: 'tests/benchmark/multiHeadAppearance.ts',
        });
        const fitStart = performance.now();
        const model = modules.appearance.fitAppearanceRankModel(profile.appearance, {
            filamentProfileFingerprint: modules.fingerprint.fingerprintAppearanceFilaments(
                profile.filaments
            ),
            layerHeight: 0.08,
            firstLayerHeight: 0.4,
            transitionOpacity: 0.9,
            filaments: profile.filaments,
        });
        const appearanceFitMs = performance.now() - fitStart;
        const optimizeStart = performance.now();
        let result: AutoPaintResult;
        if (name === 'cats' && modules.replay) {
            const recorded = JSON.parse(
                readFileSync(
                    'tests/benchmark/results/multi-head-appearance/2026-11-01-recorded-cats-order.json',
                    'utf8'
                )
            );
            const order = recorded.filamentOrderColors.map((hex: string) => {
                const filament = profile.filaments.find((f) => f.color.toLowerCase() === hex);
                assert.ok(filament);
                return filament;
            });
            result = modules.replay.generateAutoLayers(
                order,
                swatches,
                0.08,
                0.4,
                settings.maxHeight,
                false,
                false,
                {
                    transitionOpacity: 0.9,
                    preserveSeparation: true,
                    separationMaxDeltaE: 20,
                    failOnSeparationError: false,
                },
                model
            );
        } else
            result = modules.auto.generateAutoLayers(
                profile.filaments,
                swatches,
                0.08,
                0.4,
                name === 'cats' ? settings.maxHeight : undefined,
                name === 'cats',
                name === 'cats',
                name === 'cats'
                    ? {
                          algorithm: 'exact',
                          cachingEnabled: false,
                          maxExtraRepeats: 4,
                          preserveSeparation: true,
                          separationMaxDeltaE: 20,
                          failOnSeparationError: false,
                          transitionOpacity: 0.9,
                      }
                    : undefined,
                model
            );
        // Persist each full case before any golden assertion or the next optimizer.
        persistOptimizerEvidence({
            output: `${inputPath}.${name}-${Date.now()}.json`,
            provenance,
            configuration: {
                layerHeight: 0.08,
                firstLayerHeight: 0.4,
                maxHeight: name === 'cats' ? settings.maxHeight : null,
                enhancedColorMatching: name === 'cats' && !replay,
                optimizerAlgorithm: name === 'cats' && !replay ? 'exact' : null,
                maximumExtraFilamentAppearances: name === 'cats' && !replay ? 4 : 0,
                preserveColorSeparation: name === 'cats',
                maximumColorErrorDeltaE: name === 'cats' ? 20 : null,
                failIfAnyColorIsMissed: false,
                transitionOpacity: result.finalStack.settings.transitionOpacity,
                preparation: name === 'cats' && replay ? 'recorded-order' : 'fresh',
                case: name,
            },
            variant: 'multi-head-preparation',
            filaments: profile.filaments,
            swatches,
            result,
            timing: { appearanceFitMs, optimizationMs: performance.now() - optimizeStart },
        });
        cases.push({
            name,
            filaments: profile.filaments,
            swatches,
            layerHeight: 0.08,
            firstLayerHeight: 0.4,
            result,
        });
        mkdirSync(dirname(inputPath), { recursive: true });
        writeFileSync(inputPath, JSON.stringify(cases));
        if (name === 'cats') {
            if (replay)
                assert.equal(result.finalStack.fingerprint, 'final-stack-v1-9684249d4a77bb3c');
            assert.equal(swatches.length, 128);
        }
        process.stdout.write(
            `Prepared ${name}: ${swatches.length} colors, ${result.finalStack.layers.length} layers, ${result.finalStack.fingerprint}\n`
        );
    }
    mkdirSync(dirname(inputPath), { recursive: true });
    writeFileSync(inputPath, JSON.stringify(cases));
    if (!args.includes('--run')) process.exit(0);
}

const input = readFileSync(inputPath, 'utf8');
const cases = JSON.parse(input) as Case[];
const selectedCases = cases.filter((c) => names.includes(c.name));
if (args.includes('--cases')) {
    const missing = names.filter((name) => !cases.some((c) => c.name === name));
    assert.equal(missing.length, 0, `Requested cases absent from input: ${missing.join(',')}`);
}
assert.ok(selectedCases.length > 0, 'No requested cases are present in the input');
const rows: object[] = [];
const summaries: object[] = [];
const report = {
    measuredAt: new Date().toISOString(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    analysisRef,
    shortlistSize: analysisRef ? null : shortlistSize,
    analysisSha256: createHash('sha256').update(analysisSource).digest('hex'),
    harnessSha256: createHash('sha256')
        .update(readFileSync('tests/benchmark/multiHeadAppearance.ts'))
        .digest('hex'),
    inputSha256: createHash('sha256').update(input).digest('hex'),
    machine: benchmarkEnvironment(),
    warmups,
    repeats,
    timingBoundaries: {
        analysisMs:
            'Balanced analysis including regional selection, full-model reconciliation and nozzle scheduling',
        previewMs:
            'Standalone full-model prediction and usage-weighted CIEDE2000 gain replay after the build (excluded from totalBuildMs)',
        buildMs:
            'multiHeadBuildSnapshot including corrected colors, gain gate, slice conversion and fallback validation; excludes mesh/export',
        totalBuildMs:
            'analysisMs + buildMs; excludes preparation, standalone preview, serialization and assertions',
    },
    cases: cases.map((c) => ({
        name: c.name,
        colors: c.swatches.length,
        layerHeight: c.layerHeight,
        firstLayerHeight: c.firstLayerHeight,
        layers: c.result.finalStack.layers.length,
        runs: c.result.transitionZones.length,
        occupiedSurfaces: new Set(c.result.finalStack.targetMappings.map((m) => m.projectedHeight))
            .size,
        finalStackFingerprint: c.result.finalStack.fingerprint,
        resultSha256: createHash('sha256').update(JSON.stringify(c.result)).digest('hex'),
        provenance: c.provenance ?? { kind: 'prepared-stack' },
    })),
    depth: 'balanced',
    threshold: modules.build.MIN_MULTI_HEAD_PREDICTED_GAIN,
    rows,
    summaries,
};
const log = console.log;
console.log = console.group = console.groupEnd = () => {};
for (const c of selectedCases) {
    const originalResultSha256 = createHash('sha256')
        .update(JSON.stringify(c.result))
        .digest('hex');
    for (const mode of modes)
        for (const head of heads) {
            const samples: {
                analysisMs: number;
                previewMs: number;
                buildMs: number;
                totalBuildMs: number;
            }[] = [];
            let expected: string | undefined;
            for (let i = 0; i < warmups + repeats; i++) {
                const start = performance.now();
                const result = modules.analysis.runMultiHeadLayerAnalysisColorFirst(
                    c.filaments,
                    c.result,
                    c.swatches,
                    c.layerHeight,
                    c.firstLayerHeight,
                    head,
                    'balanced',
                    mode
                );
                const analysisMs = performance.now() - start;
                const state = {
                    multiHeadMode: true,
                    multiHeadCount: head,
                    paintMode: 'autopaint',
                    filaments: c.filaments,
                    autoPaintResult: c.result,
                    layerHeight: c.layerHeight,
                    slicerFirstLayerHeight: c.firstLayerHeight,
                } as ThreeDControlsStateShape;
                const buildStart = performance.now();
                const built = modules.build.multiHeadBuildSnapshot(state, result);
                const buildMs = performance.now() - buildStart;
                // Measure the production analysis/build path before the diagnostic replay.
                const previewStart = performance.now();
                const colors = modules.preview.buildPerColorLayerColors(
                    result.patchedLayers,
                    result.colorLayerFilaments,
                    c.filaments,
                    c.result.finalStack.appearanceModel.effectiveOptics,
                    c.result.finalStack.appearanceModel
                );
                const predictedGain = modules.build.multiHeadPredictedGain(
                    c.result.finalStack,
                    result.patchedLayers,
                    colors
                );
                const previewMs = performance.now() - previewStart;
                const row = {
                    phase: i < warmups ? 'warmup' : 'measured',
                    sample: i < warmups ? i + 1 : i - warmups + 1,
                    case: c.name,
                    mode,
                    heads: head,
                    analysisMs,
                    previewMs,
                    buildMs,
                    totalBuildMs: analysisMs + buildMs,
                    predictedGain,
                    fallback: !built.multiHeadMode,
                    windows: result.windows.length,
                    pathSha256: createHash('sha256')
                        .update(JSON.stringify([...result.colorLayerFilaments]))
                        .digest('hex'),
                };
                rows.push(row);
                process.stdout.write(`${JSON.stringify(row)}\n`);
                mkdirSync(dirname(outputPath), { recursive: true });
                writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
                assert.equal(
                    createHash('sha256').update(JSON.stringify(c.result)).digest('hex'),
                    originalResultSha256,
                    'Multi-head measurement mutated its single-head reference (sample saved)'
                );
                const stable = JSON.stringify({
                    predictedGain,
                    fallback: row.fallback,
                    windows: row.windows,
                    pathSha256: row.pathSha256,
                });
                expected ??= stable;
                assert.equal(
                    stable,
                    expected,
                    'Repeated multi-head output changed (all samples saved)'
                );
                if (i >= warmups) samples.push(row);
            }
            summaries.push({
                case: c.name,
                mode,
                heads: head,
                ...Object.fromEntries(
                    (['analysisMs', 'previewMs', 'buildMs', 'totalBuildMs'] as const).map((key) => [
                        key,
                        measurementSummary(samples.map((s) => s[key])),
                    ])
                ),
            });
            writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
        }
}
log(JSON.stringify(report, null, 2));
