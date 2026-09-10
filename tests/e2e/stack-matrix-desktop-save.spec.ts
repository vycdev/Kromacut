import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import type { StackMatrixCalibrationV1 } from '../../src/lib/appearanceProfile';

const twoColorProfile = fileURLToPath(
    new URL('../assets/filament-profiles/2_Colors.kapp', import.meta.url)
);
const chosenPath = 'C:\\mock-save-dialog\\white-backed-matrix.3mf';
type SaveOutcome = 'cancel' | 'write-failure' | 'success';
interface NativeSaveState {
    outcome: SaveOutcome;
    calls: Array<{ command: string; args: unknown }>;
    chunks: number[][];
    closed: boolean;
}
type MockDesktopWindow = Window & {
    isTauri: boolean;
    __nativeSaveState: NativeSaveState;
    __TAURI_INTERNALS__: {
        invoke: (command: string, args?: unknown) => Promise<unknown>;
    };
};

async function installDesktopSaveMock(page: Page) {
    await page.evaluate((selectedPath) => {
        const desktop = window as unknown as MockDesktopWindow;
        desktop.isTauri = true;
        desktop.__nativeSaveState = {
            outcome: 'cancel',
            calls: [],
            chunks: [],
            closed: false,
        };
        // Exercise the production save helper and plugin serialization without
        // crossing into a real native dialog or filesystem.
        desktop.__TAURI_INTERNALS__ = {
            async invoke(command, args = {}) {
                const state = desktop.__nativeSaveState;
                if (command === 'plugin:fs|write') {
                    const { rid, data } = args as { rid: number; data: Uint8Array };
                    state.calls.push({ command, args: { rid, byteLength: data.byteLength } });
                    if (state.outcome === 'write-failure') {
                        throw new Error('Mock native disk write failed');
                    }
                    state.chunks.push(Array.from(data));
                    return data.byteLength;
                }
                state.calls.push({ command, args });
                if (command === 'plugin:dialog|save') {
                    return state.outcome === 'cancel' ? null : selectedPath;
                }
                if (command === 'plugin:fs|open') return 91;
                if (command === 'plugin:resources|close') {
                    state.closed = true;
                    return;
                }
                if (command === 'plugin:dialog|message') return 'Ok';
                throw new Error(`Unexpected native command: ${command}`);
            },
        };
    }, chosenPath);
}

async function resetNativeSave(page: Page, outcome: SaveOutcome) {
    await page.evaluate((nextOutcome) => {
        (window as unknown as MockDesktopWindow).__nativeSaveState = {
            outcome: nextOutcome,
            calls: [],
            chunks: [],
            closed: false,
        };
    }, outcome);
}

async function nativeSaveState(page: Page) {
    return page.evaluate(() => (window as unknown as MockDesktopWindow).__nativeSaveState);
}

async function savedProfiles(page: Page) {
    return page.evaluate(() => localStorage.getItem('kromacut.autopaint.profiles'));
}

function expectSaveDialog(state: NativeSaveState) {
    expect(state.calls.filter((call) => call.command === 'plugin:dialog|save')).toEqual([
        {
            command: 'plugin:dialog|save',
            args: {
                options: {
                    title: 'Save Stack Matrix 3MF',
                    defaultPath: expect.stringMatching(/^kromacut-stack-matrix-\d+\.3mf$/),
                    filters: [{ name: 'Stack Matrix 3MF', extensions: ['3mf'] }],
                },
            },
        },
    ]);
}

function expectClosedNativeFile(state: NativeSaveState) {
    expect(state.calls.filter((call) => call.command === 'plugin:fs|open')).toEqual([
        {
            command: 'plugin:fs|open',
            args: {
                path: chosenPath,
                options: { read: false, write: true, create: true, truncate: true },
            },
        },
    ]);
    expect(state.calls.some((call) => call.command === 'plugin:fs|write')).toBe(true);
    expect(state.closed).toBe(true);
    expect(state.calls.filter((call) => call.command === 'plugin:resources|close')).toEqual([
        { command: 'plugin:resources|close', args: { rid: 91 } },
    ]);
}

async function readNativeMatrix(state: NativeSaveState) {
    expectSaveDialog(state);
    expectClosedNativeFile(state);
    expect(state.calls.at(-1)).toEqual({
        command: 'plugin:dialog|message',
        args: { message: `Saved to:\n${chosenPath}`, title: 'Kromacut', kind: 'info' },
    });
    const zip = await JSZip.loadAsync(Uint8Array.from(state.chunks.flat()));
    const record = JSON.parse(
        await zip.file('Metadata/kromacut-stack-matrix.json')!.async('string')
    ) as StackMatrixCalibrationV1;
    const model = await zip.file('3D/3dmodel.model')!.async('string');
    return { record, model: model.replace(/ p:UUID="[^"]*"/g, '') };
}

test('@smoke @matrix Stack Matrix desktop saves use native Save As and preserve records on cancel or write failure', async ({
    page,
}, testInfo) => {
    testInfo.setTimeout(3 * 60 * 1000);
    const browserDownloads: string[] = [];
    page.on('download', (download) => browserDownloads.push(download.suggestedFilename()));
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    await expect(page.getByTestId('image-file-input')).toBeAttached();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await page.getByTestId('autopaint-profile-import-input').setInputFiles(twoColorProfile);
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible();
    await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('tab', { name: 'Stack Matrix', exact: true }).click();
    await installDesktopSaveMock(page);
    const initialProfiles = await savedProfiles(page);
    const createButton = dialog.getByRole('button', {
        name: 'Create and download 3MF',
        exact: true,
    });

    for (const outcome of ['cancel', 'write-failure'] as const) {
        await resetNativeSave(page, outcome);
        await createButton.click();
        await expect
            .poll(async () => (await nativeSaveState(page)).calls.length)
            .toBeGreaterThan(0);
        await expect(createButton).toBeEnabled();
        const state = await nativeSaveState(page);
        expectSaveDialog(state);
        if (outcome === 'cancel') {
            expect(state.calls).toHaveLength(1);
        } else {
            expectClosedNativeFile(state);
            await expect(
                dialog.getByText('Mock native disk write failed', { exact: true })
            ).toBeVisible();
        }
        expect(state.calls.some((call) => call.command === 'plugin:dialog|message')).toBe(false);
        expect(await savedProfiles(page)).toBe(initialProfiles);
        await expect(
            dialog.getByRole('heading', { name: 'New Stack Matrix', exact: true })
        ).toBeVisible();
    }

    await resetNativeSave(page, 'success');
    await createButton.click();
    const downloadAgain = dialog.getByRole('button', { name: 'Download 3MF', exact: true });
    await expect(downloadAgain).toBeEnabled();
    const first = await readNativeMatrix(await nativeSaveState(page));
    const frozenProfiles = await savedProfiles(page);
    expect(frozenProfiles).not.toBe(initialProfiles);

    for (const outcome of ['cancel', 'write-failure'] as const) {
        await resetNativeSave(page, outcome);
        await downloadAgain.click();
        await expect
            .poll(async () => (await nativeSaveState(page)).calls.length)
            .toBeGreaterThan(0);
        await expect(downloadAgain).toBeEnabled();
        const state = await nativeSaveState(page);
        expectSaveDialog(state);
        if (outcome === 'cancel') {
            expect(state.calls).toHaveLength(1);
        } else {
            expectClosedNativeFile(state);
            await expect(
                dialog.getByText('Mock native disk write failed', { exact: true })
            ).toBeVisible();
        }
        expect(state.calls.some((call) => call.command === 'plugin:dialog|message')).toBe(false);
        expect(await savedProfiles(page)).toBe(frozenProfiles);
    }

    await resetNativeSave(page, 'success');
    await downloadAgain.click();
    await expect
        .poll(async () => (await nativeSaveState(page)).calls.at(-1)?.command)
        .toBe('plugin:dialog|message');
    await expect(downloadAgain).toBeEnabled();
    const repeated = await readNativeMatrix(await nativeSaveState(page));
    expect(repeated.record.id).toBe(first.record.id);
    expect(repeated.record.process).toEqual(first.record.process);
    expect(repeated.record.samples).toEqual(first.record.samples);
    expect(repeated.model === first.model).toBe(true);
    expect(browserDownloads).toEqual([]);
});
