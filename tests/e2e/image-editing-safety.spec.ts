import { test, expect, type Page } from '@playwright/test';
import type { PreparedImage } from '../../src/workers/imageEditing.worker';
import { fakeDesktopBeforeLoad } from './helpers/fakeDesktop';

test.setTimeout(120_000);

type Controls = Window & {
    holdEncoding: boolean;
    heldEncodings: Array<() => void>;
    releasePath?: () => void;
    editingWorkerUrl?: string;
    holdApply: boolean;
    heldApply: Array<() => void>;
};

async function setup(page: Page) {
    await fakeDesktopBeforeLoad(page, (desktop) => {
        desktop.handle(
            'read_image_path',
            () =>
                new Promise((resolve) => {
                    (window as unknown as Controls).releasePath = async () => {
                        const canvas = new OffscreenCanvas(37, 23);
                        canvas.getContext('2d')!.fillRect(0, 0, 37, 23);
                        const blob = await canvas.convertToBlob();
                        resolve({
                            name: 'late.png',
                            mime: 'image/png',
                            bytes: [...new Uint8Array(await blob.arrayBuffer())],
                        });
                    };
                })
        );
    });
    await page.addInitScript(() => {
        localStorage.clear();
        const w = window as unknown as Controls;
        w.holdEncoding = false;
        w.heldEncodings = [];
        w.holdApply = false;
        w.heldApply = [];
        const original = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (...args) {
            if (w.holdEncoding) w.heldEncodings.push(() => original.apply(this, args));
            else original.apply(this, args);
        };
        const OriginalWorker = window.Worker;
        window.Worker = class extends OriginalWorker {
            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options);
                const post = this.postMessage.bind(this);
                let active = true;
                const stop = this.terminate.bind(this);
                this.terminate = () => {
                    active = false;
                    stop();
                };
                this.postMessage = (message, transferOrOptions = []) => {
                    if (
                        [
                            'threshold-source',
                            'threshold-snapshot',
                            'threshold-preview',
                            'threshold-apply',
                            'nozzle-source',
                            'nozzle-snapshot',
                            'image-export',
                        ].includes(message?.kind)
                    )
                        w.editingWorkerUrl = String(url);
                    const send = () => {
                        if (active) post(message, transferOrOptions as Transferable[]);
                    };
                    if (w.holdEncoding && message?.kind === 'image-export') {
                        w.heldEncodings.push(send);
                        return;
                    }
                    if (w.holdApply && message?.kind === 'threshold-apply') w.heldApply.push(send);
                    else send();
                };
            }
        };
    });
    await page.goto('/app');
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 48;
        const ctx = canvas.getContext('2d')!;
        ['#000000', '#808080', '#ffffff'].forEach((color, i) => {
            ctx.fillStyle = color;
            ctx.fillRect(i * 32, 0, 32, 48);
        });
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'source.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText('96x48');
}

for (const operation of ['quantize', 'dedither']) {
    test(`@smoke image edits lock during ${operation} and discard a delayed Windows import`, async ({
        page,
    }) => {
        await setup(page);
        const path = page.getByRole('textbox', { name: 'Open Windows path', exact: true });
        await path.fill('C:\\Pictures\\late.png');
        await page.getByRole('button', { name: 'Open image', exact: true }).click();
        await expect
            .poll(() => page.evaluate(() => !!(window as unknown as Controls).releasePath))
            .toBe(true);
        await page.getByRole('button', { name: 'Select top colors', exact: true }).click();
        const recommend = page.getByRole('button', { name: 'Apply to image', exact: true });
        await expect(recommend).toBeEnabled();
        await page.evaluate(() => {
            (window as unknown as Controls).holdEncoding = true;
        });
        const apply = page.getByTestId(`${operation}-apply`);
        await apply.click();
        await expect(apply).toBeDisabled();
        await expect(
            page.getByRole('button', { name: 'Edit thresholds', exact: true })
        ).toBeDisabled();
        await expect(
            page.getByRole('button', { name: 'Compare nozzle sizes', exact: true })
        ).toBeDisabled();
        await expect(recommend).toBeDisabled();
        await expect(path).toBeDisabled();
        await expect(page.getByTestId('image-file-input')).toBeDisabled();
        await page.evaluate(() => {
            const w = window as unknown as Controls;
            w.holdEncoding = false;
            w.heldEncodings.splice(0).forEach((run) => run());
        });
        await expect(apply).toBeEnabled();
        // Finish a read begun before the lock, after the lock has also been released.
        await page.evaluate(() => (window as unknown as Controls).releasePath?.());
        await expect(page.getByRole('button', { name: 'Open image', exact: true })).toBeEnabled();
        await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
            '96x48'
        );
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
            '1024x1024'
        );
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    });
}

test('@smoke a delayed filament Apply cannot overwrite a completed quantize', async ({ page }) => {
    await setup(page);
    await page.getByRole('button', { name: 'Select top colors', exact: true }).click();
    await page.evaluate(() => {
        (window as unknown as Controls).holdEncoding = true;
    });
    await page.getByRole('button', { name: 'Apply to image', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => (window as unknown as Controls).heldEncodings.length))
        .toBe(1);
    // Let quantize run normally while the earlier recommendation capture remains pending.
    await page.evaluate(() => {
        (window as unknown as Controls).holdEncoding = false;
    });
    const quantize = page.getByTestId('quantize-apply');
    await quantize.click();
    await expect(quantize).toBeEnabled();
    await page.evaluate(async () => {
        (window as unknown as Controls).heldEncodings.splice(0).forEach((run) => run());
        // Drain the image-encoding callback, React commit and paint after the stale response.
        await new Promise<void>((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.toBlob(() =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            );
        });
    });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
        '1024x1024'
    );
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('@smoke cancelling threshold Apply terminates pending work without adding history', async ({
    page,
}) => {
    await setup(page);
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    const apply = page.getByRole('button', { name: 'Apply thresholds', exact: true });
    await expect(apply).toBeEnabled();
    await page.evaluate(() => {
        (window as unknown as Controls).holdApply = true;
    });
    await apply.click();
    await expect
        .poll(() => page.evaluate(() => (window as unknown as Controls).heldApply.length))
        .toBe(1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    await page.evaluate(() =>
        (window as unknown as Controls).heldApply.splice(0).forEach((run) => run())
    );
    // A new dialog must be usable after cancelling the old worker.
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    await expect(apply).toBeEnabled();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
        '1024x1024'
    );
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('@smoke large-image editing worker preserves exact bounds and alpha while the UI can run', async ({
    page,
}) => {
    await setup(page);
    await page.getByRole('button', { name: 'Compare nozzle sizes', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => (window as unknown as Controls).editingWorkerUrl))
        .toBeTruthy();
    const result = await page.evaluate(async () => {
        const canvas = new OffscreenCanvas(5000, 5000);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#808080';
        ctx.fillRect(100, 200, 4700, 4400);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(4800, 4600, 1, 1);
        const blob = await canvas.convertToBlob();
        // Probe the actual worker's canvas readbacks, not a duplicate test implementation.
        const workerUrl = new URL((window as unknown as Controls).editingWorkerUrl!, location.href)
            .href;
        const wrapper = URL.createObjectURL(
            new Blob(
                [
                    `
            let largestRead = 0;
            const read = OffscreenCanvasRenderingContext2D.prototype.getImageData;
            OffscreenCanvasRenderingContext2D.prototype.getImageData = function(...args) {
                largestRead = Math.max(largestRead, args[2] * args[3]);
                return read.apply(this, args);
            };
            const post = self.postMessage.bind(self);
            self.postMessage = (message, ...rest) => post({...message, largestRead}, ...rest);
            await import(${JSON.stringify(workerUrl)});
            post({ready: true});
        `,
                ],
                { type: 'text/javascript' }
            )
        );
        const worker = new Worker(wrapper, { type: 'module' });
        await new Promise<void>((resolve, reject) => {
            worker.onmessage = () => resolve();
            worker.onerror = reject;
        });
        let largestRead = 0;
        let ticks = 0;
        const timer = setInterval(() => ticks++, 0);
        const request = <T>(message: unknown) =>
            new Promise<T>((resolve, reject) => {
                worker.onmessage = (e) => {
                    largestRead = Math.max(largestRead, e.data.largestRead);
                    if (e.data.error) reject(new Error(e.data.error));
                    else resolve(e.data.result);
                };
                worker.onerror = reject;
                worker.postMessage(message);
            });
        try {
            const source = await request<PreparedImage>({ kind: 'nozzle-source', blob });
            const duringBounds = ticks;
            const colors = Array.from(
                { length: 64 },
                (_, i) => '#' + (i * 4).toString(16).padStart(2, '0').repeat(3)
            );
            const thresholds = Array.from({ length: 63 }, (_, i) => (i + 1) * 4);
            const mapped = await request<Blob>({
                kind: 'threshold-apply',
                blob,
                thresholds,
                colors,
            });
            const duringApply = ticks - duringBounds;
            const bitmap = await createImageBitmap(mapped);
            ctx.clearRect(0, 0, 5000, 5000);
            ctx.drawImage(bitmap, 0, 0);
            const dimensions = [bitmap.width, bitmap.height];
            bitmap.close();
            return {
                bounds: [source.originalWidth, source.originalHeight],
                preview: [source.pixels.width, source.pixels.height],
                dimensions,
                duringBounds,
                duringApply,
                largestRead,
                clear: [...ctx.getImageData(0, 0, 1, 1).data],
                faint: [...ctx.getImageData(4800, 4600, 1, 1).data],
                solid: [...ctx.getImageData(200, 300, 1, 1).data],
            };
        } finally {
            clearInterval(timer);
            worker.terminate();
            URL.revokeObjectURL(wrapper);
        }
    });
    expect(result.largestRead).toBeLessThanOrEqual(130 * 130);
    expect(result.bounds).toEqual([4701, 4401]);
    expect(result.preview).toEqual([1024, Math.round((4401 * 1024) / 4701)]);
    expect(result.dimensions).toEqual([5000, 5000]);
    expect(result.duringBounds).toBeGreaterThan(0);
    expect(result.duringApply).toBeGreaterThan(0);
    expect(result.clear).toEqual([0, 0, 0, 0]);
    expect(result.faint).toEqual([0, 0, 0, 128]);
    expect(result.solid).toEqual([128, 128, 128, 255]);
});
