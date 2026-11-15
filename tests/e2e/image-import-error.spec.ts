import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const source = fileURLToPath(new URL('../assets/rocco__source.png', import.meta.url));

/** A valid, all-black 1-bit grayscale PNG of the given size. */
function blackPng(width: number, height: number): Buffer {
    const chunk = (type: string, data: Buffer) => {
        const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(body));
        return Buffer.concat([length, body, crc]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 1; // bit depth; color type 0 (grayscale), no interlacing
    // Each row is a filter byte followed by zeroed pixels.
    const pixels = Buffer.alloc((1 + Math.ceil(width / 8)) * height);
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(pixels)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

// SVG dimensions exercise the area guard without decoding a gigabyte of pixels.
function sizedSvg(width: number, height: number) {
    return {
        name: 'large.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="red"/></svg>`
        ),
    };
}

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

test('@smoke images over the canvas size limit report their size and keep the current image', async ({
    page,
}) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    const input = page.getByTestId('image-file-input');
    const current = page.getByText('Current', { exact: true }).locator('..');
    const error = page.getByTestId('image-import-error');
    await input.setInputFiles(source);
    await expect(current).toContainText('1000x835');

    // Small in pixels, but over the per-dimension import bound.
    const wide = { ...sizedSvg(65536, 8), name: 'wide.svg' };
    await input.setInputFiles(wide);
    await expect(error).toContainText("Couldn't open image");
    await expect(error).toContainText(
        '“wide.svg” is 65536×8 pixels, which is too large to open. Your current image was kept. Resize it to 16384×16384 pixels or smaller and try again.'
    );
    await expect(current).toContainText('1000x835');

    // The refused image adds no history: one undo returns to the starter image.
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    await undo.click();
    await expect(current).toContainText('1024x1024');
    await expect(undo).toBeDisabled();
    await expect(error).toHaveCount(0);

    await page.getByRole('button', { name: 'Remove image', exact: true }).click();
    await input.setInputFiles(wide);
    await expect(error).toContainText(
        '“wide.svg” is 65536×8 pixels, which is too large to open. Resize it to 16384×16384 pixels or smaller and try again.'
    );

    // A thin panorama beyond the historical Firefox limit still imports when
    // the current browser can draw it, in either orientation.
    for (const [width, height] of [
        [40000, 8],
        [8, 40000],
    ]) {
        await input.setInputFiles({
            name: 'panorama.png',
            mimeType: 'image/png',
            buffer: blackPng(width, height),
        });
        await expect(current).toContainText(`${width}x${height}`);
    }
    await expect(error).toHaveCount(0);
});

test('@smoke images over the canvas area limit are refused through the file picker and drag-drop', async ({
    page,
}) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    const current = page.getByText('Current', { exact: true }).locator('..');
    await page.getByTestId('image-file-input').setInputFiles(source);
    await expect(current).toContainText('1000x835');
    const large = sizedSvg(17000, 17000);
    const error = page.getByTestId('image-import-error');
    await page.getByTestId('image-file-input').setInputFiles(large);
    await expect(error).toContainText('17000×17000');
    await expect(current).toContainText('1000x835');

    await page.getByRole('button', { name: 'Dismiss image error' }).click();
    const dataTransfer = await page.evaluateHandle((svg) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([svg], 'dropped.svg', { type: 'image/svg+xml' }));
        return transfer;
    }, large.buffer.toString());
    await page.getByTestId('image-dropzone').dispatchEvent('drop', { dataTransfer });
    await dataTransfer.dispose();
    await expect(error).toContainText('“dropped.svg” is 17000×17000 pixels');
    await expect(current).toContainText('1000x835');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(current).toContainText('1024x1024');
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

for (const device of [
    { name: 'iPhone', platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone)', touches: 5 },
    {
        name: 'desktop-mode iPad',
        platform: 'MacIntel',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
        touches: 5,
    },
]) {
    test(`@smoke ${device.name} imports use the lower canvas area budget and resize advice`, async ({
        page,
    }) => {
        await page.addInitScript((device) => {
            localStorage.clear();
            Object.defineProperties(Navigator.prototype, {
                platform: { configurable: true, get: () => device.platform },
                userAgent: { configurable: true, get: () => device.userAgent },
                maxTouchPoints: { configurable: true, get: () => device.touches },
            });
        }, device);
        await page.goto('/app');
        const current = page.getByText('Current', { exact: true }).locator('..');
        const input = page.getByTestId('image-file-input');
        await input.setInputFiles(source);
        await expect(current).toContainText('1000x835');
        await input.setInputFiles(sizedSvg(9000, 9000));
        await expect(page.getByTestId('image-import-error')).toContainText(
            '9000×9000 pixels, which is too large to open. Your current image was kept. Resize it to 4096×4096 pixels or smaller'
        );
        await expect(current).toContainText('1000x835');
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(current).toContainText('1024x1024');
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    });
}

test('@smoke canvas privacy noise allows valid imports and still rejects blank probe results', async ({
    page,
}) => {
    await page.addInitScript(() => {
        localStorage.clear();
        const state = window as unknown as {
            refuseCanvasProbe: boolean;
            canvasProbeAlphas: number[];
        };
        state.refuseCanvasProbe = false;
        state.canvasProbeAlphas = [];
        const fillRect = CanvasRenderingContext2D.prototype.fillRect;
        const getImageData = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.fillRect = function (...args) {
            if (state.refuseCanvasProbe && (this.canvas.width === 1 || this.canvas.height === 1)) {
                return;
            }
            return fillRect.apply(this, args);
        };
        CanvasRenderingContext2D.prototype.getImageData = function (...args) {
            const pixels = getImageData.apply(this, args);
            if (
                (this.canvas.width === 1 || this.canvas.height === 1) &&
                args[2] === 1 &&
                args[3] === 1
            ) {
                // Privacy noise can move opaque alpha down and transparent alpha up.
                const alpha = pixels.data[3];
                pixels.data[3] = alpha === 0 ? 3 : Math.max(0, alpha - 3);
                state.canvasProbeAlphas.push(pixels.data[3]);
            }
            return pixels;
        };
    });
    await page.goto('/app');
    const input = page.getByTestId('image-file-input');
    const current = page.getByText('Current', { exact: true }).locator('..');
    const error = page.getByTestId('image-import-error');
    const alphas = () =>
        page.evaluate(
            () => (window as unknown as { canvasProbeAlphas: number[] }).canvasProbeAlphas
        );
    await input.setInputFiles(source);
    await expect(current).toContainText('1000x835');
    await expect(error).toHaveCount(0);
    await expect.poll(alphas).toContain(252);

    // A nonzero but nearly transparent readback must still refuse the import.
    await page.evaluate(() => {
        (window as unknown as { refuseCanvasProbe: boolean }).refuseCanvasProbe = true;
    });
    await input.setInputFiles(source);
    await expect(error).toContainText('Your current image was kept.');
    await expect.poll(alphas).toContain(3);
    await expect(current).toContainText('1000x835');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(current).toContainText('1024x1024');
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

for (const failure of ['silent', 'throw'] as const) {
    test(`@smoke lower browser dimension limits are detected when canvas refusal is ${failure}`, async ({
        page,
    }) => {
        await page.addInitScript((failure) => {
            localStorage.clear();
            const getContext = HTMLCanvasElement.prototype.getContext;
            Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
                value(this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
                    if (this.width > 32767 || this.height > 32767) {
                        if (failure === 'throw') throw new DOMException('Canvas exceeds max size');
                        // Model a context that exists but silently ignores drawing.
                        return {
                            fillRect() {},
                            getImageData: () => ({ data: new Uint8ClampedArray(4) }),
                        };
                    }
                    return getContext.apply(this, args);
                },
            });
        }, failure);
        await page.goto('/app');
        const input = page.getByTestId('image-file-input');
        const current = page.getByText('Current', { exact: true }).locator('..');
        await input.setInputFiles(source);
        await expect(current).toContainText('1000x835');
        for (const [width, height] of [
            [32768, 8],
            [8, 32768],
        ]) {
            await input.setInputFiles({
                name: 'wide.png',
                mimeType: 'image/png',
                buffer: blackPng(width, height),
            });
            await expect(page.getByTestId('image-import-error')).toContainText(
                `${width}×${height} pixels, which is too large to open. Your current image was kept.`
            );
            await expect(current).toContainText('1000x835');
        }
    });
}

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

test('@smoke the import error closes when the image changes and does not come back', async ({
    page,
}) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    const input = page.getByTestId('image-file-input');
    const current = page.getByText('Current', { exact: true }).locator('..');
    const error = page.getByTestId('image-import-error');
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    const redo = page.getByRole('button', { name: 'Redo', exact: true });
    const corrupt = {
        name: 'corrupt.png',
        mimeType: 'image/png',
        buffer: Buffer.from('this is plain text, not image data'),
    };
    await input.setInputFiles(source);
    await expect(current).toContainText('1000x835');
    await input.setInputFiles(corrupt);
    await expect(error).toContainText('Your current image was kept.');

    await undo.click();
    await expect(current).toContainText('1024x1024');
    await expect(error).toHaveCount(0);
    // Redo returns to the image the import failed on; the notice stays closed.
    await redo.click();
    await expect(current).toContainText('1000x835');
    await expect(error).toHaveCount(0);

    // A failure with no image loaded must not later claim an image was kept
    // once Undo brings one back.
    await page.getByRole('button', { name: 'Remove image', exact: true }).click();
    await input.setInputFiles(corrupt);
    await expect(error).toBeVisible();
    await expect(error).not.toContainText('current image was kept');
    await undo.click();
    await expect(current).toContainText('1024x1024');
    await expect(error).toHaveCount(0);
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

test('@smoke raster imports share one decode through validation, preview, and swatches', async ({
    page,
}) => {
    await page.addInitScript(() => {
        // Hold createImageBitmap for imported files until the test releases it,
        // and record the object URLs that <img> elements load meanwhile.
        const w = window as unknown as {
            bitmapCalls: number;
            bitmapCloses: number;
            historyCalls: number;
            historyCloses: number;
            heldImageBitmaps: Array<() => void>;
            importUrls: string[];
            imageSrcs: string[];
        };
        w.bitmapCalls = 0;
        w.bitmapCloses = 0;
        w.historyCalls = 0;
        w.historyCloses = 0;
        w.heldImageBitmaps = [];
        w.importUrls = [];
        w.imageSrcs = [];
        const fileUrls = new WeakMap<File, string>();
        const checkedUrls = new Set<string>();
        const createBitmap = window.createImageBitmap.bind(window);
        window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => {
            if (!(args[0] instanceof File)) return createBitmap(...args);
            const url = fileUrls.get(args[0]);
            if (url && checkedUrls.has(url)) {
                w.historyCalls++;
                return createBitmap(...args).then((bitmap) => {
                    const close = bitmap.close.bind(bitmap);
                    bitmap.close = () => {
                        w.historyCloses++;
                        close();
                    };
                    return bitmap;
                });
            }
            if (url) checkedUrls.add(url);
            w.bitmapCalls += 1;
            return new Promise<ImageBitmap>((resolve, reject) => {
                w.heldImageBitmaps.push(() =>
                    createBitmap(...args).then((bitmap) => {
                        const close = bitmap.close.bind(bitmap);
                        bitmap.close = () => {
                            w.bitmapCloses++;
                            close();
                        };
                        resolve(bitmap);
                    }, reject)
                );
            });
        }) as typeof createImageBitmap;
        const createUrl = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (object: Blob | MediaSource) => {
            const url = createUrl(object);
            if (object instanceof File) {
                w.importUrls.push(url);
                fileUrls.set(object, url);
            }
            return url;
        };
        const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
            ...src,
            set(value: string) {
                w.imageSrcs.push(value);
                src.set!.call(this, value);
            },
        });
    });
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    const input = page.getByTestId('image-file-input');
    const current = page.getByText('Current', { exact: true }).locator('..');
    const state = () =>
        page.evaluate(() => {
            const w = window as unknown as {
                bitmapCalls: number;
                bitmapCloses: number;
                historyCalls: number;
                historyCloses: number;
                importUrls: string[];
                imageSrcs: string[];
            };
            return {
                bitmapCalls: w.bitmapCalls,
                bitmapCloses: w.bitmapCloses,
                historyCalls: w.historyCalls,
                historyCloses: w.historyCloses,
                imageLoads: w.imageSrcs.filter((src) => w.importUrls.includes(src)).length,
            };
        });
    await expect(current).toContainText('1024x1024');

    await input.setInputFiles(fileURLToPath(new URL('../assets/3888x2916p.jpg', import.meta.url)));
    await expect
        .poll(state)
        .toEqual({
            bitmapCalls: 1,
            bitmapCloses: 0,
            historyCalls: 0,
            historyCloses: 0,
            imageLoads: 0,
        });
    await expect(page.getByTestId('image-import-busy')).toHaveText('Checking image…');
    const busyBox = await page.getByTestId('image-import-busy').boundingBox();
    const chooseBox = await page
        .getByRole('button', { name: 'Choose file', exact: true })
        .boundingBox();
    expect(busyBox!.y).toBeGreaterThan(chooseBox!.y + chooseBox!.height);
    await expect(page.getByTestId('image-dropzone')).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => {
        const w = window as unknown as { heldImageBitmaps: Array<() => void> };
        w.heldImageBitmaps.splice(0).forEach((run) => run());
    });
    await expect(current).toContainText('3888x2916');
    await expect(page.getByTestId('image-import-busy')).toHaveCount(0);
    await expect(page.getByText('Updating…', { exact: true })).toHaveCount(0);
    expect(await state()).toEqual({
        bitmapCalls: 1,
        bitmapCloses: 1,
        historyCalls: 0,
        historyCloses: 0,
        imageLoads: 0,
    });

    // History retains URLs, not open bitmaps. A revisit decodes once for all
    // consumers, and never tries to draw the now-closed validation bitmap.
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(current).toContainText('1024x1024');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(current).toContainText('3888x2916');
    await expect(page.getByText('Updating…', { exact: true })).toHaveCount(0);
    expect(await state()).toEqual({
        bitmapCalls: 1,
        bitmapCloses: 1,
        historyCalls: 1,
        historyCloses: 1,
        imageLoads: 0,
    });
});

test('@smoke image files without a MIME type import by extension', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    const dropzone = page.getByTestId('image-dropzone');
    const current = page.getByText('Current', { exact: true }).locator('..');
    const error = page.getByTestId('image-import-error');
    // Some platforms report an empty File.type for valid images.
    const drop = async (name: string) => {
        const dataTransfer = await page.evaluateHandle(async (name) => {
            const canvas = document.createElement('canvas');
            canvas.width = 37;
            canvas.height = 23;
            canvas.getContext('2d')!.fillRect(0, 0, 37, 23);
            const blob = await (await fetch(canvas.toDataURL('image/png'))).blob();
            const transfer = new DataTransfer();
            transfer.items.add(new File([blob], name, { type: '' }));
            return transfer;
        }, name);
        await dropzone.dispatchEvent('drop', { dataTransfer });
    };
    await expect(current).toContainText('1024x1024');

    await drop('no-type.png');
    await expect(current).toContainText('37x23');
    await expect(error).toHaveCount(0);

    // Without an image extension, the file is still refused as a non-image.
    await drop('no-type.txt');
    await expect(error).toContainText('Please upload an image file');
    await expect(current).toContainText('37x23');
});

test('@smoke image edits made while an import is being checked cancel that import', async ({
    page,
}) => {
    await page.addInitScript(() => {
        // Hold createImageBitmap until the test releases it, and record which
        // files' object URLs are revoked so the test knows when a cancelled
        // import has finished.
        const w = window as unknown as {
            holdImageBitmaps: boolean;
            heldImageBitmaps: Array<() => void>;
            revokedImageNames: string[];
            closedImageNames: string[];
        };
        w.holdImageBitmaps = false;
        w.heldImageBitmaps = [];
        w.revokedImageNames = [];
        w.closedImageNames = [];
        const createBitmap = window.createImageBitmap.bind(window);
        const checked = new WeakSet<File>();
        const decode = (args: Parameters<typeof createImageBitmap>, isImport: boolean) =>
            createBitmap(...args).then((bitmap) => {
                const close = bitmap.close.bind(bitmap);
                bitmap.close = () => {
                    if (isImport && args[0] instanceof File) w.closedImageNames.push(args[0].name);
                    close();
                };
                return bitmap;
            });
        window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => {
            const isImport = args[0] instanceof File && !checked.has(args[0]);
            if (args[0] instanceof File) checked.add(args[0]);
            if (!w.holdImageBitmaps || !isImport) return decode(args, isImport);
            return new Promise<ImageBitmap>((resolve, reject) => {
                w.heldImageBitmaps.push(() => decode(args, isImport).then(resolve, reject));
            });
        }) as typeof createImageBitmap;
        const names = new Map<string, string>();
        const createUrl = URL.createObjectURL.bind(URL);
        const revokeUrl = URL.revokeObjectURL.bind(URL);
        URL.createObjectURL = (object: Blob | MediaSource) => {
            const url = createUrl(object);
            if (object instanceof File) names.set(url, object.name);
            return url;
        };
        URL.revokeObjectURL = (url: string) => {
            const name = names.get(url);
            if (name) w.revokedImageNames.push(name);
            revokeUrl(url);
        };
    });
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    const input = page.getByTestId('image-file-input');
    const current = page.getByText('Current', { exact: true }).locator('..');
    const error = page.getByTestId('image-import-error');
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    const redo = page.getByRole('button', { name: 'Redo', exact: true });
    const removeImage = page.getByRole('button', { name: 'Remove image', exact: true });
    const jpeg = fileURLToPath(new URL('../assets/3888x2916p.jpg', import.meta.url));
    const held = () =>
        page.evaluate(
            () => (window as unknown as { heldImageBitmaps: unknown[] }).heldImageBitmaps.length
        );
    const revoked = () =>
        page.evaluate(
            () => (window as unknown as { revokedImageNames: string[] }).revokedImageNames
        );
    const hold = (on: boolean) =>
        page.evaluate((on) => {
            (window as unknown as { holdImageBitmaps: boolean }).holdImageBitmaps = on;
        }, on);
    const release = () =>
        page.evaluate(() => {
            const w = window as unknown as { heldImageBitmaps: Array<() => void> };
            w.heldImageBitmaps.splice(0).forEach((run) => run());
        });
    await expect(current).toContainText('1024x1024');

    // Undo while an import is pending: the undone state and its redo entry survive.
    await input.setInputFiles(source);
    await expect(current).toContainText('1000x835');
    await hold(true);
    await input.setInputFiles(jpeg);
    await expect.poll(held).toBe(1);
    await expect(page.getByTestId('image-import-busy')).toBeVisible();
    await undo.click();
    await expect(page.getByTestId('image-import-busy')).toHaveCount(0);
    await expect(current).toContainText('1024x1024');
    await release();
    await expect.poll(revoked).toEqual(['3888x2916p.jpg']);
    await expect(current).toContainText('1024x1024');
    await expect(redo).toBeEnabled();
    await expect(undo).toBeDisabled();

    // Remove image while an import is pending: the preview stays empty and the
    // history is unchanged.
    await input.setInputFiles(source);
    await expect.poll(held).toBe(1);
    await removeImage.click();
    await expect(removeImage).toBeDisabled();
    await release();
    await expect.poll(revoked).toEqual(['3888x2916p.jpg', 'rocco__source.png']);
    await expect(removeImage).toBeDisabled();
    await expect(page.getByText('1000x835')).toHaveCount(0);
    await expect(undo).toBeDisabled();
    await expect(redo).toBeEnabled();
    await expect(error).toHaveCount(0);
    expect(
        await page.evaluate(
            () => (window as unknown as { closedImageNames: string[] }).closedImageNames
        )
    ).toEqual(['rocco__source.png', '3888x2916p.jpg', 'rocco__source.png']);
});

test('@smoke imports are refused while quantize is running', async ({ page }) => {
    await page.addInitScript(() => {
        // Hold canvas PNG encoding until the test releases it, so quantize stays
        // in progress for as long as the test needs.
        const w = window as unknown as { holdToBlob: boolean; heldToBlobs: Array<() => void> };
        w.holdToBlob = false;
        w.heldToBlobs = [];
        const toBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (...args: Parameters<typeof toBlob>) {
            if (!w.holdToBlob) return toBlob.apply(this, args);
            w.heldToBlobs.push(() => toBlob.apply(this, args));
        };
    });
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    const input = page.getByTestId('image-file-input');
    const dropzone = page.getByTestId('image-dropzone');
    const current = page.getByText('Current', { exact: true }).locator('..');
    const chooseFile = page.getByRole('button', { name: 'Choose file', exact: true });
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    const apply = page.getByTestId('quantize-apply');
    await expect(current).toContainText('1024x1024');

    // Drops import normally while nothing is processing.
    const sourceDrop = await page.evaluateHandle(
        (bytes) => {
            const transfer = new DataTransfer();
            transfer.items.add(
                new File([new Uint8Array(bytes)], 'rocco__source.png', { type: 'image/png' })
            );
            return transfer;
        },
        [...readFileSync(source)]
    );
    await dropzone.dispatchEvent('drop', { dataTransfer: sourceDrop });
    await expect(current).toContainText('1000x835');

    await page.evaluate(() => {
        (window as unknown as { holdToBlob: boolean }).holdToBlob = true;
    });
    await apply.click();
    await expect(apply).toBeDisabled();
    await expect(chooseFile).toBeDisabled();
    await expect(input).toBeDisabled();
    // Data URL encoding bypasses the held toBlob; 37x23 matches no other image here.
    const smallDrop = await page.evaluateHandle(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 37;
        canvas.height = 23;
        canvas.getContext('2d')!.fillRect(0, 0, 37, 23);
        const blob = await (await fetch(canvas.toDataURL('image/png'))).blob();
        const transfer = new DataTransfer();
        transfer.items.add(new File([blob], 'small.png', { type: 'image/png' }));
        return transfer;
    });
    await dropzone.dispatchEvent('drop', { dataTransfer: smallDrop });

    await page.evaluate(() => {
        const w = window as unknown as { holdToBlob: boolean; heldToBlobs: Array<() => void> };
        w.holdToBlob = false;
        w.heldToBlobs.splice(0).forEach((run) => run());
    });
    await expect(apply).toBeEnabled();
    await expect(chooseFile).toBeEnabled();
    await expect(input).toBeEnabled();
    await expect(current).toContainText('1000x835');

    // History is starter -> source -> quantized source. Had the drop been taken,
    // it would sit between source and the quantized result.
    await undo.click();
    await undo.click();
    await expect(current).toContainText('1024x1024');
    await expect(undo).toBeDisabled();
    await expect(page.getByText('37x23')).toHaveCount(0);
});
