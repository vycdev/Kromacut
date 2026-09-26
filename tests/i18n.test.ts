import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    matchLanguage,
    resolveLanguage,
    SUPPORTED_LANGUAGES,
} from '../src/lib/languagePreferences.ts';
import {
    publicPath,
    languageFromPath,
    selectRoute,
    stripLanguagePrefix,
} from '../src/lib/routes.ts';
import { parseDocsPath } from '../src/lib/docs/navigation.ts';
import { preserveCanonicalDocAnchors } from '../src/lib/docs/localization.ts';
import { localizeDiagramSvg } from '../src/lib/docs/diagramLocalization.ts';
import { i18n } from '../src/lib/i18n.ts';
import { translateRuntimeMessage } from '../src/lib/runtimeMessages.ts';
import { localizedReleaseNotes } from '../src/lib/localizedReleaseNotes.ts';
import type { DocRecord } from '../src/types/docs.ts';

test('language preferences normalize variants without duplicating English or Portuguese', () => {
    assert.equal(SUPPORTED_LANGUAGES.length, 12);
    assert.equal(matchLanguage('en-GB'), 'en');
    assert.equal(matchLanguage('en-US'), 'en');
    assert.equal(matchLanguage('PT_pt'), 'pt-PT');
    assert.equal(matchLanguage('pt-BR'), 'pt-PT');
    assert.equal(matchLanguage('zh-Hans-CN'), 'zh-CN');
    assert.equal(matchLanguage('xx'), undefined);
    assert.equal(resolveLanguage('system', ['xx', 'uk-UA']), 'uk');
    assert.equal(resolveLanguage('system', ['xx']), 'en');
    assert.equal(resolveLanguage('ro', ['en-US']), 'ro');
});

test('localized public routes preserve one workspace and stable docs anchors', () => {
    assert.equal(
        publicPath('/docs/auto-paint#hiding-distance', 'ro'),
        '/ro/docs/auto-paint#hiding-distance'
    );
    assert.equal(publicPath('/fr/privacy', 'pt-PT'), '/pt-PT/privacy');
    assert.equal(publicPath('/fr/privacy', 'en'), '/privacy');
    assert.equal(publicPath('/app', 'ja'), '/app');
    assert.equal(languageFromPath('/japanese/docs'), undefined);
    assert.equal(stripLanguagePrefix('/zh-CN/'), '/');
    assert.equal(selectRoute('/ja/docs/overview'), 'docs');
    assert.equal(selectRoute('/pt-PT/terms'), 'terms');
    assert.equal(selectRoute('/fr/no-such-page'), 'not-found');
    assert.equal(selectRoute('/fr/docs', true), 'app');
    assert.deepEqual(parseDocsPath('/bn/docs/auto-paint', '#calibration'), {
        docSlug: 'auto-paint',
        headingSlug: 'calibration',
    });
});

test('non-Latin translated headings retain canonical link ids without mutating source records', () => {
    const source: DocRecord = {
        meta: { slug: 'overview', title: 'Overview', order: 1, sourcePath: 'overview.md' },
        content: '# Overview',
        toc: [{ id: 'overview', title: 'Overview', depth: 1 }],
        blocks: [
            {
                type: 'heading',
                depth: 1,
                id: 'overview',
                text: 'Overview',
                children: [{ type: 'text', value: 'Overview' }],
            },
        ],
    };
    const target: DocRecord = {
        ...source,
        toc: [{ id: 'section', title: '概要', depth: 1 }],
        blocks: [
            {
                type: 'heading',
                depth: 1,
                id: 'section',
                text: '概要',
                children: [{ type: 'text', value: '概要' }],
            },
        ],
    };
    const localized = preserveCanonicalDocAnchors(source, target);
    assert.equal(localized.toc[0].id, 'overview');
    assert.equal(localized.toc[0].title, '概要');
    assert.equal(target.toc[0].id, 'section');
    assert.throws(() => preserveCanonicalDocAnchors(source, { ...target, toc: [] }));
});

test('diagram translations cannot inject SVG markup and cannot silently fall back', () => {
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><text x="20" data-i18n="label">Hello</text></svg>';
    const output = localizeDiagramSvg(svg, { label: '<script>unsafe & text</script>' }, 'ja');
    assert.match(output, /xml:lang="ja"/);
    assert.match(output, /&lt;script&gt;unsafe &amp; text&lt;\/script&gt;/);
    assert.ok(!output.includes('<script>'));
    assert.throws(() => localizeDiagramSvg(svg, {}, 'ja'));
    const rich =
        '<svg xmlns="http://www.w3.org/2000/svg"><text x="20" data-i18n="effect" data-i18n-rich="label"><tspan>Close:</tspan><tspan> a correction</tspan></text></svg>';
    const translated = localizeDiagramSvg(
        rich,
        { effect: 'A correction <label>Close:</label> <script>unsafe</script>' },
        'en'
    );
    assert.match(
        translated,
        /A correction <tspan font-weight="700" fill="#f1f5f9">Close:<\/tspan>/
    );
    assert.ok(!translated.includes('<script>'));
    assert.ok(!translated.includes(' a correction'));
});

test('runtime status localization preserves unknown data and responds without rerunning work', async () => {
    i18n.addResourceBundle(
        'de',
        'messages',
        {
            progress: { meshWalls: 'Test Wände', reducePalette: 'Test {{count}} Farben' },
            files: { saved: 'Test gespeichert:\n{{path}}' },
            separation: {
                merged_one: 'Test {{count}} Farbe',
                merged_other: 'Test {{count}} Farben',
            },
        },
        true,
        true
    );
    try {
        await i18n.changeLanguage('de');
        assert.equal(translateRuntimeMessage('Building mesh walls'), 'Test Wände');
        assert.equal(translateRuntimeMessage('Reducing palette to 8 colors'), 'Test 8 Farben');
        assert.equal(
            translateRuntimeMessage('Saved to:\nD:/My artwork/green.kfil'),
            'Test gespeichert:\nD:/My artwork/green.kfil'
        );
        assert.equal(
            translateRuntimeMessage('2 colors dropped and merged into preserved colors'),
            'Test 2 Farben'
        );
        assert.equal(translateRuntimeMessage('My custom filament name'), 'My custom filament name');
        await i18n.changeLanguage('en');
        assert.equal(translateRuntimeMessage('Building mesh walls'), 'Building mesh walls');
    } finally {
        await i18n.changeLanguage('en');
        i18n.removeResourceBundle('de', 'messages');
    }
});

test('generic UI templates do not reinterpret unknown JSON or path diagnostics', async () => {
    for (const namespace of ['common', 'workspace', 'printing', 'calibration', 'messages']) {
        i18n.addResourceBundle(
            'ja',
            namespace,
            JSON.parse(readFileSync(`src/locales/ja/${namespace}.json`, 'utf8')),
            true,
            true
        );
    }
    try {
        await i18n.changeLanguage('ja');
        for (const message of [
            'Unexpected end of JSON input',
            'Permission denied: C:/My artwork/test.3mf',
            'Could not read part of the file',
            '2 of 7',
        ]) {
            assert.equal(translateRuntimeMessage(message), message);
        }
        assert.equal(
            translateRuntimeMessage('Building mesh walls'),
            i18n.t('messages:progress.meshWalls')
        );
        assert.equal(
            translateRuntimeMessage('2 colors dropped and merged into preserved colors'),
            i18n.t('messages:separation.merged', { count: 2 })
        );
    } finally {
        await i18n.changeLanguage('en');
        for (const namespace of ['common', 'workspace', 'printing', 'calibration', 'messages']) {
            i18n.removeResourceBundle('ja', namespace);
        }
    }
});

test('release notes select the live language without mutating the update record', () => {
    const update = {
        release_notes: 'English release notes',
        release_notes_localized: {
            en: 'English release notes',
            ro: 'Notele versiunii în română',
            ja: '日本語のリリースノート',
        },
    };
    const original = JSON.stringify(update);
    assert.deepEqual(localizedReleaseNotes(update, 'ro-RO'), {
        text: update.release_notes_localized.ro,
        language: 'ro',
    });
    assert.deepEqual(localizedReleaseNotes(update, 'ja'), {
        text: update.release_notes_localized.ja,
        language: 'ja',
    });
    assert.equal(JSON.stringify(update), original);
});

test('legacy release-note fallback retains English language metadata and ignores blank notes', () => {
    assert.deepEqual(localizedReleaseNotes({ release_notes: 'Legacy release notes' }, 'uk'), {
        text: 'Legacy release notes',
        language: 'en',
    });
    assert.deepEqual(
        localizedReleaseNotes(
            {
                release_notes: 'Legacy release notes',
                release_notes_localized: { en: ' ', ja: ' ' },
            },
            'ja'
        ),
        { text: 'Legacy release notes', language: 'en' }
    );
    assert.equal(localizedReleaseNotes({}, 'de'), null);
    assert.equal(localizedReleaseNotes({ release_notes: ' ' }, 'de'), null);
});

test('the current release feed provides real notes for every supported language', () => {
    const feed = JSON.parse(readFileSync('public/version.json', 'utf8'));
    assert.equal(feed.release_notes_localized.en, feed.release_notes);
    assert.deepEqual(
        Object.keys(feed.release_notes_localized).sort(),
        SUPPORTED_LANGUAGES.map(({ code }) => code).sort()
    );
    for (const { code } of SUPPORTED_LANGUAGES) {
        const localized = localizedReleaseNotes(feed, code);
        assert.equal(localized?.language, code, `${code} must not use a fallback`);
        assert.ok(localized?.text.trim());
        if (code !== 'en') assert.notEqual(localized?.text, feed.release_notes);
    }
});
