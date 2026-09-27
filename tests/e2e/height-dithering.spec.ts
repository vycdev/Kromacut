import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

type Build = {
    status: string;
    triangleCount: number;
    dimensions: { width: number; height: number; depth: number };
    settings: { heightDithering: boolean; enhancedColorMatch: boolean };
    layerMetrics: Array<{ activePixelCount: number }>;
};
declare global {
    interface Window {
        __HEIGHT_DITHER_TEST?: { buildHistory: Build[]; lastBuild?: Build };
    }
}

async function setSwitch(page: Page, id: string, enabled: boolean) {
    const control = page.getByTestId(id);
    await expect(control).toBeEnabled();
    if (((await control.getAttribute('data-state')) === 'checked') !== enabled)
        await control.click();
    await expect(control).toHaveAttribute('data-state', enabled ? 'checked' : 'unchecked');
}

async function rebuild(page: Page, enabled: boolean) {
    await setSwitch(page, 'autopaint-height-dithering', enabled);
    const count = await page.evaluate(() => window.__HEIGHT_DITHER_TEST!.buildHistory.length);
    await expect(page.getByTestId('build-3d-model')).toBeEnabled();
    await page.getByTestId('build-3d-model').click();
    await page.waitForFunction((n) => window.__HEIGHT_DITHER_TEST!.buildHistory.length > n, count);
    const build = await page.evaluate(() => window.__HEIGHT_DITHER_TEST!.lastBuild!);
    expect(build.status).toBe('complete');
    expect(build.settings).toMatchObject({ heightDithering: enabled, enhancedColorMatch: true });
    return build;
}

async function download(page: Page, format: 'stl' | '3mf') {
    const item = page.getByTestId(`download-${format}`);
    if (!(await item.isVisible())) await page.getByTestId('download-3d-model').click();
    await expect(item).toBeVisible();
    const pending = page.waitForEvent('download');
    await item.click();
    const file = await pending;
    return readFile((await file.path())!);
}

async function geometry(page: Page) {
    const stl = await download(page, 'stl');
    expect(stl.length).toBe(84 + stl.readUInt32LE(80) * 50);
    const zip = await JSZip.loadAsync(await download(page, '3mf'));
    const model = await zip.file('3D/3dmodel.model')!.async('string');
    return {
        stl: stl.subarray(80),
        meshes: model.match(/<mesh>[\s\S]*?<\/mesh>/g),
        materials: model.match(/<basematerials\b[\s\S]*?<\/basematerials>/g),
    };
}

for (const smooth of [false, true]) {
    test(`@smoke height dithering changes rebuilt preview and STL/3MF with ${smooth ? 'smooth' : 'greedy'} meshing`, async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.addInitScript((smoothMeshing) => {
            localStorage.clear();
            localStorage.setItem(
                'kromacut.autopaint.v1',
                JSON.stringify({
                    schemaVersion: 2,
                    filaments: [],
                    paintMode: 'manual',
                    enhancedColorMatch: true,
                    heightDithering: false,
                    preserveSeparation: false,
                    ditherLineWidth: 0.2,
                    optimizerAlgorithm: 'fast',
                    optimizerSeed: 42,
                })
            );
            localStorage.setItem(
                'kromacut:3d-print-settings',
                JSON.stringify({
                    pixelSize: 0.2,
                    layerHeight: 0.08,
                    slicerFirstLayerHeight: 0.16,
                    smoothMeshing,
                })
            );
            const hook = { buildHistory: [] };
            Object.assign(window, { __KROMACUT_E2E: hook, __HEIGHT_DITHER_TEST: hook });
        }, smooth);
        await page.goto('/app');
        await expect(page.getByTestId('image-file-input')).toBeAttached();
        const png = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 96;
            const ctx = canvas.getContext('2d')!;
            [0, 32, 64, 96, 128, 160, 192, 224].forEach((v, i) => {
                ctx.fillStyle = `rgb(${v},${v},${v})`;
                ctx.fillRect(i * 16, 0, 16, 96);
            });
            return canvas.toDataURL('image/png').split(',')[1];
        });
        await page.getByTestId('image-file-input').setInputFiles({
            name: 'height-dithering.png',
            mimeType: 'image/png',
            buffer: Buffer.from(png, 'base64'),
        });
        await page.getByRole('button', { name: '3D', exact: true }).click();
        await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
        await page
            .getByTestId('autopaint-profile-import-input')
            .setInputFiles('tests/assets/filament-profiles/2_Colors.kapp');
        await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible();
        await setSwitch(page, 'autopaint-enhanced-color-match', true);
        // Let the debounced profile calculation begin before waiting for its idle state.
        await page.waitForTimeout(500);
        await expect(page.getByTestId('build-3d-model')).toBeEnabled();
        const plain = await rebuild(page, false);
        const plainGeometry = await geometry(page);
        expect(plainGeometry.meshes?.length).toBeGreaterThan(0);
        expect(plainGeometry.materials?.length).toBeGreaterThan(0);
        const dithered = await rebuild(page, true);
        const ditheredGeometry = await geometry(page);
        expect(dithered.triangleCount).toBeGreaterThan(plain.triangleCount);
        expect(dithered.layerMetrics.map((l) => l.activePixelCount)).not.toEqual(
            plain.layerMetrics.map((l) => l.activePixelCount)
        );
        expect(ditheredGeometry.stl.equals(plainGeometry.stl)).toBe(false);
        expect(ditheredGeometry.meshes).not.toEqual(plainGeometry.meshes);
        expect(ditheredGeometry.materials).toEqual(plainGeometry.materials);
        expect(dithered.dimensions).toEqual(plain.dimensions);
        await rebuild(page, false);
        await rebuild(page, true);
        expect((await geometry(page)).stl).toEqual(ditheredGeometry.stl);
        const width = page.getByTestId('print-effective-line-width');
        await width.fill('0.4');
        await width.blur();
        const wider = await rebuild(page, true);
        expect(wider.triangleCount).toBeLessThan(dithered.triangleCount);
        expect(wider.triangleCount).toBeGreaterThan(plain.triangleCount);
        const widerGeometry = await geometry(page);
        expect(widerGeometry.stl.equals(ditheredGeometry.stl)).toBe(false);
        expect(widerGeometry.meshes).not.toEqual(ditheredGeometry.meshes);
        await rebuild(page, false);
        const restored = await geometry(page);
        expect(restored.stl).toEqual(plainGeometry.stl);
        expect(restored.meshes).toEqual(plainGeometry.meshes);
        expect(errors).toEqual([]);
    });
}
