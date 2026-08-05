import test from 'node:test';
import assert from 'node:assert/strict';

import {
    clonePalette,
    customPaletteFileName,
    enabledColors,
    importCustomPalettes,
    normalizeDisabledColors,
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

test('toHex6 handles hex shorthand, full hex, and hsl strings', () => {
    assert.equal(toHex6('#abc'), '#AABBCC');
    assert.equal(toHex6('ff8800'), '#FF8800');
    assert.equal(toHex6('#FF8800'), '#FF8800');
    assert.equal(toHex6('hsl(0 0% 50%)'), '#808080');
    assert.equal(toHex6('hsl(120, 100%, 50%)'), '#00FF00');
    assert.equal(toHex6('rebeccapurple'), null);
    assert.equal(toHex6(''), null);
});
