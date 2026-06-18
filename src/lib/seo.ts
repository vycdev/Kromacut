import type { DocRecord } from '@/types/docs';

export const SITE_URL = 'https://kromacut.com';
export const SITE_NAME = 'Kromacut';
export const SOCIAL_IMAGE_URL = `${SITE_URL}/android-chrome-512x512.png`;

const HOME_TITLE = 'Kromacut - Free Image-to-3D Color Layer Print Generator';
const HOME_DESCRIPTION =
    'Turn 2D images into color-layered 3D prints for free with Kromacut. Reduce palettes, plan filament swaps, preview layers, and export STL or 3MF models.';

function absoluteUrl(pathname: string): string {
    return new URL(pathname, SITE_URL).toString();
}

export function docPath(docSlug: string): string {
    return `/docs/${encodeURIComponent(docSlug)}`;
}

export function docUrl(docSlug: string): string {
    return absoluteUrl(docPath(docSlug));
}

function findOrCreateMeta(attribute: 'name' | 'property', key: string): HTMLMetaElement {
    let meta = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attribute, key);
        document.head.appendChild(meta);
    }
    return meta;
}

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
    findOrCreateMeta(attribute, key).content = content;
}

function findOrCreateCanonical(): HTMLLinkElement {
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
    }
    return link;
}

function applySeo({
    title,
    description,
    url,
    type = 'website',
}: {
    title: string;
    description: string;
    url: string;
    type?: string;
}) {
    document.title = title;
    setMeta('name', 'description', description);
    findOrCreateCanonical().href = url;

    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:site_name', SITE_NAME);
    setMeta('property', 'og:image', SOCIAL_IMAGE_URL);
    setMeta('property', 'og:image:secure_url', SOCIAL_IMAGE_URL);

    setMeta('name', 'twitter:card', 'summary');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', SOCIAL_IMAGE_URL);
}

export function applyHomeSeo() {
    applySeo({
        title: HOME_TITLE,
        description: HOME_DESCRIPTION,
        url: absoluteUrl('/'),
    });
}

export function docSeoTitle(doc: DocRecord): string {
    return `${doc.meta.title} | Kromacut Docs`;
}

export function docSeoDescription(doc: DocRecord): string {
    return doc.meta.description ?? `${doc.meta.title} documentation for Kromacut.`;
}

export function applyDocSeo(doc: DocRecord) {
    applySeo({
        title: docSeoTitle(doc),
        description: docSeoDescription(doc),
        url: docUrl(doc.meta.slug),
        type: 'article',
    });
}
