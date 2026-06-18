export const UPDATE_CHECK_ON_STARTUP_STORAGE_KEY = 'kromacut:update-check-on-startup';
export const UPDATE_CHECK_ON_STARTUP_CHANGED_EVENT = 'kromacut:update-check-on-startup-changed';

const DEFAULT_CHECK_ON_STARTUP = true;

export function getUpdateCheckOnStartup(): boolean {
    if (typeof window === 'undefined') {
        return DEFAULT_CHECK_ON_STARTUP;
    }

    try {
        return window.localStorage.getItem(UPDATE_CHECK_ON_STARTUP_STORAGE_KEY) !== 'false';
    } catch {
        return DEFAULT_CHECK_ON_STARTUP;
    }
}

export function saveUpdateCheckOnStartup(enabled: boolean) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(UPDATE_CHECK_ON_STARTUP_STORAGE_KEY, String(enabled));
    } catch {
        // The in-session preference should still update if storage is blocked.
    }

    window.dispatchEvent(
        new CustomEvent<boolean>(UPDATE_CHECK_ON_STARTUP_CHANGED_EVENT, { detail: enabled })
    );
}

export function subscribeToUpdateCheckOnStartup(onChange: (enabled: boolean) => void) {
    if (typeof window === 'undefined') {
        return () => {};
    }

    const handlePreferenceChange = (event: Event) => {
        const detail = (event as CustomEvent<boolean>).detail;
        onChange(typeof detail === 'boolean' ? detail : getUpdateCheckOnStartup());
    };

    const handleStorageChange = (event: StorageEvent) => {
        if (event.key === UPDATE_CHECK_ON_STARTUP_STORAGE_KEY) {
            onChange(getUpdateCheckOnStartup());
        }
    };

    window.addEventListener(UPDATE_CHECK_ON_STARTUP_CHANGED_EVENT, handlePreferenceChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
        window.removeEventListener(UPDATE_CHECK_ON_STARTUP_CHANGED_EVENT, handlePreferenceChange);
        window.removeEventListener('storage', handleStorageChange);
    };
}
