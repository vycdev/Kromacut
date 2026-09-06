import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

type Outcome = 'cancel' | 'failure' | 'success';
type Desktop = Window & {
    isTauri: boolean;
    saveTest: { outcome: Outcome; calls: string[]; chunks: number[][]; options?: unknown };
    __TAURI_INTERNALS__: { invoke: (command: string, args?: unknown) => Promise<unknown> };
};

test('@smoke filament profile export preserves browser downloads and uses desktop Save As', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
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
    const button = page.getByTitle('Export current filaments as .kfil file', { exact: true });
    const before = await page.evaluate(() => localStorage.getItem('kromacut.autopaint.profiles'));

    const downloadPromise = page.waitForEvent('download');
    await button.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.kfil$/);
    const browserProfile = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(browserProfile).toEqual({ ...JSON.parse(before!)[0], updatedAt: expect.any(Number) });

    const nativeDownloads: string[] = [];
    page.on('download', (item) => nativeDownloads.push(item.suggestedFilename()));
    await page.evaluate(() => {
        const desktop = window as unknown as Desktop;
        desktop.isTauri = true;
        desktop.saveTest = { outcome: 'cancel', calls: [], chunks: [] };
        desktop.__TAURI_INTERNALS__ = {
            async invoke(command, args) {
                const state = desktop.saveTest;
                state.calls.push(command);
                if (command === 'plugin:dialog|save') {
                    state.options = args;
                    return state.outcome === 'cancel' ? null : 'C:\\mock\\profile.kfil';
                }
                if (command === 'plugin:fs|open') return 91;
                if (command === 'plugin:fs|write') {
                    if (state.outcome === 'failure') throw new Error('Mock disk failure');
                    const { data } = args as { data: Uint8Array };
                    state.chunks.push(Array.from(data));
                    return data.byteLength;
                }
                if (command === 'plugin:resources|close') return;
                if (command === 'plugin:dialog|message') return 'Ok';
                throw new Error(`Unexpected command: ${command}`);
            },
        };
    });

    for (const outcome of ['cancel', 'failure', 'success'] as const) {
        await page.evaluate((value) => {
            (window as unknown as Desktop).saveTest = { outcome: value, calls: [], chunks: [] };
        }, outcome);
        await button.click();
        await expect
            .poll(() => page.evaluate(() => (window as unknown as Desktop).saveTest.calls.length))
            .toBeGreaterThan(0);
        if (outcome === 'failure') {
            await expect(
                page.getByText('Could not export the filament profile. Please try saving again.')
            ).toBeVisible();
        }
        if (outcome === 'success') {
            await expect
                .poll(() =>
                    page.evaluate(() => (window as unknown as Desktop).saveTest.calls.at(-1))
                )
                .toBe('plugin:dialog|message');
        }
        if (outcome === 'success') {
            await expect(
                page.getByText('Could not export the filament profile. Please try saving again.')
            ).not.toBeVisible();
        }
        const state = await page.evaluate(() => (window as unknown as Desktop).saveTest);
        expect(state.options).toEqual({
            options: {
                title: 'Save Filament profile',
                defaultPath: download.suggestedFilename(),
                filters: [{ name: 'Filament profile', extensions: ['kfil'] }],
            },
        });
        if (outcome === 'cancel') expect(state.calls).toEqual(['plugin:dialog|save']);
        else expect(state.calls).toContain('plugin:resources|close');
        if (outcome !== 'success') expect(state.calls).not.toContain('plugin:dialog|message');
        else
            expect(JSON.parse(Buffer.from(state.chunks.flat()).toString('utf8'))).toEqual({
                ...browserProfile,
                updatedAt: expect.any(Number),
            });
        expect(await page.evaluate(() => localStorage.getItem('kromacut.autopaint.profiles'))).toBe(
            before
        );
    }
    expect(nativeDownloads).toEqual([]);
    expect(errors).toEqual([]);
});
