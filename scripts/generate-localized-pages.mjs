import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    parseDocs,
    generateDocPage,
    generateLegalPage,
    generateNotFoundPage,
    updateMeta,
    escapeHtml,
    findBuiltAsset,
    createSlugger,
} from './generate-docs-seo-pages.mjs';
import { SUPPORTED_LANGUAGES } from '../src/lib/languagePreferences.ts';
import { localizeDiagramSvg } from '../src/lib/docs/diagramLocalization.ts';
import { selectDiagramFontFaces } from '../src/lib/docs/diagramFonts.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const locales = path.join(root, 'src/locales');
const readJson = (filename) => JSON.parse(readFileSync(filename, 'utf8'));
const english = readJson(path.join(locales, 'en/public.json'));
const template = readFileSync(path.join(dist, 'index.html'), 'utf8');
const sourceDocs = parseDocs();
const site = 'https://kromacut.com';
const prefix = (locale, url) => (locale === 'en' ? url : `/${locale}${url}`);
const localeTags = {
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
const fontStylesheet = readFileSync(path.join(root, 'src/styles/language-fonts.css'), 'utf8');
const get = (object, key) => key.split('.').reduce((value, part) => value?.[part], object);
const interpolate = (text, values) => text.replace(/{{(\w+)}}/g, (_, key) => String(values[key]));

function localeHead(html, language, route, title, description, indexable = true) {
    const url = `${site}${prefix(language, route)}`;
    html = html
        .replace(/<html lang="[^"]+"/, `<html lang="${language}"`)
        .replace('href="/site.webmanifest"', `href="/${language}/site.webmanifest"`)
        .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
        .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<meta\s+[^>]*name="keywords"[^>]*>/g, '')
        .replace(
            /<link\s+[^>]*rel="canonical"[^>]*>/g,
            indexable ? `<link rel="canonical" href="${url}">` : ''
        );
    for (const [attribute, key, value] of [
        ['name', 'description', description],
        ['property', 'og:title', title],
        ['property', 'og:description', description],
        ['property', 'og:url', url],
        ['property', 'og:locale', localeTags[language]],
        ['name', 'twitter:title', title],
        ['name', 'twitter:description', description],
        ['property', 'og:image:alt', 'Kromacut'],
        ['name', 'twitter:image:alt', 'Kromacut'],
    ])
        html = updateMeta(html, attribute, key, value);
    if (indexable) {
        const alternates = SUPPORTED_LANGUAGES.map(
            ({ code }) =>
                `<link rel="alternate" hreflang="${code}" href="${site}${prefix(code, route)}">`
        ).join('\n');
        html = html.replace(
            '</head>',
            `${alternates}\n<link rel="alternate" hreflang="x-default" href="${site}${route}">\n</head>`
        );
    }
    return html;
}

function localizeShell(html, language, catalog) {
    const keys = [
        'navigation.homeLabel',
        'navigation.openApp',
        'navigation.home',
        'navigation.docs',
        'navigation.privacy',
        'navigation.terms',
        'legal.privacyEyebrow',
        'legal.termsEyebrow',
        'legal.contents',
        'contact.staticJavascript',
        'notFound.code',
        'notFound.eyebrow',
        'notFound.heading',
        'notFound.description',
        'notFound.guide',
        'docs.label',
    ];
    for (const key of keys.sort((a, b) => get(english, b).length - get(english, a).length)) {
        html = html.replaceAll(escapeHtml(get(english, key)), escapeHtml(get(catalog, key)));
    }
    html = html.replaceAll('Kromacut home</a>', `${escapeHtml(catalog.navigation.home)}</a>`);
    html = html.replace(
        /href="\/(docs(?:\/[^"#?]*)?|privacy|terms)?([?#][^"]*)?"/g,
        (_, pathname = '', suffix = '') => `href="${prefix(language, `/${pathname}`)}${suffix}"`
    );
    return html;
}

function write(filename, html) {
    const target = path.join(dist, filename);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, html);
}

const urls = ['/', '/privacy', '/terms', ...sourceDocs.map((doc) => `/docs/${doc.slug}`)];
for (const { code: language } of SUPPORTED_LANGUAGES) {
    if (language === 'en') continue;
    const dir = path.join(locales, language);
    const catalog = readJson(path.join(dir, 'public.json'));
    const diagramCatalog = readJson(path.join(dir, 'diagrams.json'));
    const diagramUrls = new Map();
    for (const file of readdirSync(path.join(root, 'src/assets/diagrams'))) {
        if (!file.endsWith('.svg')) continue;
        const messages = diagramCatalog[file.slice(0, -4)];
        const fontCss = selectDiagramFontFaces(
            fontStylesheet,
            language,
            Object.values(messages).join(' ')
        )
            .map((face) =>
                face.css.replace(
                    face.url,
                    `data:font/woff2;base64,${readFileSync(path.join(root, 'public', face.url.slice(1))).toString('base64')}`
                )
            )
            .join('\n');
        const svg = localizeDiagramSvg(
            readFileSync(path.join(root, 'src/assets/diagrams', file), 'utf8'),
            messages,
            language,
            fontCss,
            file.slice(0, -4)
        );
        const assetPath = `/localized/${language}/diagrams/${file}`;
        write(assetPath.slice(1), svg);
        diagramUrls.set(findBuiltAsset(`${file.slice(0, -4)}-`), assetPath);
    }
    const docs = parseDocs(path.join(dir, 'docs'));
    if (docs.length !== sourceDocs.length) throw new Error(`Incomplete documentation: ${language}`);
    for (const doc of docs) {
        const source = sourceDocs.find((entry) => entry.slug === doc.slug);
        if (!source) throw new Error(`Unexpected document: ${language}/${doc.slug}`);
        const slugger = createSlugger();
        const headings = [...source.body.matchAll(/^(#{1,6})\s+(.+?)\s*#*$/gm)];
        const translated = [...doc.body.matchAll(/^(#{1,6})\s+(.+?)\s*#*$/gm)];
        if (
            headings.length !== translated.length ||
            headings.some((h, i) => h[1] !== translated[i][1])
        )
            throw new Error(`Heading structure differs: ${language}/${doc.slug}`);
        doc.anchorIds = headings.map((heading) => slugger(heading[2].trim()));
    }
    const docsBySlug = new Map(docs.map((doc) => [doc.slug, doc]));
    for (const doc of docs) {
        let html = localizeShell(
            generateDocPage(template, doc, docs, docsBySlug),
            language,
            catalog
        );
        // The translated sentence may put the image title first or in the middle.
        // Both pieces are already escaped; do not concatenate an English-style prefix.
        html = html.replace(
            /aria-label="Open illustration at full size: ([^"]*)"/g,
            (_, title) =>
                `aria-label="${interpolate(escapeHtml(catalog.docs.openIllustration), { title })}"`
        );
        for (const [original, translated] of diagramUrls)
            if (original) html = html.replaceAll(original, translated);
        html = localeHead(
            html,
            language,
            `/docs/${doc.slug}`,
            interpolate(catalog.seo.docTitle, { title: doc.title }),
            doc.description
        );
        write(`${language}/docs/${doc.slug}/index.html`, html);
        write(`${language}/docs/${doc.slug}.html`, html);
        if (doc.slug === 'overview') write(`${language}/docs/index.html`, html);
    }
    for (const kind of ['privacy', 'terms']) {
        const notice = readJson(path.join(dir, `${kind}.json`));
        let html = localizeShell(generateLegalPage(template, kind, notice), language, catalog);
        html = html.replace(
            `Updated ${escapeHtml(notice.updated)}`,
            escapeHtml(interpolate(catalog.legal.updated, { date: notice.updated }))
        );
        html = localeHead(html, language, `/${kind}`, notice.seoTitle, notice.description);
        write(`${language}/${kind}/index.html`, html);
    }
    const schema = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Kromacut',
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web, Windows, macOS, Linux',
        inLanguage: language,
        url: `${site}${prefix(language, '/')}`,
        description: catalog.seo.homeDescription,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    }).replaceAll('<', '\\u003c');
    write(
        `${language}/index.html`,
        localeHead(
            template,
            language,
            '/',
            catalog.seo.homeTitle,
            catalog.seo.homeDescription
        ).replace('</head>', `<script type="application/ld+json">${schema}</script>\n</head>`)
    );
    write(
        `${language}/404.html`,
        localeHead(
            localizeShell(generateNotFoundPage(template), language, catalog),
            language,
            '/404.html',
            catalog.seo.notFoundTitle,
            catalog.seo.notFoundDescription,
            false
        )
    );
}

// English is also an explicit alternate, and its original canonical URLs stay unchanged.
for (const route of urls) {
    const target = path.join(dist, route === '/' ? 'index.html' : `${route.slice(1)}/index.html`);
    let html = readFileSync(target, 'utf8');
    const alternates = SUPPORTED_LANGUAGES.map(
        ({ code }) =>
            `<link rel="alternate" hreflang="${code}" href="${site}${prefix(code, route)}">`
    ).join('\n');
    html = html.replace(
        '</head>',
        `${alternates}\n<link rel="alternate" hreflang="x-default" href="${site}${route}">\n</head>`
    );
    writeFileSync(target, html);
}
const sitemap = SUPPORTED_LANGUAGES.flatMap(({ code }) =>
    urls.map((url) => `<url><loc>${site}${prefix(code, url)}</loc></url>`)
).join('\n');
write(
    'sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap}\n</urlset>\n`
);

// GitHub Pages serves the root 404 at the requested URL. Keep its HTTP status
// and unsaved workspace isolation: load only our static translated recovery
// document, never the application bundle, and never navigate to a success URL.
const recoveryScript = `<script>
(() => {
    const supported = ${JSON.stringify(SUPPORTED_LANGUAGES.map(({ code }) => code))};
    const match = value => {
        const tag = String(value || '').replaceAll('_','-').toLowerCase();
        const exact = supported.find(code => code.toLowerCase() === tag);
        if (exact) return exact;
        if (tag.split('-')[0] === 'pt') return 'pt-PT';
        if (tag.split('-')[0] === 'zh') return 'zh-CN';
        return supported.find(code => code === tag.split('-')[0]);
    };
    let saved;
    try { saved = localStorage.getItem('kromacut.language.v1'); } catch {}
    const prefix = location.pathname.split('/')[1];
    const language = supported.includes(prefix) ? prefix : match(saved) || navigator.languages.map(match).find(Boolean) || 'en';
    if (language === 'en') return;
    fetch('/' + language + '/404.html').then(response => {
        if (!response.ok) throw new Error('Recovery page unavailable');
        return response.text();
    }).then(html => {
        const translated = new DOMParser().parseFromString(html,'text/html');
        const recovery = translated.getElementById('root');
        if (!recovery || translated.documentElement.lang !== language) return;
        document.getElementById('root').replaceChildren(...recovery.childNodes);
        document.documentElement.lang = language;
        document.title = translated.title;
        const manifest = document.querySelector('link[rel="manifest"]');
        if (manifest) manifest.setAttribute('href', '/' + language + '/site.webmanifest');
        for (const key of ['description','og:title','og:description','og:locale','twitter:title','twitter:description']) {
            const selector = 'meta[name="' + key + '"],meta[property="' + key + '"]';
            const source = translated.querySelector(selector);
            const target = document.querySelector(selector);
            if (source && target) target.content = source.content;
        }
    }).catch(() => {});
})();
</script>`;
const root404Path = path.join(dist, '404.html');
writeFileSync(
    root404Path,
    readFileSync(root404Path, 'utf8').replace('</body>', `${recoveryScript}\n</body>`)
);

// Verify the emitted documents, not just the input catalog counts. A forgotten
// template substitution or broken illustration path must fail the production build.
for (const { code } of SUPPORTED_LANGUAGES) {
    const catalog = code === 'en' ? english : readJson(path.join(locales, code, 'public.json'));
    const folder = code === 'en' ? '' : `${code}/`;
    const assertOutput = (condition, message) => {
        if (!condition) throw new Error(`Invalid ${code} public output: ${message}`);
    };
    const manifest = readJson(path.join(dist, `${folder}site.webmanifest`));
    assertOutput(manifest.lang === code, 'install language');
    assertOutput(
        manifest.start_url === '/app' && manifest.id === '/' && manifest.scope === '/',
        'stable installed app identity'
    );
    if (code !== 'en')
        assertOutput(manifest.description === catalog.seo.appDescription, 'install description');
    for (const route of urls) {
        const filename = `${folder}${route === '/' ? '' : `${route.slice(1)}/`}index.html`;
        const html = readFileSync(path.join(dist, filename), 'utf8');
        assertOutput(html.includes(`<html lang="${code}"`), `${route}: language`);
        assertOutput(
            html.includes(`rel="canonical" href="${site}${prefix(code, route)}"`),
            `${route}: canonical URL`
        );
        assertOutput(
            [...html.matchAll(/rel="alternate" hreflang="/g)].length ===
                SUPPORTED_LANGUAGES.length + 1,
            `${route}: language alternatives`
        );
        for (const [, image] of html.matchAll(/<img\s+[^>]*src="([^"]+)"/g)) {
            if (/^(https?:|data:)/i.test(image)) continue;
            assertOutput(
                image.startsWith('/') && existsSync(path.join(dist, image.slice(1))),
                `${route}: missing image ${image}`
            );
        }
        if (route === '/privacy' || route === '/terms') {
            const kind = route.slice(1);
            const notice = readJson(
                path.join(
                    root,
                    code === 'en'
                        ? `src/data/${kind}Notice.json`
                        : `src/locales/${code}/${kind}.json`
                )
            );
            for (const section of notice.sections) {
                assertOutput(
                    html.includes(escapeHtml(section.title)),
                    `${route}: missing section ${section.id}`
                );
                for (const paragraph of section.paragraphs) {
                    assertOutput(
                        html.includes(escapeHtml(paragraph)),
                        `${route}: missing paragraph in ${section.id}`
                    );
                }
            }
        }
    }
    const recovery = readFileSync(path.join(dist, `${folder}404.html`), 'utf8');
    for (const key of ['heading', 'description', 'guide']) {
        assertOutput(
            recovery.includes(escapeHtml(catalog.notFound[key])),
            `404: untranslated ${key}`
        );
    }
    assertOutput(
        !/<script\b[^>]*(?:type="module"|src=)/.test(recovery),
        '404 must not boot the app'
    );
}
console.log(`Generated public pages for ${SUPPORTED_LANGUAGES.length} languages.`);
