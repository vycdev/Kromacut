import test from 'node:test';
import assert from 'node:assert/strict';

import {
    SUPPLIER_SETS,
    SUPPLIER_PALETTES,
    TEMPLATE_PROFILES,
    isSupplierPaletteId,
    isTemplateProfileId,
} from '../src/data/supplierFilaments.ts';

test('supplier filament hex values are canonical #RRGGBB uppercase', () => {
    for (const set of SUPPLIER_SETS) {
        for (const f of set.filaments) {
            assert.match(f.hex, /^#[0-9A-F]{6}$/, `${set.id} / ${f.name}: ${f.hex}`);
        }
    }
});

test('supplier set ids and filament names are unique within each set', () => {
    const setIds = SUPPLIER_SETS.map((s) => s.id);
    assert.equal(new Set(setIds).size, setIds.length);
    for (const set of SUPPLIER_SETS) {
        const names = set.filaments.map((f) => f.name);
        assert.equal(new Set(names).size, names.length, `duplicate names in ${set.id}`);
    }
});

test('supplier palettes derive from the sets with prefixed ids', () => {
    assert.equal(SUPPLIER_PALETTES.length, SUPPLIER_SETS.length);
    SUPPLIER_PALETTES.forEach((p, i) => {
        const set = SUPPLIER_SETS[i];
        assert.ok(isSupplierPaletteId(p.id));
        assert.ok(!isTemplateProfileId(p.id));
        assert.equal(p.group, 'supplier');
        assert.equal(p.size, set.filaments.length);
        assert.deepEqual(
            p.colors,
            set.filaments.map((f) => f.hex)
        );
        assert.deepEqual(
            p.colorNames,
            set.filaments.map((f) => f.name)
        );
    });
});

test('template profiles carry name, brand, and a positive finite TD per filament', () => {
    assert.equal(TEMPLATE_PROFILES.length, SUPPLIER_SETS.length);
    TEMPLATE_PROFILES.forEach((profile, i) => {
        const set = SUPPLIER_SETS[i];
        assert.ok(isTemplateProfileId(profile.id));
        assert.equal(profile.filaments.length, set.filaments.length);
        profile.filaments.forEach((f, j) => {
            assert.equal(f.color, set.filaments[j].hex);
            assert.equal(f.name, set.filaments[j].name);
            assert.equal(f.brand, set.brand);
            assert.ok(Number.isFinite(f.td) && f.td > 0, `${profile.id} / ${f.name}: td=${f.td}`);
        });
        const filamentIds = profile.filaments.map((f) => f.id);
        assert.equal(new Set(filamentIds).size, filamentIds.length);
    });
});
