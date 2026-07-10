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

const mockLocalStorage = (globalThis as { localStorage: Storage }).localStorage;

const {
    PREVIEW_RENDER_MODE_STORAGE_KEY,
    isPreviewRenderMode,
    loadPreviewRenderMode,
    savePreviewRenderMode,
} = await import('../src/lib/previewPrefs.ts');

test('preview render mode defaults to shaded', () => {
    mockLocalStorage.clear();
    assert.equal(loadPreviewRenderMode(), 'shaded');
});

for (const mode of ['shaded', 'transparent', 'wireframe'] as const) {
    test(`preview render mode persists ${mode}`, () => {
        mockLocalStorage.clear();
        savePreviewRenderMode(mode);
        assert.equal(mockLocalStorage.getItem(PREVIEW_RENDER_MODE_STORAGE_KEY), mode);
        assert.equal(loadPreviewRenderMode(), mode);
    });
}

test('invalid preview render modes fall back to shaded', () => {
    mockLocalStorage.clear();
    mockLocalStorage.setItem(PREVIEW_RENDER_MODE_STORAGE_KEY, 'overlay');
    assert.equal(loadPreviewRenderMode(), 'shaded');
    assert.equal(isPreviewRenderMode('wireframe'), true);
    assert.equal(isPreviewRenderMode('overlay'), false);
});
