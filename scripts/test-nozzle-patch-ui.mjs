import { appUrl, artifactPath, launchBrowser } from './custom-ui-helpers.mjs';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await launchBrowser();
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.addInitScript(() => {
        window.__imageBlobs = [];
        const original = URL.createObjectURL;
        URL.createObjectURL = function (blob) {
            if (blob.type === 'image/png') window.__imageBlobs.push(blob);
            return original.call(this, blob);
        };
    });
    await page.goto(appUrl);
    const upload = async (w, h) => {
        const png = await page.evaluate(
            ({ w, h }) => {
                const c = document.createElement('canvas');
                c.width = w;
                c.height = h;
                const x = c.getContext('2d');
                x.fillStyle = '#141414';
                x.fillRect(8, 8, w - 16, h - 16);
                x.fillStyle = '#c81414';
                x.fillRect(w / 2, 8, w / 2 - 8, h - 16);
                x.fillStyle = '#d21919';
                x.fillRect(w / 2 - 3, 20, 3, h - 40);
                return c.toDataURL().split(',')[1];
            },
            { w, h }
        );
        await page
            .getByTestId('image-file-input')
            .setInputFiles({
                name: 'thin-regions.png',
                mimeType: 'image/png',
                buffer: Buffer.from(png, 'base64'),
            });
    };
    await upload(128, 128);
    const before = await page.evaluate(() => ({ ...localStorage }));
    const dialog = page.getByRole('dialog', { name: 'Nozzle and size preview', exact: true });
    const a = dialog.getByRole('region', { name: 'Comparison 1', exact: true }),
        b = dialog.getByRole('region', { name: 'Comparison 2', exact: true });
    const open = () =>
        page.getByRole('button', { name: 'Compare nozzle sizes', exact: true }).click();
    const stripeCount = (panel) =>
        panel.getByTestId('nozzle-preview-canvas').evaluate((c) => {
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4)
                if (d[i] === 210 && d[i + 1] === 25 && d[i + 2] === 25) n++;
            return n;
        });
    const mainHash = () => page.getByTestId('main-image-preview').evaluate((c) => c.toDataURL());
    const original = await mainHash();
    await open();
    await dialog.getByRole('checkbox', { name: 'Patch vulnerable regions', exact: true }).check();
    await expect(dialog.getByLabel('Preview view', { exact: true })).toHaveValue('patched');
    await expect(a.getByTestId('nozzle-patch-result')).toContainText(
        'Merged: 1 regions / 264 pixels. Unresolved: 0 pixels.'
    );
    await expect.poll(() => stripeCount(a)).toBe(0);
    await expect.poll(() => stripeCount(b)).toBe(264);
    await expect(a.getByTestId('nozzle-result')).toHaveAttribute('data-flagged', '0');
    await b.getByRole('button', { name: 'Apply patch to image', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
        'No regions could be patched at full resolution.'
    );
    await dialog.getByLabel('Preview view', { exact: true }).selectOption('original');
    await expect.poll(() => stripeCount(a)).toBe(264);
    await dialog.getByRole('checkbox', { name: 'Patch vulnerable regions', exact: true }).uncheck();
    await dialog.getByLabel('Preview view', { exact: true }).selectOption('risk');
    await expect(a.getByTestId('nozzle-result')).toHaveAttribute('data-flagged', '264');
    await dialog.getByRole('button', { name: 'Close comparison', exact: true }).click();
    assert.equal(await mainHash(), original);
    await open();
    await dialog.getByRole('checkbox', { name: 'Patch vulnerable regions', exact: true }).check();
    await expect(
        a.getByRole('button', { name: 'Apply patch to image', exact: true })
    ).toBeEnabled();
    // Closing while a full-resolution worker is pending must not commit later.
    await page.evaluate(() => {
        window.__realWorkerPost = Worker.prototype.postMessage;
        window.__patchRequested = false;
        Worker.prototype.postMessage = function (...args) {
            if (args[0]?.patchOnly) {
                window.__patchRequested = true;
                setTimeout(() => window.__realWorkerPost.apply(this, args), 500);
            } else window.__realWorkerPost.apply(this, args);
        };
    });
    await a.getByRole('button', { name: 'Apply patch to image', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__patchRequested)).toBe(true);
    await dialog.getByRole('button', { name: 'Close comparison', exact: true }).click();
    await page.waitForTimeout(700);
    assert.equal(await mainHash(), original);
    await page.evaluate(() => {
        Worker.prototype.postMessage = window.__realWorkerPost;
    });
    await open();
    await expect(
        a.getByRole('button', { name: 'Apply patch to image', exact: true })
    ).toBeEnabled();
    await page.screenshot({ path: artifactPath('nozzle-patch-tested.png') });
    await a.getByRole('button', { name: 'Apply patch to image', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect.poll(mainHash).not.toBe(original);
    const applied = await mainHash();
    await page.keyboard.press('Control+z');
    await expect.poll(mainHash).toBe(original);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(mainHash).toBe(applied);
    assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), before);
    // Longer than the preview cap: apply must preserve full resolution and transparent margins.
    await upload(1200, 100);
    await open();
    await dialog.getByRole('checkbox', { name: 'Patch vulnerable regions', exact: true }).check();
    await expect(
        a.getByRole('button', { name: 'Apply patch to image', exact: true })
    ).toBeEnabled();
    await a.getByRole('button', { name: 'Apply patch to image', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const info = await page.evaluate(async () => {
        const blob = window.__imageBlobs.at(-1);
        const b = await createImageBitmap(blob);
        const c = document.createElement('canvas');
        c.width = b.width;
        c.height = b.height;
        const x = c.getContext('2d');
        x.drawImage(b, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let stripe = 0,
            opaque = 0,
            red = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] === 210 && d[i + 1] === 25 && d[i + 2] === 25) stripe++;
            if (d[i + 3]) opaque++;
            if (d[i] === 200 && d[i + 1] === 20 && d[i + 2] === 20) red++;
        }
        return { width: c.width, height: c.height, stripe, opaque, red };
    });
    assert.deepEqual(info, {
        width: 1200,
        height: 100,
        stripe: 0,
        opaque: 1184 * 84,
        red: 592 * 84 + 180,
    });
    console.log(
        'PASS: patch toggle; closest adjacent color; scenario-specific widths; reanalyzed risk; original/off/cancel unchanged; cancel pending Apply blocks late commit; no-op application; full-resolution Apply preserves alpha and margins; Ctrl+Z / Ctrl+Shift+Z restore pixels; print settings unchanged.'
    );
} finally {
    await browser.close();
}
