import { chromium } from '@playwright/test';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = path.join(root, 'src/assets/diagrams');
const output = path.join(root, 'test-results/docs-illustrations');
const files = readdirSync(directory).filter((file) => /^\d{2}_.*\.svg$/.test(file));
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const failures = [];
try {
    for (const file of files) {
        const svg = readFileSync(path.join(directory, file), 'utf8');
        await page.setContent(
            `<style>body{margin:0;background:#121923}svg{display:block}</style>${svg}`
        );
        await page.evaluate(() => document.fonts.ready);
        const issues = await page.evaluate(() => {
            const svg = document.querySelector('svg');
            const { width, height } = svg.viewBox.baseVal;
            return [...svg.querySelectorAll('text')].flatMap((text) => {
                const box = text.getBBox();
                const size = parseFloat(getComputedStyle(text).fontSize);
                const errors = [];
                if (size < 18) errors.push(`small label (${size}px)`);
                if (
                    box.x < 0 ||
                    box.y < 0 ||
                    box.x + box.width > width ||
                    box.y + box.height > height
                ) {
                    errors.push('text outside viewBox');
                }
                return errors.map((error) => `${error}: ${text.textContent}`);
            });
        });
        failures.push(...issues.map((issue) => `${file}: ${issue}`));
        await page
            .locator('svg')
            .screenshot({ path: path.join(output, file.replace(/\.svg$/, '.png')) });
    }
    // Contact sheets supplement the per-image readability and clipping checks.
    for (let start = 0; start < files.length; start += 8) {
        const cards = files.slice(start, start + 8).map((file) => {
            const encoded = Buffer.from(readFileSync(path.join(directory, file))).toString(
                'base64'
            );
            return `<section><p>${file}</p><img src="data:image/svg+xml;base64,${encoded}"></section>`;
        });
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.setContent(
            `<style>body{margin:0;padding:16px;background:#0c111b;color:white;font:16px Arial;display:grid;grid-template-columns:1fr 1fr;gap:16px}section{min-width:0}p{margin:4px 0}img{width:100%}</style>${cards.join('')}`
        );
        await page
            .locator('img')
            .evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
        await page.screenshot({
            path: path.join(output, `contact-${start / 8 + 1}.png`),
            fullPage: true,
        });
    }
} finally {
    await browser.close();
}
if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
} else {
    console.log(`Verified ${files.length} SVG illustrations. Renders: ${output}`);
}
