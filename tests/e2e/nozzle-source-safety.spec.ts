import { test, expect, type Page } from '@playwright/test';

test.setTimeout(120_000);
type Probe = Window & {
    watchCapture: boolean;
    readbacks: number[];
    pngEncodes: number;
    snapshotRequests: number;
    preparationUrl: string;
    comparisonUrl: string;
    preparedBlob: Blob | null;
    preparationError?: string;
    imageBlobs: Blob[];
    thresholdBlob?: Blob;
    heldRenders: Array<() => void>;
    holdRender: boolean;
    cancelledRenders: number;
    renderSizes: number[];
    holdExport: boolean;
    heldExport?: () => void;
    exportedBlob?: Blob;
    cancelledExports: number;
    failExport: boolean;
};
async function openImage(page: Page, width: number, height: number) {
    await page.addInitScript(() => {
        localStorage.clear();
        const w = window as unknown as Probe;
        w.watchCapture = false;
        w.readbacks = [];
        w.pngEncodes = 0;
        w.snapshotRequests = 0;
        w.imageBlobs = [];
        w.heldRenders = [];
        w.holdRender = false;
        w.cancelledRenders = 0;
        w.renderSizes = [];
        w.cancelledExports = 0;
        const read = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function (
            ...args: Parameters<typeof read>
        ) {
            if (w.watchCapture) w.readbacks.push(args[2] * args[3]);
            return read.apply(this, args);
        };
        const encode = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (...args) {
            if (w.watchCapture) w.pngEncodes++;
            return encode.apply(this, args);
        };
        const objectUrl = URL.createObjectURL;
        URL.createObjectURL = function (blob) {
            if (blob instanceof Blob && blob.type === 'image/png') w.imageBlobs.push(blob);
            return objectUrl.call(this, blob);
        };
        const BaseWorker = Worker;
        window.Worker = class extends BaseWorker {
            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options);
                const post = this.postMessage.bind(this);
                let active = true,
                    render = false,
                    exporting = false;
                const stop = this.terminate.bind(this);
                this.terminate = () => {
                    if (render && active) w.cancelledRenders++;
                    if (exporting && active) w.cancelledExports++;
                    active = false;
                    stop();
                };
                this.postMessage = (message, transfer = []) => {
                    if (message.kind === 'nozzle-snapshot') {
                        w.snapshotRequests++;
                        w.preparationUrl = String(url);
                        this.addEventListener('message', (e) => {
                            w.preparedBlob = e.data.result?.blob;
                            w.preparationError = e.data.error;
                        });
                    }
                    if (message.kind === 'threshold-snapshot') {
                        this.addEventListener('message', (e) => {
                            w.thresholdBlob = e.data.result?.blob;
                        });
                    }
                    if (message.kind === 'image-export') {
                        exporting = true;
                        this.addEventListener('message', (e) => {
                            w.exportedBlob = e.data.result;
                        });
                        if (w.failExport) {
                            queueMicrotask(() =>
                                this.dispatchEvent(
                                    new MessageEvent('message', {
                                        data: { error: 'Test encoding failure' },
                                    })
                                )
                            );
                            return;
                        }
                        if (w.holdExport) {
                            w.heldExport = () => {
                                if (active) post(message, transfer as Transferable[]);
                            };
                            return;
                        }
                    }
                    if (message.kind === 'image-render') {
                        render = true;
                        w.renderSizes.push(
                            message.snapshot.bitmap.width * message.snapshot.bitmap.height
                        );
                        if (w.holdRender) {
                            w.heldRenders.push(() => {
                                if (active) post(message, transfer as Transferable[]);
                            });
                            return;
                        }
                    }
                    if ('pixelSizeMm' in message) w.comparisonUrl = String(url);
                    post(message, transfer as Transferable[]);
                };
            }
        };
    });
    await page.goto('/app');
    const png = await page.evaluate(
        async ({ width, height }) => {
            const c = new OffscreenCanvas(width, height);
            const ctx = c.getContext('2d')!;
            ctx.fillStyle = '#a02030';
            ctx.fillRect(7, 9, width - 19, height - 21);
            ctx.fillStyle = '#2468ac';
            ctx.fillRect(510, 10, 5, height - 24);
            ctx.fillStyle = '#e0c040';
            ctx.fillRect(30, 510, width - 60, 5);
            ctx.fillStyle = 'rgba(40,80,120,0.5)';
            ctx.clearRect(511, 511, 3, 3);
            ctx.fillRect(511, 511, 3, 3);
            return [...new Uint8Array(await (await c.convertToBlob()).arrayBuffer())];
        },
        { width, height }
    );
    await page
        .getByTestId('image-file-input')
        .setInputFiles({ name: 'tile-seams.png', mimeType: 'image/png', buffer: Buffer.from(png) });
    await expect(page.getByText(`Image: ${width}×${height}`, { exact: true })).toBeVisible();
}

test('@smoke nozzle opening avoids main-thread image reads and disables oversized Apply', async ({
    page,
}) => {
    await openImage(page, 2050, 2050);
    await page.evaluate(() => {
        (window as unknown as Probe).watchCapture = true;
    });
    await page.getByRole('button', { name: 'Compare nozzle sizes', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nozzle and size preview', exact: true });
    await expect(dialog.getByTestId('nozzle-patch-size-limit')).toContainText('4 megapixels');
    await expect(dialog.getByLabel('Print width (mm)', { exact: true }).first()).toHaveValue(
        '203.1'
    );
    await dialog.getByRole('checkbox', { name: 'Patch vulnerable regions', exact: true }).check();
    await expect(dialog.getByTestId('nozzle-patch-result').first()).toContainText('Merged:');
    for (const button of await dialog
        .getByRole('button', { name: 'Apply patch to image', exact: true })
        .all())
        await expect(button).toBeDisabled();
    const capture = await page.evaluate(() => {
        const w = window as unknown as Probe;
        w.watchCapture = false;
        return {
            reads: w.readbacks,
            encodes: w.pngEncodes,
            snapshots: w.snapshotRequests,
            retainedFullImage: !!w.preparedBlob,
        };
    });
    expect(capture.snapshots).toBe(1);
    expect(capture.reads).toEqual([]);
    expect(capture.encodes).toBe(0);
    expect(capture.retainedFullImage).toBe(false);
    // Defense in depth: a malformed oversized direct worker request is rejected before simulation.
    const error = await page.evaluate(async () => {
        const worker = new Worker((window as unknown as Probe).comparisonUrl, { type: 'module' });
        try {
            return await new Promise<string>((resolve, reject) => {
                worker.onmessage = (e) => resolve(e.data.error);
                worker.onerror = reject;
                worker.postMessage({
                    width: 16384,
                    height: 16384,
                    data: new Uint8ClampedArray(),
                    pixelSizeMm: 0.1,
                    lineWidthMm: 0.42,
                    patchOnly: true,
                });
            });
        } finally {
            worker.terminate();
        }
    });
    expect(error).toContain('4 megapixels');
});

test('@smoke tiled nozzle capture matches full-frame recoloring and clarity across tile seams', async ({
    page,
}) => {
    await openImage(page, 1100, 600);
    await page.getByRole('button', { name: 'Select top colors', exact: true }).click();
    const clarity = page
        .locator('div.space-y-2')
        .filter({
            has: page.getByRole('button', { name: 'Reset Clarity', exact: true }),
        })
        .getByRole('slider');
    await clarity.press('End');
    await expect(clarity).toHaveAttribute('aria-valuenow', '100');
    await page.getByRole('button', { name: 'Compare nozzle sizes', exact: true }).click();
    await expect
        .poll(() =>
            page.evaluate(() => ({
                ready: !!(window as unknown as Probe).preparedBlob,
                error: (window as unknown as Probe).preparationError,
            }))
        )
        .toEqual({ ready: true, error: undefined });
    await page.getByRole('button', { name: 'Close comparison', exact: true }).click();
    await page.evaluate(() => {
        (window as unknown as Probe).imageBlobs = [];
    });
    await page.getByRole('button', { name: 'Apply adjustments', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => (window as unknown as Probe).imageBlobs.length))
        .toBeGreaterThan(0);
    const comparison = await page.evaluate(async () => {
        const w = window as unknown as Probe;
        async function pixels(blob: Blob) {
            const image = await createImageBitmap(blob);
            const c = new OffscreenCanvas(image.width, image.height);
            c.getContext('2d')!.drawImage(image, 0, 0);
            image.close();
            return c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
        }
        const actual = await pixels(w.preparedBlob!),
            expected = await pixels(w.imageBlobs.at(-1)!);
        let differences = 0;
        for (let i = 0; i < expected.data.length; i++)
            if (actual.data[i] !== expected.data[i]) differences++;
        return { width: actual.width, height: actual.height, differences };
    });
    expect(comparison).toEqual({ width: 1100, height: 600, differences: 0 });
});

test('@smoke threshold capture uses worker tiles and preserves adjusted full-resolution pixels', async ({
    page,
}) => {
    await openImage(page, 1100, 600);
    await page.getByRole('button', { name: 'Select top colors', exact: true }).click();
    const clarity = page
        .locator('div.space-y-2')
        .filter({ has: page.getByRole('button', { name: 'Reset Clarity', exact: true }) })
        .getByRole('slider');
    await clarity.press('End');
    await page.evaluate(() => {
        (window as unknown as Probe).watchCapture = true;
    });
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => !!(window as unknown as Probe).thresholdBlob))
        .toBe(true);
    await expect(
        page.getByRole('dialog').getByRole('button', { name: 'Apply thresholds', exact: true })
    ).toBeEnabled();
    expect(
        await page.evaluate(() => ({
            reads: (window as unknown as Probe).readbacks,
            encodes: (window as unknown as Probe).pngEncodes,
        }))
    ).toEqual({ reads: [], encodes: 0 });
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.evaluate(() => {
        const w = window as unknown as Probe;
        w.watchCapture = false;
        w.imageBlobs = [];
    });
    await page.getByRole('button', { name: 'Apply adjustments', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => (window as unknown as Probe).imageBlobs.length))
        .toBeGreaterThan(0);
    const difference = await page.evaluate(async () => {
        const w = window as unknown as Probe;
        async function pixels(blob: Blob) {
            const bitmap = await createImageBitmap(blob);
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        }
        const a = await pixels(w.thresholdBlob!),
            b = await pixels(w.imageBlobs.at(-1)!);
        return a.length === b.length ? a.reduce((n, v, i) => n + Number(v !== b[i]), 0) : -1;
    });
    expect(difference).toBe(0);
});

test('@smoke live recoloring avoids main-thread reads and cancels obsolete large-image renders', async ({
    page,
}) => {
    await openImage(page, 2050, 2050);
    const swatch = page
        .getByTestId('filament-recommender')
        .getByRole('button', { name: 'Select #A02030', exact: true });
    await swatch.click();
    const matches = page.getByTestId('filament-match-row').getByRole('radio');
    await page.evaluate(() => {
        const w = window as unknown as Probe;
        w.watchCapture = true;
        w.holdRender = true;
    });
    await matches.nth(1).click();
    await expect
        .poll(() => page.evaluate(() => (window as unknown as Probe).heldRenders.length))
        .toBe(1);
    await matches.nth(2).click();
    await expect
        .poll(() => page.evaluate(() => (window as unknown as Probe).heldRenders.length))
        .toBe(2);
    const expected = await swatch.getAttribute('data-preview-hex');
    const probe = await page.evaluate(() => {
        const w = window as unknown as Probe;
        const result = {
            reads: w.readbacks,
            encodes: w.pngEncodes,
            cancelled: w.cancelledRenders,
            sizes: w.renderSizes,
        };
        w.watchCapture = false;
        w.holdRender = false;
        w.heldRenders.splice(0).forEach((send) => send());
        return result;
    });
    expect(probe.reads).toEqual([]);
    expect(probe.encodes).toBe(0);
    expect(probe.cancelled).toBeGreaterThanOrEqual(1);
    expect(probe.sizes).toEqual([2050 * 2050, 2050 * 2050]);
    await expect
        .poll(() =>
            page.getByTestId('main-image-preview').evaluate((canvas: HTMLCanvasElement, hex) => {
                const rgb = [1, 3, 5].map((i) => parseInt(hex!.slice(i, i + 2), 16));
                const d = canvas
                    .getContext('2d')!
                    .getImageData(0, 0, canvas.width, canvas.height).data;
                for (let i = 0; i < d.length; i += 4)
                    if (rgb.every((c, k) => d[i + k] === c) && d[i + 3] === 255) return true;
                return false;
            }, expected)
        )
        .toBe(true);
});

test('@smoke filament Apply exports full-resolution pixels in a worker with no UI readback', async ({
    page,
}) => {
    await openImage(page, 1100, 600);
    await page.getByRole('button', { name: 'Select top colors', exact: true }).click();
    const clarity = page
        .locator('div.space-y-2')
        .filter({ has: page.getByRole('button', { name: 'Reset Clarity', exact: true }) })
        .getByRole('slider');
    await clarity.press('End');
    // The established full-frame adjustment path provides an independent pixel oracle.
    await page.evaluate(() => {
        (window as unknown as Probe).imageBlobs = [];
    });
    await page.getByRole('button', { name: 'Apply adjustments', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => (window as unknown as Probe).imageBlobs.length))
        .toBeGreaterThan(0);
    await page.evaluate(() => {
        (window as unknown as Probe).preparedBlob = (window as unknown as Probe).imageBlobs.at(-1)!;
    });
    await page.getByRole('button', { name: 'Save project', exact: true }).focus();
    await page.keyboard.press('Control+z');
    await expect(
        page
            .getByTestId('filament-recommender')
            .getByRole('button', { name: 'Select #A02030', exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Select top colors', exact: true }).click();
    await clarity.press('End');
    await page.evaluate(() => {
        const w = window as unknown as Probe;
        w.readbacks = [];
        w.pngEncodes = 0;
        w.watchCapture = true;
        w.holdExport = true;
    });
    const apply = page
        .getByTestId('filament-recommender')
        .getByRole('button', { name: 'Apply to image', exact: true });
    await apply.click();
    await expect
        .poll(() => page.evaluate(() => !!(window as unknown as Probe).heldExport))
        .toBe(true);
    await expect(apply).toBeDisabled();
    expect(
        await page.evaluate(() => {
            const w = window as unknown as Probe;
            return { reads: w.readbacks, encodes: w.pngEncodes };
        })
    ).toEqual({ reads: [], encodes: 0 });
    await page.evaluate(() => {
        (window as unknown as Probe).heldExport!();
    });
    await expect
        .poll(() => page.evaluate(() => !!(window as unknown as Probe).exportedBlob))
        .toBe(true);
    const result = await page.evaluate(async () => {
        const w = window as unknown as Probe;
        w.watchCapture = false;
        async function pixels(blob: Blob) {
            const bitmap = await createImageBitmap(blob);
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            return ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
        const actual = await pixels(w.exportedBlob!),
            expected = await pixels(w.preparedBlob!);
        return {
            width: actual.width,
            height: actual.height,
            differences: actual.data.reduce((n, v, i) => n + Number(v !== expected.data[i]), 0),
        };
    });
    expect(result).toEqual({ width: 1100, height: 600, differences: 0 });
});

test('@smoke filament Apply recovers from worker failure and cancels when the source changes', async ({
    page,
}) => {
    await openImage(page, 1100, 600);
    await page.getByRole('button', { name: 'Select top colors', exact: true }).click();
    await page.evaluate(() => {
        (window as unknown as Probe).failExport = true;
    });
    const panel = page.getByTestId('filament-recommender');
    const apply = panel.getByRole('button', { name: 'Apply to image', exact: true });
    await apply.click();
    await expect(panel.getByRole('alert')).toContainText('Could not process the image');
    await expect(apply).toBeEnabled();
    await expect(page.getByText('Image: 1100×600', { exact: true })).toBeVisible();
    await page.evaluate(() => {
        const w = window as unknown as Probe;
        w.failExport = false;
        w.holdExport = true;
        w.cancelledExports = 0;
    });
    await apply.click();
    await expect
        .poll(() => page.evaluate(() => !!(window as unknown as Probe).heldExport))
        .toBe(true);
    const png = await page.evaluate(async () => {
        const canvas = new OffscreenCanvas(37, 23);
        canvas.getContext('2d')!.fillRect(0, 0, 37, 23);
        return [...new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer())];
    });
    await page
        .getByTestId('image-file-input')
        .setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: Buffer.from(png) });
    await expect(page.getByText('Image: 37×23', { exact: true })).toBeVisible();
    await expect
        .poll(() => page.evaluate(() => (window as unknown as Probe).cancelledExports))
        .toBeGreaterThan(0);
    await page.evaluate(() => {
        (window as unknown as Probe).heldExport!();
    });
    await expect(page.getByText('Image: 37×23', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => !!(window as unknown as Probe).exportedBlob)).toBe(false);
});
