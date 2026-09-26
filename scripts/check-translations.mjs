import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localeDir = path.join(root, 'src/locales');
const languages = ['fr', 'de', 'it', 'ro', 'es', 'ja', 'zh-CN', 'hi', 'pt-PT', 'uk', 'bn'];
const namespaces = [
    ...readdirSync(path.join(localeDir, 'en'))
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.slice(0, -5)),
    'privacy',
    'terms',
];
const errors = [];
const identical = [];
const read = (filename) => JSON.parse(readFileSync(filename, 'utf8'));
const flatten = (value, prefix = '', output = {}) => {
    for (const [key, child] of Object.entries(value)) {
        const name = prefix ? `${prefix}.${key}` : key;
        if (typeof child === 'string') output[name] = child;
        else if (child && typeof child === 'object') flatten(child, name, output);
    }
    return output;
};
const slots = (value) => [...value.matchAll(/{{\s*([^}]+?)\s*}}/g)].map((match) => match[1]).sort();
const tags = (value) =>
    [...value.matchAll(/<\/?([\w]+)(?:\s[^>]*)?\s*\/?>/g)]
        .map((match) => match[0].replace(/\s+[^>]*/, '>'))
        .sort();
const plural = /_(zero|one|two|few|many|other)$/;
const invariant = (key) => /(?:^|\.)(id|href)$/.test(key);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let translatedMessages = 0;

for (const namespace of namespaces) {
    const englishPath = ['privacy', 'terms'].includes(namespace)
        ? path.join(root, `src/data/${namespace}Notice.json`)
        : path.join(localeDir, `en/${namespace}.json`);
    const source = flatten(read(englishPath));
    for (const language of languages) {
        const targetPath = path.join(localeDir, language, `${namespace}.json`);
        if (!existsSync(targetPath)) {
            errors.push(`${language}/${namespace}: missing catalog`);
            continue;
        }
        let target;
        try {
            target = flatten(read(targetPath));
        } catch (error) {
            errors.push(`${language}/${namespace}: ${error.message}`);
            continue;
        }
        const expected = new Map();
        for (const [key, value] of Object.entries(source)) {
            if (plural.test(key)) {
                const base = key.replace(plural, '');
                const categories = new Intl.PluralRules(language).resolvedOptions()
                    .pluralCategories;
                for (const category of categories)
                    expected.set(
                        `${base}_${category}`,
                        source[`${base}_${category}`] ?? source[`${base}_other`] ?? value
                    );
            } else expected.set(key, value);
        }
        for (const [key, value] of expected) {
            const translated = target[key];
            if (typeof translated !== 'string' || !translated.trim()) {
                errors.push(`${language}/${namespace}:${key}: missing translation`);
                continue;
            }
            if (!same(slots(value), slots(translated)))
                errors.push(`${language}/${namespace}:${key}: interpolation placeholders differ`);
            if (!same(tags(value), tags(translated)))
                errors.push(`${language}/${namespace}:${key}: rich-text tags differ`);
            if (invariant(key) && value !== translated)
                errors.push(`${language}/${namespace}:${key}: identifier or URL changed`);
            const proseWords = value.replace(/{{[^}]+}}|<[^>]+>/g, '').match(/[a-zA-Z]{2,}/g) ?? [];
            if (
                !invariant(key) &&
                value === translated &&
                proseWords.length >= 5 &&
                !/^https?:/.test(value)
            )
                identical.push(`${language}/${namespace}:${key}: ${value}`);
            translatedMessages++;
        }
        for (const key of Object.keys(target)) {
            if (
                !expected.has(key) &&
                !Object.keys(source).some(
                    (sourceKey) => sourceKey.replace(plural, '') === key.replace(plural, '')
                )
            )
                errors.push(`${language}/${namespace}:${key}: stale or unknown key`);
        }
    }
}

const docFiles = readdirSync(path.join(root, 'src/docs')).filter((file) => file.endsWith('.md'));
for (const language of languages) {
    const metadataPath = path.join(localeDir, language, 'docsMeta.json');
    const metadata = existsSync(metadataPath) ? read(metadataPath) : {};
    for (const file of docFiles) {
        const translatedPath = path.join(localeDir, language, 'docs', file);
        if (!existsSync(translatedPath)) {
            errors.push(`${language}/docs/${file}: missing guide`);
            continue;
        }
        const source = readFileSync(path.join(root, 'src/docs', file), 'utf8').replaceAll(
            '\r\n',
            '\n'
        );
        const translated = readFileSync(translatedPath, 'utf8').replaceAll('\r\n', '\n');
        const frontmatter = translated.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
        const slug = source.match(/^slug: (.+)$/m)?.[1]?.trim();
        for (const field of ['title', 'description']) {
            const value = frontmatter
                .match(new RegExp(`^${field}: (.+)$`, 'm'))?.[1]
                ?.trim()
                .replace(/^["']|["']$/g, '');
            if (!value || value !== metadata[slug]?.[field])
                errors.push(`${language}/docs/${file}: ${field} differs from docsMeta`);
        }
        for (const field of ['slug', 'order']) {
            const re = new RegExp(`^${field}: (.+)$`, 'm');
            if (source.match(re)?.[1] !== translated.match(re)?.[1])
                errors.push(`${language}/docs/${file}: ${field} differs`);
        }
        const headingDepths = (text) =>
            [...text.matchAll(/^(#{1,6})\s+.+$/gm)].map((match) => match[1]);
        if (!same(headingDepths(source), headingDepths(translated)))
            errors.push(`${language}/docs/${file}: heading outline differs`);
        const links = (text) =>
            [...text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]).sort();
        if (!same(links(source), links(translated)))
            errors.push(`${language}/docs/${file}: links or assets differ`);
        const code = (text) => [...text.matchAll(/```[\s\S]*?```/g)].map((match) => match[0]);
        if (!same(code(source), code(translated)))
            errors.push(`${language}/docs/${file}: code examples differ`);
        const prose = (text) =>
            text.replace(/^---\n[\s\S]*?\n---\s*/, '').replace(/```[\s\S]*?```/g, '');
        const structure = (text) => ({
            lists: [...prose(text).matchAll(/^([ \t]*)([-*+]|\d+[.)])[ \t]+.+$/gm)].map((match) => [
                match[1].length,
                /^\d/.test(match[2]),
            ]),
            tableRows: prose(text)
                .split('\n')
                .filter((line) => /^\s*\|/.test(line))
                .map((line) => line.split(/(?<!\\)\|/).length),
        });
        if (!same(structure(source), structure(translated)))
            errors.push(`${language}/docs/${file}: list items or table cells differ`);
        const originalLines = new Set(
            prose(source)
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
        );
        for (const line of prose(translated)
            .split('\n')
            .map((line) => line.trim())) {
            const words = line.replace(/`[^`]+`|https?:\/\/\S+/g, '').match(/[a-zA-Z]{2,}/g) ?? [];
            if (words.length >= 5 && originalLines.has(line))
                errors.push(`${language}/docs/${file}: untranslated prose: ${line}`);
        }
    }
}

if (identical.length) {
    errors.push(...identical.map((phrase) => `Untranslated English phrase: ${phrase}`));
}
if (errors.length) {
    console.error(`${errors.length} translation coverage errors:\n${errors.join('\n')}`);
    process.exitCode = 1;
} else
    console.log(
        `Translation structure verified: ${translatedMessages} messages, ${languages.length * docFiles.length} guides, ${languages.length} translated languages.`
    );
