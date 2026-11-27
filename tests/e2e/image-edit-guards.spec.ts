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
        // A stale resize that slipped past its guard would decode and encode again,
        // so re-arm the hold before releasing the first encode.
        await page.evaluate(() => {
            const state = window as unknown as HeldEncoding;
            const release = state.releaseEncoding;
            state.holdNextEncoding = true;
            release?.();
        });
        await page.waitForTimeout(300);
        expect(
            await page.evaluate(() => !!(window as unknown as HeldEncoding).releaseEncoding)
        ).toBe(false);
        await page.evaluate(() => {
            (window as unknown as HeldEncoding).holdNextEncoding = false;
        });
        await expect(resizeApply(page)).toBeEnabled();
        await expect(currentSize(page)).toContainText(replacement === 'import' ? '48x48' : '64x64');
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(currentSize(page)).toContainText('64x64');
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(currentSize(page)).toContainText('1024x1024');
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    });
}

for (const reenter of [false, true]) {
    test(`@smoke Cancel Crop discards a crop still saving${reenter ? ' after crop is reopened' : ''}`, async ({
        page,
    }) => {
        const undo = page.getByRole('button', { name: 'Undo', exact: true });
        const redo = page.locator('button[aria-label="Redo"]');
        await page.getByRole('button', { name: 'Crop', exact: true }).click();
        await holdNextEncoding(page);
        await page.getByRole('button', { name: 'Save crop', exact: true }).click();
        await waitForEncoding(page);
        await page.getByRole('button', { name: 'Cancel crop', exact: true }).click();
        // An older save must not land in a later crop session either.
        if (reenter) await page.getByRole('button', { name: 'Crop', exact: true }).click();
        await releaseEncoding(page);
        await page.waitForTimeout(300);
        await expect(page.getByRole('button', { name: 'Cancel crop', exact: true })).toHaveCount(
            reenter ? 1 : 0
        );
        await expect(currentSize(page)).toContainText('64x64');
        await expect(redo).toBeDisabled();
        if (reenter) await page.getByRole('button', { name: 'Cancel crop', exact: true }).click();
        // History still holds only the import.
        await undo.click();
        await expect(currentSize(page)).toContainText('1024x1024');
        await expect(undo).toBeDisabled();
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

for (const operation of ['quantize', 'dedither']) {
    test(`@smoke a text draft survives ${operation} without output and still commits to history`, async ({
        page,
    }) => {
        const preview = page.getByTestId('image-dropzone').locator('canvas').first();
        const pixels = () => preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
        const before = await pixels();
        await page.getByTestId('touchup-tool-text').click();
        const box = (await preview.boundingBox())!;
        await preview.click({ position: { x: box.width / 2, y: box.height / 2 } });
        const text = page.getByRole('textbox', { name: 'Text to place on the image', exact: true });
        await text.fill('TT');
        await page.evaluate(() => {
            const w = window as unknown as { failProcessingEncode: boolean };
            w.failProcessingEncode = true;
            const toBlob = HTMLCanvasElement.prototype.toBlob;
            HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
                if (w.failProcessingEncode) {
                    queueMicrotask(() => callback(null));
                    return;
                }
                toBlob.call(this, callback, type, quality);
            };
        });
        await page.getByTestId(`${operation}-apply`).click();
        await expect(page.getByTestId(`${operation}-apply`)).toBeEnabled();
        await expect(text).toBeVisible();
        await expect(text).toHaveValue('TT');
        await expect.poll(pixels).toBe(before);
        await page.evaluate(() => {
            (window as unknown as { failProcessingEncode: boolean }).failProcessingEncode = false;
        });
        await page.getByTestId('touchup-text-apply').click();
        await expect(text).toHaveCount(0);
        // Swatch recomputation follows the history commit, not just the live rasterization.
        await expect(
            page.getByTitle('#000000  alpha:255  count:2048', { exact: true })
        ).toHaveCount(0);
        await expect.poll(async () => (await pixels()) !== before).toBe(true);
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect.poll(pixels).toBe(before);
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(currentSize(page)).toContainText('1024x1024');
    });
}

interface ProcessingEncodes {
    failProcessingEncode: boolean;
    failPatched?: boolean;
    processingInputs: boolean[];
}
const processingInputs = (page: Page) =>
    page.evaluate(() => (window as unknown as ProcessingEncodes).processingInputs);

async function failProcessingEncodes(page: Page, fail: boolean) {
    await page.evaluate((fail) => {
        const w = window as unknown as ProcessingEncodes;
        w.failProcessingEncode = fail;
        if (w.failPatched) return;
        w.failPatched = true;
        w.processingInputs = [];
        const toBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
            if (w.failProcessingEncode) {
                // Record whether processing read the committed 64x64 fixture: black left
                // half, white right half, no touch-up pixels.
                const data =
                    this.width === 64 && this.height === 64
                        ? this.getContext('2d')?.getImageData(0, 0, 64, 64).data
                        : undefined;
                if (data) {
                    let clean = true;
                    for (let i = 0; i < 64 * 64 && clean; i++) {
                        const v = i % 64 < 32 ? 0 : 255;
                        clean =
                            data[i * 4] === v &&
                            data[i * 4 + 1] === v &&
                            data[i * 4 + 2] === v &&
                            data[i * 4 + 3] === 255;
                    }
                    w.processingInputs.push(clean);
                }
                queueMicrotask(() => callback(null));
                return;
            }
            toBlob.call(this, callback, type, quality);
        };
    }, fail);
}

for (const operation of ['quantize', 'dedither']) {
    test(`@smoke a brush stroke still saving when ${operation} starts is rolled back`, async ({
        page,
    }) => {
        const preview = page.getByTestId('image-dropzone').locator('canvas').first();
        const pixels = () => preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
        const before = await pixels();
        await page.getByTestId('touchup-tool-brush').click();
        const box = (await preview.boundingBox())!;
        await holdNextEncoding(page);
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 8 });
        await page.mouse.up();
        // The stroke is drawn but its history entry is still encoding.
        await waitForEncoding(page);
        await expect.poll(pixels).not.toBe(before);

        await failProcessingEncodes(page, true);
        await page.getByTestId(`${operation}-apply`).click();
        await expect(page.getByTestId(`${operation}-apply`)).toBeEnabled();
        await releaseEncoding(page);
        await failProcessingEncodes(page, false);
        // The stroke was dropped before processing read the canvas.
        expect(await processingInputs(page)).toEqual([true]);

        // Processing produced nothing and refused the stroke: canvas and history agree.
        await expect.poll(pixels).toBe(before);
        await page.getByTestId('touchup-tool-brush').click();
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(currentSize(page)).toContainText('1024x1024');
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    });

    test(`@smoke a brush stroke in progress stops when ${operation} starts`, async ({ page }) => {
        const preview = page.getByTestId('image-dropzone').locator('canvas').first();
        const pixels = () => preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
        const before = await pixels();
        await page.getByTestId('touchup-tool-brush').click();
        const box = (await preview.boundingBox())!;
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3, { steps: 8 });
        await expect.poll(pixels).not.toBe(before);

        // Start processing while the pointer is still down.
        await failProcessingEncodes(page, true);
        await page
            .getByTestId(`${operation}-apply`)
            .evaluate((button: HTMLButtonElement) => button.click());
        await expect(page.getByTestId(`${operation}-apply`)).toBeEnabled();
        await failProcessingEncodes(page, false);
        expect(await processingInputs(page)).toEqual([true]);
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 8 });
        await page.mouse.up();

        await expect.poll(pixels).toBe(before);
        await page.getByTestId('touchup-tool-brush').click();
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(currentSize(page)).toContainText('1024x1024');
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    });
}

test('@smoke Ctrl+Z ignores an open select list and follows the physical Z key', async ({
    page,
}) => {
    await resizeApply(page).click();
    await expect(currentSize(page)).toContainText('32x32');
    await page.getByRole('combobox').first().click();
    await expect(page.getByRole('listbox')).toBeVisible();
    // The open select hides the rest of the page from the accessibility tree.
    const redo = page.locator('button[aria-label="Redo"]');
    await page.keyboard.press('Control+z');
    // History updates within the key event, unlike the decoded image size, so read it
    // once instead of letting an auto-waiting assertion pass before an undo lands.
    expect(await redo.isDisabled()).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(currentSize(page)).toContainText('32x32');
    await expect(redo).toBeDisabled();

    // A Ukrainian layout reports `я` for the physical Z key.
    await blur(page);
    await page.evaluate(() =>
        window.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'я',
                code: 'KeyZ',
                ctrlKey: true,
                bubbles: true,
                cancelable: true,
            })
        )
    );
    await expect(currentSize(page)).toContainText('64x64');
    await expect(redo).toBeEnabled();
});

test('@smoke a keyboard adjustment commits before dedither takes the edit lock', async ({
    page,
}) => {
    const preview = page.getByTestId('image-dropzone').locator('canvas').first();
    const pixels = () => preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    const before = await pixels();
    await page
        .getByText('Contrast', { exact: true })
        .first()
        .locator('../..')
        .getByRole('slider')
        .focus();
    // Minimum contrast turns the black and white fixture grey.
    await page.keyboard.press('Home');
    // Clicking Dedither blurs the slider first; its commit must not wait a frame.
    await failProcessingEncodes(page, true);
    await page.getByTestId('dedither-apply').click();
    await expect(page.getByTestId('dedither-apply')).toBeEnabled();
    await failProcessingEncodes(page, false);
    // Processing read the adjusted image, and the preview shows the slider's value.
    expect(await processingInputs(page)).toEqual([false]);
    await expect.poll(pixels).not.toBe(before);
});

test('@smoke a drag commit still pending a frame lands before dedither takes the edit lock', async ({
    page,
}) => {
    const preview = page.getByTestId('image-dropzone').locator('canvas').first();
    const pixels = () => preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    const before = await pixels();
    await page
        .getByText('Contrast', { exact: true })
        .first()
        .locator('../..')
        .getByRole('slider')
        .focus();
    await page.keyboard.press('Home');
    await failProcessingEncodes(page, true);
    // Release the drag, then move focus and click within the same frame, before the
    // slider's deferred commit runs.
    await page.getByTestId('dedither-apply').evaluate((button: HTMLButtonElement) => {
        window.dispatchEvent(new PointerEvent('pointerup'));
        button.focus();
        button.click();
    });
    await expect(page.getByTestId('dedither-apply')).toBeEnabled();
    await failProcessingEncodes(page, false);
    expect(await processingInputs(page)).toEqual([false]);
    await expect.poll(pixels).not.toBe(before);
});

test('@smoke a slider value React has not rendered yet still commits on blur', async ({ page }) => {
    const preview = page.getByTestId('image-dropzone').locator('canvas').first();
    const pixels = () => preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    const before = await pixels();
    const slider = page
        .getByText('Contrast', { exact: true })
        .first()
        .locator('../..')
        .getByRole('slider');
    await slider.focus();
    await failProcessingEncodes(page, true);
    // Change the value, move focus and click in one task, before React renders the change.
    await slider.evaluate((thumb: HTMLElement) => {
        thumb.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })
        );
        const button = document.querySelector<HTMLButtonElement>('[data-testid="dedither-apply"]')!;
        button.focus();
        button.click();
    });
    await expect(page.getByTestId('dedither-apply')).toBeEnabled();
    await failProcessingEncodes(page, false);
    expect(await processingInputs(page)).toEqual([false]);
    await expect.poll(pixels).not.toBe(before);
});
