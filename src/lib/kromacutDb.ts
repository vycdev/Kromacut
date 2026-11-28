/**
 * The app's IndexedDB database. It holds records too large for localStorage:
 * filament profiles with their calibration evidence, and the recovered image
 * session. Every caller must cope with `openKromacutDb()` resolving to null,
 * which means IndexedDB is missing, blocked, or too slow to answer (private
 * windows, blocked site data, some embedded WebViews).
 */

const DB_NAME = 'kromacut';
const DB_VERSION = 1;
// A blocked or hung open must not hold the app's startup.
const OPEN_TIMEOUT_MS = 3000;

/** Key/value records, such as the stored profile list. */
export const KV_STORE = 'kv';
/** Encoded image snapshots, keyed by entry id. */
export const IMAGE_BLOB_STORE = 'imageBlobs';
/** The recovered image session: which snapshots make up the current history. */
export const IMAGE_SESSION_STORE = 'imageSession';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (db: IDBDatabase | null) => {
            if (settled) {
                db?.close();
                return;
            }
            settled = true;
            globalThis.clearTimeout(timer);
            resolve(db);
        };
        const timer = globalThis.setTimeout(() => finish(null), OPEN_TIMEOUT_MS);
        let request: IDBOpenDBRequest;
        try {
            if (typeof indexedDB === 'undefined') {
                finish(null);
                return;
            }
            request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch {
            finish(null);
            return;
        }
        request.onupgradeneeded = () => {
            const db = request.result;
            for (const name of [KV_STORE, IMAGE_BLOB_STORE, IMAGE_SESSION_STORE]) {
                if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            // Let a newer app version upgrade the schema from another tab.
            db.onversionchange = () => {
                db.close();
                dbPromise = null;
            };
            db.onclose = () => {
                dbPromise = null;
            };
            finish(db);
        };
        request.onerror = () => finish(null);
        request.onblocked = () => finish(null);
    });
}

/**
 * Opens (once) the shared database, or resolves null when IndexedDB cannot be
 * used. A failed open is not retried: blocked storage stays blocked for the
 * page's lifetime, and retrying would add the open timeout to every save.
 */
export function openKromacutDb(): Promise<IDBDatabase | null> {
    if (!dbPromise) dbPromise = openDb();
    return dbPromise;
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
}

/** Resolves once the transaction has committed; this is the durable-write confirmation. */
export function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
            reject(transaction.error ?? new Error('IndexedDB transaction failed'));
        transaction.onabort = () =>
            reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
}
