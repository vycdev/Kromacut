import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test('@smoke the same source file can be reloaded after resizing', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    const input = page.getByTestId('image-file-input');
    const source = fileURLToPath(new URL('../assets/rocco__source.png', import.meta.url));
    await input.setInputFiles(source);
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
        '1000x835'
    );
    // Current dimensions can precede the preview decode. Wait for its loaded-image HUD,
    // using a fixture whose dimensions cannot match the starter image.
    await expect(page.getByText('Image: 1000×835', { exact: true })).toBeVisible();
    const resize = page.getByTestId('image-resize-percent-slider').locator('..').locator('..');
    await resize.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText('500x418');
    // Playwright dispatches change even for repeated setInputFiles calls. Check
    // that the native input is empty too, so selecting the same path in a real
    // file picker will generate the event rather than silently ignoring it.
    await expect(input).toHaveValue('');
    await input.setInputFiles(source);
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
        '1000x835'
    );
    await expect(input).toHaveValue('');
});
