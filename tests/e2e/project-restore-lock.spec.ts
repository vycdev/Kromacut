import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.setTimeout(120_000);
type RestoreProbe = Window & { holdRestore: boolean; releaseRestore?: (fail: boolean) => void };
async function image(page: Page, width: number) {
    const png = await page.evaluate((width) => {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = 48;
        c.getContext('2d')!.fillRect(0, 0, width, 48);
        return c.toDataURL().split(',')[1];
    }, width);
    await page
        .getByTestId('image-file-input')
        .setInputFiles({
            name: 'source.png',
            mimeType: 'image/png',
            buffer: Buffer.from(png, 'base64'),
        });
    await expect(page.getByText(`Image: ${width}×48`, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeEnabled();
}
for (const fail of [false, true])
    test(`@smoke project restore locks edits and ${fail ? 'unlocks after decoding fails' : 'preserves the restored session'}`, async ({
        page,
    }) => {
        await page.addInitScript(() => {
            localStorage.clear();
            const original = window.createImageBitmap.bind(window);
            const w = window as unknown as RestoreProbe;
            window.createImageBitmap = ((...args: Parameters<typeof original>) => {
                if (!w.holdRestore) return original(...args);
                w.holdRestore = false;
                return new Promise<ImageBitmap>((resolve, reject) => {
                    w.releaseRestore = (fail) =>
                        fail
                            ? reject(new Error('test decode failure'))
                            : original(...args).then(resolve, reject);
                });
            }) as typeof original;
        });
        await page.goto('/app');
        await image(page, 64);
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Save project', exact: true }).click();
        const file = await download;
        const project = await readFile((await file.path())!);
        await image(page, 96);
        await page
            .getByTestId('project-file-input')
            .setInputFiles({
                name: 'restore.kromacut',
                mimeType: 'application/zip',
                buffer: project,
            });
        const dialog = page.getByRole('dialog', { name: 'Open project', exact: true });
        await expect(dialog).toBeVisible();
        await page.evaluate(() => {
            (window as unknown as RestoreProbe).holdRestore = true;
        });
        await dialog.getByRole('button', { name: 'Open project', exact: true }).click();
        await expect
            .poll(() => page.evaluate(() => !!(window as unknown as RestoreProbe).releaseRestore))
            .toBe(true);
        await expect(page.getByTestId('quantize-apply')).toBeDisabled();
        await expect(page.getByTestId('image-file-input')).toBeDisabled();
        await expect(
            page.getByRole('button', { name: 'Edit thresholds', exact: true })
        ).toBeDisabled();
        await expect(
            page.getByRole('button', { name: 'Compare nozzle sizes', exact: true })
        ).toBeDisabled();
        await expect(
            page.getByTestId('image-dropzone').locator('xpath=ancestor::*[@inert]')
        ).toHaveCount(1);
        // Even a synthetic activation cannot start a quantize against the previous image.
        await page.getByTestId('quantize-apply').evaluate((b: HTMLButtonElement) => b.click());
        await page.keyboard.press('Control+z');
        await page.evaluate(
            (fail) => (window as unknown as RestoreProbe).releaseRestore!(fail),
            fail
        );
        await expect(dialog).toBeHidden();
        await expect(page.getByText(`Image: ${fail ? 96 : 64}×48`, { exact: true })).toBeVisible();
        await expect(page.getByTestId('quantize-apply')).toBeEnabled();
        await expect(page.getByTestId('image-file-input')).toBeEnabled();
        await expect(
            page.getByTestId('image-dropzone').locator('xpath=ancestor::*[@inert]')
        ).toHaveCount(0);
        if (!fail) {
            await page.getByRole('button', { name: 'Undo', exact: true }).click();
            await expect(page.getByText('Image: 1024×1024', { exact: true })).toBeVisible();
        }
    });
