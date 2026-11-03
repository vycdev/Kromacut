import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../assets/rocco__source.png', import.meta.url));

test('@smoke unreadable image files report an error and keep the current image', async ({
    page,
}) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    const input = page.getByTestId('image-file-input');
    const current = page.getByText('Current', { exact: true }).locator('..');
    const error = page.getByTestId('image-import-error');
    await input.setInputFiles(source);
    await expect(current).toContainText('1000x835');
    await expect(error).toHaveCount(0);

    // A file that claims to be a PNG but cannot be decoded.
    await input.setInputFiles({
        name: 'corrupt.png',
        mimeType: 'image/png',
        buffer: Buffer.from('this is plain text, not image data'),
    });
    await expect(error).toBeVisible();
    await expect(error).toContainText("Couldn't open image");
    await expect(error).toContainText(
        '“corrupt.png” could not be read as an image. Your current image was kept.'
    );
    await expect(current).toContainText('1000x835');

    await page.getByRole('button', { name: 'Dismiss image error' }).click();
    await expect(error).toHaveCount(0);

    // A truncated PNG keeps a valid header, so an <img> alone would load its
    // first rows and silently replace the current image with a partial one.
    const bytes = readFileSync(source);
    await input.setInputFiles({
        name: 'truncated.png',
        mimeType: 'image/png',
        buffer: bytes.subarray(0, Math.floor(bytes.length / 3)),
    });
    await expect(error).toContainText('“truncated.png” could not be read as an image.');
    await expect(current).toContainText('1000x835');

    await input.setInputFiles({
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('not an image'),
    });
    await expect(error).toContainText('Please upload an image file');
    await expect(current).toContainText('1000x835');

    // Failed imports add no history: one undo returns to the starter image.
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    await undo.click();
    await expect(current).toContainText('1024x1024');
    await expect(undo).toBeDisabled();

    // A successful import clears the previous error.
    await input.setInputFiles({
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('not an image'),
    });
    await expect(error).toBeVisible();
    await input.setInputFiles(source);
    await expect(error).toHaveCount(0);
    await expect(current).toContainText('1000x835');
});

test('@smoke removing the image clears the import error and later errors omit the kept-image note', async ({
    page,
}) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    const input = page.getByTestId('image-file-input');
    const error = page.getByTestId('image-import-error');
    const corrupt = {
        name: 'corrupt.png',
        mimeType: 'image/png',
        buffer: Buffer.from('this is plain text, not image data'),
    };
    await input.setInputFiles(corrupt);
    await expect(error).toBeVisible();

    await page.getByRole('button', { name: 'Remove image', exact: true }).click();
    await expect(error).toHaveCount(0);

    await input.setInputFiles(corrupt);
    await expect(error).toContainText(
        '“corrupt.png” could not be read as an image. Choose a valid PNG, JPEG, or WebP file.'
    );
    await expect(error).not.toContainText('current image was kept');
});

test('@smoke valid JPEG and SVG files still import', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    const input = page.getByTestId('image-file-input');
    const current = page.getByText('Current', { exact: true }).locator('..');
    const error = page.getByTestId('image-import-error');

    await input.setInputFiles(fileURLToPath(new URL('../assets/3888x2916p.jpg', import.meta.url)));
    await expect(current).toContainText('3888x2916');

    // SVGs skip the createImageBitmap check, which Chrome does not support for them.
    await input.setInputFiles({
        name: 'shape.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="red"/></svg>'
        ),
    });
    await expect(current).toContainText('40x30');
    await expect(error).toHaveCount(0);
});
