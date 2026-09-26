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

test('@smoke calibration reopening cancels the previous dialog close reset', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByTestId('image-file-input')).toBeAttached();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await page.getByTestId('autopaint-profile-import-input').setInputFiles(twoColorProfile);
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible();
    const dialog = await openStackMatrix(page);
    await expect(dialog.getByRole('tab', { name: 'Stack Matrix', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
    );

    // Hold only the 300 ms close-reset timers. This exercises fast reopening
    // deterministically without depending on CI speed or delaying the test's clicks.
    await page.evaluate(() => {
        const originalSetTimeout = window.setTimeout.bind(window);
        const originalClearTimeout = window.clearTimeout.bind(window);
        const pending = new Map<number, () => void>();
        window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
            if (delay !== 300 || typeof handler !== 'function') {
                return originalSetTimeout(handler, delay, ...args);
            }
            const id = originalSetTimeout(() => {}, 60_000);
            pending.set(id, () => handler(...args));
            return id;
        }) as typeof window.setTimeout;
        window.clearTimeout = ((id?: number) => {
            if (id !== undefined) pending.delete(id);
            originalClearTimeout(id);
        }) as typeof window.clearTimeout;
        Object.assign(window, {
            pendingCloseResets: () => pending.size,
            flushCloseResets: () => {
                for (const [id, callback] of pending) {
                    originalClearTimeout(id);
                    pending.delete(id);
                    callback();
                }
            },
        });
    });
    await dialog.getByRole('button', { name: 'Close calibration dialog', exact: true }).click();
    expect(await page.evaluate(() => Reflect.get(window, 'pendingCloseResets')())).toBe(1);
    await openStackMatrix(page);
    await page.evaluate(() => Reflect.get(window, 'flushCloseResets')());
    await expect(dialog.getByRole('tab', { name: 'Stack Matrix', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
    );
    await expect(dialog.getByRole('heading', { name: 'Stack Matrix', exact: true })).toBeVisible();
});

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
    const maximumZ = Math.max(
        ...Array.from(model.matchAll(/<vertex\b[^>]*\bz="([^"]+)"/g), (match) => Number(match[1]))
    );
    return { record, settings, modelGeometryHash, maximumZ };
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
    expect(exported.record.foundationLayerThicknesses).toEqual([firstLayerHeight]);
    expect(exported.maximumZ).toBeCloseTo(
        firstLayerHeight + exported.record.stackLayerCount * layerHeight,
        6
    );
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

test('@matrix adaptive thickness, swap budget, and completed history survive the worker and saved-profile round trip', async ({
    page,
}, testInfo) => {
    testInfo.setTimeout(3 * 60 * 1000);
    await page.addInitScript(() => {
        if (sessionStorage.getItem('adaptive-matrix-seeded')) return;
        localStorage.clear();
        localStorage.setItem(
            'kromacut:3d-print-settings',
            JSON.stringify({
                layerHeight: 0.04,
                slicerFirstLayerHeight: 0.1,
                pixelSize: 0.1,
            })
        );
        sessionStorage.setItem('adaptive-matrix-seeded', '1');
    });
    await page.goto('/app');
    await expect(page.getByTestId('image-file-input')).toBeAttached();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await page.getByTestId('autopaint-profile-import-input').setInputFiles(twoColorProfile);
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible();
    const dialog = await openStackMatrix(page);
    const create = dialog.getByRole('button', { name: 'Create and download 3MF', exact: true });
    await dialog.getByLabel('Max color thickness (mm)', { exact: true }).fill('0.01');
    await expect(create).toBeDisabled();
    await dialog.getByLabel('Max color thickness (mm)', { exact: true }).fill('0.40');
    await expect(dialog.getByTestId('matrix-new-height-summary')).toHaveText(
        '0.10 mm foundation + 0.40 mm color region = 0.50 mm total / 11 print layers'
    );
    await dialog.getByLabel('Max color thickness (mm)', { exact: true }).fill('0.81');
    await expect(dialog.getByText(/Up to 20 color layers \(0\.80 mm\)/)).toBeVisible();
    await dialog.getByLabel('Maximum cells', { exact: true }).click();
    await page.getByRole('option', { name: '64 (8 × 8)', exact: true }).click();
    await dialog.getByLabel('Planned material-change budget', { exact: true }).click();
    await page.getByRole('option', { name: '80 changes', exact: true }).click();
    await page.screenshot({
        path: testInfo.outputPath('adaptive-matrix-plan.png'),
        fullPage: true,
    });
    const firstDownload = page.waitForEvent('download');
    await create.click();
    const first = await readMatrixDownload(await firstDownload);
    expectExportHeights(first, 0.04, 0.1);
    await expect(dialog.getByTestId('matrix-saved-height-summary')).toHaveText(
        '0.10 mm foundation + 0.80 mm color region = 0.90 mm total / 21 print layers'
    );
    expect(first.record.schemaVersion).toBe(2);
    expect(first.record.stackLayerCount).toBe(20);
    expect(first.record.planning?.maximumSwapCycles).toBe(80);
    expect(first.record.planning?.estimatedSwapCycles).toBeLessThanOrEqual(80);
    expect(first.record.planning?.compatibleHistoryCount).toBe(0);
    expect(first.record.planning?.unmeasuredSampleCount).toBe(first.record.samples.length);
    expect(first.record.samples.some((sample) => (sample.backingPaddingLayerCount ?? 0) > 0)).toBe(
        true
    );
    expect(first.record.samples.every((sample) => sample.stack.length === 20)).toBe(true);

    // Synthetic observations exist only in this isolated browser fixture. Verify
    // real persistence/worker plumbing without pretending these are physical reads.
    await page.evaluate((id) => {
        const key = 'kromacut.autopaint.profiles';
        const profiles = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
            appearance?: { stackMatrices?: StackMatrixCalibrationV1[] };
        }>;
        const record = profiles
            .flatMap((profile) => profile.appearance?.stackMatrices ?? [])
            .find((candidate) => candidate.id === id);
        if (!record) throw new Error('Exported adaptive matrix did not persist');
        record.status = 'complete';
        record.completedAt = new Date().toISOString();
        record.photoName = 'synthetic-browser-fixture.png';
        record.alignmentMethod = 'manual';
        record.alignmentConfidence = 1;
        record.alignmentVerified = true;
        for (const sample of record.samples) sample.measuredColor = sample.predictedColor;
        localStorage.setItem(key, JSON.stringify(profiles));
    }, first.record.id);
    await page.reload();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await openStackMatrix(page);
    await dialog.getByRole('button', { name: 'New matrix', exact: true }).click();
    await dialog.getByLabel('Max color thickness (mm)', { exact: true }).fill('0.81');
    await dialog.getByLabel('Maximum cells', { exact: true }).click();
    await page.getByRole('option', { name: '64 (8 × 8)', exact: true }).click();
    const secondDownload = page.waitForEvent('download');
    await create.click();
    const second = await readMatrixDownload(await secondDownload);
    expect(second.record.planning?.compatibleHistoryCount).toBe(1);
    const priorKeys = new Set(first.record.samples.map((sample) => sample.canonicalStackKey));
    const newKeys = second.record.samples.filter(
        (sample) => !priorKeys.has(sample.canonicalStackKey)
    );
    expect(newKeys.length).toBeGreaterThan(second.record.samples.length / 2);
    expect(second.record.planning?.unmeasuredSampleCount).toBe(newKeys.length);
});
