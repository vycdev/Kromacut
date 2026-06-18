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
        .toLowerCase()
        .trim()
        .replace(/['"]/g, '')
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

function parseDocs() {
    return readdirSync(docsDir)
        .filter((file) => file.endsWith('.md'))
        .map((file) => {
            const raw = readFileSync(path.join(docsDir, file), 'utf8');
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

    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, rawSrc) => {
        const [srcPart, titlePart] = rawSrc.trim().split(/\s+["']/);
        const title = titlePart ? titlePart.replace(/["']$/, '') : '';
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `<img src="${escapeHtml(resolveDocImage(srcPart))}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy">`;
    });

    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
        const resolved = resolveDocHref(href, currentDocSlug, docsBySlug);
        const externalAttrs = /^(https?:|mailto:)/i.test(resolved)
            ? ' target="_blank" rel="noopener noreferrer"'
            : '';
        return `<a href="${escapeHtml(resolved)}"${externalAttrs}>${renderInline(label, currentDocSlug, docsBySlug)}</a>`;
    });

    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    return html;
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
                `<h${depth} id="${slugger(text)}">${renderInline(text, doc.slug, docsBySlug)}</h${depth}>`
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
            html.push(`<blockquote>${renderMarkdown({ ...doc, body: parts.join('\n') }, docsBySlug)}</blockquote>`);
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
                                .map((cell) => `<td>${renderInline(cell, doc.slug, docsBySlug)}</td>`)
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
    return replaceOrInsertHeadTag(html, pattern, `<meta ${attribute}="${key}" content="${escaped}" />`);
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

function renderStaticRoot(doc, docs, docsBySlug) {
    const nav = docs
        .map((entry) => `<li><a href="/docs/${entry.slug}">${escapeHtml(entry.title)}</a></li>`)
        .join('');
    const article = renderMarkdown(doc, docsBySlug);

    return `<div id="root">
            <main class="seo-doc-page">
                <nav aria-label="Documentation">
                    <a href="/">Kromacut app</a>
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

function writeSitemap(docs) {
    const urls = ['/', ...docs.map((doc) => `/docs/${doc.slug}`)];
    const body = urls
        .map((url) => `    <url><loc>${siteUrl}${url === '/' ? '/' : url}</loc></url>`)
        .join('\n');
    writeFileSync(
        path.join(distDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
    );
}

function writeRobots() {
    writeFileSync(
        path.join(distDir, 'robots.txt'),
        `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`
    );
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
writeSitemap(docs);
writeRobots();
