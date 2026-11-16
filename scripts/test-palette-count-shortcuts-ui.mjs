import { appUrl, artifactPath, launchBrowser } from './custom-ui-helpers.mjs';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sets = JSON.parse(readFileSync('src/data/additionalSupplierSets.json', 'utf8'));
const allowed = new Set(
    sets
        .filter((s) => ['SUNLU', 'ELEGOO'].includes(s.brand))
        .flatMap((s) => s.filaments.map((f) => f.hex.toLowerCase()))
);
const browser = await launchBrowser();
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(appUrl);
    const png = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 600;
        c.height = 100;
        const x = c.getContext('2d');
        ['#111111', '#222222', '#d12a30', '#f02030', '#f0f0f0', '#fffaf0'].forEach((color, i) => {
            x.fillStyle = color;
            x.fillRect(i * 100, 0, 100, 100);
        });
        return c.toDataURL().split(',')[1];
    });
    await page
        .getByTestId('image-file-input')
        .setInputFiles({
            name: 'six-colors.png',
            mimeType: 'image/png',
            buffer: Buffer.from(png, 'base64'),
        });
    const canvas = page.getByTestId('main-image-preview');
    const imageColors = () =>
        canvas.evaluate((c) => {
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            const s = new Set();
            for (let i = 0; i < d.length; i += 4)
                if (d[i + 3] === 255)
                    s.add(
                        '#' +
                            [d[i], d[i + 1], d[i + 2]]
                                .map((v) => v.toString(16).padStart(2, '0'))
                                .join('')
                    );
            return [...s].sort();
        });
    await expect.poll(async () => (await imageColors()).length).toBe(6);
    const original = await imageColors();
    await page.getByRole('button', { name: 'Palette', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Palette', exact: true });
    await menu.getByRole('checkbox', { name: 'SUNLU PLA Classic', exact: true }).check();
    await menu.getByRole('checkbox', { name: 'ELEGOO PLA (community RFID)', exact: true }).check();
    await page.keyboard.press('Escape');
    const count = page.getByLabel('Number of Colors', { exact: false });
    // Use the stable existing field ID regardless of capitalization/translations.
    const number = page.locator('#final-colors');
    assert(!(await number.isDisabled()));
    await number.fill('3');
    await number.press('Tab');
    assert.equal(
        await page.getByRole('button', { name: 'Palette', exact: true }).innerText(),
        'Selected palettes: 2'
    );
    await page.getByTestId('quantize-apply').click();
    await expect(page.getByTestId('quantize-apply')).toBeEnabled({ timeout: 60000 });
    await expect.poll(async () => (await imageColors()).length).toBeLessThanOrEqual(3);
    const result = await imageColors();
    assert(result.every((c) => allowed.has(c)));
    assert(result.length >= 1);
    await page.keyboard.press('Control+z');
    await expect.poll(imageColors).toEqual(original);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(imageColors).toEqual(result);
    // Text focus must not change image history.
    await number.focus();
    await page.keyboard.press('Control+z');
    assert.deepEqual(await imageColors(), result);
    await number.press('Tab');
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
    await page.keyboard.press('Control+z');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual(await imageColors(), result);
    // Reload must retain both selected palettes.
    await page.reload();
    await page.getByRole('button', { name: 'Palette', exact: true }).click();
    assert(
        await menu.getByRole('checkbox', { name: 'SUNLU PLA Classic', exact: true }).isChecked()
    );
    assert(
        await menu
            .getByRole('checkbox', { name: 'ELEGOO PLA (community RFID)', exact: true })
            .isChecked()
    );
    await menu.getByRole('checkbox', { name: 'SUNLU PLA Classic', exact: true }).uncheck();
    assert(
        await menu
            .getByRole('checkbox', { name: 'ELEGOO PLA (community RFID)', exact: true })
            .isChecked()
    );
    await page.screenshot({ path: artifactPath('palette-count-shortcuts-tested.png') });
    console.log(
        'PASS: editable count with two supplier palettes; reduced output bounded by requested count and allowed union; Ctrl+Z and Ctrl+Shift+Z pixel restoration; text/modal guards; persisted multiple selections and independent unchecking.'
    );
} finally {
    await browser.close();
}
