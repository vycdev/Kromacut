import test from 'node:test';
import assert from 'node:assert/strict';

import {
    flushStoredProfiles,
    initProfileStorage,
    mergeStoredProfileLists,
    profileStorageBackend,
    PROFILES_STORAGE_KEY,
    readStoredProfiles,
    resetProfileStorageForTests,
    subscribeToProfileSaveFailures,
    writeStoredProfiles,
    type ProfileRecordStore,
} from '../src/lib/profileStorage.ts';
import { createProfile, loadProfiles, saveProfilesToStorage } from '../src/lib/profileManager.ts';

const LAST_PROFILE_KEY = 'kromacut.autopaint.lastProfileId';

function createMemoryStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
        values,
        get length() {
            return values.size;
        },
        key: (index: number) => [...values.keys()][index] ?? null,
        clear: () => values.clear(),
        getItem: (key: string) => (values.has(key) ? values.get(key)! : null),
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
        removeItem: (key: string) => {
            values.delete(key);
        },
    };
}

type MemoryStorage = ReturnType<typeof createMemoryStorage>;

function createRecordStore(initial: string | null = null) {
    const store = {
        value: initial,
        writes: [] as string[],
        failWrites: false,
        failReads: false,
        corruptReadBack: false,
        async read() {
            if (store.failReads) throw new Error('read failed');
            return store.corruptReadBack && store.value !== null
                ? store.value.slice(0, -1)
                : store.value;
        },
        async write(raw: string) {
            if (store.failWrites) throw new Error('QuotaExceededError');
            store.writes.push(raw);
            store.value = raw;
        },
    };
    return store satisfies ProfileRecordStore;
}

function profileList(...profiles: { id: string; name?: string; updatedAt?: number }[]) {
    return JSON.stringify(
        profiles.map((profile) => ({
            name: profile.id,
            version: 3,
            filaments: [{ id: `${profile.id}-f`, color: '#112233', td: 0.5 }],
            createdAt: 1,
            updatedAt: 1,
            ...profile,
        }))
    );
}

/** Runs one test against fresh module state with a memory localStorage. */
async function withStorage(storage: MemoryStorage, run: () => Promise<void>) {
    resetProfileStorageForTests(storage);
    // Failure paths log on purpose; keep the test output readable.
    const warn = console.warn;
    console.warn = () => {};
    try {
        await run();
    } finally {
        await flushStoredProfiles();
        console.warn = warn;
        resetProfileStorageForTests();
    }
}

test('fresh install stores profiles in IndexedDB and leaves localStorage alone', async () => {
    const storage = createMemoryStorage();
    const store = createRecordStore();
    await withStorage(storage, async () => {
        const backend = await initProfileStorage({ openStore: async () => store, storage });
        assert.equal(backend, 'indexedDB');
        assert.deepEqual(loadProfiles(), []);
        assert.deepEqual(store.writes, []);

        const profile = createProfile('First', [{ id: 'a', color: '#ffffff', td: 0.4 }]);
        assert.equal(saveProfilesToStorage([profile]), true);
        await flushStoredProfiles();

        assert.equal(store.value, JSON.stringify([profile]));
        assert.equal(storage.getItem(PROFILES_STORAGE_KEY), null);
        assert.deepEqual(
            loadProfiles().map((p) => p.id),
            [profile.id]
        );
    });
});

test('existing localStorage profiles move to IndexedDB unchanged', async () => {
    const raw = profileList({ id: 'one' }, { id: 'two' });
    const storage = createMemoryStorage({
        [PROFILES_STORAGE_KEY]: raw,
        [LAST_PROFILE_KEY]: 'two',
        'kromacut.autopaint.v1': '{"paintMode":"autopaint"}',
    });
    const store = createRecordStore();
    await withStorage(storage, async () => {
        const backend = await initProfileStorage({ openStore: async () => store, storage });

        assert.equal(backend, 'indexedDB');
        // The stored text is byte-identical, so nothing is re-sanitized or reordered.
        assert.equal(store.value, raw);
        assert.equal(storage.getItem(PROFILES_STORAGE_KEY), null);
        // Other keys keep their names and values.
        assert.equal(storage.getItem(LAST_PROFILE_KEY), 'two');
        assert.equal(storage.getItem('kromacut.autopaint.v1'), '{"paintMode":"autopaint"}');
        assert.deepEqual(
            loadProfiles().map((profile) => profile.id),
            ['one', 'two']
        );
    });
});

test('an interrupted migration finishes on the next startup without duplicating profiles', async () => {
    const raw = profileList({ id: 'one' }, { id: 'two' });
    // The previous run wrote IndexedDB but stopped before removing the localStorage copy.
    const storage = createMemoryStorage({ [PROFILES_STORAGE_KEY]: raw });
    const store = createRecordStore(raw);
    await withStorage(storage, async () => {
        assert.equal(
            await initProfileStorage({ openStore: async () => store, storage }),
            'indexedDB'
        );
        assert.equal(store.value, raw);
        assert.deepEqual(store.writes, [], 'identical data needs no second write');
        assert.equal(storage.getItem(PROFILES_STORAGE_KEY), null);
        assert.deepEqual(
            loadProfiles().map((profile) => profile.id),
            ['one', 'two']
        );
    });

    // Running it again is a no-op.
    await withStorage(storage, async () => {
        assert.equal(
            await initProfileStorage({ openStore: async () => store, storage }),
            'indexedDB'
        );
        assert.equal(store.value, raw);
        assert.deepEqual(store.writes, []);
    });
});

test('a failed IndexedDB write keeps the localStorage profiles and backend', async () => {
    const raw = profileList({ id: 'one' });
    const storage = createMemoryStorage({ [PROFILES_STORAGE_KEY]: raw });
    const store = createRecordStore();
    store.failWrites = true;
    await withStorage(storage, async () => {
        assert.equal(
            await initProfileStorage({ openStore: async () => store, storage }),
            'localStorage'
        );
        assert.equal(storage.getItem(PROFILES_STORAGE_KEY), raw);
        assert.deepEqual(
            loadProfiles().map((profile) => profile.id),
            ['one']
        );

        // Saving keeps working exactly as before: synchronously, in localStorage.
        const profile = createProfile('Second', [{ id: 'b', color: '#000000', td: 0.3 }]);
        assert.equal(saveProfilesToStorage([...loadProfiles(), profile]), true);
        assert.equal(JSON.parse(storage.getItem(PROFILES_STORAGE_KEY)!).length, 2);
    });
});

test('a migration that does not read back intact keeps localStorage', async () => {
    const raw = profileList({ id: 'one' });
    const storage = createMemoryStorage({ [PROFILES_STORAGE_KEY]: raw });
    const store = createRecordStore();
    store.corruptReadBack = true;
    await withStorage(storage, async () => {
        assert.equal(
            await initProfileStorage({ openStore: async () => store, storage }),
            'localStorage'
        );
        assert.equal(storage.getItem(PROFILES_STORAGE_KEY), raw);
    });
});

test('unavailable or unreadable IndexedDB falls back to localStorage', async () => {
    const raw = profileList({ id: 'one' });
    for (const openStore of [
        async () => null,
        async () => {
            throw new Error('SecurityError');
        },
        async () => {
            const store = createRecordStore();
            store.failReads = true;
            return store;
        },
    ]) {
        const storage = createMemoryStorage({ [PROFILES_STORAGE_KEY]: raw });
        await withStorage(storage, async () => {
            assert.equal(await initProfileStorage({ openStore, storage }), 'localStorage');
            assert.equal(profileStorageBackend(), 'localStorage');
            assert.equal(storage.getItem(PROFILES_STORAGE_KEY), raw);
            assert.equal(readStoredProfiles(), raw);
        });
    }
});

test('a late IndexedDB answer after startup stopped waiting changes nothing', async () => {
    const raw = profileList({ id: 'one' });
    const storage = createMemoryStorage({ [PROFILES_STORAGE_KEY]: raw });
    const store = createRecordStore();
    await withStorage(storage, async () => {
        let current = true;
        const backend = initProfileStorage({
            openStore: async () => {
                current = false;
                return store;
            },
            storage,
            isCurrent: () => current,
        });
        assert.equal(await backend, 'localStorage');
        assert.equal(storage.getItem(PROFILES_STORAGE_KEY), raw);
        assert.deepEqual(store.writes, []);
    });
});

test('migration keeps a localStorage copy that another tab changed meanwhile', async () => {
    const raw = profileList({ id: 'one' });
    const newer = profileList({ id: 'one' }, { id: 'other-tab' });
    const storage = createMemoryStorage({ [PROFILES_STORAGE_KEY]: raw });
    const store = createRecordStore();
    const write = store.write;
    store.write = async (value) => {
        await write(value);
        storage.setItem(PROFILES_STORAGE_KEY, newer);
    };
    await withStorage(storage, async () => {
        await initProfileStorage({ openStore: async () => store, storage });
        assert.equal(storage.getItem(PROFILES_STORAGE_KEY), newer);
    });
    // The next startup merges the other tab's profile in.
    await withStorage(storage, async () => {
        await initProfileStorage({ openStore: async () => store, storage });
        assert.equal(storage.getItem(PROFILES_STORAGE_KEY), null);
        assert.deepEqual(
            loadProfiles().map((profile) => profile.id),
            ['one', 'other-tab']
        );
    });
});

test('unreadable localStorage text is left untouched', async () => {
    const storage = createMemoryStorage({ [PROFILES_STORAGE_KEY]: '{not json' });
    const store = createRecordStore();
    await withStorage(storage, async () => {
        assert.equal(
            await initProfileStorage({ openStore: async () => store, storage }),
            'localStorage'
        );
        assert.equal(storage.getItem(PROFILES_STORAGE_KEY), '{not json');
        assert.deepEqual(store.writes, []);
    });
});

test('merging keeps profiles from both copies and the newer version of each', () => {
    const local = profileList(
        { id: 'shared-old-local', updatedAt: 5 },
        { id: 'shared-new-local', updatedAt: 9 },
        { id: 'local-only' }
    );
    const indexed = profileList(
        { id: 'shared-old-local', name: 'from IndexedDB', updatedAt: 7 },
        { id: 'shared-new-local', name: 'from IndexedDB', updatedAt: 8 },
        { id: 'indexed-only' }
    );
    const merged = JSON.parse(mergeStoredProfileLists(local, indexed)!);
    assert.deepEqual(
        merged.map((profile: { id: string; name: string }) => [profile.id, profile.name]),
        [
            ['shared-old-local', 'from IndexedDB'],
            ['shared-new-local', 'shared-new-local'],
            ['local-only', 'local-only'],
            ['indexed-only', 'indexed-only'],
        ]
    );
    assert.equal(mergeStoredProfileLists(local, null), local);
    assert.equal(mergeStoredProfileLists('null', indexed), null);
});

test('a failed background write falls back to localStorage', async () => {
    const storage = createMemoryStorage();
    const store = createRecordStore();
    await withStorage(storage, async () => {
        await initProfileStorage({ openStore: async () => store, storage });
        store.failWrites = true;
        const profile = createProfile('Kept', [{ id: 'a', color: '#ffffff', td: 0.4 }]);
        assert.equal(saveProfilesToStorage([profile]), true);
        await flushStoredProfiles();

        assert.equal(profileStorageBackend(), 'localStorage');
        assert.equal(storage.getItem(PROFILES_STORAGE_KEY), JSON.stringify([profile]));
        assert.deepEqual(
            loadProfiles().map((p) => p.id),
            [profile.id]
        );
    });
    // The next startup moves the fallback copy back into IndexedDB.
    store.failWrites = false;
    await withStorage(storage, async () => {
        await initProfileStorage({ openStore: async () => store, storage });
        assert.equal(storage.getItem(PROFILES_STORAGE_KEY), null);
        assert.equal(JSON.parse(store.value!)[0].name, 'Kept');
    });
});

test('a write that fails in both stores is reported and retried on the next save', async () => {
    const storage = createMemoryStorage();
    storage.setItem = () => {
        throw new Error('QuotaExceededError');
    };
    const store = createRecordStore();
    await withStorage(storage, async () => {
        await initProfileStorage({ openStore: async () => store, storage });
        let failures = 0;
        const unsubscribe = subscribeToProfileSaveFailures(() => failures++);
        store.failWrites = true;
        writeStoredProfiles(profileList({ id: 'first' }));
        await flushStoredProfiles();
        assert.equal(failures, 1);
        assert.equal(profileStorageBackend(), 'indexedDB');
        assert.equal(readStoredProfiles(), profileList({ id: 'first' }));

        store.failWrites = false;
        writeStoredProfiles(profileList({ id: 'first' }, { id: 'second' }));
        await flushStoredProfiles();
        assert.equal(failures, 1);
        assert.equal(store.value, profileList({ id: 'first' }, { id: 'second' }));
        unsubscribe();
    });
});

test('rapid saves write in order and end with the latest list', async () => {
    const storage = createMemoryStorage();
    const store = createRecordStore();
    await withStorage(storage, async () => {
        await initProfileStorage({ openStore: async () => store, storage });
        for (let count = 1; count <= 5; count++) {
            writeStoredProfiles(
                profileList(...Array.from({ length: count }, (_, index) => ({ id: `p${index}` })))
            );
        }
        await flushStoredProfiles();
        assert.equal(JSON.parse(store.value!).length, 5);
        assert.ok(store.writes.length <= 2, 'superseded lists are skipped');
    });
});
