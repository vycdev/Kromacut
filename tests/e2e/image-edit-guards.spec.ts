import { expect, test, type Page } from '@playwright/test';

interface HeldEncoding {
    holdNextEncoding: boolean;
    releaseEncoding?: () => void;
}
const currentSize = (page: Page) => page.getByText('Current', { exact: true }).locator('..');
const resizeApply = (page: Page) =>
    page
        .getByTestId('image-resize-percent-slider')
        .locator('..')
        .locator('..')
        .getByRole('button', { name: 'Apply', exact: true });

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
async function holdNextEncoding(page: Page) {
    await page.evaluate(() => {
        (window as unknown as HeldEncoding).holdNextEncoding = true;
    });
}
async function waitForEncoding(page: Page) {
    await expect
        .poll(() => page.evaluate(() => !!(window as unknown as HeldEncoding).releaseEncoding))
        .toBe(true);
}
async function releaseEncoding(page: Page) {
    await page.evaluate(() => (window as unknown as HeldEncoding).releaseEncoding?.());
}
async function blur(page: Page) {
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.clear();
        const state = window as unknown as HeldEncoding;
        const toBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (...args: Parameters<typeof toBlob>) {
            if (!state.holdNextEncoding) return toBlob.apply(this, args);
            state.holdNextEncoding = false;
            state.releaseEncoding = () => {
                delete state.releaseEncoding;
                toBlob.apply(this, args);
            };
        };
    });
    await page.goto('/app');
    await expect(currentSize(page)).toContainText('1024x1024');
    await page.getByTestId('image-file-input').setInputFiles(await image(page, 64));
    await expect(currentSize(page)).toContainText('64x64');
    await expect(resizeApply(page)).toBeEnabled();
});

for (const modifier of ['Control', 'Meta']) {
    test(`@smoke ${modifier}+Z uses 2D history and respects fields, drafts, crop and 3D`, async ({
        page,
    }) => {
        await resizeApply(page).click();
        await expect(currentSize(page)).toContainText('32x32');
        await blur(page);
        await page.keyboard.press(`${modifier}+z`);
        await expect(currentSize(page)).toContainText('64x64');
        await page.keyboard.press(`${modifier}+Shift+z`);
        await expect(currentSize(page)).toContainText('32x32');

        // All editable targets retain their native editing shortcuts.
        for (const kind of ['text', 'number', 'textarea', 'select', 'contenteditable']) {
            await page.evaluate((kind) => {
                const el = document.createElement(
                    kind === 'textarea' || kind === 'select'
                        ? kind
                        : kind === 'contenteditable'
                          ? 'div'
                          : 'input'
                );
                el.id = 'shortcut-focus';
                if (el instanceof HTMLInputElement) el.type = kind;
                if (kind === 'contenteditable') el.contentEditable = 'true';
                document.body.append(el);
                el.focus();
            }, kind);
            await page.keyboard.press(`${modifier}+z`);
            await expect(currentSize(page)).toContainText('32x32');
            await page.locator('#shortcut-focus').evaluate((el) => el.remove());
        }
        await page.getByTitle('Create new palette', { exact: true }).click();
        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toBeVisible();
        await dialog.getByRole('textbox').first().fill('Unsaved palette');
        // Focus a button: modal protection must not depend on a focused text input.
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).focus();
        await page.keyboard.press(`${modifier}+z`);
        await expect(currentSize(page)).toContainText('32x32');
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

        await page.getByRole('button', { name: 'Crop', exact: true }).click();
        await blur(page);
        await page.keyboard.press(`${modifier}+z`);
        await expect(currentSize(page)).toContainText('32x32');
        await page.getByRole('button', { name: 'Cancel crop', exact: true }).click();
        await page.getByRole('button', { name: '3D', exact: true }).click();
        await blur(page);
        await page.keyboard.press(`${modifier}+z`);
        await page.getByRole('button', { name: '2D', exact: true }).click();
        await expect(currentSize(page)).toContainText('32x32');
        await blur(page);
        await page.keyboard.press(`${modifier}+z`);
        await expect(currentSize(page)).toContainText('64x64');
    });
}

for (const operation of ['quantize', 'dedither']) {
    test(`@smoke ${operation} refuses imports, competing edits and history shortcuts`, async ({
        page,
    }) => {
        const input = page.getByTestId('image-file-input');
        const rejectedFile = await image(page, 48);
        await holdNextEncoding(page);
        await page.getByTestId(`${operation}-apply`).click();
        await waitForEncoding(page);
        await expect(input).toBeDisabled();
        await expect(resizeApply(page)).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
        await expect(
            page.getByRole('button', { name: 'Remove image', exact: true })
        ).toBeDisabled();
        // Programmatic change events must be guarded too, even when disabled UI is bypassed.
        await input.setInputFiles(rejectedFile);
        const transfer = await page.evaluateHandle(
            (bytes) => {
                const data = new DataTransfer();
                data.items.add(
                    new File([new Uint8Array(bytes)], 'dropped.png', { type: 'image/png' })
                );
                return data;
            },
            [...rejectedFile.buffer]
        );
        await page.getByTestId('image-dropzone').dispatchEvent('drop', { dataTransfer: transfer });
        await transfer.dispose();
        await blur(page);
        await page.keyboard.press('Control+z');
        await page.keyboard.press('Meta+Shift+z');
        await expect(currentSize(page)).toContainText('64x64');
        await releaseEncoding(page);
        await expect(input).toBeEnabled();
        await expect(page.getByTestId(`${operation}-apply`)).toBeEnabled();
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(currentSize(page)).toContainText('64x64');
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(currentSize(page)).toContainText('1024x1024');
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    });
}

for (const replacement of ['import', 'quantize', 'dedither']) {
    test(`@smoke late resize is discarded after ${replacement}`, async ({ page }) => {
        const file = await image(page, 48);
        await holdNextEncoding(page);
        await resizeApply(page).click();
        await waitForEncoding(page);
        if (replacement === 'import') {
            await page.getByTestId('image-file-input').setInputFiles(file);
            await expect(currentSize(page)).toContainText('48x48');
        } else {
            await page.getByTestId(`${replacement}-apply`).click();
            await expect(page.getByTestId(`${replacement}-apply`)).toBeEnabled();
            // Wait for processing and committed image decoding before releasing the older edit.
            await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
        }
        await releaseEncoding(page);
        await expect(resizeApply(page)).toBeEnabled();
        await expect(currentSize(page)).toContainText(replacement === 'import' ? '48x48' : '64x64');
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(currentSize(page)).toContainText('64x64');
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(currentSize(page)).toContainText('1024x1024');
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    });
}

test('@smoke an import started before processing cannot land after processing completes', async ({
    page,
}) => {
    await page.evaluate(() => {
        const w = window as unknown as { releaseImport?: () => void; staleBitmapClosed: boolean };
        w.staleBitmapClosed = false;
        const create = window.createImageBitmap.bind(window);
        window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
            const bitmap = await create(...args);
            if (args[0] instanceof File && args[0].name === '48.png') {
                const close = bitmap.close.bind(bitmap);
                bitmap.close = () => {
                    w.staleBitmapClosed = true;
                    close();
                };
                await new Promise<void>((resolve) => {
                    w.releaseImport = resolve;
                });
            }
            return bitmap;
        }) as typeof window.createImageBitmap;
    });
    await page.getByTestId('image-file-input').setInputFiles(await image(page, 48));
    await expect
        .poll(() =>
            page.evaluate(
                () => !!(window as unknown as { releaseImport?: () => void }).releaseImport
            )
        )
        .toBe(true);
    await holdNextEncoding(page);
    await page.getByTestId('quantize-apply').click();
    await waitForEncoding(page);
    await releaseEncoding(page);
    await expect(page.getByTestId('quantize-apply')).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    await page.evaluate(() => (window as unknown as { releaseImport: () => void }).releaseImport());
    await expect
        .poll(() =>
            page.evaluate(
                () => (window as unknown as { staleBitmapClosed: boolean }).staleBitmapClosed
            )
        )
        .toBe(true);
    await expect(currentSize(page)).toContainText('64x64');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(currentSize(page)).toContainText('64x64');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(currentSize(page)).toContainText('1024x1024');
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});
