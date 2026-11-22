import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { inspectMeshIntegrity } from '../meshDiagnostics';

type Reads = { bitmaps: number; closes: number; images: number };
type Build = {
    status: string;
    meshCount: number;
    layerMetrics: Array<{ activePixelCount: number }>;
};
type Diagnostics = { lastBuild?: Build; buildHistory: Build[] };

async function prepare(page: Page, fallback = false) {
    await page.addInitScript((fallback) => {
        localStorage.clear();
        localStorage.setItem(
            'kromacut.autopaint.v1',
            JSON.stringify({ schemaVersion: 2, filaments: [], paintMode: 'manual' })
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
        Object.assign(window, {
            __KROMACUT_E2E: { buildHistory: [] },
            canonicalReads: { bitmaps: 0, closes: 0, images: 0 },
        });
        const reads = (window as unknown as { canonicalReads: Reads }).canonicalReads;
        const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
            ...src,
            set(value: string) {
                if (value.startsWith('blob:')) reads.images++;
                src.set!.call(this, value);
            },
        });
        if (fallback) {
            Object.defineProperty(window, 'createImageBitmap', { value: undefined });
        } else {
            const bitmap = window.createImageBitmap.bind(window);
            window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
                const image = await bitmap(...args);
                if (args[0] instanceof File) {
                    reads.bitmaps++;
                    const close = image.close.bind(image);
                    image.close = () => {
                        reads.closes++;
                        close();
                    };
                }
                return image;
            }) as typeof createImageBitmap;
        }
    }, fallback);
    await page.goto('/app');
}

const reads = (page: Page) =>
    page.evaluate(() => (window as unknown as { canonicalReads: Reads }).canonicalReads);

async function importFixture(page: Page, bits: number) {
    // Both halves are opaque, closely spaced Display P3 colors. The 8-bit RGB
    // values are (34,40,201) and (33,39,201); the 16-bit values are
    // (8716,10260,53230) and (8460,10004,53230). In Chromium, mixing bitmap
    // swatches with an <img> geometry decode assigns both halves to one layer.
    await page
        .getByTestId('image-file-input')
        .setInputFiles(
            fileURLToPath(new URL(`../assets/close-colors-display-p3-${bits}.png`, import.meta.url))
        );
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText('32x32');
    await expect(page.getByTestId('quantize-apply')).toBeEnabled();
}

async function build(page: Page) {
    const before = await page.evaluate(
        () =>
            (window as unknown as { __KROMACUT_E2E: Diagnostics }).__KROMACUT_E2E.buildHistory
                .length
    );
    await expect(page.getByTestId('build-3d-model')).toBeEnabled();
    await page.getByTestId('build-3d-model').click();
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    (
                        window as unknown as { __KROMACUT_E2E: Diagnostics }
                    ).__KROMACUT_E2E.buildHistory.filter((entry) => entry.status === 'complete')
                        .length
            )
        )
        .toBeGreaterThan(before);
    return page.evaluate(
        () => (window as unknown as { __KROMACUT_E2E: Diagnostics }).__KROMACUT_E2E.lastBuild!
    );
}

async function expectLayers(page: Page) {
    const result = await build(page);
    expect(result.meshCount).toBe(2);
    expect(result.layerMetrics.map((layer) => layer.activePixelCount)).toEqual([1024, 512]);
}

async function expectExportedLayers(page: Page) {
    await page.getByTestId('download-3d-model').click();
    const pending = page.waitForEvent('download');
    await page.getByTestId('download-3mf').click();
    const bytes = await readFile((await (await pending).path())!);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('3D/3dmodel.model')!.async('string');
    const meshes = xml.match(/<mesh>[\s\S]*?<\/mesh>/g)!;
    expect(meshes).toHaveLength(2);
    for (const [index, mesh] of meshes.entries()) {
        const positions = Float32Array.from(
            [...mesh.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\s*\/>/g)].flatMap(
                (vertex) => vertex.slice(1).map(Number)
            )
        );
        const indices = [
            ...mesh.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"[^>]*\/>/g),
        ].flatMap((triangle) => triangle.slice(1).map(Number));
        const report = inspectMeshIntegrity({ positions, indices });
        expect(report.isValid, JSON.stringify(report)).toBe(true);
        expect(report.signedVolume).toBeCloseTo(
            (index === 0 ? 1024 : 512) * 0.2 * 0.2 * (index === 0 ? 0.2 : 0.12),
            4
        );
    }
}

for (const bits of [8, 16]) {
    for (const fallback of [false, true]) {
        test(`@smoke shared ${bits}-bit profiled pixels preserve manual 3D layers and exported regions (${fallback ? 'img fallback' : 'bitmap'})`, async ({
            page,
        }) => {
            await prepare(page, fallback);
            await importFixture(page, bits);
            const initialReads = fallback
                ? { bitmaps: 0, closes: 0, images: 1 }
                : { bitmaps: 1, closes: 1, images: 0 };
            expect(await reads(page)).toEqual(initialReads);
            await page.getByRole('button', { name: '3D', exact: true }).click();
            await page.getByRole('tab', { name: 'Manual', exact: true }).click();
            await expectLayers(page);
            await expectExportedLayers(page);
            expect(await reads(page)).toEqual(initialReads);

            // Baking makes an ordinary sRGB history entry. Restoring the tagged
            // import must preserve the same palette and physical pixel regions.
            await page.getByRole('button', { name: '2D', exact: true }).click();
            await page.getByRole('button', { name: 'Apply adjustments', exact: true }).click();
            await expect(page.getByTestId('quantize-apply')).toBeEnabled();
            await expect
                .poll(() => reads(page))
                .toEqual({ ...initialReads, images: initialReads.images + 1 });
            await page.getByRole('button', { name: '3D', exact: true }).click();
            await expectLayers(page);
            await page.getByRole('button', { name: '2D', exact: true }).click();
            await page.getByRole('button', { name: 'Undo', exact: true }).click();
            const undoReads = fallback
                ? { bitmaps: 0, closes: 0, images: 3 }
                : { bitmaps: 2, closes: 2, images: 1 };
            await expect.poll(() => reads(page)).toEqual(undoReads);
            await expect(page.getByTestId('quantize-apply')).toBeEnabled();
            await page.getByRole('button', { name: '3D', exact: true }).click();
            await expectLayers(page);
            await expectExportedLayers(page);
            expect(await reads(page)).toEqual(undoReads);
            await page.getByRole('button', { name: '2D', exact: true }).click();
            await page.getByRole('button', { name: 'Redo', exact: true }).click();
            const redoReads = { ...undoReads, images: undoReads.images + 1 };
            await expect.poll(() => reads(page)).toEqual(redoReads);
            await expect(page.getByTestId('quantize-apply')).toBeEnabled();
            await page.getByRole('button', { name: '3D', exact: true }).click();
            await expectLayers(page);
            expect(await reads(page)).toEqual(redoReads);
        });
    }
}

test('@smoke Auto-paint analysis and Palette Proof read the shared profiled pixels', async ({
    page,
}) => {
    await prepare(page);
    await importFixture(page, 8);
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Manual', exact: true }).click();
    const colors = await page
        .locator('[aria-label^="Color swatch: "]')
        .evaluateAll((elements) => elements.map((element) => element.getAttribute('title')!));
    expect(colors).toHaveLength(2);
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await page
        .getByTestId('autopaint-profile-import-input')
        .setInputFiles(
            fileURLToPath(new URL('../assets/filament-profiles/2_Colors.kapp', import.meta.url))
        );
    await expect(page.getByTestId('build-3d-model')).toBeEnabled({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Open preview', exact: true }).click();
    const preview = page.getByRole('alertdialog');
    await preview.getByRole('button', { name: 'Result', exact: true }).click();
    const pixels = await preview
        .getByTestId('printable-detail-canvas')
        .evaluate((canvas: HTMLCanvasElement) => {
            const context = canvas.getContext('2d')!;
            return [8, 24].map(
                (x) =>
                    '#' +
                    Array.from(context.getImageData(x, 16, 1, 1).data)
                        .slice(0, 3)
                        .map((value) => value.toString(16).padStart(2, '0'))
                        .join('')
            );
        });
    expect(pixels.sort()).toEqual([...colors].sort());
    await preview.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('tab', { name: 'Palette Proof' }).click();
    const panel = dialog.getByTestId('palette-proof-panel');
    await panel.getByRole('button', { name: 'Choose from image', exact: true }).click();
    const image = panel.getByTestId('palette-proof-target-image');
    await expect.poll(() => image.evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBe(32);
    const box = (await image.boundingBox())!;
    await image.click({ position: { x: box.width / 4, y: box.height / 2 } });
    await image.click({ position: { x: (box.width * 3) / 4, y: box.height / 2 } });
    await expect(
        panel.getByTestId('palette-proof-selected-targets').locator('[data-selected-target-id]')
    ).toHaveCount(2);
    expect(await reads(page)).toEqual({ bitmaps: 1, closes: 1, images: 0 });
});
