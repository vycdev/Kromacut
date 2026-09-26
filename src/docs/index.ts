import type { DocRecord } from '@/types/docs';
import { createDocRecord } from '@/lib/docs/metadata';
import { preserveCanonicalDocAnchors } from '@/lib/docs/localization';
import type { AppLanguage } from '@/lib/languagePreferences';
import { prepareLocalizedDocAssets } from './assets';

const modules = import.meta.glob('./*.md', {
    eager: true,
    query: '?raw',
    import: 'default',
});

export const docs: DocRecord[] = Object.entries(modules)
    .map(([sourcePath, content]) => createDocRecord(sourcePath, String(content)))
    .sort((a, b) => a.meta.order - b.meta.order || a.meta.title.localeCompare(b.meta.title));

export const defaultDocSlug = docs[0]?.meta.slug ?? 'overview';

// Only the requested guide is loaded; eleven translated libraries never enter the workspace bundle.
const translatedModules = import.meta.glob('../locales/*/docs/*.md', {
    query: '?raw',
    import: 'default',
});
const translatedDocs = new Map<string, Promise<DocRecord>>();

export async function loadTranslatedDoc(language: AppLanguage, slug: string): Promise<DocRecord> {
    const canonical = docs.find((doc) => doc.meta.slug === slug);
    if (!canonical) throw new Error(`Unknown document: ${slug}`);
    if (language === 'en') return canonical;
    const key = `${language}/${slug}`;
    const cached = translatedDocs.get(key);
    if (cached) return cached;
    const path = `../locales/${language}/docs/${slug}.md`;
    const load = translatedModules[path];
    if (!load) throw new Error(`Missing translated document: ${key}`);
    const pending = load()
        .then(async (raw) => {
            const doc = preserveCanonicalDocAnchors(canonical, createDocRecord(path, String(raw)));
            await prepareLocalizedDocAssets(doc, language);
            return doc;
        })
        .catch((error) => {
            translatedDocs.delete(key);
            throw error;
        });
    translatedDocs.set(key, pending);
    return pending;
}
