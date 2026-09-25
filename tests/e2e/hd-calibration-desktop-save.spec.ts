import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

type Format = 'stl' | '3mf';
type Outcome = 'cancel' | 'failure' | 'success';
interface SaveState {
    outcome: Outcome;
    calls: Array<{ command: string; args: unknown }>;
    chunks: number[][];
}
type Desktop = Window & {
    isTauri: boolean;
    hdSave: SaveState;
    finishHdSave: () => void;
    __TAURI_INTERNALS__: { invoke: (command: string, args?: unknown) => Promise<unknown> };
};

async function openWedge(page: Page, format: Format) {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    await expect(page.getByTestId('image-file-input')).toBeAttached();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await page
        .getByTestId('autopaint-profile-import-input')
        .setInputFiles(
            fileURLToPath(new URL('../assets/filament-profiles/2_Colors.kapp', import.meta.url))
        );
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible();
    await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: /^Select all/ }).click();
    await dialog.getByRole('button', { name: 'Next: Base', exact: true }).click();
    await dialog.getByRole('button', { name: 'Next: Print', exact: true }).click();
    if (format === '3mf') {
        await dialog.getByRole('button', { name: '3MF (multi-material)', exact: true }).click();
    }
    await dialog.getByRole('spinbutton').nth(0).fill('0.12');
    await dialog.getByRole('spinbutton').nth(0).press('Tab');
    return dialog;
}

async function installDesktopSave(page: Page, path: string) {
    await page.evaluate((chosenPath) => {
        const desktop = window as unknown as Desktop;
        desktop.isTauri = true;
        desktop.__TAURI_INTERNALS__ = {
            async invoke(command, args = {}) {
                const state = desktop.hdSave;
                if (command === 'plugin:fs|write') {
                    const { rid, data } = args as { rid: number; data: Uint8Array };
                    state.calls.push({ command, args: { rid, byteLength: data.byteLength } });
                    if (state.outcome === 'failure') throw new Error('Mock disk write failure');
                    state.chunks.push(Array.from(data));
                    return data.byteLength;
                }
                state.calls.push({ command, args });
                if (command === 'plugin:dialog|save') {
                    // Keep the dialog pending so busy-state behavior is observable.
                    return new Promise((resolve) => {
                        desktop.finishHdSave = () =>
                            resolve(state.outcome === 'cancel' ? null : chosenPath);
                    });
                }
                if (command === 'plugin:fs|open') return 91;
                if (command === 'plugin:resources|close') return;
                if (command === 'plugin:dialog|message') return 'Ok';
                throw new Error(`Unexpected native command: ${command}`);
            },
        };
    }, path);
}

async function expectMeasurePlan(dialog: Locator, maxLayers: number) {
    await dialog.getByRole('button', { name: 'Next: Enter Results', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Enter Opacity Layers' })).toBeVisible();
    for (const input of await dialog.getByRole('spinbutton').all()) {
        await expect(input).toHaveAttribute('max', String(maxLayers));
    }
    await dialog.getByRole('button', { name: 'Back', exact: true }).click();
}

async function inspectExport(bytes: Buffer, format: Format) {
    if (format === 'stl') {
        const triangles = bytes.readUInt32LE(80);
        expect(triangles).toBeGreaterThan(0);
        expect(bytes.byteLength).toBe(84 + triangles * 50);
    } else {
        const zip = await JSZip.loadAsync(bytes);
        const settings = JSON.parse(
            await zip.file('Metadata/project_settings.config')!.async('string')
        );
        expect(settings.layer_height).toBe('0.12');
        expect(settings.filament_colour).toEqual(['#FFFFFF', '#000000']);
        expect(await zip.file('3D/3dmodel.model')!.async('string')).toContain('<mesh>');
    }
}

for (const format of ['stl', '3mf'] as const) {
    test(`@smoke HD calibration ${format.toUpperCase()} uses desktop Save As and preserves browser downloads`, async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const dialog = await openWedge(page, format);
        const downloadButton = dialog.getByRole('button', {
            name: `Download ${format.toUpperCase()}`,
            exact: true,
        });
        const maxLayersInput = dialog.getByRole('spinbutton').nth(1);
        await maxLayersInput.fill('8');
        await maxLayersInput.press('Tab');

        const downloadPromise = page.waitForEvent('download');
        await downloadButton.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe(
            format === 'stl'
                ? 'kromacut-calibration-8layers.stl'
                : 'kromacut-calibration-2reads.3mf'
        );
        await inspectExport(await readFile((await download.path())!), format);
        await expect(downloadButton).toBeEnabled();

        await maxLayersInput.fill('12');
        await maxLayersInput.press('Tab');
        const path = `C:\\mock-save-dialog\\calibration.${format}`;
        await installDesktopSave(page, path);
        const browserDownloads: string[] = [];
        page.on('download', (item) => browserDownloads.push(item.suggestedFilename()));
        const profilesBefore = await page.evaluate(() =>
            localStorage.getItem('kromacut.autopaint.profiles')
        );

        for (const outcome of ['cancel', 'failure', 'success'] as const) {
            await page.evaluate((value) => {
                (window as unknown as Desktop).hdSave = { outcome: value, calls: [], chunks: [] };
            }, outcome);
            await downloadButton.click();
            await expect
                .poll(
                    () => page.evaluate(() => (window as unknown as Desktop).hdSave.calls.length),
                    { timeout: 5000 }
                )
                .toBe(1);
            await expect(
                dialog.getByRole('button', { name: 'Saving…', exact: true })
            ).toBeDisabled();
            await expect(maxLayersInput).toBeDisabled();
            await expect(
                dialog.getByRole('button', { name: 'Next: Enter Results', exact: true })
            ).toBeDisabled();
            await expect(dialog.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
            await expect(
                dialog.getByRole('button', { name: 'Close calibration dialog', exact: true })
            ).toBeDisabled();
            await expect(
                dialog.getByRole('tab', { name: 'Palette Proof', exact: true })
            ).toBeDisabled();

            await page.evaluate(() => (window as unknown as Desktop).finishHdSave());
            await expect(downloadButton).toBeEnabled();
            const state = await page.evaluate(() => (window as unknown as Desktop).hdSave);
            expect(state.calls[0]).toEqual({
                command: 'plugin:dialog|save',
                args: {
                    options: {
                        title: `Save HD calibration ${format.toUpperCase()}`,
                        defaultPath:
                            format === 'stl'
                                ? 'kromacut-calibration-12layers.stl'
                                : 'kromacut-calibration-2reads.3mf',
                        filters: [
                            {
                                name: `HD calibration ${format.toUpperCase()}`,
                                extensions: [format],
                            },
                        ],
                    },
                },
            });
            const exportError = dialog.getByRole('alert');
            if (outcome === 'cancel') {
                expect(state.calls).toHaveLength(1);
                await expect(exportError).toHaveCount(0);
            } else {
                expect(state.calls).toContainEqual({
                    command: 'plugin:fs|open',
                    args: {
                        path,
                        options: { read: false, write: true, create: true, truncate: true },
                    },
                });
                expect(state.calls).toContainEqual({
                    command: 'plugin:resources|close',
                    args: { rid: 91 },
                });
                if (outcome === 'failure') {
                    await expect(exportError).toHaveText(
                        'Could not export the calibration print. Please try saving again.'
                    );
                    expect(
                        state.calls.some((call) => call.command === 'plugin:dialog|message')
                    ).toBe(false);
                } else {
                    await expect(exportError).toHaveCount(0);
                    expect(state.calls.at(-1)).toEqual({
                        command: 'plugin:dialog|message',
                        args: { message: `Saved to:\n${path}`, title: 'Kromacut', kind: 'info' },
                    });
                    await inspectExport(Buffer.from(state.chunks.flat()), format);
                }
            }
            // Cancel/failure must not replace the previously downloaded 8-layer plan.
            await expectMeasurePlan(dialog, outcome === 'success' ? 12 : 8);
            expect(
                await page.evaluate(() => localStorage.getItem('kromacut.autopaint.profiles'))
            ).toBe(profilesBefore);
        }
        expect(browserDownloads).toEqual([]);
        expect(errors).toEqual([]);
    });
}
