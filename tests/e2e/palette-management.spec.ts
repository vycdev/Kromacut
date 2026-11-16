import { expect, test } from '@playwright/test';

/**
 * Focused UI coverage for advanced palette management (issue #26):
 * supplier palette group + disclaimer, clone wiring, per-color
 * enable/disable, and the independent color count.
 */

test('@smoke supplier palettes, clone, and color toggles work end to end', async ({ page }) => {
    await page.goto('/app');

    const paletteTrigger = page.locator('#palette-select');
    await expect(paletteTrigger).toBeVisible();

    // Supplier group, non-affiliation caption, and the Bambu palette (30 colors)
    await paletteTrigger.click();
    await expect(page.getByText('Supplier Palettes', { exact: true })).toBeVisible();
    await expect(
        page.getByText(/not affiliated with, endorsed by, or sponsored by/i).first()
    ).toBeVisible();
    const bambuOption = page.getByRole('checkbox', { name: 'Bambu Lab PLA Basic', exact: true });
    await expect(bambuOption).toBeVisible();

    // Selecting a palette keeps the requested reduction count independently editable.
    await bambuOption.check();
    await page.keyboard.press('Escape');
    const finalColors = page.locator('#final-colors');
    await expect(finalColors).toHaveValue('16');
    await expect(finalColors).toBeEnabled();
    await finalColors.fill('3');
    await finalColors.press('Tab');

    // Clone into an editable custom palette (auto-selected, feedback shown)
    await page.getByRole('button', { name: /clone selected palette/i }).click();
    await expect(page.getByText(/^Cloned as/)).toBeVisible();
    await expect(paletteTrigger).toHaveText('Bambu Lab PLA Basic (copy)');

    // Disable one color in the editor; supplier names came along with the clone
    await page.getByRole('button', { name: 'Edit selected palette' }).click();
    await expect(page.getByPlaceholder('Name (optional)').first()).toHaveValue('Jade White');
    await page.getByRole('button', { name: 'Disable color 1', exact: true }).click();
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // The dropdown reports enabled/total without changing the requested count.
    await expect(finalColors).toHaveValue('3');
    await paletteTrigger.click();
    await expect(
        page.getByText('Bambu Lab PLA Basic (copy) (29/30)', { exact: true })
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // Toggle state survives a reload (persisted to localStorage)
    await page.reload();
    await paletteTrigger.click();
    await expect(
        page.getByRole('checkbox', { name: 'Bambu Lab PLA Basic (copy)', exact: true })
    ).toBeChecked();
    await expect(
        page.getByText('Bambu Lab PLA Basic (copy) (29/30)', { exact: true })
    ).toBeVisible();
});
