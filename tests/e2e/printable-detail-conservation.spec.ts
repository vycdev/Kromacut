import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const twoColorProfile = fileURLToPath(
    new URL('../assets/filament-profiles/2_Colors.kapp', import.meta.url)
);

async function openFixture(page: Page, speck: boolean) {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem(
            'kromacut.autopaint.v1',
            JSON.stringify({
                schemaVersion: 2,
                filaments: [],
                paintMode: 'manual',
                ditherLineWidth: 0.21,
                optimizerAlgorithm: 'fast',
                optimizerSeed: 42,
            })
        );
        localStorage.setItem(
            'kromacut:3d-print-settings',
            JSON.stringify({
                pixelSize: 0.2,
                layerHeight: 0.12,
                slicerFirstLayerHeight: 0.2,
                smoothMeshing: false,
            })
        );
        (window as Window & { __KROMACUT_E2E?: unknown }).__KROMACUT_E2E = { buildHistory: [] };
    });
    await page.goto('/app');
    await expect(page.getByTestId('image-file-input')).toBeAttached();
    const png = await page.evaluate((includeSpeck) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#000000';
        ctx.fillRect(8, 0, 2, 64); // 0.40 mm-wide stripe at 0.21 mm nominal line width.
        for (let y = 0; y < 64; y++) ctx.fillRect(30 + Math.floor(y / 2), y, 1, 1);
        ctx.fillRect(20, 40, 1, 1); // Same color as the connected linework: never omit it globally.
        if (includeSpeck) {
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(16, 16, 1, 1);
        }
        return canvas.toDataURL('image/png').split(',')[1];
    }, speck);
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'printable-detail-fixture.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await page.getByTestId('autopaint-profile-import-input').setInputFiles(twoColorProfile);
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible();
    await expect(page.getByTestId('printable-detail-summary')).toBeVisible();
    return page.getByTestId('autopaint-omit-at-risk-pixels');
}

async function resultPixels(page: Page) {
    await page.getByRole('button', { name: 'Open preview', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: 'Result', exact: true }).click();
    const canvas = dialog.getByTestId('printable-detail-canvas');
    await expect
        .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width))
        .toBe(64);
    const pixels = await canvas.evaluate((element: HTMLCanvasElement) =>
        Array.from(element.getContext('2d')!.getImageData(0, 0, 64, 64).data)
    );
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    return pixels;
}

async function exportStl(page: Page) {
    const previous = await page.evaluate(
        () =>
            (
                window as Window & {
                    __KROMACUT_E2E?: { buildHistory?: unknown[] };
                }
            ).__KROMACUT_E2E?.buildHistory?.length ?? 0
    );
    const build = page.getByTestId('build-3d-model');
    await expect(build).toBeEnabled();
    await build.click();
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    (
                        window as Window & {
                            __KROMACUT_E2E?: { buildHistory?: unknown[] };
                        }
                    ).__KROMACUT_E2E?.buildHistory?.length ?? 0
            )
        )
        .toBeGreaterThan(previous);
    await page.getByTestId('download-3d-model').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-stl').click();
    const download = await downloadPromise;
    const bytes = await readFile((await download.path())!);
    expect(bytes.readUInt32LE(80)).toBeGreaterThan(0);
    expect(bytes.length).toBe(84 + bytes.readUInt32LE(80) * 50);
    return bytes.subarray(80);
}

test('@smoke printable-detail omission preserves linework in matching, preview, and exported geometry', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const omission = await openFixture(page, false);
    const before = await resultPixels(page);
    expect(before.slice((8 + 20 * 64) * 4, (8 + 20 * 64) * 4 + 4)).toEqual([0, 0, 0, 255]);
    const originalStl = await exportStl(page);
    await omission.click();
    await expect(page.getByTestId('printable-detail-summary')).toContainText('0 pixels omitted');
    expect(await resultPixels(page)).toEqual(before);
    expect(await exportStl(page)).toEqual(originalStl);
    // Even at a width that flags the linework, warnings must not erase it.
    await page.getByTestId('print-effective-line-width').fill('0.42');
    await page.getByTestId('print-effective-line-width').blur();
    await expect(page.getByTestId('printable-detail-summary')).toContainText('0 pixels omitted');
    expect(await resultPixels(page)).toEqual(before);
    expect(await exportStl(page)).toEqual(originalStl);
    expect(errors).toEqual([]);
});

test('@smoke isolated-speck cleanup reports real removals separately from preserved width warnings', async ({
    page,
}) => {
    const omission = await openFixture(page, true);
    await page.getByTestId('print-effective-line-width').fill('0.42');
    await page.getByTestId('print-effective-line-width').blur();
    const before = await resultPixels(page);
    const offset = (16 + 16 * 64) * 4;
    expect(before.slice(offset, offset + 4)).toEqual([255, 0, 0, 255]);
    await omission.click();
    await expect(page.getByTestId('printable-detail-summary')).toContainText('1 pixel omitted');
    const after = await resultPixels(page);
    expect(after.slice(offset, offset + 4)).toEqual([255, 255, 255, 255]);
    const expected = before.slice();
    expected.splice(offset, 4, 255, 255, 255, 255);
    expect(after).toEqual(expected);
    await omission.click();
    await expect(page.getByTestId('printable-detail-summary')).toContainText('cleanup off');
    expect(await resultPixels(page)).toEqual(before);
});
