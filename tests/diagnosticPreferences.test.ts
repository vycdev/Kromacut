import assert from 'node:assert/strict';
import test from 'node:test';

if (!('localStorage' in globalThis)) {
    const store: Record<string, string> = {};
    Object.defineProperty(globalThis, 'localStorage', {
        value: {
            getItem: (key: string) => store[key] ?? null,
            setItem: (key: string, value: string) => {
                store[key] = value;
            },
            removeItem: (key: string) => {
                delete store[key];
            },
            clear: () => {
                for (const key of Object.keys(store)) delete store[key];
            },
        },
    });
}

const storage = globalThis.localStorage;
const {
    AUTO_PAINT_DIAGNOSTICS_STORAGE_KEY,
    getAutoPaintDiagnosticsEnabled,
    saveAutoPaintDiagnosticsEnabled,
} = await import('../src/lib/diagnosticPreferences.ts');

test('desktop Auto-paint diagnostics default to disabled', () => {
    storage.clear();
    assert.equal(getAutoPaintDiagnosticsEnabled(), false);
});

test('desktop Auto-paint diagnostic preference persists both states', () => {
    storage.clear();
    saveAutoPaintDiagnosticsEnabled(true);
    assert.equal(storage.getItem(AUTO_PAINT_DIAGNOSTICS_STORAGE_KEY), 'true');
    assert.equal(getAutoPaintDiagnosticsEnabled(), true);

    saveAutoPaintDiagnosticsEnabled(false);
    assert.equal(storage.getItem(AUTO_PAINT_DIAGNOSTICS_STORAGE_KEY), 'false');
    assert.equal(getAutoPaintDiagnosticsEnabled(), false);
});

test('invalid diagnostic preference values fail closed', () => {
    storage.clear();
    storage.setItem(AUTO_PAINT_DIAGNOSTICS_STORAGE_KEY, 'enabled');
    assert.equal(getAutoPaintDiagnosticsEnabled(), false);
});
