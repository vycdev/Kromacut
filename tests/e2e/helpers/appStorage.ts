import type { Page } from '@playwright/test';

/**
 * Reads and writes the app's IndexedDB records from a spec. Opening never creates the
 * database: before the app has created it, reads return null, so a spec cannot leave behind
 * an empty database that the app would then fail to use.
 */

export const PROFILES_KEY = 'kromacut.autopaint.profiles';

/**
 * The stored profile list text. The app keeps it in IndexedDB and falls back to localStorage
 * when IndexedDB is unusable, so either location counts; localStorage only holds the list in
 * that fallback, or before the one-time move.
 */
export function storedProfilesText(page: Page): Promise<string | null> {
    return page.evaluate(async (key) => {
        const local = localStorage.getItem(key);
        if (local !== null) return local;
        const db = await new Promise<IDBDatabase | null>((resolve) => {
            const request = indexedDB.open('kromacut');
            request.onupgradeneeded = () => request.transaction?.abort();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
        if (!db) return null;
        try {
            const value = await new Promise<unknown>((resolve, reject) => {
                const request = db.transaction('kv').objectStore('kv').get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            return typeof value === 'string' ? value : null;
        } finally {
            db.close();
        }
    }, PROFILES_KEY);
}

export async function storedProfiles<T = Record<string, unknown>>(page: Page): Promise<T[]> {
    return JSON.parse((await storedProfilesText(page)) ?? '[]') as T[];
}

/** Replaces the stored profile list wherever the app currently keeps it. */
export function writeStoredProfilesText(page: Page, raw: string): Promise<void> {
    return page.evaluate(
        async ({ key, raw }) => {
            if (localStorage.getItem(key) !== null) {
                localStorage.setItem(key, raw);
                return;
            }
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open('kromacut');
                request.onupgradeneeded = () => request.transaction?.abort();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            try {
                await new Promise<void>((resolve, reject) => {
                    const transaction = db.transaction('kv', 'readwrite');
                    transaction.objectStore('kv').put(raw, key);
                    transaction.oncomplete = () => resolve();
                    transaction.onerror = () => reject(transaction.error);
                });
            } finally {
                db.close();
            }
        },
        { key: PROFILES_KEY, raw }
    );
}

export interface StoredImageSessionState {
    record: { current: string; past: string[]; future: string[] } | null;
    blobs: { id: string; kind: unknown; size: number; type: string }[];
}

/** The recovered image session record and the snapshots stored for it. */
export function storedImageSession(page: Page): Promise<StoredImageSessionState | null> {
    return page.evaluate(async () => {
        const db = await new Promise<IDBDatabase | null>((resolve) => {
            const request = indexedDB.open('kromacut');
            request.onupgradeneeded = () => request.transaction?.abort();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
        if (!db) return null;
        try {
            const transaction = db.transaction(['imageSession', 'imageBlobs']);
            const read = <T>(request: IDBRequest<T>) =>
                new Promise<T>((resolve, reject) => {
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            const record = await read(transaction.objectStore('imageSession').get('current'));
            const blobStore = transaction.objectStore('imageBlobs');
            const keys = (await read(blobStore.getAllKeys())) as string[];
            // Snapshots are Blobs, or their bytes where the browser refuses Blobs (WebKit
            // ephemeral sessions).
            const values = (await read(blobStore.getAll())) as {
                kind: unknown;
                blob?: Blob;
                bytes?: ArrayBuffer;
                type?: string;
            }[];
            return {
                record: (record ?? null) as StoredImageSessionState['record'],
                blobs: keys.map((id, index) => ({
                    id,
                    kind: values[index]?.kind,
                    size: values[index]?.blob?.size ?? values[index]?.bytes?.byteLength ?? 0,
                    type: values[index]?.blob?.type ?? values[index]?.type ?? '',
                })),
            };
        } finally {
            db.close();
        }
    });
}
