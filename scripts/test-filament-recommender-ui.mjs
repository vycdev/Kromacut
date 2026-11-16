import { appUrl, artifactPath, launchBrowser } from './custom-ui-helpers.mjs';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await launchBrowser();
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(appUrl);
    const png = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 300;
        c.height = 100;
        const x = c.getContext('2d');
        ['#080A0D', '#E72F1D', '#EBF7FF'].forEach((color, i) => {
            x.fillStyle = color;
            x.fillRect(i * 100, 0, 100, 100);
        });
        return c.toDataURL().split(',')[1];
    });
    await page
        .getByTestId('image-file-input')
        .setInputFiles({
            name: 'three-colors.png',
            mimeType: 'image/png',
            buffer: Buffer.from(png, 'base64'),
        });
    const canvas = page.getByTestId('main-image-preview');
    const hasPixel = (hex) =>
        canvas.evaluate((c, hex) => {
            const target = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            for (let i = 0; i < d.length; i += 4)
                if (
                    d[i] === target[0] &&
                    d[i + 1] === target[1] &&
                    d[i + 2] === target[2] &&
                    d[i + 3] === 255
                )
                    return true;
            return false;
        }, hex);
    const panel = page.getByTestId('filament-recommender');
    const black = panel.getByRole('button', { name: 'Select #080A0D', exact: true });
    const red = panel.getByRole('button', { name: 'Select #E72F1D', exact: true });
    const popup = page.getByTestId('filament-match-row');
    const top = panel.getByRole('button', { name: 'Select top colors', exact: true });
    const save = panel.getByRole('button', { name: 'Save matched palette', exact: true });
    async function brands(names) {
        await panel.getByRole('button', { name: 'Filament brand', exact: true }).click();
        const menu = page.getByRole('dialog', { name: 'Filament brand', exact: true });
        await menu.getByRole('checkbox', { name: 'All brands', exact: true }).check();
        await menu.getByRole('checkbox', { name: 'All brands', exact: true }).uncheck();
        for (const name of names) await menu.getByRole('checkbox', { name, exact: true }).check();
        await page.keyboard.press('Escape');
    }
    await brands(['Polymaker']);
    assert(await save.isDisabled());
    await black.click();
    assert.equal(await black.getAttribute('aria-pressed'), 'true');
    assert.equal(await popup.getByRole('radio').count(), 10);
    assert.equal(await popup.locator('[aria-checked="true"]').count(), 0);
    const cards = await popup
        .getByRole('radio')
        .evaluateAll((cards) =>
            cards.map((card) => ({
                x: card.getBoundingClientRect().x,
                y: card.getBoundingClientRect().y,
                width: card.getBoundingClientRect().width,
                text: card.title,
            }))
        );
    assert(cards.every((c) => c.width < 35));
    assert(cards.every((c, i) => !i || (c.x > cards[i - 1].x && c.y === cards[0].y)));
    assert.match(cards[0].text, /ΔE00 0.00/);
    await popup.getByRole('radio').nth(1).click();
    assert.equal(await black.getAttribute('data-preview-hex'), '#485259');
    assert.equal(
        await black.evaluate((el) => getComputedStyle(el).backgroundColor),
        'rgb(72, 82, 89)'
    );
    await expect.poll(() => hasPixel('#485259')).toBe(true);
    await expect.poll(() => hasPixel('#080A0D')).toBe(false);
    await popup.getByRole('radio').nth(1).click();
    assert.equal(await black.getAttribute('data-preview-hex'), '#080A0D');
    await expect.poll(() => hasPixel('#080A0D')).toBe(true);
    await expect.poll(() => hasPixel('#485259')).toBe(false);
    assert.equal(await popup.locator('[aria-checked="true"]').count(), 0);
    await popup.getByRole('radio').nth(1).click();
    await red.click();
    assert.equal(await black.getAttribute('aria-pressed'), 'false');
    assert.equal(await red.getAttribute('aria-pressed'), 'true');
    assert.equal(await popup.count(), 1);
    assert.match(await popup.innerText(), /#E72F1D/);
    await red.click();
    await popup.waitFor({ state: 'hidden' });
    assert.equal(await red.getAttribute('aria-pressed'), 'false');
    await top.click();
    assert.equal(await black.getAttribute('data-preview-hex'), '#080A0D');
    assert(!(await save.isDisabled()));
    await black.click();
    assert.equal(await popup.getByRole('radio').first().getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Escape');
    await save.click();
    const palette = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('kromacut.palettes')).find(
            (p) => p.name === 'Matched filaments'
        )
    );
    assert.equal(palette.colors.length, 3);
    assert(palette.colorNames.some((n) => n.endsWith(' Black')));
    assert(!palette.colorNames.some((n) => n.endsWith('Dark Grey')));
    await panel.getByRole('button', { name: 'Clear selection', exact: true }).click();
    assert(await save.isDisabled());
    await brands(['SUNLU', 'ELEGOO']);
    await panel.getByRole('button', { name: 'Filament brand', exact: true }).click();
    assert(await page.getByRole('checkbox', { name: 'SUNLU', exact: true }).isChecked());
    assert(await page.getByRole('checkbox', { name: 'ELEGOO', exact: true }).isChecked());
    await page.keyboard.press('Escape');
    await red.click();
    const labels = await popup
        .getByRole('radio')
        .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    assert(labels.every((l) => l.includes('SUNLU') || l.includes('ELEGOO')));
    assert(labels.some((l) => l.includes('SUNLU')) && labels.some((l) => l.includes('ELEGOO')));
    await page.keyboard.press('Escape');
    await top.click();
    assert(!(await save.isDisabled()));
    await brands([]);
    assert(await top.isDisabled());
    assert(await save.isDisabled());
    await black.click();
    assert.equal(await popup.getByRole('radio').count(), 0);
    await page.keyboard.press('Escape');
    await brands(['Polymaker']);
    await panel.getByLabel('Filament material', { exact: true }).selectOption('PETG');
    assert(await top.isDisabled());
    await brands(['Prusament']);
    assert(!(await top.isDisabled()));
    await panel.getByLabel('Filament material', { exact: true }).selectOption('PLA');
    await brands(['Polymaker']);
    await black.click();
    await popup.getByRole('radio').nth(1).click();
    await page.keyboard.press('Escape');
    await panel.getByRole('button', { name: 'Apply to image', exact: true }).click();
    await panel.getByRole('button', { name: 'Select #485259', exact: true }).waitFor();
    await expect.poll(() => hasPixel('#485259')).toBe(true);
    await page.getByRole('button', { name: /^Undo/ }).click();
    await black.waitFor();
    await expect.poll(() => hasPixel('#080A0D')).toBe(true);
    await expect.poll(() => hasPixel('#485259')).toBe(false);
    await brands(['SUNLU', 'ELEGOO']);
    await top.click();
    const previewColors = await panel
        .locator('[data-preview-hex]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-preview-hex').toLowerCase()));
    const brightness = (hex) =>
        0.2126 * parseInt(hex.slice(1, 3), 16) +
        0.7152 * parseInt(hex.slice(3, 5), 16) +
        0.0722 * parseInt(hex.slice(5, 7), 16);
    const expectedColors = [...new Set(previewColors)].sort(
        (a, b) => brightness(a) - brightness(b)
    );
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    assert.equal(
        await page.getByRole('spinbutton', { name: 'Number of colors', exact: true }).inputValue(),
        String(expectedColors.length)
    );
    for (let i = 0; i < expectedColors.length; i++)
        assert.equal(
            await page.getByLabel(`Color ${i + 1}`, { exact: true }).inputValue(),
            expectedColors[i]
        );
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await panel.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await page.getByRole('button', { name: 'Edit thresholds', exact: true }).click();
    const originals = ['#080a0d', '#e72f1d', '#ebf7ff'];
    for (let i = 0; i < originals.length; i++)
        assert.equal(
            await page.getByLabel(`Color ${i + 1}`, { exact: true }).inputValue(),
            originals[i]
        );
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await top.click();
    await black.click();
    await page.screenshot({ path: artifactPath('filament-recommender-tested.png') });
    console.log(
        'PASS: thresholds automatically load current preview colors and refresh on reopening; live main-image recoloring, clearing, full-image Apply and Undo; only active swatch highlighted; direct popup switching and closing; chosen colors update preview and can be deselected; Select top colors overwrites manual choices; saved closest palette; combined checked brands; no-brand and material empty states.'
    );
} finally {
    await browser.close();
}
