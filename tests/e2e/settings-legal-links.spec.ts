import { expect, test, type Page } from '@playwright/test';
import commonRo from '../../src/locales/ro/common.json' with { type: 'json' };
import publicRo from '../../src/locales/ro/public.json' with { type: 'json' };

type LegalLinkTestWindow = Window & {
    isTauri?: boolean;
    legalLinkTest: { calls: string[]; fail: boolean };
    __TAURI_INTERNALS__?: {
        transformCallback: () => number;
        invoke: (command: string, args?: { path?: string }) => Promise<unknown>;
    };
};

async function prepare(page: Page, desktop = false) {
    await page.addInitScript((native) => {
        localStorage.clear();
        localStorage.setItem('kromacut.language.v1', 'en');
        localStorage.setItem('legal-link-workspace-sentinel', 'preserved');
        if (!native) return;
        const host = window as unknown as LegalLinkTestWindow;
        host.isTauri = true;
        host.legalLinkTest = { calls: [], fail: false };
        host.__TAURI_INTERNALS__ = {
            transformCallback: () => 1,
            async invoke(command, args) {
                if (command === 'get_app_version') return '4.1.0';
                if (command === 'check_for_updates' || command === 'take_opened_file') return null;
                if (command === 'plugin:event|listen' || command === 'plugin:event|unlisten')
                    return 1;
                if (command === 'open_legal_page') {
                    if (host.legalLinkTest.fail) throw new Error('Browser unavailable');
                    host.legalLinkTest.calls.push(args!.path!);
                    return;
                }
                throw new Error(`Unexpected native command: ${command}`);
            },
        };
    }, desktop);
    await page.goto('/app');
    await page.getByRole('button', { name: 'Open settings' }).click();
}

test('Settings legal links open localized web pages in a new tab', async ({ page }) => {
    await prepare(page);
    for (const [path, label] of [
        ['/privacy', 'Privacy & local data'],
        ['/terms', 'Terms & conditions'],
    ]) {
        const link = page.getByRole('dialog').getByRole('link', { name: label, exact: true });
        await expect(link).toHaveAttribute('href', path);
        const popupEvent = page.waitForEvent('popup');
        await link.click();
        const popup = await popupEvent;
        await expect(popup.getByTestId(`${path.slice(1)}-page`)).toBeVisible();
        await popup.close();
        await expect(page).toHaveURL(/\/app$/);
        await page.getByRole('button', { name: 'Open settings' }).click();
    }
    await page.getByTestId('app-language').click();
    await page.getByRole('option', { name: 'Română', exact: true }).click();
    const privacy = page.getByRole('link', { name: publicRo.navigation.privacy, exact: true });
    await expect(privacy).toHaveAttribute('href', '/ro/privacy');
    await expect(
        page.getByRole('link', { name: publicRo.navigation.terms, exact: true })
    ).toHaveAttribute('href', '/ro/terms');
    const popupEvent = page.waitForEvent('popup');
    await privacy.click();
    const popup = await popupEvent;
    await expect(popup).toHaveURL(/\/ro\/privacy$/);
    await expect(popup.locator('html')).toHaveAttribute('lang', 'ro');
    await popup.close();
});

test('desktop Settings legal links use the native browser command and keep the workspace', async ({
    page,
}, testInfo) => {
    await prepare(page, true);
    await expect(
        page.getByRole('link', { name: 'Privacy & local data', exact: true })
    ).toHaveAttribute('href', 'https://kromacut.com/privacy');
    await page.getByRole('link', { name: 'Privacy & local data', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.getByTestId('app-language').click();
    await page.getByRole('option', { name: 'Română', exact: true }).click();
    const terms = page.getByRole('link', { name: publicRo.navigation.terms, exact: true });
    await expect(terms).toHaveAttribute('href', 'https://kromacut.com/ro/terms');
    await page.setViewportSize({ width: 360, height: 800 });
    await terms.scrollIntoViewIfNeeded();
    const dialog = page.getByRole('dialog');
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
    );
    await page.screenshot({ path: testInfo.outputPath('settings-legal-links-mobile.png') });
    await terms.click();
    await expect(dialog).toBeHidden();
    expect(
        await page.evaluate(() => (window as unknown as LegalLinkTestWindow).legalLinkTest.calls)
    ).toEqual(['/privacy', '/ro/terms']);
    expect(await page.evaluate(() => localStorage.getItem('legal-link-workspace-sentinel'))).toBe(
        'preserved'
    );
    await expect(page).toHaveURL(/\/app$/);
    expect(page.context().pages()).toHaveLength(1);
    await expect(page.getByRole('button', { name: commonRo.settings.open })).toBeVisible();
});

test('desktop browser-open failure leaves Settings available for retry', async ({ page }) => {
    await prepare(page, true);
    await page.evaluate(() => {
        (window as unknown as LegalLinkTestWindow).legalLinkTest.fail = true;
    });
    const terms = page.getByRole('link', { name: 'Terms & conditions', exact: true });
    await terms.click();
    await expect(page.getByRole('alert')).toHaveText('Could not open this page. Try again.');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.evaluate(() => {
        (window as unknown as LegalLinkTestWindow).legalLinkTest.fail = false;
    });
    await terms.click();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(
        await page.evaluate(() => (window as unknown as LegalLinkTestWindow).legalLinkTest.calls)
    ).toEqual(['/terms']);
    await expect(page).toHaveURL(/\/app$/);
});
