import { i18n, I18N_NAMESPACES } from './lib/i18n';
import { isTauri } from '@tauri-apps/api/core';
import { isDocsRoute, languageFromPath, publicPath, selectRoute } from './lib/routes';
import {
    getLanguagePreference,
    LANGUAGE_STORAGE_KEY,
    resolveLanguage,
    saveLanguagePreference,
    type AppLanguage,
    type LanguagePreference,
} from './lib/languagePreferences';

// Vite bundles these resources; desktop translation never needs a network service.
const catalogs = import.meta.glob(['./locales/*/*.json', '!./locales/en/*.json'], {
    import: 'default',
});
const loaded = new Set<AppLanguage>(['en']);
let selection = 0;

async function loadLanguage(language: AppLanguage): Promise<void> {
    if (loaded.has(language)) return;
    const entries = I18N_NAMESPACES.map((namespace) => {
        const path = `./locales/${language}/${namespace}.json`;
        const load = catalogs[path];
        if (!load) throw new Error(`Missing language resources: ${language}/${namespace}`);
        return [path, load] as const;
    });
    const resources = await Promise.all(
        entries.map(async ([path, load]) => ({
            namespace: path
                .split('/')
                .at(-1)!
                .replace(/\.json$/, ''),
            data: await load(),
        }))
    );
    for (const { namespace, data } of resources) {
        i18n.addResourceBundle(language, namespace, data, true, true);
    }
    loaded.add(language);
}

/** Load first, then switch atomically; keep the current locale if loading fails. */
export async function changeAppLanguage(
    preference: LanguagePreference,
    persist = true
): Promise<void> {
    const request = ++selection;
    const language = resolveLanguage(preference);
    await loadLanguage(language);
    if (request !== selection) return;
    document.documentElement.lang = language;
    document.documentElement.dir = 'ltr';
    document
        .querySelector('link[rel="manifest"]')
        ?.setAttribute(
            'href',
            language === 'en' ? '/site.webmanifest' : `/${language}/site.webmanifest`
        );
    await i18n.changeLanguage(language);
    if (request !== selection) return;
    if (persist) saveLanguagePreference(preference);
    if (
        isDocsRoute(window.location.pathname) ||
        (!isTauri() && selectRoute(window.location.pathname) !== 'app')
    ) {
        const nextPath = publicPath(window.location.pathname, language);
        if (nextPath !== window.location.pathname) {
            window.history.replaceState(
                window.history.state,
                '',
                `${nextPath}${window.location.search}${window.location.hash}`
            );
        }
    }
}

export async function initializeAppLanguage(): Promise<void> {
    try {
        await syncLanguageFromLocation();
    } catch {
        // A failed local chunk must not prevent the app from opening.
        await changeAppLanguage('en', false);
    }
}

async function syncLanguageFromLocation(): Promise<void> {
    const explicit = languageFromPath(window.location.pathname);
    const preference = getLanguagePreference();
    // A shared translated URL is a language choice too. Remember it so opening
    // the single /app workspace does not unexpectedly switch back to English.
    // Keep "System" when its resolved language already matches the URL.
    await changeAppLanguage(
        explicit && explicit !== resolveLanguage(preference) ? explicit : preference,
        Boolean(explicit)
    );
}

/** Preference changes from another tab and OS-language changes stay live without remounting. */
export function subscribeToLanguagePreference(): () => void {
    const syncPreference = () =>
        void changeAppLanguage(getLanguagePreference(), false).catch(() => {});
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === LANGUAGE_STORAGE_KEY) syncPreference();
    };
    const onSystem = () => {
        if (getLanguagePreference() === 'system') syncPreference();
    };
    const onLocation = () => void syncLanguageFromLocation().catch(() => {});
    window.addEventListener('storage', onStorage);
    window.addEventListener('languagechange', onSystem);
    window.addEventListener('popstate', onLocation);
    return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener('languagechange', onSystem);
        window.removeEventListener('popstate', onLocation);
    };
}
