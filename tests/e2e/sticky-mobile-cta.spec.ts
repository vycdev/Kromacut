import { expect, test, type Page } from '@playwright/test';

async function scrollPastHeaderCta(page: Page, clearance = 16) {
    await page.getByTestId('landing-page').evaluate((landing, gap) => {
        const trigger = landing.querySelector('[data-testid="landing-open-app"]');
        if (!trigger) throw new Error('Landing header CTA not found');
        landing.scrollTop += trigger.getBoundingClientRect().bottom
            - landing.getBoundingClientRect().top + gap;
    }, clearance);
}

async function scrollToFooter(page: Page) {
    const landing = page.getByTestId('landing-page');
    await expect(landing).toBeVisible();
    // Web fonts can change the narrow footer's wrapping after the initial app render.
    await page.evaluate(() => document.fonts.ready);
    await landing.evaluate(landing => {
        landing.scrollTop = landing.scrollHeight;
    });
    await expect(page.getByRole('navigation', { name: 'Footer navigation' })).toBeInViewport();
    await expect.poll(() => landing.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight))
        .toBeLessThanOrEqual(1);
}

test.describe('sticky mobile landing CTA @smoke', () => {
    test('appears only when the header action fully leaves the landing scroll viewport', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/?landing=1');
        const landing = page.getByTestId('landing-page');
        const headerAction = page.getByTestId('landing-open-app');
        const sticky = page.getByTestId('landing-sticky-cta');

        await expect(headerAction).toBeInViewport({ ratio: 1 });
        await expect(sticky).toBeHidden();
        await expect(sticky.getByRole('link')).toHaveCount(0);

        // Keep twelve pixels of the header action visible; partial visibility must not show a duplicate.
        await scrollPastHeaderCta(page, -12);
        await expect(headerAction).toBeInViewport();
        await expect(sticky).toBeHidden();

        await scrollPastHeaderCta(page);
        await expect(headerAction).not.toBeInViewport();
        await expect(sticky).toBeVisible();
        await expect(sticky).toHaveCSS('position', 'fixed');
        await expect(sticky.getByRole('link')).toHaveCount(1);
        await expect(sticky.getByRole('link', { name: 'Open Kromacut', exact: true }))
            .toHaveAttribute('href', '/app');
        expect(await landing.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);

        await landing.evaluate(element => { element.scrollTop = 0; });
        await expect(headerAction).toBeInViewport({ ratio: 1 });
        await expect(sticky).toBeHidden();
        await expect(sticky.getByRole('link')).toHaveCount(0);
    });

    test('tracks the mobile breakpoint when resizing a scrolled landing page', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/?landing=1');
        await scrollPastHeaderCta(page, 400);
        const sticky = page.getByTestId('landing-sticky-cta');
        await expect(sticky).toBeHidden();

        for (const width of [390, 768, 767, 1024, 320]) {
            await page.setViewportSize({ width, height: 900 });
            await expect(page.getByTestId('landing-open-app')).not.toBeInViewport();
            if (width < 768) {
                await expect(sticky).toBeVisible();
            } else {
                await expect(sticky).toBeHidden();
                await expect(sticky.getByRole('link')).toHaveCount(0);
            }
        }

        await page.getByTestId('landing-page').evaluate(element => { element.scrollTop = 0; });
        await expect(sticky).toBeHidden();
    });

    test('is keyboard reachable only while shown and opens the editor', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/?landing=1');
        const sticky = page.getByTestId('landing-sticky-cta');
        await page.getByTestId('landing-open-app').focus();
        await page.keyboard.press('Tab');
        await expect(page.getByRole('navigation', { name: 'Mobile navigation' })
            .getByRole('link', { name: 'How it works', exact: true })).toBeFocused();
        await expect(sticky.getByRole('link')).toHaveCount(0);

        await scrollToFooter(page);
        await expect(sticky).toBeVisible();
        await page.getByRole('navigation', { name: 'Footer navigation' })
            .getByRole('link', { name: 'Terms', exact: true }).focus();
        await page.keyboard.press('Tab');
        const stickyAction = sticky.getByRole('link', { name: 'Open Kromacut', exact: true });
        await expect(stickyAction).toBeFocused();
        await expect(stickyAction).toBeInViewport({ ratio: 1 });
        await page.keyboard.press('Enter');

        await expect(page).toHaveURL(/\/app$/);
        await expect(page.getByTestId('image-file-input')).toBeAttached();
        await expect(sticky).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => localStorage.getItem('kromacut.has-launched.v1')))
            .toBe('v1');
    });

    test('does not appear in the editor, documentation, legal pages, or missing-page recovery', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        for (const path of ['/app', '/docs', '/docs/overview', '/privacy', '/terms', '/404.html', '/missing-mobile-cta-page']) {
            await page.goto(path);
            if (path === '/app') {
                await expect(page.getByTestId('image-file-input')).toBeAttached();
            } else if (path.startsWith('/docs')) {
                await expect(page.getByRole('article', { name: 'Overview', exact: true })).toBeVisible();
            } else if (path === '/privacy') {
                await expect(page.getByTestId('privacy-page')).toBeVisible();
            } else if (path === '/terms') {
                await expect(page.getByTestId('terms-page')).toBeVisible();
            } else {
                await expect(page.getByTestId('not-found-page')).toBeVisible();
            }
            await expect(page.getByTestId('landing-sticky-cta')).toHaveCount(0);
        }
    });

    for (const width of [320, 390]) {
        for (const theme of ['light', 'dark'] as const) {
            test(`fits ${width}px ${theme} screens and leaves footer links uncovered`, async ({ page }, testInfo) => {
                await page.setViewportSize({ width, height: 844 });
                await page.addInitScript(value => localStorage.setItem('theme', value), theme);
                await page.goto('/?landing=1');
                await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark')))
                    .toBe(theme === 'dark');
                await scrollToFooter(page);
                const sticky = page.getByTestId('landing-sticky-cta');
                const stickyAction = sticky.getByRole('link', { name: 'Open Kromacut', exact: true });
                await expect(stickyAction).toBeInViewport({ ratio: 1 });
                const stickyBounds = await sticky.boundingBox();
                const actionBounds = await stickyAction.boundingBox();
                expect(stickyBounds).not.toBeNull();
                expect(actionBounds).not.toBeNull();
                expect(actionBounds!.height).toBeGreaterThanOrEqual(44);
                expect(actionBounds!.x).toBeGreaterThanOrEqual(0);
                expect(actionBounds!.x + actionBounds!.width).toBeLessThanOrEqual(width);
                expect(stickyBounds!.y + stickyBounds!.height).toBeLessThanOrEqual(845);
                expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
                expect(await page.getByTestId('landing-page').evaluate(element => element.scrollWidth))
                    .toBeLessThanOrEqual(width);

                const footerLinks = page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link');
                await expect(footerLinks).toHaveCount(7);
                for (const link of await footerLinks.all()) {
                    await expect(link).toBeInViewport({ ratio: 1 });
                    const bounds = await link.boundingBox();
                    expect(bounds).not.toBeNull();
                    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(stickyBounds!.y);
                    expect(await link.evaluate(element => {
                        const box = element.getBoundingClientRect();
                        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
                    })).toBe(true);
                }
                await page.screenshot({ path: testInfo.outputPath(`sticky-footer-${width}-${theme}.png`) });

                // Verify an actual footer link can be clicked without interception from the fixed bar.
                await page.getByRole('navigation', { name: 'Footer navigation' })
                    .getByRole('link', { name: 'Docs', exact: true }).click();
                await expect(page).toHaveURL(/\/docs\/overview$/);
                await expect(page.getByTestId('landing-sticky-cta')).toHaveCount(0);
            });
        }
    }
});
