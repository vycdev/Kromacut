import test from 'node:test';
import assert from 'node:assert/strict';

import {
    profileFileName,
    renameProfile,
    parseHueForgeCSV,
    type AutoPaintProfile,
} from '../src/lib/profileManager.ts';

test('auto-paint profile exports use kfil filenames', () => {
    assert.equal(profileFileName('PLA Basic White'), 'PLA_Basic_White.kfil');
});

const HUEFORGE_CSV = `Brand, Type, Color, Name, TD, Tags, Secondary_Type, Secondary_Color, Secondary_Strength, Owned, Uuid
Inland Basic,PLA,#bf9c81,Light Brown,1.7,,None,#0000ff,0,true,{631cbb3a-9db8-45b4-96cd-5d21a5f3b2e9}
Overture Basic,PLA,#033877,Blue,3.5,,None,#0000ff,0,true,{c8518afd-068e-4a5c-90d2-9981d4d7edde}`;

test('parseHueForgeCSV returns null for empty input', () => {
    assert.equal(parseHueForgeCSV(''), null);
    assert.equal(parseHueForgeCSV('Brand, Type, Color'), null);
});

test('parseHueForgeCSV returns null when no valid filament rows', () => {
    const csv = `Brand, Type, Color, Name, TD, Tags, Secondary_Type, Secondary_Color, Secondary_Strength, Owned, Uuid
Inland Basic,PLA,,Light Brown,,,,,,true,{631cbb3a-9db8-45b4-96cd-5d21a5f3b2e9}`;
    assert.equal(parseHueForgeCSV(csv), null);
});

test('parseHueForgeCSV parses filaments from HueForge CSV', () => {
    const profiles = parseHueForgeCSV(HUEFORGE_CSV, 'My Spools');
    assert.ok(profiles);
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].name, 'My Spools');
    assert.equal(profiles[0].filaments.length, 2);
});

test('parseHueForgeCSV maps color and TD correctly', () => {
    const [profile] = parseHueForgeCSV(HUEFORGE_CSV)!;
    const [first] = profile.filaments;
    assert.equal(first.color, '#BF9C81');
    assert.equal(first.td, 1.7);
});

test('parseHueForgeCSV strips braces from UUIDs', () => {
    const [profile] = parseHueForgeCSV(HUEFORGE_CSV)!;
    assert.equal(profile.filaments[0].id, '631cbb3a-9db8-45b4-96cd-5d21a5f3b2e9');
    assert.equal(profile.filaments[1].id, 'c8518afd-068e-4a5c-90d2-9981d4d7edde');
});

test('parseHueForgeCSV formats names as <mfr>-<color-name>-<color-hex>', () => {
    const [profile] = parseHueForgeCSV(HUEFORGE_CSV)!;
    assert.equal(profile.filaments[0].name, 'Inland Basic-Light Brown-#BF9C81');
    assert.equal(profile.filaments[1].name, 'Overture Basic-Blue-#033877');
});

test('parseHueForgeCSV preserves brand field', () => {
    const [profile] = parseHueForgeCSV(HUEFORGE_CSV)!;
    assert.equal(profile.filaments[0].brand, 'Inland Basic');
    assert.equal(profile.filaments[1].brand, 'Overture Basic');
});

test('parseHueForgeCSV handles columns in non-standard order', () => {
    const csv = `TD, Name, Uuid, Color, Brand, Type
1.7,Light Brown,{631cbb3a-9db8-45b4-96cd-5d21a5f3b2e9},#bf9c81,Inland Basic,PLA`;
    const [profile] = parseHueForgeCSV(csv)!;
    const [f] = profile.filaments;
    assert.equal(f.color, '#BF9C81');
    assert.equal(f.td, 1.7);
    assert.equal(f.brand, 'Inland Basic');
    assert.equal(f.name, 'Inland Basic-Light Brown-#BF9C81');
    assert.equal(f.id, '631cbb3a-9db8-45b4-96cd-5d21a5f3b2e9');
});

test('parseHueForgeCSV handles quoted fields containing commas', () => {
    const csv = `Brand,Color,Name,TD,Uuid
"Inland, Basic",#bf9c81,"Light, Brown",1.7,{631cbb3a-9db8-45b4-96cd-5d21a5f3b2e9}`;
    const [profile] = parseHueForgeCSV(csv)!;
    const [f] = profile.filaments;
    assert.equal(f.brand, 'Inland, Basic');
    assert.equal(f.color, '#BF9C81');
    assert.equal(f.name, 'Inland, Basic-Light, Brown-#BF9C81');
    assert.equal(f.td, 1.7);
});

test('parseHueForgeCSV handles escaped quotes inside quoted fields', () => {
    const csv = `Brand,Color,Name,TD
"Brand ""X""",#ff0000,Red,2.1`;
    const [profile] = parseHueForgeCSV(csv)!;
    assert.equal(profile.filaments[0].brand, 'Brand "X"');
});

test('parseHueForgeCSV handles field with backslash and embedded quote (double-escape)', () => {
    // brand value: backslash \"  (backslash + quote, 12 chars)
    // RFC 4180: wrap in quotes, double the interior " → "backslash \"""
    // JS template: \\ for the literal backslash → "backslash \\"""
    const csv = `Brand,Color,Name,TD
"backslash \\""",#aa1122,Red,1.5`;
    const [profile] = parseHueForgeCSV(csv)!;
    assert.equal(profile.filaments[0].brand, 'backslash \\"');
});

test('parseHueForgeCSV parses TSV input', () => {
    const tsv = `Brand\tColor\tName\tTD\tUuid
Inland Basic\t#bf9c81\tLight Brown\t1.7\t{631cbb3a-9db8-45b4-96cd-5d21a5f3b2e9}
Overture Basic\t#033877\tBlue\t3.5\t{c8518afd-068e-4a5c-90d2-9981d4d7edde}`;
    const profiles = parseHueForgeCSV(tsv, 'My Spools');
    assert.ok(profiles);
    assert.equal(profiles[0].filaments.length, 2);
    assert.equal(profiles[0].filaments[0].color, '#BF9C81');
    assert.equal(profiles[0].filaments[0].brand, 'Inland Basic');
    assert.equal(profiles[0].filaments[1].color, '#033877');
});

test('parseHueForgeCSV handles quoted fields containing newlines', () => {
    const csv = `Brand,Color,Name,TD
"Inland\nBasic",#bf9c81,"Light\nBrown",1.7`;
    const [profile] = parseHueForgeCSV(csv)!;
    const [f] = profile.filaments;
    assert.equal(f.brand, 'Inland\nBasic');
    assert.equal(f.name, 'Inland\nBasic-Light\nBrown-#BF9C81');
    assert.equal(f.color, '#BF9C81');
    assert.equal(f.td, 1.7);
});

test('parseHueForgeCSV TSV does not split on commas in values', () => {
    const tsv = `Brand\tColor\tName\tTD
Inland, Basic\t#bf9c81\tLight Brown\t1.7`;
    const [profile] = parseHueForgeCSV(tsv)!;
    assert.equal(profile.filaments[0].brand, 'Inland, Basic');
});

test('parseHueForgeCSV skips rows with invalid hex color', () => {
    const csv = `Brand,Color,Name,TD
Inland Basic,red,Light Brown,1.7
Inland Basic,rgb(255,0,0),Light Brown,1.7
Overture Basic,#033877,Blue,3.5`;
    const [profile] = parseHueForgeCSV(csv)!;
    assert.equal(profile.filaments.length, 1);
    assert.equal(profile.filaments[0].color, '#033877');
});

test('parseHueForgeCSV skips rows with TD out of plausible range', () => {
    const csv = `Brand,Color,Name,TD
Inland Basic,#bf9c81,Light Brown,-1
Inland Basic,#bf9c81,Light Brown,0
Inland Basic,#bf9c81,Light Brown,99
Overture Basic,#033877,Blue,3.5`;
    const [profile] = parseHueForgeCSV(csv)!;
    assert.equal(profile.filaments.length, 1);
    assert.equal(profile.filaments[0].td, 3.5);
});

test('auto-paint profiles can be renamed without changing filament data', () => {
    const profiles: AutoPaintProfile[] = [
        {
            id: 'profile-1',
            name: 'Original Name',
            version: 1,
            createdAt: 1,
            updatedAt: 1,
            filaments: [{ id: 'filament-1', color: '#ffffff', td: 2.5 }],
        },
    ];

    const renamed = renameProfile(profiles, 'profile-1', '  New Name  ');

    assert.equal(renamed[0].name, 'New Name');
    assert.deepEqual(renamed[0].filaments, profiles[0].filaments);
    assert.ok(renamed[0].updatedAt >= profiles[0].updatedAt);
});
