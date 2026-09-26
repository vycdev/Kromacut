import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: 'i18n-build.spec.ts',
    workers: 1,
    timeout: 120_000,
    expect: { timeout: 15_000 },
    use: {
        baseURL: 'http://127.0.0.1:5193',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'npm run build && node tests/helpers/pagesPreviewServer.mjs',
        env: { PORT: '5193' },
        url: 'http://127.0.0.1:5193',
        reuseExistingServer: false,
        timeout: 240_000,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
