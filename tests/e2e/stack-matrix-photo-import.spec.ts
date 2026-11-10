import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const twoColorProfile = fileURLToPath(
    new URL('../assets/filament-profiles/2_Colors.kapp', import.meta.url)
);
const squarePhoto = fileURLToPath(new URL('../assets/1024x1024p.png', import.meta.url));
const rocco = readFileSync(fileURLToPath(new URL('../assets/rocco__source.png', import.meta.url)));

test('@smoke unreadable and truncated Stack Matrix photos report an error and keep the current photo', async ({
    page,
}) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    await expect(page.getByTestId('image-file-input')).toBeAttached();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await page.getByTestId('autopaint-profile-import-input').setInputFiles(twoColorProfile);
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible();
    await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('tab', { name: 'Stack Matrix', exact: true }).click();
    await dialog.getByLabel('Maximum cells', { exact: true }).click();
    await page.getByRole('option', { name: '64 (8 × 8)', exact: true }).click();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Create and download 3MF', exact: true }).click();
    await download;

    const input = dialog.getByTestId('matrix-photo-input');
    const canvas = dialog.getByTestId('matrix-photo-canvas');
    const openFailed = dialog.getByText('Could not open that photo', { exact: true });
    // A truncated PNG keeps a valid header, so an <img> alone would load its
    // first rows as a partial photo.
    const truncated = {
        name: 'truncated.png',
        mimeType: 'image/png',
        buffer: rocco.subarray(0, Math.floor(rocco.length / 3)),
    };

    await input.setInputFiles(truncated);
    await expect(openFailed).toBeVisible();
    await expect(canvas).toHaveCount(0);

    await input.setInputFiles(squarePhoto);
    await expect(canvas).toHaveAttribute('width', '1024');
    await expect(openFailed).toHaveCount(0);

    await input.setInputFiles(truncated);
    await expect(openFailed).toBeVisible();
    await expect(canvas).toHaveAttribute('width', '1024');

    // Load a different valid photo first so the next error and kept photo
    // cannot be left over from the truncated attempt.
    await input.setInputFiles({ name: 'rocco.png', mimeType: 'image/png', buffer: rocco });
    await expect(canvas).toHaveAttribute('width', '1000');
    await expect(openFailed).toHaveCount(0);

    await input.setInputFiles({
        name: 'corrupt.png',
        mimeType: 'image/png',
        buffer: Buffer.from('this is plain text, not image data'),
    });
    await expect(openFailed).toBeVisible();
    await expect(canvas).toHaveAttribute('width', '1000');

    await input.setInputFiles({
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('not an image'),
    });
    await expect(
        dialog.getByText('Drop an image file for the Stack Matrix photo', { exact: true })
    ).toBeVisible();
    await expect(canvas).toHaveAttribute('width', '1000');

    // Phone photos are often stored sideways with an EXIF orientation tag. The
    // photo must load upright, as an <img> shows it: 400x200 rotated a quarter turn.
    const rotated = await page.evaluate(async () => {
        const source = new OffscreenCanvas(400, 200);
        source.getContext('2d')!.fillRect(0, 0, 200, 200);
        const blob = await source.convertToBlob({ type: 'image/jpeg' });
        const jpeg = new Uint8Array(await blob.arrayBuffer());
        // An APP1 Exif segment holding one big-endian Orientation (0x0112) entry of 6.
        const tiff = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1];
        const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff, 0, 6, 0, 0, 0, 0, 0, 0];
        const app1 = [0xff, 0xe1, 0, exif.length + 2, ...exif];
        return [...jpeg.subarray(0, 2), ...app1, ...jpeg.subarray(2)];
    });
    await input.setInputFiles({
        name: 'sideways.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from(rotated),
    });
    await expect(canvas).toHaveAttribute('width', '200');
    await expect(canvas).toHaveAttribute('height', '400');
    await expect(openFailed).toHaveCount(0);
});
