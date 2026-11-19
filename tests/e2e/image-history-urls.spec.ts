import { expect, test, type Page } from '@playwright/test';

interface ObjectUrls {
    imports: string[];
    edits: string[];
    revoked: string[];
}

const currentSize = (page: Page) => page.getByText('Current', { exact: true }).locator('..');
const resizeApply = (page: Page) =>
    page
        .getByTestId('image-resize-percent-slider')
        .locator('..')
        .locator('..')
        .getByRole('button', { name: 'Apply', exact: true });
const objectUrls = (page: Page) =>
    page.evaluate(() => (window as unknown as { objectUrls: ObjectUrls }).objectUrls);
/** Whether the URL still resolves to its blob, i.e. the browser still holds the image. */
const readable = (page: Page, url: string) =>
    page.evaluate(
        (url) =>
            fetch(url).then(
                () => true,
                () => false
            ),
        url
    );

async function image(page: Page, size: number) {
    const png = await page.evaluate((size) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(size / 2, 0, size / 2, size);
        return canvas.toDataURL().split(',')[1];
    }, size);
    return { name: `${size}.png`, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.clear();
        const log: ObjectUrls = { imports: [], edits: [], revoked: [] };
        (window as unknown as { objectUrls: ObjectUrls }).objectUrls = log;
        const create = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => {
            const url = create(blob);
            // Imported files get their own URL; edits create theirs from encoded blobs.
            (blob instanceof File ? log.imports : log.edits).push(url);
            return url;
        };
        const revoke = URL.revokeObjectURL.bind(URL);
        URL.revokeObjectURL = (url) => {
            log.revoked.push(url);
            revoke(url);
        };
    });
    await page.goto('/app');
    await expect(currentSize(page)).toContainText('1024x1024');
});

test('@smoke a discarded redo image is released and kept images stay readable', async ({
    page,
}) => {
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    const redo = page.getByRole('button', { name: 'Redo', exact: true });
    await page.getByTestId('image-file-input').setInputFiles(await image(page, 64));
    await expect(currentSize(page)).toContainText('64x64');
    await expect(resizeApply(page)).toBeEnabled();
    const [imported] = (await objectUrls(page)).imports;
    expect(imported).toMatch(/^blob:/);

    // Resize the import, so history holds an edit URL below the redo branch.
    await resizeApply(page).click();
    await expect(currentSize(page)).toContainText('32x32');
    // Resizing also decodes from a temporary URL that it revokes itself.
    const log = await objectUrls(page);
    const resized = log.edits.filter((url) => !log.revoked.includes(url));
    expect(resized).toHaveLength(1);
    await undo.click();
    await expect(currentSize(page)).toContainText('64x64');
    await undo.click();
    await expect(currentSize(page)).toContainText('1024x1024');
    await expect(redo).toBeEnabled();
    expect((await objectUrls(page)).revoked).not.toContain(imported);
    expect(await readable(page, imported)).toBe(true);
    expect(await readable(page, resized[0])).toBe(true);

    // A new edit discards both redo images: the import and its resize.
    await resizeApply(page).click();
    await expect(currentSize(page)).toContainText('512x512');
    await expect(redo).toBeDisabled();
    await expect
        .poll(async () => (await objectUrls(page)).revoked)
        .toEqual(expect.arrayContaining([imported, resized[0]]));
    expect(await readable(page, imported)).toBe(false);
    expect(await readable(page, resized[0])).toBe(false);

    // The current edit and the image below it are still in history and still load.
    await undo.click();
    await expect(currentSize(page)).toContainText('1024x1024');
    await redo.click();
    await expect(currentSize(page)).toContainText('512x512');
});

test('@smoke removing an image releases it but keeps the images below it', async ({ page }) => {
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    await page.getByTestId('image-file-input').setInputFiles(await image(page, 64));
    await expect(currentSize(page)).toContainText('64x64');
    await expect(resizeApply(page)).toBeEnabled();
    const [imported] = (await objectUrls(page)).imports;
    await resizeApply(page).click();
    await expect(currentSize(page)).toContainText('32x32');
    const log = await objectUrls(page);
    const resized = log.edits.filter((url) => !log.revoked.includes(url));
    expect(resized).toHaveLength(1);

    // Removing drops the resized image from history; the import stays undoable.
    await page.getByRole('button', { name: 'Remove image', exact: true }).click();
    await expect.poll(async () => (await objectUrls(page)).revoked).toContain(resized[0]);
    expect((await objectUrls(page)).revoked).not.toContain(imported);
    await undo.click();
    await expect(currentSize(page)).toContainText('64x64');
    expect(await readable(page, imported)).toBe(true);
});
