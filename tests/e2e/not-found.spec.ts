import { expect, test, type Page } from '@playwright/test';

const missingPaths = [
    '/this-page-does-not-exist',
    '/missing/nested/page',
    '/app/missing',
    '/docs/this-guide-does-not-exist',
    '/docs/overview/extra',
    '/docs/%E0%A4%A',
];

const visualViewports = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 320, height: 740 },
];

async function expectNotFound(page: Page) {
    const notFound = page.getByTestId('not-found-page');
    await expect(notFound).toBeVisible();
    await expect(
        notFound.getByRole('heading', {
            name: "This page doesn't exist",
            exact: true,
            level: 1,
        })
    ).toBeVisible();
    await expect(page).toHaveTitle('Page not found | Kromacut');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/);
    await expect(
        notFound.getByRole('link', { name: 'Open Kromacut', exact: true })
    ).toHaveAttribute('href', '/app');
    await expect(
        notFound.getByRole('link', { name: 'Go to homepage', exact: true })
    ).toHaveAttribute('href', '/?landing=1');
    await expect(
        notFound.getByRole('link', { name: 'Browse documentation', exact: true })
    ).toHaveAttribute('href', '/docs/overview');
    await expect(page.getByTestId('landing-page')).toHaveCount(0);
    await expect(page.getByRole('article', { name: 'Overview', exact: true })).toHaveCount(0);
}

async function serveSpaShellFor(page: Page, pathname: string) {
    const index = await page.request.get('/');
    expect(index.ok()).toBe(true);
    const body = await index.body();
    await page.route(
        (url) => url.pathname === pathname,
        (route) =>
            route.fulfill({
                status: 200,
                contentType: 'text/html',
                body,
            })
    );
}

async function expectUsableNotFoundLayout(page: Page) {
    const notFound = page.getByTestId('not-found-page');
    const art = notFound.getByTestId('not-found-art');
    await expect(art).toBeVisible();
    await expect(art).toHaveAttribute('aria-hidden', 'true');
    await expect(
        art.locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).toHaveCount(0);
    for (const image of await notFound.locator('img').all()) {
        await expect
            .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
            .toBeGreaterThan(0);
    }

    const overflow = await notFound.evaluate((element) => ({
        page: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        container: element.scrollWidth > element.clientWidth,
    }));
    expect(overflow).toEqual({ page: false, container: false });

    for (const name of ['Open Kromacut', 'Go to homepage', 'Browse documentation']) {
        const link = notFound.getByRole('link', { name, exact: true });
        await link.scrollIntoViewIfNeeded();
        const bounds = await link.boundingBox();
        expect(bounds, name).not.toBeNull();
        expect(bounds!.height, `${name} touch target height`).toBeGreaterThanOrEqual(44);
        expect(bounds!.width, `${name} touch target width`).toBeGreaterThanOrEqual(44);
        expect(
            await link.evaluate((element) => {
                const { x, y, width, height } = element.getBoundingClientRect();
                return element.contains(document.elementFromPoint(x + width / 2, y + height / 2));
            }),
            `${name} is not obscured`
        ).toBe(true);
    }
    await notFound.evaluate((element) => {
        element.scrollTop = 0;
    });
}

test.describe('custom 404 @not-found', () => {
    test('direct invalid paths preserve their URL and return a real 404', async ({ page }) => {
        for (const pathname of missingPaths) {
            const response = await page.goto(pathname);
            expect(response?.status(), pathname).toBe(404);
            expect(new URL(page.url()).pathname).toBe(pathname);
            await expectNotFound(page);
            await expect(page.locator('script[type="module"]')).toHaveCount(0);
        }
    });

    test('normal home, app and documentation routes still load', async ({ page }) => {
        expect((await page.goto('/'))?.status()).toBe(200);
        await expect(page.getByTestId('landing-page')).toBeVisible();
        for (const pathname of ['/app', '/app/index.html']) {
            expect((await page.goto(pathname))?.status()).toBe(200);
            await expect(page.getByTestId('image-file-input')).toBeAttached();
        }
        for (const pathname of [
            '/docs',
            '/docs/index.html',
            '/docs/overview',
            '/docs/overview.html',
            '/docs/overview/index.html',
        ]) {
            expect((await page.goto(pathname))?.status()).toBe(200);
            await expect(
                page.getByRole('article', { name: 'Overview', exact: true })
            ).toBeVisible();
            await expect(page.getByTestId('not-found-page')).toHaveCount(0);
        }
    });

    test('recovery links open the app, documentation and explicit homepage', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('kromacut.has-launched.v1', 'v1'));
        await page.goto('/missing/nested/page');
        await page.getByRole('link', { name: 'Go to homepage', exact: true }).click();
        await expect(page).toHaveURL(/\/\?landing=1$/);
        await expect(page.getByTestId('landing-page')).toBeVisible();

        await page.goto('/missing/nested/page');
        await page.getByRole('link', { name: 'Browse documentation', exact: true }).click();
        await expect(page).toHaveURL(/\/docs\/overview$/);
        await expect(page.getByRole('article', { name: 'Overview', exact: true })).toBeVisible();

        await page.goto('/missing/nested/page');
        const openApp = page.getByRole('link', { name: 'Open Kromacut', exact: true });
        await openApp.focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/app$/);
        await expect(page.getByTestId('image-file-input')).toBeAttached();
    });

    for (const viewport of visualViewports) {
        test(`static page works without JavaScript at ${viewport.name} light and dark sizes`, async ({
            browser,
            baseURL,
        }, testInfo) => {
            const backgrounds: string[] = [];
            for (const colorScheme of ['light', 'dark'] as const) {
                const context = await browser.newContext({
                    baseURL,
                    javaScriptEnabled: false,
                    colorScheme,
                    viewport: { width: viewport.width, height: viewport.height },
                });
                try {
                    const page = await context.newPage();
                    expect((await page.goto('/missing/nested/page'))?.status()).toBe(404);
                    await expectNotFound(page);
                    const notFound = page.getByTestId('not-found-page');
                    backgrounds.push(
                        await notFound.evaluate(
                            (element) => getComputedStyle(element).backgroundColor
                        )
                    );
                    await expectUsableNotFoundLayout(page);
                    await page.screenshot({
                        path: testInfo.outputPath(`404-static-${viewport.name}-${colorScheme}.png`),
                        fullPage: true,
                    });
                    await notFound
                        .getByRole('link', { name: 'Browse documentation', exact: true })
                        .click();
                    await expect(
                        page.locator('.seo-doc-page article').getByRole('heading', {
                            name: 'Overview',
                            exact: true,
                            level: 1,
                        })
                    ).toBeVisible();
                } finally {
                    await context.close();
                }
            }
            expect(backgrounds[0]).not.toBe(backgrounds[1]);
        });
    }

    test('SPA fallback handles unknown pages and malformed docs without crashing', async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        for (const pathname of missingPaths) {
            await serveSpaShellFor(page, pathname);
            expect((await page.goto(pathname))?.status()).toBe(200);
            await expectNotFound(page);
        }
        expect(errors).toEqual([]);
    });

    for (const viewport of visualViewports) {
        test(`SPA 404 honors stored light and dark modes on ${viewport.name}`, async ({
            page,
        }, testInfo) => {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            const pathname = `/missing/runtime/${viewport.name}`;
            await serveSpaShellFor(page, pathname);
            await page.goto('/?landing=1');
            const backgrounds: string[] = [];
            for (const theme of ['light', 'dark'] as const) {
                await page.evaluate((value) => localStorage.setItem('theme', value), theme);
                await page.goto(pathname);
                await expectNotFound(page);
                expect(
                    await page
                        .locator('html')
                        .evaluate((element) => element.classList.contains('dark'))
                ).toBe(theme === 'dark');
                backgrounds.push(
                    await page
                        .getByTestId('not-found-page')
                        .evaluate((element) => getComputedStyle(element).backgroundColor)
                );
                await expectUsableNotFoundLayout(page);
                await page.screenshot({
                    path: testInfo.outputPath(`404-spa-${viewport.name}-${theme}.png`),
                    fullPage: true,
                });
            }
            expect(backgrounds[0]).not.toBe(backgrounds[1]);
        });
    }

    test('docs history can enter an invalid path and recover the original guide', async ({
        page,
    }) => {
        await page.goto('/docs/overview');
        await expect(page.getByRole('article', { name: 'Overview', exact: true })).toBeVisible();
        await page.evaluate(() => {
            history.pushState(null, '', '/docs/this-guide-does-not-exist');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        await expectNotFound(page);
        await page.goBack();
        await expect(page).toHaveURL(/\/docs\/overview$/);
        await expect(page.getByRole('article', { name: 'Overview', exact: true })).toBeVisible();
        await expect(page).toHaveTitle('Overview | Kromacut Docs');
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
            'content',
            'index,follow'
        );
        await expect(page.getByTestId('not-found-page')).toHaveCount(0);
    });

    test('embedded recovery preserves the mounted workspace and current document', async ({
        page,
    }) => {
        await page.goto('/app');
        const input = page.getByTestId('image-file-input');
        await expect(input).toBeAttached();
        await input.evaluate((element) =>
            element.setAttribute('data-not-found-preserved', 'original-input')
        );
        await page.evaluate(() => {
            const sentinel = document.createElement('meta');
            sentinel.name = 'not-found-document-sentinel';
            sentinel.content = 'original-document';
            document.head.appendChild(sentinel);
        });

        for (const recovery of ['Browse documentation', 'Open Kromacut']) {
            await page.evaluate(() => {
                history.pushState(null, '', '/docs/this-guide-does-not-exist');
                window.dispatchEvent(new PopStateEvent('popstate'));
            });
            await expectNotFound(page);
            await page
                .getByTestId('not-found-page')
                .getByRole('link', { name: recovery, exact: true })
                .click();
            if (recovery === 'Browse documentation') {
                await expect(page).toHaveURL(/\/docs\/overview$/);
                await expect(
                    page.getByRole('article', { name: 'Overview', exact: true })
                ).toBeVisible();
            } else {
                await expect(page).toHaveURL(/\/app$/);
                await expect(page).toHaveTitle('Kromacut App - Image to 3D Print Tool');
            }
            await expect(page.getByTestId('not-found-page')).toHaveCount(0);
            await expect(page.locator('meta[name="not-found-document-sentinel"]')).toHaveAttribute(
                'content',
                'original-document'
            );
            await expect(input).toHaveAttribute('data-not-found-preserved', 'original-input');
        }
    });
});
