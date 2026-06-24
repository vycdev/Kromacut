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

test('CIEDE2000 distance matches the published reference pair', async () => {
    const { deltaE2000Lab } = await loadAutoPaintModule();
    const distance = deltaE2000Lab(
        { L: 50, a: 2.6772, b: -79.7751 },
        { L: 50, a: 0, b: -82.7485 }
    );

    assert.ok(Math.abs(distance - 2.0425) < 0.0001);
});

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

test('calibrated channel TDs determine transition thickness', async () => {
    const { calculateTransitionThickness, hexToRgb } = await loadAutoPaintModule();
    const layerHeight = 0.1;
    const scalarThickness = calculateTransitionThickness(
        hexToRgb('#000000'),
        hexToRgb('#ffffff'),
        1,
        layerHeight
    );
    const calibratedThickness = calculateTransitionThickness(
        hexToRgb('#000000'),
        hexToRgb('#ffffff'),
        [0.5, 1, 2],
        layerHeight
    );

    assert.ok(
        calibratedThickness > scalarThickness,
        'the slowest calibrated channel must be allowed more transition thickness'
    );
    assert.ok(
        calibratedThickness <= 2 * 0.7 + EPSILON,
        'the calibrated transition must respect the slowest-channel TD cap'
    );
});

test('transition-thickness cache distinguishes calibrated channel TDs', async () => {
    const { calculateIdealHeight } = await loadAutoPaintModule();
    const cache = new Map<string, number>();
    const baseStack = [
        { id: 'black', color: '#000000', td: 0.2 },
        { id: 'white', color: '#ffffff', td: 1 },
    ];
    const calibratedStack = [
        baseStack[0],
        {
            ...baseStack[1],
            calibration: {
                color: '#ffffff',
                measurements: [],
                td: [0.5, 1, 2] as [number, number, number],
                tdSingleValue: 1,
                confidence: 1,
                calibrationDate: '2026-01-01T00:00:00.000Z',
            },
        },
    ];

    const scalar = calculateIdealHeight(baseStack, 0.1, 0.2, cache);
    const calibrated = calculateIdealHeight(calibratedStack, 0.1, 0.2, cache);

    assert.ok(
        calibrated.zones[1].idealThickness > scalar.zones[1].idealThickness,
        'a calibrated transition must not reuse a scalar-TD cache entry'
    );
    assert.equal(cache.size, 2, 'scalar and calibrated transition calculations need distinct keys');
});

test('calibrated per-channel TDs tint blends without changing scalar TD behavior', async () => {
    const { blendColors } = await loadAutoPaintModule();
    const background = { r: 0, g: 0, b: 0 };
    const filament = { r: 200, g: 200, b: 200 };

    const scalar = blendColors(background, filament, 1, 0.25);
    const equalChannels = blendColors(background, filament, [1, 1, 1], 0.25);
    const calibrated = blendColors(background, filament, [0.5, 1, 2], 0.25);

    assert.deepEqual(equalChannels, scalar, 'equal channel TDs must preserve legacy scalar blending');
    assert.ok(
        calibrated.r > calibrated.g && calibrated.g > calibrated.b,
        'shorter channel TDs must become opaque sooner'
    );
});

test('calibrated channel TDs flow through generated auto-paint preview slices', async () => {
    const { autoPaintToSliceHeights, generateAutoLayers, hexToRgb } =
        await loadAutoPaintModule();
    const baseFilaments = [
        { id: 'black', color: '#000000', td: 1 },
        { id: 'white', color: '#ffffff', td: 16 },
    ];
    const calibratedFilaments = [
        baseFilaments[0],
        {
            ...baseFilaments[1],
            calibration: {
                color: '#ffffff',
                measurements: [],
                td: [8, 16, 32] as [number, number, number],
                tdSingleValue: 16,
                confidence: 1,
                calibrationDate: '2026-01-01T00:00:00.000Z',
            },
        },
    ];
    const swatches = [
        { hex: '#000000', count: 1 },
        { hex: '#ffffff', count: 1 },
    ];
    const scalarResult = generateAutoLayers(baseFilaments, swatches, 0.1, 0.2, undefined, false);
    const calibratedResult = generateAutoLayers(
        calibratedFilaments,
        swatches,
        0.1,
        0.2,
        undefined,
        false
    );
    const scalarSlices = autoPaintToSliceHeights(scalarResult, 0.1, 0.2);
    const calibratedSlices = autoPaintToSliceHeights(calibratedResult, 0.1, 0.2);

    assert.ok(
        calibratedResult.transitionZones[1].idealThickness >
            scalarResult.transitionZones[1].idealThickness,
        'calibrated channel TDs must change the planned transition thickness'
    );
    assert.ok(
        calibratedSlices.colorSliceHeights.length > scalarSlices.colorSliceHeights.length,
        'the preview must contain the additional calibrated transition layers'
    );
    const whiteLayer = calibratedSlices.filamentSwatches.findIndex((swatch) => swatch.hex === '#ffffff');
    assert.ok(whiteLayer >= 0, 'the calibrated filament should contribute preview layers');

    const scalarColor = hexToRgb(scalarSlices.virtualSwatches[whiteLayer].hex);
    const calibratedColor = hexToRgb(calibratedSlices.virtualSwatches[whiteLayer].hex);
    assert.equal(scalarColor.r, scalarColor.g, 'the scalar white blend remains neutral');
    assert.equal(scalarColor.g, scalarColor.b, 'the scalar white blend remains neutral');
    assert.notEqual(
        calibratedColor.r,
        calibratedColor.b,
        'calibrated channel TDs produce their measured color bias'
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

test('auto-paint caps and optimizer palettes use the same discrete printable stack', async () => {
    const {
        autoPaintToSliceHeights,
        buildAchievableColorPalette,
        floorAutoPaintHeightToPrintableStack,
        generateAutoLayers,
        rgbToHex,
    } = await loadAutoPaintModule();
    const layerHeight = 0.1;
    const firstLayerHeight = 0.2;
    const maxHeight = 0.35;
    const filaments = [
        { id: 'black', color: '#000000', td: 1 },
        { id: 'white', color: '#ffffff', td: 1.5 },
    ];
    const swatches = [
        { hex: '#000000', count: 10 },
        { hex: '#ffffff', count: 10 },
    ];

    const result = generateAutoLayers(
        filaments,
        swatches,
        layerHeight,
        firstLayerHeight,
        maxHeight,
        false
    );
    const slices = autoPaintToSliceHeights(result, layerHeight, firstLayerHeight);
    const printedHeight = slices.colorSliceHeights.reduce(
        (total, height, index) => total + (index === 0 ? Math.max(height, firstLayerHeight) : height),
        0
    );

    assertAlmostEqual(result.totalHeight, 0.3, 'cap should snap down to a valid stack height');
    assertAlmostEqual(printedHeight, result.totalHeight, 'reported and printable heights must agree');
    assert.ok(printedHeight <= maxHeight + EPSILON, 'the printed stack must not exceed Max Height');
    assert.equal(
        floorAutoPaintHeightToPrintableStack(0.15, layerHeight, firstLayerHeight),
        0,
        'an impossible cap must not be rounded up past the requested maximum'
    );

    const palette = buildAchievableColorPalette(
        filaments.map((filament) => ({ ...filament, td: filament.td * 0.1 })),
        layerHeight,
        firstLayerHeight,
        maxHeight
    );
    assert.deepEqual(
        palette.map((entry) => entry.height),
        slices.colorSliceHeights.reduce<number[]>((heights, thickness) => {
            heights.push(Number(((heights.at(-1) ?? 0) + thickness).toFixed(8)));
            return heights;
        }, []),
        'the optimizer palette must sample the same layer tops as the preview'
    );
    assert.deepEqual(
        palette.map((entry) => rgbToHex(entry.rgb)),
        slices.virtualSwatches.map((swatch) => swatch.hex),
        'the optimizer palette must use the preview-visible layer colors'
    );
});

test('enhanced repeated-swap search keeps the printable red-to-pink transition', async () => {
    const { autoPaintToSliceHeights, generateAutoLayers, hexToRgb } =
        await loadAutoPaintModule();
    const layerHeight = 0.08;
    const firstLayerHeight = 0.16;
    const result = generateAutoLayers(
        [
            { id: 'red', color: '#ff0000', td: 1.2 },
            { id: 'white', color: '#ffffff', td: 1.2 },
        ],
        [
            { hex: '#ff0000', count: 20 },
            { hex: '#ff8080', count: 80 },
        ],
        layerHeight,
        firstLayerHeight,
        undefined,
        true,
        true,
        { algorithm: 'exhaustive', seed: 4 }
    );
    const slices = autoPaintToSliceHeights(result, layerHeight, firstLayerHeight);

    assert.ok(
        result.filamentOrder.includes('red') && result.filamentOrder.includes('white'),
        'the optimized stack should include red under white'
    );
    assert.ok(
        result.filamentOrder.every((id, index) => index === 0 || id !== result.filamentOrder[index - 1]),
        'the optimizer must never emit adjacent duplicate swaps'
    );
    assert.ok(
        slices.virtualSwatches.some((swatch) => {
            const { r, g, b } = hexToRgb(swatch.hex);
            return r > 180 && g > 40 && g < 220 && b > 40 && b < 220;
        }),
        'a thin white transition over red should produce a pink printable swatch'
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
