export const LANDING_PATH = '/';
export const APP_PATH = '/app';
export const DOCS_PATH = '/docs';

export const HAS_LAUNCHED_STORAGE_KEY = 'kromacut.has-launched.v1';

export type AppRoute = 'landing' | 'app' | 'docs';

export function isDocsRoute(pathname: string): boolean {
    const normalized = pathname.replace(/\/+$/, '') || LANDING_PATH;
    return normalized === DOCS_PATH || normalized.startsWith(`${DOCS_PATH}/`);
}

export function selectRoute(pathname: string, isTauri = false): AppRoute {
    if (isTauri) return 'app';
    if (isDocsRoute(pathname)) return 'docs';
    return pathname.replace(/\/+$/, '') === APP_PATH ? 'app' : 'landing';
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

export function docsPath(slug = ''): string {
    const normalizedSlug = slug.trim().replace(/^\/+|\/+$/g, '');
    return normalizedSlug ? `${DOCS_PATH}/${normalizedSlug}` : DOCS_PATH;
}
