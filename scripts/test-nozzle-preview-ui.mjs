import { appUrl, artifactPath, launchBrowser } from './custom-ui-helpers.mjs';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await launchBrowser();
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(appUrl);
    const png = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 128;
        const x = c.getContext('2d');
        x.fillStyle = '#101010';
        x.fillRect(8, 8, 112, 112);
        x.fillStyle = '#ff0000';
        x.fillRect(40, 20, 2, 80);
        return c.toDataURL().split(',')[1];
    });
    await page
        .getByTestId('image-file-input')
        .setInputFiles({
            name: 'nozzle-lines.png',
            mimeType: 'image/png',
            buffer: Buffer.from(png, 'base64'),
        });
    const before = await page.evaluate(() => ({
        storage: { ...localStorage },
        mesh: !!window.__KROMACUT_LAST_MESH,
        canvases: document.querySelectorAll('canvas').length,
    }));
    await page.getByRole('button', { name: 'Compare nozzle sizes', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nozzle and size preview', exact: true });
    const a = dialog.getByRole('region', { name: 'Comparison 1', exact: true });
    const b = dialog.getByRole('region', { name: 'Comparison 2', exact: true });
    await dialog.getByLabel('Preview view', { exact: true }).selectOption('risk');
    await a.getByLabel('Print width (mm)', { exact: true }).fill('22.4');
    await a.getByLabel('Nozzle diameter (mm)', { exact: true }).selectOption('0.2');
    await b.getByLabel('Nozzle diameter (mm)', { exact: true }).selectOption('0.8');
    assert.equal(await b.getByLabel('Print width (mm)', { exact: true }).inputValue(), '22.4');
    assert.equal(await a.getByLabel('Print height (mm)', { exact: true }).inputValue(), '22.4');
    await expect.poll(() => a.getByTestId('nozzle-result').getAttribute('data-flagged')).toBe('0');
    await expect
        .poll(async () => Number(await b.getByTestId('nozzle-result').getAttribute('data-flagged')))
        .toBeGreaterThan(0);
    assert.equal(await a.getByTestId('nozzle-preview-canvas').getAttribute('width'), '112');
    const countRed = () =>
        b.getByTestId('nozzle-preview-canvas').evaluate((c) => {
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4)
                if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 0) n++;
            return n;
        });
    await dialog.getByLabel('Preview view', { exact: true }).selectOption('original');
    await expect.poll(countRed).toBe(160);
    await dialog.getByLabel('Preview view', { exact: true }).selectOption('risk');
    await dialog.getByLabel('Link dimensions', { exact: true }).uncheck();
    await b.getByLabel('Print width (mm)', { exact: true }).fill('112');
    assert.equal(await a.getByLabel('Print width (mm)', { exact: true }).inputValue(), '22.4');
    await expect.poll(() => b.getByTestId('nozzle-result').getAttribute('data-flagged')).toBe('0');
    await b.getByLabel('Print height (mm)', { exact: true }).fill('22.4');
    await expect
        .poll(async () => Number(await b.getByTestId('nozzle-result').getAttribute('data-flagged')))
        .toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Use current 3D size', exact: true }).click();
    assert.equal(
        await a.getByLabel('Print width (mm)', { exact: true }).inputValue(),
        await b.getByLabel('Print width (mm)', { exact: true }).inputValue()
    );
    await a.getByLabel('Print width (mm)', { exact: true }).fill('22.4');
    await b.getByLabel('Print width (mm)', { exact: true }).fill('22.4');
    await expect.poll(() => a.getByTestId('nozzle-result').getAttribute('data-flagged')).toBe('0');
    await expect
        .poll(async () => Number(await b.getByTestId('nozzle-result').getAttribute('data-flagged')))
        .toBeGreaterThan(0);
    await page.screenshot({ path: artifactPath('nozzle-preview-tested.png') });
    await dialog.getByRole('button', { name: 'Close comparison', exact: true }).click();
    const after = await page.evaluate(() => ({
        storage: { ...localStorage },
        mesh: !!window.__KROMACUT_LAST_MESH,
    }));
    assert.deepEqual(after.storage, before.storage);
    assert.equal(after.mesh, before.mesh);
    await page.getByRole('button', { name: 'Compare nozzle sizes', exact: true }).click();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    console.log(
        'PASS: two independent worker comparisons; smaller nozzle/greater print size reduce flagged details; linked/unlinked dimensions and aspect ratio; alpha crop; original toggle; no persisted-setting or mesh changes; Escape cleanup.'
    );
} finally {
    await browser.close();
}
