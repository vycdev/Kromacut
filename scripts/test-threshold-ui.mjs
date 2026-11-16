import { appUrl, artifactPath, launchBrowser } from './custom-ui-helpers.mjs';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
const browser = await launchBrowser();
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(appUrl);
    const png = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 128;
        const x = c.getContext('2d');
        for (let i = 0; i < 256; i++) {
            x.fillStyle = `rgb(${i},${i},${i})`;
            x.fillRect(i, 0, 1, 128);
        }
        return c.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'gradient.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    const canvas = page.getByTestId('threshold-preview');
    await page.waitForFunction(
        () => document.querySelector('[data-testid="threshold-preview"]')?.width === 256
    );
    const pixel = async (x) =>
        canvas.evaluate((c, x) => Array.from(c.getContext('2d').getImageData(x, 64, 1, 1).data), x);
    await page.getByRole('spinbutton', { name: 'Number of colors', exact: true }).fill('3');
    for (const [n, color] of [
        [3, '#ffffff'],
        [2, '#888888'],
        [1, '#000000'],
    ])
        await page.getByLabel(`Color ${n}`, { exact: true }).fill(color);
    await expect.poll(() => pixel(100)).toEqual([136, 136, 136, 255]);
    // Move a triangle and inspect the preview before pointer release.
    const thumb = page.getByRole('slider', { name: 'Transition 1', exact: true });
    const box = await thumb.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 12 });
    await page.waitForTimeout(100);
    assert.deepEqual(await pixel(100), [0, 0, 0, 255]);
    await page.mouse.up();
    await page.getByRole('spinbutton', { name: 'Number of colors', exact: true }).fill('5');
    assert.equal(await page.locator('dialog').getByRole('slider').count(), 4);
    await page.getByRole('spinbutton', { name: 'Threshold 1 value', exact: true }).fill('255');
    const first = Number(
        await page.getByRole('spinbutton', { name: 'Threshold 1 value', exact: true }).inputValue()
    );
    const second = Number(
        await page.getByRole('spinbutton', { name: 'Threshold 2 value', exact: true }).inputValue()
    );
    assert(first < second);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Number of colors', exact: true }).fill('3');
    for (const [n, color] of [
        [3, '#ffffff'],
        [2, '#888888'],
        [1, '#000000'],
    ])
        await page.getByLabel(`Color ${n}`, { exact: true }).fill(color);
    await page.getByRole('spinbutton', { name: 'Threshold 1 value', exact: true }).fill('80');
    await page.getByRole('spinbutton', { name: 'Threshold 2 value', exact: true }).fill('170');
    await page.getByLabel('Color 2', { exact: true }).fill('#ff0000');
    await page.waitForTimeout(100);
    const markers = page.getByTestId('threshold-marker');
    assert.match(await markers.nth(0).getAttribute('style'), /rgb\(255, 0, 0\)/);
    assert.match(await markers.nth(1).getAttribute('style'), /rgb\(255, 0, 0\)/);
    await page.screenshot({ path: artifactPath('threshold-editor-tested.png') });
    await page.getByLabel('Color 2', { exact: true }).fill('#888888');
    await page.getByRole('button', { name: 'Apply thresholds', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('dialog'));
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Show original', exact: true }).check();
    await page.waitForTimeout(150);
    assert.deepEqual(await pixel(100), [136, 136, 136, 255]);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: /^Undo/ }).click();
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Show original', exact: true }).check();
    await expect.poll(() => pixel(100)).toEqual([100, 100, 100, 255]);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    const adjustments = page.getByRole('button', { name: /^Adjustments Fine-tune/ });
    if ((await adjustments.getAttribute('data-state')) === 'closed') await adjustments.click();
    const brightness = page.getByRole('slider').first();
    await brightness.focus();
    for (let i = 0; i < 20; i++) await brightness.press('ArrowRight');
    await brightness.press('Tab');
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Show original', exact: true }).check();
    await expect.poll(async () => (await pixel(100))[0]).toBeGreaterThan(100);
    const adjusted = await pixel(100);
    assert.equal(adjusted[0], adjusted[1]);
    assert.equal(adjusted[1], adjusted[2]);
    assert.equal(adjusted[3], 255);
    console.log(
        'PASS: live pointer-drag preview, arbitrary handle count, noncrossing boundaries, cancel and full-resolution apply.'
    );
} finally {
    await browser.close();
}
