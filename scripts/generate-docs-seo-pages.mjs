import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const docsDir = path.join(rootDir, 'src', 'docs');
const distDir = path.join(rootDir, 'dist');
const distIndexPath = path.join(distDir, 'index.html');
const siteUrl = 'https://kromacut.com';
const socialImageUrl = `${siteUrl}/android-chrome-512x512.png`;

function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function slugify(value) {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function createSlugger() {
    const seen = new Map();
    return (value) => {
        const base = slugify(value) || 'section';
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        return count === 0 ? base : `${base}-${count + 1}`;
    };
}

function parseFrontmatter(raw) {
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!normalized.startsWith('---\n')) {
        return { attributes: {}, body: normalized.trim() };
    }

    const end = normalized.indexOf('\n---', 4);
    if (end === -1) {
        return { attributes: {}, body: normalized.trim() };
    }

    const attributes = {};
    normalized
        .slice(4, end)
        .split('\n')
        .forEach((line) => {
            const separator = line.indexOf(':');
            if (separator === -1) return;
            const key = line.slice(0, separator).trim();
            const value = line
                .slice(separator + 1)
                .trim()
                .replace(/^["']|["']$/g, '');
            if (key) attributes[key] = value;
        });

    return {
        attributes,
        body: normalized.slice(end + 4).trim(),
    };
}

function parseDocs(directory = docsDir) {
    return readdirSync(directory)
        .filter((file) => file.endsWith('.md'))
        .map((file) => {
            const raw = readFileSync(path.join(directory, file), 'utf8');
            const { attributes, body } = parseFrontmatter(raw);
            const title = attributes.title ?? body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? 'Untitled';
            const slug = attributes.slug ?? slugify(title);
            const order = Number.parseInt(attributes.order ?? '999', 10);
            return {
                file,
                body,
                title,
                slug,
                description: attributes.description ?? `${title} documentation for Kromacut.`,
                order: Number.isFinite(order) ? order : 999,
            };
        })
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

function findBuiltAsset(prefix) {
    const assetsDir = path.join(distDir, 'assets');
    if (!existsSync(assetsDir)) return undefined;
    const match = readdirSync(assetsDir).find((file) => file.startsWith(prefix));
    return match ? `/assets/${match}` : undefined;
}

function resolveDocImage(src) {
    const clean = src
        .trim()
        .replace(/^\.?\//, '')
        .split(/\s+/)[0]
        .replace(/^["']|["']$/g, '');

    if (clean.includes('td-test.png')) {
        return findBuiltAsset('tdTest-') ?? clean;
    }
    if (clean.includes('kromacut-logo.png')) {
        return findBuiltAsset('logo-') ?? clean;
    }
    if (clean.includes('hd-wedges-eight-colors-2026-09-13.jpg')) {
        return findBuiltAsset('hd-wedges-eight-colors-2026-09-13-') ?? clean;
    }
    const diagramName = path.basename(clean);
    if (
        diagramName.endsWith('.svg') &&
        existsSync(path.join(rootDir, 'src/assets/diagrams', diagramName))
    ) {
        return findBuiltAsset(`${diagramName.slice(0, -4)}-`) ?? clean;
    }
    return clean;
}

function resolveDocHref(href, currentDocSlug, docsBySlug) {
    const trimmed = href.trim();
    if (!trimmed) return '#';
    if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('#')) return trimmed;

    const [docPart, ...headingParts] = trimmed.split('#');
    const docSlug = docPart
        .replace(/^\.?\//, '')
        .replace(/\.md$/i, '')
        .replace(/^docs\//, '');
    const heading = headingParts.join('#');

    if (!docSlug) {
        return heading ? `#${encodeURIComponent(heading)}` : `/docs/${currentDocSlug}`;
    }
    if (!docsBySlug.has(docSlug)) return '#';

    return `/docs/${encodeURIComponent(docSlug)}${heading ? `#${encodeURIComponent(heading)}` : ''}`;
}

function renderInline(markdown, currentDocSlug, docsBySlug) {
    let html = escapeHtml(markdown);
    const protectedHtml = [];
    const protect = (value) => {
        const token = `\u0000${protectedHtml.length}\u0000`;
        protectedHtml.push(value);
        return token;
    };

    html = html.replace(/`([^`]+)`/g, (_match, code) => protect(`<code>${code}</code>`));

    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, rawSrc) => {
        const [srcPart, titlePart] = rawSrc.trim().split(/\s+["']/);
        const title = titlePart ? titlePart.replace(/["']$/, '') : '';
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        const imageUrl = escapeHtml(resolveDocImage(srcPart));
        return protect(
            `<a href="${imageUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open illustration at full size: ${escapeHtml(alt)}"><img src="${imageUrl}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy"></a>`
        );
    });

    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
        const resolved = resolveDocHref(href, currentDocSlug, docsBySlug);
        const externalAttrs = /^(https?:|mailto:)/i.test(resolved)
            ? ' target="_blank" rel="noopener noreferrer"'
            : '';
        return protect(
            `<a href="${escapeHtml(resolved)}"${externalAttrs}>${renderInline(label, currentDocSlug, docsBySlug)}</a>`
        );
    });

    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    return html.replace(/\u0000(\d+)\u0000/g, (_match, index) => protectedHtml[Number(index)]);
}

function isBlockStart(line) {
    const trimmed = line.trim();
    return (
        !trimmed ||
        /^#{1,6}\s+/.test(trimmed) ||
        /^([-*+]|\d+[.)])\s+/.test(trimmed) ||
        /^>\s?/.test(trimmed) ||
        /^```/.test(trimmed) ||
        /^-{3,}$|^\*{3,}$|^_{3,}$/.test(trimmed) ||
        (trimmed.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
    );
}

function splitTableRow(line) {
    return line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
}

function renderMarkdown(doc, docsBySlug) {
    const lines = doc.body.split('\n');
    const slugger = createSlugger();
    const html = [];
    let index = 0;
    let headingIndex = 0;

    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (!trimmed) {
            index++;
            continue;
        }

        if (trimmed.startsWith('```')) {
            const codeLines = [];
            index++;
            while (index < lines.length && !lines[index].trim().startsWith('```')) {
                codeLines.push(lines[index]);
                index++;
            }
            if (index < lines.length) index++;
            html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
            continue;
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
        if (heading) {
            const depth = heading[1].length;
            const text = heading[2].trim();
            html.push(
                `<h${depth} id="${doc.anchorIds?.[headingIndex++] ?? slugger(text)}">${renderInline(text, doc.slug, docsBySlug)}</h${depth}>`
            );
            index++;
            continue;
        }

        if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(trimmed)) {
            html.push('<hr>');
            index++;
            continue;
        }

        if (trimmed.startsWith('>')) {
            const parts = [];
            while (index < lines.length && lines[index].trim().startsWith('>')) {
                parts.push(lines[index].replace(/^\s*>\s?/, ''));
                index++;
            }
            html.push(
                `<blockquote>${renderMarkdown({ ...doc, body: parts.join('\n') }, docsBySlug)}</blockquote>`
            );
            continue;
        }

        if (
            line.includes('|') &&
            lines[index + 1] &&
            /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])
        ) {
            const headers = splitTableRow(line);
            const rows = [];
            index += 2;
            while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
                rows.push(splitTableRow(lines[index]));
                index++;
            }
            html.push(
                `<table><thead><tr>${headers
                    .map((cell) => `<th>${renderInline(cell, doc.slug, docsBySlug)}</th>`)
                    .join('')}</tr></thead><tbody>${rows
                    .map(
                        (row) =>
                            `<tr>${row
                                .map(
                                    (cell) => `<td>${renderInline(cell, doc.slug, docsBySlug)}</td>`
                                )
                                .join('')}</tr>`
                    )
                    .join('')}</tbody></table>`
            );
            continue;
        }

        const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
        if (listMatch) {
            const ordered = /^\d/.test(listMatch[2]);
            const tag = ordered ? 'ol' : 'ul';
            const items = [];
            while (index < lines.length) {
                const itemMatch = lines[index].match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
                if (!itemMatch || /^\d/.test(itemMatch[2]) !== ordered) break;
                items.push(`<li>${renderInline(itemMatch[3], doc.slug, docsBySlug)}</li>`);
                index++;
            }
            html.push(`<${tag}>${items.join('')}</${tag}>`);
            continue;
        }

        const paragraphLines = [trimmed];
        index++;
        while (index < lines.length && !isBlockStart(lines[index])) {
            paragraphLines.push(lines[index].trim());
            index++;
        }
        html.push(`<p>${renderInline(paragraphLines.join(' '), doc.slug, docsBySlug)}</p>`);
    }

    return html.join('\n');
}

function replaceOrInsertHeadTag(html, selector, replacement) {
    if (selector.test(html)) return html.replace(selector, replacement);
    return html.replace('</head>', `        ${replacement}\n    </head>`);
}

function updateMeta(html, attribute, key, content) {
    const escaped = escapeHtml(content);
    const pattern = new RegExp(`<meta\\s+[^>]*${attribute}="${key}"[^>]*>`, 's');
    return replaceOrInsertHeadTag(
        html,
        pattern,
        `<meta ${attribute}="${key}" content="${escaped}" />`
    );
}

function updateDocHead(template, doc) {
    const title = `${doc.title} | Kromacut Docs`;
    const url = `${siteUrl}/docs/${doc.slug}`;
    let html = template.replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`);

    html = updateMeta(html, 'name', 'description', doc.description);
    html = html.replace(
        /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
        `<link rel="canonical" href="${url}" />`
    );
    html = updateMeta(html, 'property', 'og:title', title);
    html = updateMeta(html, 'property', 'og:description', doc.description);
    html = updateMeta(html, 'property', 'og:type', 'article');
    html = updateMeta(html, 'property', 'og:url', url);
    html = updateMeta(html, 'property', 'og:image', socialImageUrl);
    html = updateMeta(html, 'property', 'og:image:secure_url', socialImageUrl);
    html = updateMeta(html, 'name', 'twitter:title', title);
    html = updateMeta(html, 'name', 'twitter:description', doc.description);
    html = updateMeta(html, 'name', 'twitter:image', socialImageUrl);

    return html;
}

function updateAppHead(template) {
    const title = 'Kromacut App - Image to 3D Print Tool';
    const description =
        'Create color-layered 3D prints from images with Kromacut. The browser tool runs locally and exports STL or 3MF models.';
    const url = `${siteUrl}/app`;
    let html = template.replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`);

    html = updateMeta(html, 'name', 'description', description);
    html = updateMeta(html, 'name', 'robots', 'noindex,nofollow');
    html = html.replace(
        /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
        `<link rel="canonical" href="${url}" />`
    );
    html = updateMeta(html, 'property', 'og:title', title);
    html = updateMeta(html, 'property', 'og:description', description);
    html = updateMeta(html, 'property', 'og:url', url);
    html = updateMeta(html, 'name', 'twitter:title', title);
    html = updateMeta(html, 'name', 'twitter:description', description);

    return html;
}

function renderStaticRoot(doc, docs, docsBySlug) {
    const nav = docs
        .map((entry) => `<li><a href="/docs/${entry.slug}">${escapeHtml(entry.title)}</a></li>`)
        .join('');
    const article = renderMarkdown(doc, docsBySlug);

    return `<div id="root">
            <main class="seo-doc-page">
                <nav aria-label="Documentation">
                    <a href="/">Kromacut home</a>
                    <a href="/app">Open Kromacut</a>
                    <ul>${nav}</ul>
                </nav>
                <article>
                    ${article}
                </article>
            </main>
        </div>`;
}

function generateDocPage(template, doc, docs, docsBySlug) {
    return updateDocHead(template, doc).replace(
        /<div id="root"><\/div>/,
        renderStaticRoot(doc, docs, docsBySlug)
    );
}

function writeDocPage(template, doc, docs, docsBySlug, slug = doc.slug) {
    const outputDir = path.join(distDir, 'docs', slug);
    const docPageHtml = generateDocPage(template, doc, docs, docsBySlug);
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(path.join(outputDir, 'index.html'), docPageHtml);

    if (slug) {
        writeFileSync(path.join(distDir, 'docs', `${slug}.html`), docPageHtml);
    }
}

function writeAppPage(template) {
    const outputDir = path.join(distDir, 'app');
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(path.join(outputDir, 'index.html'), updateAppHead(template));
}

function generateNotFoundPage(template) {
    const title = 'Page not found | Kromacut';
    const description =
        "This page doesn't exist. Open Kromacut, return to the homepage, or browse the documentation.";
    // GitHub Pages serves this at the original missing URL with HTTP 404.
    // Do not boot the SPA: recovery must work without JavaScript, and a bad
    // path must not be reinterpreted as a successful app/documentation page.
    let html = template
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<link\b[^>]*rel="modulepreload"[^>]*>/gi, '')
        .replace(/<link\b[^>]*rel="canonical"[^>]*>/gi, '')
        .replace('<html lang="en">', '<html lang="en" data-static-not-found>')
        .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
    html = updateMeta(html, 'name', 'description', description);
    html = updateMeta(html, 'name', 'robots', 'noindex,follow');
    html = updateMeta(html, 'property', 'og:title', title);
    html = updateMeta(html, 'property', 'og:description', description);
    html = updateMeta(html, 'property', 'og:url', `${siteUrl}/404.html`);
    html = updateMeta(html, 'name', 'twitter:title', title);
    html = updateMeta(html, 'name', 'twitter:description', description);

    // Same theme preference contract as src/lib/theme.ts. No profile/storage
    // writes or application code are needed to display this static document.
    const themeScript = `<script>
        (() => {
            let mode = 'dark';
            try {
                const saved = localStorage.getItem('theme');
                if (['light', 'dark', 'system'].includes(saved)) mode = saved;
            } catch {}
            const query = window.matchMedia('(prefers-color-scheme: dark)');
            const apply = () => {
                const dark = mode === 'dark' || (mode === 'system' && query.matches);
                const root = document.documentElement;
                root.classList.toggle('dark', dark);
                root.dataset.themeResolved = dark ? 'dark' : 'light';
                root.style.colorScheme = dark ? 'dark' : 'light';
                const meta = document.querySelector('meta[name="theme-color"]');
                if (meta) meta.content = dark ? '#0a0a0a' : '#ffffff';
            };
            apply();
            if (mode === 'system') query.addEventListener('change', apply);
        })();
    </script>`;
    html = html.replace('</head>', `${themeScript}\n    </head>`);
    const logo = findBuiltAsset('logo-');
    if (!logo) throw new Error('The built logo asset is required for the 404 page.');
    // Reuse the app's small vector artwork without another network dependency.
    const artwork = `data:image/svg+xml;base64,${readFileSync(path.join(rootDir, 'src/assets/not-found-layers.svg')).toString('base64')}`;
    const arrowRight =
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>';
    const arrowUpRight =
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>';
    const book =
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14m-10-3V3h6a4 4 0 0 1 4 4 4 4 0 0 1 4-4h6v15h-6a4 4 0 0 0-4 3 4 4 0 0 0-4-3Z"/></svg>';
    html = html.replace(
        /<div id="root"><\/div>/,
        `<div id="root">
        <main class="not-found-page" data-testid="not-found-page" aria-labelledby="not-found-heading">
            <div class="not-found-card">
                <header class="not-found-header">
                    <div class="not-found-brand"><img src="${logo}" alt="" width="36" height="36"><span>Kromacut</span></div>
                    <span class="not-found-code" aria-label="Error 404">404</span>
                </header>
                <div class="not-found-content">
                    <div class="not-found-copy">
                        <p class="not-found-eyebrow">A little off the build plate</p>
                        <h1 id="not-found-heading">${escapeHtml("This page doesn't exist")}</h1>
                        <p class="not-found-description">${escapeHtml("The link may be outdated, or the address may contain a typo. Let's get you back to creating.")}</p>
                        <div class="not-found-actions">
                            <a class="not-found-primary" href="/app">Open Kromacut ${arrowRight}</a>
                            <a class="not-found-secondary" href="/?landing=1">Go to homepage</a>
                        </div>
                    </div>
                    <div class="not-found-art" data-testid="not-found-art" aria-hidden="true"><img src="${artwork}" alt="" width="520" height="460"></div>
                </div>
                <footer class="not-found-footer">
                    <p>${book} Looking for a guide?</p>
                    <a class="not-found-docs-link" href="/docs/overview">Browse documentation ${arrowUpRight}</a>
                </footer>
            </div>
        </main>
    </div>`
    );
    return html;
}

function writeNotFoundPage(template) {
    writeFileSync(path.join(distDir, '404.html'), generateNotFoundPage(template));
}

function writeSitemap(docs) {
    const urls = ['/', '/privacy', '/terms', ...docs.map((doc) => `/docs/${doc.slug}`)];
    const body = urls
        .map((url) => `    <url><loc>${siteUrl}${url === '/' ? '/' : url}</loc></url>`)
        .join('\n');
    writeFileSync(
        path.join(distDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
    );
}

function generateLegalPage(
    template,
    kind,
    notice = JSON.parse(readFileSync(path.join(rootDir, `src/data/${kind}Notice.json`), 'utf8'))
) {
    const logo = findBuiltAsset('logo-');
    // Both lazy pages share the same legal-page shell. Locate its CSS by the
    // selector rather than depending on Vite's shared-chunk filename.
    const stylesheet = readdirSync(path.join(distDir, 'assets')).find(
        (file) =>
            file.endsWith('.css') &&
            readFileSync(path.join(distDir, 'assets', file), 'utf8').includes('.privacy-page')
    );
    if (!logo || !stylesheet) throw new Error(`${kind} page assets are missing.`);

    // Use the same factual copy as React. Keep the email entirely out of the
    // static page; the interactive component reveals it only after activation.
    const sections = notice.sections
        .map(
            (section) => `<section aria-labelledby="${escapeHtml(section.id)}">
        <h2 id="${escapeHtml(section.id)}">${escapeHtml(section.title)}</h2>
        ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
        ${
            section.links.length
                ? `<ul class="privacy-sources">${section.links
                      .map(
                          (link) =>
                              `<li><a href="${escapeHtml(link.href)}" rel="noreferrer">${escapeHtml(link.label)}</a></li>`
                      )
                      .join('')}</ul>`
                : ''
        }
    </section>`
        )
        .join('');
    const contents = `<nav class="privacy-contents" aria-label="On this page">
        <p>On this page</p><ul>
            ${notice.sections.map((section) => `<li><a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a></li>`).join('')}
            <li><a href="#${kind}-contact-heading">${escapeHtml(notice.contactTitle)}</a></li>
        </ul>
    </nav>`;

    let html = template
        .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(
            /<link\b[^>]*rel="canonical"[^>]*>/gi,
            `<link rel="canonical" href="${siteUrl}/${kind}" />`
        )
        .replace('<html lang="en">', `<html lang="en" data-${kind}-page>`)
        .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(notice.seoTitle)}</title>`)
        .replace('</head>', `<link rel="stylesheet" href="/assets/${stylesheet}" />\n</head>`);
    html = updateMeta(html, 'name', 'description', notice.description);
    html = updateMeta(html, 'name', 'robots', 'index,follow');
    html = updateMeta(html, 'property', 'og:title', notice.seoTitle);
    html = updateMeta(html, 'property', 'og:description', notice.description);
    html = updateMeta(html, 'property', 'og:url', `${siteUrl}/${kind}`);
    html = updateMeta(html, 'name', 'twitter:title', notice.seoTitle);
    html = updateMeta(html, 'name', 'twitter:description', notice.description);
    html = html.replace(
        /<div id="root"><\/div>/,
        `<div id="root">
        <main class="privacy-page" data-testid="${kind}-page" aria-labelledby="${kind}-heading">
            <div class="privacy-shell">
                <header class="privacy-header">
                    <a class="privacy-brand" href="/?landing=1" aria-label="Kromacut homepage"><img src="${logo}" width="36" height="36" alt=""><span>Kromacut</span></a>
                    <a class="privacy-app-link" href="/app">Open Kromacut</a>
                </header>
                <article class="privacy-article">
                    <p class="privacy-eyebrow">${kind === 'privacy' ? 'Local-first. Clearly explained.' : 'Using Kromacut.'}</p>
                    <h1 id="${kind}-heading">${escapeHtml(notice.title)}</h1>
                    <p class="privacy-updated">Updated ${escapeHtml(notice.updated)}</p>
                    <p class="privacy-intro">${escapeHtml(notice.intro)}</p>
                    ${contents}
                    ${sections}
                    <section aria-labelledby="${kind}-contact-heading">
                        <h2 id="${kind}-contact-heading">${escapeHtml(notice.contactTitle)}</h2>
                        <p>${escapeHtml(notice.contactDescription)}</p>
                        <noscript><p>Enable JavaScript to reveal the public contact email. It is not included in the static page to deter simple address scrapers.</p></noscript>
                    </section>
                </article>
                <footer class="privacy-footer">
                    <a href="/?landing=1">Go to homepage</a><a href="/docs/overview">Browse documentation</a>
                    ${kind === 'privacy' ? '<a href="/terms">Terms &amp; conditions</a>' : '<a href="/privacy">Privacy &amp; local data</a>'}
                </footer>
            </div>
        </main>
    </div>`
    );
    return html;
}

function writeLegalPage(template, kind) {
    const html = generateLegalPage(template, kind);
    const outputDir = path.join(distDir, kind);
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(path.join(outputDir, 'index.html'), html);
}

function writeRobots() {
    writeFileSync(
        path.join(distDir, 'robots.txt'),
        `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`
    );
}

function verifyGeneratedOutput(docs) {
    const requiredFiles = [
        'index.html',
        'app/index.html',
        '404.html',
        'docs/index.html',
        'privacy/index.html',
        'terms/index.html',
        'robots.txt',
        'sitemap.xml',
        'site.webmanifest',
        'version.json',
    ];
    const assertGenerated = (condition, message) => {
        if (!condition) throw new Error(`Generated output verification failed: ${message}`);
    };

    requiredFiles.forEach((file) => {
        assertGenerated(existsSync(path.join(distDir, file)), `missing dist/${file}`);
    });

    const rootHtml = readFileSync(path.join(distDir, 'index.html'), 'utf8');
    const appHtml = readFileSync(path.join(distDir, 'app', 'index.html'), 'utf8');
    const notFoundHtml = readFileSync(path.join(distDir, '404.html'), 'utf8');
    const sitemap = readFileSync(path.join(distDir, 'sitemap.xml'), 'utf8');
    const robots = readFileSync(path.join(distDir, 'robots.txt'), 'utf8');
    const manifest = JSON.parse(readFileSync(path.join(distDir, 'site.webmanifest'), 'utf8'));
    const version = JSON.parse(readFileSync(path.join(distDir, 'version.json'), 'utf8'));

    for (const kind of ['privacy', 'terms']) {
        assertGenerated(
            sitemap.includes(`<loc>https://kromacut.com/${kind}</loc>`),
            `${kind} page is missing from sitemap`
        );
        const legalHtml = readFileSync(path.join(distDir, kind, 'index.html'), 'utf8');
        assertGenerated(
            legalHtml.includes(`data-testid="${kind}-page"`) &&
                !legalHtml.includes('privacy-draft-notice') &&
                !legalHtml.includes('privacy-review-heading') &&
                legalHtml.includes('<meta name="robots" content="index,follow"') &&
                legalHtml.includes(`<link rel="canonical" href="https://kromacut.com/${kind}"`) &&
                !legalHtml.includes('mailto:'),
            `${kind} page must be indexable and canonical without public review notes or a static email link`
        );
    }

    assertGenerated(
        rootHtml.includes('<link rel="canonical" href="https://kromacut.com/"'),
        'root canonical URL is missing'
    );
    assertGenerated(
        /(?:src|href)="\/assets\//.test(rootHtml),
        'root does not use root-relative built assets'
    );
    assertGenerated(
        appHtml.includes('<meta name="robots" content="noindex,nofollow"'),
        '/app noindex metadata is missing'
    );
    assertGenerated(
        appHtml.includes('<link rel="canonical" href="https://kromacut.com/app"'),
        '/app canonical URL is missing'
    );
    assertGenerated(
        notFoundHtml.includes('<meta name="robots" content="noindex,follow"') &&
            notFoundHtml.includes('data-testid="not-found-page"'),
        '404 must contain an index-excluded, usable static page'
    );
    assertGenerated(
        !/<script\b[^>]*(?:type="module"|src=)/.test(notFoundHtml) &&
            !notFoundHtml.includes('rel="canonical"'),
        '404 must not boot the app or claim a successful-page canonical URL'
    );
    assertGenerated(!sitemap.includes('/404'), '404 must not appear in sitemap');
    assertGenerated(
        sitemap.includes('<loc>https://kromacut.com/</loc>'),
        'root is missing from sitemap'
    );
    assertGenerated(
        !sitemap.includes('https://kromacut.com/app'),
        '/app must not appear in sitemap'
    );
    assertGenerated(
        robots.includes('Sitemap: https://kromacut.com/sitemap.xml'),
        'robots.txt sitemap reference is missing'
    );
    assertGenerated(manifest.start_url === '/app', 'manifest start_url must be /app');
    assertGenerated(manifest.id === '/', 'manifest id must remain stable at /');
    assertGenerated(
        typeof version.version === 'string' && version.version.length > 0,
        'version.json is invalid'
    );

    docs.forEach((doc) => {
        const relativePage = path.join('docs', doc.slug, 'index.html');
        const pagePath = path.join(distDir, relativePage);
        assertGenerated(existsSync(pagePath), `missing dist/${relativePage}`);
        const html = readFileSync(pagePath, 'utf8');
        assertGenerated(
            html.includes(`<link rel="canonical" href="${siteUrl}/docs/${doc.slug}"`),
            `canonical URL is missing for ${doc.slug}`
        );

        for (const match of html.matchAll(/<img\s+[^>]*src="([^"]+)"/g)) {
            const src = match[1];
            if (/^(https?:|data:)/i.test(src)) continue;
            assertGenerated(
                !src.includes('<') && !src.includes('>'),
                `malformed image URL in ${doc.slug}: ${src}`
            );
            assertGenerated(
                src.startsWith('/'),
                `image URL is not root-relative in ${doc.slug}: ${src}`
            );
            assertGenerated(
                existsSync(path.join(distDir, src.slice(1))),
                `missing image used by ${doc.slug}: ${src}`
            );
        }
    });
}

if (!existsSync(distIndexPath)) {
    throw new Error('dist/index.html was not found. Run this script after vite build.');
}

const docs = parseDocs();
const docsBySlug = new Map(docs.map((doc) => [doc.slug, doc]));
const template = readFileSync(distIndexPath, 'utf8');
const overviewDoc = docsBySlug.get('overview') ?? docs[0];

docs.forEach((doc) => writeDocPage(template, doc, docs, docsBySlug));
if (overviewDoc) writeDocPage(template, overviewDoc, docs, docsBySlug, '');
writeAppPage(template);
writeNotFoundPage(template);
writeLegalPage(template, 'privacy');
writeLegalPage(template, 'terms');
writeSitemap(docs);
writeRobots();
verifyGeneratedOutput(docs);

export {
    parseDocs,
    generateDocPage,
    generateLegalPage,
    generateNotFoundPage,
    updateMeta,
    escapeHtml,
    findBuiltAsset,
    createSlugger,
};
