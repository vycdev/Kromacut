import test from 'node:test';
import assert from 'node:assert/strict';

import {
    clonePalette,
    createCustomPalette,
    customPaletteFileName,
    enabledColors,
    importCustomPalettes,
    loadCustomPalettes,
    normalizeColorNames,
    normalizeDisabledColors,
    saveCustomPalettes,
    updateCustomPalette,
} from '../src/lib/paletteManager.ts';
import { toHex6 } from '../src/lib/colorUtils.ts';
import { deduplicateName } from '../src/lib/nameUtils.ts';
import type { CustomPalette } from '../src/types/index.ts';

function makePalette(overrides: Partial<CustomPalette> = {}): CustomPalette {
    return {
        id: 'palette-1',
        name: 'Test Palette',
        version: 2,
        colors: ['#FF0000', '#00FF00', '#0000FF'],
        createdAt: 1,
        updatedAt: 1,
        ...overrides,
    };
}

test('custom palette exports use kpal filenames', () => {
    assert.equal(customPaletteFileName('My Palette!'), 'My_Palette_.kpal');
});

/** Run fn with isolated palette storage, reusing a shared test stub when one is installed. */
function withMemoryStorage(fn: (storage: Pick<Storage, 'getItem' | 'setItem'>) => void) {
    const original = Reflect.get(globalThis, 'localStorage') as Storage | undefined;
    const values = new Map<string, string>();
    const storage =
        original ??
        ({
            getItem: (key: string) => (values.has(key) ? values.get(key)! : null),
            setItem: (key: string, value: string) => void values.set(key, value),
            removeItem: (key: string) => void values.delete(key),
        } as Storage);
    const storageKey = 'kromacut.palettes';
    const previous = storage.getItem(storageKey);

    if (!original) {
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: storage,
        });
    }
    storage.removeItem(storageKey);
    try {
        fn(storage);
    } finally {
        if (previous === null) storage.removeItem(storageKey);
        else storage.setItem(storageKey, previous);
        if (!original) delete (globalThis as Record<string, unknown>).localStorage;
    }
}

test('stored palettes with reserved built-in ids are re-assigned and persisted once', () => {
    withMemoryStorage((storage) => {
        const stored = [
            makePalette({ id: 'p4', name: 'Shadowing Built-in' }),
            makePalette({ id: 'sup_bambu-pla-basic', name: 'Shadowing Supplier' }),
            makePalette({ id: 'legit-uuid', name: 'Untouched' }),
        ];
        storage.setItem('kromacut.palettes', JSON.stringify(stored));

        const reserved = new Set(['auto', 'p4', 'g8']);
        const loaded = loadCustomPalettes(reserved);

        assert.equal(loaded.length, 3);
        assert.notEqual(loaded[0].id, 'p4');
        assert.notEqual(loaded[1].id, 'sup_bambu-pla-basic');
        assert.equal(loaded[2].id, 'legit-uuid');

        // Migration is written back, so a second load returns stable ids.
        const persisted = JSON.parse(storage.getItem('kromacut.palettes')!) as { id: string }[];
        assert.deepEqual(
            persisted.map((p) => p.id),
            loaded.map((p) => p.id)
        );
        const reloaded = loadCustomPalettes(reserved);
        assert.deepEqual(
            reloaded.map((p) => p.id),
            loaded.map((p) => p.id)
        );
    });
});

test('stored palettes without reserved ids are not rewritten on load', () => {
    withMemoryStorage((storage) => {
        const stored = [makePalette({ id: 'legit-uuid' })];
        const raw = JSON.stringify(stored);
        storage.setItem('kromacut.palettes', raw);
        loadCustomPalettes(new Set(['auto', 'p4']));
        assert.equal(storage.getItem('kromacut.palettes'), raw);
    });
});

test('saveCustomPalettes reports whether browser storage accepted the write', () => {
    withMemoryStorage((storage) => {
        const palettes = [makePalette()];
        assert.equal(saveCustomPalettes(palettes), true);
        assert.deepEqual(JSON.parse(storage.getItem('kromacut.palettes')!), palettes);

        const originalSetItem = storage.setItem;
        storage.setItem = () => {
            throw new Error('quota exceeded');
        };
        try {
            assert.equal(saveCustomPalettes(palettes), false);
        } finally {
            storage.setItem = originalSetItem;
        }
    });
});

test('normalizeDisabledColors drops invalid, duplicate and out-of-range indices', () => {
    const colors = ['#111111', '#222222', '#333333', '#444444'];
    assert.deepEqual(normalizeDisabledColors(colors, [3, 1, 1, -1, 4, 1.5, 'x']), [1, 3]);
});

test('normalizeDisabledColors returns undefined for missing, empty, or all-disabled sets', () => {
    const colors = ['#111111', '#222222'];
    assert.equal(normalizeDisabledColors(colors, undefined), undefined);
    assert.equal(normalizeDisabledColors(colors, []), undefined);
    assert.equal(normalizeDisabledColors(colors, [0, 1]), undefined);
});

test('enabledColors filters disabled indices and passes through v1 palettes', () => {
    const v1 = makePalette();
    assert.deepEqual(enabledColors(v1), ['#FF0000', '#00FF00', '#0000FF']);
    const v2 = makePalette({ disabledColors: [1] });
    assert.deepEqual(enabledColors(v2), ['#FF0000', '#0000FF']);
});

test('updateCustomPalette normalizes disabled indices against the new colors', () => {
    const palettes = [makePalette({ disabledColors: [2] })];
    const updated = updateCustomPalette(palettes, 'palette-1', {
        colors: ['#FF0000', '#00FF00'],
        disabledColors: [1, 5],
    });
    assert.deepEqual(updated[0].colors, ['#FF0000', '#00FF00']);
    assert.deepEqual(updated[0].disabledColors, [1]);
});

test('updateCustomPalette clears the disabled field when all colors would be disabled', () => {
    const palettes = [makePalette()];
    const updated = updateCustomPalette(palettes, 'palette-1', {
        disabledColors: [0, 1, 2],
    });
    assert.equal(updated[0].disabledColors, undefined);
    assert.ok(!('disabledColors' in updated[0]));
});

test('import treats identical colors with different disabled sets as distinct content', () => {
    const existing = [makePalette()];
    const incoming = [
        makePalette({ id: 'palette-2', name: 'Partly Off', disabledColors: [1] }),
    ];
    const result = importCustomPalettes(existing, incoming);
    assert.equal(result.imported.length, 1);
    assert.equal(result.skipped.length, 0);
    assert.deepEqual(result.imported[0].disabledColors, [1]);
});

test('import skips palettes matching both colors and disabled set', () => {
    const existing = [makePalette({ disabledColors: [1] })];
    const incoming = [
        makePalette({ id: 'palette-2', name: 'Duplicate', disabledColors: [1] }),
    ];
    const result = importCustomPalettes(existing, incoming);
    assert.equal(result.imported.length, 0);
    assert.equal(result.skipped.length, 1);
});

test('import normalizes hand-edited all-disabled palettes to all-enabled', () => {
    const incoming = [makePalette({ disabledColors: [0, 1, 2] })];
    const result = importCustomPalettes([], incoming);
    assert.equal(result.imported[0].disabledColors, undefined);
});

test('import re-assigns ids that collide with reserved built-in ids', () => {
    const incoming = [makePalette({ id: 'sup_bambu-pla-basic' })];
    const result = importCustomPalettes([], incoming, new Set(['sup_bambu-pla-basic']));
    assert.equal(result.imported.length, 1);
    assert.notEqual(result.imported[0].id, 'sup_bambu-pla-basic');
});

test('import re-assigns any sup_-prefixed id even without an explicit reserved set', () => {
    const incoming = [makePalette({ id: 'sup_future-supplier-set' })];
    const result = importCustomPalettes([], incoming);
    assert.equal(result.imported.length, 1);
    assert.notEqual(result.imported[0].id, 'sup_future-supplier-set');
});

test('import remaps disabled indices and names when invalid color entries are dropped', () => {
    const incoming = [
        makePalette({
            colors: [123, '#FF0000', '#00FF00'] as unknown as string[],
            disabledColors: [2],
            colorNames: ['Ghost', 'Red', 'Green'],
        }),
    ];
    const result = importCustomPalettes([], incoming);
    assert.equal(result.imported.length, 1);
    assert.deepEqual(result.imported[0].colors, ['#FF0000', '#00FF00']);
    assert.deepEqual(result.imported[0].disabledColors, [1]);
    assert.deepEqual(result.imported[0].colorNames, ['Red', 'Green']);
});

test('import canonicalizes supported colors and drops malformed color strings', () => {
    const incoming = [
        makePalette({
            colors: ['not-a-color', '#abc', '00ff00'],
            disabledColors: [2],
            colorNames: ['Ghost', 'Short hex', 'Green'],
        }),
    ];
    const result = importCustomPalettes([], incoming);
    assert.equal(result.imported.length, 1);
    assert.deepEqual(result.imported[0].colors, ['#AABBCC', '#00FF00']);
    assert.deepEqual(result.imported[0].disabledColors, [1]);
    assert.deepEqual(result.imported[0].colorNames, ['Short hex', 'Green']);
});

test('import skips palettes with no valid colors', () => {
    const result = importCustomPalettes([], [makePalette({ colors: ['not-a-color'] })]);
    assert.equal(result.imported.length, 0);
    assert.equal(result.palettes.length, 0);
});

test('updateCustomPalette stamps the current palette version on edited legacy palettes', () => {
    const palettes = [makePalette({ version: 1 })];
    const updated = updateCustomPalette(palettes, 'palette-1', { disabledColors: [1] });
    assert.equal(updated[0].version, 2);
});

test('deduplicateName appends incrementing numeric suffixes', () => {
    const names = ['Gray 8 (copy)', 'Gray 8 (copy) (2)'];
    assert.equal(deduplicateName('Gray 8 (copy)', names), 'Gray 8 (copy) (3)');
    assert.equal(deduplicateName('Fresh', names), 'Fresh');
});

test('clonePalette copies colors, dedupes the name, and preserves disabled flags', () => {
    const existing = [makePalette({ name: 'Test Palette (copy)' })];
    const clone = clonePalette(
        { label: 'Test Palette', colors: ['#FF0000', '#00FF00'], disabledColors: [1] },
        existing
    );
    assert.ok(clone);
    assert.equal(clone.name, 'Test Palette (copy) (2)');
    assert.notEqual(clone.id, existing[0].id);
    assert.deepEqual(clone.colors, ['#FF0000', '#00FF00']);
    assert.deepEqual(clone.disabledColors, [1]);
});

test('clonePalette converts hsl built-in colors to hex and remaps disabled indices', () => {
    const clone = clonePalette(
        {
            label: 'Gray 4',
            colors: ['not-a-color', 'hsl(0 0% 0%)', 'hsl(0 0% 100%)'],
            disabledColors: [2],
        },
        []
    );
    assert.ok(clone);
    assert.deepEqual(clone.colors, ['#000000', '#FFFFFF']);
    assert.deepEqual(clone.disabledColors, [1]);
});

test('clonePalette returns null when no colors survive conversion', () => {
    assert.equal(clonePalette({ label: 'Empty', colors: ['nope'] }, []), null);
});

test('normalizeColorNames trims, pads, truncates, and drops all-empty sets', () => {
    const colors = ['#111111', '#222222', '#333333'];
    assert.deepEqual(normalizeColorNames(colors, ['  Pumpkin Orange  ', 7, 'Sky', 'Extra']), [
        'Pumpkin Orange',
        '',
        'Sky',
    ]);
    assert.equal(normalizeColorNames(colors, ['', '  ', '']), undefined);
    assert.equal(normalizeColorNames(colors, undefined), undefined);
    assert.equal(normalizeColorNames(colors, 'not-an-array'), undefined);
});

test('createCustomPalette keeps color names and drops them when all empty', () => {
    const named = createCustomPalette('Named', ['#FF0000', '#00FF00'], undefined, [
        'Pumpkin Orange',
        '',
    ]);
    assert.deepEqual(named.colorNames, ['Pumpkin Orange', '']);
    const unnamed = createCustomPalette('Unnamed', ['#FF0000'], undefined, ['']);
    assert.equal(unnamed.colorNames, undefined);
});

test('updateCustomPalette normalizes color names against the new colors', () => {
    const palettes = [makePalette({ colorNames: ['A', 'B', 'C'] })];
    const updated = updateCustomPalette(palettes, 'palette-1', {
        colors: ['#FF0000', '#00FF00'],
        colorNames: ['Red ', ''],
    });
    assert.deepEqual(updated[0].colorNames, ['Red', '']);
});

test('import treats identical colors with different names as distinct content', () => {
    const existing = [makePalette()];
    const incoming = [
        makePalette({ id: 'palette-2', name: 'Named Twin', colorNames: ['R', 'G', 'B'] }),
    ];
    const result = importCustomPalettes(existing, incoming);
    assert.equal(result.imported.length, 1);
    assert.deepEqual(result.imported[0].colorNames, ['R', 'G', 'B']);
});

test('clonePalette carries color names and remaps them when colors are dropped', () => {
    const clone = clonePalette(
        {
            label: 'Named',
            colors: ['not-a-color', '#FF0000', '#00FF00'],
            colorNames: ['Ghost', 'Pumpkin Orange', ''],
        },
        []
    );
    assert.ok(clone);
    assert.deepEqual(clone.colors, ['#FF0000', '#00FF00']);
    assert.deepEqual(clone.colorNames, ['Pumpkin Orange', '']);
});

test('toHex6 handles hex shorthand, full hex, and hsl strings', () => {
    assert.equal(toHex6('#abc'), '#AABBCC');
    assert.equal(toHex6('ff8800'), '#FF8800');
    assert.equal(toHex6('#FF8800'), '#FF8800');
    assert.equal(toHex6('hsl(0 0% 50%)'), '#808080');
    assert.equal(toHex6('hsl(120, 100%, 50%)'), '#00FF00');
    assert.equal(toHex6('rebeccapurple'), null);
    assert.equal(toHex6(''), null);
});
