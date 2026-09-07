import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import type { StackMatrixCalibrationV1 } from '../../src/lib/appearanceProfile';

const twoColorProfile = fileURLToPath(
    new URL('../assets/filament-profiles/2_Colors.kapp', import.meta.url)
);

async function openStackMatrix(page: Page) {
    await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: 'Stack Matrix', exact: true }).click();
    return dialog;
}

async function expectNewMatrixHeights(
    dialog: Locator,
    layerHeight: number,
    firstLayerHeight: number
) {
    await expect(
        dialog.getByRole('heading', { name: 'New Stack Matrix', exact: true })
    ).toBeVisible();
    await expect(dialog.getByText('Layer height', { exact: true }).locator('..')).toContainText(
        `${layerHeight.toFixed(2)} mm`
    );
    await expect(
        dialog.getByText('First layer height', { exact: true }).locator('..')
    ).toContainText(`${firstLayerHeight.toFixed(2)} mm`);
    await expect(
        dialog.getByText(new RegExp(`/ ${layerHeight.toFixed(2)} mm layers / face-up$`))
    ).toBeVisible();
}

async function readMatrixDownload(download: Download) {
    expect(download.suggestedFilename()).toMatch(/^kromacut-stack-matrix-\d+\.3mf$/);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const zip = await JSZip.loadAsync(await readFile(downloadPath!));
    const record = JSON.parse(
        await zip.file('Metadata/kromacut-stack-matrix.json')!.async('string')
    ) as StackMatrixCalibrationV1;
    const settings = JSON.parse(
        await zip.file('Metadata/project_settings.config')!.async('string')
    );
    const model = await zip.file('3D/3dmodel.model')!.async('string');
    // Each export creates fresh production UUIDs. Geometry, material mapping,
    // and all other model XML must remain unchanged for a frozen matrix.
    const modelGeometryHash = createHash('sha256')
        .update(model.replace(/ p:UUID="[^"]*"/g, ''))
        .digest('hex');
    return { record, settings, modelGeometryHash };
}

function expectExportHeights(
    exported: Awaited<ReturnType<typeof readMatrixDownload>>,
    layerHeight: number,
    firstLayerHeight: number
) {
    expect(exported.record.process.layerHeight).toBe(layerHeight);
    expect(exported.record.process.firstLayerHeight).toBe(firstLayerHeight);
    expect(exported.settings.layer_height).toBe(String(layerHeight));
    expect(exported.settings.initial_layer_print_height).toBe(String(firstLayerHeight));
}

test('@smoke @matrix New Stack Matrices use live print heights while saved matrices keep their frozen settings', async ({
    page,
}, testInfo) => {
    testInfo.setTimeout(3 * 60 * 1000);
    // The legacy calibration default is intentionally different from current
    // print settings. Seed only once so a later reload exercises persistence.
    await page.addInitScript(() => {
        if (sessionStorage.getItem('stack-matrix-settings-seeded')) return;
        localStorage.clear();
        localStorage.setItem(
            'kromacut.autopaint.v1',
            JSON.stringify({ schemaVersion: 2, filaments: [], calibrationLayerHeight: 0.12 })
        );
        localStorage.setItem(
            'kromacut:3d-print-settings',
            JSON.stringify({ layerHeight: 0.08, slicerFirstLayerHeight: 0.16, pixelSize: 0.1 })
        );
        sessionStorage.setItem('stack-matrix-settings-seeded', '1');
    });
    await page.goto('/app');
    await expect(page.getByTestId('image-file-input')).toBeAttached();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await page.getByTestId('autopaint-profile-import-input').setInputFiles(twoColorProfile);
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible();
    await expect(page.getByTestId('print-layer-height')).toHaveValue('0.08');
    await expect(page.getByTestId('print-first-layer-height')).toHaveValue('0.16');

    const dialog = await openStackMatrix(page);
    await expectNewMatrixHeights(dialog, 0.08, 0.16);
    const firstDownloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Create and download 3MF', exact: true }).click();
    const first = await readMatrixDownload(await firstDownloadPromise);
    expectExportHeights(first, 0.08, 0.16);
    await expect(dialog.getByRole('button', { name: 'Download 3MF', exact: true })).toBeEnabled();

    await dialog.getByRole('button', { name: 'Close calibration dialog', exact: true }).click();
    await page.getByTestId('print-layer-height').fill('0.10');
    await page.getByTestId('print-layer-height').blur();
    await page.getByTestId('print-first-layer-height').fill('0.20');
    await page.getByTestId('print-first-layer-height').blur();

    // Reopening uses current settings immediately, without a page reload.
    await openStackMatrix(page);
    await dialog.getByRole('button', { name: 'New matrix', exact: true }).click();
    await expectNewMatrixHeights(dialog, 0.1, 0.2);
    await dialog.getByRole('button', { name: 'Back to saved matrices', exact: true }).click();
    const savedDownloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download 3MF', exact: true }).click();
    const saved = await readMatrixDownload(await savedDownloadPromise);
    expectExportHeights(saved, 0.08, 0.16);
    expect(saved.record.id).toBe(first.record.id);
    expect(saved.record.process).toEqual(first.record.process);
    expect(saved.record.samples).toEqual(first.record.samples);
    expect(saved.modelGeometryHash).toBe(first.modelGeometryHash);

    await dialog.getByRole('button', { name: 'New matrix', exact: true }).click();
    await expectNewMatrixHeights(dialog, 0.1, 0.2);
    const secondDownloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Create and download 3MF', exact: true }).click();
    const second = await readMatrixDownload(await secondDownloadPromise);
    expectExportHeights(second, 0.1, 0.2);
    expect(second.record.id).not.toBe(first.record.id);

    await page.reload();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await openStackMatrix(page);
    await dialog.getByRole('button', { name: 'New matrix', exact: true }).click();
    await expectNewMatrixHeights(dialog, 0.1, 0.2);
    // Retaining the old HD-wedge preference must not leak it back into Matrix.
    expect(
        await page.evaluate(
            () =>
                JSON.parse(localStorage.getItem('kromacut.autopaint.v1') ?? '{}')
                    .calibrationLayerHeight
        )
    ).toBe(0.12);
});
