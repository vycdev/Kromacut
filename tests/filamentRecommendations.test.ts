import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendFilaments, FILAMENT_CATALOG } from '../src/lib/filamentRecommendations.ts';
test('exact catalog colors rank first, with deterministic perceptual distances', () => {
    const matches = recommendFilaments('#080a0d', 'Polymaker', 'PLA');
    assert.equal(matches[0].name, 'Black');
    assert.equal(matches[0].difference, 0);
    assert.equal(matches.length, 10);
    assert(matches.every((m, i) => !i || m.difference >= matches[i - 1].difference));
    assert.deepEqual(matches, recommendFilaments('#080A0D', 'Polymaker', 'PLA'));
});
test('brand and material filters are respected, including empty combinations', () => {
    assert(
        recommendFilaments('#ff0000', 'Prusament', 'PETG').every(
            (m) => m.brand === 'Prusament' && m.material === 'PETG'
        )
    );
    assert.deepEqual(recommendFilaments('#ff0000', 'Bambu Lab', 'PETG'), []);
    assert.deepEqual(recommendFilaments('garbage'), []);
    assert.equal(new Set(FILAMENT_CATALOG.map((f) => f.brand)).size, 5);
    assert.equal(FILAMENT_CATALOG.length, 123);
    assert(FILAMENT_CATALOG.every((f) => f.sourceUrl?.startsWith('https://')));
});

test('SUNLU and ELEGOO references retain exact values and distinct provenance', () => {
    const sunlu = recommendFilaments('#FD404B', 'SUNLU', 'PLA')[0];
    assert.equal(sunlu.name, 'Cherry Red');
    assert.equal(sunlu.difference, 0);
    assert.equal(sunlu.sourceKind, 'manufacturer');
    const elegoo = recommendFilaments('#747C7E', 'ELEGOO', 'PLA')[0];
    assert.equal(elegoo.name, 'Grey');
    assert.equal(elegoo.difference, 0);
    assert.equal(elegoo.sourceKind, 'community');
});

test('multiple checked brands form a combined ranking and none means no matches', () => {
    const matches = recommendFilaments('#FF0000', ['SUNLU', 'ELEGOO'], 'PLA');
    assert.equal(matches.length, 10);
    assert(matches.every((m) => ['SUNLU', 'ELEGOO'].includes(m.brand)));
    assert(matches.some((m) => m.brand === 'SUNLU') && matches.some((m) => m.brand === 'ELEGOO'));
    assert.equal(matches[0].name, 'Red');
    assert.equal(matches[0].difference, 0);
    assert.deepEqual(recommendFilaments('#FF0000', [], 'PLA'), []);
});
