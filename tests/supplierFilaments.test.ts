import test from 'node:test';
import assert from 'node:assert/strict';

import {
    SUPPLIER_SETS,
    SUPPLIER_PALETTES,
    TEMPLATE_PROFILES,
    TEMPLATE_PROFILE_PREFIX,
    isSupplierPaletteId,
    isTemplateProfileId,
} from '../src/data/supplierFilaments.ts';

// Pinned against Bambu Lab's official "Filament Hex Code Table" PDF
// (retrieved 2026-08-05, 30 colors). A typo or dropped color fails loudly.
const BAMBU_PLA_BASIC: Array<[string, string]> = [
    ['Jade White', '#FFFFFF'],
    ['Beige', '#F7E6DE'],
    ['Light Gray', '#D1D3D5'],
    ['Silver', '#A6A9AA'],
    ['Gray', '#8E9089'],
    ['Magenta', '#EC008C'],
    ['Pink', '#F55A74'],
    ['Hot Pink', '#F5547C'],
    ['Orange', '#FF6A13'],
    ['Pumpkin Orange', '#FF9016'],
    ['Gold', '#E4BD68'],
    ['Sunflower Yellow', '#FEC600'],
    ['Yellow', '#F4EE2A'],
    ['Bright Green', '#BECF00'],
    ['Bambu Green', '#00AE42'],
    ['Mistletoe Green', '#3F8E43'],
    ['Bronze', '#847D48'],
    ['Cocoa Brown', '#6F5034'],
    ['Brown', '#9D432C'],
    ['Maroon Red', '#9D2235'],
    ['Red', '#C12E1F'],
    ['Turquoise', '#00B1B7'],
    ['Cyan', '#0086D6'],
    ['Blue', '#0A2989'],
    ['Cobalt Blue', '#0056B8'],
    ['Purple', '#5E43B7'],
    ['Indigo Purple', '#482960'],
    ['Blue Grey', '#5B6579'],
    ['Dark Gray', '#545454'],
    ['Black', '#000000'],
];

test('Bambu PLA Basic matches the official hex chart exactly', () => {
    const set = SUPPLIER_SETS.find((s) => s.id === 'bambu-pla-basic');
    assert.ok(set);
    assert.deepEqual(
        set.filaments.map((f) => [f.name, f.hex]),
        BAMBU_PLA_BASIC
    );
});

test('supplier filament hex values are canonical #RRGGBB uppercase', () => {
    for (const set of SUPPLIER_SETS) {
        for (const f of set.filaments) {
            assert.match(f.hex, /^#[0-9A-F]{6}$/, `${set.id} / ${f.name}: ${f.hex}`);
        }
    }
});

test('supplier sets and filaments have unique stable IDs', () => {
    const setIds = SUPPLIER_SETS.map((s) => s.id);
    assert.equal(new Set(setIds).size, setIds.length);
    const filamentIds = new Set<string>();
    for (const set of SUPPLIER_SETS) {
        assert.match(set.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        const names = set.filaments.map((f) => f.name);
        assert.equal(new Set(names).size, names.length, `duplicate names in ${set.id}`);
        for (const filament of set.filaments) {
            assert.ok(filament.id.startsWith(`${set.id}/`), filament.id);
            assert.match(filament.id.slice(set.id.length + 1), /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
            assert.ok(!filamentIds.has(filament.id), `duplicate ID ${filament.id}`);
            filamentIds.add(filament.id);
        }
    }
});

test('supplier sets record provenance and an official page for the product line', () => {
    for (const { id, source, manufacturerUrl, filaments } of SUPPLIER_SETS) {
        assert.equal(new URL(source.url).protocol, 'https:', id);
        assert.ok(['manufacturer', 'community'].includes(source.kind), id);
        assert.match(source.checkedOn, /^\d{4}-\d{2}-\d{2}$/, id);
        assert.equal(new Date(source.checkedOn).toISOString().slice(0, 10), source.checkedOn, id);
        assert.ok(source.redistribution.trim(), id);
        assert.equal(new URL(manufacturerUrl).protocol, 'https:', id);
        for (const filament of filaments) {
            if (filament.manufacturerUrl) {
                assert.equal(new URL(filament.manufacturerUrl).protocol, 'https:', filament.id);
            }
        }
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

test('reference palettes add no optical data and preserve the existing Bambu template IDs', () => {
    const bambu = SUPPLIER_SETS.find((s) => s.id === 'bambu-pla-basic');
    assert.ok(bambu);
    const referenceSets = SUPPLIER_SETS.filter((s) => s.id !== bambu.id);
    assert.deepEqual(referenceSets.map((set) => set.id).sort(), [
        'elegoo-pla-rfid',
        'polymaker-panchroma-basic',
        'prusament-petg-solid',
        'prusament-pla-solid',
        'sunlu-pla-classic',
    ]);
    for (const set of referenceSets) {
        assert.ok(set.filaments.length > 0, set.id);
        assert.ok(
            set.filaments.every((f) => !('td' in f)),
            set.id
        );
    }

    const bambuTemplateId = `${TEMPLATE_PROFILE_PREFIX}${bambu.id}`;
    assert.deepEqual(
        TEMPLATE_PROFILES.map((p) => p.id),
        [bambuTemplateId]
    );
    const profile = TEMPLATE_PROFILES[0];
    assert.ok(isTemplateProfileId(profile.id));
    assert.equal(profile.filaments.length, bambu.filaments.length);
    profile.filaments.forEach((f, i) => {
        assert.equal(f.id, `${bambuTemplateId}-${i}`);
        assert.equal(f.color, bambu.filaments[i].hex);
        assert.equal(f.name, bambu.filaments[i].name);
        assert.equal(f.brand, bambu.brand);
        assert.ok(Number.isFinite(f.td) && f.td > 0, `${profile.id} / ${f.name}: td=${f.td}`);
    });
});
