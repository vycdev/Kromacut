import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PROFILES_KEY, storedProfiles, storedProfilesText } from './helpers/appStorage';

const fixture = (name: string) =>
    fileURLToPath(new URL(`../assets/filament-profiles/${name}`, import.meta.url));

async function openAutoPaint(page: Page) {
    await page.goto('/app');
    await expect(page.getByTestId('image-file-input')).toBeAttached();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
}

const profileSelect = (page: Page) =>
    page.getByText('Profiles', { exact: true }).locator('../..').getByRole('combobox');

const localProfiles = (page: Page) =>
    page.evaluate((key) => localStorage.getItem(key), PROFILES_KEY);

test('@smoke existing localStorage profiles move to IndexedDB once, unchanged', async ({
    page,
}) => {
    const profile = JSON.parse(await readFile(fixture('8_Colors_Calibrated_New.kfil'), 'utf8'));
    const seeded = JSON.stringify([{ ...profile, id: 'kept-profile', name: 'Kept calibration' }]);
    await page.addInitScript(
        ({ key, seeded }) => {
            // Seed the pre-IndexedDB storage once; later reloads must not re-seed it.
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            localStorage.setItem(key, seeded);
            localStorage.setItem('kromacut.autopaint.lastProfileId', 'kept-profile');
        },
        { key: PROFILES_KEY, seeded }
    );
    await openAutoPaint(page);

    await expect(profileSelect(page)).toContainText('Kept calibration');
    await expect.poll(() => localProfiles(page)).toBeNull();
    // The migrated text is what localStorage held, byte for byte.
    expect(await storedProfilesText(page)).toBe(seeded);
    expect(
        await page.evaluate(() => localStorage.getItem('kromacut.autopaint.lastProfileId'))
    ).toBe('kept-profile');

    await page.reload();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await expect(profileSelect(page)).toContainText('Kept calibration');
    expect(await localProfiles(page)).toBeNull();
    expect(await storedProfilesText(page)).toBe(seeded);
});

test('@smoke profiles larger than localStorage can hold are saved and survive a reload', async ({
    page,
}) => {
    await openAutoPaint(page);
    // About 12 MB of text, past every browser's localStorage cap for a site.
    const large = {
        ...JSON.parse(await readFile(fixture('2_Colors.kapp'), 'utf8')),
        id: 'large-profile',
        name: 'Large profile',
    };
    large.filaments[0].brand = 'x'.repeat(6 * 1024 * 1024);
    await page.getByTestId('autopaint-profile-import-input').setInputFiles({
        name: 'large.kfil',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(large)),
    });
    await expect(page.getByText(/1 imported/)).toBeVisible();
    await expect
        .poll(async () => (await storedProfiles<{ id: string }>(page)).map((p) => p.id))
        .toEqual(['large-profile']);
    expect(await localProfiles(page)).toBeNull();
    // The same text does not fit in localStorage, where profiles used to live.
    const fitsLocalStorage = await page.evaluate(async (key) => {
        const raw = (await new Promise<string>((resolve) => {
            const request = indexedDB.open('kromacut');
            request.onsuccess = () => {
                const get = request.result.transaction('kv').objectStore('kv').get(key);
                get.onsuccess = () => {
                    request.result.close();
                    resolve(get.result);
                };
            };
        })) as string;
        try {
            localStorage.setItem(`${key}.probe`, raw);
            localStorage.removeItem(`${key}.probe`);
            return true;
        } catch {
            return false;
        }
    }, PROFILES_KEY);
    expect(fitsLocalStorage).toBe(false);

    await page.reload();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await expect(profileSelect(page)).toContainText('Large profile');
});

test('@smoke without IndexedDB profiles keep saving to localStorage', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
    });
    await openAutoPaint(page);
    await page.getByTestId('autopaint-profile-import-input').setInputFiles(fixture('2_Colors.kapp'));
    await expect(page.getByText(/1 imported/)).toBeVisible();
    const saved = JSON.parse((await localProfiles(page))!);
    expect(saved.map((profile: { name: string }) => profile.name)).toEqual(['B&W']);

    await page.reload();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await expect(profileSelect(page)).toContainText('B&W');
    expect(JSON.parse((await localProfiles(page))!)).toEqual(saved);
});
