import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: 'i18n.spec.ts',
    workers: 1,
    timeout: 60000,
    expect: { timeout: 15000 },
    use: {
        baseURL: 'http://127.0.0.1:5192',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 5192 --strictPort',
        url: 'http://127.0.0.1:5192',
        // test:e2e:all never reuses a server, which may be serving another checkout.
        reuseExistingServer: !process.env.CI && !process.env.KROMACUT_E2E_FRESH_SERVERS,
        timeout: 60000,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
        },
    ],
});
