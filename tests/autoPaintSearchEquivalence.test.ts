import assert from 'node:assert/strict';
import test from 'node:test';
import { loadViteModule } from './helpers/viteModule.ts';
import { autoPaintGoldenScenarios } from './autoPaintGoldenFixtures.ts';
import { loadAutoPaintScoringReference } from './helpers/autoPaintScoringReference.ts';

type AutoPaintModule = typeof import('../src/lib/autoPaint.ts');
let modules: Promise<{ current: AutoPaintModule; baseline: AutoPaintModule }> | undefined;
function loadModules() {
    modules ??= (async () => ({
        current: await loadViteModule<AutoPaintModule>('/src/lib/autoPaint.ts'),
        baseline: await loadAutoPaintScoringReference(),
    }))();
    return modules;
}

test('reusing rerank errors preserves exact scores through palette, anchor, and separation changes', async () => {
    const { current: autoPaint, baseline } = await loadModules();
    const workspace = autoPaint.createSequenceScoringWorkspace();
    const targets = Array.from({ length: 80 }, (_, index) => ({
        L: 10 + index,
        a: ((index * 13) % 90) - 45,
        b: ((index * 19) % 80) - 40,
        weight: 1 + (index % 7),
    }));
    for (const size of [40, 5, 30, 1, 0, 20]) {
        const palette = Array.from({ length: size }, (_, index) => ({
            height: 0.2 + index * 0.12,
            lab: { L: 20 + index, a: ((index * 17) % 60) - 30, b: ((index * 7) % 70) - 35 },
            rgb: { r: index, g: index, b: index },
        }));
        for (const preserveSeparation of [false, true]) {
            const options = { preserveSeparation, separationMaxDeltaE: 12 };
            assert.deepEqual(
                autoPaint.evaluateSequenceAgainstImage(palette, targets, { ...options, workspace }),
                baseline.evaluateSequenceAgainstImage(palette, targets, options)
            );
        }
        if (palette.length) {
            Object.assign(palette[0], {
                exactAnchorId: 'anchor',
                exactAnchorTargetLab: targets[0],
            });
            assert.deepEqual(
                autoPaint.evaluateSequenceAgainstImage(palette, targets, { workspace }),
                baseline.evaluateSequenceAgainstImage(palette, targets)
            );
            Object.assign(palette[0], { surfaceEligible: false });
            assert.deepEqual(
                autoPaint.evaluateSequenceAgainstImage(palette, targets, { workspace }),
                baseline.evaluateSequenceAgainstImage(palette, targets)
            );
        }
    }
});

test('seed 12345 retains pre-optimization final stacks with and without repeats', async () => {
    const { current, baseline } = await loadModules();
    const filaments = [
        { id: 'white', color: '#ffffff', td: 0.677 },
        { id: 'black', color: '#000000', td: 0.05 },
        { id: 'green', color: '#00ff00', td: 0.885 },
        { id: 'yellow', color: '#ffff00', td: 0.556 },
    ];
    for (const [count, repeats] of [
        [16, 0],
        [16, 12],
        [1024, 0],
        [1024, 12],
    ] as const) {
        const swatches = Array.from({ length: count }, (_, index) => ({
            hex: `#${((((index + 12345) * 2654435761) >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`,
            count: 1 + (index % 5),
        }));
        const options = {
            algorithm: 'fast',
            seed: 12345,
            maxExtraRepeats: repeats,
            transitionOpacity: 0.8,
            cachingEnabled: false,
        } as const;
        const expected = baseline.generateAutoLayers(
            filaments,
            swatches,
            0.12,
            0.2,
            5,
            true,
            repeats > 0,
            options
        );
        const result = current.generateAutoLayers(
            filaments,
            swatches,
            0.12,
            0.2,
            5,
            true,
            repeats > 0,
            options
        );
        assert.deepEqual(result.finalStack, expected.finalStack);
        assert.equal(result.optimizerMetadata?.score, expected.optimizerMetadata?.score);
    }
});

test('existing image/profile fixtures retain baseline final stacks and scores with seed 12345', async () => {
    const { current, baseline } = await loadModules();
    const scenarios = autoPaintGoldenScenarios().filter((scenario) => scenario.enhancedColorMatch);
    for (const scenario of scenarios) {
        const generate = (module: AutoPaintModule) =>
            module.generateAutoLayers(
                scenario.filaments,
                scenario.imageSwatches,
                0.08,
                0.16,
                undefined,
                true,
                scenario.allowRepeatedSwaps,
                {
                    algorithm: 'balanced',
                    seed: 12345,
                    cachingEnabled: false,
                }
            );
        const expected = generate(baseline);
        const result = generate(current);
        assert.deepEqual(result.finalStack, expected.finalStack, scenario.name);
        assert.equal(
            result.optimizerMetadata?.score,
            expected.optimizerMetadata?.score,
            scenario.name
        );
    }
});
