import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import commonRo from '../../src/locales/ro/common.json' with { type: 'json' };
import { SUPPORTED_LANGUAGES, type AppLanguage } from '../../src/lib/languagePreferences';

const languageName = (code: AppLanguage) =>
    SUPPORTED_LANGUAGES.find((language) => language.code === code)!.name;

async function selectLanguage(page: Page, code: AppLanguage) {
    await page.getByTestId('app-language').click();
    await page.getByRole('option', { name: languageName(code), exact: true }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
}

test('desktop release notes switch languages without refetching or replacing the release', async ({
    page,
}) => {
    const feed = JSON.parse(await readFile('public/version.json', 'utf8'));
    await page.addInitScript((metadata) => {
        const desktop = window as Window & {
            isTauri?: boolean;
            nativeUpdateCalls?: number;
            __TAURI_INTERNALS__?: { invoke: (command: string) => Promise<unknown> };
        };
        desktop.isTauri = true;
        desktop.nativeUpdateCalls = 0;
        desktop.__TAURI_INTERNALS__ = {
            async invoke(command) {
                if (command === 'get_app_version') return '3.9.0';
                if (command === 'check_for_updates') {
                    desktop.nativeUpdateCalls!++;
                    return metadata;
                }
                throw new Error(`Unexpected test command: ${command}`);
            },
        };
    }, feed);
    await page.goto('/app');
    await expect(page.getByText(feed.release_notes, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(page.getByText(feed.release_notes, { exact: true })).toHaveCount(2);
    const calls = await page.evaluate(
        () => (window as Window & { nativeUpdateCalls?: number }).nativeUpdateCalls
    );
    await selectLanguage(page, 'fr');
    const notes = page.getByText(feed.release_notes_localized.fr, { exact: true });
    await expect(notes).toHaveCount(2);
    for (const note of await notes.all()) await expect(note).toHaveAttribute('lang', 'fr');
    expect(
        await page.evaluate(
            () => (window as Window & { nativeUpdateCalls?: number }).nativeUpdateCalls
        )
    ).toBe(calls);
    await expect(page.getByText(feed.release_notes, { exact: true })).toHaveCount(0);
});

test('language changes live, persists, and leaves workspace print settings untouched', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/app');
    await page.getByRole('button', { name: '3D', exact: true }).click();
    const width = page.getByTestId('print-effective-line-width');
    await width.fill('0.27');
    await width.press('Enter');
    const stored = await page.evaluate(() => localStorage.getItem('kromacut.autopaint.v1'));
    await page.getByRole('button', { name: 'Open settings' }).click();
    const language = page.getByTestId('app-language');
    await expect(language).toHaveRole('combobox');
    await language.click();
    await expect(page.getByRole('option')).toHaveCount(SUPPORTED_LANGUAGES.length + 1);
    await expect(
        page.getByRole('option', { name: languageName('pt-PT'), exact: true })
    ).toBeVisible();
    await page.getByRole('option', { name: languageName('ro'), exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    await expect(page.getByText(commonRo.language.title, { exact: true })).toBeVisible();
    await expect(language).toBeEnabled();
    await page.getByRole('button', { name: commonRo.settings.close, exact: true }).click();
    await expect(width).toHaveValue('0.27');
    expect(await page.evaluate(() => localStorage.getItem('kromacut.autopaint.v1'))).toBe(stored);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    await page.getByRole('button', { name: commonRo.settings.open }).click();
    await expect(page.getByTestId('app-language')).toHaveText(languageName('ro'));
    await selectLanguage(page, 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(errors).toEqual([]);
});

test('the shared language selector supports keyboard selection and nested Escape in settings', async ({
    page,
}, testInfo) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Open settings' }).click();
    const language = page.getByTestId('app-language');
    await expect(language).toHaveRole('combobox');
    await language.focus();
    await language.press('Space');
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option', { name: 'System language', exact: true })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('language-selector-desktop.png') });
    await page.keyboard.press('Home');
    await expect(page.getByRole('option', { name: 'System language', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: languageName('en'), exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: languageName('fr'), exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(language).toHaveText(languageName('fr'));
    await expect(language).toBeEnabled();
    await expect(language).toBeFocused();
    await expect(page.getByRole('dialog')).toBeVisible();

    await language.focus();
    await language.press('ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option', { name: languageName('fr'), exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(language).toBeFocused();
    await expect(language).toHaveText(languageName('fr'));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('English public pages and legal contact remain usable through i18n', async ({ page }) => {
    await page.goto('/?landing=1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Turn pixels into printable layers.'
    );
    await expect(page.getByTestId('app-language')).toBeVisible();
    await page.getByTestId('landing-privacy-link').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy & local data');
    await page.getByRole('button', { name: 'Reveal email address', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Reveal email address', exact: true })
    ).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Copy email address', exact: true })
    ).toBeVisible();
    await page.getByRole('link', { name: 'Browse documentation', exact: true }).click();
    await expect(
        page.getByRole('navigation', { name: 'Documentation', exact: true })
    ).toBeVisible();
});

for (const width of [1440, 1024, 768, 390]) {
    test(`the landing footer language selector matches its links at ${width}px`, async ({
        page,
    }, testInfo) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.goto('/ro/?landing=1');
        const language = page.getByTestId('app-language');
        const footer = page.locator('footer').filter({ has: language });
        const navigation = footer.getByRole('navigation');
        const community = navigation.getByTestId('landing-footer-community');
        const utility = navigation.getByTestId('landing-footer-utility');
        const terms = utility.getByTestId('landing-terms-link');
        const privacy = utility.getByTestId('landing-privacy-link');
        const brand = footer.getByRole('link', { name: 'Kromacut', exact: true });

        for (const code of ['ro', 'en'] as const) {
            if (code === 'en') await selectLanguage(page, code);
            await expect(page.locator('html')).toHaveAttribute('lang', code);
            await expect(utility.getByTestId('app-language')).toHaveCount(1);
            await expect(language).toHaveRole('combobox');
            await expect(language).toHaveText(languageName(code));
            await expect(language).toHaveAccessibleName(code === 'ro' ? 'Limbă' : 'Language');
            await page.evaluate(() => document.fonts.ready);
            await footer.scrollIntoViewIfNeeded();
            await page.mouse.move(0, 0);
            await language.evaluate((element) => (element as HTMLElement).blur());

            const linkStyle = await terms.evaluate((element) => {
                const style = getComputedStyle(element);
                return {
                    fontFamily: style.fontFamily,
                    fontSize: style.fontSize,
                    fontWeight: style.fontWeight,
                    lineHeight: style.lineHeight,
                    color: style.color,
                };
            });
            await expect(language).toHaveCSS('font-family', linkStyle.fontFamily);
            await expect(language).toHaveCSS('font-size', linkStyle.fontSize);
            await expect(language).toHaveCSS('font-weight', linkStyle.fontWeight);
            await expect(language).toHaveCSS('line-height', linkStyle.lineHeight);
            await expect(language).toHaveCSS('color', linkStyle.color);
            await expect(language).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
            await expect(language).toHaveCSS('border-width', '0px');
            const shadow = await language.evaluate(
                (element) => getComputedStyle(element).boxShadow
            );
            expect(
                shadow === 'none' ||
                    shadow
                        .replaceAll('rgba(0, 0, 0, 0)', 'transparent')
                        .split(',')
                        .every((part) => /^transparent(?: 0px){2,4}$/.test(part.trim()))
            ).toBe(true);

            const triggerBounds = (await language.boundingBox())!;
            const termsBounds = (await terms.boundingBox())!;
            const privacyBounds = (await privacy.boundingBox())!;
            const utilityBounds = (await utility.boundingBox())!;
            const brandBounds = (await brand.boundingBox())!;
            const communityLinkBounds = await Promise.all(
                (await community.getByRole('link').all()).map(
                    async (link) => (await link.boundingBox())!
                )
            );
            const firstCommunityLink = communityLinkBounds[0];
            const centerY = (bounds: { y: number; height: number }) => bounds.y + bounds.height / 2;
            const rowGap = await utility.evaluate((element) =>
                parseFloat(getComputedStyle(element).rowGap)
            );
            const rowDistance =
                (centerY(triggerBounds) - centerY(termsBounds)) / (termsBounds.height + rowGap);
            expect(triggerBounds.height).toBeCloseTo(termsBounds.height, 0);
            expect(rowDistance).toBeGreaterThanOrEqual(-0.01);
            expect(rowDistance).toBeCloseTo(Math.round(rowDistance), 1);
            expect(triggerBounds.x).toBeGreaterThanOrEqual(utilityBounds.x - 1);
            expect(triggerBounds.x + triggerBounds.width).toBeLessThanOrEqual(
                utilityBounds.x + utilityBounds.width + 1
            );
            if (width >= 1024) {
                expect(centerY(triggerBounds)).toBeCloseTo(centerY(termsBounds), 0);
                expect(centerY(triggerBounds)).toBeCloseTo(centerY(privacyBounds), 0);
                expect(centerY(brandBounds)).toBeCloseTo(centerY(firstCommunityLink), 0);
                const firstRowRight = Math.max(
                    ...communityLinkBounds
                        .filter(
                            (bounds) => Math.abs(centerY(bounds) - centerY(firstCommunityLink)) < 1
                        )
                        .map((bounds) => bounds.x + bounds.width)
                );
                expect(triggerBounds.x + triggerBounds.width).toBeCloseTo(firstRowRight, 0);
            } else {
                expect(firstCommunityLink.x).toBeCloseTo(brandBounds.x, 0);
                expect(privacyBounds.x).toBeCloseTo(brandBounds.x, 0);
            }
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= window.innerWidth + 1
                )
            ).toBe(true);

            await footer.screenshot({
                path: testInfo.outputPath(`footer-${code}-${width}-closed.png`),
            });
            await language.click();
            await expect(page.getByRole('listbox')).toBeVisible();
            await expect(
                page.getByRole('option', { name: languageName(code), exact: true })
            ).toBeVisible();
            await page.screenshot({
                path: testInfo.outputPath(`footer-${code}-${width}-open.png`),
            });
            await page.keyboard.press('Escape');
            await expect(page.getByRole('listbox')).toHaveCount(0);
            await expect(language).toBeFocused();
        }
    });
}

test('the language selector keeps keyboard focus and cannot reopen while loading', async ({
    page,
}) => {
    let releaseTranslation!: () => void;
    const translationReady = new Promise<void>((resolve) => {
        releaseTranslation = resolve;
    });
    await page.route('**/src/locales/fr/common.json*', async (route) => {
        await translationReady;
        await route.continue();
    });
    try {
        await page.goto('/app');
        await page.getByRole('button', { name: 'Open settings' }).click();
        const language = page.getByTestId('app-language');
        await language.focus();
        await page.keyboard.press('Space');
        await expect(page.getByRole('listbox')).toBeVisible();
        await page.keyboard.press('Home');
        await expect(
            page.getByRole('option', { name: 'System language', exact: true })
        ).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(
            page.getByRole('option', { name: languageName('en'), exact: true })
        ).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(
            page.getByRole('option', { name: languageName('fr'), exact: true })
        ).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(language).toHaveAttribute('aria-busy', 'true');
        await expect(language).toHaveAttribute('aria-disabled', 'true');
        await expect(language).toBeFocused();
        await expect(page.getByRole('status')).toBeVisible();
        await page.keyboard.press('Space');
        await expect(language).toHaveAttribute('aria-expanded', 'false');
        await expect(page.getByRole('listbox')).toHaveCount(0);
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        releaseTranslation();
        await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
        await expect(language).toBeEnabled();
        await expect(language).toBeFocused();
        await expect(language).toHaveText(languageName('fr'));
        await expect(page.getByRole('status')).toHaveCount(0);
    } finally {
        releaseTranslation();
    }
});

test('switching language keeps the built mesh and exported STL unchanged', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('kromacut.language.v1', 'en');
        localStorage.setItem(
            'kromacut.autopaint.v1',
            JSON.stringify({
                schemaVersion: 2,
                filaments: [],
                paintMode: 'manual',
                ditherLineWidth: 0.21,
            })
        );
        localStorage.setItem(
            'kromacut:3d-print-settings',
            JSON.stringify({
                pixelSize: 0.2,
                layerHeight: 0.12,
                slicerFirstLayerHeight: 0.2,
                smoothMeshing: false,
            })
        );
        (window as Window & { __KROMACUT_E2E?: unknown }).__KROMACUT_E2E = { buildHistory: [] };
    });
    await page.goto('/app');
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 24;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 24, 24);
        context.fillStyle = '#000000';
        context.fillRect(8, 0, 8, 24);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'language-invariance.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    const buildCount = () =>
        page.evaluate(
            () =>
                (window as Window & { __KROMACUT_E2E?: { buildHistory: unknown[] } }).__KROMACUT_E2E
                    ?.buildHistory.length ?? 0
        );
    await page.getByTestId('build-3d-model').click();
    await expect.poll(buildCount).toBeGreaterThan(0);
    const before = await buildCount();
    const exportStl = async () => {
        await page.getByTestId('download-3d-model').click();
        const download = page.waitForEvent('download');
        await page.getByTestId('download-stl').click();
        const file = await download;
        return (await readFile((await file.path())!)).subarray(80);
    };
    const english = await exportStl();
    await page.getByRole('button', { name: 'Open settings' }).click();
    await selectLanguage(page, 'ro');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    await page.getByRole('button', { name: commonRo.settings.close, exact: true }).click();
    expect(await exportStl()).toEqual(english);
    expect(await buildCount()).toBe(before);
});

test('all languages fit mobile settings and use bundled fonts', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const externalFonts: string[] = [];
    page.on('request', (request) => {
        if (/fonts\.(googleapis|gstatic)\.com/.test(request.url()))
            externalFonts.push(request.url());
    });
    await page.goto('/app');
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.getByTestId('app-language').click();
    const dropdown = page.getByRole('listbox');
    await expect(dropdown).toBeVisible();
    const bounds = await dropdown.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: testInfo.outputPath('language-selector-mobile.png') });
    await page.keyboard.press('Escape');
    for (const { code } of SUPPORTED_LANGUAGES) {
        const catalog = JSON.parse(await readFile(`src/locales/${code}/common.json`, 'utf8'));
        const selector = page.getByTestId('app-language');
        await selectLanguage(page, code);
        await expect(page.locator('html')).toHaveAttribute('lang', code);
        await expect(selector).toBeEnabled();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const dialog = page.getByRole('dialog');
        await expect(
            dialog.getByRole('heading', { name: catalog.settings.title, exact: true })
        ).toBeVisible();
        expect(
            await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
            code
        ).toBe(true);
        if (['de', 'ja', 'hi', 'bn'].includes(code)) {
            await page.screenshot({ path: testInfo.outputPath(`settings-${code}.png`) });
        }
    }
    expect(externalFonts).toEqual([]);
});

test('a failed language download keeps the current language and preference', async ({ page }) => {
    await page.route('**/src/locales/fr/common.json*', (route) => route.abort());
    await page.goto('/app');
    await page.getByRole('button', { name: 'Open settings' }).click();
    const selector = page.getByTestId('app-language');
    await selectLanguage(page, 'fr');
    await expect(page.getByRole('alert')).toHaveText(
        'Could not load this language. Your current language has been kept.'
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(selector).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem('kromacut.language.v1'))).toBeNull();
});

test('language preferences synchronize between open tabs', async ({ page, context }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Open settings' }).click();
    const other = await context.newPage();
    await other.goto('/app');
    await other.getByRole('button', { name: 'Open settings' }).click();
    await selectLanguage(page, 'ro');
    await expect(other.locator('html')).toHaveAttribute('lang', 'ro');
    await expect(other.getByTestId('app-language')).toHaveText(languageName('ro'));
    await expect(
        other.getByRole('heading', { name: commonRo.settings.title, exact: true })
    ).toBeVisible();
});

test('color picker accessibility stays translated through keyboard changes and live switching', async ({
    page,
    context,
}) => {
    await page.goto('/app');
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 4;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#808080';
        context.fillRect(0, 0, 4, 4);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'gray.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.getByTitle(/#808080\s+alpha:/i).click();
    const other = await context.newPage();
    await other.goto('/app');
    await other.getByRole('button', { name: 'Open settings' }).click();
    await selectLanguage(other, 'ro');
    const hue = page.getByRole('slider', { name: commonRo.colorPicker.hue, exact: true });
    await expect(hue).toBeVisible();
    await hue.press('ArrowRight');
    await expect(hue).toHaveAttribute('aria-valuenow', '18');
    const color = page.getByRole('slider', { name: commonRo.colorPicker.color, exact: true });
    await expect(color).toHaveAttribute(
        'aria-valuetext',
        commonRo.colorPicker.saturationBrightness
            .replace('{{saturation}}', '0')
            .replace('{{brightness}}', '50')
    );
    await color.press('ArrowRight');
    await expect(color).toHaveAttribute(
        'aria-valuetext',
        commonRo.colorPicker.saturationBrightness
            .replace('{{saturation}}', '5')
            .replace('{{brightness}}', '50')
    );
    await expect(
        page.getByRole('slider', { name: commonRo.colorPicker.alpha, exact: true })
    ).toBeVisible();
});

test('a shared translated public URL keeps its language when opening the workspace', async ({
    page,
}) => {
    const french = JSON.parse(await readFile('src/locales/fr/public.json', 'utf8'));
    await page.goto('/fr/privacy');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await page.getByRole('link', { name: french.navigation.openApp, exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    expect(await page.evaluate(() => localStorage.getItem('kromacut.language.v1'))).toBe('fr');
});

test('desktop save prompts translate without changing filenames or bytes', async ({ page }) => {
    const messages = JSON.parse(await readFile('src/locales/ro/messages.json', 'utf8'));
    await page.goto('/app');
    await page.getByRole('button', { name: 'Open settings' }).click();
    await selectLanguage(page, 'ro');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    const result = await page.evaluate(async () => {
        const calls: Array<{ command: string; args: unknown }> = [];
        const chunks: number[][] = [];
        const desktop = window as unknown as {
            isTauri: boolean;
            __TAURI_INTERNALS__: { invoke: (command: string, args?: unknown) => Promise<unknown> };
        };
        desktop.isTauri = true;
        desktop.__TAURI_INTERNALS__ = {
            async invoke(command, args) {
                if (command === 'plugin:fs|write') {
                    const data = (args as { data: Uint8Array }).data;
                    chunks.push(Array.from(data));
                    return data.byteLength;
                }
                calls.push({ command, args });
                if (command === 'plugin:dialog|save') return 'C:\\prints\\my-model.stl';
                if (command === 'plugin:fs|open') return 17;
                if (command === 'plugin:resources|close') return;
                if (command === 'plugin:dialog|message') return 'Ok';
                throw new Error(`Unexpected native command: ${command}`);
            },
        };
        const modulePath = '/src/hooks/saveBlobToFile.ts';
        const { saveBlobToFile } = await import(modulePath);
        const saved = await saveBlobToFile(new Blob([new Uint8Array([0, 17, 200, 255])]), {
            defaultFileName: 'my-model.stl',
            extension: 'stl',
            filterName: 'STL model',
        });
        return { saved, calls, chunks };
    });
    expect(result.saved).toBe('C:\\prints\\my-model.stl');
    expect(result.chunks.flat()).toEqual([0, 17, 200, 255]);
    expect(result.calls[0]).toEqual({
        command: 'plugin:dialog|save',
        args: {
            options: {
                title: messages.files.save.replace('{{format}}', messages.files.stl),
                defaultPath: 'my-model.stl',
                filters: [{ name: messages.files.stl, extensions: ['stl'] }],
            },
        },
    });
    expect(result.calls.at(-1)).toEqual({
        command: 'plugin:dialog|message',
        args: {
            message: messages.files.saved.replace('{{path}}', result.saved),
            title: 'Kromacut',
            kind: 'info',
        },
    });
});

test('translated guides keep stable anchors and self-contained full-size diagrams', async ({
    page,
    context,
}, testInfo) => {
    const french = JSON.parse(await readFile('src/locales/fr/common.json', 'utf8'));
    const diagrams = JSON.parse(await readFile('src/locales/fr/diagrams.json', 'utf8'));
    const metadata = JSON.parse(await readFile('src/locales/fr/docsMeta.json', 'utf8'));
    await page.goto('/fr/docs/image-adjustments#preview-versus-apply');
    const article = page.getByRole('article', { name: metadata['image-adjustments'].title });
    await expect(article).toBeVisible();
    await expect(article.locator('#preview-versus-apply')).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(metadata['image-adjustments'].title));
    const diagram = article.locator('img[src^="blob:"]').first();
    await expect(diagram).toBeVisible();
    expect(
        await diagram.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)
    ).toBe(true);
    const svg = await diagram.evaluate(async (img: HTMLImageElement) =>
        (await fetch(img.src)).text()
    );
    expect(svg).toContain('xml:lang="fr"');
    expect(svg).toContain('data:font/woff2;base64,');
    expect(svg).toContain(diagrams['32_adjustment_controls'].title);
    expect(svg).not.toMatch(/https?:\/\/fonts\.(googleapis|gstatic)/);
    const opened = context.waitForEvent('page');
    await diagram.locator('..').click();
    const illustration = await opened;
    await illustration.waitForLoadState();
    await expect(illustration.locator('svg')).toBeVisible();
    await illustration.evaluate(() => document.fonts.ready);
    await illustration.screenshot({ path: testInfo.outputPath('french-diagram.png') });
    await illustration.close();
    await page.getByRole('button', { name: french.settings.open }).click();
    await selectLanguage(page, 'en');
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/image-adjustments#preview-versus-apply$/);
    await expect(page.getByRole('article', { name: 'Image Adjustments' })).toBeVisible();
    await expect(page.locator('#preview-versus-apply')).toBeVisible();
    await expect(page.locator('link[rel="alternate"][hreflang="ja"]')).toHaveAttribute(
        'href',
        'https://kromacut.com/ja/docs/image-adjustments'
    );
    await page
        .getByRole('navigation', { name: 'Documentation', exact: true })
        .locator('a[href="/docs/faq"]')
        .click();
    await expect(page.getByRole('article', { name: 'FAQ', exact: true })).toBeVisible();
    await expect(page.locator('link[rel="alternate"][hreflang="ja"]')).toHaveAttribute(
        'href',
        'https://kromacut.com/ja/docs/faq'
    );
});
