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
        x.fillRect(40, 20, 3, 80);
        return c.toDataURL().split(',')[1];
    });
    await page
        .getByTestId('image-file-input')
        .setInputFiles({
            name: 'nozzle-lines.png',
            mimeType: 'image/png',
            buffer: Buffer.from(png, 'base64'),
        });
    const before = await page.evaluate(() => ({ ...localStorage }));
    await page.getByRole('button', { name: 'Compare nozzle sizes', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nozzle and size preview', exact: true });
    const a = dialog.getByRole('region', { name: 'Comparison 1', exact: true });
    const b = dialog.getByRole('region', { name: 'Comparison 2', exact: true });
    await a.getByLabel('Print width (mm)', { exact: true }).waitFor();
    assert.equal(await a.getByLabel('Nozzle diameter (mm)', { exact: true }).inputValue(), '0.4');
    assert.equal(await b.getByLabel('Nozzle diameter (mm)', { exact: true }).inputValue(), '0.2');
    assert.equal(
        await dialog.getByLabel('Preview view', { exact: true }).inputValue(),
        'appearance'
    );
    const reds = (panel) =>
        panel.getByTestId('nozzle-preview-canvas').evaluate((c) => {
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4)
                if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 0) n++;
            return n;
        });
    await expect.poll(() => reds(a)).toBe(0);
    await expect.poll(() => reds(b)).toBeGreaterThan(0);
    const fine = await reds(b);
    await a.getByLabel('Nozzle diameter (mm)', { exact: true }).selectOption('0.2');
    await expect.poll(() => reds(a)).toBe(fine);
    await a.getByLabel('Line width (mm)', { exact: true }).fill('0.8');
    await expect.poll(() => reds(a)).toBe(0);
    await a.getByLabel('Print width (mm)', { exact: true }).fill('44.8');
    await expect.poll(() => reds(a)).toBeGreaterThan(0);
    await dialog.getByLabel('Preview view', { exact: true }).selectOption('original');
    await expect.poll(() => reds(a)).toBe(240);
    await expect.poll(() => reds(b)).toBe(240);
    await dialog.getByLabel('Preview view', { exact: true }).selectOption('risk');
    const legend = dialog.getByTestId('nozzle-legend');
    await legend.waitFor();
    assert.match(await legend.innerText(), /Dimmed: not flagged/);
    assert.match(await legend.innerText(), /aren’t severity levels/);
    assert.match(await legend.innerText(), /failure probability/);
    await dialog.getByLabel('Preview view', { exact: true }).selectOption('appearance');
    await a.getByLabel('Print width (mm)', { exact: true }).fill('1');
    await a.getByLabel('Line width (mm)', { exact: true }).fill('3');
    await expect(a.getByTestId('nozzle-result')).toHaveText('No estimate; enlarge image.');
    await a.getByLabel('Nozzle diameter (mm)', { exact: true }).selectOption('0.4');
    await dialog.getByRole('button', { name: 'Use current 3D size', exact: true }).click();
    await expect.poll(() => reds(a)).toBe(0);
    await expect.poll(() => reds(b)).toBeGreaterThan(0);
    await page.screenshot({ path: artifactPath('nozzle-appearance-tested.png') });
    await dialog.getByRole('button', { name: 'Close comparison', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), before);
    console.log(
        'PASS: defaults 0.4/0.2; real RGB appearance changes for nozzle/line width/physical size; original comparison; categorical legend; unavailable-estimate handling; saved settings unchanged.'
    );
} finally {
    await browser.close();
}
