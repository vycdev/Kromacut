export const AUTO_PAINT_DIAGNOSTICS_STORAGE_KEY = 'kromacut:desktop-auto-paint-diagnostics';
export const AUTO_PAINT_DIAGNOSTICS_CHANGED_EVENT =
    'kromacut:desktop-auto-paint-diagnostics-changed';

const DEFAULT_AUTO_PAINT_DIAGNOSTICS_ENABLED = false;

export function getAutoPaintDiagnosticsEnabled(): boolean {
    if (typeof globalThis.localStorage === 'undefined') {
        return DEFAULT_AUTO_PAINT_DIAGNOSTICS_ENABLED;
    }

    try {
        return globalThis.localStorage.getItem(AUTO_PAINT_DIAGNOSTICS_STORAGE_KEY) === 'true';
    } catch {
        return DEFAULT_AUTO_PAINT_DIAGNOSTICS_ENABLED;
    }
}

export function saveAutoPaintDiagnosticsEnabled(enabled: boolean): void {
    if (typeof globalThis.localStorage !== 'undefined') {
        try {
            globalThis.localStorage.setItem(AUTO_PAINT_DIAGNOSTICS_STORAGE_KEY, String(enabled));
        } catch {
            // Keep the in-session preference working when storage is unavailable.
        }
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent<boolean>(AUTO_PAINT_DIAGNOSTICS_CHANGED_EVENT, { detail: enabled })
        );
    }
}

export function subscribeToAutoPaintDiagnosticsEnabled(
    onChange: (enabled: boolean) => void
): () => void {
    if (typeof window === 'undefined') return () => {};

    const handlePreferenceChange = (event: Event) => {
        const detail = (event as CustomEvent<boolean>).detail;
        onChange(typeof detail === 'boolean' ? detail : getAutoPaintDiagnosticsEnabled());
    };
    const handleStorageChange = (event: StorageEvent) => {
        if (event.key === AUTO_PAINT_DIAGNOSTICS_STORAGE_KEY) {
            onChange(getAutoPaintDiagnosticsEnabled());
        }
    };

    window.addEventListener(AUTO_PAINT_DIAGNOSTICS_CHANGED_EVENT, handlePreferenceChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
        window.removeEventListener(AUTO_PAINT_DIAGNOSTICS_CHANGED_EVENT, handlePreferenceChange);
        window.removeEventListener('storage', handleStorageChange);
    };
}
