import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkReleaseNotes } from '../scripts/check-release-notes.mjs';

function fixture(t: TestContext) {
    const root = mkdtempSync(path.join(tmpdir(), 'kromacut-release-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const write = (file: string, value: string | object) => {
        const target = path.join(root, file);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
    };
    const version = '9.2.1';
    const feed = {
        version,
        download_url: 'https://github.com/vycdev/Kromacut/releases/tag/v9.2.1',
        release_notes: 'New release',
        release_notes_localized: { en: 'New release', fr: 'Nouvelle version' },
    };
    write('package.json', { version });
    write('package-lock.json', { version, packages: { '': { version } } });
    write('src-tauri/tauri.conf.json', { version });
    write(
        'src-tauri/Cargo.toml',
        '[package]\nname = "kromacut"\nversion = "9.2.1"\n\n[dependencies.other]\nversion = "1.0.0"'
    );
    write(
        'src-tauri/Cargo.lock',
        'version = 4\n\n[[package]]\nname = "other"\nversion = "1.0.0"\n\n[[package]]\nname = "kromacut"\nversion = "9.2.1"'
    );
    write('src/lib/languagePreferences.ts', "[{ code: 'en' }, { code: 'fr' }]");
    write('public/version.json', feed);
    write('CHANGELOG.md', '# Changelog\n\n## Unreleased\n\n## v9.2.1 - 2026-09-26\n\n- Feature.\n');
    return { root, write, feed };
}

test('release metadata accepts synchronized versions and the exact version tag', (t) => {
    const { root } = fixture(t);
    assert.deepEqual(checkReleaseNotes(root, 'v9.2.1', 'refs/tags/v9.2.1'), {
        version: '9.2.1',
        languageCount: 2,
        errors: [],
    });
    assert.deepEqual(checkReleaseNotes(root).errors, []);
});

test('release metadata rejects stale JSON versions including both npm lockfile roots', (t) => {
    const { root, write, feed } = fixture(t);
    write('package-lock.json', { version: '9.2.0', packages: { '': { version: '9.1.0' } } });
    write('src-tauri/tauri.conf.json', { version: '9.2.0' });
    write('public/version.json', { ...feed, version: '9.2.0' });
    const errors = checkReleaseNotes(root).errors;
    for (const file of [
        'package-lock.json version',
        'package-lock.json packages[""]',
        'tauri.conf.json',
        'public/version.json',
    ]) {
        assert.ok(
            errors.some((message) => message.includes(file)),
            file
        );
    }
});

test('release metadata reads the application Cargo versions, not dependency versions', (t) => {
    const { root, write } = fixture(t);
    write(
        'src-tauri/Cargo.toml',
        '[package]\nname = "kromacut"\nversion = "9.2.0"\n\n[dependencies.other]\nversion = "9.2.1"'
    );
    write(
        'src-tauri/Cargo.lock',
        '[[package]]\nname = "other"\nversion = "9.2.1"\n\n[[package]]\nname = "kromacut"\nversion = "9.2.0"'
    );
    const errors = checkReleaseNotes(root).errors;
    assert.ok(errors.some((message) => message.includes('Cargo.toml')));
    assert.ok(errors.some((message) => message.includes('Cargo.lock')));
});

test('release metadata rejects branch dispatches and mismatched release tags', (t) => {
    const { root } = fixture(t);
    assert.match(checkReleaseNotes(root, 'v9.2.0').errors.join('\n'), /Release tag/);
    assert.match(
        checkReleaseNotes(root, 'develop', 'refs/heads/develop').errors.join('\n'),
        /must run on refs\/tags/
    );
    assert.match(
        checkReleaseNotes(root, 'v9.2.1', 'refs/heads/v9.2.1').errors.join('\n'),
        /must run on refs\/tags/
    );
});

test('release metadata rejects missing or empty changelog entries and unpinned download links', (t) => {
    const { root, write, feed } = fixture(t);
    write('CHANGELOG.md', '## Unreleased\n\n- Feature\n\n## v9.2.0 - 2026-09-25\n\n- Old.');
    write('public/version.json', {
        ...feed,
        download_url: 'https://github.com/vycdev/Kromacut/releases/latest',
    });
    assert.match(checkReleaseNotes(root).errors.join('\n'), /dated, nonempty/);
    assert.match(checkReleaseNotes(root).errors.join('\n'), /download_url/);
    write('CHANGELOG.md', '## v9.2.1 - 2026-09-26\n\n\n## v9.2.0 - 2026-09-25\n\n- Old.');
    assert.match(checkReleaseNotes(root).errors.join('\n'), /dated, nonempty/);
});

test('release metadata retains translation coverage and legacy English compatibility checks', (t) => {
    const { root, write, feed } = fixture(t);
    for (const [notes, expected] of [
        [{ en: 'New release' }, /Missing release notes for fr/],
        [{ en: 'Changed', fr: 'Nouvelle version' }, /must equal legacy/],
        [{ en: 'New release', fr: 'New release' }, /Untranslated English/],
        [
            { en: 'New release', fr: 'Nouvelle version', xx: 'Unknown' },
            /Unsupported release-note language/,
        ],
    ] as const) {
        write('public/version.json', { ...feed, release_notes_localized: notes });
        assert.match(checkReleaseNotes(root).errors.join('\n'), expected);
    }
});
