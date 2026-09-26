export const LANDING_PATH = '/';
export const APP_PATH = '/app';
export const DOCS_PATH = '/docs';
export const PRIVACY_PATH = '/privacy';
export const TERMS_PATH = '/terms';

export const HAS_LAUNCHED_STORAGE_KEY = 'kromacut.has-launched.v1';

export type AppRoute = 'landing' | 'app' | 'docs' | 'privacy' | 'terms' | 'not-found';

/** Only our exact published locale prefixes are routes, never arbitrary language-like slugs. */
export function languageFromPath(pathname: string): AppLanguage | undefined {
    const prefix = pathname.split('/')[1];
    return SUPPORTED_LANGUAGES.find(({ code }) => code === prefix)?.code;
}

export function stripLanguagePrefix(pathname: string): string {
    const language = languageFromPath(pathname);
    return language ? pathname.slice(language.length + 1) || '/' : pathname;
}

export function publicPath(
    pathname: string,
    language: AppLanguage = typeof document === 'undefined'
        ? 'en'
        : (matchLanguage(document.documentElement.lang) ?? 'en')
): string {
    const path = stripLanguagePrefix(pathname);
    // The workspace has one route: language preferences must never fork project state.
    if (path === APP_PATH || path.startsWith(`${APP_PATH}/`)) return path;
    return language === 'en' ? path : `/${language}${path.startsWith('/') ? path : `/${path}`}`;
}

export function isDocsRoute(pathname: string): boolean {
    const normalized = stripLanguagePrefix(pathname).replace(/\/+$/, '') || LANDING_PATH;
    return normalized === DOCS_PATH || normalized.startsWith(`${DOCS_PATH}/`);
}

export function selectRoute(pathname: string, isTauri = false): AppRoute {
    if (isTauri) return 'app';
    if (isDocsRoute(pathname)) return 'docs';
    const normalized = stripLanguagePrefix(pathname).replace(/\/+$/, '') || LANDING_PATH;
    if (normalized === LANDING_PATH || normalized === '/index.html') return 'landing';
    if (normalized === APP_PATH || normalized === '/app/index.html') return 'app';
    if (normalized === PRIVACY_PATH || normalized === `${PRIVACY_PATH}/index.html`) {
        return 'privacy';
    }
    if (normalized === TERMS_PATH || normalized === `${TERMS_PATH}/index.html`) {
        return 'terms';
    }
    return 'not-found';
}

export function hasLandingBypass(search: string): boolean {
    return new URLSearchParams(search).get('landing') === '1';
}

export function isCrawlerUserAgent(userAgent: string): boolean {
    return /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|twitterbot|linkedinbot/i.test(
        userAgent
    );
}

export function hasLaunched(): boolean {
    try {
        return window.localStorage.getItem(HAS_LAUNCHED_STORAGE_KEY) === 'v1';
    } catch {
        return false;
    }
}

export function markLaunched(): void {
    try {
        window.localStorage.setItem(HAS_LAUNCHED_STORAGE_KEY, 'v1');
    } catch {
        // A blocked storage area should not prevent the app from opening.
    }
}

export function shouldRedirectHomeToApp(
    location: Pick<Location, 'pathname' | 'search'>,
    isTauri: boolean,
    userAgent: string,
    launched: boolean
): boolean {
    return (
        !isTauri &&
        selectRoute(location.pathname, false) === 'landing' &&
        (location.pathname.replace(/\/+$/, '') || LANDING_PATH) === LANDING_PATH &&
        !hasLandingBypass(location.search) &&
        launched &&
        !isCrawlerUserAgent(userAgent)
    );
}

export function appPath(isTauri: boolean): string {
    return isTauri ? LANDING_PATH : APP_PATH;
}

export function landingPath(isTauri: boolean): string {
    return isTauri ? LANDING_PATH : `${publicPath(LANDING_PATH)}?landing=1`;
}

export function docsPath(slug = ''): string {
    const normalizedSlug = slug.trim().replace(/^\/+|\/+$/g, '');
    return publicPath(normalizedSlug ? `${DOCS_PATH}/${normalizedSlug}` : DOCS_PATH);
}
import { matchLanguage, SUPPORTED_LANGUAGES, type AppLanguage } from './languagePreferences.ts';
