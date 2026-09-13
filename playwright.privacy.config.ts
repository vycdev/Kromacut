import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Exercise built privacy pages without reusing or disturbing the user's app.
export default defineConfig({
    ...base,
    testMatch: 'privacy.spec.ts',
    timeout: 60_000,
    use: { ...base.use, baseURL: 'http://127.0.0.1:5185' },
    webServer: {
        command: 'npm run build && node tests/helpers/pagesPreviewServer.mjs',
        env: { PORT: '5185' },
        url: 'http://127.0.0.1:5185',
        reuseExistingServer: false,
        timeout: 180_000,
    },
});
