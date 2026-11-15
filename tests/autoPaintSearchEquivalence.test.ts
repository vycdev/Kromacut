import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadViteModule } from './helpers/viteModule.ts';
import { autoPaintGoldenScenarios } from './autoPaintGoldenFixtures.ts';

test('reusing rerank errors preserves exact scores through palette, anchor, and separation changes', async () => {
    const autoPaint =
        await loadViteModule<typeof import('../src/lib/autoPaint.ts')>('/src/lib/autoPaint.ts');
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
                autoPaint.evaluateSequenceAgainstImage(palette, targets, options)
            );
        }
        if (palette.length) {
            Object.assign(palette[0], {
                exactAnchorId: 'anchor',
                exactAnchorTargetLab: targets[0],
            });
            assert.deepEqual(
                autoPaint.evaluateSequenceAgainstImage(palette, targets, { workspace }),
                autoPaint.evaluateSequenceAgainstImage(palette, targets)
            );
            Object.assign(palette[0], { surfaceEligible: false });
            assert.deepEqual(
                autoPaint.evaluateSequenceAgainstImage(palette, targets, { workspace }),
                autoPaint.evaluateSequenceAgainstImage(palette, targets)
            );
        }
    }
});

test('seed 12345 retains pre-optimization final stacks with and without repeats', async () => {
    const { generateAutoLayers } =
        await loadViteModule<typeof import('../src/lib/autoPaint.ts')>('/src/lib/autoPaint.ts');
    const filaments = [
        { id: 'white', color: '#ffffff', td: 0.677 },
        { id: 'black', color: '#000000', td: 0.05 },
        { id: 'green', color: '#00ff00', td: 0.885 },
        { id: 'yellow', color: '#ffff00', td: 0.556 },
    ];
    for (const [count, repeats, expected, score] of [
        [16, 0, 'final-stack-v1-6bf1860d12617e39', 51.008153499609854],
        [16, 12, 'final-stack-v1-9345721ef8afc24a', 46.61133620548023],
        [1024, 0, 'final-stack-v1-3612fa232a534273', 55.27473943848779],
        [1024, 12, 'final-stack-v1-932c4f8286c54d83', 51.98335573895216],
    ] as const) {
        const swatches = Array.from({ length: count }, (_, index) => ({
            hex: `#${((((index + 12345) * 2654435761) >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`,
            count: 1 + (index % 5),
        }));
        const result = generateAutoLayers(filaments, swatches, 0.12, 0.2, 5, true, repeats > 0, {
            algorithm: 'fast',
            seed: 12345,
            maxExtraRepeats: repeats,
            transitionOpacity: 0.8,
            cachingEnabled: false,
        });
        assert.equal(result.finalStack.fingerprint, expected);
        assert.equal(result.optimizerMetadata?.score, score);
    }
});

test('existing image/profile fixtures retain baseline final stacks and scores with seed 12345', async () => {
    const baseline = JSON.parse(
        readFileSync(
            new URL('./assets/auto-paint-search-equivalence.json', import.meta.url),
            'utf8'
        )
    ) as {
        seed: number;
        results: { name: string; fingerprint: string; score: number }[];
    };
    const { generateAutoLayers } =
        await loadViteModule<typeof import('../src/lib/autoPaint.ts')>('/src/lib/autoPaint.ts');
    const scenarios = autoPaintGoldenScenarios().filter((scenario) => scenario.enhancedColorMatch);
    assert.deepEqual(
        scenarios.map((scenario) => scenario.name),
        baseline.results.map((result) => result.name)
    );
    for (const [index, scenario] of scenarios.entries()) {
        const result = generateAutoLayers(
            scenario.filaments,
            scenario.imageSwatches,
            0.08,
            0.16,
            undefined,
            true,
            scenario.allowRepeatedSwaps,
            {
                algorithm: 'balanced',
                seed: baseline.seed,
                cachingEnabled: false,
            }
        );
        assert.equal(
            result.finalStack.fingerprint,
            baseline.results[index].fingerprint,
            scenario.name
        );
        assert.equal(result.optimizerMetadata?.score, baseline.results[index].score, scenario.name);
    }
});
