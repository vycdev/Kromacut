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
    };
    __KROMACUT_E2E: { buildHistory: unknown[] };
};

const SLICER_FAILED = 'Could not open the 3MF in your slicer. Use Download 3MF to save it instead.';
const NONE_FOUND =
    'No supported slicers were found in their usual install locations. Use Browse to choose one.';
const SLICER_HEADER = 'X-Kromacut-Slicer-App';
const BAMBU = { name: 'Bambu Studio', path: 'C:\\Program Files\\Bambu Studio\\bambu-studio.exe' };
const ORCA = { name: 'Orca Slicer', path: 'C:\\Program Files\\OrcaSlicer\\orca-slicer.exe' };
const CUSTOM = { name: 'CrealityPrint', path: 'C:\\Users\\José\\Slicers\\CrealityPrint.exe' };

async function buildModel(page: Page, savedSlicer: unknown = null) {
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

async function setUpChooser(page: Page, installed: SlicerApp[], savedSlicer: unknown = null) {
    await fakeDesktopBeforeLoad(
        page,
        (desktop, apps) => {
            const host = window as unknown as SlicerTestWindow;
            host.slicerTest = {
                outcome: 'success',
                bytes: [],
                headers: [],
                installed: apps,
                picked: 'cancel',
                pickRequests: [],
            };
            desktop.handle('open_model_in_slicer', (model: Uint8Array, _command, options) => {
                host.slicerTest.bytes.push(Array.from(model.slice(0, 4)));
                host.slicerTest.headers.push((options.headers ?? {}) as Record<string, string>);
                return '/cache/slicer-handoff/model.3mf';
            });
            desktop.handle('list_slicer_apps', () => host.slicerTest.installed);
            desktop.handle('find_slicer_app', ({ path }: { path: string }) => {
                const { installed, picked } = host.slicerTest;
                const known = typeof picked === 'object' ? [...installed, picked] : installed;
                return known.find((app) => app.path === path) ?? null;
            });
            desktop.handle('pick_slicer_app', (request: PickRequest) => {
                host.slicerTest.pickRequests.push(request);
                const picked = host.slicerTest.picked;
                if (picked === 'invalid') throw new Error('Not a launchable app');
                return picked === 'cancel' ? null : picked;
            });
        },
        installed
    );
    await buildModel(page, savedSlicer);
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
