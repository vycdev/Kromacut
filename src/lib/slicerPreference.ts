import type { SlicerApp } from './desktopSlicer';

export const SLICER_PREFERENCE_STORAGE_KEY = 'kromacut:desktop-slicer';

/**
 * The slicer **Open in Slicer** uses without asking: the system's default 3MF app, or a specific
 * slicer app. No saved preference means the slicer chooser opens every time.
 */
export type SlicerPreference = { kind: 'system' } | { kind: 'app'; app: SlicerApp };

function parseSlicerPreference(value: unknown): SlicerPreference | null {
    if (typeof value !== 'object' || value === null) return null;
    const preference = value as { kind?: unknown; app?: unknown };
    if (preference.kind === 'system') return { kind: 'system' };
    if (preference.kind !== 'app' || typeof preference.app !== 'object' || !preference.app) {
        return null;
    }
    const { name, path } = preference.app as { name?: unknown; path?: unknown };
    if (typeof name !== 'string' || typeof path !== 'string' || !name || !path) return null;
    return { kind: 'app', app: { name, path } };
}

/** The saved slicer, or `null` when none is saved or the stored value is unreadable. */
export function loadSlicerPreference(): SlicerPreference | null {
    if (typeof globalThis.localStorage === 'undefined') return null;

    try {
        const raw = globalThis.localStorage.getItem(SLICER_PREFERENCE_STORAGE_KEY);
        return raw === null ? null : parseSlicerPreference(JSON.parse(raw));
    } catch {
        return null;
    }
}

/** Saves the slicer to use without asking; `null` forgets it so the chooser opens again. */
export function saveSlicerPreference(preference: SlicerPreference | null): void {
    if (typeof globalThis.localStorage === 'undefined') return;

    try {
        if (preference === null) {
            globalThis.localStorage.removeItem(SLICER_PREFERENCE_STORAGE_KEY);
        } else {
            globalThis.localStorage.setItem(
                SLICER_PREFERENCE_STORAGE_KEY,
                JSON.stringify(
                    preference.kind === 'system'
                        ? { kind: 'system' }
                        : {
                              kind: 'app',
                              app: { name: preference.app.name, path: preference.app.path },
                          }
                )
            );
        }
    } catch {
        // The in-session choice still applies when storage is unavailable.
    }
}
