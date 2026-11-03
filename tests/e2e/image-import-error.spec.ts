import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test('@smoke unreadable image files report an error and keep the current image', async ({
    page,
}) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    const input = page.getByTestId('image-file-input');
    const current = page.getByText('Current', { exact: true }).locator('..');
    const error = page.getByTestId('image-import-error');
    const source = fileURLToPath(new URL('../assets/rocco__source.png', import.meta.url));
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
    await expect(error).toContainText('“corrupt.png” could not be read as an image.');
    await expect(current).toContainText('1000x835');

    await page.getByRole('button', { name: 'Dismiss image error' }).click();
    await expect(error).toHaveCount(0);

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
