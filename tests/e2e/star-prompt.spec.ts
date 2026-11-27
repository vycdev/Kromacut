import { expect, test, type Page } from '@playwright/test';
import { fakeDesktopBeforeLoad, fakeDesktopCalls } from './helpers/fakeDesktop';

type StarTestWindow = Window & {
    __KROMACUT_E2E: { buildHistory: unknown[] };
    saveTest: { cancel: boolean };
};

const PROMPT_KEY = 'kromacut:github-star-prompt-shown';

async function openApp(page: Page) {
    await page.addInitScript(() => {
        // Start clean once per test, but keep storage across reloads.
        if (!sessionStorage.getItem('star-prompt-test')) {
            localStorage.clear();
            localStorage.setItem('kromacut.language.v1', 'en');
            sessionStorage.setItem('star-prompt-test', 'started');
        }
        Object.assign(window, { __KROMACUT_E2E: { buildHistory: [] } });
    });
    await page.goto('/app');
}

/** Imports a small image into the open app and builds its 3D model. */
async function buildModel(page: Page) {
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 8;
        const ctx = canvas.getContext('2d')!;
        ['#000000', '#ffffff'].forEach((color, i) => {
            ctx.fillStyle = color;
            ctx.fillRect(i * 8, 0, 8, 8);
        });
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'star-prompt.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByTestId('build-3d-model').click();
    await page.waitForFunction(
        () => (window as unknown as StarTestWindow).__KROMACUT_E2E.buildHistory.length > 0
    );
    await expect(page.getByTestId('download-3d-model')).toBeEnabled();
}

async function exportModel(page: Page, format: 'stl' | '3mf', download = true) {
    const item = page.getByTestId(`download-${format}`);
    if (!(await item.isVisible())) await page.getByTestId('download-3d-model').click();
    if (!download) return item.click();
    const pending = page.waitForEvent('download');
    await item.click();
    await pending;
}

const prompt = (page: Page) => page.getByTestId('star-prompt');

test('@smoke the GitHub star prompt appears once after the first export', async ({ page }) => {
    await openApp(page);
    await buildModel(page);
    await expect(prompt(page)).toHaveCount(0);

    await exportModel(page, 'stl');
    await expect(prompt(page)).toBeVisible();
    await expect(prompt(page).getByRole('heading', { name: 'Enjoying Kromacut?' })).toBeVisible();
    await expect(prompt(page).getByRole('link', { name: 'Star on GitHub' })).toHaveAttribute(
        'href',
        'https://github.com/vycdev/Kromacut'
    );
    await prompt(page).getByRole('button', { name: 'Not now' }).click();
    await expect(prompt(page)).toHaveCount(0);

    // Neither another export nor a new session asks again.
    await exportModel(page, '3mf');
    await page.reload();
    await buildModel(page);
    await exportModel(page, 'stl');
    await page.waitForTimeout(300);
    await expect(prompt(page)).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), PROMPT_KEY)).toBe('true');
});

test('@smoke Star on GitHub opens the repository in a new tab and closes the prompt', async ({
    page,
    context,
}) => {
    await context.route('https://github.com/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<title>Kromacut on GitHub</title>' })
    );
    await openApp(page);
    await buildModel(page);
    await exportModel(page, '3mf');
    const popupEvent = page.waitForEvent('popup');
    await prompt(page).getByRole('link', { name: 'Star on GitHub' }).click();
    const popup = await popupEvent;
    await expect(popup).toHaveURL('https://github.com/vycdev/Kromacut');
    await popup.close();
    await expect(prompt(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/app$/);
});

test('@smoke a cancelled desktop save does not use up the star prompt', async ({ page }) => {
    await fakeDesktopBeforeLoad(page, (desktop) => {
        const host = window as unknown as StarTestWindow;
        host.saveTest = { cancel: true };
        desktop.handle(
            [
                'plugin:dialog|save',
                'plugin:fs|open',
                'plugin:fs|write',
                'plugin:resources|close',
                'plugin:dialog|message',
            ],
            (args: { data: Uint8Array }, command) => {
                if (command === 'plugin:dialog|save')
                    return host.saveTest.cancel ? null : '/mock/model.stl';
                if (command === 'plugin:fs|open') return 7;
                if (command === 'plugin:fs|write') return args.data.byteLength;
                if (command === 'plugin:dialog|message') return 'Ok';
            }
        );
        desktop.handle('open_repository_page', () => undefined);
    });
    await openApp(page);
    await buildModel(page);

    await exportModel(page, 'stl', false);
    await expect
        .poll(async () => (await fakeDesktopCalls(page)).includes('plugin:dialog|save'))
        .toBe(true);
    await page.waitForTimeout(500);
    await expect(prompt(page)).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), PROMPT_KEY)).toBeNull();

    await page.evaluate(() => {
        (window as unknown as StarTestWindow).saveTest.cancel = false;
    });
    await exportModel(page, 'stl', false);
    await expect(prompt(page)).toBeVisible();

    const popups: string[] = [];
    page.on('popup', (popup) => popups.push(popup.url()));
    await prompt(page).getByRole('link', { name: 'Star on GitHub' }).click();
    await expect(prompt(page)).toHaveCount(0);
    await expect
        .poll(async () => (await fakeDesktopCalls(page)).includes('open_repository_page'))
        .toBe(true);
    expect(popups).toEqual([]);
});
