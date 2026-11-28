import { prefetchImageSession } from './imageSession.ts';
import {
    initProfileStorage,
    listenForProfileChangesInOtherTabs,
    openIndexedDbProfileStore,
} from './profileStorage.ts';

// Past this, the app starts on localStorage profiles rather than wait longer.
const STARTUP_TIMEOUT_MS = 4000;

/**
 * Loads what the app reads synchronously on its first render: the profile
 * list (moving it out of localStorage on first run) and the recovered image
 * session. Never rejects; on a timeout the app starts with localStorage
 * profiles, and a late IndexedDB answer is ignored for this session.
 */
export function prepareAppStorage(): Promise<void> {
    let current = true;
    const work = Promise.all([
        initProfileStorage({
            openStore: openIndexedDbProfileStore,
            isCurrent: () => current,
        }).then((backend) => {
            if (backend === 'indexedDB') listenForProfileChangesInOtherTabs();
        }),
        prefetchImageSession(),
    ]).then(
        () => {},
        () => {}
    );
    const timeout = new Promise<void>((resolve) =>
        globalThis.setTimeout(() => {
            current = false;
            resolve();
        }, STARTUP_TIMEOUT_MS)
    );
    return Promise.race([work, timeout]);
}
