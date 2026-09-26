import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(root, 'src/lib/languagePreferences.ts'), 'utf8');
const languages = [...source.matchAll(/code: '([^']+)'/g)].map((match) => match[1]);
const feed = JSON.parse(readFileSync(path.join(root, 'public/version.json'), 'utf8'));
const notes = feed.release_notes_localized;
const errors = [];
if (!languages.length) errors.push('Could not read the supported language list');
if (typeof feed.release_notes !== 'string' || !feed.release_notes.trim())
    errors.push('The legacy English release_notes field must remain available');
for (const language of languages) {
    const text = notes?.[language];
    if (typeof text !== 'string' || !text.trim()) {
        errors.push(`Missing release notes for ${language}; runtime fallback does not count`);
    } else if (language === 'en' && text !== feed.release_notes) {
        errors.push('English release_notes_localized must equal legacy release_notes');
    } else if (language !== 'en' && text.trim() === feed.release_notes?.trim()) {
        errors.push(`Untranslated English release notes for ${language}`);
    }
}
for (const language of Object.keys(notes ?? {})) {
    if (!languages.includes(language))
        errors.push(`Unsupported release-note language: ${language}`);
}
if (errors.length) {
    console.error(`Release-note coverage errors:\n${errors.join('\n')}`);
    process.exitCode = 1;
} else {
    console.log(`Release notes contain genuine entries for all ${languages.length} languages.`);
}
