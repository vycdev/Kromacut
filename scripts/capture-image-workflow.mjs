// Capture real UI screenshots for review. Supply an image you may publish.
import { appUrl, artifactPath, launchBrowser } from './custom-ui-helpers.mjs';
import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const reference = process.env.KROMACUT_REFERENCE_IMAGE;
if (!reference) throw new Error('Set KROMACUT_REFERENCE_IMAGE to your reference image.');
const browser = await launchBrowser();
let page;
try {
    page = await browser.newPage({
        viewport: { width: 1500, height: 1150 },
        acceptDownloads: true,
    });
    page.on('console', (message) => {
        if (message.type() === 'error') console.error(message.text());
    });
    page.on('pageerror', (error) => console.error(error));
    await page.goto(appUrl);
    await page.getByTestId('image-file-input').setInputFiles(reference);
    await page.getByLabel('Project name', { exact: true }).fill('FROM THE STAGE');
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Number of colors', exact: true }).fill('3');
    for (const [n, color] of [
        [3, '#f4e6b8'],
        [2, '#af302e'],
        [1, '#101010'],
    ])
        await page.getByLabel(`Color ${n}`, { exact: true }).fill(color);
    await page.getByRole('spinbutton', { name: 'Threshold 1 value', exact: true }).fill('48');
    await page.getByRole('spinbutton', { name: 'Threshold 2 value', exact: true }).fill('144');
    await expect(page.getByTestId('threshold-preview')).toHaveJSProperty('width', 1000);
    await page.waitForTimeout(300);
    await page.screenshot({ path: artifactPath('01-live-thresholds.png') });
    await page.getByRole('button', { name: 'Apply thresholds', exact: true }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    await page.locator('#final-colors').fill('3');
    await page.locator('#final-colors').press('Tab');
    await page.getByRole('button', { name: 'Palette', exact: true }).click();
    const palettes = page.getByRole('dialog', { name: 'Palette', exact: true });
    await palettes.getByRole('checkbox', { name: 'SUNLU PLA Classic', exact: true }).check();
    await palettes
        .getByRole('checkbox', { name: 'ELEGOO PLA (community RFID)', exact: true })
        .check();
    await palettes
        .getByRole('checkbox', { name: 'SUNLU PLA Classic', exact: true })
        .scrollIntoViewIfNeeded();
    await page.screenshot({ path: artifactPath('02-multiple-palettes.png') });
    await page.keyboard.press('Escape');
    const panel = page.getByTestId('filament-recommender');
    await panel.getByRole('button', { name: 'Select top colors', exact: true }).click();
    await panel.getByRole('button', { name: 'Select #AF302E', exact: true }).click();
    await expect(page.getByTestId('filament-match-row').getByRole('radio')).toHaveCount(10);
    await page.screenshot({ path: artifactPath('03-filament-matches.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Compare nozzle sizes', exact: true }).click();
    const nozzle = page.getByRole('dialog', { name: 'Nozzle and size preview', exact: true });
    await nozzle
        .getByRole('region', { name: 'Comparison 1', exact: true })
        .getByLabel('Print width (mm)', { exact: true })
        .fill('100');
    await expect(nozzle.getByTestId('nozzle-result').first()).toContainText('%', {
        timeout: 60000,
    });
    await expect(nozzle.getByTestId('nozzle-result').last()).toContainText('%', { timeout: 60000 });
    await page.screenshot({ path: artifactPath('04-nozzle-appearance.png') });
    await nozzle.getByLabel('Preview view', { exact: true }).selectOption('risk');
    await page.screenshot({ path: artifactPath('05-vulnerability-legend.png') });
    await nozzle.getByRole('checkbox', { name: 'Patch vulnerable regions', exact: true }).check();
    await expect(nozzle.getByTestId('nozzle-patch-result').first()).toContainText('Merged:', {
        timeout: 60000,
    });
    await expect(nozzle.getByTestId('nozzle-patch-result').last()).toContainText('Merged:', {
        timeout: 60000,
    });
    await page.screenshot({ path: artifactPath('06-patched-regions.png') });
    await nozzle.getByRole('button', { name: 'Close comparison', exact: true }).click();
    const hash = async (p) =>
        createHash('sha256')
            .update(await p.getByTestId('main-image-preview').evaluate((c) => c.toDataURL()))
            .digest('hex');
    const before = await hash(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    const bytes = readFileSync(await (await download).path());
    const fresh = await browser.newPage({ viewport: { width: 1500, height: 1150 } });
    await fresh.goto(appUrl);
    await fresh.getByTestId('project-file-input').setInputFiles({
        name: 'FROM THE STAGE.kromacut',
        mimeType: 'application/zip',
        buffer: bytes,
    });
    const confirm = fresh.getByRole('dialog', { name: 'Open project', exact: true });
    await confirm.getByRole('button', { name: 'Open project', exact: true }).click();
    await expect(confirm).not.toBeVisible();
    await expect.poll(() => hash(fresh), { timeout: 30000 }).toBe(before);
    await fresh.getByRole('button', { name: /^Adjustments Fine-tune/ }).click();
    await fresh.locator('#final-colors').scrollIntoViewIfNeeded();
    await fresh.screenshot({ path: artifactPath('07-restored-project.png') });
    console.log(
        `Captured seven feature screenshots; ${bytes.length} byte portable project reopened with identical visible pixels.`
    );
} catch (error) {
    if (page) await page.screenshot({ path: artifactPath('capture-failure.png') });
    throw error;
} finally {
    await browser.close();
}
