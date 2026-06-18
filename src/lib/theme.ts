export type ThemeMode = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'theme';

const DEFAULT_THEME_MODE: ThemeMode = 'dark';
const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';

const getSystemThemeQuery = (): MediaQueryList | null => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return null;
    }

    return window.matchMedia(SYSTEM_THEME_QUERY);
};

export const isThemeMode = (value: string | null): value is ThemeMode => {
    return value === 'system' || value === 'dark' || value === 'light';
};

export const getStoredThemeMode = (): ThemeMode => {
    if (typeof localStorage === 'undefined') {
        return DEFAULT_THEME_MODE;
    }

    try {
        const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        return isThemeMode(storedTheme) ? storedTheme : DEFAULT_THEME_MODE;
    } catch {
        return DEFAULT_THEME_MODE;
    }
};

export const saveThemeMode = (themeMode: ThemeMode) => {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
        // Theme changes should still apply for the current session if storage is blocked.
    }
};

export const getSystemTheme = (): ResolvedTheme => {
    return getSystemThemeQuery()?.matches ? 'dark' : 'light';
};

export const resolveThemeMode = (themeMode: ThemeMode): ResolvedTheme => {
    return themeMode === 'system' ? getSystemTheme() : themeMode;
};

export const applyResolvedTheme = (resolvedTheme: ResolvedTheme) => {
    const isDark = resolvedTheme === 'dark';

    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = resolvedTheme;

    const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColorMeta) {
        themeColorMeta.content = isDark ? '#0a0a0a' : '#ffffff';
    }
};

export const applyThemeMode = (themeMode: ThemeMode): ResolvedTheme => {
    const resolvedTheme = resolveThemeMode(themeMode);
    applyResolvedTheme(resolvedTheme);
    return resolvedTheme;
};

export const subscribeToSystemTheme = (onChange: (resolvedTheme: ResolvedTheme) => void) => {
    const mediaQuery = getSystemThemeQuery();
    if (!mediaQuery) {
        return () => {};
    }

    const handleChange = (event: MediaQueryListEvent) => {
        onChange(event.matches ? 'dark' : 'light');
    };

    if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
};
