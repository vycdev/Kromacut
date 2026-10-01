import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { inspectMeshIntegrity } from '../meshDiagnostics.ts';

async function selectStrength(page: Page, label: string) {
    await page.getByTestId('print-smooth-meshing').click();
    await page.getByRole('option', { name: label, exact: true }).click();
}

async function download(page: Page, format: 'stl' | '3mf') {
    const item = page.getByTestId(`download-${format}`);
    if (!(await item.isVisible())) await page.getByTestId('download-3d-model').click();
    const pending = page.waitForEvent('download');
    await item.click();
    return readFile((await (await pending).path())!);
}

test('@smoke smoothing strengths apply on Build, persist, and export healthy geometry', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
        // Seed the old enabled toggle to exercise the real UI migration.
        if (!localStorage.getItem('kromacut:3d-print-settings')) {
            localStorage.setItem(
                'kromacut:3d-print-settings',
                JSON.stringify({
                    pixelSize: 0.4,
                    layerHeight: 0.08,
                    slicerFirstLayerHeight: 0.16,
                    smoothMeshing: true,
                })
            );
        }
        Object.assign(window, { __KROMACUT_E2E: { buildHistory: [] } });
    });
    await page.goto('/app');
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 24;
        const ctx = canvas.getContext('2d')!;
        for (let y = 0; y < 24; y++) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, y, 32, 1);
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(4 + Math.floor(y / 3), y, 8, 1);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(16 + Math.floor(y / 4), y, 6, 1);
        }
        return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'strengths.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.getByTestId('print-smooth-meshing')).toHaveText('Medium');
    const historyCount = () =>
        page.evaluate(
            () =>
                (window as unknown as { __KROMACUT_E2E: { buildHistory: unknown[] } })
                    .__KROMACUT_E2E.buildHistory.length
        );
    const meshesByStrength = new Map<string, string[]>();
    for (const label of ['None', 'Minimal', 'Medium', 'Aggressive']) {
        const before = await historyCount();
        await selectStrength(page, label);
        await page.waitForTimeout(350);
        expect(await historyCount()).toBe(before);
        if (meshesByStrength.size) {
            const previous = [...meshesByStrength.keys()].at(-1)!;
            await expect(page.getByTestId('print-instructions-smoothing')).toContainText(previous);
        }
        await page.getByTestId('build-3d-model').click();
        await page.waitForFunction(
            (n) =>
                (window as unknown as { __KROMACUT_E2E: { buildHistory: unknown[] } })
                    .__KROMACUT_E2E.buildHistory.length > n,
            before
        );
        const built = await page.evaluate(
            () =>
                (
                    window as unknown as {
                        __KROMACUT_E2E: {
                            lastBuild: {
                                status: string;
                                settings: { smoothMeshingStrength: string };
                            };
                        };
                    }
                ).__KROMACUT_E2E.lastBuild
        );
        expect(built.status).toBe('complete');
        expect(built.settings.smoothMeshingStrength).toBe(label.toLowerCase());
        await expect(page.getByTestId('print-instructions-smoothing')).toContainText(label);
        const stl = await download(page, 'stl');
        const triangles = stl.readUInt32LE(80);
        expect(triangles).toBeGreaterThan(0);
        expect(stl.length).toBe(84 + triangles * 50);
        // Every STL triangle must retain finite vertices, a nonzero area, and
        // outward winding relative to its stored normal.
        for (let i = 0; i < triangles; i++) {
            const offset = 84 + i * 50;
            const values = Array.from({ length: 12 }, (_, j) => stl.readFloatLE(offset + j * 4));
            expect(values.every(Number.isFinite)).toBe(true);
            const [nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz] = values;
            const cross = [
                (by - ay) * (cz - az) - (bz - az) * (cy - ay),
                (bz - az) * (cx - ax) - (bx - ax) * (cz - az),
                (bx - ax) * (cy - ay) - (by - ay) * (cx - ax),
            ];
            expect(Math.hypot(...cross)).toBeGreaterThan(0);
            expect(nx * cross[0] + ny * cross[1] + nz * cross[2]).toBeGreaterThan(0);
        }
        const zip = await JSZip.loadAsync(await download(page, '3mf'));
        const xml = await zip.file('3D/3dmodel.model')!.async('string');
        expect(xml).toContain(
            `<metadata name="Kromacut:SmoothMeshingStrength">${label.toLowerCase()}</metadata>`
        );
        const meshes = xml.match(/<mesh>[\s\S]*?<\/mesh>/g)!;
        expect(meshes.length).toBe(3);
        for (const mesh of meshes) {
            const positions = Float32Array.from(
                [...mesh.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\s*\/>/g)].flatMap(
                    (v) => v.slice(1).map(Number)
                )
            );
            const indices = [
                ...mesh.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"[^>]*\/>/g),
            ].flatMap((v) => v.slice(1).map(Number));
            const report = inspectMeshIntegrity({ positions, indices });
            expect(report.isValid, JSON.stringify(report)).toBe(true);
        }
        meshesByStrength.set(label, meshes);
    }
    expect(meshesByStrength.get('Minimal')).not.toEqual(meshesByStrength.get('None'));
    expect(meshesByStrength.get('Medium')).not.toEqual(meshesByStrength.get('Minimal'));
    expect(meshesByStrength.get('Aggressive')).not.toEqual(meshesByStrength.get('Medium'));
    // Flat Paint retains the selected strength in both viewing orientations.
    await page.getByRole('button', { name: '2D', exact: true }).click();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.getByTestId('print-smooth-meshing')).toHaveText('Aggressive');
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await page
        .getByTestId('autopaint-profile-import-input')
        .setInputFiles('tests/assets/filament-profiles/2_Colors.kapp');
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible();
    const flatPaint = page.getByTestId('autopaint-flat-paint');
    await flatPaint.click();
    await expect(page.getByTestId('print-smooth-meshing')).toHaveText('Aggressive');
    await expect(page.getByTestId('print-instructions-smoothing')).toContainText('Aggressive');
    await flatPaint.click();
    await expect(page.getByTestId('print-smooth-meshing')).toHaveText('Aggressive');
    await flatPaint.click();
    await selectStrength(page, 'Minimal');
    await expect(flatPaint).toHaveAttribute('data-state', 'checked');
    await page.waitForTimeout(500);
    await expect(page.getByTestId('build-3d-model')).toBeEnabled();
    for (const faceUp of [false, true]) {
        if (faceUp) await page.getByTestId('autopaint-flat-paint-face-up').click();
        for (const label of ['None', 'Minimal', 'Medium', 'Aggressive']) {
            const before = await historyCount();
            await selectStrength(page, label);
            await expect(flatPaint).toHaveAttribute('data-state', 'checked');
            await page.getByTestId('build-3d-model').click();
            await page.waitForFunction(
                (n) =>
                    (window as unknown as { __KROMACUT_E2E: { buildHistory: unknown[] } })
                        .__KROMACUT_E2E.buildHistory.length > n,
                before
            );
            const built = await page.evaluate(
                () =>
                    (
                        window as unknown as {
                            __KROMACUT_E2E: {
                                lastBuild: {
                                    status: string;
                                    settings: {
                                        flatPaint: boolean;
                                        flatPaintFaceUp: boolean;
                                        smoothMeshingStrength: string;
                                    };
                                };
                            };
                        }
                    ).__KROMACUT_E2E.lastBuild
            );
            expect(built.status).toBe('complete');
            expect(built.settings.flatPaint).toBe(true);
            expect(built.settings.flatPaintFaceUp).toBe(faceUp);
            expect(built.settings.smoothMeshingStrength).toBe(label.toLowerCase());
            await expect(page.getByTestId('print-instructions-smoothing')).toContainText(label);
            const zip = await JSZip.loadAsync(await download(page, '3mf'));
            const xml = await zip.file('3D/3dmodel.model')!.async('string');
            expect(xml).toContain(
                `<metadata name="Kromacut:SmoothMeshingStrength">${label.toLowerCase()}</metadata>`
            );
            expect(xml.includes('transparent carrier')).toBe(!faceUp);
            const meshes = xml.match(/<mesh>[\s\S]*?<\/mesh>/g)!;
            expect(meshes.length).toBeGreaterThan(0);
            for (const mesh of meshes) {
                // Filament objects contain independent closed member shells;
                // preserve vertex identities at contacts between those shells.
                const edges = new Map<string, number>();
                const triangles = [
                    ...mesh.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"[^>]*\/>/g),
                ];
                expect(triangles.length).toBeGreaterThan(0);
                for (const triangle of triangles) {
                    const [a, b, c] = triangle.slice(1).map(Number);
                    for (const [start, end] of [
                        [a, b],
                        [b, c],
                        [c, a],
                    ]) {
                        const key = start < end ? `${start}/${end}` : `${end}/${start}`;
                        edges.set(key, (edges.get(key) ?? 0) + 1);
                    }
                }
                expect([...edges.values()].every((count) => count === 2)).toBe(true);
            }
        }
    }
    await expect(page.getByText('Exporting 3MF', { exact: true })).toBeHidden();
    await page.screenshot({ path: test.info().outputPath('smooth-flat-paint.png') });
    await selectStrength(page, 'Minimal');
    await page.reload();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.getByTestId('print-smooth-meshing')).toHaveText('Minimal');
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await expect(flatPaint).toHaveAttribute('data-state', 'checked');
    await expect(page.getByTestId('autopaint-flat-paint-face-up')).toHaveAttribute(
        'data-state',
        'checked'
    );
    await page.getByRole('button', { name: 'Reset print settings', exact: true }).click();
    await expect(page.getByTestId('print-smooth-meshing')).toHaveText('None');
    expect(errors).toEqual([]);
});
