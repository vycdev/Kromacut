import assert from 'node:assert/strict';
import test from 'node:test';

import {
    arePrintSettingsDefault,
    DEFAULT_PRINT_SETTINGS,
} from '../src/lib/printSettingsStorage.ts';

test('print settings are default only when Smooth Meshing is also at its default', () => {
    assert.equal(arePrintSettingsDefault({ ...DEFAULT_PRINT_SETTINGS }), true);
    assert.equal(
        arePrintSettingsDefault({
            ...DEFAULT_PRINT_SETTINGS,
            smoothMeshing: !DEFAULT_PRINT_SETTINGS.smoothMeshing,
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
