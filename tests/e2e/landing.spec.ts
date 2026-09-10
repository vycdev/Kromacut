import { expect, test } from '@playwright/test';

test.describe('landing page smoke @smoke', () => {
    test('all showcase cards share headers, captions, image sizing and full-size links across screen sizes', async ({ page }, testInfo) => {
        for (const width of [1440, 768, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.goto('/?landing=1');
            const gallery = page.getByTestId('community-gallery');
            expect(await gallery.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
            const titan = gallery.locator('article').filter({ has: page.getByRole('heading', { name: 'Titan poster', exact: true }) });
            await titan.first().scrollIntoViewIfNeeded();
            await expect(gallery.locator('article')).toHaveCount(6);
            expect(await gallery.locator('article').evaluateAll(cards => cards.map(card => card.querySelectorAll('img').length))).toEqual([2, 2, 3, 3, 3, 3]);
            const cards = gallery.locator('article');
            for (let index = 0; index < 6; index++) {
                const card = cards.nth(index);
                await expect(card.locator(':scope > header')).toHaveCount(1);
                await expect(card.locator('header h3')).toHaveCount(1);
                await expect(card.locator(':scope > footer')).toHaveCount(1);
                await expect(card.locator('footer').getByText('Open any photo at full size.')).toHaveCount(1);
                await expect(card.locator('figcaption')).toHaveCount(index < 2 ? 2 : 3);
                await expect(card.locator('header').getByText(`${index < 2 ? 2 : 3} photos`, { exact: true })).toHaveCount(1);
            }
            await expect(titan.locator('header').getByText('102.4 × 152.7 mm footprint')).toHaveCount(1);
            await expect(titan.locator('footer').getByRole('link', { name: /NASA\/JPL/ })).toHaveCount(1);
            await expect(page.getByTestId('titan-showcase')).toHaveCount(0);
            await expect(page.getByTestId('hope-showcase')).toHaveCount(0);
            await expect(titan).toHaveCount(1);
            await expect(titan.getByText('By vycdev', { exact: true })).toHaveCount(1);
            await expect(titan.getByRole('link', { name: 'NASA/JPL — Titan, Visions of the Future' })).toHaveAttribute('href', 'https://www.jpl.nasa.gov/images/titan-jpl-travel-poster/');
            expect(await titan.locator('img').evaluateAll(images => images.map(image => image.getAttribute('alt')))).toEqual([
                'Kromacut Auto-paint prediction for the golden waves of the Titan poster',
                'Creality Print slicer preview of the Titan poster with its filament change tower',
                'Finished Titan layered print with golden yellow and orange wave reflections on a dark background',
            ]);
            const images = gallery.locator('img');
            for (let index = 0; index < 16; index++) {
                const image = images.nth(index);
                await image.scrollIntoViewIfNeeded();
                await expect.poll(() => image.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
                await expect(image).toHaveCSS('object-fit', 'contain');
                const fullSizeLink = gallery.getByRole('link', { name: /at full size/ }).nth(index);
                await expect(fullSizeLink).toHaveAttribute('href', (await image.getAttribute('src'))!);
                await expect(fullSizeLink).toHaveAttribute('target', '_blank');
                await expect(fullSizeLink).toHaveCSS('height', width >= 640 ? '320px' : '288px');
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
            const cardHeight = await titan.evaluate(card => card.getBoundingClientRect().height);
            await page.setViewportSize({ width, height: Math.max(1000, Math.ceil(cardHeight) + 120) });
            await titan.last().scrollIntoViewIfNeeded();
            await titan.last().screenshot({ path: testInfo.outputPath(`titan-${width}.png`) });
            const batmanga = cards.filter({ has: page.getByRole('heading', { name: 'Batman: The Jiro Kuwata Batmanga', exact: true }) });
            await expect(batmanga).toHaveCount(1);
            await expect(batmanga.locator('header').getByText('65.8 × 100.0 mm footprint')).toHaveCount(1);
            await expect(batmanga.locator('footer').getByRole('link', { name: /Jiro Kuwata \/ DC/ })).toHaveAttribute('href', 'https://m.media-amazon.com/images/I/81rOZq5ZgqL._AC_UF1000,1000_QL80_.jpg');
            expect(await batmanga.locator('figcaption > p:first-child').allTextContents()).toEqual(['Kromacut prediction', 'Slicer preview', 'Finished print']);
            const batmangaHeight = await batmanga.evaluate(card => card.getBoundingClientRect().height);
            await page.setViewportSize({ width, height: Math.max(1000, Math.ceil(batmangaHeight) + 120) });
            await batmanga.scrollIntoViewIfNeeded();
            await batmanga.screenshot({ path: testInfo.outputPath(`batmanga-${width}.png`) });
            const naruto = cards.filter({ has: page.getByRole('heading', { name: 'Naruto', exact: true }) });
            await expect(naruto).toHaveCount(1);
            await expect(naruto.locator('footer').getByRole('link', { name: 'Naruto artwork — source on Pinterest' })).toHaveAttribute('href', 'https://in.pinterest.com/pin/169870217190172931/');
            await expect(naruto.locator('header').getByText('110.4 × 190.2 mm footprint')).toHaveCount(1);
            expect(await naruto.locator('figcaption > p:first-child').allTextContents()).toEqual(['Kromacut prediction', 'Slicer preview', 'Finished print']);
            expect(await naruto.locator('img').evaluateAll(images => images.map(image => image.getAttribute('alt')))).toEqual([
                'Kromacut Auto-paint prediction of Naruto looking up at a blue sky',
                'Creality Print slicer preview of the Naruto print with seven filament colors and a change tower',
                'Finished Naruto layered print with yellow hair, orange clothing, and a lavender-blue sky',
            ]);
            const narutoHeight = await naruto.evaluate(card => card.getBoundingClientRect().height);
            await page.setViewportSize({ width, height: Math.max(1000, Math.ceil(narutoHeight) + 120) });
            await naruto.scrollIntoViewIfNeeded();
            await naruto.screenshot({ path: testInfo.outputPath(`naruto-${width}.png`) });
        }
    });

    test('landing CTA opens the tool and direct /app loading works', async ({ page }) => {
        await page.addInitScript(() => localStorage.clear());

        await page.goto('/');
        await expect(page.getByTestId('landing-page')).toBeVisible();
        await expect(page.getByRole('heading', { name: /Turn pixels into printable layers/i })).toBeVisible();
        await expect(page.getByTestId('landing-open-app')).toHaveAttribute('href', '/app');
        const communityLinks = page.getByTestId('landing-community-links');
        await expect(communityLinks).toBeVisible();
        await expect(communityLinks.getByRole('link')).toHaveCount(4);
        await expect(communityLinks.getByRole('link', { name: 'r/kromacut on Reddit' })).toHaveAttribute('href', 'https://www.reddit.com/r/kromacut/');
        await expect(page.getByRole('heading', { name: 'Made by the Kromacut community.' })).toBeVisible();
        const showcase = page.getByTestId('community-showcase');
        const communityGallery = showcase.getByTestId('community-gallery');
        await expect(communityGallery.getByAltText(/Hobbits and Dragons/)).toHaveCount(2);
        await expect(communityGallery.getByAltText(/King of Hearts playing-card print/)).toHaveCount(2);
        await expect(communityGallery.getByText('By vycdev')).toHaveCount(5);
        await expect(communityGallery.getByText('47.72 \u00d7 66.53 \u00d7 3.2 mm')).toHaveCount(1);
        const redditLinks = communityGallery.getByRole('link', { name: 'View Reddit post' });
        await expect(redditLinks).toHaveCount(1);
        await expect(redditLinks.first()).toHaveAttribute('href', 'https://www.reddit.com/r/kromacut/comments/1vum7om/hobbits_and_dragons/');
        const showcaseImageAlts = await communityGallery.locator('img').evaluateAll((images) => images.slice(2, 4).map((image) => image.getAttribute('alt')));
        expect(showcaseImageAlts).toEqual([
            'Slicer preview of the multicolor King of Hearts playing-card print',
            'A multicolor layered King of Hearts playing-card print',
        ]);
        const hopeShowcase = communityGallery.locator('article').filter({ has: page.getByRole('heading', { name: 'Hope poster', exact: true }) });
        await expect(hopeShowcase.getByAltText(/Hope poster/)).toHaveCount(3);
        await expect(hopeShowcase.getByText('By vycdev')).toHaveCount(1);
        await expect(hopeShowcase.getByText('72 \u00d7 108.4 \u00d7 3.04 mm')).toHaveCount(1);
        await expect(showcase.getByRole('link', { name: 'Open a pull request' })).toHaveAttribute('href', 'https://github.com/vycdev/Kromacut/pulls');

        await page.getByTestId('landing-open-app').click();
        await expect(page).toHaveURL(/\/app$/);
        await expect(page.getByTestId('image-file-input')).toBeAttached();
        await expect.poll(() => page.evaluate(() => localStorage.getItem('kromacut.has-launched.v1'))).toBe('v1');
    });

    test('landing bypass and same-origin storage survive navigation', async ({ page }) => {
        const persisted = {
            'kromacut.autopaint.profiles': '[{"id":"smoke"}]',
            'kromacut.palettes': '[{"id":"palette-smoke"}]',
            'kromacut:3d-print-settings': '{"layerHeight":0.2}',
            'kromacut.autopaint.v1': '{"schemaVersion":2,"filaments":[]}',
            'kromacut:3d-preview-mode': 'layered',
            theme: 'dark',
        };
        await page.addInitScript((values) => {
            if (!sessionStorage.getItem('kromacut-e2e-seeded')) {
                localStorage.clear();
                Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value));
                sessionStorage.setItem('kromacut-e2e-seeded', '1');
            }
        }, persisted);

        await page.goto('/?landing=1');
        await expect(page.getByTestId('landing-page')).toBeVisible();
        await page.goto('/app');
        await expect(page.getByTestId('image-file-input')).toBeAttached();
        await expect.poll(() => page.evaluate((values) => {
            const stableEntries = Object.entries(values).filter(([key]) => key !== 'kromacut.autopaint.v1');
            const autoPaint = JSON.parse(localStorage.getItem('kromacut.autopaint.v1') ?? '{}');
            return stableEntries.every(([key, value]) => localStorage.getItem(key) === value)
                && autoPaint.schemaVersion === 2
                && Array.isArray(autoPaint.filaments)
                && autoPaint.filaments.length === 0
                && document.documentElement.classList.contains('dark');
        }, persisted)).toBe(true);

        await page.goto('/');
        await expect(page).toHaveURL(/\/app$/);
        await page.goto('/?landing=1');
        await expect(page.getByTestId('landing-page')).toBeVisible();
    });

    test('app logo returns launched users to the landing page', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem('kromacut.has-launched.v1', 'v1');
        });
        await page.goto('/app');

        const homeLink = page.getByRole('link', { name: 'Kromacut home' });
        await expect(homeLink).toHaveAttribute('href', '/?landing=1');
        await homeLink.click();

        await expect(page).toHaveURL(/\/?\?landing=1$/);
        await expect(page.getByTestId('landing-page')).toBeVisible();
    });

    test('landing hero fills 1080p and 1440p viewports', async ({ page }) => {
        for (const viewport of [
            { width: 1920, height: 1080 },
            { width: 2560, height: 1440 },
        ]) {
            await page.setViewportSize(viewport);
            await page.goto('/?landing=1');

            const dimensions = await page.getByTestId('landing-hero').evaluate((hero) => ({
                heroHeight: hero.getBoundingClientRect().height,
                viewportHeight: window.innerHeight,
            }));
            expect(dimensions.heroHeight).toBeGreaterThanOrEqual(dimensions.viewportHeight);
        }
    });

    test('mobile landing navigation fits and remains keyboard accessible', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 720 });
        await page.addInitScript(() => localStorage.clear());
        await page.goto('/');

        await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
        const mobileCommunityLinks = page.getByTestId('landing-mobile-community-links');
        await expect(mobileCommunityLinks).toBeVisible();
        await expect(mobileCommunityLinks.getByRole('link')).toHaveCount(4);
        await expect(page.getByTestId('landing-open-app')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
        await expect.poll(() => page.getByTestId('landing-page').evaluate(
            (landing) => landing.scrollHeight > landing.clientHeight
        )).toBe(true);

        await page.keyboard.press('Tab');
        await expect(page.getByText('Skip to workflow', { exact: true })).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator('#workflow')).toBeFocused();
    });

    test('landing theme picker persists light mode', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        const communityLinks = page.getByTestId('landing-community-links');
        await communityLinks.getByRole('button', { name: 'Theme: dark' }).click();
        await page.getByRole('button', { name: 'Light', exact: true }).click();

        await expect(page.locator('html')).not.toHaveClass(/dark/);
        await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
        await page.reload();
        await expect(communityLinks.getByRole('button', { name: 'Theme: light' })).toBeVisible();
        await expect(page.locator('html')).not.toHaveClass(/dark/);
    });

    test('settings resources are keyboard-modal and restore focus', async ({ page }) => {
        await page.goto('/app');
        const settingsButton = page.getByRole('button', { name: 'Open settings' });
        await expect(page.getByRole('link', { name: 'r/kromacut on Reddit' })).toHaveCount(0);
        await settingsButton.click();

        const dialog = page.getByRole('dialog', { name: 'Settings' });
        await expect(dialog).toBeVisible();
        await expect(page.getByRole('button', { name: 'Close settings' })).toBeFocused();
        await expect(dialog.getByRole('button', { name: /Docs/ })).toBeVisible();
        await expect(dialog.getByRole('link', { name: /Discord/ })).toBeVisible();
        await expect(dialog.getByRole('link', { name: 'r/kromacut on Reddit' })).toBeVisible();
        await expect(dialog.getByRole('link', { name: /GitHub/ })).toBeVisible();
        await expect(dialog.getByRole('link', { name: /Support Me/ })).toBeVisible();

        await page.keyboard.press('Shift+Tab');
        await expect(
            dialog.getByRole('switch', { name: 'Enable experimental multi-plate mode' })
        ).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(settingsButton).toBeFocused();
    });

    test('docs direct loading keeps the docs shell', async ({ page }) => {
        await page.addInitScript(() => localStorage.clear());
        await page.goto('/docs/overview');
        await expect(page.getByRole('main')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Contents' })).toBeVisible();
        await expect(page.getByText('Overview', { exact: true }).first()).toBeVisible();
        await expect.poll(() => page.evaluate(() => localStorage.getItem('kromacut.has-launched.v1'))).toBeNull();
    });

    test('settings Docs action remains in documentation when Docs is already open', async ({ page }) => {
        await page.goto('/docs/overview');
        await page.getByRole('button', { name: 'Open settings' }).click();
        await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: /Docs/ }).click();

        await expect(page).toHaveURL(/\/docs\/overview$/);
        await expect(page.getByRole('heading', { name: 'Contents' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Back to app' })).toBeVisible();
    });
});
