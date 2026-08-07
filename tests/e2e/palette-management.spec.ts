import { expect, test } from '@playwright/test';

/**
 * Focused UI coverage for advanced palette management (issue #26):
 * supplier palette group + disclaimer, clone wiring, per-color
 * enable/disable, and the palette-driven color count.
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
    const bambuOption = page.getByRole('option', { name: /Bambu Lab PLA Basic \(30\)/ });
    await expect(bambuOption).toBeVisible();

    // Selecting it drives the color count, which becomes palette-determined
    await bambuOption.click();
    const finalColors = page.locator('#final-colors');
    await expect(finalColors).toHaveValue('30');
    await expect(finalColors).toBeDisabled();

    // Clone into an editable custom palette (auto-selected, feedback shown)
    await page.getByRole('button', { name: /clone selected palette/i }).click();
    await expect(page.getByText(/^Cloned as/)).toBeVisible();
    await expect(paletteTrigger).toContainText('Bambu Lab PLA Basic (copy)');

    // Disable one color in the editor; supplier names came along with the clone
    await page.getByRole('button', { name: 'Edit selected palette' }).click();
    await expect(page.getByPlaceholder('Name (optional)').first()).toHaveValue('Jade White');
    await page.getByRole('button', { name: 'Disable color 1', exact: true }).click();
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // The dropdown now reports enabled/total and the count input follows
    await expect(finalColors).toHaveValue('29');
    await paletteTrigger.click();
    await expect(
        page.getByRole('option', { name: /Bambu Lab PLA Basic \(copy\) \(29\/30\)/ })
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // Toggle state survives a reload (persisted to localStorage)
    await page.reload();
    await expect(page.locator('#final-colors')).toHaveValue('29');
});
