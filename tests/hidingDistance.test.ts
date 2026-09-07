import assert from 'node:assert/strict';
import test from 'node:test';

import type { Filament } from '../src/types/index.ts';
import { loadViteModule } from './helpers/viteModule.ts';

type ColorUtilsModule = typeof import('../src/lib/colorUtils.ts');
type CalibrationModule = typeof import('../src/lib/calibration.ts');
type FilamentUpdatesModule = typeof import('../src/lib/filamentUpdates.ts');
type ProfileManagerModule = typeof import('../src/lib/profileManager.ts');

let colorUtilsModule: Promise<ColorUtilsModule> | null = null;
let calibrationModule: Promise<CalibrationModule> | null = null;
let filamentUpdatesModule: Promise<FilamentUpdatesModule> | null = null;
let profileManagerModule: Promise<ProfileManagerModule> | null = null;

const loadColorUtils = () =>
    (colorUtilsModule ??= loadViteModule<ColorUtilsModule>('/src/lib/colorUtils.ts'));
const loadCalibration = () =>
    (calibrationModule ??= loadViteModule<CalibrationModule>('/src/lib/calibration.ts'));
const loadFilamentUpdates = () =>
    (filamentUpdatesModule ??= loadViteModule<FilamentUpdatesModule>('/src/lib/filamentUpdates.ts'));
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

test('editing the swatch color deactivates a calibration', async () => {
    const { channelHds, activeFrontlitCalibration, deriveChannelTds } = await loadCalibration();
    const calibration = {
        opacityLayers: 5,
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
        td: [0.068, 0.354, 0.373] as [number, number, number],
        tdSingleValue: 0.373,
        jnd: 2,
        baseColor: '#000000',
        confidence: 0.8,
        basis: 'frontlit' as const,
        calibrationDate: '2026-07-02T00:00:00.000Z',
        filamentColor: '#00b8c4',
    };
    // Same color → calibration active, measured channels used.
    const matched: Filament = { id: 'f', color: '#00b8c4', td: 0.373, calibration };
    assert.ok(activeFrontlitCalibration(matched));
    assert.deepEqual(channelHds(matched), [0.068, 0.354, 0.373]);

    // Color edited → calibration deactivated, falls back to color-derived HDs.
    const edited: Filament = { ...matched, color: '#ff0000' };
    assert.equal(activeFrontlitCalibration(edited), undefined);
    assert.deepEqual(channelHds(edited), deriveChannelTds('#ff0000', 0.373));

    // Reverting the color reactivates the stored calibration (non-destructive).
    const reverted: Filament = { ...edited, color: '#00b8c4' };
    assert.ok(activeFrontlitCalibration(reverted));
    assert.deepEqual(channelHds(reverted), [0.068, 0.354, 0.373]);
});

test('color edits preserve calibration but re-anchor inactive scalar HDs', async () => {
    const { estimateHidingDistanceFromColor } = await loadColorUtils();
    const { colorEditUpdateForFilament } = await loadFilamentUpdates();
    const calibration = {
        opacityLayers: 7,
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
        td: [0.49, 0.51, 0.5] as [number, number, number],
        tdSingleValue: 0.51,
        jnd: 2,
        baseColor: '#000000',
        confidence: 0.9,
        basis: 'frontlit' as const,
        calibrationDate: '2026-07-02T00:00:00.000Z',
        filamentColor: '#ffffff',
    };
    const filament: Filament = {
        id: 'white',
        color: '#ffffff',
        td: 0.51,
        calibration,
    };

    const edited = colorEditUpdateForFilament(filament, '#000000');
    assert.equal(edited.color, '#000000');
    assert.equal(edited.td, estimateHidingDistanceFromColor('#000000'));
    assert.equal('calibration' in edited, false, 'the stored calibration should remain reversible');

    const reverted = colorEditUpdateForFilament(
        { ...filament, color: '#000000', td: edited.td as number },
        '#ffffff'
    );
    assert.equal(reverted.td, calibration.tdSingleValue);
});

test('a calibration without a stored color still applies (legacy compatibility)', async () => {
    const { activeFrontlitCalibration } = await loadCalibration();
    const filament = {
        id: 'legacy',
        color: '#00b8c4',
        td: 0.373,
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
    } as unknown as Filament;
    assert.ok(activeFrontlitCalibration(filament));
});

test('computeFrontlitCalibration stamps the calibrated swatch color', async () => {
    const { computeFrontlitCalibration } = await loadCalibration();
    const result = computeFrontlitCalibration({
        filamentColor: '#ffd400',
        opacityLayers: 6,
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
    });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.calibration.filamentColor, '#ffd400');
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
