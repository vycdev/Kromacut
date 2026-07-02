import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

type CalibrationModule = typeof import('../src/lib/calibration.ts');
type ColorDifferenceModule = typeof import('../src/lib/colorDifference.ts');
type ColorSpaceModule = typeof import('../src/lib/colorSpace.ts');

let calibrationModule: Promise<CalibrationModule> | null = null;
let colorDifferenceModule: Promise<ColorDifferenceModule> | null = null;
let colorSpaceModule: Promise<ColorSpaceModule> | null = null;

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

const loadCalibration = () =>
    (calibrationModule ??= loadViteModule<CalibrationModule>('/src/lib/calibration.ts'));
const loadColorDifference = () =>
    (colorDifferenceModule ??= loadViteModule<ColorDifferenceModule>('/src/lib/colorDifference.ts'));
const loadColorSpace = () =>
    (colorSpaceModule ??= loadViteModule<ColorSpaceModule>('/src/lib/colorSpace.ts'));

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace(/^#/, '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Simulate the physical opacity read for a filament that perfectly follows a
 * single-TD Beer-Lambert model: the smallest integer layer count whose over-black
 * blend is within `jnd` of the opaque filament color. Mirrors what a user would
 * report off the printed wedge.
 */
async function simulateOpacityRead(
    filamentColor: string,
    tdTrue: number,
    layerHeight: number,
    jnd: number,
    maxLayers = 200,
    baseColor = '#000000'
): Promise<number> {
    const { blendSrgbChannel } = await loadColorSpace();
    const { deltaE2000 } = await loadColorDifference();
    const rgb = hexToRgb(filamentColor);
    const base = hexToRgb(baseColor);

    for (let layers = 1; layers <= maxLayers; layers++) {
        const t = Math.pow(10, -(layers * layerHeight) / tdTrue);
        const blended: [number, number, number] = [
            blendSrgbChannel(base[0], rgb[0], t),
            blendSrgbChannel(base[1], rgb[1], t),
            blendSrgbChannel(base[2], rgb[2], t),
        ];
        if (deltaE2000(blended, rgb) <= jnd) return layers;
    }
    return maxLayers;
}

test('solveOpacityTransmission tolerates more background for darker (lower-contrast) colors', async () => {
    const { solveOpacityTransmission, OPACITY_JND } = await loadCalibration();

    const tWhite = solveOpacityTransmission('#ffffff', OPACITY_JND);
    const tDarkGray = solveOpacityTransmission('#282828', OPACITY_JND);

    assert.ok(tWhite !== undefined && tDarkGray !== undefined);
    // A bright color reaches the JND with only a sliver of background; a dark,
    // low-contrast color stays within the JND even with much more black showing.
    assert.ok(tWhite! < tDarkGray!, `expected T*(white)=${tWhite} < T*(darkgray)=${tDarkGray}`);
    assert.ok(tWhite! > 0 && tWhite! < 1);
    assert.ok(tDarkGray! > 0 && tDarkGray! < 1);
});

test('solveOpacityTransmission returns undefined for colors that cannot beat the black base', async () => {
    const { solveOpacityTransmission } = await loadCalibration();
    assert.equal(solveOpacityTransmission('#000000'), undefined);
    assert.equal(solveOpacityTransmission('#020202'), undefined);
});

test('computeFrontlitCalibration recovers the true TD from a synthetic read (round-trip)', async () => {
    const { computeFrontlitCalibration, OPACITY_JND } = await loadCalibration();
    const layerHeight = 0.04;

    const cases: Array<{ color: string; tdTrue: number }> = [
        { color: '#ffd400', tdTrue: 0.5 },
        { color: '#c08040', tdTrue: 0.35 },
        { color: '#3050c0', tdTrue: 0.28 },
        { color: '#a0a0a0', tdTrue: 0.45 },
    ];

    for (const { color, tdTrue } of cases) {
        const opacityLayers = await simulateOpacityRead(color, tdTrue, layerHeight, OPACITY_JND);
        const result = computeFrontlitCalibration({
            filamentColor: color,
            opacityLayers,
            layerHeight,
            firstLayerHeight: 0.2,
        });

        assert.ok(result.ok, `expected ${color} to calibrate`);
        if (!result.ok) return;

        const recovered = result.calibration.tdSingleValue;
        const relError = Math.abs(recovered - tdTrue) / tdTrue;
        // Integer-layer quantization is the only error source; keep well inside it.
        assert.ok(
            relError < 0.2,
            `${color}: recovered TD ${recovered.toFixed(3)} vs true ${tdTrue} (relErr ${(relError * 100).toFixed(1)}%, read ${opacityLayers} layers)`
        );
    }
});

test('computeFrontlitCalibration: more layers to opacity means a larger TD for the same color', async () => {
    const { computeFrontlitCalibration } = await loadCalibration();
    const base = {
        filamentColor: '#3050c0',
        layerHeight: 0.04,
        firstLayerHeight: 0.2,
    };

    const few = computeFrontlitCalibration({ ...base, opacityLayers: 4 });
    const many = computeFrontlitCalibration({ ...base, opacityLayers: 12 });

    assert.ok(few.ok && many.ok);
    if (!few.ok || !many.ok) return;
    assert.ok(
        many.calibration.tdSingleValue > few.calibration.tdSingleValue,
        `expected TD(12 layers) > TD(4 layers)`
    );
});

test('deriveChannelTds anchors the brightest channel and shortens absorptive ones', async () => {
    const { deriveChannelTds } = await loadCalibration();
    const tdSingle = 0.4;

    const red = deriveChannelTds('#ff0000', tdSingle);
    // Red channel governs opacity for a red filament: anchored to the single TD.
    assert.ok(Math.abs(red[0] - tdSingle) < 1e-6, `red anchor ${red[0]} != ${tdSingle}`);
    assert.ok(red[0] > red[1], 'red TD should exceed green TD');
    assert.ok(red[0] > red[2], 'red TD should exceed blue TD');

    // A neutral gray gives three equal channel TDs at the single value.
    const gray = deriveChannelTds('#808080', tdSingle);
    assert.ok(Math.abs(gray[0] - gray[1]) < 1e-6 && Math.abs(gray[1] - gray[2]) < 1e-6);
    assert.ok(Math.abs(gray[0] - tdSingle) < 1e-6);
});

test('a lighter base lets a near-black filament calibrate (round-trip over white)', async () => {
    const { computeFrontlitCalibration, solveOpacityTransmission, OPACITY_JND } =
        await loadCalibration();

    // Black over a black base has no contrast; over white it does.
    assert.equal(solveOpacityTransmission('#000000', OPACITY_JND, '#000000'), undefined);
    const tWhite = solveOpacityTransmission('#000000', OPACITY_JND, '#ffffff');
    assert.ok(tWhite !== undefined && tWhite > 0 && tWhite < 1);

    // Round-trip a dark filament over a white base.
    const color = '#101418';
    const tdTrue = 0.25;
    const layerHeight = 0.04;
    const opacityLayers = await simulateOpacityRead(
        color,
        tdTrue,
        layerHeight,
        OPACITY_JND,
        200,
        '#ffffff'
    );
    const result = computeFrontlitCalibration({
        filamentColor: color,
        opacityLayers,
        layerHeight,
        firstLayerHeight: 0.2,
        baseColor: '#ffffff',
    });
    assert.ok(result.ok, 'dark filament calibrates over a white base');
    if (!result.ok) return;
    assert.equal(result.calibration.baseColor, '#ffffff');
    assert.equal(result.calibration.basis, 'frontlit');
    const relErr = Math.abs(result.calibration.tdSingleValue - tdTrue) / tdTrue;
    assert.ok(relErr < 0.2, `recovered ${result.calibration.tdSingleValue} vs ${tdTrue}`);
});

test('sanitizeFrontlitCalibration accepts only the new frontlit calibration shape', async () => {
    const { computeFrontlitCalibration, sanitizeFrontlitCalibration } = await loadCalibration();
    const result = computeFrontlitCalibration({
        filamentColor: '#ffffff',
        opacityLayers: 6,
        layerHeight: 0.08,
        firstLayerHeight: 0.2,
    });
    assert.ok(result.ok);
    if (!result.ok) return;

    const sanitized = sanitizeFrontlitCalibration(result.calibration);
    assert.ok(sanitized);
    assert.equal(sanitized.basis, 'frontlit');
    assert.deepEqual(sanitized.td, result.calibration.td);
    assert.equal(sanitized.tdSingleValue, result.calibration.tdSingleValue);
    assert.equal(
        sanitizeFrontlitCalibration({
            measurements: [],
            whiteReference: [255, 255, 255],
            td: [2, 3, 4],
            tdSingleValue: 3,
            confidence: 0.9,
            calibrationDate: '2025-01-01T00:00:00.000Z',
        }),
        undefined
    );
    assert.equal(
        sanitizeFrontlitCalibration({
            ...result.calibration,
            basis: 'black-frontlit',
        }),
        undefined
    );
});

test('computeFrontlitCalibration rejects invalid reads and uncalibratable colors', async () => {
    const { computeFrontlitCalibration } = await loadCalibration();

    const badLayers = computeFrontlitCalibration({
        filamentColor: '#3050c0',
        opacityLayers: 0,
        layerHeight: 0.04,
        firstLayerHeight: 0.2,
    });
    assert.equal(badLayers.ok, false);

    const blackFilament = computeFrontlitCalibration({
        filamentColor: '#000000',
        opacityLayers: 5,
        layerHeight: 0.04,
        firstLayerHeight: 0.2,
    });
    assert.equal(blackFilament.ok, false);
});
