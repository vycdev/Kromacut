import type { DocRecord } from '@/types/docs';
import { i18n, translate } from './i18n';
import { publicPath, stripLanguagePrefix } from './routes';
import { SUPPORTED_LANGUAGES } from './languagePreferences';

export const SITE_URL = 'https://kromacut.com';
export const SITE_NAME = 'Kromacut';
export const SOCIAL_IMAGE_URL = `${SITE_URL}/android-chrome-512x512.png`;

function absoluteUrl(pathname: string): string {
    return new URL(pathname, SITE_URL).toString();
}

export function docPath(docSlug: string): string {
    return publicPath(`/docs/${encodeURIComponent(docSlug)}`);
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
    robots = 'index,follow',
    canonical = true,
}: {
    title: string;
    description: string;
    url: string;
    type?: string;
    robots?: string;
    canonical?: boolean;
}) {
    document.title = title;
    setMeta('name', 'description', description);
    setMeta('name', 'robots', robots);
    if (canonical) {
        findOrCreateCanonical().href = url;
    } else {
        document.querySelector('link[rel="canonical"]')?.remove();
    }
    // In-app guide navigation does not reload the HTML. Keep every alternate tied
    // to the current document, rather than the page that initially booted the app.
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((link) => link.remove());
    document
        .querySelectorAll('script[type="application/ld+json"]')
        .forEach((script) => script.remove());
    if (canonical && !robots.startsWith('noindex')) {
        const route = stripLanguagePrefix(new URL(url).pathname);
        for (const { code } of [...SUPPORTED_LANGUAGES, { code: 'x-default' }]) {
            const alternate = document.createElement('link');
            alternate.rel = 'alternate';
            alternate.hreflang = code;
            alternate.href = absoluteUrl(
                publicPath(
                    route,
                    code === 'x-default'
                        ? 'en'
                        : (code as (typeof SUPPORTED_LANGUAGES)[number]['code'])
                )
            );
            document.head.appendChild(alternate);
        }
    }

    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:site_name', SITE_NAME);
    const locales: Record<string, string> = {
        en: 'en_US',
        fr: 'fr_FR',
        de: 'de_DE',
        it: 'it_IT',
        ro: 'ro_RO',
        es: 'es_ES',
        ja: 'ja_JP',
        'zh-CN': 'zh_CN',
        hi: 'hi_IN',
        'pt-PT': 'pt_PT',
        uk: 'uk_UA',
        bn: 'bn_BD',
    };
    setMeta('property', 'og:locale', locales[i18n.resolvedLanguage ?? 'en'] ?? 'en_US');
    setMeta('property', 'og:image', SOCIAL_IMAGE_URL);
    setMeta('property', 'og:image:secure_url', SOCIAL_IMAGE_URL);
    setMeta('property', 'og:image:alt', SITE_NAME);

    setMeta('name', 'twitter:card', 'summary');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', SOCIAL_IMAGE_URL);
    setMeta('name', 'twitter:image:alt', SITE_NAME);
}

export function applyHomeSeo() {
    applySeo({
        title: translate('public:seo.homeTitle'),
        description: translate('public:seo.homeDescription'),
        url: absoluteUrl(publicPath('/')),
    });
    const structured = document.createElement('script');
    structured.type = 'application/ld+json';
    structured.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: SITE_NAME,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web, Windows, macOS, Linux',
        inLanguage: i18n.resolvedLanguage ?? 'en',
        url: absoluteUrl(publicPath('/')),
        description: translate('public:seo.homeDescription'),
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    });
    document.head.appendChild(structured);
}

export function applyAppSeo() {
    applySeo({
        title: translate('public:seo.appTitle'),
        description: translate('public:seo.appDescription'),
        url: absoluteUrl('/app'),
        robots: 'noindex,nofollow',
    });
}

export function applyNotFoundSeo() {
    applySeo({
        title: translate('public:seo.notFoundTitle'),
        description: translate('public:seo.notFoundDescription'),
        url: absoluteUrl('/404.html'),
        robots: 'noindex,follow',
        canonical: false,
    });
}

export function applyPrivacySeo(title: string, description: string) {
    applySeo({
        title,
        description,
        url: absoluteUrl(publicPath('/privacy')),
    });
}

export function applyTermsSeo(title: string, description: string) {
    applySeo({
        title,
        description,
        url: absoluteUrl(publicPath('/terms')),
    });
}

export function docSeoTitle(doc: DocRecord): string {
    return translate('public:seo.docTitle', { title: doc.meta.title });
}

export function docSeoDescription(doc: DocRecord): string {
    return (
        doc.meta.description ?? translate('public:seo.docDescription', { title: doc.meta.title })
    );
}

export function applyDocSeo(doc: DocRecord) {
    applySeo({
        title: docSeoTitle(doc),
        description: docSeoDescription(doc),
        url: docUrl(doc.meta.slug),
        type: 'article',
    });
}
