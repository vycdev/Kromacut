import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const assetRoot = path.join(repoRoot, 'tests', 'assets');

test('Palette Proof stays usable, persists results, and downloads its frozen 3MF', async ({
    page,
}, testInfo) => {
    testInfo.setTimeout(3 * 60 * 1000);
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');
    await page
        .getByTestId('image-file-input')
        .setInputFiles(path.join(assetRoot, '1024x1024p.png'));
    await expect(page.locator('body')).toContainText('Image: 1024', { timeout: 60_000 });

    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint' }).click();
    await page
        .getByTestId('autopaint-profile-import-input')
        .setInputFiles(path.join(assetRoot, 'filament-profiles', '4_Colors.kapp'));
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('build-3d-model')).toBeEnabled({ timeout: 90_000 });

    await page.getByRole('button', { name: 'Calibrate Filaments' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: 'Palette Proof' }).click();
    const panel = dialog.getByTestId('palette-proof-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByLabel('Target 1', { exact: false })).toBeVisible();
    await expect(page.getByLabel('A1', { exact: true })).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('palette-proof-desktop.png') });

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-palette-proof').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^kromacut-palette-proof-.+\.3mf$/);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const zip = await JSZip.loadAsync(await readFile(downloadPath!));
    expect(zip.file('Metadata/palette-proof.json')).not.toBeNull();
    expect(zip.file('Metadata/palette-proof-instructions.txt')).not.toBeNull();

    await dialog.getByRole('tab', { name: /Results/ }).click();
    await expect(dialog.getByText('0/8 targets answered')).toBeVisible();
    await dialog.getByRole('button', { name: 'A1', exact: true }).click();
    await dialog.getByRole('button', { name: 'B1', exact: true }).click();
    for (let column = 2; column <= 8; column++) {
        await dialog
            .getByTestId(`palette-proof-result-column-${column}`)
            .getByRole('button', { name: 'None', exact: true })
            .click();
    }
    await expect(dialog.getByText('8/8 targets answered')).toBeVisible();
    await dialog.getByRole('button', { name: 'Complete results', exact: true }).click();
    await expect(dialog.getByText('Complete', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Edit results', exact: true })).toBeVisible();

    const storedAppearance = await page.evaluate(() => {
        const profiles = JSON.parse(localStorage.getItem('kromacut.autopaint.profiles') ?? '[]');
        return profiles[0]?.appearance;
    });
    expect(storedAppearance.schemaVersion).toBe(1);
    expect(storedAppearance.proofs).toHaveLength(1);
    expect(storedAppearance.targetJudgments).toHaveLength(8);
    expect(storedAppearance.targetJudgments[0].closestCellIds).toEqual(['A1', 'B1']);
    expect(storedAppearance.viewingSessions[0].status).toBe('complete');

    await page.setViewportSize({ width: 390, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    const bounds = await panel.boundingBox();
    const downloadBounds = await dialog.getByTestId('download-palette-proof').boundingBox();
    expect(bounds).not.toBeNull();
    expect(downloadBounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(downloadBounds!.x).toBeGreaterThanOrEqual(bounds!.x);
    expect(downloadBounds!.x + downloadBounds!.width).toBeLessThanOrEqual(
        bounds!.x + bounds!.width
    );
    const dialogZIndex = await dialog.evaluate((element) =>
        Number.parseInt(getComputedStyle(element).zIndex, 10)
    );
    const previewToolbarZIndex = await page
        .getByTestId('preview-render-mode-trigger')
        .evaluate((element) => Number.parseInt(getComputedStyle(element.parentElement!).zIndex, 10));
    expect(dialogZIndex).toBeGreaterThan(previewToolbarZIndex);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('palette-proof-results-mobile.png') });
});
