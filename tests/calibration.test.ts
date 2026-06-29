import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

type CalibrationModule = typeof import('../src/lib/calibration.ts');
type AutoPaintModule = typeof import('../src/lib/autoPaint.ts');

let calibrationModule: Promise<CalibrationModule> | null = null;
let autoPaintModule: Promise<AutoPaintModule> | null = null;

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

async function loadCalibrationModule(): Promise<CalibrationModule> {
    calibrationModule ??= loadViteModule<CalibrationModule>('/src/lib/calibration.ts');
    return calibrationModule;
}

async function loadAutoPaintModule(): Promise<AutoPaintModule> {
    autoPaintModule ??= loadViteModule<AutoPaintModule>('/src/lib/autoPaint.ts');
    return autoPaintModule;
}

function assertClose(actual: number, expected: number, tolerance: number, message?: string) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        message ?? `expected ${actual} to be within ${tolerance} of ${expected}`
    );
}

test('calibration predictions use Auto-paint’s linear-light transmission model', async () => {
    const calibration = await loadCalibrationModule();
    const autoPaint = await loadAutoPaintModule();
    const halfTransmissionThickness = Math.log10(2);
    const predicted = calibration.predictTransmission(
        '#000000',
        1,
        halfTransmissionThickness,
        [1, 1, 1]
    );
    const autoPaintBlend = autoPaint.blendColors(
        { r: 255, g: 255, b: 255 },
        { r: 0, g: 0, b: 0 },
        1,
        halfTransmissionThickness
    );

    assert.deepEqual(predicted, [188, 188, 188]);
    assert.deepEqual(predicted, [
        Math.round(autoPaintBlend.r),
        Math.round(autoPaintBlend.g),
        Math.round(autoPaintBlend.b),
    ]);
});

test('calibration recovers channel TDs from linear-light patch measurements', async () => {
    const calibration = await loadCalibrationModule();
    const layerHeight = 0.1;
    const filamentColor = '#204080';
    const whiteReference: [number, number, number] = [230, 240, 255];
    const knownTd: [number, number, number] = [1.4, 2, 3.2];
    const measurements = [2, 4, 6, 8, 10].map((layers) => ({
        layers,
        rgb: calibration.predictTransmission(
            filamentColor,
            layers,
            layerHeight,
            knownTd,
            whiteReference
        ),
    }));

    const result = calibration.calculateTDFromMeasurements(
        measurements,
        layerHeight,
        whiteReference,
        filamentColor
    );

    for (let channel = 0; channel < knownTd.length; channel++) {
        assertClose(result.td[channel], knownTd[channel], 0.03);
    }
    assert.ok(result.confidence > 0.7);
});
