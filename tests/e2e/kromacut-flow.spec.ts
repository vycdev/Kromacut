import { expect, test, type CDPSession, type Page, type TestInfo } from '@playwright/test';
import { mkdir, open as openFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ImageCase = {
    name: string;
    fileName: string;
    width: number;
    height: number;
    large?: boolean;
};

type ProfileCase = {
    name: string;
    fileName: string;
    colorCount: number;
};

type MeshingCase = {
    name: string;
    smooth: boolean;
};

type MemorySample = {
    label: string;
    atMs: number;
    jsHeapUsedSize?: number;
    jsHeapTotalSize?: number;
    domNodes?: number;
    performanceMemory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
    };
    error?: string;
};

type MemorySummary = {
    sampleCount: number;
    peakJsHeapUsedSize?: number;
    peakJsHeapTotalSize?: number;
    peakDomNodes?: number;
    peakPerformanceUsedJSHeapSize?: number;
    peakPerformanceTotalJSHeapSize?: number;
    jsHeapUsedSizeMiB?: number;
    performanceUsedJSHeapSizeMiB?: number;
};

type ExportMetrics = {
    kind: 'stl' | '3mf';
    status: 'running' | 'complete' | 'failed';
    elapsedMs?: number;
    bytes?: number;
    sizeMiB?: number;
    triangleCount?: number;
    stlStats?: {
        mode: 'heightfield';
        topQuads: number;
        bottomQuads: number;
        horizontalWallQuads: number;
        verticalWallQuads: number;
        totalQuads: number;
        triangleCount: number;
    };
    suggestedFilename?: string;
    memorySamples: MemorySample[];
    peakMemory?: MemorySummary;
    error?: string;
};

type BuildMetrics = {
    status?: string;
    elapsedMs?: number;
    imageWidth?: number;
    imageHeight?: number;
    cropWidth?: number;
    cropHeight?: number;
    meshCount?: number;
    visibleMeshCount?: number;
    vertexCount?: number;
    triangleCount?: number;
};

type FlowMetrics = {
    caseName: string;
    startedAt: string;
    updatedAt?: string;
    metricsFile?: string;
    phases: Array<{ label: string; elapsedMs: number; error?: string }>;
    memory: MemorySample[];
    exports: ExportMetrics[];
    build?: BuildMetrics | null;
};

type MetricsWriter = (force?: boolean) => Promise<void>;

const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const assetRoot = path.join(repoRoot, 'tests', 'assets');
const profileRoot = path.join(assetRoot, 'filament-profiles');

const images: ImageCase[] = [
    { name: '1024 PNG', fileName: '1024x1024p.png', width: 1024, height: 1024 },
    {
        name: '3888 JPG',
        fileName: '3888x2916p.jpg',
        width: 3888,
        height: 2916,
        large: true,
    },
];

const profiles: ProfileCase[] = [
    { name: '2-color profile', fileName: '2_Colors.kapp', colorCount: 2 },
    { name: '4-color profile', fileName: '4_Colors.kapp', colorCount: 4 },
    { name: '8-color profile', fileName: '8_Colors.kapp', colorCount: 8 },
];

const meshers: MeshingCase[] = [
    { name: 'greedy meshing', smooth: false },
    { name: 'smooth meshing', smooth: true },
];

test.describe.configure({ mode: 'serial' });

test.describe('Kromacut browser export flow', () => {
    for (const image of images) {
        for (const profile of profiles) {
            for (const mesher of meshers) {
                const tagList = [
                    '@full',
                    image.large ? '@stress' : '@matrix',
                    image.large ? '@large' : '@small',
                    mesher.smooth ? '@smooth' : '@greedy',
                    `@profile${profile.colorCount}`,
                ];
                if (
                    image.fileName === '1024x1024p.png' &&
                    profile.fileName === '2_Colors.kapp' &&
                    !mesher.smooth
                ) {
                    tagList.push('@smoke');
                }
                const tags = tagList.join(' ');

                test(`${tags} ${image.name}, ${profile.name}, ${mesher.name} exports STL and 3MF`, async ({
                    page,
                }, testInfo) => {
                    testInfo.setTimeout(image.large ? 90 * 60 * 1000 : 30 * 60 * 1000);

                    const browserErrors = installBrowserErrorCollector(page);
                    const memory = await createMemorySampler(page);
                    const metrics: FlowMetrics = {
                        caseName: `${image.name} / ${profile.name} / ${mesher.name}`,
                        startedAt: new Date().toISOString(),
                        phases: [],
                        memory: [],
                        exports: [],
                    };
                    const persistMetrics = createMetricsWriter(testInfo, metrics, browserErrors);

                    try {
                        await runFlow(
                            page,
                            testInfo,
                            memory,
                            metrics,
                            persistMetrics,
                            image,
                            profile,
                            mesher
                        );
                    } finally {
                        await persistMetrics(true).catch(() => {
                            // The raw metrics file is best-effort during forced interruption.
                        });
                        await attachJson(testInfo, 'flow-metrics.json', metrics);
                        await attachJson(testInfo, 'flow-summary.json', summarizeFlow(metrics));
                        await attachJson(testInfo, 'browser-errors.json', browserErrors);
                        console.log(formatFlowSummary(metrics));
                    }

                    expect(browserErrors).toEqual([]);
                });
            }
        }
    }
});

async function runFlow(
    page: Page,
    testInfo: TestInfo,
    memory: MemorySampler,
    metrics: FlowMetrics,
    persistMetrics: MetricsWriter,
    image: ImageCase,
    profile: ProfileCase,
    mesher: MeshingCase
) {
    await openApp(page);
    await sample(metrics, memory, 'app-loaded');
    await persistMetrics(true);

    await timedPhase(
        metrics,
        memory,
        'load-image',
        async () => {
            await page
                .getByTestId('image-file-input')
                .setInputFiles(path.join(assetRoot, image.fileName));
            await expect(page.locator('body')).toContainText(`Image: ${image.width}`, {
                timeout: 60 * 1000,
            });
        },
        persistMetrics
    );

    await timedPhase(
        metrics,
        memory,
        'quantize-defaults',
        async () => {
            await expect(page.locator('#final-colors')).toHaveValue('16');
            await expect(page.locator('#weight')).toHaveValue('128');
            const applyButton = page.getByTestId('quantize-apply');
            await applyButton.click();
            await expect(applyButton)
                .toBeDisabled({ timeout: 5000 })
                .catch(() => {
                    // Very small future fixtures may complete before Playwright observes the disabled state.
                });
            await expect(applyButton).toBeEnabled({
                timeout: image.large ? 10 * 60 * 1000 : 3 * 60 * 1000,
            });
            await expect(page.getByText('Quantizing...')).toBeHidden();
        },
        persistMetrics
    );

    await timedPhase(
        metrics,
        memory,
        'dedither-weight-4-passes-5',
        async () => {
            await setSliderValue(page, 'dedither-passes-slider', 5);
            const applyButton = page.getByTestId('dedither-apply');
            await applyButton.click();
            await expect(applyButton)
                .toBeDisabled({ timeout: 5000 })
                .catch(() => {
                    // Very small future fixtures may complete before Playwright observes the disabled state.
                });
            await expect(applyButton).toBeEnabled({
                timeout: image.large ? 15 * 60 * 1000 : 5 * 60 * 1000,
            });
            await expect(page.getByText('Dedithering...')).toBeHidden();
        },
        persistMetrics
    );

    await timedPhase(
        metrics,
        memory,
        'configure-autopaint-3d',
        async () => {
            await page.getByRole('button', { name: '3D', exact: true }).click();
            await setNumberInput(page.getByTestId('print-pixel-size'), '0.1');
            await setNumberInput(page.getByTestId('print-layer-height'), '0.08');
            await setNumberInput(page.getByTestId('print-first-layer-height'), '0.16');
            await setSwitch(page, 'print-smooth-meshing', mesher.smooth);

            await page.getByRole('tab', { name: 'Auto-paint' }).click();
            await page
                .getByTestId('autopaint-profile-import-input')
                .setInputFiles(path.join(profileRoot, profile.fileName));
            await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible({
                timeout: 30 * 1000,
            });

            await setSwitch(page, 'autopaint-enhanced-color-match', true);
            await page.getByRole('combobox', { name: 'Extra repeated swaps' }).click();
            await page.getByRole('option', { name: '2 extra swaps', exact: true }).click();
            await setSwitch(page, 'autopaint-height-dithering', true);

            await waitForAutoPaintIdle(
                page,
                profile.colorCount >= 8 ? 3 * 60 * 1000 : 90 * 1000
            );

            const buildState = await page.evaluate(() => {
                const hook = (
                    window as Window & {
                        __KROMACUT_E2E?: {
                            buildHistory?: unknown[];
                            lastBuild?: { status?: string };
                        };
                    }
                ).__KROMACUT_E2E;
                return {
                    historyCount: hook?.buildHistory?.length ?? 0,
                    status: hook?.lastBuild?.status ?? null,
                };
            });
            expect(buildState.historyCount).toBe(0);
            expect(buildState.status).not.toBe('building');
        },
        persistMetrics
    );

    metrics.build = await timedPhase(
        metrics,
        memory,
        'build-3d-model',
        async () => {
            const previousBuildCount = await page.evaluate(() => {
                const hook = (
                    window as Window & {
                        __KROMACUT_E2E?: { buildHistory?: unknown[] };
                    }
                ).__KROMACUT_E2E;
                return hook?.buildHistory?.length ?? 0;
            });

            await page.getByTestId('build-3d-model').click();
            await page
                .getByRole('button', { name: 'Build Anyway' })
                .click({ timeout: 3000 })
                .catch(() => {
                    // Small fixtures do not trigger the performance warning.
                });

            await page.waitForFunction(
                (count) => {
                    const hook = (
                        window as Window & {
                            __KROMACUT_E2E?: {
                                buildHistory?: unknown[];
                                lastBuild?: { status?: string };
                            };
                        }
                    ).__KROMACUT_E2E;
                    return (
                        (hook?.buildHistory?.length ?? 0) > count &&
                        hook?.lastBuild?.status === 'complete'
                    );
                },
                previousBuildCount,
                { timeout: image.large ? 60 * 60 * 1000 : 12 * 60 * 1000 }
            );

            const build = (await page.evaluate(() => {
                const hook = (
                    window as Window & {
                        __KROMACUT_E2E?: { lastBuild?: BuildMetrics };
                    }
                ).__KROMACUT_E2E;
                return hook?.lastBuild ?? null;
            })) as BuildMetrics | null;

            expect(build?.meshCount ?? 0).toBeGreaterThan(0);
            expect(build?.triangleCount ?? 0).toBeGreaterThan(0);
            return build;
        },
        persistMetrics
    );

    await exportModel(page, testInfo, memory, metrics, persistMetrics, 'stl', !!image.large);
    await exportModel(page, testInfo, memory, metrics, persistMetrics, '3mf', !!image.large);
}

async function openApp(page: Page) {
    await page.addInitScript(() => {
        const e2eWindow = window as Window & {
            __KROMACUT_E2E?: { buildHistory?: unknown[] };
        };
        localStorage.clear();
        e2eWindow.__KROMACUT_E2E = { buildHistory: [] };

        let seed = 123456789;
        Math.random = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 0x100000000;
        };
    });

    await page.goto('/app');
    await expect(page.getByTestId('image-file-input')).toBeAttached();
}

async function setNumberInput(input: ReturnType<Page['getByTestId']>, value: string) {
    await input.fill(value);
    await input.blur();
    await expect(input).toHaveValue(value);
}

async function setSwitch(page: Page, testId: string, checked: boolean) {
    const control = page.getByTestId(testId);
    await expect(control).toBeVisible();
    await expect(control).toBeEnabled();
    const current = (await control.getAttribute('data-state')) === 'checked';

    if (current !== checked) {
        await control.click();
    }

    await expect(control).toHaveAttribute('data-state', checked ? 'checked' : 'unchecked');
}

async function waitForAutoPaintIdle(page: Page, timeout: number) {
    const buildButton = page.getByTestId('build-3d-model');

    await delay(350);
    await expect(buildButton)
        .toBeDisabled({ timeout: 5000 })
        .catch(() => {
            // Small auto-paint computations may finish before Playwright observes the busy state.
        });
    await expect(buildButton).toBeEnabled({ timeout });
}

async function setSliderValue(page: Page, testId: string, value: number) {
    const thumb = page.getByTestId(testId).locator('[role="slider"]');
    await expect(thumb).toBeVisible();
    await thumb.focus();
    await thumb.press('Home');

    for (let step = 1; step < value; step++) {
        await thumb.press('ArrowRight');
    }

    await expect(thumb).toHaveAttribute('aria-valuenow', String(value));
}

async function exportModel(
    page: Page,
    testInfo: TestInfo,
    memory: MemorySampler,
    metrics: FlowMetrics,
    persistMetrics: MetricsWriter,
    kind: 'stl' | '3mf',
    large: boolean
) {
    const buttonTestId = kind === 'stl' ? 'download-stl' : 'download-3mf';
    const timeout = large ? 60 * 60 * 1000 : 15 * 60 * 1000;
    const memorySamples: MemorySample[] = [];
    const exportMetrics: ExportMetrics = {
        kind,
        status: 'running',
        memorySamples,
    };
    metrics.exports.push(exportMetrics);
    let stopped = false;
    let sampler: Promise<void> | null = null;

    const startedAt = Date.now();
    try {
        await openDownloadMenu(page, buttonTestId);
        await persistMetrics(true);

        sampler = (async () => {
            let sampleCount = 0;
            while (!stopped) {
                memorySamples.push(await memory.sample(`export-${kind}:during`));
                sampleCount++;
                if (sampleCount % 30 === 0) {
                    await persistMetrics();
                }
                await interruptibleDelay(3000, () => stopped);
            }
        })();

        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout }),
            page.getByTestId(buttonTestId).click({ noWaitAfter: true }),
        ]);

        const downloadPath = await download.path();
        if (!downloadPath) {
            throw new Error(`Playwright did not expose a ${kind.toUpperCase()} download path`);
        }

        await expect(page.getByText('Exporting model...')).toBeHidden({ timeout: 60 * 1000 });
        const fileStats = await stat(downloadPath);
        const elapsedMs = Date.now() - startedAt;

        if (kind === '3mf') {
            await validate3MF(downloadPath);
        } else {
            exportMetrics.triangleCount = await validateSTL(downloadPath);
            exportMetrics.stlStats = await page.evaluate(() => {
                const hook = (
                    window as Window & {
                        __KROMACUT_E2E?: { lastStlExport?: ExportMetrics['stlStats'] };
                    }
                ).__KROMACUT_E2E;
                return hook?.lastStlExport;
            });
        }

        exportMetrics.status = 'complete';
        exportMetrics.elapsedMs = elapsedMs;
        exportMetrics.bytes = fileStats.size;
        exportMetrics.sizeMiB = bytesToMiB(fileStats.size);
        exportMetrics.suggestedFilename = download.suggestedFilename();
        exportMetrics.peakMemory = summarizeMemory(memorySamples);

        await attachJson(testInfo, `${kind}-export-metrics.json`, exportMetrics);
    } catch (error) {
        exportMetrics.status = 'failed';
        exportMetrics.elapsedMs = Date.now() - startedAt;
        exportMetrics.error = error instanceof Error ? error.message : String(error);
        exportMetrics.peakMemory = summarizeMemory(memorySamples);
        throw error;
    } finally {
        stopped = true;
        if (sampler) {
            await sampler;
        }
        metrics.memory.push(await memory.sample(`export-${kind}:after`));
        exportMetrics.peakMemory = summarizeMemory(memorySamples);
        await persistMetrics(true);
    }
}

async function openDownloadMenu(page: Page, expectedItemTestId: string) {
    const trigger = page.getByTestId('download-3d-model');
    const expectedItem = page.getByTestId(expectedItemTestId);
    let lastOpenError: unknown = null;

    await expect(trigger).toBeVisible();
    await expect(trigger).toBeEnabled();

    for (let attempt = 0; attempt < 5; attempt++) {
        if (await expectedItem.isVisible().catch(() => false)) {
            return;
        }

        await trigger.scrollIntoViewIfNeeded();
        try {
            await trigger.click({ force: attempt > 0, noWaitAfter: true, timeout: 10_000 });
        } catch {
            // Large stress scenes can keep Chromium busy enough that Playwright's
            // auto-scroll click times out after the trigger is already visible.
            await trigger.evaluate((element: HTMLElement) => element.click());
        }

        try {
            await expectedItem.waitFor({ state: 'visible', timeout: 10_000 });
            return;
        } catch (error) {
            lastOpenError = error;
        }

        await page.keyboard.press('Escape').catch(() => {
            // The menu may not have opened.
        });
        await delay(500);
    }

    throw lastOpenError ?? new Error(`Download menu item ${expectedItemTestId} did not appear`);
}

async function validateSTL(filePath: string) {
    const bytes = await readFilePrefix(filePath, 84);
    expect(bytes.byteLength).toBe(84);
    const triangleCount = bytes.readUInt32LE(80);
    expect(triangleCount).toBeGreaterThan(0);
    return triangleCount;
}

async function validate3MF(filePath: string) {
    const bytes = await readFilePrefix(filePath, 4);
    expect(bytes.toString('utf8', 0, 2)).toBe('PK');
}

async function readFilePrefix(filePath: string, length: number) {
    const handle = await openFile(filePath, 'r');
    const bytes = Buffer.alloc(length);

    try {
        const result = await handle.read(bytes, 0, length, 0);
        return bytes.subarray(0, result.bytesRead);
    } finally {
        await handle.close();
    }
}

async function timedPhase<T>(
    metrics: FlowMetrics,
    memory: MemorySampler,
    label: string,
    action: () => Promise<T>,
    persistMetrics?: MetricsWriter
): Promise<T> {
    await sample(metrics, memory, `${label}:before`);
    await persistMetrics?.(true);
    const startedAt = Date.now();
    try {
        const result = await action();
        metrics.phases.push({ label, elapsedMs: Date.now() - startedAt });
        return result;
    } catch (error) {
        metrics.phases.push({
            label,
            elapsedMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    } finally {
        await sample(metrics, memory, `${label}:after`);
        await persistMetrics?.(true);
    }
}

async function sample(metrics: FlowMetrics, memory: MemorySampler, label: string) {
    metrics.memory.push(await memory.sample(label));
}

type MemorySampler = {
    sample: (label: string) => Promise<MemorySample>;
};

async function createMemorySampler(page: Page): Promise<MemorySampler> {
    let client: CDPSession | null = null;

    try {
        client = await page.context().newCDPSession(page);
        await client.send('Performance.enable');
    } catch {
        client = null;
    }

    return {
        sample: async (label: string) => {
            const memorySample: MemorySample = {
                label,
                atMs: Date.now(),
            };

            try {
                if (client) {
                    const response = (await client.send('Performance.getMetrics')) as {
                        metrics: Array<{ name: string; value: number }>;
                    };
                    const metricMap = new Map(response.metrics.map((m) => [m.name, m.value]));
                    memorySample.jsHeapUsedSize = metricMap.get('JSHeapUsedSize');
                    memorySample.jsHeapTotalSize = metricMap.get('JSHeapTotalSize');
                    memorySample.domNodes = metricMap.get('Nodes');
                }

                memorySample.performanceMemory = await page.evaluate(() => {
                    const perf = performance as Performance & {
                        memory?: {
                            usedJSHeapSize: number;
                            totalJSHeapSize: number;
                            jsHeapSizeLimit: number;
                        };
                    };

                    if (!perf.memory) return undefined;

                    return {
                        usedJSHeapSize: perf.memory.usedJSHeapSize,
                        totalJSHeapSize: perf.memory.totalJSHeapSize,
                        jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
                    };
                });
            } catch (error) {
                memorySample.error = error instanceof Error ? error.message : String(error);
            }

            return memorySample;
        },
    };
}

function installBrowserErrorCollector(page: Page) {
    const messages: string[] = [];

    page.on('console', (message) => {
        if (message.type() !== 'error' && message.type() !== 'warning') return;
        if (isIgnorableBrowserConsoleMessage(message.text())) return;
        messages.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => {
        messages.push(`pageerror: ${error.message}`);
    });
    page.on('crash', () => {
        messages.push('page crashed');
    });
    page.on('dialog', async (dialog) => {
        messages.push(`dialog ${dialog.type()}: ${dialog.message()}`);
        await dialog.dismiss().catch(() => {
            // Dialog may already be gone if the page is closing.
        });
    });

    return messages;
}

function createMetricsWriter(
    testInfo: TestInfo,
    metrics: FlowMetrics,
    browserErrors: string[]
): MetricsWriter {
    const metricsDir = path.join(repoRoot, 'test-results', 'flow-metrics');
    const metricsFile = path.join(
        metricsDir,
        `${testInfo.project.name}-${slugify(testInfo.title)}.json`
    );
    let lastWrite = 0;

    return async (force = false) => {
        const now = Date.now();
        if (!force && now - lastWrite < 30_000) return;

        lastWrite = now;
        metrics.updatedAt = new Date(now).toISOString();
        metrics.metricsFile = path.relative(repoRoot, metricsFile);

        await mkdir(metricsDir, { recursive: true });
        await writeFile(
            metricsFile,
            JSON.stringify(
                {
                    test: {
                        title: testInfo.title,
                        project: testInfo.project.name,
                        retry: testInfo.retry,
                        status: testInfo.status,
                        flowStatus: inferFlowStatus(metrics, browserErrors),
                        expectedStatus: testInfo.expectedStatus,
                        duration: testInfo.duration,
                    },
                    summary: summarizeFlow(metrics),
                    metrics,
                    browserErrors,
                },
                null,
                2
            )
        );
    };
}

function inferFlowStatus(metrics: FlowMetrics, browserErrors: string[]) {
    if (
        browserErrors.length > 0 ||
        metrics.phases.some((phase) => phase.error) ||
        metrics.exports.some((exportMetric) => exportMetric.status === 'failed')
    ) {
        return 'failed';
    }

    if (metrics.exports.some((exportMetric) => exportMetric.status === 'running')) {
        return 'running';
    }

    return 'passed';
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
    await testInfo
        .attach(name, {
            body: JSON.stringify(value, null, 2),
            contentType: 'application/json',
        })
        .catch(() => {
            // Attachments may be rejected when a long stress run is forcefully interrupted.
        });
}

function slugify(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 140);
}

function summarizeFlow(metrics: FlowMetrics) {
    const exportSummaries = metrics.exports.map((exportMetric) => ({
        kind: exportMetric.kind,
        status: exportMetric.status,
        elapsedMs: exportMetric.elapsedMs,
        bytes: exportMetric.bytes,
        sizeMiB: exportMetric.sizeMiB,
        triangleCount: exportMetric.triangleCount,
        stlStats: exportMetric.stlStats,
        suggestedFilename: exportMetric.suggestedFilename,
        peakMemory: exportMetric.peakMemory ?? summarizeMemory(exportMetric.memorySamples),
    }));

    return {
        caseName: metrics.caseName,
        startedAt: metrics.startedAt,
        updatedAt: metrics.updatedAt,
        metricsFile: metrics.metricsFile,
        build: metrics.build,
        phaseElapsedMs: Object.fromEntries(
            metrics.phases.map((phase) => [phase.label, phase.elapsedMs])
        ),
        peakMemory: summarizeMemory([
            ...metrics.memory,
            ...metrics.exports.flatMap((exportMetric) => exportMetric.memorySamples),
        ]),
        exports: exportSummaries,
        totalExportBytes: exportSummaries.reduce(
            (sum, exportSummary) => sum + (exportSummary.bytes ?? 0),
            0
        ),
        totalExportSizeMiB: bytesToMiB(
            exportSummaries.reduce((sum, exportSummary) => sum + (exportSummary.bytes ?? 0), 0)
        ),
    };
}

function formatFlowSummary(metrics: FlowMetrics) {
    const summary = summarizeFlow(metrics);
    const phases = summary.phaseElapsedMs;
    const build = metrics.build;
    const lines = [
        `[Kromacut e2e metrics] ${metrics.caseName}`,
        `  phases: load ${formatMs(phases['load-image'])}, quantize ${formatMs(
            phases['quantize-defaults']
        )}, dedither ${formatMs(phases['dedither-weight-4-passes-5'])}, configure ${formatMs(
            phases['configure-autopaint-3d']
        )}, build ${formatMs(phases['build-3d-model'])}`,
    ];

    if (build) {
        lines.push(
            `  model: ${formatCount(build.vertexCount)} vertices, ${formatCount(
                build.triangleCount
            )} triangles, build worker ${formatMs(build.elapsedMs)}`
        );
    }

    for (const exportSummary of summary.exports) {
        const triangleText =
            exportSummary.kind === 'stl'
                ? `, ${formatCount(exportSummary.triangleCount)} file triangles`
                : '';
        const stlStatsText = exportSummary.stlStats
            ? ` (${formatCount(exportSummary.stlStats.topQuads)} top, ${formatCount(
                  exportSummary.stlStats.bottomQuads
              )} bottom, ${formatCount(
                  exportSummary.stlStats.horizontalWallQuads +
                      exportSummary.stlStats.verticalWallQuads
              )} wall quads)`
            : '';
        lines.push(
            `  ${exportSummary.kind.toUpperCase()}: ${exportSummary.status}, ${formatMs(
                exportSummary.elapsedMs
            )}, ${formatMiB(exportSummary.sizeMiB)}${triangleText}${stlStatsText}, peak JS heap ${formatMemory(
                exportSummary.peakMemory
            )}`
        );
    }

    lines.push(
        `  total files: ${formatMiB(summary.totalExportSizeMiB)}, peak JS heap ${formatMemory(
            summary.peakMemory
        )}`
    );

    if (summary.metricsFile) {
        lines.push(`  metrics file: ${summary.metricsFile}`);
    }

    return lines.join('\n');
}

function formatMs(ms?: number) {
    if (ms === undefined) return 'n/a';
    return `${Math.round((ms / 1000) * 10) / 10}s`;
}

function formatMiB(sizeMiB?: number) {
    if (sizeMiB === undefined) return 'n/a';
    return `${sizeMiB.toLocaleString('en-US')} MiB`;
}

function formatCount(value?: number) {
    if (value === undefined) return 'n/a';
    return value.toLocaleString('en-US');
}

function formatMemory(memory?: MemorySummary) {
    if (!memory) return 'n/a';
    const heapMiB = memory.jsHeapUsedSizeMiB ?? memory.performanceUsedJSHeapSizeMiB;
    return formatMiB(heapMiB);
}

function summarizeMemory(samples: MemorySample[]): MemorySummary {
    const summary: MemorySummary = {
        sampleCount: samples.length,
    };

    for (const sample of samples) {
        summary.peakJsHeapUsedSize = maxDefined(
            summary.peakJsHeapUsedSize,
            sample.jsHeapUsedSize
        );
        summary.peakJsHeapTotalSize = maxDefined(
            summary.peakJsHeapTotalSize,
            sample.jsHeapTotalSize
        );
        summary.peakDomNodes = maxDefined(summary.peakDomNodes, sample.domNodes);
        summary.peakPerformanceUsedJSHeapSize = maxDefined(
            summary.peakPerformanceUsedJSHeapSize,
            sample.performanceMemory?.usedJSHeapSize
        );
        summary.peakPerformanceTotalJSHeapSize = maxDefined(
            summary.peakPerformanceTotalJSHeapSize,
            sample.performanceMemory?.totalJSHeapSize
        );
    }

    if (summary.peakJsHeapUsedSize !== undefined) {
        summary.jsHeapUsedSizeMiB = bytesToMiB(summary.peakJsHeapUsedSize);
    }
    if (summary.peakPerformanceUsedJSHeapSize !== undefined) {
        summary.performanceUsedJSHeapSizeMiB = bytesToMiB(
            summary.peakPerformanceUsedJSHeapSize
        );
    }

    return summary;
}

function maxDefined(a: number | undefined, b: number | undefined) {
    if (a === undefined) return b;
    if (b === undefined) return a;
    return Math.max(a, b);
}

function bytesToMiB(bytes: number) {
    return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function isIgnorableBrowserConsoleMessage(message: string) {
    return message.includes('GL Driver Message') && message.includes('GPU stall due to ReadPixels');
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function interruptibleDelay(ms: number, shouldStop: () => boolean) {
    const interval = 100;
    let elapsed = 0;

    while (!shouldStop() && elapsed < ms) {
        const nextDelay = Math.min(interval, ms - elapsed);
        await delay(nextDelay);
        elapsed += nextDelay;
    }
}
