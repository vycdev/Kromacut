import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { fakeDesktopBeforeLoad, fakeDesktopCalls } from './helpers/fakeDesktop';

type Outcome = 'success' | 'failure';
type SlicerApp = { name: string; path: string };
type PickRequest = { title: string; filterName: string; keep: string | null };
type SlicerTestWindow = Window & {
    slicerTest: {
        outcome: Outcome;
        bytes: number[][];
        headers: Record<string, string>[];
        installed: SlicerApp[];
        picked: SlicerApp | 'cancel' | 'invalid';
        pickRequests: PickRequest[];
        /** Browsed apps the native side still launches, oldest first, as it stores them. */
        launchable: SlicerApp[];
    };
    __KROMACUT_E2E: { buildHistory: unknown[] };
    /** When set, `find_slicer_app` waits for it; `true` makes the check fail. */
    slicerCheck?: { held: Promise<boolean>; release(fail: boolean): void };
    /** When set, opening the model or the Save As dialog waits for it, prolonging the export. */
    exportHold?: { held: Promise<void>; release(): void };
};

const SLICER_FAILED = 'Could not open the 3MF in your slicer. Use Download 3MF to save it instead.';
const NONE_FOUND =
    'No supported slicers were found in their usual install locations. Use Browse to choose one.';
const SLICER_HEADER = 'X-Kromacut-Slicer-App';
const BAMBU = { name: 'Bambu Studio', path: 'C:\\Program Files\\Bambu Studio\\bambu-studio.exe' };
const ORCA = { name: 'Orca Slicer', path: 'C:\\Program Files\\OrcaSlicer\\orca-slicer.exe' };
const CUSTOM = { name: 'CrealityPrint', path: 'C:\\Users\\José\\Slicers\\CrealityPrint.exe' };
/** Must match `MAX_PICKED_APPS` in `src-tauri/src/slicer_apps.rs`. */
const MAX_PICKED_APPS = 16;

async function openApp(page: Page, savedSlicer: unknown = null) {
    await page.addInitScript((saved) => {
        localStorage.clear();
        if (saved) localStorage.setItem('kromacut:desktop-slicer', JSON.stringify(saved));
        Object.assign(window, { __KROMACUT_E2E: { buildHistory: [] } });
        localStorage.setItem(
            'kromacut:3d-print-settings',
            JSON.stringify({
                pixelSize: 0.4,
                layerHeight: 0.12,
                slicerFirstLayerHeight: 0.2,
                smoothMeshingStrength: 'none',
            })
        );
    }, savedSlicer);
    await page.goto('/app');
}

async function buildModel(page: Page, savedSlicer: unknown = null) {
    await openApp(page, savedSlicer);
    await buildLoadedModel(page);
}

/** Imports a small image into the already open app and builds its 3D model. */
async function buildLoadedModel(page: Page) {
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 8;
        const ctx = canvas.getContext('2d')!;
        ['#000000', '#808080', '#ffffff'].forEach((color, i) => {
            ctx.fillStyle = color;
            ctx.fillRect(i * 8, 0, 8, 8);
        });
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'slicer-handoff.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByTestId('build-3d-model').click();
    await page.waitForFunction(
        () => (window as unknown as SlicerTestWindow).__KROMACUT_E2E.buildHistory.length > 0
    );
    await expect(page.getByTestId('download-3d-model')).toBeEnabled();
}

test('@smoke the browser download menu does not offer Open in Slicer', async ({ page }) => {
    await buildModel(page);
    await page.getByTestId('download-3d-model').click();
    await expect(page.getByTestId('download-3mf')).toBeVisible();
    await expect(page.getByTestId('open-3mf-in-slicer')).toHaveCount(0);
});

test('@smoke desktop Open in Slicer hands the built 3MF to the native app', async ({ page }) => {
    const errors: string[] = [];
    const dialogs: string[] = [];
    const downloads: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => {
        dialogs.push(dialog.message());
        void dialog.accept();
    });
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    await fakeDesktopBeforeLoad(page, (desktop) => {
        const host = window as unknown as SlicerTestWindow;
        host.slicerTest = {
            outcome: 'success',
            bytes: [],
            headers: [],
            installed: [],
            picked: 'cancel',
            pickRequests: [],
            launchable: [],
        };
        desktop.handle('open_model_in_slicer', (model: Uint8Array, _command, options) => {
            const state = host.slicerTest;
            state.bytes.push(Array.from(model));
            state.headers.push((options.headers ?? {}) as Record<string, string>);
            if (state.outcome === 'failure') throw new Error('Mock launch failure');
            return '/cache/slicer-handoff/model.3mf';
        });
        desktop.handle('list_slicer_apps', () => []);
    });
    await buildModel(page);

    const state = () => page.evaluate(() => (window as unknown as SlicerTestWindow).slicerTest);
    const openInSlicer = page.getByTestId('open-3mf-in-slicer');
    await page.getByTestId('download-3d-model').click();
    await expect(openInSlicer).toHaveText('Open in Slicer');
    await expect(page.getByTestId('choose-slicer')).toHaveCount(0);
    await openInSlicer.click();
    // Nothing is saved yet, so the chooser asks first; no slicers are installed here.
    const chooser = page.getByTestId('slicer-chooser');
    await expect(chooser).toBeVisible();
    await expect(chooser.getByText(NONE_FOUND)).toBeVisible();
    await expect(page.getByTestId('slicer-option-system')).toBeChecked();
    await page.getByTestId('slicer-open').click();
    await expect.poll(async () => (await state()).bytes.length).toBe(1);
    await expect(page.getByTestId('download-3d-model')).toBeEnabled();
    // A successful handoff counts as the first export.
    await expect(page.getByTestId('star-prompt')).toBeVisible();

    const handoff = await state();
    expect(Object.keys(handoff.headers[0])).toEqual(['X-Kromacut-File-Name']);
    expect(handoff.headers[0]['X-Kromacut-File-Name']).toMatch(/^kromacut-\d{4}-\d{2}-\d{2}\.3mf$/);
    const zip = await JSZip.loadAsync(Uint8Array.from(handoff.bytes[0]));
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(await zip.file('3D/3dmodel.model')!.async('string')).toContain('<mesh>');
    expect(dialogs).toEqual([]);

    await page.evaluate(() => {
        (window as unknown as SlicerTestWindow).slicerTest.outcome = 'failure';
    });
    if (!(await openInSlicer.isVisible())) await page.getByTestId('download-3d-model').click();
    await openInSlicer.click();
    await page.getByTestId('slicer-open').click();
    await expect.poll(() => dialogs).toEqual([SLICER_FAILED]);
    await expect(page.getByTestId('download-3d-model')).toBeEnabled();
    expect((await state()).bytes).toHaveLength(2);

    const calls = await fakeDesktopCalls(page);
    expect(calls.filter((call) => call === 'open_model_in_slicer')).toHaveLength(2);
    expect(calls.filter((call) => call === 'list_slicer_apps')).toHaveLength(2);
    expect(calls).not.toContain('plugin:dialog|save');
    expect(downloads).toEqual([]);
    expect(errors).toEqual([]);
});

async function setUpChooser(
    page: Page,
    installed: SlicerApp[],
    savedSlicer: unknown = null,
    build = true
) {
    await fakeDesktopBeforeLoad(
        page,
        (desktop, { installed: apps, maxPicked }) => {
            const host = window as unknown as SlicerTestWindow;
            host.slicerTest = {
                outcome: 'success',
                bytes: [],
                headers: [],
                installed: apps,
                picked: 'cancel',
                pickRequests: [],
                launchable: [],
            };
            desktop.handle('open_model_in_slicer', async (model: Uint8Array, _command, options) => {
                host.slicerTest.bytes.push(Array.from(model.slice(0, 4)));
                host.slicerTest.headers.push((options.headers ?? {}) as Record<string, string>);
                await host.exportHold?.held;
                return '/cache/slicer-handoff/model.3mf';
            });
            // A cancelled Save As, for Download 3MF.
            desktop.handle('plugin:dialog|save', async () => {
                await host.exportHold?.held;
                return null;
            });
            desktop.handle('list_slicer_apps', () => host.slicerTest.installed);
            desktop.handle('find_slicer_app', ({ path }: { path: string }) => {
                const find = () => {
                    const { installed, launchable } = host.slicerTest;
                    return [...installed, ...launchable].find((app) => app.path === path) ?? null;
                };
                if (!host.slicerCheck) return find();
                return host.slicerCheck.held.then((fail) => {
                    if (fail) throw new Error('Mock check failure');
                    return find();
                });
            });
            desktop.handle('pick_slicer_app', (request: PickRequest) => {
                const state = host.slicerTest;
                state.pickRequests.push(request);
                const picked = state.picked;
                if (picked === 'invalid') throw new Error('Not a launchable app');
                if (picked === 'cancel') return null;
                // Like the native side: the newest picks stay launchable, and so does `keep`.
                const launchable = state.launchable.filter((app) => app.path !== picked.path);
                launchable.push(picked);
                while (launchable.length > maxPicked) {
                    const oldest = launchable.findIndex((app) => app.path !== request.keep);
                    if (oldest < 0) break;
                    launchable.splice(oldest, 1);
                }
                state.launchable = launchable;
                return picked;
            });
        },
        { installed, maxPicked: MAX_PICKED_APPS }
    );
    if (build) await buildModel(page, savedSlicer);
    else await openApp(page, savedSlicer);
    return {
        state: () => page.evaluate(() => (window as unknown as SlicerTestWindow).slicerTest),
        set: (update: Partial<SlicerTestWindow['slicerTest']>) =>
            page.evaluate((next) => {
                Object.assign((window as unknown as SlicerTestWindow).slicerTest, next);
            }, update),
        openMenu: async () => {
            if (!(await page.getByTestId('download-3mf').isVisible()))
                await page.getByTestId('download-3d-model').click();
        },
        savedPreference: () =>
            page.evaluate(() => {
                const raw = localStorage.getItem('kromacut:desktop-slicer');
                return raw === null ? null : JSON.parse(raw);
            }),
    };
}

test('@smoke desktop Open in Slicer remembers, changes and forgets the chosen slicer', async ({
    page,
}) => {
    const errors: string[] = [];
    const dialogs: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => {
        dialogs.push(dialog.message());
        void dialog.accept();
    });
    const slicers = await setUpChooser(page, [BAMBU, ORCA]);
    const chooser = page.getByTestId('slicer-chooser');
    const openInSlicer = page.getByTestId('open-3mf-in-slicer');
    const chooseSlicer = page.getByTestId('choose-slicer');
    const options = chooser.getByTestId('slicer-option');

    // Installed slicers are offered next to the system default, which is selected.
    await slicers.openMenu();
    await openInSlicer.click();
    await expect(options).toHaveCount(2);
    await expect(chooser.getByText(BAMBU.name, { exact: true })).toBeVisible();
    await expect(chooser.getByText(ORCA.path)).toBeVisible();
    await expect(page.getByTestId('slicer-option-system')).toBeChecked();
    await expect(page.getByTestId('slicer-remember')).toHaveAttribute('aria-checked', 'false');

    // Cancelling exports nothing.
    await chooser.getByRole('button', { name: 'Cancel' }).click();
    await expect(chooser).toHaveCount(0);
    expect((await slicers.state()).bytes).toHaveLength(0);

    // Choose Orca and remember it.
    await slicers.openMenu();
    await openInSlicer.click();
    await chooser.getByText(ORCA.name, { exact: true }).click();
    await expect(options.nth(1)).toBeChecked();
    await page.getByTestId('slicer-remember').click();
    await page.getByTestId('slicer-open').click();
    await expect(chooser).toHaveCount(0);
    await expect.poll(async () => (await slicers.state()).headers.length).toBe(1);
    let handoff = await slicers.state();
    expect(handoff.headers[0][SLICER_HEADER]).toBe(encodeURIComponent(ORCA.path));
    expect(handoff.bytes[0]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(await slicers.savedPreference()).toEqual({ kind: 'app', app: ORCA });

    // The saved slicer opens straight away, and the menu names it.
    await expect(page.getByTestId('download-3d-model')).toBeEnabled();
    await slicers.openMenu();
    await expect(openInSlicer).toHaveText('Open in Orca Slicer');
    await expect(chooseSlicer).toHaveText('Choose Slicer…');
    await openInSlicer.click();
    await expect.poll(async () => (await slicers.state()).headers.length).toBe(2);
    await expect(chooser).toHaveCount(0);
    handoff = await slicers.state();
    expect(handoff.headers[1][SLICER_HEADER]).toBe(encodeURIComponent(ORCA.path));

    // Choose Slicer reopens the chooser with the saved choice; a rejected Browse pick says why.
    await expect(page.getByTestId('download-3d-model')).toBeEnabled();
    await slicers.openMenu();
    await chooseSlicer.click();
    await expect(options.nth(1)).toBeChecked();
    await expect(page.getByTestId('slicer-remember')).toHaveAttribute('aria-checked', 'true');
    await slicers.set({ picked: 'invalid' });
    await page.getByTestId('slicer-browse').click();
    await expect(chooser.getByRole('alert')).toHaveText(
        'That file is not an app Kromacut can open models with. Choose the slicer app itself.'
    );
    await expect(options.nth(1)).toBeChecked();

    // A browsed slicer is added and selected; turning remember off forgets the saved slicer.
    await slicers.set({ picked: CUSTOM });
    await page.getByTestId('slicer-browse').click();
    await expect(options).toHaveCount(3);
    await expect(options.nth(2)).toBeChecked();
    await expect(chooser.getByRole('alert')).toHaveCount(0);
    await page.getByTestId('slicer-remember').click();
    await page.getByTestId('slicer-open').click();
    await expect.poll(async () => (await slicers.state()).headers.length).toBe(3);
    handoff = await slicers.state();
    expect(handoff.headers[2][SLICER_HEADER]).toBe(encodeURIComponent(CUSTOM.path));
    // Browse names the saved slicer, so the native side never forgets it among later picks.
    expect(handoff.pickRequests).toEqual([
        { title: 'Choose a slicer app', filterName: 'Applications', keep: ORCA.path },
        { title: 'Choose a slicer app', filterName: 'Applications', keep: ORCA.path },
    ]);
    expect(await slicers.savedPreference()).toBeNull();
    await expect(page.getByTestId('download-3d-model')).toBeEnabled();
    await slicers.openMenu();
    await expect(openInSlicer).toHaveText('Open in Slicer');
    await expect(chooseSlicer).toHaveCount(0);

    // Remembering the system default skips the chooser without naming a slicer.
    await openInSlicer.click();
    await page.getByTestId('slicer-remember').click();
    await page.getByTestId('slicer-open').click();
    await expect.poll(async () => (await slicers.state()).headers.length).toBe(4);
    expect(await slicers.savedPreference()).toEqual({ kind: 'system' });
    await expect(page.getByTestId('download-3d-model')).toBeEnabled();
    await slicers.openMenu();
    await expect(openInSlicer).toHaveText('Open in Slicer');
    await expect(chooseSlicer).toBeVisible();
    await openInSlicer.click();
    await expect.poll(async () => (await slicers.state()).headers.length).toBe(5);
    await expect(chooser).toHaveCount(0);
    handoff = await slicers.state();
    expect(Object.keys(handoff.headers[3])).toEqual(['X-Kromacut-File-Name']);
    expect(Object.keys(handoff.headers[4])).toEqual(['X-Kromacut-File-Name']);

    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
});

test('@smoke desktop Open in Slicer asks again when the saved slicer is gone', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Bambu Studio was uninstalled after it was saved.
    const slicers = await setUpChooser(page, [ORCA], { kind: 'app', app: BAMBU });
    const chooser = page.getByTestId('slicer-chooser');

    await slicers.openMenu();
    await expect(page.getByTestId('open-3mf-in-slicer')).toHaveText('Open in Bambu Studio');
    await page.getByTestId('open-3mf-in-slicer').click();
    await expect(chooser).toBeVisible();
    await expect(chooser).toContainText('Bambu Studio could not be found. Choose another slicer.');
    await expect(chooser.getByTestId('slicer-option')).toHaveCount(1);
    await expect(page.getByTestId('slicer-option-system')).toBeChecked();
    await expect(page.getByTestId('slicer-remember')).toHaveAttribute('aria-checked', 'false');
    expect(await slicers.savedPreference()).toBeNull();
    expect((await slicers.state()).bytes).toHaveLength(0);

    // The missing slicer is no longer saved, so Browse has nothing to keep.
    await page.getByTestId('slicer-browse').click();
    await expect
        .poll(async () => (await slicers.state()).pickRequests)
        .toEqual([{ title: 'Choose a slicer app', filterName: 'Applications', keep: null }]);

    await chooser.getByRole('button', { name: 'Cancel' }).click();
    await slicers.openMenu();
    await expect(page.getByTestId('open-3mf-in-slicer')).toHaveText('Open in Slicer');
    await expect(page.getByTestId('choose-slicer')).toHaveCount(0);
    expect(await fakeDesktopCalls(page)).not.toContain('open_model_in_slicer');
    expect(errors).toEqual([]);
});

for (const result of ['found', 'missing', 'failed'] as const) {
    test(`@smoke a ${result} saved-slicer check finishing late keeps the Settings chooser`, async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        // Bambu Studio is saved; it is still installed only when the check finds it.
        const installed = result === 'found' ? [BAMBU, ORCA] : [ORCA];
        const slicers = await setUpChooser(page, installed, { kind: 'app', app: BAMBU });
        const chooser = page.getByTestId('slicer-chooser');
        await page.evaluate(() => {
            const host = window as unknown as SlicerTestWindow;
            let release!: (fail: boolean) => void;
            const held = new Promise<boolean>((resolve) => (release = resolve));
            host.slicerCheck = { held, release };
        });

        // Open in Slicer starts the slow check, then Settings opens the chooser to change it.
        await slicers.openMenu();
        await page.getByTestId('open-3mf-in-slicer').click();
        await expect.poll(() => fakeDesktopCalls(page)).toContain('find_slicer_app');
        await page.getByRole('button', { name: 'Open settings' }).click();
        await page.getByTestId('settings-slicer-change').click();
        await expect(page.getByTestId('slicer-save')).toBeVisible();

        await page.evaluate(async (fail) => {
            const check = (window as unknown as SlicerTestWindow).slicerCheck!;
            check.release(fail);
            await check.held;
            // Let the check result reach React and render.
            await new Promise((resolve) => setTimeout(resolve, 100));
        }, result === 'failed');

        // The late result neither replaced the chooser nor opened the model.
        await expect(page.getByTestId('slicer-save')).toHaveText('Save');
        await expect(page.getByTestId('slicer-open')).toHaveCount(0);
        await expect(page.getByTestId('slicer-remember')).toHaveCount(0);
        await expect(chooser).not.toContainText('could not be found');
        expect(await slicers.savedPreference()).toEqual({ kind: 'app', app: BAMBU });
        expect((await slicers.state()).headers).toHaveLength(0);

        // Saving still only remembers the choice.
        await chooser.getByText(ORCA.name, { exact: true }).click();
        await page.getByTestId('slicer-save').click();
        await expect(chooser).toHaveCount(0);
        expect(await slicers.savedPreference()).toEqual({ kind: 'app', app: ORCA });
        expect(await fakeDesktopCalls(page)).not.toContain('open_model_in_slicer');
        expect(errors).toEqual([]);
    });
}

test('@smoke closing the chooser from the download menu returns focus to the menu button', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const slicers = await setUpChooser(page, [BAMBU, ORCA]);
    const chooser = page.getByTestId('slicer-chooser');
    const downloadButton = page.getByTestId('download-3d-model');
    const openFromMenu = async (item: string) => {
        await downloadButton.focus();
        await downloadButton.press('Enter');
        await page.getByTestId(item).focus();
        await page.getByTestId(item).press('Enter');
        await expect(chooser).toBeVisible();
    };

    // The menu item that opened the chooser is gone once the menu closes, so focus goes back
    // to the download button instead of the page body.
    await openFromMenu('open-3mf-in-slicer');
    await page.keyboard.press('Escape');
    await expect(chooser).toHaveCount(0);
    await expect(downloadButton).toBeFocused();

    await openFromMenu('open-3mf-in-slicer');
    await chooser.getByText(ORCA.name, { exact: true }).click();
    await page.getByTestId('slicer-remember').click();
    await page.getByTestId('slicer-open').click();
    await expect.poll(async () => (await slicers.state()).headers.length).toBe(1);
    await expect(downloadButton).toBeEnabled();

    // Choose Slicer, once a slicer is saved.
    await openFromMenu('choose-slicer');
    await page.keyboard.press('Escape');
    await expect(chooser).toHaveCount(0);
    await expect(downloadButton).toBeFocused();
    await openFromMenu('choose-slicer');
    await chooser.getByRole('button', { name: 'Cancel' }).press('Enter');
    await expect(chooser).toHaveCount(0);
    await expect(downloadButton).toBeFocused();
    expect(await slicers.savedPreference()).toEqual({ kind: 'app', app: ORCA });
    expect(errors).toEqual([]);
});

test('@smoke focus waits on the export progress and returns to the menu button', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const slicers = await setUpChooser(page, [BAMBU, ORCA]);
    const chooser = page.getByTestId('slicer-chooser');
    const downloadButton = page.getByTestId('download-3d-model');
    const progress = page.getByRole('group', { name: 'Exporting 3MF' });
    const holdExport = () =>
        page.evaluate(() => {
            const host = window as unknown as SlicerTestWindow;
            let release!: () => void;
            const held = new Promise<void>((resolve) => (release = resolve));
            host.exportHold = { held, release };
        });
    const releaseExport = () =>
        page.evaluate(() => (window as unknown as SlicerTestWindow).exportHold!.release());
    const startFromMenu = async (item: string) => {
        await downloadButton.focus();
        await downloadButton.press('Enter');
        await page.getByTestId(item).focus();
        await page.getByTestId(item).press('Enter');
    };

    // Open starts the export as the chooser closes, which disables the download button, so
    // focus waits on the export's progress instead of the page body.
    await holdExport();
    await startFromMenu('open-3mf-in-slicer');
    await page.getByTestId('slicer-open').focus();
    await page.keyboard.press('Enter');
    await expect(chooser).toHaveCount(0);
    await expect(downloadButton).toBeDisabled();
    await expect(progress).toBeFocused();
    await releaseExport();
    await expect.poll(async () => (await slicers.state()).headers.length).toBe(1);
    await expect(downloadButton).toBeEnabled();
    await expect(downloadButton).toBeFocused();

    // Download 3MF and Download STL disable the menu item they were started from in the same
    // way. The menu stays open after a download.
    for (const [item, title] of [
        ['download-3mf', 'Exporting 3MF'],
        ['download-stl', 'Exporting STL'],
    ]) {
        await holdExport();
        await startFromMenu(item);
        await expect(page.getByRole('group', { name: title })).toBeFocused();
        await releaseExport();
        await expect(downloadButton).toBeEnabled();
        await expect(downloadButton).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.getByTestId(item)).toHaveCount(0);
        await expect(downloadButton).toBeFocused();
    }

    // Focus moved elsewhere during the export stays there.
    await holdExport();
    await startFromMenu('open-3mf-in-slicer');
    await page.getByTestId('slicer-open').focus();
    await page.keyboard.press('Enter');
    await expect(progress).toBeFocused();
    const settingsButton = page.getByRole('button', { name: 'Open settings' });
    await settingsButton.focus();
    await releaseExport();
    await expect.poll(async () => (await slicers.state()).headers.length).toBe(2);
    await expect(downloadButton).toBeEnabled();
    await expect(settingsButton).toBeFocused();
    expect(errors).toEqual([]);
});

test('@smoke the chooser drops Browse picks the native side no longer launches', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const slicers = await setUpChooser(page, [], null, false);
    const chooser = page.getByTestId('slicer-chooser');
    const options = chooser.getByTestId('slicer-option');
    const custom = (index: number) => ({
        name: `Custom Slicer ${index}`,
        path: `C:\\Slicers\\custom-${index}.exe`,
    });

    // With nothing saved, pick one more custom app than the native side keeps launchable.
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.getByTestId('settings-slicer-change').click();
    for (let index = 0; index <= MAX_PICKED_APPS; index++) {
        await slicers.set({ picked: custom(index) });
        await page.getByTestId('slicer-browse').click();
        await expect(options.last()).toHaveAttribute('value', custom(index).path);
        await expect(options.last()).toBeChecked();
    }

    // The first pick is no longer launchable, so it is no longer offered.
    expect((await slicers.state()).launchable).toHaveLength(MAX_PICKED_APPS);
    await expect(options).toHaveCount(MAX_PICKED_APPS);
    await expect(chooser.getByText(custom(0).path, { exact: true })).toHaveCount(0);
    await expect(options.first()).toHaveAttribute('value', custom(1).path);

    // The oldest pick still offered saves and opens the model.
    await chooser.getByText(custom(1).name, { exact: true }).click();
    await page.getByTestId('slicer-save').click();
    await expect(chooser).toHaveCount(0);
    expect(await slicers.savedPreference()).toEqual({ kind: 'app', app: custom(1) });
    await buildLoadedModel(page);
    await slicers.openMenu();
    await expect(page.getByTestId('open-3mf-in-slicer')).toHaveText(`Open in ${custom(1).name}`);
    await page.getByTestId('open-3mf-in-slicer').click();
    await expect.poll(async () => (await slicers.state()).headers.length).toBe(1);
    await expect(chooser).toHaveCount(0);
    expect((await slicers.state()).headers[0][SLICER_HEADER]).toBe(
        encodeURIComponent(custom(1).path)
    );
    expect(await slicers.savedPreference()).toEqual({ kind: 'app', app: custom(1) });
    expect(errors).toEqual([]);
});

test('@smoke the browser Settings dialog has no slicer setting', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Open settings' }).click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await expect(page.getByTestId('settings-slicer')).toHaveCount(0);
});

test('@smoke desktop Settings changes and forgets the saved slicer without opening a model', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const slicers = await setUpChooser(page, [BAMBU, ORCA], null, false);
    const chooser = page.getByTestId('slicer-chooser');
    const options = chooser.getByTestId('slicer-option');
    const setting = page.getByTestId('settings-slicer');
    const current = page.getByTestId('settings-slicer-current');
    const settingsButton = page.getByRole('button', { name: 'Open settings' });
    const openSettings = () => settingsButton.click();

    // Nothing is saved yet, so Open in Slicer asks every time and there is nothing to forget.
    await openSettings();
    await expect(setting).toContainText('Open in Slicer');
    await expect(current).toHaveText('Ask every time');
    await expect(page.getByTestId('settings-slicer-forget')).toHaveCount(0);

    // Change opens the chooser in place of Settings; Cancel saves nothing.
    await page.getByTestId('settings-slicer-change').click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
    await expect(chooser).toContainText('Choose the app that Open in Slicer opens models with.');
    await expect(page.getByTestId('slicer-remember')).toHaveCount(0);
    await expect(page.getByTestId('slicer-open')).toHaveCount(0);
    await expect(page.getByTestId('slicer-save')).toHaveText('Save');
    await chooser.getByRole('button', { name: 'Cancel' }).click();
    await expect(chooser).toHaveCount(0);
    expect(await slicers.savedPreference()).toBeNull();
    // The chooser has no trigger of its own, so closing it returns focus to the Settings button.
    await expect(settingsButton).toBeFocused();
    await settingsButton.press('Enter');
    await page.getByTestId('settings-slicer-change').press('Enter');
    await expect(chooser).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(chooser).toHaveCount(0);
    await expect(settingsButton).toBeFocused();
    expect(await slicers.savedPreference()).toBeNull();
    // WebKit does not focus a clicked button, so Settings can open with focus on the page body.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await settingsButton.dispatchEvent('click');
    await page.getByTestId('settings-slicer-change').dispatchEvent('click');
    await expect(chooser).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(chooser).toHaveCount(0);
    await expect(settingsButton).toBeFocused();

    // Saving a slicer only remembers it: nothing is exported or opened.
    await openSettings();
    await page.getByTestId('settings-slicer-change').click();
    await expect(page.getByTestId('slicer-option-system')).toBeChecked();
    await chooser.getByText(ORCA.name, { exact: true }).click();
    await expect(options.nth(1)).toBeChecked();
    await page.getByTestId('slicer-save').click();
    await expect(chooser).toHaveCount(0);
    await expect(settingsButton).toBeFocused();
    expect(await slicers.savedPreference()).toEqual({ kind: 'app', app: ORCA });
    await openSettings();
    await expect(current).toHaveText(ORCA.name);
    await expect(setting).toContainText(ORCA.path);

    // Changing again starts from the saved slicer and can save a browsed app.
    await page.getByTestId('settings-slicer-change').click();
    await expect(options.nth(1)).toBeChecked();
    await slicers.set({ picked: CUSTOM });
    await page.getByTestId('slicer-browse').click();
    await expect(options.nth(2)).toBeChecked();
    // Browse keeps the saved slicer launchable, as it does from the download menu.
    expect((await slicers.state()).pickRequests).toEqual([
        { title: 'Choose a slicer app', filterName: 'Applications', keep: ORCA.path },
    ]);
    await page.getByTestId('slicer-save').click();
    expect(await slicers.savedPreference()).toEqual({ kind: 'app', app: CUSTOM });

    // The system default can be saved too.
    await openSettings();
    await expect(current).toHaveText(CUSTOM.name);
    await page.getByTestId('settings-slicer-change').click();
    await chooser.getByText('System default', { exact: true }).click();
    await expect(page.getByTestId('slicer-option-system')).toBeChecked();
    await page.getByTestId('slicer-save').click();
    expect(await slicers.savedPreference()).toEqual({ kind: 'system' });
    await openSettings();
    await expect(current).toHaveText('System default');

    // Forget clears the saved choice and keeps Settings open.
    await page.getByTestId('settings-slicer-forget').click();
    await expect(current).toHaveText('Ask every time');
    await expect(page.getByTestId('settings-slicer-forget')).toHaveCount(0);
    await expect(page.getByTestId('settings-slicer-change')).toBeFocused();
    expect(await slicers.savedPreference()).toBeNull();

    // With a model built, Save still only remembers the slicer. The final call count shows that
    // nothing was exported or opened here.
    await page.getByRole('button', { name: 'Close settings' }).click();
    await buildLoadedModel(page);
    await openSettings();
    await page.getByTestId('settings-slicer-change').click();
    await chooser.getByText(BAMBU.name, { exact: true }).click();
    await page.getByTestId('slicer-save').click();
    await expect(chooser).toHaveCount(0);
    expect(await slicers.savedPreference()).toEqual({ kind: 'app', app: BAMBU });
    expect((await slicers.state()).headers).toHaveLength(0);

    // A slicer saved in Settings is the one the download menu then opens without asking.
    await slicers.openMenu();
    await expect(page.getByTestId('open-3mf-in-slicer')).toHaveText('Open in Bambu Studio');
    await page.getByTestId('open-3mf-in-slicer').click();
    await expect.poll(async () => (await slicers.state()).headers.length).toBe(1);
    await expect(chooser).toHaveCount(0);
    expect((await slicers.state()).headers[0][SLICER_HEADER]).toBe(encodeURIComponent(BAMBU.path));

    // Forgetting it in Settings makes the download menu ask again.
    await expect(page.getByTestId('download-3d-model')).toBeEnabled();
    await openSettings();
    await expect(current).toHaveText(BAMBU.name);
    await page.getByTestId('settings-slicer-forget').click();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await slicers.openMenu();
    await expect(page.getByTestId('open-3mf-in-slicer')).toHaveText('Open in Slicer');
    await expect(page.getByTestId('choose-slicer')).toHaveCount(0);
    await page.getByTestId('open-3mf-in-slicer').click();
    await expect(chooser).toContainText('Choose the app that opens the 3MF.');
    await expect(page.getByTestId('slicer-open')).toBeVisible();
    await chooser.getByRole('button', { name: 'Cancel' }).click();
    await expect(chooser).toHaveCount(0);
    expect(await slicers.savedPreference()).toBeNull();

    const calls = await fakeDesktopCalls(page);
    expect(calls.filter((call) => call === 'open_model_in_slicer')).toHaveLength(1);
    expect(errors).toEqual([]);
});
