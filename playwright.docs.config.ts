import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Isolate documentation QA from a user's running dev app and its saved data.
export default defineConfig({
    ...base,
    testMatch: 'docs.spec.ts',
    use: { ...base.use, baseURL: 'http://127.0.0.1:5182' },
    webServer: {
        command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 5182 --strictPort',
        url: 'http://127.0.0.1:5182',
        reuseExistingServer: false,
        timeout: 180_000,
    },
});
