import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createSlugger } from '../src/lib/docs/slug.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const docsDir = join(root, 'src/docs');
const docs = readdirSync(docsDir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
        const raw = readFileSync(join(docsDir, file), 'utf8');
        const slug = raw.match(/^slug: (.+)$/m)?.[1].trim();
        const slugger = createSlugger();
        const headings = [...raw.matchAll(/^#{1,6} (.+)$/gm)].map((match) =>
            slugger(match[1].trim().replace(/[*`]/g, ''))
        );
        return { file, raw, slug, headings };
    });

test('documentation pages have unique metadata and reachable navigation', () => {
    const nav = readFileSync(join(root, 'src/components/docs/DocsPage.tsx'), 'utf8');
    const slugs = new Set<string>();
    for (const doc of docs) {
        assert.ok(doc.slug, `Missing slug: ${doc.file}`);
        assert.ok(!slugs.has(doc.slug), `Duplicate slug: ${doc.slug}`);
        slugs.add(doc.slug);
        assert.match(doc.raw, /^title: .+$/m);
        assert.match(doc.raw, /^description: .+$/m);
        assert.ok(nav.includes(`'${doc.slug}'`), `${doc.slug} absent from sidebar`);
        assert.ok(doc.headings.length > 1, `${doc.file} lacks a usable outline`);
    }
});

test('documentation links resolve to existing pages and headings', () => {
    for (const doc of docs) {
        for (const match of doc.raw.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
            const href = match[1].trim();
            if (/^(https?:|mailto:)/i.test(href)) continue;
            const [page, fragment] = href.split('#');
            const slug = page.replace(/^\.\//, '').replace(/\.md$/, '') || doc.slug;
            const target = docs.find((entry) => entry.slug === slug);
            assert.ok(target, `${doc.file}: unknown link ${href}`);
            if (fragment) {
                assert.ok(
                    target.headings.includes(fragment),
                    `${doc.file}: missing anchor ${href}`
                );
            }
        }
    }
});

test('documentation images are local, accessible and available to both renderers', () => {
    for (const doc of docs) {
        for (const match of doc.raw.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
            const [, alt, src] = match;
            assert.ok(alt.trim().length > 10, `${doc.file}: explain the illustration in alt text`);
            if (!src.endsWith('.svg')) {
                const rasterAssets: Record<string, string> = {
                    'td-test.png': 'tdTest.png',
                    'kromacut-logo.png': 'logo.png',
                    'hd-wedges-eight-colors-2026-09-13.jpg':
                        'hd-wedges-eight-colors-2026-09-13.jpg',
                };
                const asset = rasterAssets[src];
                assert.ok(asset, `Unknown image: ${src}`);
                assert.ok(
                    existsSync(join(root, 'src/assets', asset)),
                    `${doc.file}: missing ${src}`
                );
                continue;
            }
            const path = join(root, 'src/assets/diagrams', src);
            assert.ok(existsSync(path), `${doc.file}: missing ${src}`);
            const svg = readFileSync(path, 'utf8');
            assert.match(svg, /viewBox="[^"]+"/, `${src}: missing responsive viewBox`);
            assert.doesNotMatch(svg, /<(script|foreignObject)\b|https?:\/\/[^\s"]+\.(png|jpe?g)/i);
            assert.match(svg, /<title\b/);
            assert.match(svg, /<desc\b/);
            assert.match(svg, /aria-labelledby=/);
        }
    }
});
