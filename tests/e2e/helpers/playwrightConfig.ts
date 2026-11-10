import { test } from '@playwright/test';
import path from 'node:path';

// Area specs rely on their own config's server (Vite dev, Vite preview, or the Pages-style 404
// server) and port. Under another config they fail in misleading ways, so stop them up front.
export function requirePlaywrightConfig(configFile: string, script: string) {
    // Playwright requires an object pattern for the fixtures argument.
    // eslint-disable-next-line no-empty-pattern
    test.beforeAll(({}, workerInfo) => {
        const actual = path.basename(workerInfo.config.configFile ?? 'no config file');
        if (actual !== configFile) {
            throw new Error(
                `This spec only runs with ${configFile}, not ${actual}. Use \`npm run ${script}\`.`
            );
        }
    });
}
