import { appUrl, artifactPath, launchBrowser } from './custom-ui-helpers.mjs';
import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const browser = await launchBrowser();
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(appUrl);
    await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeEnabled();
    const hash = () =>
        page
            .getByTestId('main-image-preview')
            .evaluate((c) => c.toDataURL())
            .then((s) => createHash('sha256').update(s).digest('hex'));
    const before = await hash();
    const file = {
        name: 'Roundtrip Session.kromacut',
        mimeType: 'application/zip',
        buffer: readFileSync(artifactPath('project-roundtrip-tested.kromacut')),
    };
    await page.getByTestId('project-file-input').setInputFiles(file);
    const dialog = page.getByRole('dialog', { name: 'Open project', exact: true });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await hash(), before);
    await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Kromacut');
    await page.getByTestId('project-file-input').setInputFiles(file);
    await dialog.getByRole('button', { name: 'Open project', exact: true }).click();
    await expect(page.getByRole('button', { name: '3D', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
    );
    await page.getByRole('button', { name: '2D', exact: true }).click();
    await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Roundtrip Session');
    await page.getByRole('button', { name: 'Palette', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: artifactPath('project-session-tested.png') });
    console.log(
        'PASS: cancelling Open retains image and session name; choosing the same file again restores it.'
    );
} finally {
    await browser.close();
}
