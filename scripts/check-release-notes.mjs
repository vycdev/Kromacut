import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkReleaseNotes(root, releaseTag, releaseRef) {
    const read = (file) => readFileSync(path.join(root, file), 'utf8');
    const json = (file) => JSON.parse(read(file));
    const source = read('src/lib/languagePreferences.ts');
    const languages = [...source.matchAll(/code: '([^']+)'/g)].map((match) => match[1]);
    const feed = json('public/version.json');
    const notes = feed.release_notes_localized;
    const errors = [];
    const version = json('package.json').version;
    const lock = json('package-lock.json');
    const cargoPackage = read('src-tauri/Cargo.toml')
        .split(/^\[package\]\s*$/m)[1]
        ?.split(/^\[/m)[0];
    const cargoLockPackage = read('src-tauri/Cargo.lock')
        .split(/^\[\[package\]\]\s*$/m)
        .find((block) => /^name\s*=\s*"kromacut"\s*$/m.test(block));
    const tomlVersion = (block) => /^version\s*=\s*"([^"]+)"\s*$/m.exec(block ?? '')?.[1];
    if (!/^\d+\.\d+\.\d+$/.test(version))
        errors.push('package.json must contain a stable release version');
    for (const [file, actual] of [
        ['package-lock.json', lock.version],
        ['package-lock.json packages[""]', lock.packages?.['']?.version],
        ['src-tauri/tauri.conf.json', json('src-tauri/tauri.conf.json').version],
        ['src-tauri/Cargo.toml', tomlVersion(cargoPackage)],
        ['src-tauri/Cargo.lock', tomlVersion(cargoLockPackage)],
        ['public/version.json', feed.version],
    ]) {
        if (actual !== version) errors.push(`${file} version ${actual} must match ${version}`);
    }
    if (releaseTag !== undefined && releaseTag !== `v${version}`) {
        errors.push(`Release tag ${releaseTag} must match v${version}`);
    }
    if (releaseRef !== undefined && releaseRef !== `refs/tags/v${version}`) {
        errors.push(`Release workflow must run on refs/tags/v${version}, not ${releaseRef}`);
    }
    if (
        !new RegExp(
            `^https://github\\.com/[\\w.-]+/[\\w.-]+/releases/tag/v${String(version).replaceAll('.', '\\.')}$`
        ).test(feed.download_url ?? '')
    ) {
        errors.push('Update download_url must point to the matching GitHub release tag');
    }
    const entries = read('CHANGELOG.md').split(/^## /m).slice(1);
    const entry = entries.find((section) => section.startsWith(`v${version} - `));
    if (!entry || !/^v\d+\.\d+\.\d+ - \d{4}-\d{2}-\d{2}\r?\n[\s\S]*\S/.test(entry)) {
        errors.push(`CHANGELOG.md needs a dated, nonempty v${version} entry`);
    }
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
    return { version, languageCount: languages.length, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    try {
        const { version, languageCount, errors } = checkReleaseNotes(
            path.resolve(import.meta.dirname, '..'),
            process.env.KROMACUT_RELEASE_TAG,
            process.env.KROMACUT_RELEASE_REF
        );
        if (errors.length) {
            throw new Error(`Release metadata errors:\n${errors.join('\n')}`);
        }
        console.log(
            `Release ${version}: synchronized versions and notes for all ${languageCount} languages.`
        );
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
