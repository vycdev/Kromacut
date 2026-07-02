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
