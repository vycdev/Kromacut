import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const docsDir = path.resolve('src/docs');
const pages = readdirSync(docsDir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
        const raw = readFileSync(path.join(docsDir, file), 'utf8');
        return {
            slug: raw.match(/^slug: (.+)$/m)![1].trim(),
            title: raw.match(/^title: (.+)$/m)![1].trim(),
            images: [...raw.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map((match) => match[1]),
        };
    });

for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
]) {
    test(`@docs all guides and illustrations render at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        for (const doc of pages) {
            await page.goto(`/docs/${doc.slug}`);
            const article = page.getByRole('article', { name: doc.title, exact: true });
            await expect(article).toBeVisible();
            await expect(
                page
                    .getByRole('navigation', { name: 'Documentation', exact: true })
                    .locator(`a[href="/docs/${doc.slug}"]`)
            ).toHaveAttribute('aria-current', 'page');
            await expect(article.locator('img')).toHaveCount(doc.images.length);
            for (const alt of doc.images) {
                const illustration = article.getByRole('img', { name: alt, exact: true });
                await illustration.scrollIntoViewIfNeeded();
                await expect(illustration).toBeVisible();
                await expect
                    .poll(() =>
                        illustration.evaluate(
                            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0
                        )
                    )
                    .toBe(true);
                await expect(illustration.locator('..')).toHaveAttribute('target', '_blank');
                const bounds = await illustration.boundingBox();
                expect(bounds!.width).toBeLessThanOrEqual(viewport.width);
                expect(bounds!.x).toBeGreaterThanOrEqual(0);
                if (viewport.width === 1440) {
                    await illustration.screenshot({
                        path: test.info().outputPath(`${doc.slug}-${doc.images.indexOf(alt)}.png`),
                    });
                }
            }
            expect(
                await page.evaluate(() => document.documentElement.scrollWidth)
            ).toBeLessThanOrEqual(viewport.width);
            await article.locator('h1').scrollIntoViewIfNeeded();
            await page.screenshot({ path: test.info().outputPath(`${doc.slug}-page.png`) });
        }
    });
}

test('@docs direct anchor and keyboard navigation work', async ({ page }) => {
    await page.goto('/docs/generating-exporting-output#print-instructions');
    await expect(page.locator('#print-instructions')).toBeInViewport();
    const nav = page.getByRole('navigation', { name: 'Documentation', exact: true });
    const target = nav.locator('a[href="/docs/3d-mode"]');
    await target.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/docs\/3d-mode$/);
    await expect(page.getByRole('article', { name: '3D Mode', exact: true })).toBeVisible();
});

test('@docs mobile navigation leaves room to read and closes after selection', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/docs/3d-mode');
    const contents = page.getByRole('button', { name: 'Contents', exact: true });
    const headings = page.getByRole('button', { name: 'On This Page', exact: true });
    await expect(contents).toHaveAttribute('aria-expanded', 'false');
    await expect(headings).toHaveAttribute('aria-expanded', 'false');
    expect((await page.getByRole('main').boundingBox())!.height).toBeGreaterThan(550);

    await contents.click();
    await expect(contents).toHaveAttribute('aria-expanded', 'true');
    await page
        .getByRole('navigation', { name: 'Documentation', exact: true })
        .locator('a[href="/docs/flat-paint"]')
        .click();
    await expect(page).toHaveURL(/\/docs\/flat-paint$/);
    await expect(contents).toHaveAttribute('aria-expanded', 'false');

    await headings.click();
    await expect(headings).toHaveAttribute('aria-expanded', 'true');
    await page
        .getByRole('navigation', { name: 'Current document headings', exact: true })
        .locator('a[href="/docs/flat-paint#face-up-no-clear-layer"]')
        .click();
    await expect(headings).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#face-up-no-clear-layer')).toBeInViewport();
});

test('@docs static pages keep every guide and illustration without JavaScript', async ({
    browser,
    baseURL,
}) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
    try {
        const page = await context.newPage();
        for (const doc of pages) {
            const response = await page.goto(`/docs/${doc.slug}`);
            expect(response?.ok()).toBe(true);
            const article = page.locator('.seo-doc-page article');
            await expect(
                article.getByRole('heading', { name: doc.title, exact: true, level: 1 })
            ).toBeVisible();
            await expect(article.locator('img')).toHaveCount(doc.images.length);
            for (const alt of doc.images) {
                const illustration = article.getByRole('img', { name: alt, exact: true });
                await illustration.scrollIntoViewIfNeeded();
                await expect
                    .poll(() =>
                        illustration.evaluate(
                            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0
                        )
                    )
                    .toBe(true);
                const source = await illustration.getAttribute('src');
                await expect(illustration.locator('..')).toHaveAttribute('href', source!);
                await expect(illustration.locator('..')).toHaveAttribute('target', '_blank');
            }
        }
    } finally {
        await context.close();
    }
});
