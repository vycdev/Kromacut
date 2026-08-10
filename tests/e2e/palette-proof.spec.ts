import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const assetRoot = path.join(repoRoot, 'tests', 'assets');

test('Palette Proof stays usable, persists results, and downloads its frozen 3MF', async ({
    page,
}, testInfo) => {
    testInfo.setTimeout(3 * 60 * 1000);
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/app');
    await page
        .getByTestId('image-file-input')
        .setInputFiles(path.join(assetRoot, '1024x1024p.png'));
    await expect(page.locator('body')).toContainText('Image: 1024', { timeout: 60_000 });

    await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.getByRole('tab', { name: 'Auto-paint' }).click();
    await page
        .getByTestId('autopaint-profile-import-input')
        .setInputFiles(path.join(assetRoot, 'filament-profiles', '4_Colors.kapp'));
    await expect(page.getByText(/1 imported|1 overwritten/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('build-3d-model')).toBeEnabled({ timeout: 90_000 });

    await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    const calibrationDialogBounds = await dialog.boundingBox();
    const closeBounds = await dialog
        .getByRole('button', { name: 'Close calibration dialog' })
        .boundingBox();
    const surfaceTabsBounds = await dialog.getByTestId('calibration-surface-tabs').boundingBox();
    expect(closeBounds).not.toBeNull();
    expect(surfaceTabsBounds).not.toBeNull();
    expect(surfaceTabsBounds!.x + surfaceTabsBounds!.width).toBeLessThanOrEqual(closeBounds!.x);
    expect(
        Math.abs(
            surfaceTabsBounds!.y +
                surfaceTabsBounds!.height / 2 -
                (closeBounds!.y + closeBounds!.height / 2)
        )
    ).toBeLessThanOrEqual(1);
    await dialog.getByRole('tab', { name: 'Palette Proof' }).click();
    expect(calibrationDialogBounds).not.toBeNull();
    await expect
        .poll(async () => (await dialog.boundingBox())?.width ?? 0)
        .toBeGreaterThan(calibrationDialogBounds!.width + 300);
    const panel = dialog.getByTestId('palette-proof-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByLabel('Target 1', { exact: false })).toBeVisible();
    await expect(page.getByLabel('A1', { exact: true })).toBeVisible();

    await dialog.getByRole('combobox', { name: 'Palette Proof target count' }).click();
    await page.getByRole('option', { name: '3', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'Palette Proof candidate count' }).click();
    await page.getByRole('option', { name: '2', exact: true }).click();
    await expect(panel.getByText('20 x 28 mm / 3 targets / 2 candidates')).toBeVisible();
    await panel.getByRole('button', { name: 'Choose from image', exact: true }).click();
    await expect(panel).toHaveAttribute('data-screen', 'target-selection');
    const targetImage = panel.getByTestId('palette-proof-target-image');
    await expect(targetImage).toBeVisible();
    const originalModeButton = panel.getByRole('button', {
        name: 'Original image',
        exact: true,
    });
    const fittedModeButton = panel.getByRole('button', {
        name: 'Fitted / achievable',
        exact: true,
    });
    await expect(originalModeButton).toHaveAttribute('aria-pressed', 'true');
    const keyboardTargetGroup = panel.getByRole('group', {
        name: 'Available image target colors',
    });
    const firstKeyboardTarget = keyboardTargetGroup.getByRole('button').first();
    await expect(firstKeyboardTarget).toHaveAttribute('aria-pressed', 'false');
    const canvasHash = () =>
        targetImage.evaluate((canvas) => {
            const targetCanvas = canvas as HTMLCanvasElement;
            const context = targetCanvas.getContext('2d');
            const data = context?.getImageData(0, 0, targetCanvas.width, targetCanvas.height).data;
            if (!data) return 0;
            let hash = 0;
            for (let offset = 0; offset < data.length; offset += 97) {
                hash = Math.imul(hash ^ data[offset], 16_777_619);
            }
            return hash;
        });
    const originalImageHash = await canvasHash();
    await fittedModeButton.click();
    await expect(fittedModeButton).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(canvasHash).not.toBe(originalImageHash);
    const targetImageBounds = await targetImage.boundingBox();
    expect(targetImageBounds).not.toBeNull();
    await targetImage.click({
        position: {
            x: targetImageBounds!.width / 2,
            y: targetImageBounds!.height / 2,
        },
    });
    const prioritizedTarget = panel
        .getByTestId('palette-proof-selected-targets')
        .locator('[data-selected-target-id]')
        .first();
    await expect(prioritizedTarget).toBeVisible();
    const prioritizedTargetId = await prioritizedTarget.getAttribute('data-selected-target-id');
    expect(prioritizedTargetId).not.toBeNull();
    await page.screenshot({ path: testInfo.outputPath('palette-proof-target-selection.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await page.screenshot({
        path: testInfo.outputPath('palette-proof-target-selection-mobile.png'),
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await panel.getByRole('button', { name: 'Use 1 chosen + 2 smart', exact: true }).click();
    await expect(panel).toHaveAttribute('data-screen', 'proof');
    await expect(panel.getByTestId('palette-proof-target-summary')).toContainText(
        'Fitted / achievable · 1 chosen / 2 smart'
    );
    await expect
        .poll(() =>
            panel
                .locator('[data-target-mapping-id]')
                .evaluateAll((rows) =>
                    rows.map((row) => row.getAttribute('data-target-mapping-id'))
                )
        )
        .toContain(prioritizedTargetId);

    await dialog.getByRole('combobox', { name: 'Palette Proof target count' }).click();
    await page.getByRole('option', { name: '5', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'Palette Proof candidate count' }).click();
    await page.getByRole('option', { name: '5', exact: true }).click();
    await expect(panel.getByText('44 x 44 mm / 5 targets / 5 candidates')).toBeVisible();
    const firstProofRow = panel.getByTestId('palette-proof-map-target-1');
    await expect(firstProofRow.getByLabel('A1', { exact: true })).toBeVisible();
    await expect(firstProofRow.getByLabel('B1', { exact: true })).toBeVisible();
    await expect(firstProofRow.getByLabel('A2', { exact: true })).toHaveCount(0);
    const firstProofTargetIds = await panel
        .locator('[data-target-mapping-id]')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-target-mapping-id')));
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('palette-proof-desktop.png') });

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-palette-proof').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^kromacut-palette-proof-.+\.3mf$/);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const zip = await JSZip.loadAsync(await readFile(downloadPath!));
    expect(zip.file('Metadata/palette-proof.json')).not.toBeNull();
    expect(zip.file('Metadata/palette-proof-instructions.txt')).not.toBeNull();
    expect(await zip.file('Metadata/palette-proof-instructions.txt')!.async('string')).toContain(
        'Target color source: Fitted / achievable'
    );
    await expect(panel.getByTestId('palette-proof-size-controls')).toHaveCount(0);
    await expect(panel.getByTestId('palette-proof-target-summary')).toHaveCount(0);
    await expect(dialog.getByRole('combobox', { name: 'Palette Proof target count' })).toHaveCount(
        0
    );
    await expect(
        dialog.getByRole('combobox', { name: 'Palette Proof candidate count' })
    ).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Choose from image', exact: true })).toHaveCount(
        0
    );

    await dialog.getByRole('button', { name: 'Delete Palette Proof' }).click();
    await expect(
        dialog.getByText(
            'Delete this incomplete proof and all of its results? This removes it from appearance calibration.'
        )
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('palette-proof-delete-confirm.png') });
    await dialog.getByRole('button', { name: 'Delete proof', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Delete Palette Proof' })).toHaveCount(0);
    expect(
        await page.evaluate(() => {
            const profiles = JSON.parse(
                localStorage.getItem('kromacut.autopaint.profiles') ?? '[]'
            );
            return profiles[0]?.appearance?.proofs?.length;
        })
    ).toBe(0);
    await expect(panel.getByTestId('palette-proof-size-controls')).toBeVisible();
    await expect(panel.getByTestId('palette-proof-target-summary')).toBeVisible();

    const replacementDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-palette-proof').click();
    await replacementDownloadPromise;

    const savedProofId = await panel.getAttribute('data-proof-id');
    expect(savedProofId).not.toBeNull();
    await expect(panel.getByTestId('palette-proof-size-controls')).toHaveCount(0);
    await expect(panel.getByTestId('palette-proof-target-summary')).toHaveCount(0);
    const savedProofDownload = dialog.getByTestId('download-palette-proof');
    await expect(savedProofDownload).toBeEnabled();
    const savedProofDownloadPromise = page.waitForEvent('download');
    await savedProofDownload.click();
    const savedProofFile = await savedProofDownloadPromise;
    expect(savedProofFile.suggestedFilename()).toContain(savedProofId!.slice(-8));

    await dialog.getByRole('tab', { name: /Results/ }).click();
    await expect(dialog.getByText('0/5 targets answered')).toBeVisible();
    await dialog.getByRole('button', { name: 'B1', exact: true }).click();
    await expect(panel).toHaveAttribute('data-proof-id', savedProofId!);
    await expect(dialog.getByText('1/5 targets answered')).toBeVisible();
    const firstMatchQuality = panel.getByTestId('palette-proof-match-quality-1');
    const firstMatchQualitySelect = firstMatchQuality.getByRole('combobox', {
        name: 'Match quality for Target 1',
    });
    await expect(firstMatchQualitySelect).toHaveText('Best available');
    await dialog.getByRole('button', { name: 'C1', exact: true }).click();
    await firstMatchQualitySelect.click();
    await page.getByRole('option', { name: 'Dead on', exact: true }).click();
    await expect(firstMatchQualitySelect).toHaveText('Dead on');
    for (let column = 2; column <= 5; column++) {
        await dialog
            .getByTestId(`palette-proof-result-column-${column}`)
            .getByRole('button', { name: 'None', exact: true })
            .click();
    }
    await expect(dialog.getByText('5/5 targets answered')).toBeVisible();
    await dialog.getByRole('button', { name: 'Complete results', exact: true }).click();
    await expect(dialog.getByText('Complete', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Edit results', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete Palette Proof' })).toBeVisible();

    const newTargetsButton = dialog.getByRole('button', { name: 'New targets', exact: true });
    await expect(newTargetsButton).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('palette-proof-completed.png') });
    await newTargetsButton.click();
    await expect(panel).toHaveAttribute('data-screen', 'target-selection');
    await expect(panel.getByTestId('palette-proof-target-image')).toBeVisible();
    await expect(
        panel.getByRole('button', { name: 'Fitted / achievable', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
        dialog.getByRole('combobox', { name: 'Palette Proof target count' })
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Back to Palette Proof', exact: true }).click();

    await dialog.getByRole('combobox', { name: 'Palette Proof record' }).click();
    await expect(page.getByText('Target set 1 / 1 round', { exact: true })).toBeVisible();
    await expect(page.getByText('Target set 2 / new', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('palette-proof-grouped-selector.png') });
    await page.getByRole('option', { name: /^Set 2 \/ New targets \/ not saved$/ }).click();
    await expect(dialog.getByRole('tab', { name: 'Proof map' })).toHaveAttribute(
        'data-state',
        'active'
    );
    await expect(panel.getByTestId('palette-proof-size-controls')).toBeVisible();
    await expect(panel.getByTestId('palette-proof-target-summary')).toBeVisible();
    const nextProofTargetIds = await panel
        .locator('[data-target-mapping-id]')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-target-mapping-id')));
    expect(nextProofTargetIds).not.toEqual(firstProofTargetIds);

    await dialog.getByRole('combobox', { name: 'Palette Proof record' }).click();
    await page.getByRole('option', { name: /^Set 1 \/ Initial \// }).click();
    await dialog.getByRole('tab', { name: /Results/ }).click();

    const storedAppearance = await page.evaluate(() => {
        const profiles = JSON.parse(localStorage.getItem('kromacut.autopaint.profiles') ?? '[]');
        return profiles[0]?.appearance;
    });
    expect(storedAppearance.schemaVersion).toBe(1);
    expect(storedAppearance.proofs).toHaveLength(1);
    expect(storedAppearance.proofs[0].proof.targetColorMode).toBe('fitted');
    expect(storedAppearance.targetJudgments).toHaveLength(5);
    expect(storedAppearance.targetJudgments[0].closestCellIds).toEqual(['B1', 'C1']);
    expect(storedAppearance.targetJudgments[0].matchQuality).toBe('exact');
    expect(storedAppearance.viewingSessions[0].status).toBe('complete');

    const continueTargetsButton = dialog.getByRole('button', {
        name: 'Continue targets',
        exact: true,
    });
    await expect(continueTargetsButton).toBeEnabled();
    await expect(continueTargetsButton).toHaveAttribute(
        'title',
        'Keep these targets and test nearby untried challengers'
    );
    await continueTargetsButton.click();
    await expect(dialog.getByRole('tab', { name: 'Proof map' })).toHaveAttribute(
        'data-state',
        'active'
    );
    await expect(panel.getByTestId('palette-proof-continuation-guidance')).toContainText(
        'The proof was reduced to 4 candidates per target'
    );
    await expect(dialog.getByRole('combobox', { name: 'Palette Proof record' })).toContainText(
        'Set 1 / Continuation 1 / not saved'
    );
    await expect(dialog.getByTestId('download-palette-proof')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    const bounds = await panel.boundingBox();
    const downloadBounds = await dialog.getByTestId('download-palette-proof').boundingBox();
    expect(bounds).not.toBeNull();
    expect(downloadBounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(downloadBounds!.x).toBeGreaterThanOrEqual(bounds!.x);
    expect(downloadBounds!.x + downloadBounds!.width).toBeLessThanOrEqual(
        bounds!.x + bounds!.width
    );
    const dialogZIndex = await dialog.evaluate((element) =>
        Number.parseInt(getComputedStyle(element).zIndex, 10)
    );
    const previewToolbarZIndex = await page
        .getByTestId('preview-render-mode-trigger')
        .evaluate((element) =>
            Number.parseInt(getComputedStyle(element.parentElement!).zIndex, 10)
        );
    expect(dialogZIndex).toBeGreaterThan(previewToolbarZIndex);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('palette-proof-results-mobile.png') });
});
