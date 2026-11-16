import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
export const appUrl = new URL('app', `${process.env.KROMACUT_TEST_URL ?? 'http://127.0.0.1:5186'}/`)
    .href;
export function artifactPath(name) {
    const directory = path.resolve(
        process.env.KROMACUT_ARTIFACT_DIR ?? 'test-results/image-workflow'
    );
    mkdirSync(directory, { recursive: true });
    return path.join(directory, name);
}
export function launchBrowser() {
    const executablePath =
        process.env.CHROME_EXECUTABLE_PATH ||
        ['/opt/google/chrome/chrome', '/usr/bin/chromium'].find(existsSync);
    return chromium.launch({
        ...(executablePath ? { executablePath } : {}),
        headless: true,
        args: ['--no-sandbox'],
    });
}
