import assert from 'node:assert/strict';
import test from 'node:test';

import {
    arePrintSettingsDefault,
    DEFAULT_PRINT_SETTINGS,
    loadPrintSettingsFromStorage,
    savePrintSettingsToStorage,
    PRINT_SETTINGS_STORAGE_KEY,
} from '../src/lib/printSettingsStorage.ts';

test('print settings are default only when Smooth Meshing is also at its default', () => {
    assert.equal(arePrintSettingsDefault({ ...DEFAULT_PRINT_SETTINGS }), true);
    assert.equal(
        arePrintSettingsDefault({
            ...DEFAULT_PRINT_SETTINGS,
            smoothMeshingStrength: 'medium',
        }),
        false
    );
});

test('each numeric print setting participates in the default-state check', () => {
    assert.equal(arePrintSettingsDefault({ ...DEFAULT_PRINT_SETTINGS, layerHeight: 0.08 }), false);
    assert.equal(
        arePrintSettingsDefault({ ...DEFAULT_PRINT_SETTINGS, slicerFirstLayerHeight: 0.4 }),
        false
    );
    assert.equal(arePrintSettingsDefault({ ...DEFAULT_PRINT_SETTINGS, pixelSize: 0.4 }), false);
});

test('saved smoothing strengths round-trip and the old toggle migrates without changing print dimensions', () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            localStorage: {
                getItem: (key: string) => data.get(key) ?? null,
                setItem: (key: string, value: string) => data.set(key, value),
            },
        },
    });
    try {
        for (const smoothMeshingStrength of ['none', 'minimal', 'medium', 'aggressive'] as const) {
            const settings = { ...DEFAULT_PRINT_SETTINGS, smoothMeshingStrength };
            savePrintSettingsToStorage(settings);
            assert.deepEqual(loadPrintSettingsFromStorage(), settings);
            assert.equal(arePrintSettingsDefault(settings), smoothMeshingStrength === 'none');
        }
        for (const smoothMeshing of [true, false]) {
            data.set(
                PRINT_SETTINGS_STORAGE_KEY,
                JSON.stringify({ layerHeight: 0.08, pixelSize: 0.4, smoothMeshing })
            );
            assert.deepEqual(loadPrintSettingsFromStorage(), {
                ...DEFAULT_PRINT_SETTINGS,
                layerHeight: 0.08,
                pixelSize: 0.4,
                smoothMeshingStrength: smoothMeshing ? 'medium' : 'none',
            });
        }
        for (const invalid of [null, 2, 'unknown']) {
            data.set(
                PRINT_SETTINGS_STORAGE_KEY,
                JSON.stringify({ smoothMeshingStrength: invalid })
            );
            assert.equal(loadPrintSettingsFromStorage()?.smoothMeshingStrength, 'none');
        }
        data.set(
            PRINT_SETTINGS_STORAGE_KEY,
            JSON.stringify({ smoothMeshing: true, smoothMeshingStrength: 'none' })
        );
        assert.equal(loadPrintSettingsFromStorage()?.smoothMeshingStrength, 'none');
    } finally {
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    }
});
