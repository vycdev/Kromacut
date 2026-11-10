import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fakeDesktopAfterLoad } from './helpers/fakeDesktop';

type Outcome = 'cancel' | 'failure' | 'success';
type Desktop = Window & {
    saveTest: { outcome: Outcome; calls: string[]; chunks: number[][]; options?: unknown };
};

const palette = {
    version: 2,
    id: 'desktop-export-test',
    name: 'Named colors',
    colors: ['#123456', '#ffffff'],
    disabledColors: [0],
    colorNames: ['Blue', 'White'],
    createdAt: 1,
    updatedAt: 1,
};

test('@smoke palette export preserves browser downloads and uses desktop Save As', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-29T12:00:00Z') });
    await page.addInitScript((saved) => {
        localStorage.clear();
        localStorage.setItem('kromacut.palettes', JSON.stringify([saved]));
        localStorage.setItem('kromacut.palettes.selected', saved.id);
    }, palette);
    await page.goto('/app');
    const button = page.getByRole('button', { name: 'Export selected palette as .kpal file' });
    await expect(button).toBeVisible();
    const before = await page.evaluate(() => localStorage.getItem('kromacut.palettes'));
    const downloadPromise = page.waitForEvent('download');
    await button.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.kpal$/);
    const browserPalette = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(browserPalette).toEqual(palette);

    const nativeDownloads: string[] = [];
    page.on('download', (item) => nativeDownloads.push(item.suggestedFilename()));
    await fakeDesktopAfterLoad(page, (desktop) => {
        const host = window as unknown as Desktop;
        host.saveTest = { outcome: 'cancel', calls: [], chunks: [] };
        const commands = [
            'plugin:dialog|save',
            'plugin:fs|open',
            'plugin:fs|write',
            'plugin:resources|close',
            'plugin:dialog|message',
        ];
        desktop.handle(commands, (args: { data: Uint8Array }, command) => {
            const state = host.saveTest;
            state.calls.push(command);
            if (command === 'plugin:dialog|save') {
                state.options = args;
                return state.outcome === 'cancel' ? null : '/mock/palette.kpal';
            }
            if (command === 'plugin:fs|open') return 91;
            if (command === 'plugin:fs|write') {
                if (state.outcome === 'failure') throw new Error('Mock disk failure');
                state.chunks.push(Array.from(args.data));
                return args.data.byteLength;
            }
            if (command === 'plugin:dialog|message') return 'Ok';
        });
    });
    // Keep the feedback dismissal timer paused so it cannot mask a failed recovery.
    await page.clock.pauseAt(new Date('2026-10-29T13:00:00Z'));
    for (const outcome of ['cancel', 'failure', 'success', 'cancel'] as const) {
        await page.evaluate((value) => {
            (window as unknown as Desktop).saveTest = { outcome: value, calls: [], chunks: [] };
        }, outcome);
        await button.click();
        await expect
            .poll(() => page.evaluate(() => (window as unknown as Desktop).saveTest.calls.length))
            .toBeGreaterThan(0);
        if (outcome === 'failure') {
            await expect(
                page.getByText('Could not export the palette. Please try saving again.')
            ).toBeVisible();
        }
        if (outcome === 'success') {
            await expect
                .poll(() =>
                    page.evaluate(() => (window as unknown as Desktop).saveTest.calls.at(-1))
                )
                .toBe('plugin:dialog|message');
            await expect(
                page.getByText('Could not export the palette. Please try saving again.')
            ).not.toBeVisible();
        }
        const state = await page.evaluate(() => (window as unknown as Desktop).saveTest);
        expect(state.options).toEqual({
            options: {
                title: 'Save Color palette',
                defaultPath: download.suggestedFilename(),
                filters: [{ name: 'Color palette', extensions: ['kpal'] }],
            },
        });
        if (outcome === 'cancel') expect(state.calls).toEqual(['plugin:dialog|save']);
        else expect(state.calls).toContain('plugin:resources|close');
        if (outcome !== 'success') expect(state.calls).not.toContain('plugin:dialog|message');
        else
            expect(JSON.parse(Buffer.from(state.chunks.flat()).toString('utf8'))).toEqual(
                browserPalette
            );
        expect(await page.evaluate(() => localStorage.getItem('kromacut.palettes'))).toBe(before);
    }
    expect(nativeDownloads).toEqual([]);
    expect(errors).toEqual([]);
});
