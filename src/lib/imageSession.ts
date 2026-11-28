/**
 * Recovery copy of the working image and its undo/redo history, so a crash,
 * reload, or dev hot reload does not lose unsaved edits.
 *
 * Each history image is stored once as an encoded Blob (imports keep their
 * original File, so they decode exactly as they did on import). A small
 * session record lists which snapshots form the current history. Every save
 * replaces the record and deletes snapshots it no longer lists in the same
 * transaction, so storage never holds images that left the undo stack.
 */
import {
    IMAGE_BLOB_STORE,
    IMAGE_SESSION_STORE,
    openKromacutDb,
    requestResult,
    transactionDone,
} from './kromacutDb.ts';

export const IMAGE_SESSION_VERSION = 1;
const SESSION_KEY = 'current';
/** History id for the bundled starter image, whose URL changes between builds. */
export const STARTER_IMAGE_ID = 'starter';
/** Undo and redo steps kept per side; older steps are not recovered. */
export const MAX_RECOVERED_HISTORY = 30;

export type ImageEntryKind = 'import' | 'edit';

export interface StoredImageEntry {
    kind: ImageEntryKind;
    blob: Blob;
}

export interface StoredImageSession {
    version: typeof IMAGE_SESSION_VERSION;
    current: string;
    past: string[];
    future: string[];
    savedAt: number;
}

export interface RecoveredImageEntry {
    id: string;
    /** Null for the starter image. */
    entry: StoredImageEntry | null;
}

export interface RecoveredImageSession {
    current: RecoveredImageEntry;
    past: RecoveredImageEntry[];
    future: RecoveredImageEntry[];
}

export interface ImageHistorySnapshot {
    current: string;
    past: string[];
    future: string[];
}

/**
 * The part of the history worth recovering, or null when there is nothing to
 * recover: no image (the user cleared it) or the starter image. Redo pops from
 * the end of `future`, so both sides keep their entries nearest the current image.
 */
export function planImageSessionSnapshot(
    imageSrc: string | null,
    past: readonly string[],
    future: readonly string[],
    starterSrc: string
): ImageHistorySnapshot | null {
    if (!imageSrc || imageSrc === starterSrc) return null;
    return {
        current: imageSrc,
        past: past.slice(-MAX_RECOVERED_HISTORY),
        future: future.slice(-MAX_RECOVERED_HISTORY),
    };
}

function isIdList(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((id) => typeof id === 'string' && id.length > 0);
}

export function parseImageSessionRecord(value: unknown): StoredImageSession | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (
        record.version !== IMAGE_SESSION_VERSION ||
        typeof record.current !== 'string' ||
        !record.current ||
        !isIdList(record.past) ||
        !isIdList(record.future)
    ) {
        return null;
    }
    return {
        version: IMAGE_SESSION_VERSION,
        current: record.current,
        past: record.past,
        future: record.future,
        savedAt: typeof record.savedAt === 'number' ? record.savedAt : 0,
    };
}

/**
 * How a snapshot is stored. Blobs stay on disk until read, but WebKit refuses
 * them in ephemeral sessions (Safari private windows, some embedded views), so
 * there the encoded bytes are stored instead.
 */
type StoredImageRecord =
    | StoredImageEntry
    | {
          kind: ImageEntryKind;
          bytes: ArrayBuffer;
          type: string;
          name?: string;
          lastModified?: number;
      };

export function parseStoredImageEntry(value: unknown): StoredImageEntry | null {
    if (!value || typeof value !== 'object' || typeof Blob === 'undefined') return null;
    const entry = value as Record<string, unknown>;
    if (entry.kind !== 'import' && entry.kind !== 'edit') return null;
    if (entry.bytes instanceof ArrayBuffer && entry.bytes.byteLength > 0) {
        const type = typeof entry.type === 'string' ? entry.type : '';
        const blob =
            typeof entry.name === 'string'
                ? new File([entry.bytes], entry.name, {
                      type,
                      lastModified:
                          typeof entry.lastModified === 'number' ? entry.lastModified : undefined,
                  })
                : new Blob([entry.bytes], { type });
        return { kind: entry.kind, blob };
    }
    if (!(entry.blob instanceof Blob) || entry.blob.size === 0) return null;
    return { kind: entry.kind, blob: entry.blob };
}

let blobStorageProbe: Promise<boolean> | null = null;

/** Whether this database accepts Blob values; probed once with a tiny Blob. */
function canStoreBlobs(db: IDBDatabase): Promise<boolean> {
    if (!blobStorageProbe) {
        blobStorageProbe = new Promise<boolean>((resolve) => {
            try {
                const transaction = db.transaction(IMAGE_BLOB_STORE, 'readwrite');
                const store = transaction.objectStore(IMAGE_BLOB_STORE);
                const probe = store.put(new Blob([new Uint8Array(1)]), '__blob-probe');
                probe.onerror = (event) => event.preventDefault();
                store.delete('__blob-probe');
                transaction.oncomplete = () => resolve(probe.error === null);
                transaction.onerror = () => resolve(false);
                transaction.onabort = () => resolve(false);
            } catch {
                resolve(false);
            }
        });
    }
    return blobStorageProbe;
}

async function toStoredRecord(
    entry: StoredImageEntry,
    asBytes: boolean
): Promise<StoredImageRecord> {
    if (!asBytes) return entry;
    const file = entry.blob instanceof File ? entry.blob : null;
    return {
        kind: entry.kind,
        bytes: await entry.blob.arrayBuffer(),
        type: entry.blob.type,
        ...(file ? { name: file.name, lastModified: file.lastModified } : {}),
    };
}

/**
 * Resolves the record's ids to stored snapshots. A missing or unreadable
 * current image makes the whole record unusable; missing history steps are
 * dropped so the rest of the undo stack still works.
 */
export function resolveImageSession(
    record: StoredImageSession,
    entries: ReadonlyMap<string, unknown>
): RecoveredImageSession | null {
    const resolve = (id: string): RecoveredImageEntry | null => {
        if (id === STARTER_IMAGE_ID) return { id, entry: null };
        const entry = parseStoredImageEntry(entries.get(id));
        return entry ? { id, entry } : null;
    };
    const current = resolve(record.current);
    if (!current || current.entry === null) return null;
    const list = (ids: string[]) =>
        ids.map(resolve).filter((entry): entry is RecoveredImageEntry => entry !== null);
    return { current, past: list(record.past), future: list(record.future) };
}

async function readStoredSession(): Promise<RecoveredImageSession | null> {
    const db = await openKromacutDb();
    if (!db) return null;
    const transaction = db.transaction([IMAGE_SESSION_STORE, IMAGE_BLOB_STORE], 'readonly');
    const done = transactionDone(transaction);
    const rawRecord = await requestResult(
        transaction.objectStore(IMAGE_SESSION_STORE).get(SESSION_KEY)
    );
    if (rawRecord === undefined) {
        await done;
        return null;
    }
    const record = parseImageSessionRecord(rawRecord);
    const entries = new Map<string, unknown>();
    if (record) {
        const blobs = transaction.objectStore(IMAGE_BLOB_STORE);
        const ids = [...new Set([record.current, ...record.past, ...record.future])].filter(
            (id) => id !== STARTER_IMAGE_ID
        );
        await Promise.all(
            ids.map(async (id) => entries.set(id, await requestResult(blobs.get(id))))
        );
    }
    await done;
    const session = record ? resolveImageSession(record, entries) : null;
    if (!session) {
        console.warn('Discarding an unreadable recovered image session');
        await clearImageSession();
    }
    return session;
}

let prefetched: Promise<RecoveredImageSession | null> | null = null;
let prefetchedHasSession: boolean | undefined;

/**
 * Reads the stored session once per page load. Startup calls this before the
 * app renders, so the first render already knows whether to wait for it.
 */
export function prefetchImageSession(): Promise<RecoveredImageSession | null> {
    if (!prefetched) {
        prefetched = readStoredSession().then(
            (session) => {
                prefetchedHasSession = session !== null;
                return session;
            },
            (error) => {
                console.warn('Recovered image session could not be read', error);
                prefetchedHasSession = false;
                return null;
            }
        );
    }
    return prefetched;
}

/** True or false once the prefetch finished; undefined while it is still running. */
export function hasPrefetchedImageSession(): boolean | undefined {
    return prefetchedHasSession;
}

/** False when IndexedDB cannot be used, so the image is simply not kept. */
export async function canStoreImageSession(): Promise<boolean> {
    return (await openKromacutDb()) !== null;
}

/**
 * Replaces the stored session. `newEntries` are the snapshots not stored yet;
 * every stored snapshot the new record does not list is deleted. The whole
 * change commits or fails together.
 */
export async function writeImageSession(
    snapshot: ImageHistorySnapshot,
    newEntries: ReadonlyMap<string, StoredImageEntry>
): Promise<void> {
    const db = await openKromacutDb();
    if (!db) throw new Error('IndexedDB is unavailable');
    const asBytes = !(await canStoreBlobs(db));
    // Read any bytes before the transaction starts; it cannot wait across awaits.
    const records = new Map<string, StoredImageRecord>();
    for (const [id, entry] of newEntries) records.set(id, await toStoredRecord(entry, asBytes));
    const referenced = new Set([snapshot.current, ...snapshot.past, ...snapshot.future]);
    const transaction = db.transaction([IMAGE_SESSION_STORE, IMAGE_BLOB_STORE], 'readwrite');
    const done = transactionDone(transaction);
    const blobs = transaction.objectStore(IMAGE_BLOB_STORE);
    for (const [id, record] of records) blobs.put(record, id);
    const record: StoredImageSession = {
        version: IMAGE_SESSION_VERSION,
        ...snapshot,
        savedAt: Date.now(),
    };
    transaction.objectStore(IMAGE_SESSION_STORE).put(record, SESSION_KEY);
    const keysRequest = blobs.getAllKeys();
    keysRequest.onsuccess = () => {
        for (const key of keysRequest.result) {
            if (typeof key !== 'string' || !referenced.has(key)) blobs.delete(key);
        }
    };
    await done;
}

/** Forgets the stored session and every stored snapshot. */
export async function clearImageSession(): Promise<void> {
    const db = await openKromacutDb();
    if (!db) return;
    const transaction = db.transaction([IMAGE_SESSION_STORE, IMAGE_BLOB_STORE], 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(IMAGE_SESSION_STORE).clear();
    transaction.objectStore(IMAGE_BLOB_STORE).clear();
    await done;
}
