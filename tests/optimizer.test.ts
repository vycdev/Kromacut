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
    const algorithms = ['exhaustive', 'simulated-annealing', 'genetic', 'auto'] as const;

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
