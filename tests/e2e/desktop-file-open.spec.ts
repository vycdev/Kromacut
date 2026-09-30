import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { DesktopOpenedFile } from '../../src/lib/desktopFileInbox';

const legacyContent = readFileSync('tests/assets/filament-profiles/2_Colors.kapp', 'utf8');
const legacy = JSON.parse(legacyContent);
const legacyFile: DesktopOpenedFile = {
    name: 'My spools 日本語.kapp',
    kind: 'profile',
    content: '\uFEFF' + legacyContent,
    error: null,
};
const currentFile: DesktopOpenedFile = {
    name: 'New spools.kfil',
    kind: 'profile',
    error: null,
    content: JSON.stringify({
        id: 'new-profile',
        name: 'New spools',
        version: 3,
        filaments: [{ id: 'pink', color: '#ff80c0', td: 0.5 }],
        createdAt: 1,
        updatedAt: 1,
    }),
};
const paletteFile = (id: string): DesktopOpenedFile => ({
    name: `${id}.kpal`,
    kind: 'palette',
    error: null,
    content: JSON.stringify({
        id,
        name: id,
        version: 1,
        colors: [['Second palette', 'Cannot save'].includes(id) ? '#00ff00' : '#ff0000', '#0000ff'],
        colorNames: ['Red', 'Blue'],
        disabledColors: [1],
        createdAt: 1,
        updatedAt: 1,
    }),
});

type MockDesktop = Window & {
    fileOpenTest: {
        pending: DesktopOpenedFile[];
        signal: () => void;
        calls: string[];
        failWrites?: boolean;
        releaseRead?: () => void;
        holdNextWrite?: boolean;
        releaseWrite?: () => void;
    };
};

async function mockDesktop(page: Page, initial: DesktopOpenedFile[], entryPath = '/app') {
    await page.addInitScript((files) => {
        localStorage.clear();
        const callbacks = new Map<number, (value: unknown) => void>();
        let nextId = 0;
        const desktop = window as unknown as MockDesktop & {
            isTauri: boolean;
            __TAURI_INTERNALS__: unknown;
        };
        desktop.isTauri = true;
        desktop.fileOpenTest = { pending: files, signal: () => {}, calls: [] };
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (
                desktop.fileOpenTest.failWrites &&
                ['kromacut.autopaint.profiles', 'kromacut.palettes'].includes(key)
            )
                throw new DOMException('Test storage full', 'QuotaExceededError');
            setItem.call(this, key, value);
        };
        desktop.__TAURI_INTERNALS__ = {
            transformCallback(callback: (value: unknown) => void) {
                const id = ++nextId;
                callbacks.set(id, callback);
                return id;
            },
            async invoke(
                command: string,
                args: { event?: string; handler?: number; data?: Uint8Array } = {}
            ) {
                desktop.fileOpenTest.calls.push(command);
                if (command === 'plugin:event|listen') {
                    if (args.event === 'kromacut-opened-files') {
                        desktop.fileOpenTest.signal = () =>
                            callbacks.get(args.handler!)?.({
                                event: args.event,
                                id: args.handler,
                                payload: null,
                            });
                    }
                    return args.handler;
                }
                if (command === 'take_opened_file')
                    return desktop.fileOpenTest.pending.shift() ?? null;
                if (command === 'get_app_version') return '4.1.0';
                if (command === 'check_for_updates') return null;
                if (command === 'plugin:dialog|save') return 'C:\\mock\\proof.3mf';
                if (command === 'plugin:fs|open') return 91;
                if (command === 'plugin:fs|write') {
                    const state = desktop.fileOpenTest;
                    if (state.holdNextWrite) {
                        state.holdNextWrite = false;
                        await new Promise<void>((resolve) => {
                            state.releaseWrite = () => {
                                delete state.releaseWrite;
                                resolve();
                            };
                        });
                    }
                    return args.data!.byteLength;
                }
                if (command === 'plugin:resources|close') return;
                if (command === 'plugin:dialog|message') return 'Ok';
                throw new Error(`Unexpected desktop command: ${command}`);
            },
        };
    }, initial);
    await page.goto(entryPath);
}

async function openFiles(page: Page, files: DesktopOpenedFile[]) {
    await page.evaluate((items) => {
        const state = (window as unknown as MockDesktop).fileOpenTest;
        state.pending.push(...items);
        state.signal();
    }, files);
}

const profiles = (page: Page) =>
    page.evaluate(() => JSON.parse(localStorage.getItem('kromacut.autopaint.profiles') ?? '[]'));

const savedPalettes = (page: Page) =>
    page.evaluate(() => JSON.parse(localStorage.getItem('kromacut.palettes') ?? '[]'));

const workingFilaments = (page: Page) =>
    page.evaluate(() => JSON.parse(localStorage.getItem('kromacut.autopaint.v1')!).filaments);

// Wait for the mocked native queue to deliver the first request to React.
async function expectPendingFiles(page: Page, count: number) {
    await expect
        .poll(() =>
            page.evaluate(() => (window as unknown as MockDesktop).fileOpenTest.pending.length)
        )
        .toBe(count);
    await page.evaluate(
        () =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            })
    );
}

for (const kind of ['profile', 'palette'] as const) {
    test(`@smoke a pending manual ${kind} import preserves a desktop import completed during its read`, async ({
        page,
    }) => {
        const initial = kind === 'profile' ? currentFile : paletteFile('Original palette');
        const incoming: DesktopOpenedFile =
            kind === 'profile'
                ? {
                      ...currentFile,
                      content: JSON.stringify({
                          ...JSON.parse(currentFile.content!),
                          id: 'incoming-profile',
                          name: 'Incoming spools',
                          filaments: [{ id: 'white', color: '#ffffff', td: 0.8 }],
                      }),
                  }
                : paletteFile('Second palette');
        const manual = {
            name: `Pending manual.${kind === 'profile' ? 'kfil' : 'kpal'}`,
            content: JSON.stringify({
                id: 'manual-import',
                name: 'Manual import',
                version: kind === 'profile' ? 3 : 2,
                createdAt: 1,
                updatedAt: 1,
                ...(kind === 'profile'
                    ? { filaments: [{ id: 'cyan', color: '#00ffff', td: 0.4 }] }
                    : { colors: ['#ffffff', '#000000'] }),
            }),
        };
        const savedItems = () => (kind === 'profile' ? profiles(page) : savedPalettes(page));
        await mockDesktop(page, [initial]);
        await expect.poll(async () => (await savedItems()).length).toBe(1);

        // Retain the real reader/callback, but release it only after the desktop import commits.
        await page.evaluate((fileName) => {
            const state = (window as unknown as MockDesktop).fileOpenTest;
            const readAsText = FileReader.prototype.readAsText;
            FileReader.prototype.readAsText = function (file, encoding) {
                if ((file as File).name !== fileName) {
                    readAsText.call(this, file, encoding);
                    return;
                }
                FileReader.prototype.readAsText = readAsText;
                state.releaseRead = () => {
                    delete state.releaseRead;
                    readAsText.call(this, file, encoding);
                };
            };
        }, manual.name);
        const input = page.getByTestId(
            kind === 'profile' ? 'autopaint-profile-import-input' : 'palette-import-input'
        );
        await input.setInputFiles({
            name: manual.name,
            mimeType: 'application/json',
            buffer: Buffer.from(manual.content),
        });
        await expect
            .poll(() =>
                page.evaluate(() =>
                    Boolean((window as unknown as MockDesktop).fileOpenTest.releaseRead)
                )
            )
            .toBe(true);

        await openFiles(page, [incoming]);
        await expect.poll(async () => (await savedItems()).length).toBe(2);
        const beforeReadFinished = await savedItems();
        await page.evaluate(() => (window as unknown as MockDesktop).fileOpenTest.releaseRead!());
        await expect.poll(async () => (await savedItems()).length).toBe(3);
        const after = await savedItems();
        expect(after.slice(0, 2)).toEqual(beforeReadFinished);
        expect(after[2].id).toBe('manual-import');
        if (kind === 'profile') {
            await expect
                .poll(() =>
                    page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId'))
                )
                .toBe('manual-import');
            expect((await workingFilaments(page))[0].color).toBe('#00ffff');
        } else {
            await expect(page.locator('#palette-select')).toContainText('Manual import');
        }
    });
}

for (const source of ['desktop', 'manual'] as const) {
    test(`@smoke ${source} profile batches select the final saved version after duplicate resolution`, async ({
        page,
    }) => {
        await mockDesktop(page, [currentFile]);
        await expect.poll(async () => (await profiles(page)).length).toBe(1);
        const original = (await profiles(page))[0];
        const updated = {
            ...original,
            name: 'Updated spools',
            filaments: [{ id: 'white', color: '#ffffff', td: 0.8 }],
        };
        const batch = {
            ...currentFile,
            content: JSON.stringify([
                { ...original, id: 'duplicate-alias', name: 'Same original spools' },
                updated,
            ]),
        };
        if (source === 'desktop') {
            await openFiles(page, [batch]);
        } else {
            await page.getByTestId('autopaint-profile-import-input').setInputFiles({
                name: batch.name,
                mimeType: 'application/json',
                buffer: Buffer.from(batch.content),
            });
        }
        await expect.poll(async () => (await profiles(page))[0].name).toBe(updated.name);
        await expect.poll(() => workingFilaments(page)).toEqual(updated.filaments);
        await expect(page.getByText('Unsaved changes', { exact: true })).not.toBeVisible();
        expect((await profiles(page)).length).toBe(1);
        expect(
            await page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId'))
        ).toBe(original.id);
    });
}

for (const ownerChange of ['unchanged', 'renamed', 'replaced', 'deleted'] as const) {
    test(`@smoke a late proof save preserves desktop imports when its original owner is ${ownerChange}`, async ({
        page,
    }) => {
        const firstFile = {
            ...legacyFile,
            content: readFileSync('tests/assets/filament-profiles/4_Colors.kapp', 'utf8'),
        };
        await mockDesktop(page, [firstFile]);
        await expect.poll(async () => (await profiles(page)).length).toBe(1);
        const owner = (await profiles(page))[0];
        await page.getByRole('button', { name: '2D', exact: true }).click();
        await page.getByTestId('image-file-input').setInputFiles('tests/assets/1024x1024p.png');
        await expect(page.locator('body')).toContainText('Image: 1024', { timeout: 60_000 });
        await page.getByRole('button', { name: '3D', exact: true }).click();
        await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
        await expect(page.getByTestId('build-3d-model')).toBeEnabled({ timeout: 90_000 });
        await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
        const dialog = page.getByRole('alertdialog');
        await dialog.getByRole('tab', { name: 'Palette Proof', exact: true }).click();
        await expect(page.getByTestId('download-palette-proof')).toBeEnabled();
        await page.evaluate(() => {
            (window as unknown as MockDesktop).fileOpenTest.holdNextWrite = true;
        });
        await page.getByTestId('download-palette-proof').click();
        await expect
            .poll(() =>
                page.evaluate(() =>
                    Boolean((window as unknown as MockDesktop).fileOpenTest.releaseWrite)
                )
            )
            .toBe(true);

        const incoming = {
            ...currentFile,
            content: JSON.stringify({
                ...JSON.parse(currentFile.content!),
                id: ownerChange === 'replaced' ? owner.id : 'incoming-profile',
                name: 'Incoming spools',
                filaments: [{ id: 'white', color: '#ffffff', td: 0.8 }],
            }),
        };
        // Cover an already queued open, plus edits/deletion after the exporting dialog closes.
        if (ownerChange === 'unchanged' || ownerChange === 'replaced') {
            await openFiles(page, [incoming]);
            await expectPendingFiles(page, 0);
            expect(await profiles(page)).toEqual([owner]);
        }
        await dialog.getByRole('button', { name: 'Close calibration dialog', exact: true }).click();
        if (ownerChange === 'renamed') {
            await page
                .getByRole('button', { name: 'Rename selected profile', exact: true })
                .click();
            const name = page.getByPlaceholder('Profile name...', { exact: true });
            await name.fill('Renamed proof owner');
            await name.press('Enter');
            await expect(name).not.toBeVisible();
            await openFiles(page, [incoming]);
        } else if (ownerChange === 'deleted') {
            await page
                .getByRole('button', { name: 'Delete selected profile', exact: true })
                .click();
            await expect.poll(() => profiles(page)).toEqual([]);
            await openFiles(page, [incoming]);
            await page
                .getByRole('alertdialog')
                .getByRole('button', { name: 'Open profile', exact: true })
                .click();
        }
        const incomingId = ownerChange === 'replaced' ? owner.id : 'incoming-profile';
        await expect
            .poll(() =>
                page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId'))
            )
            .toBe(incomingId);
        const beforeSaveFinished = await profiles(page);
        const incomingProfile = beforeSaveFinished.find(
            (profile: { id: string }) => profile.id === incomingId
        );
        await page.evaluate(() => (window as unknown as MockDesktop).fileOpenTest.releaseWrite!());
        await expect
            .poll(() =>
                page.evaluate(() =>
                    (window as unknown as MockDesktop).fileOpenTest.calls.includes(
                        'plugin:dialog|message'
                    )
                )
            )
            .toBe(true);
        await expectPendingFiles(page, 0);
        const after = await profiles(page);
        expect(after.find((profile: { id: string }) => profile.id === incomingId)).toEqual(
            incomingProfile
        );
        expect(after.length).toBe(beforeSaveFinished.length);
        if (ownerChange === 'unchanged' || ownerChange === 'renamed') {
            const finalOwner = after.find((profile: { id: string }) => profile.id === owner.id);
            expect(finalOwner.filaments).toEqual(owner.filaments);
            expect(finalOwner.name).toBe(
                ownerChange === 'renamed' ? 'Renamed proof owner' : owner.name
            );
            expect(finalOwner.appearance.proofs).toHaveLength(1);
        } else {
            expect(after).toEqual(beforeSaveFinished);
        }
        expect(
            await page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId'))
        ).toBe(incomingId);
        expect((await workingFilaments(page))[0].color).toBe('#ffffff');
    });
}

for (const field of ['name', 'hiding distance'] as const) {
    test(`@smoke desktop imports wait for a focused filament ${field} draft before protecting its edits`, async ({
        page,
    }) => {
        await mockDesktop(page, [currentFile]);
        await expect.poll(async () => (await profiles(page)).length).toBe(1);
        const originalProfiles = await profiles(page);
        const originalFilaments = await workingFilaments(page);
        const replacement = {
            ...currentFile,
            content: JSON.stringify({
                ...originalProfiles[0],
                id: 'incoming-profile',
                name: 'Incoming spools',
                filaments: [{ id: 'white', color: '#ffffff', td: 0.8 }],
            }),
        };
        const row = page.getByPlaceholder('Name', { exact: true }).first().locator('..');
        const draft =
            field === 'name'
                ? row.getByPlaceholder('Name', { exact: true })
                : row.getByRole('spinbutton');
        const draftValue = field === 'name' ? 'My pink spool' : '0.73';
        await draft.fill(draftValue);

        const queuedPalette = paletteFile('After filament draft');
        // A palette arriving first must not hide an uncommitted row draft either.
        await openFiles(
            page,
            field === 'name' ? [queuedPalette, replacement] : [replacement, queuedPalette]
        );
        await expectPendingFiles(page, 1);
        await expect(draft).toBeFocused();
        await expect(draft).toHaveValue(draftValue);
        await expect(page.getByRole('alertdialog')).not.toBeVisible();
        expect(await profiles(page)).toEqual(originalProfiles);
        expect(await savedPalettes(page)).toEqual([]);
        expect(await workingFilaments(page)).toEqual(originalFilaments);

        // Commit by keyboard or by switching paint tabs; both must precede the dirty-state check.
        if (field === 'name') await draft.press('Enter');
        else await page.getByRole('tab', { name: 'Manual', exact: true }).click();
        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toContainText('Unsaved filament edits');
        const committedFilaments = await workingFilaments(page);
        expect(committedFilaments[0][field === 'name' ? 'name' : 'td']).toBe(
            field === 'name' ? draftValue : 0.73
        );
        expect(await profiles(page)).toEqual(originalProfiles);
        await dialog.getByRole('button', { name: 'Keep edits', exact: true }).click();
        await expect
            .poll(async () =>
                (await savedPalettes(page)).map((palette: { name: string }) => palette.name)
            )
            .toEqual(['After filament draft']);
        expect(await workingFilaments(page)).toEqual(committedFilaments);
        expect(await profiles(page)).toEqual(originalProfiles);

        await openFiles(page, [replacement]);
        await expect(dialog).toContainText('Unsaved filament edits');
        await dialog.getByRole('button', { name: 'Open profile', exact: true }).click();
        await expect
            .poll(() =>
                page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId'))
            )
            .toBe('incoming-profile');
        expect((await workingFilaments(page))[0]).toEqual({
            id: 'white',
            color: '#ffffff',
            td: 0.8,
        });
    });
}

for (const outcome of ['unchanged focus', 'row removal'] as const) {
    test(`@smoke desktop imports resume when filament editing ends by ${outcome}`, async ({
        page,
    }) => {
        await mockDesktop(page, [currentFile]);
        await expect.poll(async () => (await profiles(page)).length).toBe(1);
        const original = (await profiles(page))[0];
        const replacement = {
            ...currentFile,
            content: JSON.stringify({
                ...original,
                id: 'incoming-profile',
                name: 'Incoming spools',
                filaments: [{ id: 'white', color: '#ffffff', td: 0.8 }],
            }),
        };
        const name = page.getByPlaceholder('Name', { exact: true }).first();
        const row = name.locator('..');
        if (outcome === 'row removal') await name.fill('Draft spool');
        else await name.click();
        await openFiles(page, [replacement]);
        await expectPendingFiles(page, 0);
        await expect(name).toBeFocused();
        await expect(page.getByRole('alertdialog')).not.toBeVisible();
        expect(await profiles(page)).toEqual([original]);

        if (outcome === 'row removal') {
            // Invoke the handler without an earlier pointer-down blur, isolating row cleanup.
            await row
                .getByTitle('Remove filament', { exact: true })
                .evaluate((button: HTMLButtonElement) => button.click());
            const dialog = page.getByRole('alertdialog');
            await expect(dialog).toContainText('Unsaved filament edits');
            expect(await workingFilaments(page)).toEqual([]);
            await dialog.getByRole('button', { name: 'Keep edits', exact: true }).click();
            await expect(dialog).not.toBeVisible();
            expect(await profiles(page)).toEqual([original]);
            expect(await workingFilaments(page)).toEqual([]);
        } else {
            await name.press('Enter');
            await expect
                .poll(() =>
                    page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId'))
                )
                .toBe('incoming-profile');
            await expect(page.getByRole('alertdialog')).not.toBeVisible();
            expect((await workingFilaments(page))[0].color).toBe('#ffffff');
        }
    });
}

for (const outcome of ['convert', 'dismiss'] as const) {
    test(`@smoke desktop imports wait for a filament TD conversion draft to ${outcome}`, async ({
        page,
    }) => {
        await mockDesktop(page, [currentFile]);
        await expect.poll(async () => (await profiles(page)).length).toBe(1);
        const original = (await profiles(page))[0];
        const replacement = {
            ...currentFile,
            content: JSON.stringify({
                ...original,
                id: 'incoming-profile',
                name: 'Incoming spools',
                filaments: [{ id: 'white', color: '#ffffff', td: 0.8 }],
            }),
        };
        await page
            .getByTitle('Convert from TD (lithophane/backlit value)', { exact: true })
            .first()
            .click();
        const draft = page.getByPlaceholder('e.g. 4.0', { exact: true });
        await draft.fill('7.3');
        await openFiles(page, [replacement]);
        await expectPendingFiles(page, 0);
        await expect(draft).toHaveValue('7.3');
        await expect(page.getByRole('alertdialog')).not.toBeVisible();
        expect(await profiles(page)).toEqual([original]);
        expect((await workingFilaments(page))[0].td).toBe(0.5);

        if (outcome === 'convert') {
            await draft.press('Enter');
            const dialog = page.getByRole('alertdialog');
            await expect(dialog).toContainText('Unsaved filament edits');
            expect((await workingFilaments(page))[0].td).toBe(0.73);
            await dialog.getByRole('button', { name: 'Keep edits', exact: true }).click();
            await expect(dialog).not.toBeVisible();
            expect(await profiles(page)).toEqual([original]);
            expect((await workingFilaments(page))[0].td).toBe(0.73);
        } else {
            // A discarded local conversion has no committed edit to protect and must not block.
            await draft.press('Escape');
            await expect
                .poll(() =>
                    page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId'))
                )
                .toBe('incoming-profile');
            await expect(page.getByRole('alertdialog')).not.toBeVisible();
            expect((await profiles(page)).length).toBe(2);
            expect((await workingFilaments(page))[0].color).toBe('#ffffff');
        }
    });
}

test('@smoke desktop imports wait for an open filament color picker before protecting its edits', async ({
    page,
}) => {
    await mockDesktop(page, [currentFile]);
    await expect.poll(async () => (await profiles(page)).length).toBe(1);
    const original = (await profiles(page))[0];
    const replacement = {
        ...currentFile,
        content: JSON.stringify({
            ...original,
            id: 'incoming-profile',
            name: 'Incoming spools',
            filaments: [{ id: 'white', color: '#ffffff', td: 0.8 }],
        }),
    };
    await page.getByTitle('Change filament color', { exact: true }).first().click();
    const picker = page.getByRole('dialog');
    const hex = picker.getByRole('textbox');
    await hex.fill('#123456');
    await expect.poll(async () => (await workingFilaments(page))[0].color).toBe('#123456');
    await openFiles(page, [replacement]);
    await expectPendingFiles(page, 0);
    await expect(picker).toContainText('Pick Color');
    await expect(hex).toHaveValue('#123456');
    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    expect(await profiles(page)).toEqual([original]);

    await hex.press('Escape');
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Unsaved filament edits');
    await dialog.getByRole('button', { name: 'Keep edits', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(await profiles(page)).toEqual([original]);
    expect((await workingFilaments(page))[0].color).toBe('#123456');
});

test('@smoke desktop imports wait for a closed filament color picker debounce to commit', async ({
    page,
}) => {
    await page.clock.install({ time: new Date('2026-09-30T12:00:00Z') });
    await mockDesktop(page, [currentFile]);
    await expect.poll(async () => (await profiles(page)).length).toBe(1);
    const original = (await profiles(page))[0];
    const replacement = {
        ...currentFile,
        content: JSON.stringify({
            ...original,
            id: 'incoming-profile',
            name: 'Incoming spools',
            filaments: [{ id: 'white', color: '#ffffff', td: 0.8 }],
        }),
    };
    await page.clock.pauseAt(new Date('2026-09-30T13:00:00Z'));
    await page.getByTitle('Change filament color', { exact: true }).first().click();
    const hex = page.getByRole('dialog').getByRole('textbox');
    await hex.fill('#123456');
    await hex.press('Escape');
    await openFiles(page, [replacement]);
    await page.clock.runFor(199);
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    expect(await profiles(page)).toEqual([original]);
    expect((await workingFilaments(page))[0].color).toBe(original.filaments[0].color);
    expect(
        await page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId'))
    ).toBe(original.id);

    await page.clock.runFor(1);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Unsaved filament edits');
    expect((await workingFilaments(page))[0].color).toBe('#123456');
    await page.clock.resume();
    await dialog.getByRole('button', { name: 'Open profile', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId')))
        .toBe('incoming-profile');
    expect((await workingFilaments(page))[0].color).toBe('#ffffff');
});

test('@smoke desktop imports wait for calibration and protect the resulting unsaved measurements', async ({
    page,
}) => {
    const original = {
        id: 'calibration-owner',
        name: 'Calibration owner',
        version: 3,
        createdAt: 1,
        updatedAt: 1,
        filaments: [
            { id: 'white', name: 'White spool', color: '#ffffff', td: 0.6 },
            { id: 'black', name: 'Black spool', color: '#000000', td: 0.02 },
        ],
    };
    const firstFile = { ...currentFile, content: JSON.stringify(original) };
    const replacement = {
        ...currentFile,
        content: JSON.stringify({
            ...original,
            id: 'calibration-replacement',
            name: 'Different spools',
            filaments: [
                { id: 'white', name: 'Magenta spool', color: '#ff00ff', td: 0.8 },
                original.filaments[1],
            ],
        }),
    };
    await mockDesktop(page, [firstFile]);
    await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: /White spool/ }).click();
    await dialog.getByRole('button', { name: 'Next: Base' }).click();
    await dialog.getByRole('button', { name: 'Next: Print' }).click();
    await dialog.getByRole('button', { name: 'Next: Enter Results' }).click();
    await dialog.getByPlaceholder('match', { exact: true }).fill('5');
    await expect(
        dialog.getByRole('button', { name: 'Save Calibration', exact: true })
    ).toBeEnabled();

    await openFiles(page, [replacement, paletteFile('After calibration')]);
    await expectPendingFiles(page, 1);
    expect((await profiles(page)).map((profile: { id: string }) => profile.id)).toEqual([
        original.id,
    ]);
    expect(await savedPalettes(page)).toEqual([]);
    await expect(dialog.getByPlaceholder('match', { exact: true })).toHaveValue('5');
    expect((await workingFilaments(page))[0].td).toBe(0.6);

    await dialog.getByRole('button', { name: 'Save Calibration', exact: true }).click();
    await expect(dialog).toContainText('Unsaved filament edits');
    expect(
        await page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId'))
    ).toBe(original.id);
    const calibratedWhite = (await workingFilaments(page))[0];
    expect(calibratedWhite.color).toBe('#ffffff');
    expect(calibratedWhite.calibration).toBeDefined();
    expect(calibratedWhite.td).not.toBe(0.6);

    await dialog.getByRole('button', { name: 'Keep edits', exact: true }).click();
    await expect(page.locator('#palette-select')).toContainText('After calibration');
    expect((await profiles(page)).length).toBe(1);
    expect((await workingFilaments(page))[0]).toEqual(calibratedWhite);

    await openFiles(page, [replacement]);
    await expect(dialog).toContainText('Unsaved filament edits');
    await dialog.getByRole('button', { name: 'Open profile', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId')))
        .toBe('calibration-replacement');
    const magenta = (await workingFilaments(page))[0];
    expect(magenta.color).toBe('#ff00ff');
    expect(magenta.td).toBe(0.8);
    expect(magenta.calibration).toBeUndefined();
});

test('@smoke a queued same-ID palette import runs after the editor saves its draft', async ({
    page,
}) => {
    const original = {
        id: 'edited-palette',
        name: 'Original palette',
        version: 2,
        colors: ['#ff0000', '#000000'],
        createdAt: 1,
        updatedAt: 1,
    };
    await mockDesktop(page, [{ ...paletteFile(original.id), content: JSON.stringify(original) }]);
    await page.getByRole('button', { name: 'Edit selected palette' }).click();
    await page.getByLabel('Palette Name', { exact: true }).fill('Saved draft');
    const before = await savedPalettes(page);
    const incoming = { ...original, name: 'Imported palette', colors: ['#00ff00', '#0000ff'] };
    await openFiles(page, [{ ...paletteFile(original.id), content: JSON.stringify(incoming) }]);
    await expectPendingFiles(page, 0);
    expect(await savedPalettes(page)).toEqual(before);
    await expect(page.getByLabel('Palette Name', { exact: true })).toHaveValue('Saved draft');

    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    await expect(page.locator('#palette-select')).toContainText('Imported palette');
    const after = await savedPalettes(page);
    expect(after.length).toBe(1);
    expect(after[0].colors).toEqual(incoming.colors.map((color) => color.toUpperCase()));
});

test('@smoke cancelling a palette editor resumes a mixed profile/palette queue without losing either file', async ({
    page,
}) => {
    await mockDesktop(page, [paletteFile('Original palette')]);
    await page.getByRole('button', { name: 'Edit selected palette' }).click();
    await page.getByLabel('Palette Name', { exact: true }).fill('Discarded draft');
    const before = await savedPalettes(page);
    await openFiles(page, [currentFile, paletteFile('Second palette')]);
    await expectPendingFiles(page, 1);
    expect(await profiles(page)).toEqual([]);
    expect(await savedPalettes(page)).toEqual(before);
    await expect(page.getByLabel('Palette Name', { exact: true })).toHaveValue('Discarded draft');

    await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
    await expect(page.locator('#palette-select')).toContainText('Second palette');
    expect((await profiles(page)).map((profile: { id: string }) => profile.id)).toEqual([
        'new-profile',
    ]);
    const after = await savedPalettes(page);
    expect(after.length).toBe(2);
    expect(after[0]).toEqual(before[0]);
});

for (const editor of ['Rename', 'Save New'] as const) {
    for (const outcome of ['save', 'cancel'] as const) {
        test(`@smoke desktop imports wait for profile ${editor} to ${outcome} its draft`, async ({
            page,
        }) => {
            await mockDesktop(page, [currentFile]);
            await expect
                .poll(() =>
                    page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId'))
                )
                .toBe('new-profile');
            await page
                .getByRole('button', {
                    name: editor === 'Rename' ? 'Rename selected profile' : 'Save as new profile',
                    exact: true,
                })
                .click();
            const draft = page.getByPlaceholder('Profile name...', { exact: true });
            const draftName = `${editor} original spools`;
            await draft.fill(draftName);
            const originalProfiles = await profiles(page);
            const originalFilaments = await workingFilaments(page);
            const replacement = {
                ...currentFile,
                content: JSON.stringify({
                    ...originalProfiles[0],
                    id: 'incoming-profile',
                    name: 'Incoming spools',
                    filaments: [{ id: 'white', color: '#ffffff', td: 0.8 }],
                }),
            };
            // Cover a profile replacement and a palette workspace switch arriving first.
            const queuedPalette = paletteFile('After profile editor');
            await openFiles(
                page,
                editor === 'Rename' ? [replacement, queuedPalette] : [queuedPalette, replacement]
            );
            await expectPendingFiles(page, 1);
            await expect(draft).toHaveValue(draftName);
            expect(await profiles(page)).toEqual(originalProfiles);
            expect(await savedPalettes(page)).toEqual([]);
            expect(await workingFilaments(page)).toEqual(originalFilaments);
            expect(
                await page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId'))
            ).toBe('new-profile');

            if (editor === 'Save New' && outcome === 'save') {
                await page.evaluate(() => {
                    (window as unknown as MockDesktop).fileOpenTest.failWrites = true;
                });
                await draft.press('Enter');
                await expect(page.getByText(/Profile changes could not be saved/)).toBeVisible();
                await expect(draft).toHaveValue(draftName);
                expect(await profiles(page)).toEqual(originalProfiles);
                expect(await savedPalettes(page)).toEqual([]);
                await page.evaluate(() => {
                    (window as unknown as MockDesktop).fileOpenTest.failWrites = false;
                });
            }

            await draft.press(outcome === 'save' ? 'Enter' : 'Escape');
            await expect(draft).not.toBeVisible();
            await expect
                .poll(() =>
                    page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId'))
                )
                .toBe('incoming-profile');
            const after = await profiles(page);
            const original = after.find((profile: { id: string }) => profile.id === 'new-profile');
            expect(original.filaments).toEqual(originalProfiles[0].filaments);
            expect(original.name).toBe(
                editor === 'Rename' && outcome === 'save' ? draftName : 'New spools'
            );
            if (editor === 'Save New' && outcome === 'save') {
                const copy = after.find((profile: { name: string }) => profile.name === draftName);
                expect(copy.filaments).toEqual(originalProfiles[0].filaments);
                expect(copy.id).not.toBe('new-profile');
                expect(after).toHaveLength(3);
            } else {
                expect(after).toHaveLength(2);
            }
            expect(
                (await savedPalettes(page)).map((palette: { name: string }) => palette.name)
            ).toEqual(['After profile editor']);
            expect((await workingFilaments(page))[0].id).toBe('white');
            await expectPendingFiles(page, 0);
        });
    }
}

test('@smoke desktop startup imports legacy profiles; warm batches import/select profiles and palettes', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await mockDesktop(page, [legacyFile], '/docs/overview');
    await expect(page).toHaveURL(/:\d+\/$/);
    await expect(page.getByRole('tab', { name: 'Auto-paint', exact: true })).toHaveAttribute(
        'data-state',
        'active'
    );
    await expect.poll(async () => (await profiles(page)).length).toBe(1);
    const saved = (await profiles(page))[0];
    expect(saved.id).toBe(legacy.id);
    expect(saved.version).toBe(3);
    expect(saved.filaments.map((item: { td: number }) => item.td)).toEqual([0.6, 0.016]);
    const calls = await page.evaluate(() => (window as unknown as MockDesktop).fileOpenTest.calls);
    expect(calls.indexOf('plugin:event|listen')).toBeLessThan(calls.indexOf('take_opened_file'));

    await openFiles(page, [
        currentFile,
        paletteFile('First palette'),
        paletteFile('Second palette'),
    ]);
    await expect(page.locator('#palette-select')).toContainText('Second palette');
    await expect(page.locator('#final-colors')).toHaveValue('1');
    expect((await profiles(page)).length).toBe(2);
    const savedPalettes = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('kromacut.palettes') ?? '[]')
    );
    expect(savedPalettes.length).toBe(2);
    expect(savedPalettes[1].disabledColors).toEqual([1]);
    expect(savedPalettes[1].colorNames).toEqual(['Red', 'Blue']);
    const duplicatePalette = {
        ...paletteFile('Second palette'),
        content: JSON.stringify({
            ...savedPalettes[1],
            id: 'duplicate-palette',
            name: 'Duplicate palette',
        }),
    };
    await openFiles(page, [duplicatePalette]);
    await expect
        .poll(() =>
            page.evaluate(() => (window as unknown as MockDesktop).fileOpenTest.pending.length)
        )
        .toBe(0);
    await expect(page.locator('#palette-select')).toContainText('Second palette');
    expect(
        await page.evaluate(() => JSON.parse(localStorage.getItem('kromacut.palettes')!).length)
    ).toBe(2);
    expect(errors).toEqual([]);
});

test('@smoke desktop profile opens protect unsaved edits and resolve existing content duplicates', async ({
    page,
}) => {
    await mockDesktop(page, [legacyFile]);
    await expect(page.getByRole('tab', { name: 'Auto-paint', exact: true })).toHaveAttribute(
        'data-state',
        'active'
    );
    await page.getByRole('button', { name: /add filament/i }).click();
    await expect
        .poll(() =>
            page.evaluate(
                () => JSON.parse(localStorage.getItem('kromacut.autopaint.v1')!).filaments.length
            )
        )
        .toBe(3);
    await openFiles(page, [currentFile]);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Unsaved filament edits');
    await dialog.getByRole('button', { name: 'Keep edits', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect((await profiles(page)).length).toBe(1);
    expect(
        await page.evaluate(
            () => JSON.parse(localStorage.getItem('kromacut.autopaint.v1')!).filaments.length
        )
    ).toBe(3);
    await openFiles(page, [currentFile]);
    await dialog.getByRole('button', { name: 'Open profile', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId')))
        .toBe('new-profile');
    expect((await profiles(page)).length).toBe(2);
    const duplicate = {
        ...legacyFile,
        content: JSON.stringify({ ...legacy, id: 'content-duplicate', name: 'Same spools' }),
    };
    await openFiles(page, [duplicate]);
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId')))
        .toBe(legacy.id);
    expect((await profiles(page)).length).toBe(2);
});

test('@smoke invalid and unreadable desktop files leave saved data intact and allow following imports', async ({
    page,
}) => {
    await mockDesktop(page, []);
    await expect(page.locator('#palette-select')).toBeVisible();
    await openFiles(page, [
        { ...currentFile, content: '{broken json' },
        { ...legacyFile, content: null, error: 'File not found' },
        paletteFile('After errors'),
    ]);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('New spools.kfil');
    expect(await profiles(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toContainText('My spools 日本語.kapp');
    expect(await profiles(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('#palette-select')).toContainText('After errors');
    const palettesBefore = await page.evaluate(() => localStorage.getItem('kromacut.palettes'));
    await page.evaluate(() => {
        (window as unknown as MockDesktop).fileOpenTest.failWrites = true;
    });
    await openFiles(page, [currentFile]);
    await expect(dialog).toContainText('New spools.kfil');
    expect(await profiles(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await openFiles(page, [paletteFile('Cannot save')]);
    await expect(dialog).toContainText('Cannot save.kpal');
    expect(await page.evaluate(() => localStorage.getItem('kromacut.palettes'))).toBe(
        palettesBefore
    );
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.evaluate(() => {
        (window as unknown as MockDesktop).fileOpenTest.failWrites = false;
    });
    await openFiles(page, [currentFile]);
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId')))
        .toBe('new-profile');
});
