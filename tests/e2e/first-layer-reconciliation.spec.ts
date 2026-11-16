import { expect, test } from '@playwright/test';

test('@smoke first color height survives resize and history with a non-multiple first layer', async ({
    page,
}) => {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem(
            'kromacut.autopaint.v1',
            JSON.stringify({ schemaVersion: 2, filaments: [], paintMode: 'manual' })
        );
    });
    await page.goto('/app');
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 8, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(8, 0, 8, 16);
        return canvas.toDataURL().split(',')[1];
    });
    await page
        .getByTestId('image-file-input')
        .setInputFiles({
            name: 'two-colors.png',
            mimeType: 'image/png',
            buffer: Buffer.from(png, 'base64'),
        });
    const mode3d = page.getByRole('button', { name: '3D', exact: true });
    const mode2d = page.getByRole('button', { name: '2D', exact: true });
    await mode3d.click();
    await page.getByTestId('print-layer-height').fill('0.08');
    await page.getByTestId('print-layer-height').press('Tab');
    await page.getByTestId('print-first-layer-height').fill('0.20');
    await page.getByTestId('print-first-layer-height').press('Tab');
    const firstHeight = page
        .locator('[aria-label^="Color swatch"]')
        .first()
        .locator('..')
        .getByRole('slider');
    await firstHeight.press('Home');
    await firstHeight.press('ArrowRight');
    await expect(firstHeight).toHaveAttribute('aria-valuenow', '0.28');
    await mode2d.click();
    const resize = page.getByTestId('image-resize-percent-slider').locator('..').locator('..');
    await resize.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText('8x8');
    await mode3d.click();
    await expect(firstHeight).toHaveAttribute('aria-valuenow', '0.28');
    for (let i = 0; i < 2; i++) {
        for (const [action, size] of [
            ['Undo', '16x16'],
            ['Redo', '8x8'],
        ]) {
            await mode2d.click();
            await page.getByRole('button', { name: action, exact: true }).click();
            await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
                size
            );
            await mode3d.click();
            await expect(firstHeight).toHaveAttribute('aria-valuenow', '0.28');
        }
    }
});
