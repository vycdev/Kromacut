/**
 * Where the stored filament profile list lives.
 *
 * Profiles carry calibration evidence and outgrow localStorage's per-site cap,
 * so they are kept in IndexedDB. The list is stored as the same JSON text that
 * localStorage held, under the same key name, so parsing, sanitizing and
 * `.kfil` files are unchanged.
 *
 * Reads stay synchronous: startup loads the stored text into memory, and saves
 * update that copy at once and write it to IndexedDB in order behind it. When
 * IndexedDB cannot be opened or read, or a write fails, storage falls back to
 * localStorage, which is the behavior before this module existed.
 */

import { KV_STORE, openKromacutDb, requestResult, transactionDone } from './kromacutDb.ts';

export const PROFILES_STORAGE_KEY = 'kromacut.autopaint.profiles';

/** One stored text value; the IndexedDB adapter is swapped for a fake in tests. */
export interface ProfileRecordStore {
    read(): Promise<string | null>;
    write(raw: string): Promise<void>;
}

export type ProfileStorageBackend = 'indexedDB' | 'localStorage';

type StorageMode =
    | { kind: 'localStorage' }
    | { kind: 'indexedDB'; store: ProfileRecordStore; raw: string | null };

let mode: StorageMode = { kind: 'localStorage' };
let queuedRaw: string | null = null;
let flushing: Promise<void> | null = null;
const failureListeners = new Set<() => void>();

let testStorage: Storage | null = null;

function localStore(): Storage | null {
    if (testStorage) return testStorage;
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

export function profileStorageBackend(): ProfileStorageBackend {
    return mode.kind;
}

/** The stored profile list text, or null when nothing is stored. May throw in localStorage mode. */
export function readStoredProfiles(): string | null {
    if (mode.kind === 'indexedDB') return mode.raw;
    const storage = localStore();
    if (!storage) throw new Error('Browser storage is unavailable');
    return storage.getItem(PROFILES_STORAGE_KEY);
}

/**
 * Stores the profile list text. In localStorage mode a full quota throws, as
 * before. In IndexedDB mode the in-memory copy changes at once and the write
 * completes later; a failed write is retried in localStorage and reported to
 * `subscribeToProfileSaveFailures` listeners only if that fails too.
 */
export function writeStoredProfiles(raw: string): void {
    if (mode.kind === 'indexedDB') {
        mode.raw = raw;
        queuedRaw = raw;
        if (!flushing) flushing = flushQueuedWrites(mode.store);
        return;
    }
    const storage = localStore();
    if (!storage) throw new Error('Browser storage is unavailable');
    storage.setItem(PROFILES_STORAGE_KEY, raw);
}

async function flushQueuedWrites(store: ProfileRecordStore): Promise<void> {
    try {
        // Only the latest list matters; skip lists that a newer save replaced.
        while (queuedRaw !== null) {
            const raw = queuedRaw;
            queuedRaw = null;
            try {
                await store.write(raw);
                announceProfilesChanged();
            } catch (error) {
                console.warn('Saving profiles to IndexedDB failed', error);
                fallBackToLocalStorage(queuedRaw ?? raw);
                queuedRaw = null;
            }
        }
    } finally {
        flushing = null;
    }
}

function fallBackToLocalStorage(raw: string): void {
    try {
        const storage = localStore();
        if (!storage) throw new Error('Browser storage is unavailable');
        storage.setItem(PROFILES_STORAGE_KEY, raw);
        // The next startup merges this copy back into IndexedDB.
        mode = { kind: 'localStorage' };
    } catch (error) {
        // Keep the in-memory list and try IndexedDB again on the next save.
        console.warn('Saving profiles to localStorage failed', error);
        for (const listener of failureListeners) listener();
    }
}

/** Notifies when a save already shown as done could not be stored anywhere. */
export function subscribeToProfileSaveFailures(listener: () => void): () => void {
    failureListeners.add(listener);
    return () => failureListeners.delete(listener);
}

/** Resolves once queued IndexedDB writes have finished (for tests and shutdown paths). */
export async function flushStoredProfiles(): Promise<void> {
    while (flushing) await flushing;
}

type RawProfile = { id?: unknown; updatedAt?: unknown };

function parseList(raw: string | null): RawProfile[] | null {
    if (raw === null) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function updatedAt(profile: RawProfile): number {
    return typeof profile?.updatedAt === 'number' && Number.isFinite(profile.updatedAt)
        ? profile.updatedAt
        : -Infinity;
}

/**
 * Combines a localStorage list with the IndexedDB list without dropping either
 * side's profiles. localStorage only holds a list that was written after the
 * last migration: data from before this storage change, a fallback save after
 * an IndexedDB failure, or a save from an older app version. For a profile in
 * both lists the newer `updatedAt` wins, and localStorage wins a tie. Returns
 * null when the localStorage text is not a profile list.
 */
export function mergeStoredProfileLists(
    localRaw: string,
    indexedRaw: string | null
): string | null {
    const local = parseList(localRaw);
    if (!local) return null;
    const indexed = parseList(indexedRaw) ?? [];
    if (indexed.length === 0) return localRaw;
    const indexedById = new Map<unknown, RawProfile>();
    for (const profile of indexed) {
        if (profile && !indexedById.has(profile.id)) indexedById.set(profile.id, profile);
    }
    const localIds = new Set(local.map((profile) => profile?.id));
    const merged = local.map((profile) => {
        const other = profile ? indexedById.get(profile.id) : undefined;
        return other && updatedAt(other) > updatedAt(profile) ? other : profile;
    });
    for (const profile of indexed) {
        if (profile && !localIds.has(profile.id)) merged.push(profile);
    }
    const mergedRaw = JSON.stringify(merged);
    return mergedRaw === indexedRaw ? indexedRaw : mergedRaw;
}

export interface InitProfileStorageOptions {
    /** Opens the IndexedDB record, or resolves null when IndexedDB cannot be used. */
    openStore: () => Promise<ProfileRecordStore | null>;
    storage?: Storage | null;
    /** Returns false once startup stopped waiting, so a late result changes nothing. */
    isCurrent?: () => boolean;
}

/**
 * Chooses the profile backend for this session and moves a localStorage list
 * into IndexedDB. The localStorage copy is removed only after the IndexedDB
 * write has committed and reads back identical, and only if no other tab has
 * changed it meanwhile. Any failure leaves localStorage untouched and keeps
 * using it, so running this again (after an interruption) is always safe.
 */
export async function initProfileStorage({
    openStore,
    storage = localStore(),
    isCurrent = () => true,
}: InitProfileStorageOptions): Promise<ProfileStorageBackend> {
    try {
        const store = await openStore();
        if (!store || !isCurrent()) return mode.kind;
        const indexedRaw = await store.read();
        let localRaw: string | null = null;
        try {
            localRaw = storage?.getItem(PROFILES_STORAGE_KEY) ?? null;
        } catch {
            localRaw = null;
        }
        if (!isCurrent()) return mode.kind;
        if (localRaw === null) {
            mode = { kind: 'indexedDB', store, raw: indexedRaw };
            return mode.kind;
        }
        const merged = mergeStoredProfileLists(localRaw, indexedRaw);
        if (merged === null) {
            // Unreadable localStorage text loads as no profiles; leave it alone.
            if (indexedRaw !== null) mode = { kind: 'indexedDB', store, raw: indexedRaw };
            return mode.kind;
        }
        if (merged !== indexedRaw) {
            await store.write(merged);
            if ((await store.read()) !== merged) {
                throw new Error('Migrated profiles did not read back intact');
            }
        }
        if (!isCurrent()) return mode.kind;
        mode = { kind: 'indexedDB', store, raw: merged };
        try {
            if (storage?.getItem(PROFILES_STORAGE_KEY) === localRaw) {
                storage.removeItem(PROFILES_STORAGE_KEY);
            }
        } catch {
            // A copy left behind merges again on the next startup.
        }
        return mode.kind;
    } catch (error) {
        console.warn('Profile storage stays in localStorage', error);
        return mode.kind;
    }
}

/** Returns to localStorage mode and drops queued state (tests only). */
export function resetProfileStorageForTests(storage: Storage | null = null): void {
    testStorage = storage;
    mode = { kind: 'localStorage' };
    queuedRaw = null;
    flushing = null;
}

const PROFILE_CHANNEL = 'kromacut.autopaint.profiles';
let channel: BroadcastChannel | null = null;

function announceProfilesChanged(): void {
    try {
        channel?.postMessage('changed');
    } catch {
        // Other tabs refresh on their next startup instead.
    }
}

/**
 * Keeps the in-memory copy in step with saves from other tabs, so a profile
 * panel opened later shows them, as it did when every read went to localStorage.
 */
export function listenForProfileChangesInOtherTabs(): void {
    if (channel || typeof BroadcastChannel === 'undefined') return;
    channel = new BroadcastChannel(PROFILE_CHANNEL);
    channel.onmessage = () => {
        const current = mode;
        if (current.kind !== 'indexedDB') return;
        void current.store.read().then(
            (raw) => {
                // A local save since then is newer than what the other tab wrote.
                if (mode !== current || queuedRaw !== null || flushing) return;
                current.raw = raw;
            },
            () => {}
        );
    };
}

/** The profile list record in the app database, under the localStorage key name. */
export async function openIndexedDbProfileStore(): Promise<ProfileRecordStore | null> {
    const db = await openKromacutDb();
    if (!db) return null;
    return {
        async read() {
            const transaction = db.transaction(KV_STORE, 'readonly');
            const value = await requestResult(
                transaction.objectStore(KV_STORE).get(PROFILES_STORAGE_KEY)
            );
            return typeof value === 'string' ? value : null;
        },
        async write(raw) {
            const transaction = db.transaction(KV_STORE, 'readwrite');
            transaction.objectStore(KV_STORE).put(raw, PROFILES_STORAGE_KEY);
            await transactionDone(transaction);
        },
    };
}
