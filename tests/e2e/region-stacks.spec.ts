import { expect, test, type Page } from '@playwright/test';
import type * as THREE from 'three';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

type E2EWindow = Window & {
    __KROMACUT_E2E: { buildHistory: Array<{ settings?: { regionStacks?: boolean } }> };
    __KROMACUT_LAST_MESH: THREE.Group;
};

async function build(page: Page) {
    const before = await page.evaluate(
        () => (window as unknown as E2EWindow).__KROMACUT_E2E.buildHistory.length
    );
    await page.getByTestId('build-3d-model').click();
    await page.waitForFunction(
        (n) => (window as unknown as E2EWindow).__KROMACUT_E2E.buildHistory.length > n,
        before
    );
    return page.evaluate(() => {
        const state = window as unknown as E2EWindow;
        const meshes = state.__KROMACUT_LAST_MESH.children as THREE.Mesh[];
        return {
            regionStacks: state.__KROMACUT_E2E.buildHistory.at(-1)?.settings?.regionStacks,
            stlUnavailable: state.__KROMACUT_LAST_MESH.userData.kromacutStlUnavailable,
            parts: meshes.map((mesh) => ({
                group: String(mesh.userData.kromacutExportGroup),
                kind: mesh.userData.kromacutPartName as string,
                baseZ: Number(mesh.userData.baseZ),
                topZ: Number(mesh.userData.topZ),
            })),
        };
    });
}

/** Mesh objects in the exported 3MF, with edges not shared by exactly two triangles. */
async function exportObjects(page: Page) {
    if (!(await page.getByTestId('download-3mf').isVisible())) {
        await page.getByTestId('download-3d-model').click();
    }
    const pending = page.waitForEvent('download');
    await page.getByTestId('download-3mf').click();
    const zip = await JSZip.loadAsync(await readFile((await (await pending).path())!));
    const xml = await zip.file('3D/3dmodel.model')!.async('string');
    return Array.from(xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g))
        .filter((match) => match[2].includes('<mesh>'))
        .map((match) => {
            const edges = new Map<string, number>();
            for (const t of match[2].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)" \/>/g)) {
                const [a, b, c] = [Number(t[1]), Number(t[2]), Number(t[3])];
                for (const [p, q] of [
                    [a, b],
                    [b, c],
                    [c, a],
                ]) {
                    const key = p < q ? `${p}|${q}` : `${q}|${p}`;
                    edges.set(key, (edges.get(key) ?? 0) + 1);
                }
            }
            return {
                name: /name="([^"]*)"/.exec(match[1])?.[1] ?? '',
                badEdges: [...edges.values()].filter((count) => count !== 2).length,
            };
        });
}

test('@smoke per-region stacks build relief and Flat Paint models with one 3MF object per filament', async ({
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
        canvas.width = 36;
        canvas.height = 24;
        const ctx = canvas.getContext('2d')!;
        // Saturated blocks that no single shared filament order serves well.
        const colors = ['#D83400', '#6300C5', '#F7D000', '#00B8C4', '#F4F4F4', '#1A1A1A'];
        colors.forEach((color, i) => {
            ctx.fillStyle = color;
            ctx.fillRect((i % 3) * 12, Math.floor(i / 3) * 12, 12, 12);
        });
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'region-stacks.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await page
        .getByTestId('autopaint-profile-import-input')
        .setInputFiles('tests/assets/filament-profiles/8_Colors.kapp');
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible();

    await page.getByTestId('autopaint-region-stacks').click();
    await expect(page.getByTestId('autopaint-region-stacks-max-filaments')).toHaveValue('4');
    await page.waitForTimeout(600);

    // Relief: every column stays on the plate and ends at its own stack's height.
    const relief = await build(page);
    expect(relief.regionStacks).toBe(true);
    expect(relief.stlUnavailable).toBe(true);
    expect(relief.parts.length).toBeGreaterThan(0);
    expect(relief.parts.every((part) => part.group.startsWith('region-stacks:filament:'))).toBe(
        true
    );
    expect(Math.min(...relief.parts.map((part) => part.baseZ))).toBe(0);
    await expect(page.getByText('Per-region stacks multi-material print')).toBeVisible();
    const range = page.getByTestId('layer-preview-range');
    const layers = Number(await range.getByRole('slider').nth(1).getAttribute('aria-valuemax'));
    const top = Math.max(...relief.parts.map((part) => part.topZ));
    expect(layers).toBe(Math.round((top - 0.16) / 0.08) + 1);
    await expect(
        page.getByText(new RegExp(`^Model:.*\\(${layers} physical layers\\)$`))
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('region-stacks-relief.png') });
    const reliefObjects = await exportObjects(page);
    expect(reliefObjects.length).toBe(new Set(relief.parts.map((part) => part.group)).size);
    for (const object of reliefObjects) expect(object.badEdges, object.name).toBe(0);

    // Flat Paint: the same stacks padded with foundation into one uniform slab.
    await page.getByTestId('autopaint-flat-paint').click();
    await page.waitForTimeout(600);
    const flat = await build(page);
    expect(flat.regionStacks).toBe(true);
    expect(flat.parts.some((part) => part.group === 'flat-paint:carrier')).toBe(true);
    const slabTop = Math.max(...flat.parts.map((part) => part.topZ));
    const footprint = flat.parts.filter((part) => part.group !== 'flat-paint:carrier');
    expect(footprint.every((part) => part.group.startsWith('flat-paint:filament:'))).toBe(true);
    expect(footprint.some((part) => Math.abs(part.topZ - slabTop) < 1e-9)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('region-stacks-flat.png') });
    const flatObjects = await exportObjects(page);
    expect(flatObjects.length).toBe(new Set(flat.parts.map((part) => part.group)).size);
    for (const object of flatObjects) expect(object.badEdges, object.name).toBe(0);

    // Multi-head routes through the shared sequence, so enabling it turns
    // per-region stacks off; the choice survives a reload.
    await page.getByTestId('autopaint-multi-head-mode').click();
    await expect(page.getByTestId('autopaint-region-stacks')).toHaveAttribute(
        'data-state',
        'unchecked'
    );
    await page.getByTestId('autopaint-region-stacks').click();
    await expect(page.getByTestId('autopaint-multi-head-mode')).toHaveAttribute(
        'data-state',
        'unchecked'
    );
    await page.waitForTimeout(600);
    await page.reload();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await expect(page.getByTestId('autopaint-region-stacks')).toHaveAttribute(
        'data-state',
        'checked'
    );
    expect(errors).toEqual([]);
});
