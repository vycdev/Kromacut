import { expect, test, type Page } from '@playwright/test';

declare global {
    interface Window {
        __MULTI_HEAD_WIRING_TEST?: {
            request: {
                id: number;
                n: number;
                searchDepth: string;
                colorMode: 'luminance' | 'color';
                imageSwatches: Array<{ hex: string; count?: number }>;
                autoPaintResult: {
                    finalStack: {
                        targetMappings: Array<{
                            targetColor: { hex: string };
                            usageWeight: number;
                        }>;
                    };
                };
            };
            finish: () => void;
        };
        __COPIED_INSTRUCTIONS?: string;
        __MULTI_HEAD_FAIL_NEXT?: boolean;
        __MULTI_HEAD_FAIL?: () => void;
    }
}

for (const outcome of ['worker-error', 'no-layout'] as const) {
    test(`@smoke multi-head ${outcome} preserves requested settings across reload`, async ({
        page,
    }) => {
        await page.addInitScript((outcome) => {
            if (!localStorage.getItem('kromacut.autopaint.v1')) {
                localStorage.setItem(
                    'kromacut.autopaint.v1',
                    JSON.stringify({
                        schemaVersion: 2,
                        paintMode: 'autopaint',
                        filaments: [
                            { id: 'black', color: '#000000', td: 0.016 },
                            { id: 'white', color: '#ffffff', td: 0.6 },
                        ],
                        optimizerAlgorithm: 'fast',
                        regionWeightingMode: outcome === 'worker-error' ? 'center' : 'edge',
                        autoPaintMaxHeight: 1.2,
                        multiHeadMode: true,
                        multiHeadCount: 2,
                        multiHeadSearchDepth: 'balanced',
                        multiHeadColorMode: 'luminance',
                    })
                );
            }
            Object.assign(window, { __KROMACUT_E2E: { buildHistory: [] } });
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: {
                    writeText: async (text: string) => {
                        window.__COPIED_INSTRUCTIONS = text;
                    },
                },
            });
            const NativeWorker = window.Worker;
            window.Worker = class extends NativeWorker {
                private isMultiHead: boolean;

                constructor(url: string | URL, options?: WorkerOptions) {
                    super(url, options);
                    this.isMultiHead = String(url).includes('multiHead');
                }

                postMessage(
                    message: unknown,
                    transfer: Transferable[] | StructuredSerializeOptions = []
                ) {
                    if (!this.isMultiHead) {
                        if (Array.isArray(transfer)) super.postMessage(message, transfer);
                        else super.postMessage(message, transfer);
                        return;
                    }
                    const request = message as NonNullable<
                        Window['__MULTI_HEAD_WIRING_TEST']
                    >['request'];
                    window.__MULTI_HEAD_WIRING_TEST = {
                        request,
                        finish: () =>
                            this.dispatchEvent(
                                new MessageEvent('message', {
                                    data: {
                                        id: request.id,
                                        ...(outcome === 'worker-error'
                                            ? { error: 'Deliberate multi-head failure' }
                                            : {
                                                  result: {
                                                      windows: [],
                                                      patchedLayers: [],
                                                      nozzleAssignments: [],
                                                  },
                                              }),
                                    },
                                })
                            ),
                    };
                }
            };
        }, outcome);
        await page.goto('/app');
        const image = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 16;
            const context = canvas.getContext('2d')!;
            for (let i = 0; i < 8; i++) {
                const value = Math.round((i * 255) / 7);
                context.fillStyle = `rgb(${value},${value},${value})`;
                context.fillRect(i * 4, 0, 4, 16);
            }
            return canvas.toDataURL().split(',')[1];
        });
        await page.getByTestId('image-file-input').setInputFiles({
            name: 'multi-head-settings.png',
            mimeType: 'image/png',
            buffer: Buffer.from(image, 'base64'),
        });
        await page.getByRole('button', { name: '3D', exact: true }).click();
        await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
        await page.locator('#multi-head-color-mode').click();
        await page.getByRole('option', { name: 'Color-based (per-hue)', exact: true }).click();
        await expect
            .poll(() =>
                page.evaluate(() => JSON.parse(localStorage.getItem('kromacut.autopaint.v1')!))
            )
            .toMatchObject({ multiHeadColorMode: 'color' });
        const build = page.getByTestId('build-3d-model');
        await expect(build).toBeEnabled();
        // Before the first build, Copy matches the pending panel, not single-head swaps.
        const prompt = 'Click Build 3D Model to generate the multi-head model and Head Schedule.';
        const copy = page.getByRole('button', { name: 'Copy', exact: true });
        const copied = () => page.evaluate(() => window.__COPIED_INSTRUCTIONS ?? '');
        await expect(page.getByText(prompt, { exact: true })).toBeVisible();
        await copy.click();
        await expect.poll(copied).toContain(prompt);
        expect(await copied()).not.toContain('Color swap plan:');
        expect(await copied()).not.toContain('Start with color:');
        await build.click();
        await page.waitForFunction(() => window.__MULTI_HEAD_WIRING_TEST !== undefined);
        const request = await page.evaluate(() => window.__MULTI_HEAD_WIRING_TEST!.request);
        expect(request).toMatchObject({
            n: 2,
            searchDepth: 'balanced',
            colorMode: 'color',
        });
        const totalWeight = request.imageSwatches.reduce(
            (sum, swatch) => sum + (swatch.count ?? 1),
            0
        );
        for (const mapping of request.autoPaintResult.finalStack.targetMappings) {
            const swatch = request.imageSwatches.find(
                (swatch) => swatch.hex === mapping.targetColor.hex
            );
            expect(swatch).toBeDefined();
            expect((swatch!.count ?? 1) / Math.max(1, totalWeight)).toBeCloseTo(
                mapping.usageWeight,
                12
            );
        }

        // These settings belong to the next build, while this request still uses 2 heads.
        await page.locator('#multi-head-count').fill('5');
        await page.locator('#multi-head-count').blur();
        await page.locator('#multi-head-search-depth').click();
        await page.getByRole('option', { name: 'Thorough', exact: true }).click();
        await page.locator('#multi-head-color-mode').click();
        await page.getByRole('option', { name: 'Layer-based (current)', exact: true }).click();
        await page.evaluate(() => window.__MULTI_HEAD_WIRING_TEST!.finish());
        await expect(page.getByTestId('autopaint-multi-head-notice')).toBeVisible();
        await page.waitForFunction(
            () =>
                (window as unknown as { __KROMACUT_E2E: { lastBuild?: { status: string } } })
                    .__KROMACUT_E2E.lastBuild?.status === 'complete'
        );
        await expect(page.getByText('Start with Color', { exact: true })).toBeVisible();
        await expect(page.getByText('Head Schedule', { exact: true })).toHaveCount(0);
        // The fallback prints single-head, so Copy gives its swap plan.
        await page.evaluate(() => {
            window.__COPIED_INSTRUCTIONS = undefined;
        });
        await copy.click();
        await expect.poll(copied).toContain('Color swap plan:');
        expect(await copied()).toMatch(/Start with color: #[0-9a-f]{6}/i);
        expect(await copied()).not.toContain(prompt);
        // The fallback is a normal single-head model, so it keeps STL export.
        await page.getByTestId('download-3d-model').click();
        await expect(page.getByTestId('download-stl')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect
            .poll(() =>
                page.evaluate(() => JSON.parse(localStorage.getItem('kromacut.autopaint.v1')!))
            )
            .toMatchObject({
                multiHeadMode: true,
                multiHeadCount: 5,
                multiHeadSearchDepth: 'thorough',
                multiHeadColorMode: 'luminance',
            });

        await page.reload();
        await page.getByRole('button', { name: '3D', exact: true }).click();
        await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
        await expect(page.getByTestId('autopaint-multi-head-mode')).toHaveAttribute(
            'data-state',
            'checked'
        );
        await expect(page.locator('#multi-head-count')).toHaveValue('5');
        await expect(page.locator('#multi-head-search-depth')).toHaveText('Thorough');
        await expect(page.locator('#multi-head-color-mode')).toHaveText('Layer-based (current)');
    });
}

// This fixture's real analysis clears the multi-head gain gate and builds a routed model.
async function loadRoutedMultiHeadImage(page: Page) {
    await page.addInitScript(() => {
        localStorage.setItem(
            'kromacut.autopaint.v1',
            JSON.stringify({
                schemaVersion: 2,
                paintMode: 'autopaint',
                filaments: [
                    { id: 'white', color: '#ffffff', td: 0.6 },
                    { id: 'black', color: '#000000', td: 0.016 },
                    { id: 'cyan', color: '#00a0e0', td: 0.4 },
                    { id: 'magenta', color: '#e0007a', td: 0.4 },
                    { id: 'yellow', color: '#ffe000', td: 0.5 },
                ],
                optimizerAlgorithm: 'fast',
                autoPaintMaxHeight: 1.6,
                multiHeadMode: true,
                multiHeadCount: 3,
                multiHeadSearchDepth: 'balanced',
                multiHeadColorMode: 'luminance',
            })
        );
        Object.assign(window, { __KROMACUT_E2E: { buildHistory: [] } });
    });
    await page.goto('/app');
    const image = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 16;
        const context = canvas.getContext('2d')!;
        const bars = ['#f00', '#0f0', '#00f', '#ff0', '#0ff', '#f0f', '#fff', '#000'];
        bars.forEach((color, i) => {
            context.fillStyle = color;
            context.fillRect(i * 4, 0, 4, 16);
        });
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'multi-head-export.png',
        mimeType: 'image/png',
        buffer: Buffer.from(image, 'base64'),
    });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
}

async function buildModel(page: Page, buildCount: number) {
    await page.getByTestId('build-3d-model').click();
    await waitForBuild(page, buildCount);
}

async function waitForBuild(page: Page, buildCount: number) {
    await page.waitForFunction((count) => {
        const e2e = (
            window as unknown as {
                __KROMACUT_E2E: { buildHistory: unknown[]; lastBuild?: { status: string } };
            }
        ).__KROMACUT_E2E;
        return e2e.buildHistory.length >= count && e2e.lastBuild?.status === 'complete';
    }, buildCount);
}

function meshStlUnavailable(page: Page) {
    return page.evaluate(
        () =>
            (window as unknown as { __KROMACUT_LAST_MESH?: { userData: Record<string, unknown> } })
                .__KROMACUT_LAST_MESH?.userData.kromacutStlUnavailable
    );
}

async function openDownloads(page: Page) {
    await page.getByTestId('download-3d-model').click();
    await expect(page.getByTestId('download-3mf')).toBeVisible();
}

test('@smoke multi-head builds offer 3MF only, and single-head builds keep STL', async ({
    page,
}) => {
    await loadRoutedMultiHeadImage(page);
    await buildModel(page, 1);
    await expect(page.getByText('Head Schedule', { exact: true })).toBeVisible();
    expect(await meshStlUnavailable(page)).toBe(true);
    await openDownloads(page);
    await expect(page.getByTestId('download-stl')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByTestId('autopaint-multi-head-mode').click();
    await expect(page.getByTestId('autopaint-multi-head-mode')).toHaveAttribute(
        'data-state',
        'unchecked'
    );
    // The menu follows the built model, not the toggle.
    await openDownloads(page);
    await expect(page.getByTestId('download-stl')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await buildModel(page, 2);
    await expect(page.getByText('Head Schedule', { exact: true })).toHaveCount(0);
    expect(await meshStlUnavailable(page)).toBe(false);
    await openDownloads(page);
    await expect(page.getByTestId('download-stl')).toBeVisible();
});

test('@smoke a single-head fallback never offers STL of the previous multi-head mesh', async ({
    page,
}) => {
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            private isMultiHead: boolean;

            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options);
                this.isMultiHead = String(url).includes('multiHead');
            }

            postMessage(
                message: unknown,
                transfer: Transferable[] | StructuredSerializeOptions = []
            ) {
                if (!this.isMultiHead || !window.__MULTI_HEAD_FAIL_NEXT) {
                    if (Array.isArray(transfer)) super.postMessage(message, transfer);
                    else super.postMessage(message, transfer);
                    return;
                }
                window.__MULTI_HEAD_FAIL_NEXT = false;
                const { id } = message as { id: number };
                window.__MULTI_HEAD_FAIL = () =>
                    this.dispatchEvent(
                        new MessageEvent('message', {
                            data: { id, error: 'Deliberate multi-head failure' },
                        })
                    );
            }
        };
    });
    await loadRoutedMultiHeadImage(page);
    await buildModel(page, 1);
    await expect(page.getByText('Head Schedule', { exact: true })).toBeVisible();

    // Hold the next analysis, then fail it while the download menu is open.
    await page.evaluate(() => {
        window.__MULTI_HEAD_FAIL_NEXT = true;
    });
    await page.getByTestId('build-3d-model').click();
    await page.waitForFunction(() => window.__MULTI_HEAD_FAIL !== undefined);
    await openDownloads(page);
    await expect(page.getByTestId('download-stl')).toHaveCount(0);
    const meshWhenStlAppears = await page.evaluate(
        () =>
            new Promise<string>((resolve) => {
                const timeout = window.setTimeout(() => {
                    observer.disconnect();
                    resolve('STL never appeared');
                }, 15_000);
                const observer = new MutationObserver(() => {
                    if (!document.querySelector('[data-testid="download-stl"]')) return;
                    observer.disconnect();
                    window.clearTimeout(timeout);
                    const mesh = (window as unknown as { __KROMACUT_LAST_MESH?: unknown })
                        .__KROMACUT_LAST_MESH;
                    resolve(mesh === undefined ? 'cleared' : 'previous mesh');
                });
                observer.observe(document.body, { childList: true, subtree: true });
                window.__MULTI_HEAD_FAIL!();
            })
    );
    expect(meshWhenStlAppears).toBe('cleared');
    await expect(page.getByTestId('autopaint-multi-head-notice')).toBeVisible();
    await waitForBuild(page, 2);

    // A routed mesh that outlives its snapshot, e.g. from an overlapping build, is refused,
    // both when it is published before the click and while the export overlay paints.
    const tagMesh = (unavailable: boolean) =>
        page.evaluate((unavailable) => {
            (
                window as unknown as { __KROMACUT_LAST_MESH: { userData: Record<string, unknown> } }
            ).__KROMACUT_LAST_MESH.userData.kromacutStlUnavailable = unavailable;
        }, unavailable);
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    const alerts: string[] = [];
    page.on('dialog', (dialog) => {
        alerts.push(dialog.message());
        void dialog.accept();
    });
    if (!(await page.getByTestId('download-stl').isVisible())) await openDownloads(page);

    await tagMesh(true);
    await page.getByTestId('download-stl').click();
    await expect.poll(() => alerts).toEqual(['3D model not ready yet']);
    await expect(page.getByTestId('download-stl')).toBeEnabled();

    await tagMesh(false);
    await page.evaluate(() => {
        document.querySelector<HTMLButtonElement>('[data-testid="download-stl"]')!.click();
        (
            window as unknown as { __KROMACUT_LAST_MESH: { userData: Record<string, unknown> } }
        ).__KROMACUT_LAST_MESH.userData.kromacutStlUnavailable = true;
    });
    await expect.poll(() => alerts).toEqual(['3D model not ready yet', '3D model not ready yet']);
    await expect(page.getByTestId('download-stl')).toBeEnabled();
    expect(downloads).toEqual([]);
});
