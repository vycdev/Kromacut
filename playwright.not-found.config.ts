import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Exercise GitHub Pages-style 404 responses without touching a running user app.
export default defineConfig({
    ...base,
    testMatch: 'not-found.spec.ts',
    timeout: 60_000,
    use: { ...base.use, baseURL: 'http://127.0.0.1:5183' },
    webServer: {
        command: 'npm run build && node tests/helpers/pagesPreviewServer.mjs',
        url: 'http://127.0.0.1:5183',
        reuseExistingServer: false,
        timeout: 180_000,
    },
});
