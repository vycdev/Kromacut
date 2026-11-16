import { expect, test } from '@playwright/test';

for (const reordered of [false, true]) {
    test(`@smoke first color height survives resize and history (${reordered ? 'manual order and changing palette size' : 'default order'})`, async ({
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
        const png = await page.evaluate((reordered) => {
            const edge = reordered ? 7 : 8;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 16;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, edge, 16);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(edge, 0, 16 - edge, 16);
            return canvas.toDataURL().split(',')[1];
        }, reordered);
        await page.getByTestId('image-file-input').setInputFiles({
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
        if (reordered) {
            const whiteHandle = page
                .getByLabel('Color swatch: #ffffff', { exact: true })
                .locator('..')
                .getByRole('button')
                .first();
            await whiteHandle.scrollIntoViewIfNeeded();
            const source = (await whiteHandle.boundingBox())!;
            const target = (await page
                .getByLabel('Color swatch: #000000', { exact: true })
                .locator('..')
                .getByRole('button')
                .first()
                .boundingBox())!;
            await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
            await page.mouse.down();
            await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
                steps: 10,
            });
            await page.mouse.up();
        }
        const firstColor = page.locator('[aria-label^="Color swatch"]').first();
        const expectedColor = `Color swatch: ${reordered ? '#ffffff' : '#000000'}`;
        await expect(firstColor).toHaveAttribute('aria-label', expectedColor);
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
        await expect(firstColor).toHaveAttribute('aria-label', expectedColor);
        if (reordered)
            await expect
                .poll(() => page.locator('[aria-label^="Color swatch"]').count())
                .toBeGreaterThan(2);
        await expect(firstHeight).toHaveAttribute('aria-valuenow', '0.28');
        for (let i = 0; i < 2; i++) {
            for (const [action, size] of [
                ['Undo', '16x16'],
                ['Redo', '8x8'],
            ]) {
                await mode2d.click();
                await page.getByRole('button', { name: action, exact: true }).click();
                await expect(
                    page.getByText('Current', { exact: true }).locator('..')
                ).toContainText(size);
                await mode3d.click();
                await expect(firstColor).toHaveAttribute('aria-label', expectedColor);
                await expect(firstHeight).toHaveAttribute('aria-valuenow', '0.28');
            }
        }
    });
}
