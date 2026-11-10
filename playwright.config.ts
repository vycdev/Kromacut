import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    workers: 1,
    timeout: 20 * 60 * 1000,
    expect: {
        timeout: 30 * 1000,
    },
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: 'http://127.0.0.1:5173',
        acceptDownloads: true,
        actionTimeout: 30 * 1000,
        navigationTimeout: 60 * 1000,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'off',
    },
    webServer: {
        command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 5173 --strictPort',
        url: 'http://127.0.0.1:5173',
        // test:e2e:all never reuses a server, which may be serving another checkout.
        reuseExistingServer: !process.env.CI && !process.env.KROMACUT_E2E_FRESH_SERVERS,
        timeout: 180 * 1000,
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1440, height: 1000 },
                launchOptions: {
                    args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
                },
            },
        },
    ],
});
