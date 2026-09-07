import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage mock for Node.js. Another test file in the same process
// may already have installed one (the property is not configurable), so only
// define it when missing and use whichever mock is active.
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
                for (const k of Object.keys(store)) delete store[k];
            },
        },
    });
}
const mockLocalStorage = (globalThis as { localStorage: Storage }).localStorage;

const { loadCollapsedGroups, isGroupCollapsed, setGroupCollapsed } =
    await import('../src/lib/collapsedGroups.ts');

const KEY = 'kromacut.ui.collapsedGroups.v1';

test('groups default to expanded when nothing is stored', () => {
    mockLocalStorage.clear();
    assert.equal(isGroupCollapsed('quantization'), false);
    assert.deepEqual(loadCollapsedGroups(), {});
});

test('collapsing a group persists it', () => {
    mockLocalStorage.clear();
    setGroupCollapsed('quantization', true);
    assert.equal(isGroupCollapsed('quantization'), true);
    assert.equal(isGroupCollapsed('adjustments'), false);
});

test('expanding a group removes it from storage', () => {
    mockLocalStorage.clear();
    setGroupCollapsed('quantization', true);
    setGroupCollapsed('quantization', false);
    assert.equal(isGroupCollapsed('quantization'), false);
    assert.equal(mockLocalStorage.getItem(KEY), '{}');
});

test('multiple groups persist independently', () => {
    mockLocalStorage.clear();
    setGroupCollapsed('adjustments', true);
    setGroupCollapsed('dedither', true);
    setGroupCollapsed('adjustments', false);
    assert.deepEqual(loadCollapsedGroups(), { dedither: true });
});

test('corrupt stored JSON falls back to expanded', () => {
    mockLocalStorage.clear();
    mockLocalStorage.setItem(KEY, 'not json{');
    assert.deepEqual(loadCollapsedGroups(), {});
    assert.equal(isGroupCollapsed('quantization'), false);
});

test('non-object stored JSON falls back to expanded', () => {
    mockLocalStorage.clear();
    mockLocalStorage.setItem(KEY, '["quantization"]');
    assert.deepEqual(loadCollapsedGroups(), {});
});

test('non-boolean entries are dropped on load', () => {
    mockLocalStorage.clear();
    mockLocalStorage.setItem(KEY, '{"quantization":true,"weird":"yes","n":1}');
    assert.deepEqual(loadCollapsedGroups(), { quantization: true });
});

test('setGroupCollapsed repairs corrupt storage instead of throwing', () => {
    mockLocalStorage.clear();
    mockLocalStorage.setItem(KEY, 'not json{');
    setGroupCollapsed('swatches', true);
    assert.deepEqual(loadCollapsedGroups(), { swatches: true });
});
