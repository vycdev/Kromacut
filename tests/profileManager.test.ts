import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer } from 'vite';

import type { AutoPaintProfile } from '../src/lib/profileManager.ts';

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
            filaments: [
                { id: 'f-uncal', color: '#ffffff', td: 4.0 },
            ],
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
