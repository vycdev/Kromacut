import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, platform } from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { readPngFixture, testAssetsRoot } from '../imageFixtures.ts';
import { rgbToHsl } from '../../src/lib/color.ts';
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
}

const args = process.argv.slice(2);
function option(name: string, fallback: string): string {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
}
const inputPath = resolve(option('--input', '.profiles/multi-head/cases.json'));
const outputPath = resolve(option('--output', '.profiles/multi-head/report.json'));
const heads = option('--heads', '2,3,4,5,6,7,8').split(',').map(Number);
const modes = option('--modes', 'luminance,color').split(',') as ('luminance' | 'color')[];
const names = option('--cases', 'cats,rocco').split(',');
const analysisRef = option('--analysis-ref', '');
const shortlistSize = Number(option('--shortlist', '32'));
assert.ok(Number.isInteger(shortlistSize) && shortlistSize > 0 && shortlistSize <= 256);
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
const replay = args.includes('--prepare') && !args.includes('--reoptimize');
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
    // Match the cats case's useSwatches ordering (reversed HSL).
    if (!rocco)
        swatches.sort((a, b) => {
            const hsl = (hex: string) => {
                const { r, g, b } = modules.auto.hexToRgb(hex);
                return rgbToHsl(r, g, b);
            };
            const x = hsl(a.hex),
                y = hsl(b.hex);
            return y.h - x.h || x.s - y.s || x.l - y.l;
        });
    return swatches;
}

if (args.includes('--prepare')) {
    const root = resolve(testAssetsRoot, 'performance/8-colors-frontlit-2026-08-26');
    const parsed = modules.profile.parseProfileFile(
        readFileSync(resolve(root, 'profile.kfil'), 'utf8')
    );
    assert.ok(parsed);
    const profile = modules.profile.importProfiles([], parsed).imported[0];
    const cases: Case[] = [];
    for (const name of ['cats', 'rocco']) {
        const swatches = imagePalette(
            name === 'cats'
                ? resolve(root, 'cats/source.png')
                : resolve(testAssetsRoot, 'rocco__source.png'),
            name === 'rocco'
        );
        const settings = JSON.parse(readFileSync(resolve(root, 'cats/case.json'), 'utf8')).settings;
        const model = modules.appearance.fitAppearanceRankModel(profile.appearance, {
            filamentProfileFingerprint: modules.fingerprint.fingerprintAppearanceFilaments(
                profile.filaments
            ),
            layerHeight: 0.08,
            firstLayerHeight: 0.4,
            transitionOpacity: 0.9,
            filaments: profile.filaments,
        });
        let result: AutoPaintResult;
        if (name === 'cats' && modules.replay) {
            const fixture = JSON.parse(readFileSync(resolve(root, 'cats/case.json'), 'utf8'));
            const order = fixture.replayResult.filamentOrderColors.map((hex: string) => {
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
        if (name === 'cats') {
            if (replay)
                assert.equal(result.finalStack.fingerprint, 'final-stack-v1-9684249d4a77bb3c');
            assert.equal(swatches.length, 128);
        }
        cases.push({
            name,
            filaments: profile.filaments,
            swatches,
            layerHeight: 0.08,
            firstLayerHeight: 0.4,
            result,
        });
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
const rows: object[] = [];
const report = {
    measuredAt: new Date().toISOString(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    analysisRef,
    shortlistSize: analysisRef ? null : shortlistSize,
    analysisSha256: createHash('sha256').update(analysisSource).digest('hex'),
    inputSha256: createHash('sha256').update(input).digest('hex'),
    machine: { node: process.version, platform: platform(), cpu: cpus()[0].model },
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
    })),
    depth: 'balanced',
    threshold: modules.build.MIN_MULTI_HEAD_PREDICTED_GAIN,
    rows,
};
const log = console.log;
console.log = console.group = console.groupEnd = () => {};
for (const c of cases.filter((c) => names.includes(c.name))) {
    for (const mode of modes)
        for (const head of heads) {
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
            const row = {
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
        }
}
log(JSON.stringify(report, null, 2));
