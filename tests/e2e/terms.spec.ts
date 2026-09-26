import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

type TermsNotice = {
    title: string;
    seoTitle: string;
    description: string;
    intro: string;
    sections: Array<{
        id: string;
        title: string;
        paragraphs: string[];
        links: Array<{ href: string; label: string }>;
    }>;
    contactTitle: string;
    contactDescription: string;
};

const notice = JSON.parse(readFileSync(path.resolve('src/data/termsNotice.json'), 'utf8')) as TermsNotice;
// Keep the complete contact address out of test source as well as public assets.
const contactEmail = ['vycdev', ['gmail', 'com'].join('.')].join('@');
const termsPaths = ['/terms', '/terms/', '/terms/index.html'];

function builtJavaScriptFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) return builtJavaScriptFiles(filename);
        return entry.isFile() && entry.name.endsWith('.js') ? [filename] : [];
    });
}

async function expectTermsPage(page: Page) {
    const terms = page.getByTestId('terms-page');
    await expect(terms).toBeVisible();
    await expect(terms.getByRole('heading', { name: 'Terms & conditions', exact: true, level: 1 }))
        .toHaveAttribute('id', 'terms-heading');
    await expect(terms.getByText(notice.intro, { exact: true })).toBeVisible();
    await expect(page).toHaveTitle('Terms & conditions | Kromacut');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', notice.description);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://kromacut.com/terms');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', notice.seoTitle);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://kromacut.com/terms');
    await expect(page.getByTestId('not-found-page')).toHaveCount(0);
    await expect(page.getByTestId('privacy-page')).toHaveCount(0);
    await expect(page.getByTestId('landing-sticky-cta')).toHaveCount(0);
    await expect(terms).not.toContainText(/\bdraft for review\b|still required before publication/i);
}

async function expectCompleteTermsContent(page: Page) {
    const terms = page.getByTestId('terms-page');
    expect(notice.sections.length).toBeGreaterThanOrEqual(5);
    await expect(terms.getByRole('heading', { level: 2 })).toHaveCount(notice.sections.length + 1);
    for (const section of notice.sections) {
        const rendered = terms.locator(`section[aria-labelledby="${section.id}"]`);
        await expect(rendered.getByRole('heading', { name: section.title, exact: true, level: 2 }))
            .toHaveAttribute('id', section.id);
        for (const paragraph of section.paragraphs) await expect(rendered).toContainText(paragraph);
        for (const link of section.links) {
            await expect(rendered.getByRole('link', { name: link.label, exact: true }))
                .toHaveAttribute('href', link.href);
        }
    }
    const contact = terms.locator('section[aria-labelledby="terms-contact-heading"]');
    await expect(contact.getByRole('heading', { name: 'Questions about these terms', exact: true, level: 2 }))
        .toHaveAttribute('id', 'terms-contact-heading');
    await expect(contact).toContainText(notice.contactDescription);
}

test.describe('public terms and conditions @terms', () => {
    test('route aliases serve static terms content with canonical, indexable metadata', async ({ page }) => {
        for (const pathname of termsPaths) {
            const response = await page.goto(pathname);
            expect(response?.status(), pathname).toBe(200);
            const html = await response!.text();
            expect(html).toMatch(/<h1[^>]*id="terms-heading"[^>]*>Terms &amp; conditions<\/h1>/);
            expect(html).toContain('data-testid="terms-page"');
            expect(html).toContain('<meta name="robots" content="index,follow"');
            expect(html).toContain('<link rel="canonical" href="https://kromacut.com/terms"');
            expect(html.toLowerCase()).not.toContain(contactEmail);
            expect(html).not.toMatch(/mailto:/i);
            await expectTermsPage(page);
            await expectCompleteTermsContent(page);
        }
        const sitemap = await page.request.get('/sitemap.xml');
        expect(sitemap.ok()).toBe(true);
        const xml = await sitemap.text();
        expect(xml.match(/<loc>https:\/\/kromacut\.com\/terms<\/loc>/g)).toHaveLength(1);
        expect(xml).not.toContain('https://kromacut.com/terms/index.html');
    });

    test('table of contents links match every section and reach contact controls', async ({ page }) => {
        await page.goto('/terms');
        await expectTermsPage(page);
        const contents = page.getByRole('navigation', { name: 'On this page' });
        await expect(contents).toBeVisible();
        const links = contents.getByRole('link');
        await expect(links).toHaveCount(notice.sections.length + 1);
        for (const link of await links.all()) {
            const href = await link.getAttribute('href');
            expect(href).toMatch(/^#/);
            await expect(page.locator(href!)).toHaveText(await link.innerText());
        }
        await contents.getByRole('link', { name: notice.contactTitle, exact: true }).click();
        await expect(page.locator('#terms-contact-heading')).toBeInViewport();
        await expect(page.getByRole('button', { name: 'Reveal email address', exact: true })).toBeInViewport();
    });

    test('complete email is absent from generated terms HTML and built JavaScript', async () => {
        const outputDirectory = path.resolve('dist');
        const html = readFileSync(path.join(outputDirectory, 'terms', 'index.html'), 'utf8');
        expect(html.toLowerCase()).not.toContain(contactEmail);
        const files = builtJavaScriptFiles(outputDirectory);
        expect(files.length).toBeGreaterThan(0);
        for (const filename of files) {
            expect(readFileSync(filename, 'utf8').toLowerCase(), path.relative(outputDirectory, filename))
                .not.toContain(contactEmail);
        }
    });

    test('terms and privacy crosslinks work without JavaScript and no active email link leaks', async ({ browser, baseURL }) => {
        const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
        try {
            const page = await context.newPage();
            expect((await page.goto('/terms'))?.status()).toBe(200);
            await expectTermsPage(page);
            await expectCompleteTermsContent(page);
            await expect(page.locator('body')).not.toContainText(contactEmail);
            await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
            await expect(page.getByTestId('terms-page').getByRole('link', { name: 'Open Kromacut', exact: true }))
                .toHaveAttribute('href', '/app');
            await page.getByTestId('terms-page').locator('footer')
                .getByRole('link', { name: 'Privacy & local data', exact: true }).click();
            await expect(page).toHaveURL(/\/privacy$/);
            await expect(page.getByTestId('privacy-page')).toBeVisible();
            await page.getByTestId('privacy-page').locator('footer')
                .getByRole('link', { name: 'Terms & conditions', exact: true }).click();
            await expect(page).toHaveURL(/\/terms$/);
            await expectTermsPage(page);
        } finally {
            await context.close();
        }
    });

    test('keyboard reveal removes its prompt, focuses email, and copy writes the correct address', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.goto('/terms');
        await expectTermsPage(page);
        await expect(page.locator('body')).not.toContainText(contactEmail);
        await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Copy email address', exact: true })).toHaveCount(0);
        const reveal = page.getByRole('button', { name: 'Reveal email address', exact: true });
        await expect(reveal).toHaveAttribute('aria-expanded', 'false');
        await reveal.focus();
        await page.keyboard.press('Enter');
        await expect(reveal).toHaveCount(0);
        await expect(page.getByText('Reveal the email address, then open it in your email app or copy it.', { exact: true }))
            .toHaveCount(0);
        const email = page.getByRole('link', { name: contactEmail, exact: true });
        await expect(email).toHaveAttribute('href', `mailto:${contactEmail}`);
        await expect(email).toBeVisible();
        await expect(email).toBeFocused();
        const copy = page.getByRole('button', { name: 'Copy email address', exact: true });
        await page.keyboard.press('Tab');
        await expect(copy).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('status')).toContainText(/copied/i);
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(contactEmail);
    });

    test('returning users can open terms and use homepage, docs, editor, and privacy links', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('kromacut.has-launched.v1', 'v1'));
        for (const destination of ['/?landing=1', '/docs/overview', '/app', '/privacy']) {
            await page.goto('/terms');
            await expectTermsPage(page);
            const recovery = page.getByTestId('terms-page').locator(`a[href="${destination}"]`).first();
            await recovery.click();
            const url = new URL(page.url());
            expect(`${url.pathname}${url.search}`).toBe(destination);
            if (destination === '/?landing=1') {
                await expect(page.getByTestId('landing-page')).toBeVisible();
                await expect(page.getByTestId('landing-terms-link')).toHaveAttribute('href', '/terms');
            } else if (destination === '/app') {
                await expect(page.getByTestId('image-file-input')).toBeAttached();
            } else if (destination === '/privacy') {
                await expect(page.getByTestId('privacy-page')).toBeVisible();
                await expect(page).toHaveTitle('Privacy & local data | Kromacut');
                await page.getByTestId('privacy-page').locator('footer')
                    .getByRole('link', { name: 'Terms & conditions', exact: true }).click();
                await expectTermsPage(page);
                continue;
            } else {
                await expect(page.getByRole('article', { name: 'Overview', exact: true })).toBeVisible();
            }
            await expect(page.getByTestId('terms-page')).toHaveCount(0);
        }
    });

    for (const width of [320, 390]) {
        for (const theme of ['light', 'dark'] as const) {
            test(`terms footer navigation and contact fit ${width}px ${theme} screens`, async ({ page }, testInfo) => {
                await page.setViewportSize({ width, height: 844 });
                await page.addInitScript(value => localStorage.setItem('theme', value), theme);
                await page.goto('/?landing=1');
                const landing = page.getByTestId('landing-page');
                await expect(landing).toBeVisible();
                await page.evaluate(() => document.fonts.ready);
                await landing.evaluate(element => { element.scrollTop = element.scrollHeight; });
                await expect.poll(() => landing.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight))
                    .toBeLessThanOrEqual(1);
                const sticky = page.getByTestId('landing-sticky-cta');
                await expect(sticky).toBeVisible();
                const stickyBounds = await sticky.boundingBox();
                expect(stickyBounds).not.toBeNull();
                const footer = page.getByRole('navigation', { name: 'Footer navigation' });
                const footerLinks = footer.getByRole('link');
                await expect(footerLinks).toHaveCount(7);
                for (const link of await footerLinks.all()) {
                    await expect(link).toBeInViewport({ ratio: 1 });
                    const bounds = await link.boundingBox();
                    expect(bounds).not.toBeNull();
                    expect(bounds!.height).toBeGreaterThanOrEqual(44);
                    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(stickyBounds!.y);
                    expect(await link.evaluate(element => {
                        const box = element.getBoundingClientRect();
                        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
                    })).toBe(true);
                }
                const termsLink = footer.getByTestId('landing-terms-link');
                await expect(termsLink).toHaveAccessibleName('Terms');
                await expect(termsLink).toHaveAttribute('href', '/terms');
                await footer.getByTestId('landing-privacy-link').focus();
                await page.keyboard.press('Tab');
                await expect(termsLink).toBeFocused();
                await page.screenshot({ path: testInfo.outputPath(`terms-footer-${width}-${theme}.png`) });
                await page.keyboard.press('Enter');
                await expect(page).toHaveURL(/\/terms$/);
                await expectTermsPage(page);
                await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark')))
                    .toBe(theme === 'dark');
                await page.evaluate(() => document.fonts.ready);
                expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
                expect(await page.getByTestId('terms-page').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(width);
                await page.screenshot({ path: testInfo.outputPath(`terms-${width}-${theme}.png`) });
                await page.getByRole('navigation', { name: 'On this page' })
                    .getByRole('link', { name: notice.contactTitle, exact: true }).click();
                await expect(page.locator('#terms-contact-heading')).toBeInViewport();
                await page.getByRole('button', { name: 'Reveal email address', exact: true }).click();
                await expect(page.getByRole('button', { name: 'Reveal email address', exact: true })).toHaveCount(0);
                await expect(page.getByRole('link', { name: contactEmail, exact: true })).toBeInViewport({ ratio: 1 });
                await expect(page.getByRole('button', { name: 'Copy email address', exact: true })).toBeInViewport({ ratio: 1 });
                expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
                expect(await page.getByTestId('terms-page').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(width);
                await expect(page.getByTestId('landing-sticky-cta')).toHaveCount(0);
                await page.screenshot({ path: testInfo.outputPath(`terms-contact-${width}-${theme}.png`) });
            });
        }
    }
});
