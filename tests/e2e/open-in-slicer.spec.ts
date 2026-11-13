import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { fakeDesktopBeforeLoad, fakeDesktopCalls } from './helpers/fakeDesktop';

type Outcome = 'success' | 'failure';
type SlicerTestWindow = Window & {
    slicerTest: { outcome: Outcome; bytes: number[][]; headers: Record<string, string>[] };
    __KROMACUT_E2E: { buildHistory: unknown[] };
};

const SLICER_FAILED = 'Could not open the 3MF in your slicer. Use Download 3MF to save it instead.';

async function buildModel(page: Page) {
    await page.addInitScript(() => {
        localStorage.clear();
        Object.assign(window, { __KROMACUT_E2E: { buildHistory: [] } });
        localStorage.setItem(
            'kromacut:3d-print-settings',
            JSON.stringify({
                pixelSize: 0.4,
                layerHeight: 0.12,
                slicerFirstLayerHeight: 0.2,
                smoothMeshingStrength: 'none',
            })
        );
    });
    await page.goto('/app');
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 8;
        const ctx = canvas.getContext('2d')!;
        ['#000000', '#808080', '#ffffff'].forEach((color, i) => {
            ctx.fillStyle = color;
            ctx.fillRect(i * 8, 0, 8, 8);
        });
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'slicer-handoff.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByTestId('build-3d-model').click();
    await page.waitForFunction(
        () => (window as unknown as SlicerTestWindow).__KROMACUT_E2E.buildHistory.length > 0
    );
    await expect(page.getByTestId('download-3d-model')).toBeEnabled();
}

test('@smoke the browser download menu does not offer Open in Slicer', async ({ page }) => {
    await buildModel(page);
    await page.getByTestId('download-3d-model').click();
    await expect(page.getByTestId('download-3mf')).toBeVisible();
    await expect(page.getByTestId('open-3mf-in-slicer')).toHaveCount(0);
});

test('@smoke desktop Open in Slicer hands the built 3MF to the native app', async ({ page }) => {
    const errors: string[] = [];
    const dialogs: string[] = [];
    const downloads: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => {
        dialogs.push(dialog.message());
        void dialog.accept();
    });
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    await fakeDesktopBeforeLoad(page, (desktop) => {
        const host = window as unknown as SlicerTestWindow;
        host.slicerTest = { outcome: 'success', bytes: [], headers: [] };
        desktop.handle('open_model_in_slicer', (model: Uint8Array, _command, options) => {
            const state = host.slicerTest;
            state.bytes.push(Array.from(model));
            state.headers.push((options.headers ?? {}) as Record<string, string>);
            if (state.outcome === 'failure') throw new Error('Mock launch failure');
            return '/cache/slicer-handoff/model.3mf';
        });
    });
    await buildModel(page);

    const state = () => page.evaluate(() => (window as unknown as SlicerTestWindow).slicerTest);
    const openInSlicer = page.getByTestId('open-3mf-in-slicer');
    await page.getByTestId('download-3d-model').click();
    await expect(openInSlicer).toHaveText('Open in Slicer');
    await openInSlicer.click();
    await expect.poll(async () => (await state()).bytes.length).toBe(1);
    await expect(page.getByTestId('download-3d-model')).toBeEnabled();

    const handoff = await state();
    expect(Object.keys(handoff.headers[0])).toEqual(['X-Kromacut-File-Name']);
    expect(handoff.headers[0]['X-Kromacut-File-Name']).toMatch(/^kromacut-\d{4}-\d{2}-\d{2}\.3mf$/);
    const zip = await JSZip.loadAsync(Uint8Array.from(handoff.bytes[0]));
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(await zip.file('3D/3dmodel.model')!.async('string')).toContain('<mesh>');
    expect(dialogs).toEqual([]);

    await page.evaluate(() => {
        (window as unknown as SlicerTestWindow).slicerTest.outcome = 'failure';
    });
    if (!(await openInSlicer.isVisible())) await page.getByTestId('download-3d-model').click();
    await openInSlicer.click();
    await expect.poll(() => dialogs).toEqual([SLICER_FAILED]);
    await expect(page.getByTestId('download-3d-model')).toBeEnabled();
    expect((await state()).bytes).toHaveLength(2);

    const calls = await fakeDesktopCalls(page);
    expect(calls.filter((call) => call === 'open_model_in_slicer')).toHaveLength(2);
    expect(calls).not.toContain('plugin:dialog|save');
    expect(downloads).toEqual([]);
    expect(errors).toEqual([]);
});
