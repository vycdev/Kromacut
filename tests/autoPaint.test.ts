import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

type AutoPaintModule = typeof import('../src/lib/autoPaint.ts');

const EPSILON = 1e-9;
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

function assertAlmostEqual(actual: number, expected: number, message?: string) {
    assert.ok(
        Math.abs(actual - expected) <= EPSILON,
        message ?? `expected ${actual} to be within ${EPSILON} of ${expected}`
    );
}

test('transition thickness stays printable and respects its TD cap', async () => {
    const { calculateTransitionThickness, hexToRgb } = await loadAutoPaintModule();
    const layerHeight = 0.1;
    const td = 1;
    const thickness = calculateTransitionThickness(
        hexToRgb('#000000'),
        hexToRgb('#ffffff'),
        td,
        layerHeight
    );

    assert.ok(thickness >= layerHeight, 'a transition must contain at least one layer');
    assert.ok(thickness <= td * 0.7 + EPSILON, 'a transition must not exceed the TD cap');

    const nearIdenticalThickness = calculateTransitionThickness(
        hexToRgb('#112233'),
        hexToRgb('#112234'),
        td,
        layerHeight
    );
    assert.equal(
        nearIdenticalThickness,
        layerHeight,
        'near-identical colors should use exactly one layer'
    );
});

test('ideal-height zones include a foundation and remain contiguous when compressed', async () => {
    const { calculateIdealHeight, compressZones } = await loadAutoPaintModule();
    const layerHeight = 0.1;
    const baseThickness = 0.6;
    const { idealHeight, zones } = calculateIdealHeight(
        [
            { id: 'black', color: '#000000', td: 0.5 },
            { id: 'red', color: '#ff0000', td: 0.8 },
            { id: 'white', color: '#ffffff', td: 1.1 },
        ],
        layerHeight,
        baseThickness
    );

    assert.equal(zones.length, 3, 'each filament should produce one zone');
    assertAlmostEqual(
        zones[0].actualThickness,
        Math.max(baseThickness, 0.5 * 1.3),
        'the foundation must be thick enough to be opaque'
    );
    assertAlmostEqual(zones[0].startHeight, 0);
    assertAlmostEqual(zones[zones.length - 1].endHeight, idealHeight);

    const { compressedZones, compressionRatio } = compressZones(zones, idealHeight / 2);
    assertAlmostEqual(compressionRatio, 0.5);
    assert.equal(compressedZones.length, zones.length);
    assertAlmostEqual(
        compressedZones[compressedZones.length - 1].endHeight,
        idealHeight / 2,
        'compressed zones should end exactly at the requested height'
    );

    for (let index = 0; index < compressedZones.length; index++) {
        const zone = compressedZones[index];
        assert.ok(zone.actualThickness > 0, `zone ${index} must have positive thickness`);
        if (index > 0) {
            assertAlmostEqual(
                zone.startHeight,
                compressedZones[index - 1].endHeight,
                `zone ${index} must start where the previous zone ends`
            );
        }
    }

    const noCompression = compressZones(zones, idealHeight + 1);
    assert.equal(noCompression.compressionRatio, 1, 'a sufficiently tall limit should not compress');
    assert.deepEqual(noCompression.compressedZones, zones);
});

test('auto-paint slice data stays synchronized and uses print-layer heights', async () => {
    const { autoPaintToSliceHeights, generateAutoLayers } = await loadAutoPaintModule();
    const layerHeight = 0.1;
    const firstLayerHeight = 0.2;
    const result = generateAutoLayers(
        [
            { id: 'black', color: '#000000', td: 1 },
            { id: 'white', color: '#ffffff', td: 1.5 },
        ],
        [
            { hex: '#000000', count: 10 },
            { hex: '#ffffff', count: 10 },
        ],
        layerHeight,
        firstLayerHeight,
        undefined,
        false
    );
    const slices = autoPaintToSliceHeights(result, layerHeight, firstLayerHeight);

    assert.ok(slices.colorSliceHeights.length > 0, 'a valid stack should produce slices');
    assert.equal(slices.colorSliceHeights[0], firstLayerHeight);
    for (const height of slices.colorSliceHeights.slice(1)) {
        assert.equal(height, layerHeight, 'all later slices should use the configured layer height');
    }
    assert.ok(slices.colorSliceHeights.length <= 500, 'slice output must respect the safety limit');
    assert.equal(slices.virtualSwatches.length, slices.colorSliceHeights.length);
    assert.equal(slices.filamentSwatches.length, slices.colorSliceHeights.length);
    assert.equal(slices.colorOrder.length, slices.colorSliceHeights.length);
    assert.deepEqual(
        slices.colorOrder,
        slices.colorOrder.map((_, index) => index),
        'slice ordering should be sequential'
    );
});

test('auto-paint slice data never returns more than 500 layers', async () => {
    const { autoPaintToSliceHeights } = await loadAutoPaintModule();
    const tallResult = {
        layers: [
            {
                filamentId: 'black',
                filamentColor: '#000000',
                startHeight: 0,
                endHeight: 100,
            },
        ],
        totalHeight: 100,
        idealHeight: 100,
        autoHeight: 100,
        compressionRatio: 1,
        filamentOrder: ['black'],
        transitionZones: [
            {
                filamentId: 'black',
                filamentColor: '#000000',
                filamentTd: 1,
                startHeight: 0,
                endHeight: 100,
                idealThickness: 100,
                actualThickness: 100,
            },
        ],
        confidence: 1,
        confidenceFactors: {
            calibrationQuality: 1,
            filamentCoverage: 1,
            compressionImpact: 1,
        },
    };

    const slices = autoPaintToSliceHeights(tallResult, 0.1, 0.2);
    assert.ok(slices.colorSliceHeights.length <= 500);
    assert.equal(slices.colorSliceHeights.length, 500);
});
