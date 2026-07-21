import { expect, test } from '@playwright/test';

test.describe('landing page smoke @smoke', () => {
    test('landing CTA opens the tool and direct /app loading works', async ({ page }) => {
        await page.addInitScript(() => localStorage.clear());

        await page.goto('/');
        await expect(page.getByTestId('landing-page')).toBeVisible();
        await expect(page.getByRole('heading', { name: /Turn pixels into printable layers/i })).toBeVisible();
        await expect(page.getByTestId('landing-open-app')).toHaveAttribute('href', '/app');

        await page.getByTestId('landing-open-app').click();
        await expect(page).toHaveURL(/\/app$/);
        await expect(page.getByTestId('image-file-input')).toBeAttached();
    });

    test('landing bypass and same-origin storage survive navigation', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.clear();
            localStorage.setItem('kromacut.autopaint.profiles', '[{"id":"smoke"}]');
        });

        await page.goto('/?landing=1');
        await expect(page.getByTestId('landing-page')).toBeVisible();
        await page.goto('/app');
        await expect(page.getByTestId('image-file-input')).toBeAttached();
        await expect.poll(() => page.evaluate(() => localStorage.getItem('kromacut.autopaint.profiles'))).toBe('[{"id":"smoke"}]');
    });

    test('docs direct loading keeps the docs shell', async ({ page }) => {
        await page.goto('/docs/overview');
        await expect(page.getByRole('main')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Contents' })).toBeVisible();
        await expect(page.getByText('Overview', { exact: true }).first()).toBeVisible();
    });
});
