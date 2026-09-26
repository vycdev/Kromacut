import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Exercise built terms pages without reusing or disturbing the user's app.
export default defineConfig({
    ...base,
    testMatch: 'terms.spec.ts',
    timeout: 60_000,
    use: { ...base.use, baseURL: 'http://127.0.0.1:5187' },
    webServer: {
        command: 'npm run build && node tests/helpers/pagesPreviewServer.mjs',
        env: { PORT: '5187' },
        url: 'http://127.0.0.1:5187',
        reuseExistingServer: false,
        timeout: 180_000,
    },
});
