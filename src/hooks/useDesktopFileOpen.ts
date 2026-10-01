import { useState, useSyncExternalStore } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createDesktopFileInbox, type DesktopOpenedFile } from '../lib/desktopFileInbox';

let inbox: ReturnType<typeof createDesktopFileInbox> | undefined;
const emptySnapshot = () => null;
const emptySubscribe = () => () => {};
const emptyFinish = () => {};

export function useDesktopFileOpen() {
    const [desktop] = useState(isTauri);
    if (desktop && !inbox) {
        inbox = createDesktopFileInbox({
            listen: (onFiles) => listen('kromacut-opened-files', onFiles),
            take: () => invoke<DesktopOpenedFile | null>('take_opened_file'),
        });
    }
    const file = useSyncExternalStore(
        inbox?.subscribe ?? emptySubscribe,
        inbox?.getSnapshot ?? emptySnapshot,
        emptySnapshot
    );
    return { file, finish: inbox?.finish ?? emptyFinish };
}
