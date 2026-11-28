import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createServer, type Plugin } from 'vite';

// A Layer Height or First Layer Height change resets the color heights as the 3D mode guide
// documents (#179, #180), instead of re-rounding the old heights onto the new grid.

async function openTwoColorImage(page: Page) {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem(
            'kromacut.autopaint.v1',
            JSON.stringify({ schemaVersion: 2, filaments: [], paintMode: 'manual' })
        );
    });
    await page.goto('/app');
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 8, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(8, 0, 8, 16);
        return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('image-file-input').setInputFiles({
        name: 'two-colors.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
    });
    const mode3d = page.getByRole('button', { name: '3D', exact: true });
    const mode2d = page.getByRole('button', { name: '2D', exact: true });
    await mode3d.click();
    const swatches = page.locator('[aria-label^="Color swatch"]');
    const firstHeight = swatches.nth(0).locator('..').getByRole('slider');
    const secondHeight = swatches.nth(1).locator('..').getByRole('slider');
    return { mode2d, mode3d, swatches, firstHeight, secondHeight };
}

async function setPrintSetting(page: Page, testId: string, value: string) {
    await page.getByTestId(testId).fill(value);
    await page.getByTestId(testId).press('Tab');
}

async function setSteps(slider: ReturnType<Page['locator']>, steps: number, expected: string) {
    await slider.press('Home');
    for (let i = 0; i < steps; i++) await slider.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', expected);
}

test('@smoke first layer change with colors shown resets an off-grid first color', async ({
    page,
}) => {
    const { firstHeight } = await openTwoColorImage(page);
    await setPrintSetting(page, 'print-layer-height', '0.08');
    await setPrintSetting(page, 'print-first-layer-height', '0.20');
    await setSteps(firstHeight, 4, '0.52');
    await setPrintSetting(page, 'print-first-layer-height', '0.25');
    // Not 0.49: 0.52 re-rounded onto the 0.25 + n × 0.08 grid (#179).
    await expect(firstHeight).toHaveAttribute('aria-valuenow', '0.25');
});

test('@smoke layer height change with colors shown resets every color', async ({ page }) => {
    const { firstHeight, secondHeight } = await openTwoColorImage(page);
    // Defaults: 0.12 mm layers, 0.20 mm first layer, second color at 0.12 mm.
    await expect(secondHeight).toHaveAttribute('aria-valuenow', '0.12');
    await setPrintSetting(page, 'print-layer-height', '0.08');
    // Not 0.16: 0.12 re-rounded onto the 0.08 grid (#179).
    await expect(secondHeight).toHaveAttribute('aria-valuenow', '0.08');
    await expect(firstHeight).toHaveAttribute('aria-valuenow', '0.2');
});

for (const setting of ['print-layer-height', 'print-first-layer-height'] as const) {
    test(`@smoke ${setting} change without an image resets the restored colors`, async ({
        page,
    }) => {
        const { mode2d, mode3d, swatches, firstHeight, secondHeight } =
            await openTwoColorImage(page);
        await setPrintSetting(page, 'print-layer-height', '0.08');
        await setPrintSetting(page, 'print-first-layer-height', '0.20');
        await setSteps(firstHeight, 4, '0.52');
        await setSteps(secondHeight, 2, '0.24');
        await mode2d.click();
        const resize = page.getByTestId('image-resize-percent-slider').locator('..').locator('..');
        await resize.getByRole('button', { name: 'Apply', exact: true }).click();
        await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText('8x8');
        await page.getByRole('button', { name: 'Remove image', exact: true }).click();
        await mode3d.click();
        await expect(swatches).toHaveCount(0);
        if (setting === 'print-layer-height') await setPrintSetting(page, setting, '0.12');
        else await setPrintSetting(page, setting, '0.25');
        await mode2d.click();
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(page.getByText('Current', { exact: true }).locator('..')).toContainText(
            '16x16'
        );
        await mode3d.click();
        await expect(swatches).toHaveCount(2);
        if (setting === 'print-layer-height') {
            // Not 0.56 (0.20 + 3 × 0.12) and 0.24 (2 × 0.12) re-rounded from the old heights (#180).
            await expect(firstHeight).toHaveAttribute('aria-valuenow', '0.2');
            await expect(secondHeight).toHaveAttribute('aria-valuenow', '0.12');
        } else {
            // First Layer Height only resets the first color; the second keeps 0.24.
            await expect(firstHeight).toHaveAttribute('aria-valuenow', '0.25');
            await expect(secondHeight).toHaveAttribute('aria-valuenow', '0.24');
        }
    });
}

// Mounts useColorSlicing with and without StrictMode from a Vite dev server, so React replays the
// mount effects. Saved black/white heights are given with the swatches in reversed storage order.
const strictModePage = `
import { StrictMode, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useColorSlicing } from '/src/hooks/useColorSlicing.ts';

const black = { hex: '#000000', a: 255 };
const white = { hex: '#ffffff', a: 255 };
const persisted = {
    colorSliceHeights: [0.52, 0.16],
    colorOrder: [0, 1],
    filteredSwatches: [black, white],
};
const swatches = [white, black];
window.heights = {};

function Probe({ id }) {
    const { filtered, colorSliceHeights } = useColorSlicing({
        swatches,
        layerHeight: 0.08,
        slicerFirstLayerHeight: 0.2,
        persisted,
    });
    useEffect(() => {
        window.heights[id] = Object.fromEntries(
            filtered.map((swatch, index) => [swatch.hex, colorSliceHeights[index]])
        );
    });
    return null;
}

for (const strict of [true, false]) {
    const root = document.body.appendChild(document.createElement('div'));
    const probe = createElement(Probe, { id: strict ? 'strict' : 'plain' });
    createRoot(root).render(strict ? createElement(StrictMode, null, probe) : probe);
}
`;

function strictModePagePlugin(): Plugin {
    return {
        name: 'strict-mode-color-slicing',
        resolveId: (id) => (id === '/strict-mode-color-slicing.js' ? id : undefined),
        load: (id) => (id === '/strict-mode-color-slicing.js' ? strictModePage : undefined),
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                if (request.url !== '/') return next();
                response.setHeader('Content-Type', 'text/html');
                response.end(
                    '<!doctype html><script type="module" src="/strict-mode-color-slicing.js"></script>'
                );
            });
        },
    };
}

test('@smoke StrictMode replay keeps saved color heights on their colors (#182)', async ({
    page,
}) => {
    const server = await createServer({
        appType: 'custom',
        cacheDir: 'dist/.vite-e2e-strict-mode-cache',
        configFile: false,
        logLevel: 'error',
        mode: 'development',
        optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client'] },
        plugins: [strictModePagePlugin()],
        resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
        root: process.cwd(),
        server: { host: '127.0.0.1', port: 0, hmr: false },
    });
    try {
        await server.listen();
        const pageErrors: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        await page.goto(server.resolvedUrls!.local[0]);
        const heights = () => page.evaluate(() => (window as { heights?: object }).heights);
        // The replay used to give black/white 0.20/0.56 mm.
        const saved = { '#000000': 0.52, '#ffffff': 0.16 };
        await expect.poll(heights).toEqual({ strict: saved, plain: saved });
        // Let any pending effects run, then check that nothing replaced the heights.
        await page.evaluate(() => new Promise((done) => setTimeout(done, 200)));
        expect(await heights()).toEqual({ strict: saved, plain: saved });
        expect(pageErrors).toEqual([]);
    } finally {
        await server.close();
    }
});
