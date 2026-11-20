import { expect, test, type Page } from '@playwright/test';

type RenderProbe = {
    workers: number;
    previews: number;
    exports: number;
    cancelled: number;
    pauseNext: boolean;
    failNext: boolean;
};

async function loadImage(page: Page) {
    await page.goto('/app');
    const png = await page.evaluate(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 387;
        canvas.height = 269;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#C04020';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
        return [...new Uint8Array(await blob!.arrayBuffer())];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'tiled-edits.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png),
    });
    await expect(page.getByText('Image: 387×269', { exact: true })).toBeVisible();
}

test('@smoke adjustment preview reuses one worker, cancels old requests, and can retry', async ({
    page,
}) => {
    await page.addInitScript(() => {
        const probe: RenderProbe = {
            workers: 0,
            previews: 0,
            exports: 0,
            cancelled: 0,
            pauseNext: true,
            failNext: true,
        };
        (window as unknown as { renderProbe: RenderProbe }).renderProbe = probe;
        const NativeWorker = Worker;
        window.Worker = class extends NativeWorker {
            constructor(url: URL | string, options?: WorkerOptions) {
                super(url, options);
                if (!String(url).includes('imageEditing.worker')) return;
                probe.workers++;
                const post = this.postMessage.bind(this);
                this.postMessage = (
                    data,
                    options?: Transferable[] | StructuredSerializeOptions
                ) => {
                    if (data.kind === 'cancel') probe.cancelled++;
                    if (data.kind === 'render' && data.output === 'png') probe.exports++;
                    if (data.kind === 'render' && data.output === 'preview') {
                        probe.previews++;
                        if (probe.pauseNext) {
                            probe.pauseNext = false;
                            data.snapshot.bitmap.close();
                            return;
                        }
                        if (probe.failNext) {
                            probe.failNext = false;
                            data.snapshot.bitmap.close();
                            queueMicrotask(() =>
                                this.dispatchEvent(
                                    new MessageEvent('message', {
                                        data: {
                                            id: data.id,
                                            kind: 'error',
                                            message: 'Test render error',
                                        },
                                    })
                                )
                            );
                            return;
                        }
                    }
                    if (Array.isArray(options)) post(data, options);
                    else post(data, options);
                };
            }
        };
    });
    await loadImage(page);
    const probe = () =>
        page.evaluate(() => (window as unknown as { renderProbe: RenderProbe }).renderProbe);
    const slider = page.getByRole('slider').first();
    const adjust = async () => {
        await slider.focus();
        await slider.press('ArrowRight');
        await slider.press('Tab');
    };
    await adjust();
    await expect.poll(probe).toMatchObject({ previews: 1 });
    await adjust();
    await expect(page.getByRole('alert')).toContainText('Could not render the adjustment preview.');
    await expect.poll(probe).toMatchObject({ cancelled: 1, previews: 2 });
    await page.getByRole('button', { name: 'Retry preview', exact: true }).click();
    const canvas = page.getByTestId('image-dropzone').locator('canvas').first();
    await expect
        .poll(() =>
            canvas.evaluate(
                (element: HTMLCanvasElement) =>
                    element
                        .getContext('2d')!
                        .getImageData(element.width >> 1, element.height >> 1, 1, 1).data[0]
            )
        )
        .toBeGreaterThan(192);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Apply adjustments', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Reset all adjustments', exact: true })
    ).toBeDisabled();
    await expect.poll(probe).toMatchObject({ workers: 1, previews: 3, exports: 1 });
});
