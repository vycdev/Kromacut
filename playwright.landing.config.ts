import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Keep landing checks isolated from any app the user already has running.
export default defineConfig({
    ...base,
    testMatch: ['landing.spec.ts', 'sticky-mobile-cta.spec.ts'],
    use: { ...base.use, baseURL: 'http://127.0.0.1:5184' },
    webServer: {
        command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 5184 --strictPort',
        url: 'http://127.0.0.1:5184',
        reuseExistingServer: false,
        timeout: 180_000,
    },
});
