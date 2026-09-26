export const LANGUAGE_STORAGE_KEY = 'kromacut.language.v1';

export const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'ro', name: 'Română' },
    { code: 'es', name: 'Español' },
    { code: 'ja', name: '日本語' },
    { code: 'zh-CN', name: '简体中文' },
    { code: 'hi', name: 'हिन्दी' },
    { code: 'pt-PT', name: 'Português (Portugal)' },
    { code: 'uk', name: 'Українська' },
    { code: 'bn', name: 'বাংলা' },
] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];
export type LanguagePreference = AppLanguage | 'system';

export function matchLanguage(value: string | null | undefined): AppLanguage | undefined {
    if (!value) return undefined;
    const tag = value.trim().replaceAll('_', '-').toLowerCase();
    const exact = SUPPORTED_LANGUAGES.find(({ code }) => code.toLowerCase() === tag);
    if (exact) return exact.code;
    const base = tag.split('-')[0];
    if (base === 'zh') return 'zh-CN';
    if (base === 'pt') return 'pt-PT';
    return SUPPORTED_LANGUAGES.find(({ code }) => code === base)?.code;
}

export function getLanguagePreference(): LanguagePreference {
    try {
        const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        return saved === 'system' ? 'system' : (matchLanguage(saved) ?? 'system');
    } catch {
        return 'system';
    }
}

export function saveLanguagePreference(preference: LanguagePreference): void {
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
    } catch {
        // Keep the current session usable when local storage is unavailable.
    }
}

export function resolveLanguage(
    preference: LanguagePreference,
    systemLanguages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages
): AppLanguage {
    if (preference !== 'system') return preference;
    for (const language of systemLanguages) {
        const matched = matchLanguage(language);
        if (matched) return matched;
    }
    return 'en';
}
