import { appUrl, launchBrowser } from './custom-ui-helpers.mjs';
import assert from 'node:assert/strict';
const browser = await launchBrowser();
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() =>
        localStorage.setItem(
            'kromacut.palettes',
            JSON.stringify([
                {
                    id: 'reverse-test',
                    name: 'Reverse test',
                    version: 2,
                    colors: ['#ffffff', '#ff0000', '#000000'],
                    createdAt: 1,
                    updatedAt: 1,
                },
            ])
        )
    );
    await page.goto(appUrl);
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0, 0, 64, 64);
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'red.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    const heading = page.getByText('Image colors', { exact: true });
    await heading.waitFor();
    const order = await heading.evaluate((el) =>
        Boolean(
            el.compareDocumentPosition(
                [...document.querySelectorAll('button')].find(
                    (b) => b.textContent === 'Edit thresholds'
                )
            ) & Node.DOCUMENT_POSITION_FOLLOWING
        )
    );
    assert(order);
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    await page.getByLabel('Saved / brand palettes', { exact: true }).selectOption('reverse-test');
    assert.equal(await page.getByLabel('Color 1', { exact: true }).inputValue(), '#000000');
    assert.equal(await page.getByLabel('Color 2', { exact: true }).inputValue(), '#ff0000');
    assert.equal(await page.getByLabel('Color 3', { exact: true }).inputValue(), '#ffffff');
    const before = await page
        .getByRole('spinbutton', { name: 'Threshold 1 value', exact: true })
        .inputValue();
    await page.getByLabel('Color 1', { exact: true }).fill('#eeeeee');
    assert.equal(await page.getByLabel('Color 1', { exact: true }).inputValue(), '#ff0000');
    assert.equal(await page.getByLabel('Color 2', { exact: true }).inputValue(), '#eeeeee');
    assert.equal(
        await page.getByRole('spinbutton', { name: 'Threshold 1 value', exact: true }).inputValue(),
        before
    );
    console.log(
        'PASS: editor follows Image colors; reversed cached palette sorts dark-to-light; editing a color reorders it without moving thresholds.'
    );
} finally {
    await browser.close();
}
