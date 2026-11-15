import { expect, test, type Page } from '@playwright/test';

type DecodeState = {
    loads: Record<string, number>;
    draws: Record<string, number>;
    bitmaps: number;
    closes: number;
    encodes: number;
    holdNextEncode: boolean;
    throwNextEncode: boolean;
    failImageLoads: boolean;
    syncEncodes: boolean;
    heldEncodes: BlobCallback[];
    completed: string[];
    hold: boolean;
    held: Array<() => void>;
};

async function instrument(page: Page, fallback = false) {
    await page.addInitScript((fallback) => {
        localStorage.clear();
        const state: DecodeState = {
            loads: {},
            draws: {},
            bitmaps: 0,
            closes: 0,
            encodes: 0,
            holdNextEncode: false,
            throwNextEncode: false,
            failImageLoads: false,
            syncEncodes: false,
            heldEncodes: [],
            completed: [],
            hold: false,
            held: [],
        };
        (window as unknown as { imageDecodes: DecodeState }).imageDecodes = state;
        const toBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (...args: Parameters<typeof toBlob>) {
            state.encodes++;
            if (state.syncEncodes) {
                const base64 = this.toDataURL('image/png').split(',')[1];
                const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
                args[0](new Blob([bytes], { type: 'image/png' }));
                return;
            }
            if (state.throwNextEncode) {
                state.throwNextEncode = false;
                throw new DOMException('Encoding failed', 'InvalidStateError');
            }
            if (state.holdNextEncode) {
                state.holdNextEncode = false;
                state.heldEncodes.push(args[0]);
                return;
            }
            return toBlob.apply(this, args);
        };
        const createUrl = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => {
            const url = createUrl(blob);
            state.loads[url] = 0;
            state.draws[url] = 0;
            return url;
        };
        const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
            ...src,
            set(value: string) {
                if (value in state.loads) state.loads[value]++;
                if (state.failImageLoads && value.startsWith('blob:')) {
                    queueMicrotask(() => this.onerror?.call(this, new Event('error')));
                    return;
                }
                this.addEventListener('load', () => state.completed.push(value), { once: true });
                if (state.hold && value.startsWith('blob:')) {
                    const onload = this.onload;
                    this.onload = (event: Event) => {
                        state.held.push(() => onload?.call(this, event));
                    };
                }
                src.set!.call(this, value);
            },
        });
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function (
            this: CanvasRenderingContext2D,
            ...args: Parameters<typeof draw>
        ) {
            const image = args[0];
            if (image instanceof HTMLImageElement && image.src in state.draws) {
                state.draws[image.src]++;
            }
            return draw.apply(this, args);
        } as typeof draw;
        if (fallback) {
            Object.defineProperty(window, 'createImageBitmap', { value: undefined });
        } else {
            const bitmap = window.createImageBitmap.bind(window);
            window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
                if (args[0] instanceof File) state.bitmaps++;
                const image = await bitmap(...args);
                const close = image.close.bind(image);
                image.close = () => {
                    state.closes++;
                    close();
                };
                return image;
            }) as typeof createImageBitmap;
        }
    }, fallback);
}

const decodes = (page: Page) =>
    page.evaluate(() => {
        const state = (window as unknown as { imageDecodes: DecodeState }).imageDecodes;
        return {
            loads: Object.values(state.loads),
            draws: Object.values(state.draws),
            bitmaps: state.bitmaps,
            closes: state.closes,
        };
    });

async function importRedImage(page: Page) {
    const base64 = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 48;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#c04020';
        context.fillRect(0, 0, 64, 48);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'red.png',
        mimeType: 'image/png',
        buffer: Buffer.from(base64, 'base64'),
    });
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText('64x48');
    await expect(page.getByTestId('quantize-apply')).toBeEnabled();
}

for (const fallback of [false, true]) {
    test(`@smoke shared pixels cover adjustments, baking, touch-up, resize, and history (${fallback ? 'img fallback' : 'bitmap'})`, async ({
        page,
    }) => {
        await instrument(page, fallback);
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto('/app');
        await importRedImage(page);
        const firstLoads = fallback ? 1 : 0;
        const firstDecodes = fallback ? 0 : 1;
        await expect
            .poll(() => decodes(page))
            .toEqual({
                loads: [firstLoads],
                draws: [firstLoads],
                bitmaps: firstDecodes,
                closes: firstDecodes,
            });

        const preview = page.getByTestId('image-dropzone').locator('canvas').first();
        const center = () =>
            preview.evaluate((canvas: HTMLCanvasElement) =>
                Array.from(
                    canvas
                        .getContext('2d')!
                        .getImageData(
                            Math.floor(canvas.width / 2),
                            Math.floor(canvas.height / 2),
                            1,
                            1
                        ).data
                )
            );
        await expect.poll(center).toEqual([192, 64, 32, 255]);
        const slider = page.getByRole('slider').first();
        await slider.focus();
        await slider.press('ArrowRight');
        await slider.press('Tab'); // adjustment controls commit on blur or pointer-up
        // Live adjustments change the preview without changing committed pixels.
        await expect.poll(center).not.toEqual([192, 64, 32, 255]);
        expect((await decodes(page)).loads).toEqual([firstLoads]);
        const adjusted = await center();
        await page.getByRole('button', { name: 'Apply adjustments', exact: true }).click();
        await expect
            .poll(() => decodes(page))
            .toMatchObject({
                loads: [firstLoads, 1],
                draws: [firstLoads, 1],
            });
        await expect(
            page.getByRole('button', { name: 'Reset all adjustments', exact: true })
        ).toBeDisabled();
        await expect.poll(center).toEqual(adjusted);

        // A touch-up mutates the preview's copy, not the immutable source used
        // by swatches and exports while the PNG commit is loading.
        await page.getByTestId('touchup-tool-fill').click();
        await preview.click();
        await expect.poll(center).toEqual([0, 0, 0, 255]);
        await expect
            .poll(() => decodes(page))
            .toMatchObject({
                loads: [firstLoads, 1, 1],
                draws: [firstLoads, 1, 1],
            });
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect.poll(center).toEqual(adjusted);
        await expect.poll(() => decodes(page)).toMatchObject({ loads: [firstLoads, 2, 1] });
        await page.getByRole('button', { name: 'Redo', exact: true }).click();
        await expect.poll(center).toEqual([0, 0, 0, 255]);
        await expect.poll(() => decodes(page)).toMatchObject({ loads: [firstLoads, 2, 2] });
        await page.getByTestId('touchup-tool-fill').click();

        // Resize still has its own exported-source decode; each temporary or
        // committed URL loads once, instead of once per consumer.
        const resize = page.getByTestId('image-resize-percent-slider').locator('..').locator('..');
        await resize.getByRole('button', { name: 'Apply', exact: true }).click();
        await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
            '32x24'
        );
        expect((await decodes(page)).loads).toEqual([firstLoads, 2, 2, 1, 1]);
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
            '64x48'
        );
        await expect.poll(() => decodes(page)).toMatchObject({ loads: [firstLoads, 2, 3, 1, 1] });
        expect((await decodes(page)).closes).toBe(firstDecodes);
        expect(errors).toEqual([]);
    });
}

test('@smoke an obsolete edit decode cannot repopulate a cleared image', async ({ page }) => {
    await instrument(page);
    await page.goto('/app');
    await importRedImage(page);
    await page.evaluate(() => {
        (window as unknown as { imageDecodes: DecodeState }).imageDecodes.hold = true;
    });
    await page.getByRole('button', { name: 'Apply adjustments', exact: true }).click();
    await expect.poll(() => decodes(page)).toMatchObject({ loads: [0, 1], draws: [0, 0] });
    await expect
        .poll(() =>
            page.evaluate(
                () => (window as unknown as { imageDecodes: DecodeState }).imageDecodes.held.length
            )
        )
        .toBe(1);
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText('64x48');
    await expect(page.getByText('Updating…', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remove image', exact: true }).click();
    await page.evaluate(() => {
        const state = (window as unknown as { imageDecodes: DecodeState }).imageDecodes;
        state.hold = false;
        state.held.splice(0).forEach((load) => load());
    });
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
        'No image'
    );
    await expect(page.getByTestId('quantize-apply')).toBeDisabled();
    await expect(page.getByText('Updating…', { exact: true })).toHaveCount(0);
    // Wait for the held <img> to finish, then check it cannot publish its pixels.
    await expect
        .poll(() =>
            page.evaluate(() => {
                const state = (window as unknown as { imageDecodes: DecodeState }).imageDecodes;
                return state.completed.filter((url) => url in state.loads).length;
            })
        )
        .toBe(1);
    expect((await decodes(page)).draws).toEqual([0, 0]);
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
        'No image'
    );
});

test('@smoke baking during a pending undo cannot commit the previous image pixels', async ({
    page,
}) => {
    await instrument(page);
    await page.goto('/app');
    await importRedImage(page);
    await page.getByTestId('touchup-tool-fill').click();
    await page.getByTestId('image-dropzone').locator('canvas').first().click();
    await expect.poll(() => decodes(page)).toMatchObject({ loads: [0, 1], draws: [0, 1] });
    const encodes = () =>
        page.evaluate(
            () => (window as unknown as { imageDecodes: DecodeState }).imageDecodes.encodes
        );
    const before = await encodes();
    await page.evaluate(() => {
        (window as unknown as { imageDecodes: DecodeState }).imageDecodes.hold = true;
    });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect
        .poll(() =>
            page.evaluate(
                () => (window as unknown as { imageDecodes: DecodeState }).imageDecodes.held.length
            )
        )
        .toBe(1);
    await page.getByRole('button', { name: 'Apply adjustments', exact: true }).click();
    expect(await encodes()).toBe(before);
    await page.evaluate(() => {
        const state = (window as unknown as { imageDecodes: DecodeState }).imageDecodes;
        state.hold = false;
        state.held.splice(0).forEach((load) => load());
    });
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText('64x48');
    const preview = page.getByTestId('image-dropzone').locator('canvas').first();
    await expect
        .poll(() =>
            preview.evaluate((canvas: HTMLCanvasElement) =>
                Array.from(
                    canvas
                        .getContext('2d')!
                        .getImageData(
                            Math.floor(canvas.width / 2),
                            Math.floor(canvas.height / 2),
                            1,
                            1
                        ).data
                )
            )
        )
        .toEqual([192, 64, 32, 255]);
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
});

for (const operation of ['bake', 'crop'] as const) {
    test(`@smoke a live touch-up can ${operation} while its shared snapshot is still loading`, async ({
        page,
    }) => {
        await instrument(page);
        await page.goto('/app');
        await importRedImage(page);
        await page.evaluate(() => {
            (window as unknown as { imageDecodes: DecodeState }).imageDecodes.hold = true;
        });
        await page.getByTestId('touchup-tool-fill').click();
        const preview = page.getByTestId('image-dropzone').locator('canvas').first();
        await preview.click();
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        (window as unknown as { imageDecodes: DecodeState }).imageDecodes.held
                            .length
                )
            )
            .toBe(1);
        if (operation === 'bake') {
            await page.getByRole('button', { name: 'Apply adjustments', exact: true }).click();
        } else {
            await page.getByRole('button', { name: 'Crop', exact: true }).click();
            await page.getByRole('button', { name: 'Save crop', exact: true }).click();
        }
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        (window as unknown as { imageDecodes: DecodeState }).imageDecodes.held
                            .length
                )
            )
            .toBe(2);
        await page.evaluate(() => {
            const state = (window as unknown as { imageDecodes: DecodeState }).imageDecodes;
            state.hold = false;
            state.held.splice(0).forEach((load) => load());
        });
        await expect
            .poll(() => decodes(page))
            .toMatchObject({ loads: [0, 1, 1], draws: [0, 0, 1] });
        await expect
            .poll(() =>
                preview.evaluate((canvas: HTMLCanvasElement) =>
                    Array.from(
                        canvas
                            .getContext('2d')!
                            .getImageData(
                                Math.floor(canvas.width / 2),
                                Math.floor(canvas.height / 2),
                                1,
                                1
                            ).data
                    )
                )
            )
            .toEqual([0, 0, 0, 255]);
    });
}

test('@smoke a failed touch-up save restores the last successful stroke and cancels queued edits', async ({
    page,
}) => {
    await instrument(page);
    await page.goto('/app');
    await importRedImage(page);
    await page.evaluate(() => {
        (window as unknown as { imageDecodes: DecodeState }).imageDecodes.hold = true;
    });
    const preview = page.getByTestId('image-dropzone').locator('canvas').first();
    const pixel = (fraction: number) =>
        preview.evaluate(
            (canvas: HTMLCanvasElement, fraction) =>
                Array.from(
                    canvas
                        .getContext('2d')!
                        .getImageData(
                            Math.floor(canvas.width * fraction),
                            Math.floor(canvas.height / 2),
                            1,
                            1
                        ).data
                ),
            fraction
        );
    await page.getByTestId('touchup-tool-fill').click();
    await preview.click();
    await expect
        .poll(() =>
            page.evaluate(
                () => (window as unknown as { imageDecodes: DecodeState }).imageDecodes.held.length
            )
        )
        .toBe(1);
    await page.getByTestId('touchup-tool-eraser').click();
    await page.evaluate(() => {
        (window as unknown as { imageDecodes: DecodeState }).imageDecodes.holdNextEncode = true;
    });
    await preview.click();
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    (window as unknown as { imageDecodes: DecodeState }).imageDecodes.heldEncodes
                        .length
            )
        )
        .toBe(1);
    await expect.poll(() => pixel(0.5)).toEqual([0, 0, 0, 0]);
    const box = (await preview.boundingBox())!;
    // This later stroke waits behind the failed save and must be rolled back too.
    await preview.click({ position: { x: box.width / 4, y: box.height / 2 } });
    await expect.poll(() => pixel(0.25)).toEqual([0, 0, 0, 0]);
    await page.evaluate(() => {
        (window as unknown as { imageDecodes: DecodeState }).imageDecodes.heldEncodes.shift()!(
            null
        );
    });
    await expect.poll(() => pixel(0.5)).toEqual([0, 0, 0, 255]);
    await expect.poll(() => pixel(0.25)).toEqual([0, 0, 0, 255]);
    expect(
        await page.evaluate(
            () => (window as unknown as { imageDecodes: DecodeState }).imageDecodes.encodes
        )
    ).toBe(2);
    expect((await decodes(page)).loads).toEqual([0, 1]);
    await page.evaluate(() => {
        const state = (window as unknown as { imageDecodes: DecodeState }).imageDecodes;
        state.hold = false;
        state.held.splice(0).forEach((load) => load());
    });
    await expect.poll(() => pixel(0.5)).toEqual([0, 0, 0, 255]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(() => pixel(0.5)).toEqual([192, 64, 32, 255]);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(() => pixel(0.5)).toEqual([0, 0, 0, 255]);
});

test('@smoke a thrown touch-up encode does not stop later strokes from saving', async ({
    page,
}) => {
    await instrument(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/app');
    await importRedImage(page);
    await page.getByTestId('touchup-tool-fill').click();
    const preview = page.getByTestId('image-dropzone').locator('canvas').first();
    await preview.click();
    await expect.poll(() => decodes(page)).toMatchObject({ loads: [0, 1], draws: [0, 1] });
    await page.getByTestId('touchup-tool-eraser').click();
    await page.evaluate(() => {
        (window as unknown as { imageDecodes: DecodeState }).imageDecodes.throwNextEncode = true;
    });
    await preview.click();
    await expect
        .poll(() =>
            page.evaluate(
                () => (window as unknown as { imageDecodes: DecodeState }).imageDecodes.encodes
            )
        )
        .toBe(2);
    await preview.click();
    await expect.poll(() => decodes(page)).toMatchObject({ loads: [0, 1, 1], draws: [0, 1, 1] });
    expect(errors).toEqual([]);
});

test('@smoke a failed shared snapshot ends loading and permits history recovery', async ({
    page,
}) => {
    await instrument(page);
    await page.goto('/app');
    await importRedImage(page);
    await page.evaluate(() => {
        (window as unknown as { imageDecodes: DecodeState }).imageDecodes.failImageLoads = true;
    });
    await page.getByRole('button', { name: 'Apply adjustments', exact: true }).click();
    await expect.poll(() => decodes(page)).toMatchObject({ loads: [0, 1], draws: [0, 0] });
    await expect(page.getByText('Updating…', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
        'No image'
    );
    await page.evaluate(() => {
        (window as unknown as { imageDecodes: DecodeState }).imageDecodes.failImageLoads = false;
    });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText('64x48');
});

test('@smoke undo reloads a touch-up commit skipped by a batched render', async ({ page }) => {
    await instrument(page);
    await page.goto('/app');
    const base64 = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 48;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#c04020';
        context.fillRect(0, 0, 32, 48);
        context.fillStyle = '#2040c0';
        context.fillRect(32, 0, 32, 48);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'two-regions.png',
        mimeType: 'image/png',
        buffer: Buffer.from(base64, 'base64'),
    });
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText('64x48');
    await page.getByTestId('touchup-tool-fill').click();
    const preview = page.getByTestId('image-dropzone').locator('canvas').first();
    await preview.evaluate((canvas: HTMLCanvasElement) => {
        (window as unknown as { imageDecodes: DecodeState }).imageDecodes.syncEncodes = true;
        const box = canvas.getBoundingClientRect();
        for (const fraction of [0.25, 0.75]) {
            canvas.dispatchEvent(
                new PointerEvent('pointerdown', {
                    bubbles: true,
                    cancelable: true,
                    button: 0,
                    buttons: 1,
                    pointerId: 1,
                    pointerType: 'mouse',
                    isPrimary: true,
                    clientX: box.left + box.width * fraction,
                    clientY: box.top + box.height / 2,
                })
            );
        }
    });
    await expect.poll(() => decodes(page)).toMatchObject({ loads: [0, 0, 1], draws: [0, 0, 1] });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(() => decodes(page)).toMatchObject({ loads: [0, 1, 1], draws: [0, 1, 1] });
    await expect
        .poll(() =>
            preview.evaluate((canvas: HTMLCanvasElement) =>
                Array.from(
                    canvas
                        .getContext('2d')!
                        .getImageData(
                            Math.floor(canvas.width * 0.75),
                            Math.floor(canvas.height / 2),
                            1,
                            1
                        ).data
                )
            )
        )
        .toEqual([32, 64, 192, 255]);
});
