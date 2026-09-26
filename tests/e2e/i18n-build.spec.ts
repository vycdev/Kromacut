import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SUPPORTED_LANGUAGES } from '../../src/lib/languagePreferences';

const catalog = async (language: string, name: string) =>
    JSON.parse(
        await readFile(
            language === 'en' && ['privacy', 'terms'].includes(name)
                ? `src/data/${name}Notice.json`
                : `src/locales/${language}/${name}.json`,
            'utf8'
        )
    );
const route = (language: string, path: string) =>
    language === 'en' ? path : `/${language}${path}`;

test('every public language has a translated landing page and metadata', async ({ page }) => {
    for (const { code } of SUPPORTED_LANGUAGES) {
        const messages = await catalog(code, 'public');
        await page.goto(`${route(code, '/')}?landing=1`);
        await expect(page.locator('html')).toHaveAttribute('lang', code);
        await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
        await expect(page).toHaveTitle(messages.seo.homeTitle);
        await expect(page.locator('meta[name="description"]')).toHaveAttribute(
            'content',
            messages.seo.homeDescription
        );
        await expect(page.getByTestId('app-language')).toBeVisible();
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            `https://kromacut.com${route(code, '/')}`
        );
        await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(13);
        const manifestPath = code === 'en' ? '/site.webmanifest' : `/${code}/site.webmanifest`;
        await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', manifestPath);
        const manifest = await (await page.request.get(manifestPath)).json();
        expect(manifest).toMatchObject({ lang: code, start_url: '/app', id: '/', scope: '/' });
        if (code !== 'en') expect(manifest.description).toBe(messages.seo.appDescription);
    }
});

test('translated guides and legal pages are complete without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
        for (const { code } of SUPPORTED_LANGUAGES) {
            for (const kind of ['privacy', 'terms']) {
                const notice = await catalog(code, kind);
                await page.goto(`http://127.0.0.1:5193${route(code, `/${kind}`)}`);
                await expect(page.locator('html')).toHaveAttribute('lang', code);
                await expect(page.getByRole('heading', { level: 1 })).toHaveText(notice.title);
                await expect(page).toHaveTitle(notice.seoTitle);
                expect(await page.content()).not.toContain('vycdev@gmail.com');
                for (const section of notice.sections) {
                    await expect(page.locator(`#${section.id}`)).toHaveText(section.title);
                }
            }
            const metadata = await catalog(code, 'docsMeta');
            await page.goto(
                `http://127.0.0.1:5193${route(code, '/docs/image-adjustments')}#preview-versus-apply`
            );
            await expect(page.locator('html')).toHaveAttribute('lang', code);
            await expect(page.getByRole('heading', { level: 1 })).toHaveText(
                metadata['image-adjustments'].title
            );
            await expect(page.locator('#preview-versus-apply')).toBeVisible();
            for (const image of await page.locator('article img').all()) {
                await expect(image).toBeVisible();
                expect(
                    await image.evaluate(
                        (element: HTMLImageElement) => element.complete && element.naturalWidth > 0
                    )
                ).toBe(true);
            }
        }
    } finally {
        await context.close();
    }
});

test('localized documentation assets work under the desktop content security policy', async ({
    page,
}, testInfo) => {
    const { app } = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
    await page.route('**/*', async (request) => {
        if (request.request().resourceType() !== 'document') return request.continue();
        const response = await request.fetch();
        await request.fulfill({
            response,
            headers: { ...response.headers(), 'content-security-policy': app.security.csp },
        });
    });
    await page.addInitScript(() => {
        const state = window as Window & { cspViolations?: string[] };
        state.cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) =>
            state.cspViolations!.push(`${event.violatedDirective}: ${event.blockedURI}`)
        );
    });
    await page.goto('/fr/docs/image-adjustments');
    const image = page.locator('article img[src^="blob:"]').first();
    await expect(image).toBeVisible();
    expect(
        await image.evaluate(
            (element: HTMLImageElement) => element.complete && element.naturalWidth > 0
        )
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('localized-doc-desktop-csp.png') });
    expect(
        await page.evaluate(() => (window as Window & { cspViolations?: string[] }).cspViolations)
    ).toEqual([]);
});

test('the static 404 recovers a stored language without booting the workspace', async ({
    page,
}) => {
    const scripts: string[] = [];
    page.on('request', (request) => {
        if (request.resourceType() === 'script') scripts.push(request.url());
    });
    await page.addInitScript(() => {
        localStorage.setItem('kromacut.language.v1', 'pt-PT');
        localStorage.setItem('kromacut.autopaint.v1', 'preserve-this-profile');
    });
    const messages = await catalog('pt-PT', 'public');
    const response = await page.goto('/this-missing-localized-page');
    expect(response?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.notFound.heading);
    expect(scripts).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('kromacut.autopaint.v1'))).toBe(
        'preserve-this-profile'
    );
    await expect(page).toHaveURL(/\/this-missing-localized-page$/);
});
