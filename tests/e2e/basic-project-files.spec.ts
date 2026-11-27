import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { decodeProject } from '../../src/lib/projectFile';

async function image(page: Page, width: number, height: number) {
    const png = await page.evaluate(
        ({ width, height }) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#8848B1';
            ctx.fillRect(0, 0, width, height);
            return canvas.toDataURL().split(',')[1];
        },
        { width, height }
    );
    return { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
}

test('@smoke projects save the working image and settings and restore without changing print defaults', async ({
    page,
}) => {
    const key = 'kromacut:3d-print-settings';
    await page.addInitScript(() =>
        localStorage.setItem(
            'kromacut:3d-print-settings',
            JSON.stringify({
                layerHeight: 0.18,
                slicerFirstLayerHeight: 0.24,
                pixelSize: 0.13,
                smoothMeshingStrength: 'none',
            })
        )
    );
    await page.goto('/app');
    const input = page.getByTestId('image-file-input');
    await input.setInputFiles(await image(page, 23, 17));
    await expect(page.getByText('Image: 23×17', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Project name' }).fill('Round trip');
    await page.locator('#final-colors').fill('9');
    await page.locator('#final-colors').blur();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Round trip.kromacut');
    const bytes = await readFile((await download.path())!);
    const stored = await decodeProject(new Blob([new Uint8Array(bytes)]));
    expect(stored.state.quantize.finalColors).toBe(9);
    expect(stored.state.print.pixelSize).toBe(0.13);

    await input.setInputFiles(await image(page, 11, 9));
    await expect(page.getByText('Image: 11×9', { exact: true })).toBeVisible();
    const otherDefaults = JSON.stringify({
        layerHeight: 0.3,
        slicerFirstLayerHeight: 0.3,
        pixelSize: 0.2,
        smoothMeshingStrength: 'medium',
    });
    await page.evaluate(({ key, otherDefaults }) => localStorage.setItem(key, otherDefaults), {
        key,
        otherDefaults,
    });

    const projectInput = page.getByTestId('project-file-input');
    const load = { name: download.suggestedFilename(), mimeType: 'application/zip', buffer: bytes };
    await projectInput.setInputFiles(load);
    const dialog = page.getByRole('dialog', { name: 'Open project' });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText('Image: 11×9', { exact: true })).toBeVisible();

    await projectInput.setInputFiles(load);
    await dialog.getByRole('button', { name: 'Open project', exact: true }).click();
    await expect(page.getByText('Project opened. Rebuild 3D when needed.')).toBeVisible();
    await expect(page.getByText('Image: 23×17', { exact: true })).toBeVisible();
    await expect(page.locator('#final-colors')).toHaveValue('9');
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.getByTestId('print-pixel-size')).toHaveValue('0.13');
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(otherDefaults);
});

test('@smoke a corrupt project image leaves the current workspace and history intact', async ({
    page,
}) => {
    await page.goto('/app');
    const source = await image(page, 15, 11);
    await page.getByTestId('image-file-input').setInputFiles(source);
    await expect(page.getByText('Image: 15×11', { exact: true })).toBeVisible();
    const archive = new JSZip();
    archive.file(
        'project.json',
        JSON.stringify({ format: 'kromacut-project', version: 1, state: { name: 'Corrupt' } })
    );
    archive.file('image.png', source.buffer.subarray(0, 24));
    await page.getByTestId('project-file-input').setInputFiles({
        name: 'corrupt.kromacut',
        mimeType: 'application/zip',
        buffer: await archive.generateAsync({ type: 'nodebuffer' }),
    });
    await page
        .getByRole('dialog', { name: 'Open project' })
        .getByRole('button', { name: 'Open project', exact: true })
        .click();
    await expect(page.getByRole('alert')).toContainText('Current session retained');
    await expect(page.getByText('Image: 15×11', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
});

test('@smoke project palette snapshots preserve existing palettes and keep supplier palettes read-only', async ({
    page,
}) => {
    await page.addInitScript(() => {
        localStorage.setItem(
            'kromacut.palettes',
            JSON.stringify([
                {
                    id: 'same-id',
                    name: 'Library palette',
                    colors: ['#444444', '#777777'],
                    version: 2,
                    createdAt: 1,
                    updatedAt: 1,
                },
            ])
        );
    });
    await page.goto('/app');
    const source = await image(page, 13, 11);
    const load = async (palette: { id: string; name: string; colors: string[] }) => {
        const archive = new JSZip();
        archive.file(
            'project.json',
            JSON.stringify({
                format: 'kromacut-project',
                version: 1,
                state: { name: 'Palette project', quantize: { paletteId: palette.id, palette } },
            })
        );
        archive.file('image.png', source.buffer);
        await page.getByTestId('project-file-input').setInputFiles({
            name: 'palette.kromacut',
            mimeType: 'application/zip',
            buffer: await archive.generateAsync({ type: 'nodebuffer' }),
        });
        await page
            .getByRole('dialog', { name: 'Open project' })
            .getByRole('button', { name: 'Open project', exact: true })
            .click();
        await expect(page.getByText('Project opened. Rebuild 3D when needed.')).toBeVisible();
    };
    const storedPalettes = () =>
        page.evaluate(() => JSON.parse(localStorage.getItem('kromacut.palettes') ?? '[]'));

    await load({ id: 'same-id', name: 'Project palette', colors: ['#112233', '#445566'] });
    await expect(page.locator('#palette-select')).toContainText('Project palette');
    expect(await storedPalettes()).toMatchObject([
        { id: 'same-id', name: 'Library palette', colors: ['#444444', '#777777'] },
        { name: 'Project palette', colors: ['#112233', '#445566'] },
    ]);

    await load({
        id: 'sup_bambu-pla-basic',
        name: 'Bambu prototype snapshot',
        colors: ['#103010', '#806040'],
    });
    await expect(page.locator('#palette-select')).toContainText('Bambu Lab PLA Basic');
    expect(await storedPalettes()).toHaveLength(2);
});
