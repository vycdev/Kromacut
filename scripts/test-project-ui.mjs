import { appUrl, artifactPath, launchBrowser } from './custom-ui-helpers.mjs';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
const browser = await launchBrowser();
let page;
try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
        acceptDownloads: true,
    });
    page = await context.newPage();
    await page.goto(appUrl);
    const png = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 96;
        c.height = 96;
        const x = c.getContext('2d');
        ['#101010', '#b12a33', '#eeeeee', '#4477aa'].forEach((color, i) => {
            x.fillStyle = color;
            x.fillRect(8 + (i % 2) * 40, 8 + Math.floor(i / 2) * 40, 40, 40);
        });
        return c.toDataURL().split(',')[1];
    });
    await page
        .getByTestId('image-file-input')
        .setInputFiles({
            name: 'session-source.png',
            mimeType: 'image/png',
            buffer: Buffer.from(png, 'base64'),
        });
    await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeEnabled();
    const canvasHash = (p) =>
        p
            .getByTestId('main-image-preview')
            .evaluate((c) => c.toDataURL())
            .then((s) => createHash('sha256').update(s).digest('hex'));
    await page.locator('#final-colors').fill('2');
    await page.locator('#final-colors').press('Tab');
    await page.getByTestId('quantize-apply').click();
    await expect(page.getByTestId('quantize-apply')).toBeEnabled({ timeout: 60000 });
    await page.getByRole('button', { name: 'Save project', exact: true }).focus();
    await page.keyboard.press('Control+z');
    await page.getByRole('button', { name: 'Palette', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Palette', exact: true });
    await menu.getByRole('checkbox', { name: 'SUNLU PLA Classic', exact: true }).check();
    await menu.getByRole('checkbox', { name: 'ELEGOO PLA (community RFID)', exact: true }).check();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Select top colors', exact: true }).click();
    await page.getByRole('button', { name: 'Compare nozzle sizes', exact: true }).click();
    const nozzle = page.getByRole('dialog', { name: 'Nozzle and size preview', exact: true });
    await nozzle.getByRole('checkbox', { name: 'Link dimensions', exact: true }).uncheck();
    await nozzle
        .getByRole('region', { name: 'Comparison 1', exact: true })
        .getByLabel('Print width (mm)', { exact: true })
        .fill('123');
    await nozzle
        .getByRole('region', { name: 'Comparison 2', exact: true })
        .getByLabel('Print width (mm)', { exact: true })
        .fill('87');
    await nozzle.getByRole('checkbox', { name: 'Patch vulnerable regions', exact: true }).check();
    await nozzle.getByRole('button', { name: 'Close comparison', exact: true }).click();
    // Commit an adjustment via the real slider, including its blur commit.
    const adjustButton = page.getByRole('button', { name: /^Adjustments Fine-tune/ });
    if (
        (await adjustButton.count()) &&
        (await adjustButton.getAttribute('data-state')) === 'closed'
    )
        await adjustButton.click();
    const beforeAdjustment = await canvasHash(page);
    const contrast = page.getByRole('slider').nth(1);
    await contrast.focus();
    await contrast.press('ArrowRight');
    await contrast.press('ArrowRight');
    await contrast.press('Tab');
    await expect.poll(() => canvasHash(page)).not.toBe(beforeAdjustment);
    const visibleImage = await canvasHash(page);
    await page.getByRole('button', { name: '3D', exact: true }).click();
    const layer = page.getByTestId('print-layer-height');
    await layer.waitFor({ timeout: 30000 });
    for (const [id, value] of [
        ['print-layer-height', '0.16'],
        ['print-first-layer-height', '0.24'],
        ['print-pixel-size', '0.22'],
    ]) {
        await page.getByTestId(id).fill(value);
        await page.getByTestId(id).press('Tab');
    }
    const colorSlider = page
        .locator('[aria-label^="Color swatch"]')
        .first()
        .locator('..')
        .getByRole('slider');
    await colorSlider.focus();
    await colorSlider.press('ArrowRight');
    await colorSlider.press('ArrowRight');
    await colorSlider.press('Tab');
    await page.getByLabel('Project name', { exact: true }).fill('Roundtrip Session');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    const download = await downloadPromise;
    const file = readFileSync(await download.path());
    writeFileSync(artifactPath('project-roundtrip-tested.kromacut'), file);
    const zip = await JSZip.loadAsync(file),
        manifest = JSON.parse(await zip.file('project.json').async('string'));
    assert.equal(manifest.state.name, 'Roundtrip Session');
    assert.equal(manifest.state.quantize.palettes.length, 2);
    assert.equal(manifest.state.quantize.finalColors, 2);
    assert.equal(manifest.state.adjustments.contrast, 2);
    assert.equal(manifest.state.threeD.layerHeight, 0.16);
    assert.equal(manifest.state.threeD.slicerFirstLayerHeight, 0.24);
    assert.equal(manifest.state.threeD.pixelSize, 0.22);
    assert(manifest.state.threeD.colorSliceHeights.some((h) => h > 0.24));
    assert.equal(manifest.history.future.length, 1);
    assert.equal(manifest.state.nozzle.scenarios[1].width, 87);
    assert(Object.keys(manifest.state.recommendations.chosen).length > 0);
    const restore = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
        acceptDownloads: true,
    });
    const fresh = await restore.newPage();
    await fresh.goto(appUrl);
    await fresh
        .getByTestId('project-file-input')
        .setInputFiles({
            name: 'Roundtrip Session.kromacut',
            mimeType: 'application/zip',
            buffer: file,
        });
    const confirm = fresh.getByRole('dialog', { name: 'Open project', exact: true });
    await confirm.getByRole('button', { name: 'Open project', exact: true }).click();
    await expect(confirm).not.toBeVisible();
    await expect(fresh.getByRole('button', { name: '3D', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
    );
    await expect(fresh.getByTestId('print-layer-height')).toHaveValue('0.16');
    await expect(fresh.getByTestId('print-pixel-size')).toHaveValue('0.22');
    const savedAgainPromise = fresh.waitForEvent('download');
    await fresh.getByRole('button', { name: 'Save project', exact: true }).click();
    const savedAgain = readFileSync(await (await savedAgainPromise).path());
    const again = JSON.parse(
        await (await JSZip.loadAsync(savedAgain)).file('project.json').async('string')
    );
    assert.deepEqual(again.state.threeD.colorSliceHeights, manifest.state.threeD.colorSliceHeights);
    assert.deepEqual(again.state.threeD.colorOrder, manifest.state.threeD.colorOrder);
    assert.deepEqual(again.history, manifest.history);
    page = fresh;
    await fresh.getByRole('button', { name: '2D', exact: true }).click();
    await expect.poll(() => canvasHash(fresh)).toBe(visibleImage);
    await expect(fresh.getByRole('button', { name: 'Palette', exact: true })).toHaveText(
        'Selected palettes: 2'
    );
    await fresh.getByRole('button', { name: 'Compare nozzle sizes', exact: true }).click();
    const reopened = fresh.getByRole('dialog', { name: 'Nozzle and size preview', exact: true });
    await expect(
        reopened.getByRole('checkbox', { name: 'Patch vulnerable regions', exact: true })
    ).toBeChecked();
    await expect(
        reopened
            .getByRole('region', { name: 'Comparison 1', exact: true })
            .getByLabel('Print width (mm)', { exact: true })
    ).toHaveValue('123');
    await reopened.getByRole('button', { name: 'Close comparison', exact: true }).click();
    await fresh.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await expect.poll(() => canvasHash(fresh)).not.toBe(visibleImage);
    const historyImage = await canvasHash(fresh);
    await fresh.getByRole('button', { name: 'Save project', exact: true }).focus();
    await fresh.keyboard.press('Control+Shift+z');
    await expect.poll(() => canvasHash(fresh)).not.toBe(historyImage);
    await fresh.keyboard.press('Control+z');
    await expect.poll(() => canvasHash(fresh)).toBe(historyImage);
    const before = await canvasHash(fresh);
    await fresh
        .getByTestId('project-file-input')
        .setInputFiles({
            name: 'bad.kromacut',
            mimeType: 'application/zip',
            buffer: Buffer.from('not a project'),
        });
    await expect(fresh.getByRole('status').filter({ hasText: 'Project could not' })).toBeVisible();
    assert.equal(await canvasHash(fresh), before);
    await fresh.screenshot({ path: artifactPath('project-session-tested.png') });
    console.log(
        'PASS: native-format download; embedded image and undo/redo history; committed adjustments; two palette snapshots; live filament choices; nozzle settings; unsaved manual 3D heights/settings; fresh-context reopen with exact preview; bad file preserves active session.'
    );
} catch (error) {
    if (page) await page.screenshot({ path: artifactPath('project-test-failure.png') });
    throw error;
} finally {
    await browser.close();
}
