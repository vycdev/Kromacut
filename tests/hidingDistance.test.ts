import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

import type { Filament } from '../src/types/index.ts';

type ColorUtilsModule = typeof import('../src/lib/colorUtils.ts');
type CalibrationModule = typeof import('../src/lib/calibration.ts');
type ProfileManagerModule = typeof import('../src/lib/profileManager.ts');

let colorUtilsModule: Promise<ColorUtilsModule> | null = null;
let calibrationModule: Promise<CalibrationModule> | null = null;
let profileManagerModule: Promise<ProfileManagerModule> | null = null;

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

const loadColorUtils = () =>
    (colorUtilsModule ??= loadViteModule<ColorUtilsModule>('/src/lib/colorUtils.ts'));
const loadCalibration = () =>
    (calibrationModule ??= loadViteModule<CalibrationModule>('/src/lib/calibration.ts'));
const loadProfileManager = () =>
    (profileManagerModule ??= loadViteModule<ProfileManagerModule>('/src/lib/profileManager.ts'));

test('estimateHidingDistanceFromColor returns frontlit-scale values', async () => {
    const { estimateHidingDistanceFromColor } = await loadColorUtils();
    // Legacy backlit-TD shape × FRONTLIT_TD_SCALE, rounded to 2 decimals.
    assert.equal(estimateHidingDistanceFromColor('#ffffff'), 0.71);
    assert.equal(estimateHidingDistanceFromColor('#000000'), 0.08);

    for (const hex of ['#ff0000', '#00b8c4', '#808080', '#f7d000']) {
        const hd = estimateHidingDistanceFromColor(hex);
        assert.ok(hd >= 0.06 && hd <= 0.85, `${hex}: ${hd} out of the HD range`);
    }
});

test('channelHds returns measured channels for calibrated filaments', async () => {
    const { channelHds } = await loadCalibration();
    const filament: Filament = {
        id: 'cal',
        color: '#00b8c4',
        td: 0.37,
        calibration: {
            opacityLayers: 5,
            layerHeight: 0.08,
            firstLayerHeight: 0.16,
            td: [0.068, 0.354, 0.373],
            tdSingleValue: 0.373,
            jnd: 2,
            baseColor: '#000000',
            confidence: 0.8,
            basis: 'frontlit',
            calibrationDate: '2026-07-02T00:00:00.000Z',
        },
    };
    assert.deepEqual(channelHds(filament), [0.068, 0.354, 0.373]);
});

test('channelHds derives color-shaped channels for uncalibrated filaments', async () => {
    const { channelHds, deriveChannelTds } = await loadCalibration();
    const filament: Filament = { id: 'uncal', color: '#ff0000', td: 0.4 };
    const channels = channelHds(filament);
    assert.deepEqual(channels, deriveChannelTds('#ff0000', 0.4));
    // Brightest channel anchors at the scalar; dark channels shrink.
    assert.ok(Math.abs(channels[0] - 0.4) < 1e-9, 'red channel anchors the scalar HD');
    assert.ok(channels[1] < channels[0] && channels[2] < channels[0]);
});

test('channelHds ignores invalid calibration shapes and falls back to derivation', async () => {
    const { channelHds, deriveChannelTds } = await loadCalibration();
    const filament = {
        id: 'legacy',
        color: '#ff0000',
        td: 0.4,
        calibration: { measurements: [], td: [2, 3, 4], tdSingleValue: 3 },
    } as unknown as Filament;
    assert.deepEqual(channelHds(filament), deriveChannelTds('#ff0000', 0.4));
});

test('migrateLegacyFilamentTd scales uncalibrated tds and re-syncs calibrated ones', async () => {
    const { migrateLegacyFilamentTd } = await loadProfileManager();
    const { FRONTLIT_TD_SCALE } = await loadCalibration();
    const uncalibrated: Filament = { id: 'a', color: '#ffffff', td: 4.0 };
    assert.ok(Math.abs(migrateLegacyFilamentTd(uncalibrated).td - 4.0 * FRONTLIT_TD_SCALE) < 1e-12);

    const calibrated: Filament = {
        id: 'b',
        color: '#ffffff',
        td: 0.51,
        calibration: {
            opacityLayers: 7,
            layerHeight: 0.08,
            firstLayerHeight: 0.16,
            td: [0.49, 0.51, 0.5],
            tdSingleValue: 0.51,
            jnd: 2,
            baseColor: '#000000',
            confidence: 0.9,
            basis: 'frontlit',
            calibrationDate: '2026-07-02T00:00:00.000Z',
        },
    };
    assert.equal(migrateLegacyFilamentTd(calibrated).td, 0.51);
});
