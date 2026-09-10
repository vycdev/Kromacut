export const MULTIPLATE_ENABLED_STORAGE_KEY = 'kromacut:experimental-multiplate';
export const MULTIPLATE_ENABLED_CHANGED_EVENT = 'kromacut:experimental-multiplate-changed';

const DEFAULT_MULTIPLATE_ENABLED = false;

export function getMultiPlateEnabled(): boolean {
    if (typeof window === 'undefined') {
        return DEFAULT_MULTIPLATE_ENABLED;
    }

    try {
        return window.localStorage.getItem(MULTIPLATE_ENABLED_STORAGE_KEY) === 'true';
    } catch {
        return DEFAULT_MULTIPLATE_ENABLED;
    }
}

export function saveMultiPlateEnabled(enabled: boolean) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(MULTIPLATE_ENABLED_STORAGE_KEY, String(enabled));
    } catch {
        // The in-session preference should still update if storage is blocked.
    }

    window.dispatchEvent(
        new CustomEvent<boolean>(MULTIPLATE_ENABLED_CHANGED_EVENT, { detail: enabled })
    );
}

export function subscribeToMultiPlateEnabled(onChange: (enabled: boolean) => void) {
    if (typeof window === 'undefined') {
        return () => {};
    }

    const handlePreferenceChange = (event: Event) => {
        const detail = (event as CustomEvent<boolean>).detail;
        onChange(typeof detail === 'boolean' ? detail : getMultiPlateEnabled());
    };

    const handleStorageChange = (event: StorageEvent) => {
        if (event.key === MULTIPLATE_ENABLED_STORAGE_KEY) {
            onChange(getMultiPlateEnabled());
        }
    };

    window.addEventListener(MULTIPLATE_ENABLED_CHANGED_EVENT, handlePreferenceChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
        window.removeEventListener(MULTIPLATE_ENABLED_CHANGED_EVENT, handlePreferenceChange);
        window.removeEventListener('storage', handleStorageChange);
    };
}
