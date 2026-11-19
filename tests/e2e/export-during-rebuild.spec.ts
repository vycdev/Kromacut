import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, test, type Page } from '@playwright/test';

type ExportSummary = {
    meshObjectNames: string[];
    extruders: string[];
    nozzleDiameter: unknown;
    pauseLayers: string[];
};

type HarnessWindow = Window & {
    __KROMACUT_E2E: { buildHistory: unknown[]; lastBuild?: { status: string } };
    __KROMACUT_LAST_MESH?: unknown;
    __holdIdle: boolean;
    __releaseIdle: () => void;
};

async function summarize3MF(path: string): Promise<ExportSummary> {
    const zip = await JSZip.loadAsync(await readFile(path));
    const settings = (await zip.file('Metadata/model_settings.config')?.async('string')) ?? '';
    const project = JSON.parse(
        (await zip.file('Metadata/project_settings.config')?.async('string')) ?? '{}'
    );
    const gcode = (await zip.file('Metadata/custom_gcode_per_layer.xml')?.async('string')) ?? '';
    return {
        meshObjectNames: [...settings.matchAll(/<metadata key="name" value="([^"]*)"/g)].map(
            (m) => m[1]
        ),
        extruders: [...settings.matchAll(/<metadata key="extruder" value="([^"]*)"/g)].map(
            (m) => m[1]
        ),
        nozzleDiameter: project.nozzle_diameter,
        pauseLayers: [...gcode.matchAll(/<layer [^>]*\/>/g)].map((m) => m[0]),
    };
}

async function download3MF(page: Page) {
    const item = page.getByTestId('download-3mf');
    // The menu stays open after an export, so only toggle it when it is closed.
    if (!(await item.isVisible())) await page.getByTestId('download-3d-model').click();
    const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
    return summarize3MF((await download.path())!);
}

const completedBuilds = (page: Page) =>
    page.evaluate(() => (window as unknown as HarnessWindow).__KROMACUT_E2E.buildHistory.length);

test('@smoke a keyboard export during a rebuild never mixes the old mesh with the new settings', async ({
    page,
}) => {
    await page.addInitScript(() => {
        localStorage.setItem(
            'kromacut.autopaint.v1',
            JSON.stringify({
                schemaVersion: 2,
                paintMode: 'autopaint',
                filaments: [
                    { id: 'black', color: '#000000', td: 0.016 },
                    { id: 'white', color: '#ffffff', td: 0.6 },
                    { id: 'red', color: '#e02020', td: 0.3 },
                    { id: 'blue', color: '#2040e0', td: 0.2 },
                ],
                optimizerAlgorithm: 'fast',
                autoPaintMaxHeight: 1.6,
                multiHeadMode: true,
                multiHeadCount: 2,
                multiHeadSearchDepth: 'fast',
                multiHeadColorMode: 'luminance',
            })
        );
        const w = window as unknown as HarnessWindow;
        Object.assign(window, { __KROMACUT_E2E: { buildHistory: [] } });
        // ThreeDView swaps the old mesh for the new one in an idle callback after the build
        // starts. Holding idle callbacks keeps the rebuild in that window for as long as the
        // test needs. Released callbacks keep ThreeDView's timeout, because the build overlay
        // animates continuously and a timeout-less idle callback could wait forever.
        const nativeRequestIdle = window.requestIdleCallback.bind(window);
        const held: IdleRequestCallback[] = [];
        w.__holdIdle = false;
        window.requestIdleCallback = (callback, options) => {
            if (!w.__holdIdle) return nativeRequestIdle(callback, options);
            held.push(callback);
            return -1;
        };
        w.__releaseIdle = () => {
            w.__holdIdle = false;
            for (const callback of held.splice(0)) nativeRequestIdle(callback, { timeout: 300 });
        };
    });
    await page.goto('/app');
    const image = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        ['#000000', '#ffffff', '#e02020', '#2040e0', '#808080', '#f08080'].forEach((c, i) => {
            ctx.fillStyle = c;
            ctx.fillRect((i % 3) * 11, Math.floor(i / 3) * 16, 11, 16);
        });
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'export-during-rebuild.png',
        mimeType: 'image/png',
        buffer: Buffer.from(image, 'base64'),
    });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();

    // Build 1: routed across two heads, with a head-swap pause.
    const build = page.getByTestId('build-3d-model');
    await build.click();
    await expect.poll(() => completedBuilds(page), { timeout: 120_000 }).toBe(1);
    const routed = await download3MF(page);
    expect(routed.extruders.some((extruder) => extruder !== '1')).toBe(true);
    expect(routed.pauseLayers.length).toBeGreaterThan(0);

    // Build 2: single-head, held after its settings are published but before its mesh exists.
    const multiHead = page.getByTestId('autopaint-multi-head-mode');
    await multiHead.click();
    await expect(multiHead).toHaveAttribute('data-state', 'unchecked');
    await page.evaluate(() => ((window as unknown as HarnessWindow).__holdIdle = true));
    await build.click();
    await expect
        .poll(() =>
            page.evaluate(
                () => (window as unknown as HarnessWindow).__KROMACUT_E2E.lastBuild?.status
            )
        )
        .toBe('building');
    await expect(page.getByText('Head Schedule', { exact: true })).toHaveCount(0);

    // The old mesh is no longer offered for export, and the download menu is off.
    expect(
        await page.evaluate(() => (window as unknown as HarnessWindow).__KROMACUT_LAST_MESH)
    ).toBeUndefined();
    const trigger = page.getByTestId('download-3d-model');
    await expect(trigger).toBeDisabled();

    // Keyboard users cannot reach the preview actions behind the build overlay.
    const reached = new Set<string>();
    for (let tab = 0; tab < 120; tab++) {
        await page.keyboard.press('Tab');
        const testId = await page.evaluate(
            () => document.activeElement?.getAttribute('data-testid') ?? ''
        );
        reached.add(testId);
    }
    expect(reached.has('build-3d-model'), 'Tab should cycle through the controls').toBe(true);
    expect(reached.has('download-3d-model')).toBe(false);
    expect(
        await page
            .locator('[data-testid="download-3d-model"]')
            .evaluate((el) => !!el.closest('[inert]'))
    ).toBe(true);

    // Once the rebuild finishes, the export is the single-head model with its own settings.
    await page.evaluate(() => (window as unknown as HarnessWindow).__releaseIdle());
    await expect.poll(() => completedBuilds(page), { timeout: 120_000 }).toBe(2);
    await expect(trigger).toBeEnabled();
    const single = await download3MF(page);
    expect(single.meshObjectNames).not.toEqual(routed.meshObjectNames);
    expect(single.pauseLayers).toEqual([]);
    expect(single.nozzleDiameter).not.toEqual(routed.nozzleDiameter);
});
