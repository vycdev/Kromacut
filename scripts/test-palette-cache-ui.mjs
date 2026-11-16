import { appUrl, launchBrowser } from './custom-ui-helpers.mjs';
import assert from 'node:assert/strict';
const browser = await launchBrowser();
try {
    const page = await browser.newPage();
    await page.goto(appUrl);
    const png = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 32;
        c.height = 32;
        const x = c.getContext('2d');
        const g = x.createLinearGradient(0, 0, 32, 0);
        g.addColorStop(0, 'black');
        g.addColorStop(1, 'white');
        x.fillStyle = g;
        x.fillRect(0, 0, 32, 32);
        return c.toDataURL().split(',')[1];
    });
    const upload = () =>
        page.getByTestId('image-file-input').setInputFiles({
            name: 'gradient.png',
            mimeType: 'image/png',
            buffer: Buffer.from(png, 'base64'),
        });
    const cached = () =>
        page.evaluate(() => JSON.parse(localStorage.getItem('kromacut.palettes') || '[]'));
    await upload();
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal((await cached()).length, 0);
    for (let i = 0; i < 2; i++) {
        await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
        await page.getByRole('spinbutton', { name: 'Number of colors', exact: true }).fill('3');
        for (const [n, color] of [
            [3, '#ffffff'],
            [2, '#888888'],
            [1, '#000000'],
        ])
            await page.getByLabel(`Color ${n}`, { exact: true }).fill(color);
        await page.getByRole('button', { name: 'Apply thresholds', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('dialog'));
    }
    assert.equal((await cached()).length, 1);
    await page.reload();
    await upload();
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    const palette = (await cached())[0];
    await page.getByRole('spinbutton', { name: 'Number of colors', exact: true }).fill('5');
    await page.getByLabel('Saved / brand palettes', { exact: true }).selectOption(palette.id);
    assert.equal(
        await page.getByRole('spinbutton', { name: 'Number of colors', exact: true }).inputValue(),
        '3'
    );
    assert.equal(await page.locator('dialog').getByRole('slider').count(), 2);
    assert.equal(await page.getByLabel('Color 2', { exact: true }).inputValue(), '#888888');
    console.log(
        'PASS: automatic cache, duplicate suppression, cancel does not cache, persistence after reload, palette reuse restores colors and handle count.'
    );
} finally {
    await browser.close();
}
