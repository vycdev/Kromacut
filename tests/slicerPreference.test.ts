import test from 'node:test';
import assert from 'node:assert/strict';

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
const { SLICER_PREFERENCE_STORAGE_KEY, loadSlicerPreference, saveSlicerPreference } =
    await import('../src/lib/slicerPreference.ts');

const orca = { name: 'Orca Slicer', path: '/Applications/OrcaSlicer.app' };

test('no slicer is saved by default, so Open in Slicer asks', () => {
    storage.clear();
    assert.equal(loadSlicerPreference(), null);
});

test('the system default and specific slicers round-trip', () => {
    storage.clear();
    saveSlicerPreference({ kind: 'system' });
    assert.deepEqual(loadSlicerPreference(), { kind: 'system' });
    assert.deepEqual(JSON.parse(storage.getItem(SLICER_PREFERENCE_STORAGE_KEY)!), {
        kind: 'system',
    });

    saveSlicerPreference({ kind: 'app', app: orca });
    assert.deepEqual(loadSlicerPreference(), { kind: 'app', app: orca });
    assert.deepEqual(JSON.parse(storage.getItem(SLICER_PREFERENCE_STORAGE_KEY)!), {
        kind: 'app',
        app: orca,
    });
});

test('only the slicer name and path are stored', () => {
    storage.clear();
    saveSlicerPreference({ kind: 'app', app: { ...orca, extra: true } as typeof orca });
    assert.deepEqual(JSON.parse(storage.getItem(SLICER_PREFERENCE_STORAGE_KEY)!), {
        kind: 'app',
        app: orca,
    });
});

test('forgetting the slicer removes the stored value', () => {
    storage.clear();
    saveSlicerPreference({ kind: 'app', app: orca });
    saveSlicerPreference(null);
    assert.equal(storage.getItem(SLICER_PREFERENCE_STORAGE_KEY), null);
    assert.equal(loadSlicerPreference(), null);
});

test('unreadable stored values fall back to asking', () => {
    for (const raw of [
        'not json',
        'null',
        '"system"',
        '{}',
        '{"kind":"other"}',
        '{"kind":"app"}',
        '{"kind":"app","app":null}',
        '{"kind":"app","app":{"name":"Orca Slicer"}}',
        '{"kind":"app","app":{"name":"","path":"/Applications/OrcaSlicer.app"}}',
        '{"kind":"app","app":{"name":"Orca Slicer","path":42}}',
    ]) {
        storage.clear();
        storage.setItem(SLICER_PREFERENCE_STORAGE_KEY, raw);
        assert.equal(loadSlicerPreference(), null, raw);
    }
});

test('blocked storage keeps the app working', () => {
    const methods = ['getItem', 'setItem', 'removeItem'] as const;
    const original = methods.map((method) => storage[method]);
    for (const method of methods) {
        storage[method] = () => {
            throw new Error('blocked');
        };
    }
    try {
        assert.equal(loadSlicerPreference(), null);
        assert.doesNotThrow(() => saveSlicerPreference({ kind: 'system' }));
        assert.doesNotThrow(() => saveSlicerPreference(null));
    } finally {
        methods.forEach((method, index) => {
            storage[method] = original[index] as never;
        });
    }
});
