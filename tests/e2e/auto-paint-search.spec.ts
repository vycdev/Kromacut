import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const profile = fileURLToPath(
    new URL('../assets/filament-profiles/4_Colors.kapp', import.meta.url)
);

async function setup(page: Page, colors: number) {
    // Hold only optimizer work so cancellation races are reproducible on fast CI
    // machines. Image analysis still uses its real worker.
    await page.addInitScript(() => {
        localStorage.clear();
        const probe = { starts: 0, terminations: 0, lateProgress: () => {} };
        Object.assign(window, { autoPaintProbe: probe });
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            private autoPaint: boolean;
            private enhanced = false;
            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options);
                this.autoPaint = String(url).includes('autoPaint.worker');
            }
            postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
                if (!this.autoPaint) {
                    if (Array.isArray(options)) return super.postMessage(message, options);
                    return super.postMessage(message, options);
                }
                this.enhanced = (message as { enhancedColorMatch: boolean }).enhancedColorMatch;
                if (this.enhanced) probe.starts++;
                const id = (message as { id: number }).id;
                const handler = this.onmessage;
                probe.lateProgress = () =>
                    handler?.call(
                        this,
                        new MessageEvent('message', {
                            data: {
                                type: 'progress',
                                id,
                                progress: 0.75,
                                iteration: 75,
                                total: 100,
                                bestScore: 1,
                            },
                        })
                    );
            }
            terminate() {
                if (this.enhanced) probe.terminations++;
                super.terminate();
            }
        };
    });
    await page.goto('/app');
    const png = await page.evaluate((count) => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = Math.ceil(count / 64);
        const ctx = canvas.getContext('2d')!;
        const data = ctx.createImageData(canvas.width, canvas.height);
        for (let i = 0; i < canvas.width * canvas.height; i++) {
            const color = i % count;
            data.data.set([color & 255, color >> 8, 80, 255], i * 4);
        }
        ctx.putImageData(data, 0, 0);
        return canvas.toDataURL('image/png').split(',')[1];
    }, colors);
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'targets.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
        `64x${Math.ceil(colors / 64)}`
    );
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint' }).click();
    await page.getByTestId('autopaint-profile-import-input').setInputFiles(profile);
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible();
    const enhanced = page.getByTestId('autopaint-enhanced-color-match');
    if ((await enhanced.getAttribute('data-state')) !== 'checked') await enhanced.click();
    await expect(enhanced).toHaveAttribute('data-state', 'checked');
}

async function starts(page: Page) {
    return page.evaluate(
        () => (window as unknown as { autoPaintProbe: { starts: number } }).autoPaintProbe.starts
    );
}

test('@smoke high-target search waits for guidance, supports a cheaper preset, and stays cancelled', async ({
    page,
}) => {
    await page.clock.install({ time: new Date('2026-11-15T12:00:00Z') });
    await setup(page, 1024);
    const guidance = page.getByTestId('auto-paint-search-guidance');
    await expect(guidance).toContainText('1,024 distinct target colors');
    const run = page.getByRole('button', { name: 'Run Auto-paint', exact: true });
    await expect(run).toBeEnabled();
    expect(await starts(page)).toBe(0);
    await guidance.getByRole('button', { name: 'Use Fast / Compact, repeats off' }).click();
    await expect(page.locator('#optimizer-algorithm')).toHaveText('Fast');
    await expect(page.locator('#transition-opacity')).toContainText('Compact');
    await expect(run).toBeEnabled();
    expect(await starts(page)).toBe(0);
    await run.click();
    await expect.poll(() => starts(page)).toBe(1);
    await page.getByTestId('cancel-auto-paint').click();
    await expect(
        page.getByText('Auto-paint cancelled. Run Auto-paint to restart, or change settings.')
    ).toBeVisible();
    await expect(run).toBeEnabled();
    await page.evaluate(() =>
        (
            window as unknown as { autoPaintProbe: { lateProgress: () => void } }
        ).autoPaintProbe.lateProgress()
    );
    await expect(run).toBeEnabled();
    expect(await starts(page)).toBe(1);
    expect(
        await page.evaluate(
            () =>
                (window as unknown as { autoPaintProbe: { terminations: number } }).autoPaintProbe
                    .terminations
        )
    ).toBe(1);
    await run.click();
    await expect.poll(() => starts(page)).toBe(2);
    await page.clock.pauseAt(new Date('2026-11-15T13:00:00Z'));
    // An earlier approval must not return when settings are changed and reverted.
    await page.locator('#optimizer-algorithm').click();
    await page.getByRole('option', { name: 'Balanced', exact: true }).click();
    await expect(run).toBeEnabled();
    await page.locator('#optimizer-algorithm').click();
    await page.getByRole('option', { name: 'Fast', exact: true }).click();
    await page.clock.runFor(300);
    await expect(run).toBeEnabled();
    expect(await starts(page)).toBe(2);
    await run.click();
    await page.clock.runFor(250);
    await expect.poll(() => starts(page)).toBe(3);
    await page.getByRole('button', { name: '2D', exact: true }).click();
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    (window as unknown as { autoPaintProbe: { terminations: number } })
                        .autoPaintProbe.terminations
            )
        )
        .toBe(3);
});

test('@smoke quantized inputs start automatically and cancel during the debounce without restarting', async ({
    page,
}) => {
    await page.clock.install({ time: new Date('2026-11-15T12:00:00Z') });
    await setup(page, 16);
    await expect(page.getByTestId('auto-paint-search-guidance')).toHaveCount(0);
    await expect.poll(() => starts(page)).toBeGreaterThan(0);
    await page.getByTestId('cancel-auto-paint').click();
    const before = await starts(page);
    const run = page.getByRole('button', { name: 'Run Auto-paint', exact: true });
    await expect(run).toBeEnabled();
    await page.clock.pauseAt(new Date('2026-11-15T13:00:00Z'));
    // Cancel a fresh request before its 250 ms debounce can post to a worker.
    await run.click();
    await page.getByTestId('cancel-auto-paint').click();
    await expect(run).toBeEnabled();
    await page.clock.runFor(350);
    expect(await starts(page)).toBe(before);
    // A setting change should start a fresh low-target request normally.
    await page.locator('#optimizer-algorithm').click();
    await page.getByRole('option', { name: 'Fast', exact: true }).click();
    await page.clock.runFor(250);
    await expect.poll(() => starts(page)).toBe(before + 1);
    // Returning to the cancelled configuration is another new request, not a
    // restoration of the old cancel decision.
    await page.locator('#optimizer-algorithm').click();
    await page.getByRole('option', { name: 'Balanced', exact: true }).click();
    await page.clock.runFor(250);
    await expect.poll(() => starts(page)).toBe(before + 2);
    await expect(
        page.getByText('Auto-paint cancelled. Run Auto-paint to restart, or change settings.')
    ).toHaveCount(0);
});
