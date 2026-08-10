import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { type TestContext } from 'node:test';
import { createServer } from 'vite';

import {
    autoPaintGoldenScenarios,
    migrateGoldenFixtureFilament,
} from './autoPaintGoldenFixtures.ts';

type AutoPaintModule = typeof import('../src/lib/autoPaint.ts');

interface AutoPaintGolden {
    filamentOrder: string[];
    transitionZones: Array<{
        filamentId: string;
        startHeight: number;
        endHeight: number;
        idealThickness: number;
        actualThickness: number;
    }>;
    totalHeight: number;
    compressionRatio: number;
}

const LAYER_HEIGHT = 0.08;
const FIRST_LAYER_HEIGHT = 0.16;
const EPSILON = 1e-6;
const goldenPath = resolve('tests', 'assets', 'auto-paint-goldens.json');
let autoPaintModule: Promise<AutoPaintModule> | null = null;

async function loadAutoPaintModule(): Promise<AutoPaintModule> {
    autoPaintModule ??= loadViteModule<AutoPaintModule>('/src/lib/autoPaint.ts');
    return autoPaintModule;
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

function snapshot(result: ReturnType<AutoPaintModule['generateAutoLayers']>): AutoPaintGolden {
    return {
        filamentOrder: result.filamentOrder,
        transitionZones: result.transitionZones.map((zone) => ({
            filamentId: zone.filamentId,
            startHeight: zone.startHeight,
            endHeight: zone.endHeight,
            idealThickness: zone.idealThickness,
            actualThickness: zone.actualThickness,
        })),
        totalHeight: result.totalHeight,
        compressionRatio: result.compressionRatio,
    };
}

function assertApproximateGolden(actual: AutoPaintGolden, expected: AutoPaintGolden) {
    assert.deepEqual(actual.filamentOrder, expected.filamentOrder, 'filament order changed');
    assert.equal(actual.transitionZones.length, expected.transitionZones.length, 'zone count changed');
    assert.ok(
        Math.abs(actual.totalHeight - expected.totalHeight) <= EPSILON,
        `total height changed from ${expected.totalHeight} to ${actual.totalHeight}`
    );
    assert.ok(
        Math.abs(actual.compressionRatio - expected.compressionRatio) <= EPSILON,
        `compression ratio changed from ${expected.compressionRatio} to ${actual.compressionRatio}`
    );

    actual.transitionZones.forEach((zone, index) => {
        const expectedZone = expected.transitionZones[index];
        assert.equal(zone.filamentId, expectedZone.filamentId, `zone ${index} filament changed`);

        for (const key of ['startHeight', 'endHeight', 'idealThickness', 'actualThickness'] as const) {
            assert.ok(
                Math.abs(zone[key] - expectedZone[key]) <= EPSILON,
                `zone ${index} ${key} changed from ${expectedZone[key]} to ${zone[key]}`
            );
        }
    });
}

test('golden fixtures migrate hiding distance only across the v1 to v2 boundary', () => {
    const filament = { id: 'fixture', color: '#FFFFFF', td: 5 };
    assert.equal(migrateGoldenFixtureFilament(1, filament).td, 0.5);
    assert.equal(migrateGoldenFixtureFilament(2, filament).td, 5);
    assert.equal(migrateGoldenFixtureFilament(3, filament).td, 5);
});

test('seeded auto-paint stack goldens stay deliberate', async (t: TestContext) => {
    const expected = JSON.parse(readFileSync(goldenPath, 'utf8')) as Record<string, AutoPaintGolden>;
    const scenarios = autoPaintGoldenScenarios();
    assert.deepEqual(Object.keys(expected).sort(), scenarios.map((scenario) => scenario.name).sort());

    const { generateAutoLayers } = await loadAutoPaintModule();
    for (const scenario of scenarios) {
        await t.test(scenario.name, () => {
            const result = generateAutoLayers(
                scenario.filaments,
                scenario.imageSwatches,
                LAYER_HEIGHT,
                FIRST_LAYER_HEIGHT,
                undefined,
                scenario.enhancedColorMatch,
                scenario.allowRepeatedSwaps,
                { algorithm: 'balanced', seed: scenario.seed }
            );

            assertApproximateGolden(snapshot(result), expected[scenario.name]);
        });
    }
});
