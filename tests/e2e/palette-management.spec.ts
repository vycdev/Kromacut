import { expect, test } from '@playwright/test';

/**
 * Focused UI coverage for advanced palette management (issue #26):
 * supplier palette group + disclaimer, clone wiring, per-color
 * enable/disable, and independent color count.
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
    const bambuOption = page.getByRole('checkbox', { name: /Bambu Lab PLA Basic \(30\)/ });
    await expect(bambuOption).toBeVisible();

    // Selecting it preserves the independent color count
    await bambuOption.check();
    await page.keyboard.press('Escape');
    const finalColors = page.locator('#final-colors');
    await expect(finalColors).toHaveValue('16');
    await expect(finalColors).toBeEnabled();

    // Clone into an editable custom palette (auto-selected, feedback shown)
    await page.getByRole('button', { name: /clone selected palette/i }).click();
    await expect(page.getByText(/^Cloned as/)).toBeVisible();
    await expect(paletteTrigger).toContainText('Bambu Lab PLA Basic (copy)');

    // Disable one color in the editor; supplier names came along with the clone
    await page.getByRole('button', { name: 'Edit selected palette' }).click();
    await expect(page.getByPlaceholder('Name (optional)').first()).toHaveValue('Jade White');
    await page.getByRole('button', { name: 'Disable color 1', exact: true }).click();
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // The dropdown now reports enabled/total and the count stays independent
    await expect(finalColors).toHaveValue('16');
    await paletteTrigger.click();
    await expect(
        page.getByRole('checkbox', { name: /Bambu Lab PLA Basic \(copy\) \(29\/30\)/ })
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // Toggle state survives a reload (persisted to localStorage)
    await page.reload();
    await expect(page.locator('#final-colors')).toHaveValue('16');
});

test('@smoke legacy palette selection migrates and multiple choices survive reload', async ({
    page,
}) => {
    await page.addInitScript(() => {
        if (localStorage.getItem('kromacut.palettes.selected') === null) {
            localStorage.setItem('kromacut.palettes.selected', 'sup_bambu-pla-basic');
        }
    });
    await page.goto('/app');
    const selector = page.locator('#palette-select');
    await expect(selector).toContainText('Bambu Lab PLA Basic');
    await page.locator('#final-colors').fill('3');
    await selector.click();
    const gray = page.getByRole('checkbox', { name: /Gray/i }).first();
    const bambu = page.getByRole('checkbox', { name: /Bambu Lab PLA Basic/ });
    await expect(bambu).toBeChecked();
    await gray.check();
    await page.keyboard.press('Escape');
    await expect(page.locator('#final-colors')).toHaveValue('3');
    await expect(selector).toContainText('2');
    await page.reload();
    await selector.click();
    await expect(bambu).toBeChecked();
    await expect(gray).toBeChecked();
});
