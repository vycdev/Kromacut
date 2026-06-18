import type { DocLinkTarget, DocRecord } from '@/types/docs';

const DOCS_PATH_PREFIX = '/docs';

function cleanDocSlug(value: string): string {
    return value
        .trim()
        .replace(/^\.?\//, '')
        .replace(/\.md$/i, '')
        .replace(/^docs\//, '');
}

function splitDocAndHeading(value: string): { docPart: string; headingPart?: string } {
    const [docPart, ...headingParts] = value.split('#');
    const headingPart = headingParts.join('#') || undefined;
    return { docPart, headingPart };
}

function safeDecodeURIComponent(value: string): string | null {
    try {
        return decodeURIComponent(value);
    } catch {
        return null;
    }
}

export function buildDocsPath(docSlug: string, headingSlug?: string): string {
    const encodedDoc = encodeURIComponent(cleanDocSlug(docSlug));
    const encodedHeading = headingSlug ? `#${encodeURIComponent(headingSlug)}` : '';
    return `${DOCS_PATH_PREFIX}/${encodedDoc}${encodedHeading}`;
}

export function parseDocsPath(pathname: string, hash = ''): DocLinkTarget | null {
    const normalizedPath = pathname.replace(/\/+$/, '') || '/';
    if (normalizedPath !== DOCS_PATH_PREFIX && !normalizedPath.startsWith(`${DOCS_PATH_PREFIX}/`)) {
        return null;
    }

    const rawDocSlug = normalizedPath.slice(DOCS_PATH_PREFIX.length).replace(/^\/+/, '');
    const decodedDocSlug = rawDocSlug ? safeDecodeURIComponent(rawDocSlug) : 'overview';
    if (decodedDocSlug === null) return null;

    const rawHeading = hash.replace(/^#/, '');
    const decodedHeading = rawHeading ? safeDecodeURIComponent(rawHeading) : undefined;
    if (decodedHeading === null) return null;

    const docSlug = cleanDocSlug(decodedDocSlug);
    if (!docSlug) return null;

    return {
        docSlug,
        headingSlug: decodedHeading,
    };
}

export function parseDocsLocation(location: Pick<Location, 'pathname' | 'hash'>): DocLinkTarget | null {
    return parseDocsPath(location.pathname, location.hash);
}

export function isDocsPath(pathname: string): boolean {
    return parseDocsPath(pathname) !== null;
}

export function resolveDocHref(
    href: string,
    currentDocSlug: string,
    docs: DocRecord[]
): DocLinkTarget | null {
    const trimmed = href.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('#')) {
        const headingSlug = trimmed.slice(1);
        return headingSlug ? { docSlug: currentDocSlug, headingSlug } : { docSlug: currentDocSlug };
    }

    const { docPart, headingPart } = splitDocAndHeading(trimmed);
    const docSlug = cleanDocSlug(docPart);
    if (!docSlug) return null;

    const found = docs.some((doc) => doc.meta.slug === docSlug);
    if (!found) return null;

    return {
        docSlug,
        headingSlug: headingPart,
    };
}

export function isSafeExternalHref(href: string): boolean {
    return /^(https?:|mailto:)/i.test(href.trim());
}
