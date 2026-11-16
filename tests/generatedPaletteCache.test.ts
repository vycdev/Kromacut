import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheGeneratedPalette } from '../src/lib/paletteManager.ts';
test('cache reuses colors without selecting, dropping, or mutating existing palettes', () => {
    const first = cacheGeneratedPalette([], ['#000000', '#FF0000', '#ffffff']);
    assert.equal(first.length, 1);
    assert.deepEqual(first[0].colors, ['#000000', '#ff0000', '#ffffff']);
    assert.equal(cacheGeneratedPalette(first, ['#000000', '#ff0000', '#ffffff']), first);
    assert.equal(cacheGeneratedPalette(first, ['#ffffff', '#ff0000', '#000000']), first);
    const second = cacheGeneratedPalette(first, ['#112233', '#abcdef']);
    assert.equal(second.length, 2);
    assert.equal(second[0], first[0]);
    assert.equal(first.length, 1);
    assert.equal(cacheGeneratedPalette(second, []), second);
    assert.equal(cacheGeneratedPalette(second, ['transparent', 'bogus']), second);
    const reloaded = JSON.parse(JSON.stringify(second));
    assert.equal(cacheGeneratedPalette(reloaded, ['#112233', '#ABCDEF']), reloaded);
});
