import { useCallback, useEffect, useRef } from 'react';
import { loadImageCanvas } from '../lib/imageCanvas';
import {
    canStoreImageSession,
    clearImageSession,
    planImageSessionSnapshot,
    prefetchImageSession,
    STARTER_IMAGE_ID,
    writeImageSession,
    type RecoveredImageEntry,
    type StoredImageEntry,
} from '../lib/imageSession';
import type { useImageCanvas } from './useImageCanvas';
import type { useImageHistory } from './useImageHistory';

// Coalesce bursts such as touch-up strokes into one write.
const SAVE_DELAY_MS = 400;

interface Params {
    imageSrc: string | null;
    past: readonly string[];
    future: readonly string[];
    /** The bundled starter image, which is never stored. */
    starterSrc: string;
    /** The image history started with: the starter, or nothing while a session is pending. */
    initialSrc: string | null;
    restore: ReturnType<typeof useImageHistory>['restore'];
    prepareImageCanvas: ReturnType<typeof useImageCanvas>['prepareImageCanvas'];
    adoptImportedFile: ReturnType<typeof useImageCanvas>['adoptImportedFile'];
    importedFileFor: ReturnType<typeof useImageCanvas>['importedFileFor'];
}

function revokeAll(urls: readonly string[]) {
    for (const url of urls) URL.revokeObjectURL(url);
}

/**
 * Restores the image session stored before a crash or reload, then keeps the
 * stored copy in step with image history. Nothing is written until the
 * restore has finished or been refused, so startup never overwrites the
 * session it is about to recover.
 */
export function useImageSessionRecovery({
    imageSrc,
    past,
    future,
    starterSrc,
    initialSrc,
    restore,
    prepareImageCanvas,
    adoptImportedFile,
    importedFileFor,
}: Params) {
    const latestRef = useRef({ imageSrc, past, future });
    // Any image change before recovery finishes is the user's choice, and it wins.
    const touchedRef = useRef(false);
    const saverRef = useRef({
        ready: false,
        saving: false,
        dirty: false,
        timer: null as number | null,
        // Stored snapshot ids for the URLs in the last saved session.
        idsByUrl: new Map<string, string>(),
    });

    const save = useCallback(async () => {
        const saver = saverRef.current;
        if (saver.timer !== null) window.clearTimeout(saver.timer);
        saver.timer = null;
        if (saver.saving) {
            saver.dirty = true;
            return;
        }
        saver.saving = true;
        try {
            if (!(await canStoreImageSession())) return;
            do {
                saver.dirty = false;
                const { imageSrc, past, future } = latestRef.current;
                const plan = planImageSessionSnapshot(imageSrc, past, future, starterSrc);
                try {
                    if (!plan) {
                        // Cleared, or back to the starter: nothing to bring back.
                        saver.idsByUrl = new Map();
                        await clearImageSession();
                        continue;
                    }
                    const idsByUrl = new Map<string, string>();
                    const newEntries = new Map<string, StoredImageEntry>();
                    // One snapshot at a time keeps at most one transient copy in memory.
                    const idFor = async (src: string) => {
                        if (src === starterSrc) return STARTER_IMAGE_ID;
                        let id = saver.idsByUrl.get(src) ?? idsByUrl.get(src);
                        if (!id) {
                            id = crypto.randomUUID();
                            const file = importedFileFor(src);
                            const blob = file ?? (await (await fetch(src)).blob());
                            newEntries.set(id, { kind: file ? 'import' : 'edit', blob });
                        }
                        idsByUrl.set(src, id);
                        return id;
                    };
                    const ids = async (list: string[]) => {
                        const result: string[] = [];
                        for (const src of list) result.push(await idFor(src));
                        return result;
                    };
                    const snapshot = {
                        current: await idFor(plan.current),
                        past: await ids(plan.past),
                        future: await ids(plan.future),
                    };
                    await writeImageSession(snapshot, newEntries);
                    saver.idsByUrl = idsByUrl;
                } catch (error) {
                    // A stale copy must not come back as the current image.
                    console.warn('Image recovery copy could not be saved', error);
                    saver.idsByUrl = new Map();
                    await clearImageSession().catch(() => {});
                }
            } while (saver.dirty);
        } finally {
            saver.saving = false;
        }
    }, [importedFileFor, starterSrc]);

    const scheduleSave = useCallback(() => {
        const saver = saverRef.current;
        if (!saver.ready) return;
        if (saver.timer !== null) window.clearTimeout(saver.timer);
        saver.timer = window.setTimeout(() => void save(), SAVE_DELAY_MS);
    }, [save]);

    useEffect(() => {
        latestRef.current = { imageSrc, past, future };
        if (imageSrc !== initialSrc || past.length > 0 || future.length > 0) {
            touchedRef.current = true;
        }
        scheduleSave();
    }, [imageSrc, past, future, initialSrc, scheduleSave]);

    // Write a pending change at once when the page is hidden or closed.
    useEffect(() => {
        const flush = () => {
            if (saverRef.current.timer !== null) void save();
        };
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') flush();
        };
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('pagehide', flush);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [save]);

    useEffect(() => {
        let cancelled = false;
        const created: string[] = [];
        const finish = () => {
            if (cancelled) return;
            saverRef.current.ready = true;
            scheduleSave();
        };
        void (async () => {
            const session = await prefetchImageSession();
            if (cancelled) return;
            if (!session || touchedRef.current) {
                finish();
                return;
            }
            const toUrl = ({ entry }: RecoveredImageEntry) => {
                if (!entry) return starterSrc;
                const url = URL.createObjectURL(entry.blob);
                created.push(url);
                return url;
            };
            const current = session.current.entry!;
            const currentUrl = toUrl(session.current);
            const canvas = await loadImageCanvas(
                currentUrl,
                () => !cancelled,
                current.kind === 'import' ? current.blob : undefined
            ).catch(() => null);
            if (cancelled) {
                revokeAll(created);
                return;
            }
            if (!canvas) {
                console.warn('Discarding a recovered image that could not be decoded');
                revokeAll(created);
                await clearImageSession().catch(() => {});
                if (cancelled) return;
                if (!touchedRef.current) restore({ imageSrc: starterSrc, past: [], future: [] });
                finish();
                return;
            }
            if (touchedRef.current) {
                revokeAll(created);
                finish();
                return;
            }
            const pastUrls = session.past.map(toUrl);
            const futureUrls = session.future.map(toUrl);
            restore({ imageSrc: currentUrl, past: pastUrls, future: futureUrls });
            const idsByUrl = new Map<string, string>();
            const entries = [session.current, ...session.past, ...session.future];
            const urls = [currentUrl, ...pastUrls, ...futureUrls];
            entries.forEach(({ id, entry }, index) => {
                if (!entry) return;
                idsByUrl.set(urls[index], id);
                if (entry.kind === 'import') adoptImportedFile(urls[index], entry.blob);
            });
            prepareImageCanvas(currentUrl, canvas);
            saverRef.current.idsByUrl = idsByUrl;
            finish();
        })();
        return () => {
            cancelled = true;
        };
        // Recovery runs once per mount; later renders only save.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
