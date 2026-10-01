import { expect, test, type Page } from '@playwright/test';
import type * as THREE from 'three';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { flatPaintPrecisionFixture } from '../flatPaintPrecisionFixture';
import { createFlatPaintMesher } from '../../src/lib/flatPaintMeshing';
import { inspectMeshIntegrity } from '../meshDiagnostics';

type BuildTestWindow = Window & {
    __KROMACUT_E2E?: { lastBuild?: { status?: string } };
};

declare global {
    interface Window {
        __FLAT_PAINT_TEST_EXPORT?: string;
    }
}

async function geometryState(page: Page) {
    return page.evaluate(() => {
        const root = (window as unknown as { __KROMACUT_LAST_MESH: THREE.Group })
            .__KROMACUT_LAST_MESH;
        const meshes = root.children as THREE.Mesh[];
        const visible = meshes.filter((mesh) => mesh.visible);
        const zs = visible.flatMap((mesh) => {
            const pos = mesh.geometry.getAttribute('position');
            return Array.from({ length: pos.count }, (_, i) => pos.getZ(i));
        });
        return {
            min: zs.length ? Math.min(...zs) : null,
            max: zs.length ? Math.max(...zs) : null,
            visible: visible.length,
            exportUnchanged:
                JSON.stringify(
                    meshes.map((mesh) =>
                        Array.from(mesh.geometry.userData.kromacutExportGeometry.positions)
                    )
                ) === window.__FLAT_PAINT_TEST_EXPORT,
        };
    });
}

async function exportMeshes(page: Page) {
    if (!(await page.getByTestId('download-3mf').isVisible())) {
        await page.getByTestId('download-3d-model').click();
    }
    const pending = page.waitForEvent('download');
    await page.getByTestId('download-3mf').click();
    const zip = await JSZip.loadAsync(await readFile((await (await pending).path())!));
    const xml = await zip.file('3D/3dmodel.model')!.async('string');
    return xml.match(/<mesh>[\s\S]*?<\/mesh>/g);
}

test('@smoke Flat Paint cuts physical layers, retains face colors, and exports the full slab', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
        Object.assign(window, { __KROMACUT_E2E: { buildHistory: [] } });
        localStorage.setItem(
            'kromacut:3d-print-settings',
            JSON.stringify({
                pixelSize: 0.4,
                layerHeight: 0.08,
                slicerFirstLayerHeight: 0.16,
                smoothMeshingStrength: 'none',
            })
        );
    });
    await page.goto('/app');
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        // Dense diagonal contacts used to expand independently for each color.
        // Bands also exercise long merged backing slabs and intermediate colors.
        for (let y = 0; y < 32; y++)
            for (let x = 0; x < 48; x++) {
                const v = y < 16 ? ((x + y) % 2 ? 255 : 0) : Math.round((x * 255) / 47);
                ctx.fillStyle = `rgb(${v},${v},${v})`;
                ctx.fillRect(x, y, 1, 1);
            }
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'flat-preview.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await page
        .getByTestId('autopaint-profile-import-input')
        .setInputFiles('tests/assets/filament-profiles/2_Colors.kapp');
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible();
    await page.getByTestId('autopaint-flat-paint').click();
    for (const strength of ['None', 'Medium']) {
        await page.getByTestId('print-smooth-meshing').click();
        await page.getByRole('option', { name: strength, exact: true }).click();
        for (const faceUp of [false, true]) {
            const orientation = page.getByTestId('autopaint-flat-paint-face-up');
            if (((await orientation.getAttribute('data-state')) === 'checked') !== faceUp)
                await orientation.click();
            await page.waitForTimeout(600);
            const before = await page.evaluate(
                () =>
                    (window as unknown as { __KROMACUT_E2E: { buildHistory: unknown[] } })
                        .__KROMACUT_E2E.buildHistory.length
            );
            await page.getByTestId('build-3d-model').click();
            await page.waitForFunction(
                (n) =>
                    (window as unknown as { __KROMACUT_E2E: { buildHistory: unknown[] } })
                        .__KROMACUT_E2E.buildHistory.length > n,
                before
            );
            const info = await page.evaluate(() => {
                const root = (window as unknown as { __KROMACUT_LAST_MESH: THREE.Group })
                    .__KROMACUT_LAST_MESH;
                const meshes = root.children as THREE.Mesh[];
                window.__FLAT_PAINT_TEST_EXPORT = JSON.stringify(
                    meshes.map((mesh) =>
                        Array.from(mesh.geometry.userData.kromacutExportGeometry.positions)
                    )
                );
                return {
                    top: Math.max(...meshes.map((mesh) => Number(mesh.userData.topZ))),
                    parts: meshes.length,
                };
            });
            const range = page.getByTestId('layer-preview-range');
            const low = range.getByRole('slider').nth(0);
            const high = range.getByRole('slider').nth(1);
            const layers = Number(await high.getAttribute('aria-valuemax'));
            expect(layers).toBe(Math.round((info.top - 0.16) / 0.08) + 1);
            expect(info.parts).toBeGreaterThan(layers);
            await expect(
                page.getByText(new RegExp(`^Model:.*\\(${layers} physical layers\\)$`))
            ).toBeVisible();
            // Inspect the actual flat surface: total top-cap area must equal
            // the image footprint. Overlapping black/white masks exceeded it.
            const face = await page.evaluate(
                ({ faceUp, top }) => {
                    const root = (window as unknown as { __KROMACUT_LAST_MESH: THREE.Group })
                        .__KROMACUT_LAST_MESH;
                    const plane = faceUp ? top : 0.16;
                    let area = 0;
                    const colors = new Set<string>();
                    for (const mesh of root.children as THREE.Mesh[]) {
                        if (mesh.userData.kromacutExportGroup === 'flat-paint:carrier') continue;
                        const p = mesh.geometry.getAttribute('position');
                        const ids = mesh.geometry.index!;
                        for (let i = 0; i < ids.count; i += 3) {
                            const a = ids.getX(i),
                                b = ids.getX(i + 1),
                                c = ids.getX(i + 2);
                            if (![a, b, c].every((id) => Math.abs(p.getZ(id) - plane) < 1e-6))
                                continue;
                            const signedArea =
                                ((p.getX(b) - p.getX(a)) * (p.getY(c) - p.getY(a)) -
                                    (p.getY(b) - p.getY(a)) * (p.getX(c) - p.getX(a))) /
                                2;
                            if ((faceUp && signedArea > 0) || (!faceUp && signedArea < 0)) {
                                area += Math.abs(signedArea);
                                colors.add(
                                    (
                                        mesh.material as THREE.MeshStandardMaterial
                                    ).color.getHexString()
                                );
                                if (!mesh.visible)
                                    throw new Error('Artwork face is hidden after building');
                            }
                        }
                    }
                    return { area, colors: colors.size };
                },
                { faceUp, top: info.top }
            );
            if (strength === 'None') expect(face.area).toBeCloseTo(48 * 32 * 0.4 * 0.4, 4);
            expect(face.colors).toBeGreaterThan(2);
            const fullExport = await exportMeshes(page);
            await high.focus();
            for (let layer = layers - 1; layer >= 1; layer--) {
                await high.press('ArrowLeft');
                await expect(high).toHaveAttribute('aria-valuenow', String(layer));
                await expect
                    .poll(async () => (await geometryState(page)).max)
                    .toBeCloseTo(0.16 + (layer - 1) * 0.08, 6);
                expect((await geometryState(page)).exportUnchanged).toBe(true);
            }
            await high.press('ArrowLeft');
            await expect.poll(async () => (await geometryState(page)).visible).toBe(0);
            expect(await exportMeshes(page)).toEqual(fullExport);
            await high.focus();
            await high.press('End');
            await low.focus();
            await low.press('ArrowRight');
            await expect.poll(async () => (await geometryState(page)).min).toBeCloseTo(0.16, 6);
            await page.getByTestId('preview-render-mode-trigger').click();
            await page.getByTestId('preview-render-mode-wireframe').locator('..').click();
            await low.press('ArrowRight');
            await expect.poll(async () => (await geometryState(page)).min).toBeCloseTo(0.24, 6);
            await low.press('Home');
            await page.getByTestId('preview-render-mode-trigger').click();
            await page.getByTestId('preview-render-mode-shaded').locator('..').click();
            await expect.poll(async () => (await geometryState(page)).min).toBeCloseTo(0, 6);
            if (faceUp && strength === 'None') {
                // Face-up colors occupy the last physical layer. Cutting it off
                // can expose dark backing. Build must restore the artwork even
                // when all input settings are unchanged, rather than keep that cut.
                await high.press('ArrowLeft');
                const beforeRebuild = await page.evaluate(() => {
                    const state = window as unknown as {
                        __KROMACUT_E2E: { buildHistory: unknown[] };
                        __KROMACUT_LAST_MESH: THREE.Group;
                    };
                    return {
                        count: state.__KROMACUT_E2E.buildHistory.length,
                        meshId: state.__KROMACUT_LAST_MESH.children[0].uuid,
                    };
                });
                await page.getByTestId('build-3d-model').click();
                await page.waitForFunction(
                    (count) =>
                        (window as unknown as { __KROMACUT_E2E: { buildHistory: unknown[] } })
                            .__KROMACUT_E2E.buildHistory.length > count,
                    beforeRebuild.count
                );
                await expect(high).toHaveAttribute('aria-valuenow', String(layers));
                await expect
                    .poll(async () => (await geometryState(page)).max)
                    .toBeCloseTo(info.top, 6);
                expect(
                    await page.evaluate(
                        () =>
                            (window as unknown as { __KROMACUT_LAST_MESH: THREE.Group })
                                .__KROMACUT_LAST_MESH.children[0].uuid
                    )
                ).not.toBe(beforeRebuild.meshId);
            }
            await page.screenshot({
                path: test.info().outputPath(`flat-${strength}-${faceUp ? 'up' : 'down'}.png`),
            });
        }
    }
    expect(errors).toEqual([]);
});

test('@smoke face-up finishes precision-sensitive caps and recovers cleanly from a failed build', async ({
    page,
}) => {
    await page.addInitScript(() => {
        Object.assign(window, { __KROMACUT_E2E: { buildHistory: [] } });
        localStorage.setItem(
            'kromacut:3d-print-settings',
            JSON.stringify({
                pixelSize: 0.04,
                layerHeight: 0.08,
                slicerFirstLayerHeight: 0.16,
                smoothMeshingStrength: 'medium',
            })
        );
        localStorage.setItem(
            'kromacut.autopaint.v1',
            JSON.stringify({
                filaments: [
                    { id: 'white', color: '#ffffff', td: 0.6 },
                    { id: 'black', color: '#000000', td: 0.016 },
                ],
                schemaVersion: 2,
                paintMode: 'autopaint',
                flatPaint: true,
                flatPaintFaceUp: true,
                omitAtRiskPixels: false,
                enhancedColorMatch: false,
                optimizerSeed: 27,
            })
        );
    });
    await page.goto('/app');
    const fixture = flatPaintPrecisionFixture();
    const png = await page.evaluate(
        ({ width, height, counts }) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d')!;
            const pixels = ctx.createImageData(width, height);
            counts.forEach((label, index) => {
                // Face-up maps image rows into Cartesian Y; retain the failing
                // boundary's absolute print coordinates after that transform.
                const offset =
                    ((height - 1 - Math.floor(index / width)) * width + (index % width)) * 4;
                pixels.data.fill(label === 1 ? 0 : 255, offset, offset + 3);
                pixels.data[offset + 3] = 255;
            });
            ctx.putImageData(pixels, 0, 0);
            return canvas.toDataURL().split(',')[1];
        },
        { ...fixture, counts: Array.from(fixture.counts) }
    );
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'flat-paint-precision.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    const build = async () => {
        await page.getByTestId('build-3d-model').click();
        await expect(async () => {
            const warning = page.getByRole('button', { name: 'Build Anyway', exact: true });
            if (await warning.isVisible()) await warning.click();
            expect(
                await page.evaluate(
                    () => (window as BuildTestWindow).__KROMACUT_E2E?.lastBuild?.status
                )
            ).toBeDefined();
        }).toPass();
    };
    await build();
    await page.waitForFunction(() =>
        ['complete', 'failed'].includes(
            (window as BuildTestWindow).__KROMACUT_E2E?.lastBuild?.status ?? ''
        )
    );
    expect(
        await page.evaluate(() => (window as BuildTestWindow).__KROMACUT_E2E?.lastBuild)
    ).toMatchObject({
        status: 'complete',
        cropWidth: fixture.width,
        cropHeight: fixture.height,
        settings: { flatPaintFaceUp: true, smoothMeshingStrength: 'medium' },
    });
    await expect(page.getByTestId('layer-preview-range')).toBeVisible();
    const surface = await page.evaluate(() => {
        const root = (window as unknown as { __KROMACUT_LAST_MESH: THREE.Group })
            .__KROMACUT_LAST_MESH;
        const meshes = root.children as THREE.Mesh[];
        const maxZ = Math.max(...meshes.map((mesh) => mesh.userData.topZ as number));
        const face = meshes.filter((mesh) => Math.abs(mesh.userData.topZ - maxZ) < 1e-6);
        let area = 0;
        for (const mesh of face) {
            const pos = mesh.geometry.getAttribute('position');
            const index = mesh.geometry.getIndex()!;
            for (let i = 0; i < index.count; i += 3) {
                const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
                if ([a, b, c].every((v) => Math.abs(pos.getZ(v) - maxZ) < 1e-6)) {
                    area +=
                        ((pos.getX(b) - pos.getX(a)) * (pos.getY(c) - pos.getY(a)) -
                            (pos.getY(b) - pos.getY(a)) * (pos.getX(c) - pos.getX(a))) /
                        2;
                }
            }
        }
        return {
            area,
            colors: face.map((mesh) =>
                (mesh.material as THREE.MeshStandardMaterial).color.getHexString()
            ),
            carrier: meshes.some(
                (mesh) => mesh.userData.kromacutExportGroup === 'flat-paint:carrier'
            ),
        };
    });
    expect(new Set(surface.colors).size).toBe(2);
    expect(surface.carrier).toBe(false);
    const options = { yieldIntervalMs: Infinity, onYield: async () => undefined };
    const meshMask = await createFlatPaintMesher(
        fixture.counts,
        fixture.width,
        fixture.height,
        fixture.pixelSize,
        'medium',
        options
    );
    const footprint = await meshMask(new Uint8Array(fixture.counts.length).fill(1), options);
    expect(surface.area).toBeCloseTo(inspectMeshIntegrity(footprint).signedVolume, 6);

    // Fail after one part has already been added, then retry unchanged settings.
    await page.evaluate(() => {
        const root = (window as unknown as { __KROMACUT_LAST_MESH: THREE.Group })
            .__KROMACUT_LAST_MESH;
        const prototype = Object.getPrototypeOf(
            (root.children[0] as THREE.Mesh).geometry
        ) as THREE.BufferGeometry;
        const original = prototype.setAttribute;
        let parts = 0;
        prototype.setAttribute = function (name, attribute) {
            if (name === 'position' && ++parts === 2) {
                prototype.setAttribute = original;
                throw new Error('Injected failure after the first Flat Paint part');
            }
            return original.call(this, name, attribute);
        };
        Object.assign(window, { __FLAT_PAINT_FAILED_ROOT: root });
    });
    await build();
    await expect(page.getByTestId('model-build-error')).toContainText('Injected failure');
    await expect(page.getByTestId('layer-preview-range')).toBeHidden();
    expect(
        await page.evaluate(() => ({
            status: (window as BuildTestWindow).__KROMACUT_E2E?.lastBuild?.status,
            parts: (window as unknown as { __FLAT_PAINT_FAILED_ROOT: THREE.Group })
                .__FLAT_PAINT_FAILED_ROOT.children.length,
            exportAvailable: !!(window as unknown as { __KROMACUT_LAST_MESH?: THREE.Group })
                .__KROMACUT_LAST_MESH,
        }))
    ).toEqual({ status: 'failed', parts: 0, exportAvailable: false });
    await build();
    await expect(page.getByTestId('model-build-error')).toBeHidden();
    await expect(page.getByTestId('layer-preview-range')).toBeVisible();
    expect(
        await page.evaluate(() => (window as BuildTestWindow).__KROMACUT_E2E?.lastBuild?.status)
    ).toBe('complete');
});

test('@smoke enhanced matching preserves the artwork across both Flat Paint orientations', async ({
    page,
}) => {
    const { filaments } = JSON.parse(
        await readFile('tests/assets/filament-profiles/8_Colors_Calibrated_Frontlit.kfil', 'utf8')
    ) as { filaments: unknown[] };
    await page.addInitScript((filaments) => {
        Object.assign(window, { __KROMACUT_E2E: { buildHistory: [] } });
        localStorage.setItem(
            'kromacut:3d-print-settings',
            JSON.stringify({
                pixelSize: 0.4,
                layerHeight: 0.08,
                slicerFirstLayerHeight: 0.2,
                smoothMeshingStrength: 'none',
            })
        );
        localStorage.setItem(
            'kromacut.autopaint.v1',
            JSON.stringify({
                filaments,
                schemaVersion: 2,
                paintMode: 'autopaint',
                autoPaintMaxHeight: 1.6,
                enhancedColorMatch: true,
                preserveSeparation: true,
                separationMaxDeltaE: 15,
                failOnSeparationError: false,
                transitionOpacity: 0.8,
                optimizerSeed: 27,
                flatPaint: true,
                flatPaintFaceUp: false,
            })
        );
    }, filaments);
    await page.goto('/app');
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        [
            '#ffffff',
            '#000000',
            '#ff7eb4',
            '#f7d000',
            '#d83400',
            '#6300c5',
            '#00b8c4',
            '#04bb00',
        ].forEach((color, i) => {
            ctx.fillStyle = color;
            ctx.fillRect(i * 16, 0, 16, 128);
        });
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'eight-colors.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await expect(page.getByTestId('autopaint-enhanced-color-match')).toHaveAttribute(
        'data-state',
        'checked'
    );
    await expect(page.getByTestId('autopaint-preserve-separation')).toHaveAttribute(
        'data-state',
        'checked'
    );
    let previousColors: string[] | undefined;
    for (const faceUp of [false, true]) {
        if (faceUp) await page.getByTestId('autopaint-flat-paint-face-up').click();
        const before = await page.evaluate(
            () =>
                (window as unknown as { __KROMACUT_E2E: { buildHistory: unknown[] } })
                    .__KROMACUT_E2E.buildHistory.length
        );
        await page.getByTestId('build-3d-model').click();
        await page.waitForFunction(
            (count) =>
                (window as unknown as { __KROMACUT_E2E: { buildHistory: unknown[] } })
                    .__KROMACUT_E2E.buildHistory.length > count,
            before
        );
        const surface = await page.evaluate((faceUp) => {
            const meshes = (window as unknown as { __KROMACUT_LAST_MESH: THREE.Group })
                .__KROMACUT_LAST_MESH.children as THREE.Mesh[];
            const top = Math.max(...meshes.map((mesh) => Number(mesh.userData.topZ)));
            const face = meshes.filter((mesh) =>
                faceUp
                    ? Math.abs(mesh.userData.topZ - top) < 1e-6
                    : Math.abs(mesh.userData.baseZ - 0.2) < 1e-6 &&
                      Math.abs(mesh.userData.topZ - 0.28) < 1e-6
            );
            return {
                colors: face
                    .map((mesh) =>
                        (mesh.material as THREE.MeshStandardMaterial).color.getHexString()
                    )
                    .sort(),
                visible: face.every((mesh) => mesh.visible),
                carrier: meshes.some(
                    (mesh) => mesh.userData.kromacutExportGroup === 'flat-paint:carrier'
                ),
            };
        }, faceUp);
        expect(surface.visible).toBe(true);
        expect(surface.carrier).toBe(!faceUp);
        expect(new Set(surface.colors).size).toBe(8);
        if (previousColors) expect(surface.colors).toEqual(previousColors);
        previousColors = surface.colors;
    }
    await page.screenshot({ path: test.info().outputPath('enhanced-face-up.png') });
});
