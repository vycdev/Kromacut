import { test, chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const workflows = [
    ['threshold-ui'],
    ['threshold-order-ui'],
    ['palette-cache-ui'],
    ['filament-recommender-ui'],
    ['palette-count-shortcuts-ui'],
    ['nozzle-preview-ui'],
    ['nozzle-appearance-ui'],
    ['nozzle-patch-ui'],
    ['project-ui', 'project-cancel-ui'],
];
for (const scripts of workflows) {
    test(`image workflow: ${scripts[0]} @smoke`, async ({ baseURL }, info) => {
        test.setTimeout(180_000);
        for (const script of scripts) {
            const result = await run(process.execPath, [`scripts/test-${script}.mjs`], {
                env: {
                    ...process.env,
                    KROMACUT_TEST_URL: baseURL,
                    KROMACUT_ARTIFACT_DIR: info.outputPath('artifacts'),
                    CHROME_EXECUTABLE_PATH:
                        process.env.CHROME_EXECUTABLE_PATH ?? chromium.executablePath(),
                },
                timeout: 150_000,
                maxBuffer: 2 * 1024 * 1024,
            });
            console.log(result.stdout);
        }
    });
}
