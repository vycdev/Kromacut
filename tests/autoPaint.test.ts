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
    const distance = deltaE2000Lab({ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 });

    assert.ok(Math.abs(distance - 2.0425) < 0.0001);
});

test('enhanced matching keeps every color from the processed 2D palette', async () => {
    const { buildOptimizerImageTargets } = await loadAutoPaintModule();
    const targets = buildOptimizerImageTargets([
        { hex: '#ff0000', count: 6 },
        { hex: '#00ff00', count: 3 },
        { hex: '#0000ff', count: 1 },
    ]);

    assert.equal(targets.length, 3, 'the optimizer must not perform a second color reduction');
    assertAlmostEqual(
        targets.reduce((sum, target) => sum + target.weight, 0),
        1
    );
    assertAlmostEqual(targets[0].weight, 0.6);
    assertAlmostEqual(targets[1].weight, 0.3);
    assertAlmostEqual(targets[2].weight, 0.1);
});

test('color separation assigns colliding colors globally instead of greedily', async () => {
    const { mapTargetsWithSeparation } = await loadAutoPaintModule();
    const result = mapTargetsWithSeparation(
        [
            {
                height: 0.16,
                lab: { L: 52, a: 0, b: 0 },
                rgb: { r: 124, g: 124, b: 124 },
            },
            {
                height: 0.24,
                lab: { L: 47, a: 0, b: 0 },
                rgb: { r: 110, g: 110, b: 110 },
            },
        ],
        [
            { L: 50, a: 0, b: 0, weight: 0.9 },
            { L: 54, a: 0, b: 0, weight: 0.1 },
        ]
    );

    assert.equal(result.report.satisfied, true);
    assert.equal(result.report.assignedDistinctColorCount, 2);
    assert.deepEqual(
        result.mappedTargets.map((mapping) => mapping.paletteIndex),
        [1, 0],
        'the dominant target must accept its second-best gray so both targets remain accurate'
    );
});

test('color separation reports distant unique assignments as unsatisfied', async () => {
    const { mapTargetsWithSeparation, SEPARATION_MAX_DELTA_E } = await loadAutoPaintModule();
    const result = mapTargetsWithSeparation(
        [
            {
                height: 0.16,
                lab: { L: 50, a: 0, b: 0 },
                rgb: { r: 119, g: 119, b: 119 },
            },
            {
                height: 0.24,
                lab: { L: 55, a: 0, b: 0 },
                rgb: { r: 132, g: 132, b: 132 },
            },
        ],
        [
            { L: 50, a: 0, b: 0, weight: 0.5 },
            { L: 50, a: 60, b: -50, weight: 0.5 },
        ]
    );

    assert.equal(result.report.satisfied, false);
    assert.equal(result.report.unacceptableColorCount, 1);
    assert.ok(result.report.maximumDeltaE > SEPARATION_MAX_DELTA_E);
});

test('color separation honors a configurable maximum color error', async () => {
    const { mapTargetsWithSeparation, normalizeSeparationMaxDeltaE } = await loadAutoPaintModule();
    const palette = [
        {
            height: 0.16,
            lab: { L: 50, a: 0, b: 0 },
            rgb: { r: 119, g: 119, b: 119 },
        },
        {
            height: 0.24,
            lab: { L: 55, a: 0, b: 0 },
            rgb: { r: 132, g: 132, b: 132 },
        },
    ];
    const targets = [
        { L: 50, a: 0, b: 0, weight: 0.5 },
        { L: 70, a: 0, b: 0, weight: 0.5 },
    ];

    const strict = mapTargetsWithSeparation(palette, targets, 6);
    const permissive = mapTargetsWithSeparation(palette, targets, 20);

    assert.equal(strict.report.satisfied, false);
    assert.equal(strict.report.maximumAllowedDeltaE, 6);
    assert.equal(permissive.report.satisfied, true);
    assert.equal(permissive.report.maximumAllowedDeltaE, 20);
    assert.equal(permissive.report.assignedDistinctColorCount, 2);
    assert.equal(normalizeSeparationMaxDeltaE(undefined), 6);
    assert.equal(normalizeSeparationMaxDeltaE(-5), 1);
    assert.equal(normalizeSeparationMaxDeltaE(30), 30);
    assert.equal(normalizeSeparationMaxDeltaE(200), 100);
    assert.equal(normalizeSeparationMaxDeltaE(8.64), 8.6);
    assert.equal(normalizeSeparationMaxDeltaE(27.2), 27.2);
});

test('color separation refuses to build when distinct acceptable matches are impossible', async () => {
    const { generateAutoLayers } = await loadAutoPaintModule();

    assert.throws(
        () =>
            generateAutoLayers(
                [{ id: 'black', color: '#000000', td: 1 }],
                [
                    { hex: '#000000', count: 1 },
                    { hex: '#ffffff', count: 1 },
                ],
                0.08,
                0.16,
                1,
                true,
                false,
                {
                    algorithm: 'exhaustive',
                    preserveSeparation: true,
                    maxExtraRepeats: 0,
                    cachingEnabled: false,
                }
            ),
        /Could not preserve all 2 image colors within ΔE 6/
    );
});

test('color separation can keep the build and fall back only missed colors', async () => {
    const { generateAutoLayers } = await loadAutoPaintModule();
    const result = generateAutoLayers(
        [{ id: 'black', color: '#000000', td: 1 }],
        [
            { hex: '#000000', count: 1 },
            { hex: '#ffffff', count: 1 },
        ],
        0.08,
        0.16,
        1,
        true,
        false,
        {
            algorithm: 'exhaustive',
            preserveSeparation: true,
            separationMaxDeltaE: 6,
            failOnSeparationError: false,
            maxExtraRepeats: 0,
            cachingEnabled: false,
        }
    );

    assert.equal(result.colorSeparation?.satisfied, false);
    assert.equal(result.colorSeparation?.assignedDistinctColorCount, 1);
    assert.equal(result.colorSeparation?.unacceptableColorCount, 1);
    assert.equal(result.finalStack.settings.failOnSeparationError, false);
    assert.equal(result.finalStack.targetMappings.length, 2);
    assert.equal(
        new Set(result.finalStack.targetMappings.map((mapping) => mapping.paletteIndex)).size,
        1,
        'the missed white target should fall back to the nearest available black prefix'
    );
});

test('color separation returns a verified report without spending the repeat allowance', async () => {
    const { generateAutoLayers } = await loadAutoPaintModule();
    const result = generateAutoLayers(
        [
            { id: 'black', color: '#000000', td: 1 },
            { id: 'white', color: '#ffffff', td: 1 },
        ],
        [{ hex: '#000000', count: 1 }],
        0.08,
        0.16,
        1,
        true,
        true,
        {
            algorithm: 'exact',
            preserveSeparation: true,
            separationMaxDeltaE: 12,
            maxExtraRepeats: 4,
            cachingEnabled: false,
        }
    );

    assert.equal(result.colorSeparation?.satisfied, true);
    assert.equal(result.colorSeparation?.maximumAllowedDeltaE, 12);
    assert.equal(result.colorSeparation?.assignedDistinctColorCount, 1);
    assert.equal(result.optimizerMetadata?.extraRepeatCount, 0);
    assert.equal(result.finalStack.settings.separationMaxDeltaE, 12);
});

test('Dead-on palette anchors win over an earlier uncalibrated color tie', async () => {
    const { mapTargetsToPrintablePalette } = await loadAutoPaintModule();
    const target = { L: 40, a: 12, b: -18, weight: 1 };
    const mapped = mapTargetsToPrintablePalette(
        [
            {
                height: 0.16,
                lab: { L: 40, a: 12, b: -18 },
                rgb: { r: 62, g: 62, b: 96 },
            },
            {
                height: 0.24,
                lab: { L: 45, a: 8, b: -12 },
                rgb: { r: 70, g: 70, b: 105 },
            },
            {
                height: 0.32,
                lab: { L: 40, a: 12, b: -18 },
                rgb: { r: 62, g: 62, b: 96 },
                exactAnchorId: 'dead-on-purple',
                exactAnchorTargetLab: { L: 40, a: 12, b: -18 },
            },
        ],
        [target]
    );

    assert.equal(mapped[0].paletteIndex, 2);
    assert.equal(mapped[0].projectedHeight, 0.32);
});

test('optimizer scoring penalizes dropping a Dead-on suffix for a calibrated target', async () => {
    const { scoreSequenceAgainstImage } = await loadAutoPaintModule();
    const target = { L: 40, a: 12, b: -18, weight: 1 };
    const unanchored = [
        {
            height: 0.16,
            lab: { L: 40, a: 12, b: -18 },
            rgb: { r: 62, g: 62, b: 96 },
        },
    ];
    const anchored = [
        {
            ...unanchored[0],
            height: 0.32,
            exactAnchorId: 'dead-on-purple',
            exactAnchorTargetLab: { L: 40, a: 12, b: -18 },
        },
    ];
    const options = { exactAnchorTargets: [{ L: 40, a: 12, b: -18 }] };

    assert.ok(
        scoreSequenceAgainstImage(unanchored, [target], options) >
            scoreSequenceAgainstImage(anchored, [target], options) + 10
    );
});

test('optimizer scoring applies Palette Proof preferences only near their reviewed target', async () => {
    const { scoreSequenceAgainstImage } = await loadAutoPaintModule();
    const target = { L: 50, a: -30, b: 10, weight: 1 };
    const baseEntry = {
        height: 0.16,
        lab: { L: 50, a: -30, b: 10 },
        rgb: { r: 80, g: 140, b: 100 },
    };
    const preference = {
        targetLab: { L: 50, a: -30, b: 10 },
        confidence: 1,
        evidenceIds: ['green-proof'],
    };
    const supported = [{ ...baseEntry, localPreferences: [{ ...preference, preference: -0.8 }] }];
    const neutral = [baseEntry];
    const rejected = [{ ...baseEntry, localPreferences: [{ ...preference, preference: 0.8 }] }];

    const supportedScore = scoreSequenceAgainstImage(supported, [target]);
    const neutralScore = scoreSequenceAgainstImage(neutral, [target]);
    const rejectedScore = scoreSequenceAgainstImage(rejected, [target]);
    assert.ok(supportedScore < neutralScore);
    assert.ok(rejectedScore > neutralScore);
    assert.ok(rejectedScore - supportedScore > 5);

    const farTarget = { L: 50, a: 60, b: -60, weight: 1 };
    const farNeutralScore = scoreSequenceAgainstImage(neutral, [farTarget]);
    const farRejectedScore = scoreSequenceAgainstImage(rejected, [farTarget]);
    assert.ok(
        Math.abs(farRejectedScore - farNeutralScore) < 0.001,
        'local green evidence should not affect a distant target color'
    );
});

test('transition thickness follows the selected Beer-Lambert opacity endpoint', async () => {
    const { calculateTransitionThickness, hexToRgb } = await loadAutoPaintModule();
    const layerHeight = 0.1;
    const td = 1;
    const compact = calculateTransitionThickness(
        hexToRgb('#000000'),
        hexToRgb('#ffffff'),
        td,
        layerHeight,
        0.8
    );
    const detailed = calculateTransitionThickness(
        hexToRgb('#000000'),
        hexToRgb('#ffffff'),
        td,
        layerHeight,
        0.9
    );
    const maximum = calculateTransitionThickness(
        hexToRgb('#000000'),
        hexToRgb('#ffffff'),
        td,
        layerHeight,
        0.95
    );

    assert.ok(compact >= layerHeight, 'a transition must contain at least one layer');
    assert.ok(compact <= 0.7 * td + EPSILON);
    assert.ok(detailed <= td + EPSILON);
    assert.ok(maximum <= 1.3 * td + EPSILON);
    assert.ok(compact <= detailed && detailed <= maximum, 'detail modes must not shorten the ramp');

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
        'the calibrated transition must respect the default slowest-channel TD cap'
    );
});

test('transition thickness bounds malformed enormous hiding distances', async () => {
    const { calculateTransitionThickness, hexToRgb } = await loadAutoPaintModule();
    const layerHeight = 0.1;
    const thickness = calculateTransitionThickness(
        hexToRgb('#000000'),
        hexToRgb('#ffffff'),
        [1e308, 1e308, 1e308],
        layerHeight
    );
    assert.equal(thickness, layerHeight * 500);
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
                opacityLayers: 6,
                layerHeight: 0.1,
                firstLayerHeight: 0.2,
                td: [0.5, 1, 2] as [number, number, number],
                tdSingleValue: 1,
                jnd: 2,
                baseColor: '#000000',
                confidence: 1,
                basis: 'frontlit' as const,
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

    assert.deepEqual(
        equalChannels,
        scalar,
        'equal channel TDs must preserve legacy scalar blending'
    );
    assert.ok(
        calibrated.r > calibrated.g && calibrated.g > calibrated.b,
        'shorter channel TDs must become opaque sooner'
    );
});

test('legacy photo calibrations are ignored and blend like uncalibrated filaments', async () => {
    const { generateAutoLayers } = await loadAutoPaintModule();
    const filaments = [
        { id: 'black', color: '#000000', td: 1 },
        { id: 'white', color: '#ffffff', td: 16 },
    ];
    const legacyFilaments = [
        filaments[0],
        {
            ...filaments[1],
            calibration: {
                measurements: [{ color: '#ffffff', rgb: [245, 245, 245], thickness: 0.4 }],
                whiteReference: [255, 255, 255],
                td: [8, 16, 32],
                tdSingleValue: 16,
                confidence: 1,
                calibrationDate: '2025-01-01T00:00:00.000Z',
            },
        },
    ] as unknown as Parameters<typeof generateAutoLayers>[0];
    const swatches = [
        { hex: '#000000', count: 1 },
        { hex: '#ffffff', count: 1 },
    ];

    const baseline = generateAutoLayers(filaments, swatches, 0.1, 0.2, undefined, false);
    const legacy = generateAutoLayers(legacyFilaments, swatches, 0.1, 0.2, undefined, false);

    assert.deepEqual(legacy.layers, baseline.layers);
    assert.deepEqual(legacy.transitionZones, baseline.transitionZones);
    assert.equal(legacy.totalHeight, baseline.totalHeight);
    assert.equal(
        legacy.confidenceFactors.calibrationQuality,
        baseline.confidenceFactors.calibrationQuality
    );
});

test('Beer-Lambert blends operate in linear light before returning sRGB', async () => {
    const { blendColors } = await loadAutoPaintModule();
    const halfTransmissionThickness = Math.log10(2);
    const blended = blendColors(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 },
        1,
        halfTransmissionThickness
    );
    const expectedSrgb = 255 * (1.055 * Math.pow(0.5, 1 / 2.4) - 0.055);

    assertAlmostEqual(blended.r, expectedSrgb);
    assertAlmostEqual(blended.g, expectedSrgb);
    assertAlmostEqual(blended.b, expectedSrgb);
    assert.ok(blended.r > 180, 'a 50% linear-light blend must not be gamma-space mid-gray');
});

test('calibrated channel TDs flow through generated auto-paint preview slices', async () => {
    const { autoPaintToSliceHeights, generateAutoLayers, hexToRgb } = await loadAutoPaintModule();
    const baseFilaments = [
        { id: 'black', color: '#000000', td: 1 },
        { id: 'white', color: '#ffffff', td: 4 },
    ];
    const calibratedFilaments = [
        baseFilaments[0],
        {
            ...baseFilaments[1],
            calibration: {
                opacityLayers: 6,
                layerHeight: 0.1,
                firstLayerHeight: 0.2,
                td: [2, 4, 8] as [number, number, number],
                tdSingleValue: 4,
                jnd: 2,
                baseColor: '#000000',
                confidence: 1,
                basis: 'frontlit' as const,
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
    const whiteLayer = calibratedSlices.filamentSwatches.findIndex(
        (swatch) => swatch.hex === '#ffffff'
    );
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
    assert.equal(
        noCompression.compressionRatio,
        1,
        'a sufficiently tall limit should not compress'
    );
    assert.deepEqual(noCompression.compressedZones, zones);
});

test('transition planning carries the actual prior end color into the next zone', async () => {
    const { blendColors, calculateIdealHeight, calculateTransitionThickness, hexToRgb } =
        await loadAutoPaintModule();
    const layerHeight = 0.02;
    const foundation = hexToRgb('#ffffff');
    const middle = hexToRgb('#000000');
    const final = hexToRgb('#666666');
    const middleThickness = calculateTransitionThickness(foundation, middle, 0.1, layerHeight);
    const actualMiddleEnd = blendColors(foundation, middle, 0.1, middleThickness);
    const chainedFinalThickness = calculateTransitionThickness(
        actualMiddleEnd,
        final,
        0.15,
        layerHeight
    );
    const pureMiddleFinalThickness = calculateTransitionThickness(middle, final, 0.15, layerHeight);
    const { zones } = calculateIdealHeight(
        [
            { id: 'foundation', color: '#ffffff', td: 0.1 },
            { id: 'middle', color: '#000000', td: 0.1 },
            { id: 'final', color: '#666666', td: 0.15 },
        ],
        layerHeight,
        layerHeight
    );

    assertAlmostEqual(zones[2].idealThickness, chainedFinalThickness);
    assert.notEqual(
        chainedFinalThickness,
        pureMiddleFinalThickness,
        'the fixture must distinguish chained and pure-filament backgrounds'
    );
});

test('preview slices blend each zone over the actual prior end color', async () => {
    const { autoPaintToSliceHeights, blendColors, hexToRgb, rgbToHex } =
        await loadAutoPaintModule();
    const first = hexToRgb('#ff0000');
    const middle = hexToRgb('#ff8800');
    const final = hexToRgb('#ff0000');
    const middleEnd = blendColors(first, middle, 0.2, 0.1);
    const expectedFinal = rgbToHex(blendColors(middleEnd, final, 0.3, 0.1));
    const pureMiddleFinal = rgbToHex(blendColors(middle, final, 0.3, 0.1));
    const result = {
        layers: [
            { filamentId: 'first', filamentColor: '#ff0000', startHeight: 0, endHeight: 0.1 },
            { filamentId: 'middle', filamentColor: '#ff8800', startHeight: 0.1, endHeight: 0.2 },
            { filamentId: 'final', filamentColor: '#ff0000', startHeight: 0.2, endHeight: 0.3 },
        ],
        totalHeight: 0.3,
        idealHeight: 0.3,
        autoHeight: 0.3,
        compressionRatio: 1,
        filamentOrder: ['first', 'middle', 'final'],
        transitionZones: [
            {
                filamentId: 'first',
                filamentColor: '#ff0000',
                filamentTd: 0.1,
                startHeight: 0,
                endHeight: 0.1,
                idealThickness: 0.1,
                actualThickness: 0.1,
            },
            {
                filamentId: 'middle',
                filamentColor: '#ff8800',
                filamentTd: 0.2,
                startHeight: 0.1,
                endHeight: 0.2,
                idealThickness: 0.1,
                actualThickness: 0.1,
            },
            {
                filamentId: 'final',
                filamentColor: '#ff0000',
                filamentTd: 0.3,
                startHeight: 0.2,
                endHeight: 0.3,
                idealThickness: 0.1,
                actualThickness: 0.1,
            },
        ],
        confidence: 1,
        confidenceFactors: { calibrationQuality: 1, filamentCoverage: 1, compressionImpact: 1 },
    };

    const slices = autoPaintToSliceHeights(result, 0.1, 0.1);
    assert.equal(slices.virtualSwatches.at(-1)?.hex, expectedFinal);
    assert.notEqual(expectedFinal, pureMiddleFinal, 'the fixture must expose chained blending');
});

test('auto-paint slice data stays synchronized and uses print-layer heights', async () => {
    const {
        autoPaintResultMatchesSliceGrid,
        autoPaintToSliceHeights,
        freezeFinalPrintableStackSnapshot,
        generateAutoLayers,
    } = await loadAutoPaintModule();
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

    assert.equal(autoPaintResultMatchesSliceGrid(result, layerHeight, firstLayerHeight), true);
    assert.equal(
        autoPaintResultMatchesSliceGrid(result, layerHeight, firstLayerHeight + layerHeight),
        false,
        'a result built for the previous first-layer height must be treated as stale'
    );

    assert.ok(slices.colorSliceHeights.length > 0, 'a valid stack should produce slices');
    assert.equal(slices.colorSliceHeights[0], firstLayerHeight);
    for (const height of slices.colorSliceHeights.slice(1)) {
        assert.equal(
            height,
            layerHeight,
            'all later slices should use the configured layer height'
        );
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
    assert.equal(result.finalStack.layers.length, slices.colorSliceHeights.length);
    assert.deepEqual(
        result.finalStack.layers.map((layer) => layer.thickness),
        slices.colorSliceHeights
    );
    assert.deepEqual(
        result.finalStack.layers.map((layer) => layer.predictedColor.hex),
        slices.virtualSwatches.map((swatch) => swatch.hex)
    );
    assert.ok(Object.isFrozen(result.finalStack));
    assert.ok(Object.isFrozen(result.finalStack.layers));
    assert.ok(
        result.finalStack.targetMappings.every(
            (mapping) =>
                mapping.paletteIndex >= 0 && mapping.paletteIndex < result.finalStack.palette.length
        )
    );

    const repeated = generateAutoLayers(
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
    assert.equal(repeated.finalStack.fingerprint, result.finalStack.fingerprint);
    assert.equal(
        new Set(result.finalStack.layers.map((layer) => layer.canonicalStackKey)).size,
        result.finalStack.layers.length
    );

    const workerClone = structuredClone(result.finalStack);
    assert.equal(Object.isFrozen(workerClone), false);
    freezeFinalPrintableStackSnapshot(workerClone);
    assert.ok(Object.isFrozen(workerClone));
    assert.ok(Object.isFrozen(workerClone.layers));
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
        (total, height, index) =>
            total + (index === 0 ? Math.max(height, firstLayerHeight) : height),
        0
    );

    assertAlmostEqual(result.totalHeight, 0.3, 'cap should snap down to a valid stack height');
    assertAlmostEqual(
        printedHeight,
        result.totalHeight,
        'reported and printable heights must agree'
    );
    assert.ok(printedHeight <= maxHeight + EPSILON, 'the printed stack must not exceed Max Height');
    assert.equal(
        floorAutoPaintHeightToPrintableStack(0.15, layerHeight, firstLayerHeight),
        0,
        'an impossible cap must not be rounded up past the requested maximum'
    );

    // tds are hiding distances consumed as-is; the optimizer and the preview
    // now share the exact same filament inputs with no internal scaling.
    const palette = buildAchievableColorPalette(
        filaments,
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
    const { autoPaintToSliceHeights, generateAutoLayers, hexToRgb } = await loadAutoPaintModule();
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
        result.filamentOrder.every(
            (id, index) => index === 0 || id !== result.filamentOrder[index - 1]
        ),
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

test('auto-paint confidence scores only the printed optimized sequence', async () => {
    const { generateAutoLayers } = await loadAutoPaintModule();
    const calibratedWhite = {
        id: 'white',
        color: '#ffffff',
        td: 0.51,
        calibration: {
            opacityLayers: 7,
            layerHeight: 0.08,
            firstLayerHeight: 0.16,
            td: [0.49, 0.51, 0.5] as [number, number, number],
            tdSingleValue: 0.51,
            jnd: 2,
            baseColor: '#000000',
            confidence: 1,
            basis: 'frontlit' as const,
            calibrationDate: new Date().toISOString(),
            filamentColor: '#ffffff',
        },
    };
    const unusedNearWhite = { id: 'near-white', color: '#fefefe', td: 0.5 };

    const result = generateAutoLayers(
        [calibratedWhite, unusedNearWhite],
        [{ hex: '#ffffff', count: 100 }],
        0.08,
        0.16,
        undefined,
        true,
        false,
        { algorithm: 'exhaustive', seed: 9 }
    );

    assert.deepEqual(result.filamentOrder, ['white']);
    assert.equal(result.confidenceFactors.calibrationQuality, 1);
    assert.equal(result.confidenceFactors.filamentCoverage, 0.5);
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

test('calibrated profiles produce identical output across the hiding-distance migration', async () => {
    // Baseline captured immediately before the schema-v2 (hiding distance)
    // migration with the same inputs: the calibrated path must be unaffected
    // by removing the runtime frontlit scaling.
    const { generateAutoLayers } = await loadAutoPaintModule();
    const { readFileSync } = await import('node:fs');
    const profile = JSON.parse(
        readFileSync(
            resolve(process.cwd(), 'tests/assets/filament-profiles/8_Colors_Calibrated_New.kfil'),
            'utf8'
        )
    ) as { filaments: Array<{ id: string; color: string; td: number }> };
    const baseline = JSON.parse(
        readFileSync(
            resolve(process.cwd(), 'tests/assets/autopaint-calibrated-baseline.json'),
            'utf8'
        )
    );
    const swatches = [
        { hex: '#000000', count: 120 },
        { hex: '#ffffff', count: 80 },
        { hex: '#d83400', count: 60 },
        { hex: '#00b8c4', count: 50 },
        { hex: '#6300c5', count: 40 },
        { hex: '#f7d000', count: 30 },
    ];
    const normalize = (result: {
        totalHeight: number;
        idealHeight: number;
        filamentOrder: string[];
        layers: unknown[];
    }) =>
        JSON.parse(
            JSON.stringify({
                totalHeight: result.totalHeight,
                idealHeight: result.idealHeight,
                filamentOrder: result.filamentOrder,
                layers: result.layers,
            })
        );

    const standard = generateAutoLayers(profile.filaments, swatches, 0.08, 0.16, undefined, false);
    assert.deepEqual(normalize(standard), baseline.standard);

    const enhanced = generateAutoLayers(
        profile.filaments,
        swatches,
        0.08,
        0.16,
        undefined,
        true,
        false,
        {
            algorithm: 'fast',
            seed: 42,
        }
    );
    assert.deepEqual(normalize(enhanced), baseline.enhancedFast);
});

test('a fitted appearance model changes preview colors without changing physical layers', async () => {
    const { autoPaintToSliceHeights, generateAutoLayers } = await loadAutoPaintModule();
    const filaments = [
        { id: 'black', color: '#101010', td: 0.2 },
        { id: 'red', color: '#d3422e', td: 0.35 },
        { id: 'white', color: '#f4f4f4', td: 0.5 },
    ];
    const swatches = [
        { hex: '#331a18', count: 20 },
        { hex: '#b35a4c', count: 40 },
        { hex: '#eeeeee', count: 10 },
    ];
    const baseline = generateAutoLayers(filaments, swatches, 0.08, 0.16);
    const appearanceModel = {
        ...baseline.finalStack.appearanceModel,
        fingerprint: 'fitted-preview-test',
        applied: true,
        gateReason: 'applied' as const,
        deltaL: 4,
        confidence: 0.8,
        observationCount: 20,
        trainingObservationCount: 16,
        trainingDistinctStackCount: 8,
        distinctStackCount: 10,
        heldOutCount: 4,
        heldOutDistinctStackCount: 4,
        baselineAgreement: 0.5,
        fittedAgreement: 0.8,
    };
    const corrected = generateAutoLayers(
        filaments,
        swatches,
        0.08,
        0.16,
        undefined,
        false,
        false,
        undefined,
        appearanceModel
    );

    assert.deepEqual(corrected.layers, baseline.layers);
    assert.deepEqual(
        corrected.finalStack.layers.map((layer) => layer.filamentColor),
        baseline.finalStack.layers.map((layer) => layer.filamentColor)
    );
    assert.deepEqual(
        corrected.finalStack.layers.map((layer) => layer.basePredictedColor),
        baseline.finalStack.layers.map((layer) => layer.basePredictedColor)
    );
    assert.notDeepEqual(
        corrected.finalStack.layers.map((layer) => layer.predictedColor),
        baseline.finalStack.layers.map((layer) => layer.predictedColor)
    );
    assert.ok(corrected.finalStack.layers.every((layer) => layer.appearanceStatus === 'fitted'));
    assert.notDeepEqual(
        autoPaintToSliceHeights(corrected, 0.08, 0.16).virtualSwatches,
        autoPaintToSliceHeights(baseline, 0.08, 0.16).virtualSwatches
    );
});

test('matrix-fitted optics drive the same optimizer palette and final preview while retaining physical filament colors', async () => {
    const { buildAchievableColorPalette, generateAutoLayers, rgbToHex } =
        await loadAutoPaintModule();
    const filaments = [
        { id: 'black', color: '#16191d', td: 0.24 },
        { id: 'green', color: '#278a52', td: 0.39 },
        { id: 'white', color: '#f1eee7', td: 0.56 },
    ];
    const swatches = [
        { hex: '#202820', count: 20 },
        { hex: '#739b78', count: 40 },
        { hex: '#e9e4db', count: 10 },
    ];
    const baseline = generateAutoLayers(filaments, swatches, 0.08, 0.16);
    const effectiveOptics = {
        schemaVersion: 1 as const,
        modelVersion: 'matrix-effective-optics-v1' as const,
        fingerprint: 'effective-optics-preview-test',
        applied: true,
        gateReason: 'applied' as const,
        matrixCount: 1,
        sampleCount: 64,
        baselineMeanDeltaE: 14,
        fittedMeanDeltaE: 4,
        confidence: 0.9,
        filaments: [
            {
                filamentId: 'black',
                priorHdChannels: [0.24, 0.24, 0.24] as const,
                effectiveHdChannels: [0.2, 0.27, 0.3] as const,
                priorOpaqueColor: [22, 25, 29] as const,
                effectiveOpaqueColor: [18, 23, 30] as const,
                transmissionExponent: 1.15,
                sampleCount: 64,
            },
            {
                filamentId: 'green',
                priorHdChannels: [0.39, 0.39, 0.39] as const,
                effectiveHdChannels: [0.46, 0.34, 0.41] as const,
                priorOpaqueColor: [39, 138, 82] as const,
                effectiveOpaqueColor: [34, 128, 75] as const,
                transmissionExponent: 0.82,
                sampleCount: 64,
            },
            {
                filamentId: 'white',
                priorHdChannels: [0.56, 0.56, 0.56] as const,
                effectiveHdChannels: [0.62, 0.53, 0.48] as const,
                priorOpaqueColor: [241, 238, 231] as const,
                effectiveOpaqueColor: [235, 231, 222] as const,
                transmissionExponent: 1.3,
                sampleCount: 64,
            },
        ],
        substrateInteractions: [
            {
                foregroundFilamentId: 'green',
                substrateFilamentId: 'black',
                hdMultiplier: 1.24,
                sampleCount: 20,
            },
            {
                foregroundFilamentId: 'white',
                substrateFilamentId: 'green',
                hdMultiplier: 0.76,
                sampleCount: 20,
            },
        ],
    };
    const appearanceModel = {
        ...baseline.finalStack.appearanceModel,
        fingerprint: 'matrix-physical-preview-test',
        effectiveOptics,
    };
    const corrected = generateAutoLayers(
        filaments,
        swatches,
        0.08,
        0.16,
        undefined,
        false,
        false,
        undefined,
        appearanceModel
    );
    const optimizerPalette = buildAchievableColorPalette(
        corrected.filamentOrder.map((id) => filaments.find((filament) => filament.id === id)!),
        0.08,
        0.16,
        undefined,
        undefined,
        undefined,
        appearanceModel
    );

    assert.equal(corrected.finalStack.modelVersion, 'rgb-effective-optics-v2');
    assert.notDeepEqual(
        corrected.finalStack.layers.map((layer) => layer.basePredictedColor),
        baseline.finalStack.layers.map((layer) => layer.basePredictedColor)
    );
    assert.deepEqual(
        optimizerPalette.map((entry) => [entry.height, rgbToHex(entry.rgb)]),
        corrected.finalStack.palette.map((entry) => [entry.height, entry.predictedColor.hex]),
        'search and rendering must consume the same fitted physical model'
    );
    const physicalColors = new Map(filaments.map((filament) => [filament.id, filament.color]));
    assert.ok(
        corrected.finalStack.layers.every(
            (layer) => layer.filamentColor === physicalColors.get(layer.filamentId)
        ),
        'the physical material colors must not be replaced by fitted display colors'
    );
    assert.ok(
        corrected.finalStack.zones.some(
            (zone) =>
                zone.transmissionExponent !== 1 ||
                (zone.substrateHdMultiplier !== undefined && zone.substrateHdMultiplier !== 1)
        )
    );
});

test('a local Palette Proof correction changes optimizer and preview colors without changing layers', async () => {
    const { autoPaintToSliceHeights, buildAchievableColorPalette, generateAutoLayers } =
        await loadAutoPaintModule();
    const filaments = [
        { id: 'black', color: '#101010', td: 0.2 },
        { id: 'green', color: '#178341', td: 0.35 },
        { id: 'white', color: '#f4f4f4', td: 0.5 },
    ];
    const swatches = [
        { hex: '#20352a', count: 20 },
        { hex: '#788878', count: 40 },
        { hex: '#e4e4e4', count: 10 },
    ];
    const baseline = generateAutoLayers(filaments, swatches, 0.08, 0.16);
    const sourceLayer = baseline.finalStack.layers.at(-1)!;
    const sourceIndex = sourceLayer.index;
    const suffixLayers = baseline.finalStack.layers
        .slice(Math.max(0, sourceIndex + 1 - 8), sourceIndex + 1)
        .map((layer) => ({
            filamentId: layer.filamentId,
            filamentColor: layer.filamentColor,
            thickness: layer.thickness,
        }));
    const targetLab = [
        Math.min(95, sourceLayer.basePredictedLab[0] + 8),
        sourceLayer.basePredictedLab[1] + 4,
        sourceLayer.basePredictedLab[2] - 5,
    ] as const;
    const appearanceModel = {
        ...baseline.finalStack.appearanceModel,
        fingerprint: 'local-proof-preview-test',
        localEvidence: [
            {
                id: 'local-green-close',
                proofIds: ['proof-green'],
                judgmentIds: ['judgment-green'],
                sourceStackKey: sourceLayer.canonicalStackKey,
                baseLab: sourceLayer.basePredictedLab,
                targetLab,
                suffixLayers,
                observedAt: '2026-08-16T12:00:00.000Z',
                winnerCount: 1,
                loserCount: 0,
                noneCount: 0,
                tieWinnerCount: 0,
                supportWeight: 0.8,
                rejectionWeight: 0,
                preference: -0.44,
                confidence: 0.8,
                correctionTargetLab: targetLab,
                correctionStrength: 0.65,
            },
        ],
    };
    const corrected = generateAutoLayers(
        filaments,
        swatches,
        0.08,
        0.16,
        undefined,
        false,
        false,
        undefined,
        appearanceModel
    );

    assert.deepEqual(corrected.layers, baseline.layers);
    assert.deepEqual(
        corrected.finalStack.layers.map((layer) => [
            layer.filamentId,
            layer.startHeight,
            layer.endHeight,
        ]),
        baseline.finalStack.layers.map((layer) => [
            layer.filamentId,
            layer.startHeight,
            layer.endHeight,
        ])
    );
    assert.notDeepEqual(
        corrected.finalStack.layers.map((layer) => layer.predictedColor),
        baseline.finalStack.layers.map((layer) => layer.predictedColor)
    );
    assert.ok(
        corrected.finalStack.layers.some(
            (layer) =>
                layer.appearanceStatus === 'locally-fitted' &&
                layer.localEvidenceIds?.includes('local-green-close')
        )
    );
    assert.notDeepEqual(
        autoPaintToSliceHeights(corrected, 0.08, 0.16).virtualSwatches,
        autoPaintToSliceHeights(baseline, 0.08, 0.16).virtualSwatches
    );

    const optimizerPalette = buildAchievableColorPalette(
        corrected.filamentOrder.map((id) => filaments.find((filament) => filament.id === id)!),
        0.08,
        0.16,
        undefined,
        undefined,
        undefined,
        appearanceModel
    );
    assert.ok(
        optimizerPalette.some(
            (entry) =>
                entry.localEvidenceIds?.includes('local-green-close') &&
                entry.localPreferences?.some((preference) => preference.preference < 0)
        ),
        'the optimizer palette must consume the same local evidence as the preview'
    );
});

test('an empirical Stack Matrix recipe drives the final preview without changing physical layers', async () => {
    const { autoPaintToSliceHeights, buildAchievableColorPalette, generateAutoLayers } =
        await loadAutoPaintModule();
    const filaments = [
        { id: 'black', color: '#101010', td: 0.2 },
        { id: 'green', color: '#178341', td: 0.35 },
        { id: 'pink', color: '#e58fa8', td: 0.5 },
    ];
    const swatches = [
        { hex: '#20352a', count: 20 },
        { hex: '#788878', count: 40 },
        { hex: '#e4c5ce', count: 10 },
    ];
    const baseline = generateAutoLayers(filaments, swatches, 0.08, 0.16);
    const sampleLayerIndex = baseline.finalStack.layers.findIndex(
        (_, index, layers) =>
            index >= 3 &&
            layers.slice(index - 2, index + 1).every((layer) => layer.thickness === 0.08)
    );
    assert.ok(sampleLayerIndex >= 3);
    const sampleLayer = baseline.finalStack.layers[sampleLayerIndex];
    const recipeLayers = baseline.finalStack.layers.slice(
        sampleLayerIndex - 2,
        sampleLayerIndex + 1
    );
    const measuredLab = [72, -38, 24] as const;
    const anchorId = 'matrix-empirical-sample';
    const empiricalModel = {
        ...baseline.finalStack.appearanceModel,
        fingerprint: 'empirical-preview-test',
        exactAnchors: [
            {
                id: anchorId,
                proofId: 'matrix-proof',
                source: 'stack-matrix' as const,
                sourceStackKey: sampleLayer.canonicalStackKey,
                targetLab: measuredLab,
                suffixLayers: recipeLayers.map((layer) => ({
                    filamentId: layer.filamentId,
                    filamentColor: layer.filamentColor,
                    thickness: layer.thickness,
                })),
                maxSubstrateTransmission: 0,
            },
        ],
        empiricalLuts: [
            {
                id: 'empirical-lut:matrix-proof',
                sourceMatrixId: 'matrix-proof',
                observedAt: '2026-08-14T12:00:00.000Z',
                layerHeight: 0.08,
                stackLayerCount: 3,
                backingFilamentId: 'black',
                filamentIds: filaments.map((filament) => filament.id),
                alignmentWeight: 1,
                coverageWeight: 1,
                recencyWeight: 1,
                agreementWeight: 1,
                matrixWeight: 1,
                coverageRadius: 10,
                samples: [
                    {
                        id: anchorId,
                        sourceStackKey: sampleLayer.canonicalStackKey,
                        recipeFilamentIds: recipeLayers.map((layer) => layer.filamentId),
                        predictedLab: sampleLayer.basePredictedLab,
                        measuredLab,
                        confidence: 0.95,
                        exactAnchorId: anchorId,
                    },
                ],
            },
        ],
    };
    const corrected = generateAutoLayers(
        filaments,
        swatches,
        0.08,
        0.16,
        undefined,
        false,
        false,
        undefined,
        empiricalModel
    );
    const correctedLayer = corrected.finalStack.layers[sampleLayerIndex];
    const optimizerPalette = buildAchievableColorPalette(
        filaments,
        0.08,
        0.16,
        undefined,
        undefined,
        undefined,
        empiricalModel
    );
    const optimizerEntry = optimizerPalette.find(
        (entry) => Math.abs(entry.height - correctedLayer.endHeight) < 1e-9
    );

    assert.deepEqual(corrected.layers, baseline.layers);
    assert.deepEqual(correctedLayer.predictedLab, measuredLab);
    assert.notDeepEqual(correctedLayer.predictedColor, sampleLayer.predictedColor);
    assert.equal(correctedLayer.appearanceStatus, 'anchored');
    assert.equal(correctedLayer.empiricalLutId, 'empirical-lut:matrix-proof');
    assert.deepEqual(correctedLayer.empiricalSampleIds, [anchorId]);
    assert.deepEqual(optimizerEntry?.lab, {
        L: measuredLab[0],
        a: measuredLab[1],
        b: measuredLab[2],
    });
    assert.notDeepEqual(
        autoPaintToSliceHeights(corrected, 0.08, 0.16).virtualSwatches,
        autoPaintToSliceHeights(baseline, 0.08, 0.16).virtualSwatches
    );
});
