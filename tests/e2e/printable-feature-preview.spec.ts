import { expect, test, type Locator } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const twoColorProfile = fileURLToPath(
    new URL('../assets/filament-profiles/2_Colors.kapp', import.meta.url)
);

async function expectPaintedCanvas(canvas: Locator) {
    await expect(canvas).toBeVisible();
    await expect
        .poll(
            () =>
                canvas.evaluate((element) => {
                    const preview = element as HTMLCanvasElement;
                    const context = preview.getContext('2d');
                    if (!context || preview.width <= 0 || preview.height <= 0) return false;
                    const pixels = context.getImageData(0, 0, preview.width, preview.height).data;
                    for (let alpha = 3; alpha < pixels.length; alpha += 4) {
                        if (pixels[alpha] > 0) return true;
                    }
                    return false;
                }),
            { timeout: 10_000 }
        )
        .toBe(true);
}

test('@smoke Printable detail paints the At-risk canvas on first open and reopen', async ({
    page,
}) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    await expect(page.getByTestId('image-file-input')).toBeAttached();

    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint' }).click();
    await page.getByTestId('autopaint-profile-import-input').setInputFiles(twoColorProfile);
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible({ timeout: 30_000 });
    const openPreview = page.getByRole('button', { name: 'Open preview' });
    await expect(openPreview).toBeVisible({ timeout: 60_000 });

    for (let attempt = 0; attempt < 2; attempt++) {
        await openPreview.click();
        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toBeVisible();
        await expectPaintedCanvas(
            dialog.getByRole('img', {
                name: 'Overlay showing image details at risk of disappearing or being claimed by neighboring colors',
            })
        );
        await dialog.getByRole('button', { name: 'Close' }).click();
        await expect(dialog).toBeHidden();
    }
});
