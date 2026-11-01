import { expect, test } from '@playwright/test';

declare global {
    interface Window {
        __MULTI_HEAD_WIRING_TEST?: {
            request: {
                id: number;
                n: number;
                searchDepth: string;
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
                    })
                );
            }
            Object.assign(window, { __KROMACUT_E2E: { buildHistory: [] } });
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
        const build = page.getByTestId('build-3d-model');
        await expect(build).toBeEnabled();
        await build.click();
        await page.waitForFunction(() => window.__MULTI_HEAD_WIRING_TEST !== undefined);
        const request = await page.evaluate(() => window.__MULTI_HEAD_WIRING_TEST!.request);
        expect(request).toMatchObject({
            n: 2,
            searchDepth: 'balanced',
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
        await page.evaluate(() => window.__MULTI_HEAD_WIRING_TEST!.finish());
        await expect(page.getByTestId('autopaint-multi-head-notice')).toBeVisible();
        await page.waitForFunction(
            () =>
                (window as unknown as { __KROMACUT_E2E: { lastBuild?: { status: string } } })
                    .__KROMACUT_E2E.lastBuild?.status === 'complete'
        );
        await expect(page.getByText('Start with Color', { exact: true })).toBeVisible();
        await expect(page.getByText('Head Schedule', { exact: true })).toHaveCount(0);
        await expect
            .poll(() =>
                page.evaluate(() => JSON.parse(localStorage.getItem('kromacut.autopaint.v1')!))
            )
            .toMatchObject({
                multiHeadMode: true,
                multiHeadCount: 5,
                multiHeadSearchDepth: 'thorough',
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
    });
}
