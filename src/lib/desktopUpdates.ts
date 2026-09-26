import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ReleaseNotesFields } from './localizedReleaseNotes';

export interface VersionInfo extends ReleaseNotesFields {
    version: string;
    download_url?: string;
}

export function isDesktopUpdateSupported(): boolean {
    return isTauri();
}

export async function checkForDesktopUpdates(): Promise<VersionInfo | null> {
    if (!isDesktopUpdateSupported()) {
        return null;
    }

    const currentVersion = await invoke<string>('get_app_version');
    return invoke<VersionInfo | null>('check_for_updates', {
        currentVersion,
    });
}

export async function openDesktopReleasesPage(): Promise<void> {
    await invoke('open_releases_page');
}
