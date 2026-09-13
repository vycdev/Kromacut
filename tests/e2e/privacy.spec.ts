import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Do not accidentally publish the complete contact address in the test source, either.
const contactEmail = ['vycdev', ['gmail', 'com'].join('.')].join('@');
const privacyPaths = ['/privacy', '/privacy/', '/privacy/index.html'];
const removedEditorialText = [
    'Draft for review',
    'Operator identification and legal disclosures are not finalized',
    'This is not a completed privacy policy',
    'Still required before publication',
    'Resolve how the actual operator will be identified and contacted.',
    'Confirm provider roles, legal bases',
    'Complete the applicable rights and complaint information',
];

function builtJavaScriptFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) return builtJavaScriptFiles(filename);
        return entry.isFile() && entry.name.endsWith('.js') ? [filename] : [];
    });
}

async function expectPrivacyNotice(page: Page) {
    const privacy = page.getByTestId('privacy-page');
    await expect(privacy).toBeVisible();
    await expect(privacy.getByRole('heading', { name: 'Privacy & local data', exact: true, level: 1 })).toBeVisible();
    await expect(privacy.getByText('Your images are processed on your device. Kromacut does not upload them to an image-processing server.', { exact: true }))
        .toBeVisible();
    await expect(page.getByTestId('privacy-draft-notice')).toHaveCount(0);
    await expect(privacy.locator('#privacy-review-heading')).toHaveCount(0);
    await expect(privacy).not.toContainText(/\bdraft\b/i);
    for (const copy of removedEditorialText) await expect(privacy).not.toContainText(copy);
    await expect(page).toHaveTitle('Privacy & local data | Kromacut');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://kromacut.com/privacy');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/);
    await expect(page.locator('meta[name="description"]')).not.toHaveAttribute('content', /\bdraft\b/i);
    await expect(page.getByTestId('not-found-page')).toHaveCount(0);
    await expect(page.getByTestId('landing-sticky-cta')).toHaveCount(0);
    await expect(privacy.locator('section[aria-labelledby="email-retention"]'))
        .toContainText('reviewed every six months');
    await expect(privacy.locator('section[aria-labelledby="email-retention"]'))
        .toContainText('manual review, not an automatic six-month expiry');
    await expect(privacy.locator('section[aria-labelledby="your-rights"]'))
        .toContainText('without undue delay and within one month');
    await expect(privacy.locator('section[aria-labelledby="your-rights"]'))
        .toContainText('up to two further months');
    await expect(privacy.locator('section[aria-labelledby="network-requests"]'))
        .toContainText('Opening the app does not contact Google Fonts.');
}

test.describe('public privacy notice with footer navigation @privacy', () => {
    test('direct route variants serve static privacy content with canonical, indexable metadata', async ({ page }) => {
        for (const pathname of privacyPaths) {
            const response = await page.goto(pathname);
            expect(response?.status(), pathname).toBe(200);
            const html = await response!.text();
            expect(html).not.toMatch(/privacy-draft-notice|privacy-review-heading/);
            for (const copy of removedEditorialText) expect(html).not.toContain(copy);
            expect(html).toMatch(/<h1[^>]*>[^<]*privacy/i);
            expect(html.toLowerCase()).not.toContain(contactEmail);
            expect(html).not.toMatch(/mailto:/i);
            expect(html).toContain('<meta name="robots" content="index,follow"');
            expect(html).toContain('<link rel="canonical" href="https://kromacut.com/privacy"');
            await expectPrivacyNotice(page);
        }
        const sitemap = await page.request.get('/sitemap.xml');
        expect(sitemap.ok()).toBe(true);
        expect(await sitemap.text()).toContain('<loc>https://kromacut.com/privacy</loc>');
    });

    test('contents links reach the matching sections and contact controls', async ({ page }) => {
        await page.goto('/privacy');
        await expectPrivacyNotice(page);
        const contents = page.getByRole('navigation', { name: 'On this page' });
        await expect(contents).toBeVisible();
        const links = contents.getByRole('link');
        const sectionCount = await page.getByTestId('privacy-page').getByRole('heading', { level: 2 }).count();
        await expect(links).toHaveCount(sectionCount);
        for (const link of await links.all()) {
            const href = await link.getAttribute('href');
            expect(href).toMatch(/^#/);
            await expect(page.locator(href!)).toHaveText(await link.innerText());
        }
        await contents.getByRole('link', { name: 'Privacy questions', exact: true }).click();
        await expect(page.locator('#privacy-contact-heading')).toBeInViewport();
        await expect(page.getByRole('button', { name: 'Reveal email address', exact: true })).toBeInViewport();
    });

    test('complete contact address is absent from generated HTML and every built JavaScript file', async () => {
        const outputDirectory = path.resolve('dist');
        const html = readFileSync(path.join(outputDirectory, 'privacy', 'index.html'), 'utf8');
        expect(html.toLowerCase()).not.toContain(contactEmail);
        const files = builtJavaScriptFiles(outputDirectory);
        expect(files.length).toBeGreaterThan(0);
        for (const filename of files) {
            expect(readFileSync(filename, 'utf8').toLowerCase(), path.relative(outputDirectory, filename))
                .not.toContain(contactEmail);
        }
    });

    test('all three font families load locally with Google Fonts blocked', async ({ page }) => {
        const externalFontRequests: string[] = [];
        const fontRequests: string[] = [];
        await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, route => {
            externalFontRequests.push(route.request().url());
            return route.abort();
        });
        page.on('request', request => {
            if (request.resourceType() === 'font') fontRequests.push(request.url());
        });
        await page.goto('/privacy');
        await expectPrivacyNotice(page);
        const loadedFonts = await page.evaluate(async () => {
            const fonts = ['400 16px "Oxanium"', '700 16px "Source Code Pro"', '400 16px "Source Serif 4"'];
            return Promise.all(fonts.map(async font => {
                const faces = await document.fonts.load(font, 'Kromacut Șț');
                return { font, count: faces.length, loaded: faces.every(face => face.status === 'loaded') };
            }));
        });
        for (const result of loadedFonts) {
            expect(result.count, result.font).toBeGreaterThan(0);
            expect(result.loaded, result.font).toBe(true);
        }
        expect(externalFontRequests).toEqual([]);
        expect(fontRequests.length).toBeGreaterThanOrEqual(3);
        for (const url of fontRequests) expect(new URL(url).origin).toBe(new URL(page.url()).origin);
    });

    test('notice remains readable without JavaScript and does not expose an active email link', async ({ browser, baseURL }) => {
        const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
        try {
            const page = await context.newPage();
            expect((await page.goto('/privacy'))?.status()).toBe(200);
            await expectPrivacyNotice(page);
            const privacy = page.getByTestId('privacy-page');
            expect(await privacy.getByRole('heading', { level: 2 }).count()).toBeGreaterThanOrEqual(5);
            await expect(privacy).toContainText(/browser/i);
            await expect(privacy).toContainText(/local\s*storage/i);
            await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
            await expect(page.locator('body')).not.toContainText(contactEmail);
            await expect(privacy.getByRole('link', { name: /Open Kromacut/i })).toHaveAttribute('href', '/app');
        } finally {
            await context.close();
        }
    });

    test('keyboard reveal exposes the correct address and copy writes it to the clipboard', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.goto('/privacy');
        await expectPrivacyNotice(page);
        await expect(page.locator('body')).not.toContainText(contactEmail);
        await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Copy email address', exact: true })).toHaveCount(0);

        const reveal = page.getByRole('button', { name: 'Reveal email address', exact: true });
        await expect(reveal).toHaveAttribute('aria-expanded', 'false');
        await reveal.focus();
        await page.keyboard.press('Enter');
        await expect(reveal).toHaveCount(0);
        const emailLink = page.getByRole('link', { name: contactEmail, exact: true });
        await expect(emailLink).toHaveAttribute('href', `mailto:${contactEmail}`);
        await expect(emailLink).toBeVisible();
        await expect(emailLink).toBeFocused();
        const copy = page.getByRole('button', { name: 'Copy email address', exact: true });
        await page.keyboard.press('Tab');
        await expect(copy).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('status')).toContainText(/copied/i);
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(contactEmail);
    });

    test('clipboard rejection is announced and a later copy can retry successfully', async ({ page }) => {
        await page.addInitScript(() => {
            let attempts = 0;
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: {
                    writeText: async () => {
                        attempts += 1;
                        if (attempts === 1) throw new DOMException('Clipboard access denied', 'NotAllowedError');
                    },
                },
            });
        });
        await page.goto('/privacy');
        await page.getByRole('button', { name: 'Reveal email address', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Reveal email address', exact: true })).toHaveCount(0);
        await expect(page.getByText('Reveal the email address, then open it in your email app or copy it.', { exact: true }))
            .toHaveCount(0);
        const copy = page.getByRole('button', { name: 'Copy email address', exact: true });
        await copy.click();
        await expect(page.getByRole('status')).toContainText(/could not|couldn.t|unable|failed|not available/i);
        await expect(page.getByRole('link', { name: contactEmail, exact: true }))
            .toHaveAttribute('href', `mailto:${contactEmail}`);
        await expect(copy).toBeEnabled();
        await copy.click();
        await expect(page.getByRole('status')).toContainText(/copied/i);
        await expect(page.getByRole('status')).not.toContainText(/could not|couldn.t|unable|failed/i);
    });

    test('missing clipboard support offers readable failure feedback without losing the revealed address', async ({ page }) => {
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
        });
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('/privacy');
        await page.getByRole('button', { name: 'Reveal email address', exact: true }).click();
        await page.getByRole('button', { name: 'Copy email address', exact: true }).click();
        await expect(page.getByRole('status')).toContainText(/could not|couldn.t|unable|failed|not available/i);
        await expect(page.getByRole('link', { name: contactEmail, exact: true })).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('recovery links work and the production homepage links back to the privacy notice', async ({ page }) => {
        for (const destination of ['/?landing=1', '/docs/overview', '/app', '/terms']) {
            await page.goto('/privacy');
            const recovery = page.getByTestId('privacy-page').locator(`a[href="${destination}"]`).first();
            await expect(recovery).toBeVisible();
            await recovery.click();
            const url = new URL(page.url());
            expect(`${url.pathname}${url.search}`).toBe(destination);
            if (destination === '/?landing=1') {
                await expect(page.getByTestId('landing-page')).toBeVisible();
                await expect(page.getByRole('navigation', { name: 'Footer navigation' })
                    .getByTestId('landing-privacy-link')).toHaveAttribute('href', '/privacy');
            } else if (destination === '/app') {
                await expect(page.getByTestId('image-file-input')).toBeAttached();
            } else if (destination === '/terms') {
                await expect(page.getByTestId('terms-page')).toBeVisible();
                await expect(page).toHaveTitle('Terms & conditions | Kromacut');
            } else {
                await expect(page.getByRole('article', { name: 'Overview', exact: true })).toBeVisible();
            }
            await expect(page.getByTestId('privacy-page')).toHaveCount(0);
        }
    });

    for (const width of [320, 390]) {
        for (const theme of ['light', 'dark'] as const) {
            test(`footer and privacy notice fit ${width}px ${theme} screens with keyboard navigation`, async ({ page }, testInfo) => {
                await page.setViewportSize({ width, height: 844 });
                await page.addInitScript(value => localStorage.setItem('theme', value), theme);
                await page.goto('/?landing=1');
                const landing = page.getByTestId('landing-page');
                await expect(landing).toBeVisible();
                await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark')))
                    .toBe(theme === 'dark');
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
                expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
                expect(await landing.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(width);
                const privacyLink = footer.getByTestId('landing-privacy-link');
                await expect(privacyLink).toHaveAccessibleName('Privacy');
                await expect(privacyLink).toHaveAttribute('href', '/privacy');
                await footer.getByRole('link', { name: 'Support Kromacut', exact: true }).focus();
                await page.keyboard.press('Tab');
                await expect(privacyLink).toBeFocused();
                await page.screenshot({ path: testInfo.outputPath(`privacy-footer-${width}-${theme}.png`) });
                await page.keyboard.press('Enter');
                await expect(page).toHaveURL(/\/privacy$/);
                await expectPrivacyNotice(page);
                await page.evaluate(() => document.fonts.ready);
                await page.screenshot({ path: testInfo.outputPath(`privacy-${width}-${theme}.png`) });
                expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

                await page.getByRole('button', { name: 'Reveal email address', exact: true }).click();
                await expect(page.getByRole('button', { name: 'Reveal email address', exact: true })).toHaveCount(0);
                await expect(page.getByText('Reveal the email address, then open it in your email app or copy it.', { exact: true }))
                    .toHaveCount(0);
                const emailLink = page.getByRole('link', { name: contactEmail, exact: true });
                await expect(emailLink).toBeInViewport({ ratio: 1 });
                await expect(page.getByRole('button', { name: 'Copy email address', exact: true })).toBeInViewport({ ratio: 1 });
                expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
                expect(await page.getByTestId('privacy-page').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(width);
                await page.screenshot({ path: testInfo.outputPath(`privacy-contact-${width}-${theme}.png`) });
            });
        }
    }
});
