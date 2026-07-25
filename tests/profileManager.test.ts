import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

import { parseHueForgeCSV, type AutoPaintProfile } from '../src/lib/profileManager.ts';

type ProfileManagerModule = typeof import('../src/lib/profileManager.ts');

let profileManagerModule: Promise<ProfileManagerModule> | null = null;

async function loadViteModule<T>(modulePath: string): Promise<T> {
    const server = await createServer({
        appType: 'custom',
        cacheDir: 'dist/.vite-test-cache',
        configFile: false,
        logLevel: 'error',
        optimizeDeps: { noDiscovery: true },
        resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
        root: process.cwd(),
        server: { hmr: false, middlewareMode: true },
    });

    try {
        return (await server.ssrLoadModule(modulePath)) as T;
    } finally {
        await server.close();
    }
}

const loadProfileManager = () =>
    (profileManagerModule ??= loadViteModule<ProfileManagerModule>('/src/lib/profileManager.ts'));

const oldPhotoCalibration = {
    measurements: [{ color: '#ffffff', rgb: [245, 240, 230], thickness: 0.4 }],
    whiteReference: [255, 255, 255],
    td: [2.5, 3.5, 4.5],
    tdSingleValue: 3.5,
    confidence: 0.92,
    calibrationDate: '2025-01-01T00:00:00.000Z',
};

function createMemoryStorage() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => (values.has(key) ? values.get(key)! : null),
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
        removeItem: (key: string) => {
            values.delete(key);
        },
    };
}

test('auto-paint profile exports use kfil filenames', async () => {
    const { profileFileName } = await loadProfileManager();
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

test('parseHueForgeCSV maps color and conventional TD to hiding distance', () => {
    const [profile] = parseHueForgeCSV(HUEFORGE_CSV)!;
    const [first] = profile.filaments;
    assert.equal(first.color, '#BF9C81');
    assert.equal(first.td, 0.17);
    assert.equal(profile.filaments[1].td, 0.35);
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
    assert.equal(f.td, 0.17);
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
    assert.equal(f.td, 0.17);
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
    assert.equal(f.td, 0.17);
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
    assert.equal(profile.filaments[0].td, 0.35);
});

test('parseHueForgeCSV strips a leading UTF-8 BOM before parsing the header', () => {
    // A UTF-8 BOM (U+FEFF) is often prepended by spreadsheet tools (e.g.
    // Excel) when saving CSV/TSV. Without stripping it, the first header
    // cell reads as "\uFEFFColor" instead of "Color", so the Color column
    // lookup fails for every row and no filaments are imported.
    const csv = `\uFEFFColor,TD,Name
#bf9c81,1.7,Light Brown`;
    const profiles = parseHueForgeCSV(csv, 'My Spools');
    assert.ok(profiles);
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].filaments.length, 1);
    assert.equal(profiles[0].filaments[0].color, '#BF9C81');
    assert.equal(profiles[0].filaments[0].td, 0.17);
});

test('parseHueForgeCSV strips a leading UTF-8 BOM from TSV input as well', () => {
    const tsv = `\uFEFFBrand\tColor\tName\tTD
Inland Basic\t#bf9c81\tLight Brown\t1.7`;
    const [profile] = parseHueForgeCSV(tsv)!;
    assert.equal(profile.filaments.length, 1);
    assert.equal(profile.filaments[0].color, '#BF9C81');
    assert.equal(profile.filaments[0].brand, 'Inland Basic');
});

test('auto-paint profiles can be renamed without changing filament data', async () => {
    const { renameProfile } = await loadProfileManager();
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

test('profile imports strip legacy photo calibration objects', async () => {
    const { importProfiles } = await loadProfileManager();
    const incoming = [
        {
            id: 'profile-old',
            name: 'Legacy Profile',
            version: 1,
            createdAt: 1,
            updatedAt: 1,
            filaments: [
                {
                    id: 'filament-old',
                    color: '#ffffff',
                    td: 3.5,
                    calibration: oldPhotoCalibration,
                },
            ],
        },
    ] as unknown as AutoPaintProfile[];

    const result = importProfiles([], incoming);

    assert.equal(result.imported.length, 1);
    assert.equal(result.imported[0].filaments[0].calibration, undefined);
});

test('stored auto-paint profiles strip legacy photo calibration objects on load', async () => {
    const { loadProfiles } = await loadProfileManager();
    const existingStorage = Reflect.get(globalThis, 'localStorage') as
        | ReturnType<typeof createMemoryStorage>
        | undefined;
    const storage = existingStorage ?? createMemoryStorage();
    if (!existingStorage) {
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: storage,
        });
    }

    const previousProfiles = storage.getItem('kromacut.autopaint.profiles');
    storage.setItem(
        'kromacut.autopaint.profiles',
        JSON.stringify([
            {
                id: 'profile-stored',
                name: 'Stored Legacy Profile',
                version: 1,
                createdAt: 1,
                updatedAt: 1,
                filaments: [
                    {
                        id: 'filament-stored',
                        color: '#ffffff',
                        td: 3.5,
                        calibration: oldPhotoCalibration,
                    },
                ],
            },
        ])
    );

    try {
        const loaded = loadProfiles();
        assert.equal(loaded.length, 1);
        assert.equal(loaded[0].filaments[0].calibration, undefined);
    } finally {
        if (previousProfiles === null) {
            storage.removeItem('kromacut.autopaint.profiles');
        } else {
            storage.setItem('kromacut.autopaint.profiles', previousProfiles);
        }
        if (!existingStorage) Reflect.deleteProperty(globalThis, 'localStorage');
    }
});

test('v1 profile imports migrate uncalibrated tds to hiding distances', async () => {
    const { importProfiles, CURRENT_PROFILE_VERSION } = await loadProfileManager();
    const incoming = [
        {
            id: 'profile-v1',
            name: 'Legacy Scale Profile',
            version: 1,
            createdAt: 1,
            updatedAt: 1,
            filaments: [{ id: 'f-uncal', color: '#ffffff', td: 4.0 }],
        },
    ] as unknown as AutoPaintProfile[];

    const result = importProfiles([], incoming);
    assert.equal(result.imported.length, 1);
    assert.equal(result.imported[0].version, CURRENT_PROFILE_VERSION);
    assert.ok(Math.abs(result.imported[0].filaments[0].td - 0.4) < 1e-12);
});

test('v1 profile imports re-sync calibrated tds to the measured scalar', async () => {
    const { importProfiles } = await loadProfileManager();
    const calibration = {
        opacityLayers: 6,
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
        td: [0.4, 0.45, 0.5],
        tdSingleValue: 0.5,
        jnd: 2,
        baseColor: '#000000',
        confidence: 0.9,
        basis: 'frontlit',
        calibrationDate: '2026-07-01T00:00:00.000Z',
    };
    const incoming = [
        {
            id: 'profile-v1-cal',
            name: 'Legacy Calibrated Profile',
            version: 1,
            createdAt: 1,
            updatedAt: 1,
            filaments: [{ id: 'f-cal', color: '#ffffff', td: 0.5, calibration }],
        },
    ] as unknown as AutoPaintProfile[];

    const result = importProfiles([], incoming);
    assert.equal(result.imported.length, 1);
    // Calibrated filaments never get the ×0.1 conversion; td stays the measured scalar.
    assert.equal(result.imported[0].filaments[0].td, 0.5);
    assert.ok(result.imported[0].filaments[0].calibration);
});

test('v2 profile imports are not re-scaled (double-import idempotence)', async () => {
    const { importProfiles, exportProfileBlob, parseProfileFile, CURRENT_PROFILE_VERSION } =
        await loadProfileManager();
    const incoming = [
        {
            id: 'profile-v2',
            name: 'HD Profile',
            version: CURRENT_PROFILE_VERSION,
            createdAt: 1,
            updatedAt: 1,
            filaments: [{ id: 'f-hd', color: '#ffffff', td: 0.4 }],
        },
    ] as unknown as AutoPaintProfile[];

    const first = importProfiles([], incoming);
    assert.equal(first.imported[0].filaments[0].td, 0.4);

    // Export → parse → re-import must be a no-op on td values.
    const blob = exportProfileBlob(first.imported[0]);
    const json = await blob.text();
    const reparsed = parseProfileFile(json);
    assert.ok(reparsed);
    const second = importProfiles([], reparsed!);
    // Same id → overwrite path; td unchanged.
    assert.equal(second.profiles.length, 1);
    const stored = second.profiles.find((p) => p.id === 'profile-v2');
    assert.ok(stored);
    assert.equal(stored!.filaments[0].td, 0.4);
});

test('calibrated frontlit fixture imports without rescaling measured hiding distances', async () => {
    const { importProfiles, parseProfileFile, CURRENT_PROFILE_VERSION } =
        await loadProfileManager();
    const raw = readFileSync(
        resolve(process.cwd(), 'tests/assets/filament-profiles/8_Colors_Calibrated_Frontlit.kfil'),
        'utf8'
    );
    const parsed = parseProfileFile(raw);

    assert.ok(parsed);
    assert.equal(parsed.length, 1);

    const source = parsed[0];
    assert.equal(source.name, '8 Colors Calibrated Frontlit');
    assert.equal(source.version, CURRENT_PROFILE_VERSION);
    assert.equal(source.filaments.length, 8);

    const sourceTds = source.filaments.map((filament) => filament.td);
    const result = importProfiles([], parsed);

    assert.equal(result.imported.length, 1);
    assert.equal(result.imported[0].version, CURRENT_PROFILE_VERSION);
    assert.deepEqual(
        result.imported[0].filaments.map((filament) => filament.td),
        sourceTds
    );

    for (const filament of result.imported[0].filaments) {
        assert.ok(filament.calibration);
        assert.equal(filament.calibration.basis, 'frontlit');
        assert.equal(filament.calibration.tdSingleValue, filament.td);
        assert.equal(filament.calibration.filamentColor, filament.color);
    }
});

test('stored v1 profiles migrate tds once on load', async () => {
    const { loadProfiles, CURRENT_PROFILE_VERSION } = await loadProfileManager();
    const existingStorage = Reflect.get(globalThis, 'localStorage') as
        | ReturnType<typeof createMemoryStorage>
        | undefined;
    const storage = existingStorage ?? createMemoryStorage();
    if (!existingStorage) {
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: storage,
        });
    }

    const previousProfiles = storage.getItem('kromacut.autopaint.profiles');
    storage.setItem(
        'kromacut.autopaint.profiles',
        JSON.stringify([
            {
                id: 'stored-v1',
                name: 'Stored Legacy Scale',
                version: 1,
                createdAt: 1,
                updatedAt: 1,
                filaments: [{ id: 'f1', color: '#f7d000', td: 6.3 }],
            },
            {
                id: 'stored-v2',
                name: 'Stored HD',
                version: CURRENT_PROFILE_VERSION,
                createdAt: 1,
                updatedAt: 1,
                filaments: [{ id: 'f2', color: '#f7d000', td: 0.63 }],
            },
        ])
    );

    try {
        const loaded = loadProfiles();
        assert.equal(loaded.length, 2);
        const v1 = loaded.find((p) => p.id === 'stored-v1');
        const v2 = loaded.find((p) => p.id === 'stored-v2');
        assert.ok(v1 && v2);
        assert.ok(Math.abs(v1!.filaments[0].td - 0.63) < 1e-12, 'v1 td migrates ×0.1');
        assert.equal(v2!.filaments[0].td, 0.63, 'v2 td untouched');
        assert.equal(v1!.version, CURRENT_PROFILE_VERSION);
    } finally {
        if (previousProfiles === null) {
            storage.removeItem('kromacut.autopaint.profiles');
        } else {
            storage.setItem('kromacut.autopaint.profiles', previousProfiles);
        }
        if (!existingStorage) Reflect.deleteProperty(globalThis, 'localStorage');
    }
});

test('loading a calibrated filament backfills the calibrated swatch color', async () => {
    const { sanitizeProfileFilament } = await loadProfileManager();
    const frontlitCalibration = {
        opacityLayers: 7,
        layerHeight: 0.08,
        firstLayerHeight: 0.16,
        td: [0.49, 0.51, 0.5],
        tdSingleValue: 0.51,
        jnd: 2,
        baseColor: '#000000',
        confidence: 0.9,
        basis: 'frontlit',
        calibrationDate: '2026-07-02T00:00:00.000Z',
    };
    // Legacy record (no filamentColor) → backfilled with the current color.
    const legacy = sanitizeProfileFilament({
        id: 'f',
        color: '#ffffff',
        td: 0.51,
        calibration: frontlitCalibration,
    });
    assert.ok(legacy?.calibration);
    assert.equal(legacy!.calibration!.filamentColor, '#ffffff');

    // Existing filamentColor is preserved, not overwritten by the current color.
    const stamped = sanitizeProfileFilament({
        id: 'g',
        color: '#111111',
        td: 0.51,
        calibration: { ...frontlitCalibration, filamentColor: '#ffffff' },
    });
    assert.equal(stamped!.calibration!.filamentColor, '#ffffff');
});

test('loading a filament rejects non-positive hiding distances', async () => {
    const { sanitizeProfileFilament } = await loadProfileManager();

    assert.equal(sanitizeProfileFilament({ id: 'zero', color: '#ffffff', td: 0 }), null);
    assert.equal(sanitizeProfileFilament({ id: 'negative', color: '#ffffff', td: -0.1 }), null);
});
