import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

type OptimizerModule = typeof import('../src/lib/optimizer.ts');

const filaments = [
    { id: 'black', color: '#101010', td: 0.8 },
    { id: 'blue', color: '#2557a7', td: 1.4 },
    { id: 'red', color: '#bb4b3b', td: 1.8 },
    { id: 'white', color: '#eeeeee', td: 2.2 },
];
const context = {
    imageColors: [
        { L: 16, a: 0, b: 0, weight: 0.2 },
        { L: 38, a: 12, b: -34, weight: 0.25 },
        { L: 51, a: 38, b: 26, weight: 0.3 },
        { L: 91, a: 0, b: 0, weight: 0.25 },
    ],
    layerHeight: 0.08,
    firstLayerHeight: 0.16,
};
let optimizerModule: Promise<OptimizerModule> | null = null;

async function loadOptimizerModule(): Promise<OptimizerModule> {
    optimizerModule ??= loadViteModule<OptimizerModule>('/src/lib/optimizer.ts');
    return optimizerModule;
}

async function loadViteModule<T>(modulePath: string): Promise<T> {
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
        return (await server.ssrLoadModule(modulePath)) as T;
    } finally {
        await server.close();
    }
}

test('each optimizer produces the same result for the same seed', async (t) => {
    const { optimizeFilamentOrder } = await loadOptimizerModule();
    const algorithms = [
        'exhaustive',
        'simulated-annealing',
        'fast',
        'balanced',
        'thorough',
        'deep',
        'exact',
    ] as const;

    for (const algorithm of algorithms) {
        await t.test(algorithm, () => {
            const options = {
                algorithm,
                seed: 0x4b524f4d,
                cachingEnabled: false,
                maxIterations: 30,
                populationSize: 16,
            };

            const first = optimizeFilamentOrder(filaments, context, options);
            const second = optimizeFilamentOrder(filaments, context, options);

            assert.deepEqual(second, first);
        });
    }
});

test('optimizer progress is monotonic and completes for every algorithm', async (t) => {
    const { optimizeFilamentOrder } = await loadOptimizerModule();
    const algorithms = [
        'exhaustive',
        'simulated-annealing',
        'fast',
        'balanced',
        'thorough',
        'deep',
        'exact',
    ] as const;

    for (const algorithm of algorithms) {
        await t.test(algorithm, () => {
            const samples: number[] = [];
            optimizeFilamentOrder(filaments, context, {
                algorithm,
                seed: 42,
                maxIterations: 30,
                cachingEnabled: false,
                onProgress: (iteration, total) => samples.push(total > 0 ? iteration / total : 0),
            });

            assert.ok(samples.length > 0);
            assert.equal(samples.at(-1), 1);
            assert.ok(
                samples.every((sample, index) => index === 0 || sample >= samples[index - 1]),
                'progress must never move backwards'
            );
        });
    }

    const exactRepeatSamples: number[] = [];
    optimizeFilamentOrder(filaments, context, {
        algorithm: 'exact',
        allowRepeatedSwaps: true,
        seed: 42,
        maxIterations: 20,
        cachingEnabled: false,
        onProgress: (iteration, total) =>
            exactRepeatSamples.push(total > 0 ? iteration / total : 0),
    });
    assert.ok(exactRepeatSamples.length > 2, 'exact repeat refinement must report intermediate progress');
    assert.equal(exactRepeatSamples.at(-1), 1);
    assert.ok(
        exactRepeatSamples.every(
            (sample, index) => index === 0 || sample >= exactRepeatSamples[index - 1]
        ),
        'exact repeat refinement progress must never move backwards'
    );
});

function withoutCacheState<T extends { cacheHit?: boolean }>(result: T): Omit<T, 'cacheHit'> {
    const outcome = { ...result };
    delete outcome.cacheHit;
    return outcome as Omit<T, 'cacheHit'>;
}

test('cache keys include all weighted clusters and optimizer tuning', async () => {
    const { clearOptimizerCache, getOptimizerCacheStats, optimizeFilamentOrder } =
        await loadOptimizerModule();
    clearOptimizerCache();

    const manyClusters = {
        ...context,
        imageColors: Array.from({ length: 21 }, (_, index) => ({
            L: 10 + index * 3,
            a: index - 10,
            b: 10 - index,
            weight: index === 20 ? 0.01 : 1,
        })),
    };
    const options = {
        algorithm: 'simulated-annealing' as const,
        seed: 12345,
        maxIterations: 30,
        temperature: 75,
        cachingEnabled: true,
    };

    const first = optimizeFilamentOrder(filaments, manyClusters, options);
    const cached = optimizeFilamentOrder(filaments, manyClusters, options);
    assert.equal(first.cacheHit, undefined);
    assert.equal(cached.cacheHit, true);
    assert.equal(getOptimizerCacheStats().size, 1);

    const regionWeightedClusters = {
        ...manyClusters,
        imageColors: manyClusters.imageColors.map((cluster, index) => ({
            ...cluster,
            weight: index === 20 ? 0.5 : cluster.weight,
        })),
    };
    const changedWeight = optimizeFilamentOrder(filaments, regionWeightedClusters, options);
    assert.equal(changedWeight.cacheHit, undefined, 'a changed spatial weight must miss cache');
    assert.equal(getOptimizerCacheStats().size, 2);

    const changedTemperature = optimizeFilamentOrder(filaments, manyClusters, {
        ...options,
        temperature: 76,
    });
    assert.equal(changedTemperature.cacheHit, undefined, 'a changed temperature must miss cache');
    assert.equal(getOptimizerCacheStats().size, 3);

    const calibratedFilaments = filaments.map((filament, index) =>
        index === 2
            ? {
                  ...filament,
                  calibration: {
                      opacityLayers: 6,
                      layerHeight: 0.1,
                      firstLayerHeight: 0.2,
                      td: [1.2, 1.8, 2.4] as [number, number, number],
                      tdSingleValue: filament.td,
                      jnd: 2,
                      baseColor: '#000000',
                      confidence: 1,
                      basis: 'frontlit' as const,
                      calibrationDate: '2026-01-01T00:00:00.000Z',
                  },
              }
            : filament
    );
    const changedCalibration = optimizeFilamentOrder(calibratedFilaments, manyClusters, options);
    assert.equal(
        changedCalibration.cacheHit,
        undefined,
        'changed per-channel calibration TDs must miss cache'
    );
    assert.equal(getOptimizerCacheStats().size, 4);
});

test('default optimizer seeds are stable and cacheable', async () => {
    const { clearOptimizerCache, optimizeFilamentOrder } = await loadOptimizerModule();
    clearOptimizerCache();

    const options = {
        algorithm: 'simulated-annealing' as const,
        maxIterations: 20,
        cachingEnabled: true,
    };
    const first = optimizeFilamentOrder(filaments, context, options);
    const second = optimizeFilamentOrder(filaments, context, options);

    assert.equal(first.cacheHit, undefined);
    assert.equal(second.cacheHit, true);
    assert.deepEqual(withoutCacheState(second), withoutCacheState(first));
});

test('optimizer scores its selected order with the shared build-model scorer', async () => {
    const { optimizeFilamentOrder, scoreFilamentSequence } = await loadOptimizerModule();
    const result = optimizeFilamentOrder(filaments, context, {
        algorithm: 'exhaustive',
        seed: 99,
        cachingEnabled: false,
    });

    assert.equal(result.score, scoreFilamentSequence(result.order, context));
});

test('the shared scorer evaluates the compressed stack when Max Height is set', async () => {
    const { optimizeFilamentOrder, scoreFilamentSequence } = await loadOptimizerModule();
    const compressedContext = { ...context, maxHeight: 0.24 };
    const options = {
        algorithm: 'exhaustive' as const,
        seed: 99,
        cachingEnabled: false,
    };

    const unconstrainedScore = scoreFilamentSequence(filaments, context);
    const compressedScore = scoreFilamentSequence(filaments, compressedContext);
    const result = optimizeFilamentOrder(filaments, compressedContext, options);

    assert.notEqual(
        compressedScore,
        unconstrainedScore,
        'compression must change the palette being scored'
    );
    assert.equal(result.score, scoreFilamentSequence(result.order, compressedContext));
});

test('exhaustive search evaluates ordered subsets and drops a strictly worse filament', async () => {
    const { optimizeFilamentOrder } = await loadOptimizerModule();
    const candidates = [
        { id: 'black', color: '#000000', td: 0.8 },
        { id: 'white', color: '#ffffff', td: 1.2 },
        { id: 'near-white', color: '#fefefe', td: 1.2 },
    ];
    const target = {
        imageColors: [{ L: 100, a: 0, b: 0, weight: 1 }],
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
    };

    const result = optimizeFilamentOrder(candidates, target, {
        algorithm: 'exhaustive',
        cachingEnabled: false,
    });

    assert.equal(result.iterations, 15, 'three filaments have 15 ordered non-empty subsets');
    assert.deepEqual(result.order.map((filament) => filament.id), ['white']);
});

test('repeats can close the RGB color path to reach the missing magenta blend', async () => {
    const { optimizeFilamentOrder } = await loadOptimizerModule();
    const primaries = [
        { id: 'red', color: '#ff0000', td: 1.2 },
        { id: 'green', color: '#00ff00', td: 1.2 },
        { id: 'blue', color: '#0000ff', td: 1.2 },
    ];
    const spectrumTargets = {
        imageColors: [
            { L: 53, a: 80, b: 67, weight: 0.05 },
            { L: 88, a: -86, b: 83, weight: 0.05 },
            { L: 32, a: 79, b: -108, weight: 0.05 },
            { L: 97, a: -22, b: 94, weight: 0.28 },
            { L: 91, a: -48, b: -14, weight: 0.28 },
            { L: 60, a: 98, b: -61, weight: 0.29 },
        ],
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
    };

    const result = optimizeFilamentOrder(primaries, spectrumTargets, {
        algorithm: 'exhaustive',
        allowRepeatedSwaps: true,
        cachingEnabled: false,
    });

    const ids = result.order.map((filament) => filament.id);
    assert.ok(
        new Set(ids).size < ids.length,
        'closing the RGB path should repeat one primary for the magenta transition'
    );
    assert.ok(
        ids.every((id, index) => index === 0 || id !== ids[index - 1]),
        'repeated stacks must not contain adjacent duplicate filaments'
    );
    assert.ok(ids.length <= primaries.length + 4);
});

test('variable-length optimizers preserve sequence safety invariants', async (t) => {
    const { optimizeFilamentOrder } = await loadOptimizerModule();
    const algorithms = [
        'exhaustive',
        'simulated-annealing',
        'fast',
        'balanced',
        'thorough',
        'deep',
        'exact',
    ] as const;

    for (const allowRepeatedSwaps of [false, true]) {
        for (const algorithm of algorithms) {
            await t.test(`${algorithm} / repeats=${allowRepeatedSwaps}`, () => {
                const result = optimizeFilamentOrder(filaments, context, {
                    algorithm,
                    allowRepeatedSwaps,
                    seed: 20260621,
                    maxIterations: 40,
                    cachingEnabled: false,
                });
                const ids = result.order.map((filament) => filament.id);

                assert.ok(ids.length >= 1);
                assert.ok(ids.length <= filaments.length + (allowRepeatedSwaps ? 4 : 0));
                assert.ok(ids.every((id, index) => index === 0 || id !== ids[index - 1]));
                if (!allowRepeatedSwaps) {
                    assert.equal(new Set(ids).size, ids.length);
                }
            });
        }
    }
});

test('maxExtraRepeats supports the full user-facing repeat-limit range', async () => {
    const { optimizeFilamentOrder } = await loadOptimizerModule();

    for (const maxExtraRepeats of [0, 2, 4, 6, 8, 12]) {
        const result = optimizeFilamentOrder(filaments, context, {
            algorithm: 'balanced',
            maxExtraRepeats,
            seed: 20260624,
            cachingEnabled: false,
        });
        const ids = result.order.map((filament) => filament.id);

        assert.ok(ids.length <= filaments.length + maxExtraRepeats);
        assert.ok(ids.every((id, index) => index === 0 || id !== ids[index - 1]));
        if (maxExtraRepeats === 0) {
            assert.equal(new Set(ids).size, ids.length, 'Off must prohibit all repeated filaments');
        }
    }
});

test('fast uses a narrow beam while explicit exhaustive remains exact', async () => {
    const { optimizeFilamentOrder } = await loadOptimizerModule();
    const mediumProfile = [
        ...filaments,
        { id: 'green', color: '#42a85f', td: 1.6 },
        { id: 'yellow', color: '#e7cd38', td: 1.7 },
        { id: 'purple', color: '#7545a8', td: 1.9 },
    ];

    const fast = optimizeFilamentOrder(mediumProfile, context, {
        algorithm: 'fast',
        seed: 7,
        cachingEnabled: false,
    });
    const exhaustive = optimizeFilamentOrder(mediumProfile, context, {
        algorithm: 'exhaustive',
        seed: 7,
        cachingEnabled: false,
    });

    assert.equal(fast.resolvedAlgorithm, 'narrow-beam');
    assert.equal(exhaustive.resolvedAlgorithm, 'exhaustive');
    assert.equal(
        exhaustive.iterations,
        13_699,
        'seven filaments have 13,699 ordered non-empty subsets'
    );
    assert.ok(fast.order.length <= mediumProfile.length);
    assert.equal(new Set(fast.order.map((filament) => filament.id)).size, fast.order.length);
});

test('effort tiers are deterministic and preserve the previous tier best result', async () => {
    const {
        getExactBaseOrderCount,
        normalizeOptimizerTier,
        optimizeFilamentOrder,
    } = await loadOptimizerModule();
    const mediumProfile = [
        ...filaments,
        { id: 'green', color: '#42a85f', td: 1.6 },
        { id: 'yellow', color: '#e7cd38', td: 1.7 },
        { id: 'purple', color: '#7545a8', td: 1.9 },
    ];

    const options = { seed: 7, cachingEnabled: false, maxIterations: 30 };
    const fast = optimizeFilamentOrder(mediumProfile, context, {
        ...options,
        algorithm: 'fast',
    });
    const balanced = optimizeFilamentOrder(mediumProfile, context, {
        ...options,
        algorithm: 'balanced',
    });
    const thorough = optimizeFilamentOrder(mediumProfile, context, {
        ...options,
        algorithm: 'thorough',
    });
    const deep = optimizeFilamentOrder(mediumProfile, context, {
        ...options,
        algorithm: 'deep',
    });
    const exact = optimizeFilamentOrder(mediumProfile, context, {
        ...options,
        algorithm: 'exact',
    });
    const deepAgain = optimizeFilamentOrder(mediumProfile, context, {
        ...options,
        algorithm: 'deep',
    });

    assert.equal(fast.resolvedAlgorithm, 'narrow-beam');
    assert.equal(balanced.resolvedAlgorithm, 'beam');
    assert.equal(thorough.resolvedAlgorithm, 'thorough-hybrid');
    assert.equal(deep.resolvedAlgorithm, 'deep-hybrid');
    assert.equal(exact.resolvedAlgorithm, 'exact-base');
    assert.deepEqual(deepAgain, deep, 'same seed must reproduce the Deep tier');

    const ids = deep.order.map((filament) => filament.id);
    assert.ok(ids.every((id, index) => index === 0 || id !== ids[index - 1]), 'no adjacent duplicates');
    assert.equal(new Set(ids).size, ids.length, 'no repeats without allowRepeatedSwaps');

    assert.ok(
        balanced.score <= fast.score + 1e-9,
        `balanced (${balanced.score}) must not be worse than fast (${fast.score})`
    );
    assert.ok(
        thorough.score <= balanced.score + 1e-9,
        `thorough (${thorough.score}) must not be worse than balanced (${balanced.score})`
    );
    assert.ok(
        deep.score <= thorough.score + 1e-9,
        `deep (${deep.score}) must not be worse than thorough (${thorough.score})`
    );
    assert.ok(
        exact.score <= deep.score + 1e-9,
        `exact (${exact.score}) must not be worse than deep (${deep.score})`
    );

    assert.equal(getExactBaseOrderCount(8), 109_600);
    assert.equal(getExactBaseOrderCount(9), 986_409);
    assert.equal(normalizeOptimizerTier('exhaustive'), 'exact');
    assert.equal(normalizeOptimizerTier('genetic'), 'deep');
});
