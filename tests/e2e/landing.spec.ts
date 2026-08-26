import { expect, test } from '@playwright/test';

test.describe('landing page smoke @smoke', () => {
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
        await expect(page.getByAltText(/Hobbits and Dragons/)).toHaveCount(2);
        await expect(page.getByRole('link', { name: 'View the Reddit post' })).toHaveAttribute('href', 'https://www.reddit.com/r/kromacut/comments/1vum7om/hobbits_and_dragons/');

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
