import { expect, test, type Page } from '@playwright/test';
import { storedImageSession } from './helpers/appStorage';

// The size from the crash report in issue #228. Noise keeps the PNG large (several MB).
const WIDTH = 736;
const HEIGHT = 1313;

async function noisePng(page: Page, width: number, height: number, seed: number) {
    const base64 = await page.evaluate(
        async ({ width, height, seed }) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d')!;
            const pixels = context.createImageData(width, height);
            let state = seed;
            for (let i = 0; i < pixels.data.length; i += 4) {
                state = (state * 1664525 + 1013904223) >>> 0;
                pixels.data[i] = state & 255;
                pixels.data[i + 1] = (state >>> 8) & 255;
                pixels.data[i + 2] = (state >>> 16) & 255;
                pixels.data[i + 3] = 255;
            }
            context.putImageData(pixels, 0, 0);
            const blob = await new Promise<Blob>((resolve) =>
                canvas.toBlob((value) => resolve(value!), 'image/png')
            );
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) {
                binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            }
            return btoa(binary);
        },
        { width, height, seed }
    );
    return Buffer.from(base64, 'base64');
}

const currentSize = (page: Page) => page.getByText('Current', { exact: true }).locator('..');
const undo = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true });
const redo = (page: Page) => page.getByRole('button', { name: 'Redo', exact: true });

async function openApp(page: Page) {
    await page.goto('/app');
    await expect(page.getByTestId('image-file-input')).toBeAttached();
}

async function upload(page: Page, name: string, width: number, height: number, seed: number) {
    await page.getByTestId('image-file-input').setInputFiles({
        name,
        mimeType: 'image/png',
        buffer: await noisePng(page, width, height, seed),
    });
    await expect(currentSize(page)).toContainText(`${width}x${height}`);
}

async function resizeByHalf(page: Page, expected: string) {
    const resize = page.getByTestId('image-resize-percent-slider').locator('..').locator('..');
    await resize.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(currentSize(page)).toContainText(expected);
}

/** Waits until the stored session lists exactly this many undo and redo steps. */
async function waitForStoredHistory(page: Page, past: number, future: number) {
    await expect
        .poll(async () => {
            const session = await storedImageSession(page);
            if (!session?.record) return null;
            return [session.record.past.length, session.record.future.length];
        })
        .toEqual([past, future]);
}

test('@smoke a large edited image and its undo history survive a crash', async ({
    page,
    context,
}) => {
    // A crash runs no shutdown code, so recovery must not depend on any. (CDP Page.crash
    // hangs headless Chromium, so the tab is closed with every such handler disabled.)
    await page.addInitScript(() => {
        const add = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, ...rest) {
            if (['pagehide', 'beforeunload', 'unload', 'visibilitychange'].includes(type)) return;
            return add.call(this, type, ...rest);
        };
    });
    await openApp(page);
    await upload(page, 'crash-case.png', WIDTH, HEIGHT, 7);
    await resizeByHalf(page, '368x657');
    // History: starter image, the import, then the resize.
    await waitForStoredHistory(page, 2, 0);
    const stored = (await storedImageSession(page))!;
    expect(stored.blobs.map((blob) => blob.kind).sort()).toEqual(['edit', 'import']);
    expect(stored.blobs.find((blob) => blob.kind === 'import')!.size).toBeGreaterThan(1_000_000);

    await page.close({ runBeforeUnload: false });
    const recovered = await context.newPage();
    await openApp(recovered);

    await expect(currentSize(recovered)).toContainText('368x657');
    await expect(undo(recovered)).toBeEnabled();
    await undo(recovered).click();
    await expect(currentSize(recovered)).toContainText(`${WIDTH}x${HEIGHT}`);
    await undo(recovered).click();
    await expect(currentSize(recovered)).toContainText('1024x1024');
    await expect(undo(recovered)).toBeDisabled();
    await redo(recovered).click();
    await redo(recovered).click();
    await expect(currentSize(recovered)).toContainText('368x657');
    await expect(redo(recovered)).toBeDisabled();
});

test('@smoke a reload restores the newest image and releases history that left the undo stack', async ({
    page,
}) => {
    await openApp(page);
    await upload(page, 'first.png', 64, 48, 1);
    await resizeByHalf(page, '32x24');
    await waitForStoredHistory(page, 2, 0);

    // Undo, then a new image: the resize leaves the redo stack and its snapshot is deleted.
    await undo(page).click();
    await expect(currentSize(page)).toContainText('64x48');
    await waitForStoredHistory(page, 1, 1);
    await upload(page, 'second.png', 40, 30, 2);
    await waitForStoredHistory(page, 2, 0);
    const stored = (await storedImageSession(page))!;
    expect(stored.blobs).toHaveLength(2);
    expect(stored.blobs.every((blob) => blob.kind === 'import')).toBe(true);

    await page.reload();
    await expect(currentSize(page)).toContainText('40x30');
    await undo(page).click();
    await expect(currentSize(page)).toContainText('64x48');
    // Edits after recovery keep saving.
    await waitForStoredHistory(page, 1, 1);
    await resizeByHalf(page, '32x24');
    await waitForStoredHistory(page, 2, 0);
    await page.reload();
    await expect(currentSize(page)).toContainText('32x24');
});

test('@smoke a removed image is not restored after a reload', async ({ page }) => {
    await openApp(page);
    await upload(page, 'removed.png', 50, 50, 3);
    await waitForStoredHistory(page, 1, 0);
    await page.getByRole('button', { name: 'Remove image', exact: true }).click();
    await expect
        .poll(async () => {
            const session = await storedImageSession(page);
            return session && { record: session.record, blobs: session.blobs.length };
        })
        .toEqual({ record: null, blobs: 0 });

    await page.reload();
    await expect(currentSize(page)).toContainText('1024x1024');
    await expect(undo(page)).toBeDisabled();
});

test('@smoke a corrupt or partial stored session falls back to the starter image', async ({
    page,
}) => {
    await openApp(page);
    await upload(page, 'corrupt.png', 30, 20, 4);
    await resizeByHalf(page, '15x10');
    await waitForStoredHistory(page, 2, 0);

    // A missing undo step is dropped; the rest of the history still works.
    await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('kromacut');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const transaction = db.transaction(['imageSession', 'imageBlobs'], 'readwrite');
        const sessions = transaction.objectStore('imageSession');
        const request = sessions.get('current');
        request.onsuccess = () => {
            const record = request.result;
            transaction.objectStore('imageBlobs').delete(record.past[1]);
        };
        await new Promise((resolve) => (transaction.oncomplete = resolve));
        db.close();
    });
    await page.reload();
    await expect(currentSize(page)).toContainText('15x10');
    await undo(page).click();
    await expect(currentSize(page)).toContainText('1024x1024');
    await expect(undo(page)).toBeDisabled();
    await redo(page).click();
    await expect(currentSize(page)).toContainText('15x10');
    await waitForStoredHistory(page, 1, 0);

    // A current image that no longer decodes discards the whole record.
    await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('kromacut');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const transaction = db.transaction(['imageSession', 'imageBlobs'], 'readwrite');
        const request = transaction.objectStore('imageSession').get('current');
        request.onsuccess = () => {
            const record = request.result;
            // Bytes, not a Blob: WebKit test sessions refuse Blobs in IndexedDB.
            transaction
                .objectStore('imageBlobs')
                .put(
                    { kind: 'edit', bytes: new Uint8Array([1, 2, 3, 4]).buffer, type: 'image/png' },
                    record.current
                );
        };
        await new Promise((resolve) => (transaction.oncomplete = resolve));
        db.close();
    });
    await page.reload();
    await expect(currentSize(page)).toContainText('1024x1024');
    await expect
        .poll(async () => {
            const session = await storedImageSession(page);
            return session && { record: session.record, blobs: session.blobs.length };
        })
        .toEqual({ record: null, blobs: 0 });
});

test('@smoke without IndexedDB the app still edits images and starts fresh', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
        Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
    });
    await openApp(page);
    await upload(page, 'no-idb.png', 30, 30, 8);
    await resizeByHalf(page, '15x15');
    await undo(page).click();
    await expect(currentSize(page)).toContainText('30x30');
    await page.reload();
    await expect(currentSize(page)).toContainText('1024x1024');
    expect(errors).toEqual([]);
});
