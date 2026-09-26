import { expect, test, type Page } from '@playwright/test';

async function openPrintSettings(page: Page, lineWidth: number) {
    await page.addInitScript((initialLineWidth) => {
        // Seed once so reloads exercise the app's existing persistence boundary.
        if (sessionStorage.getItem('print-line-width-seeded')) return;
        localStorage.clear();
        localStorage.setItem(
            'kromacut.autopaint.v1',
            JSON.stringify({
                schemaVersion: 2,
                filaments: [],
                paintMode: 'manual',
                ditherLineWidth: initialLineWidth,
            })
        );
        localStorage.setItem(
            'kromacut:3d-print-settings',
            JSON.stringify({
                layerHeight: 0.12,
                slicerFirstLayerHeight: 0.2,
                pixelSize: 0.1,
                smoothMeshing: false,
            })
        );
        sessionStorage.setItem('print-line-width-seeded', '1');
    }, lineWidth);
    await page.goto('/app');
    await expect(page.getByTestId('image-file-input')).toBeAttached();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    return page.getByTestId('print-effective-line-width');
}

async function expectSavedLineWidth(page: Page, expected: number) {
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    JSON.parse(localStorage.getItem('kromacut.autopaint.v1') ?? '{}')
                        .ditherLineWidth
            )
        )
        .toBe(expected);
}

test('@smoke effective line width lives in shared print settings and preserves saved values', async ({
    page,
}, testInfo) => {
    const lineWidth = await openPrintSettings(page, 0.21);
    const settingsToggle = page.getByRole('button', { name: /^3D Print Settings/ });

    await expect(page.getByRole('tab', { name: 'Manual', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
    );
    await expect(lineWidth).toBeVisible();
    await expect(lineWidth).toHaveValue('0.21');
    await expect(
        page.getByRole('spinbutton', { name: 'Effective line width', exact: true })
    ).toHaveCount(1);
    await expect(
        page.getByRole('button', { name: 'Reset effective line width', exact: true })
    ).toHaveCount(0);
    await expect(page.locator('#effective-line-width-help')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('print-settings-line-width.png') });

    // Collapsing this card must hide the moved control, and width alone makes it dirty.
    await settingsToggle.click();
    await expect(lineWidth).toBeHidden();
    await expect(page.getByRole('status', { name: 'Print settings modified' })).toBeVisible();
    await settingsToggle.click();
    await expect(lineWidth).toBeVisible();

    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await expect(page.getByText('No filaments added', { exact: true })).toBeVisible();
    await expect(lineWidth).toBeVisible();
    await expect(lineWidth).toHaveValue('0.21');
    await page.getByRole('button', { name: 'Add Filament', exact: true }).click();
    // The old control was conditional on having filaments, so check after adding one too.
    await expect(page.getByTestId('autopaint-effective-line-width')).toHaveCount(0);
    await expect(page.locator('#effective-line-width')).toHaveCount(1);
    await page.getByRole('tab', { name: 'Manual', exact: true }).click();

    await lineWidth.fill('0.33');
    await expectSavedLineWidth(page, 0.21);
    await lineWidth.blur();
    await expectSavedLineWidth(page, 0.33);
    await page.getByRole('tab', { name: 'Auto-paint', exact: true }).click();
    await expect(lineWidth).toHaveValue('0.33');
    await page.getByRole('tab', { name: 'Manual', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(lineWidth).toHaveValue('0.33');
    await expectSavedLineWidth(page, 0.33);
});

test('@smoke effective line width clamps, restores invalid drafts, and participates in section reset', async ({
    page,
}) => {
    const lineWidth = await openPrintSettings(page, 0.42);
    const resetSettings = page.getByRole('button', { name: 'Reset print settings', exact: true });
    const settingsToggle = page.getByRole('button', { name: /^3D Print Settings/ });
    await expect(resetSettings).toBeDisabled();

    await lineWidth.fill('2.5');
    await lineWidth.blur();
    await expect(lineWidth).toHaveValue('2');
    await expectSavedLineWidth(page, 2);
    await lineWidth.fill('0.01');
    await lineWidth.press('Enter');
    await expect(lineWidth).toHaveValue('0.1');
    await expectSavedLineWidth(page, 0.1);
    await lineWidth.fill('');
    await lineWidth.blur();
    await expect(lineWidth).toHaveValue('0.1');
    await expectSavedLineWidth(page, 0.1);
    await lineWidth.fill('0.36');
    await lineWidth.press('Enter');
    await expectSavedLineWidth(page, 0.36);

    await resetSettings.click();
    await expect(lineWidth).toHaveValue('0.42');
    await expectSavedLineWidth(page, 0.42);
    await expect(resetSettings).toBeDisabled();

    await lineWidth.fill('0.27');
    await lineWidth.blur();
    await expect(resetSettings).toBeEnabled();
    await settingsToggle.click();
    await expect(page.getByRole('status', { name: 'Print settings modified' })).toBeVisible();
    await resetSettings.click();
    await expect(page.getByRole('status', { name: 'Print settings modified' })).toHaveCount(0);
    await expect(resetSettings).toBeDisabled();
    await expectSavedLineWidth(page, 0.42);
    await settingsToggle.click();
    await expect(lineWidth).toHaveValue('0.42');
});
