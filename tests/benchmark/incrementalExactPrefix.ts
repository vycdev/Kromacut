import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { rgbToHsl } from '../../src/lib/color.ts';
import { readPngFixture } from '../imageFixtures.ts';
import { withViteTestServer } from '../helpers/viteModule.ts';

type AutoPaint = typeof import('../../src/lib/autoPaint.ts');
type AppearanceModel = typeof import('../../src/lib/appearanceModel.ts');
type AppearanceProfile = typeof import('../../src/lib/appearanceProfile.ts');
type Optimizer = typeof import('../../src/lib/optimizer.ts');
type ProfileManager = typeof import('../../src/lib/profileManager.ts');

const modules = await withViteTestServer(async (server) => {
    const [autoPaint, appearanceModel, appearanceProfile, optimizer, profileManager] =
        await Promise.all([
            server.ssrLoadModule('/src/lib/autoPaint.ts'),
            server.ssrLoadModule('/src/lib/appearanceModel.ts'),
            server.ssrLoadModule('/src/lib/appearanceProfile.ts'),
            server.ssrLoadModule('/src/lib/optimizer.ts'),
            server.ssrLoadModule('/src/lib/profileManager.ts'),
        ]);
    return {
        autoPaint: autoPaint as AutoPaint,
        appearanceModel: appearanceModel as AppearanceModel,
        appearanceProfile: appearanceProfile as AppearanceProfile,
        optimizer: optimizer as Optimizer,
        profileManager: profileManager as ProfileManager,
    };
});

const fixtureRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../assets/performance/8-colors-frontlit-2026-08-26'
);
const fixtureDirectory = resolve(fixtureRoot, 'k-logo');
const fixture = JSON.parse(readFileSync(resolve(fixtureDirectory, 'case.json'), 'utf8'));
const parsed = modules.profileManager.parseProfileFile(
    readFileSync(resolve(fixtureDirectory, fixture.profile), 'utf8')
);
assert.ok(parsed, 'Calibrated profile must parse');
const profile = modules.profileManager.importProfiles([], parsed).imported[0];
assert.ok(profile, 'Calibrated profile must import');

function imageSwatches(path: string): Array<{ hex: string; count: number }> {
    const image = readPngFixture(path);
    const counts = new Map<number, number>();
    for (let index = 0; index < image.rgba.length; index += 4) {
        if (image.rgba[index + 3] === 0) continue;
        const key =
            (image.rgba[index] << 16) | (image.rgba[index + 1] << 8) | image.rgba[index + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts, ([rgb, count]) => {
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = rgb & 0xff;
        return {
            hex: `#${rgb.toString(16).padStart(6, '0')}`,
            count,
            hsl: rgbToHsl(r, g, b),
        };
    })
        .sort((left, right) => {
            if (left.hsl.h !== right.hsl.h) return left.hsl.h - right.hsl.h;
            if (left.hsl.s !== right.hsl.s) return right.hsl.s - left.hsl.s;
            return right.hsl.l - left.hsl.l;
        })
        .reverse()
        .map(({ hex, count }) => ({ hex, count }));
}

const settings = fixture.settings;
const swatches = imageSwatches(resolve(fixtureDirectory, fixture.sourceImage));
const imageColors = modules.autoPaint.buildOptimizerImageTargets(swatches);
const appearanceModel = modules.appearanceModel.fitAppearanceRankModel(profile.appearance, {
    filamentProfileFingerprint: modules.appearanceProfile.fingerprintAppearanceFilaments(
        profile.filaments
    ),
    layerHeight: settings.layerHeight,
    firstLayerHeight: settings.firstLayerHeight,
    transitionOpacity: settings.transitionOpacity,
    filaments: profile.filaments,
});

const exactAnchorTargets = appearanceModel.exactAnchors
    .filter((anchor) => anchor.source !== 'stack-matrix')
    .map((anchor) => ({ L: anchor.targetLab[0], a: anchor.targetLab[1], b: anchor.targetLab[2] }));
const exactAnchorTargetSet = exactAnchorTargets.length
    ? new Set(
          imageColors.filter((target) =>
              exactAnchorTargets.some(
                  (anchor) => modules.autoPaint.deltaELab(anchor, target) <= 0.25
              )
          )
      )
    : undefined;

type Filament = (typeof profile.filaments)[number];
type Evaluation = ReturnType<typeof modules.autoPaint.evaluateSequenceAgainstImage>;
type PrefixState = ReturnType<
    ReturnType<typeof modules.autoPaint.createOpticalPrefixBuilder>['extend']
>;

type Scenario = {
    name: string;
    filaments: Filament[];
    layerHeight: number;
    firstLayerHeight: number;
    maxHeight: number | undefined;
    transitionOpacity: number;
    appearanceModel: typeof appearanceModel;
    exhaustive: boolean;
};

function compareCandidates(
    leftOrder: Filament[],
    left: Evaluation,
    rightOrder: Filament[],
    right: Evaluation
): number {
    const semantic = modules.optimizer.compareSeparationSequenceEvaluations(left, right, 0, 0);
    if (semantic !== 0) return semantic;
    if (left.score !== right.score) return left.score - right.score;
    const leftKey = leftOrder.map((filament) => filament.id).join('|');
    const rightKey = rightOrder.map((filament) => filament.id).join('|');
    return leftKey === rightKey ? 0 : leftKey < rightKey ? -1 : 1;
}

function runScenario(scenario: Scenario) {
    const builder = modules.autoPaint.createOpticalPrefixBuilder(
        scenario.layerHeight,
        scenario.firstLayerHeight,
        scenario.transitionOpacity,
        scenario.appearanceModel
    );
    const sequence: Filament[] = [];
    const used = new Uint8Array(scenario.filaments.length);
    const baselineHash = createHash('sha256');
    const incrementalHash = createHash('sha256');
    const baselineWorkspace = modules.autoPaint.createSequenceScoringWorkspace();
    const incrementalWorkspace = modules.autoPaint.createSequenceScoringWorkspace();
    let candidateCount = 0;
    let mismatches = 0;
    let baselinePaletteMs = 0;
    let incrementalPaletteMs = 0;
    let baselineScoringMs = 0;
    let incrementalScoringMs = 0;
    let baselineBest: { order: Filament[]; evaluation: Evaluation } | undefined;
    let incrementalBest: { order: Filament[]; evaluation: Evaluation } | undefined;

    const visit = (parent: PrefixState | undefined): void => {
        for (let index = 0; index < scenario.filaments.length; index++) {
            if (used[index]) continue;
            used[index] = 1;
            const filament = scenario.filaments[index];
            sequence.push(filament);
            const prefix = builder.extend(parent, filament);

            let started = performance.now();
            const baselinePalette = modules.autoPaint.buildAchievableColorPalette(
                sequence,
                scenario.layerHeight,
                scenario.firstLayerHeight,
                scenario.maxHeight,
                scenario.transitionOpacity,
                undefined,
                scenario.appearanceModel
            );
            baselinePaletteMs += performance.now() - started;

            started = performance.now();
            const incrementalPalette = builder.buildPalette(prefix, scenario.maxHeight);
            incrementalPaletteMs += performance.now() - started;

            try {
                assert.deepEqual(incrementalPalette, baselinePalette);
            } catch (error) {
                mismatches++;
                throw error;
            }
            const paletteJson = JSON.stringify(baselinePalette);
            baselineHash.update(paletteJson);
            incrementalHash.update(JSON.stringify(incrementalPalette));

            started = performance.now();
            const baselineEvaluation = modules.autoPaint.evaluateSequenceAgainstImage(
                baselinePalette,
                imageColors,
                {
                    preserveSeparation: true,
                    separationMaxDeltaE: settings.maximumColorErrorDeltaE,
                    exactAnchorTargets,
                    exactAnchorTargetSet,
                    workspace: baselineWorkspace,
                }
            );
            baselineScoringMs += performance.now() - started;

            started = performance.now();
            const incrementalEvaluation = modules.autoPaint.evaluateSequenceAgainstImage(
                incrementalPalette,
                imageColors,
                {
                    preserveSeparation: true,
                    separationMaxDeltaE: settings.maximumColorErrorDeltaE,
                    exactAnchorTargets,
                    exactAnchorTargetSet,
                    workspace: incrementalWorkspace,
                }
            );
            incrementalScoringMs += performance.now() - started;
            assert.deepEqual(incrementalEvaluation, baselineEvaluation);

            if (
                !baselineBest ||
                compareCandidates(sequence, baselineEvaluation, baselineBest.order, baselineBest.evaluation) <
                    0
            ) {
                baselineBest = { order: [...sequence], evaluation: baselineEvaluation };
            }
            if (
                !incrementalBest ||
                compareCandidates(
                    sequence,
                    incrementalEvaluation,
                    incrementalBest.order,
                    incrementalBest.evaluation
                ) < 0
            ) {
                incrementalBest = { order: [...sequence], evaluation: incrementalEvaluation };
            }
            candidateCount++;
            visit(prefix);
            sequence.pop();
            used[index] = 0;
        }
    };

    visit(undefined);
    const baselineChecksum = baselineHash.digest('hex');
    const incrementalChecksum = incrementalHash.digest('hex');
    assert.equal(incrementalChecksum, baselineChecksum);
    assert.deepEqual(
        incrementalBest?.order.map((filament) => filament.id),
        baselineBest?.order.map((filament) => filament.id)
    );
    assert.deepEqual(incrementalBest?.evaluation, baselineBest?.evaluation);
    if (scenario.exhaustive) {
        assert.equal(candidateCount, 109_600);
    }

    return {
        name: scenario.name,
        candidateCount,
        mismatches,
        paletteChecksum: baselineChecksum,
        baselineBestOrder: baselineBest?.order.map((filament) => filament.id),
        incrementalBestOrder: incrementalBest?.order.map((filament) => filament.id),
        bestEvaluation: baselineBest?.evaluation,
        timing: {
            baselinePrefixAndPaletteMs: baselinePaletteMs,
            incrementalPrefixAndPaletteMs: incrementalPaletteMs,
            prefixAndPaletteSpeedup: baselinePaletteMs / incrementalPaletteMs,
            baselineSemanticScoringMs: baselineScoringMs,
            incrementalSemanticScoringMs: incrementalScoringMs,
        },
    };
}

const alteredProcessModel = modules.appearanceModel.fitAppearanceRankModel(profile.appearance, {
    filamentProfileFingerprint: modules.appearanceProfile.fingerprintAppearanceFilaments(
        profile.filaments
    ),
    layerHeight: 0.12,
    firstLayerHeight: 0.24,
    transitionOpacity: 0.75,
    filaments: profile.filaments,
});
const parameterScenarios: Scenario[] = [
    {
        name: 'calibrated-substrate-first-layer-max-height-transition-opacity',
        filaments: profile.filaments.slice(0, 4),
        layerHeight: 0.08,
        firstLayerHeight: 0.32,
        maxHeight: 1.2,
        transitionOpacity: 0.8,
        appearanceModel,
        exhaustive: false,
    },
    {
        name: 'altered-process-fingerprint',
        filaments: profile.filaments.slice(0, 4),
        layerHeight: 0.12,
        firstLayerHeight: 0.24,
        maxHeight: 1.44,
        transitionOpacity: 0.75,
        appearanceModel: alteredProcessModel,
        exhaustive: false,
    },
];

const startedAt = performance.now();
const parameterChecks = parameterScenarios.map(runScenario);
const exhaustive = runScenario({
    name: 'calibrated-eight-filament-exhaustive',
    filaments: profile.filaments,
    layerHeight: settings.layerHeight,
    firstLayerHeight: settings.firstLayerHeight,
    maxHeight: settings.maxHeight,
    transitionOpacity: settings.transitionOpacity,
    appearanceModel,
    exhaustive: true,
});
globalThis.gc?.();

console.log(
    JSON.stringify(
        {
            node: process.version,
            fixture: '8-colors-frontlit-2026-08-26/k-logo',
            profileFilaments: profile.filaments.length,
            imageTargets: imageColors.length,
            processFingerprints: {
                calibrated: appearanceModel.contextFingerprint,
                altered: alteredProcessModel.contextFingerprint,
            },
            effectiveOptics: {
                applied: appearanceModel.effectiveOptics?.applied ?? false,
                interactionCount: appearanceModel.effectiveOptics?.substrateInteractions.length ?? 0,
            },
            parameterChecks,
            exhaustive,
            memory: {
                retainedHeapBytes: process.memoryUsage().heapUsed,
                residentSetBytes: process.memoryUsage().rss,
                maximumResidentSetBytes: process.resourceUsage().maxRSS * 1024,
            },
            totalWallMs: performance.now() - startedAt,
        },
        null,
        2
    )
);
