import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.KROMACUT_E2E_PORT ?? 5173);
const baseURL = `http://127.0.0.1:${port}`;

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
        baseURL,
        acceptDownloads: true,
        actionTimeout: 30 * 1000,
        navigationTimeout: 60 * 1000,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'off',
    },
    webServer: {
        command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
        url: baseURL,
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
