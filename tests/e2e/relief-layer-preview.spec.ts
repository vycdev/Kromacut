import { expect, test } from '@playwright/test';

test('@smoke relief layer handles step physical boundaries with the keyboard', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.clear();
        Object.assign(window, { __KROMACUT_E2E: { buildHistory: [] } });
        localStorage.setItem(
            'kromacut:3d-print-settings',
            JSON.stringify({
                pixelSize: 0.1,
                layerHeight: 0.12,
                slicerFirstLayerHeight: 0.2,
                smoothMeshingStrength: 'none',
            })
        );
    });
    await page.goto('/app');
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 130;
        canvas.height = 20;
        const ctx = canvas.getContext('2d')!;
        // Thirteen layers leave room to verify ten-layer moves without clamping.
        for (let i = 0; i < 13; i++) {
            const value = Math.round((i * 255) / 12);
            ctx.fillStyle = `rgb(${value},${value},${value})`;
            ctx.fillRect(i * 10, 0, 10, 20);
        }
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'thirteen-layer-relief.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByTestId('build-3d-model').click();
    const low = page.getByRole('slider', { name: 'Preview bottom layer cutoff', exact: true });
    const high = page.getByRole('slider', { name: 'Preview top layer cutoff', exact: true });
    const height = async (slider: typeof high, value: number) => {
        await expect(slider).toBeVisible();
        await expect
            .poll(async () => parseFloat((await slider.getAttribute('aria-valuenow')) ?? ''))
            .toBeCloseTo(value, 6);
    };
    await height(high, 1.64);
    for (const [key, value] of [
        ['ArrowLeft', 1.52],
        ['ArrowDown', 1.4],
        ['Home', 0],
        ['ArrowUp', 0.2],
        ['ArrowRight', 0.32],
        ['ArrowLeft', 0.2],
        ['ArrowDown', 0],
        ['ArrowLeft', 0],
        ['ArrowUp', 0.2],
        ['ArrowRight', 0.32],
        ['Shift+ArrowRight', 1.52],
        ['Shift+ArrowLeft', 0.32],
        ['PageUp', 1.52],
        ['PageDown', 0.32],
        ['End', 1.64],
        ['Home', 0],
    ] as const) {
        await high.press(key);
        await height(high, value);
    }
    await high.press('End');
    await low.press('ArrowRight');
    await height(low, 0.2);
    await low.press('ArrowUp');
    await height(low, 0.32);
    await low.press('End');
    await height(low, 1.64);
    await low.press('Home');
    await low.press('PageUp');
    await height(low, 1.28);
    await low.press('PageDown');
    await height(low, 0);
    await low.press('Shift+ArrowRight');
    await height(low, 1.28);
    await low.press('Shift+ArrowRight');
    await height(low, 1.64);
    await high.press('Home');
    await height(high, 1.64);
    await low.press('Home');
    await height(low, 0);
    await high.press('PageDown');
    await height(high, 0.44);
    await low.press('End');
    await height(low, 0.44);
    await low.press('Home');
    await high.press('PageDown');
    await height(high, 0);
    await high.press('PageUp');
    await height(high, 1.28);
    await high.press('PageUp');
    await height(high, 1.64);
    // Rebuilding the same inputs must restore the complete preview.
    await high.press('ArrowLeft');
    await height(high, 1.52);
    await low.press('ArrowRight');
    await height(low, 0.2);
    await page.getByTestId('build-3d-model').click();
    await height(high, 1.64);
    await height(low, 0);
});
