import assert from 'node:assert/strict';
import test from 'node:test';
import {
    APP_PATH,
    DOCS_PATH,
    LANDING_PATH,
    PRIVACY_PATH,
    TERMS_PATH,
    appPath,
    docsPath,
    hasLandingBypass,
    isCrawlerUserAgent,
    landingPath,
    selectRoute,
    shouldRedirectHomeToApp,
} from '../src/lib/routes.ts';

test('selectRoute distinguishes web landing, app, docs, and desktop root', () => {
    assert.equal(selectRoute('/'), 'landing');
    assert.equal(selectRoute('/app'), 'app');
    assert.equal(selectRoute('/app/'), 'app');
    assert.equal(selectRoute('/app/index.html'), 'app');
    assert.equal(selectRoute('/index.html'), 'landing');
    assert.equal(selectRoute('/docs'), 'docs');
    assert.equal(selectRoute('/docs/quick-start'), 'docs');
    assert.equal(selectRoute('/'), 'landing');
    assert.equal(selectRoute('/', true), 'app');
    assert.equal(selectRoute('/docs/overview', true), 'app');
});

test('unknown web routes do not silently become the landing page', () => {
    for (const path of [
        '/missing',
        '/nested/missing/',
        '/application',
        '/app/missing',
        '/404.html',
        '/%E0%A4%A',
    ]) {
        assert.equal(selectRoute(path), 'not-found', path);
        assert.equal(
            shouldRedirectHomeToApp({ pathname: path, search: '' }, false, 'Mozilla/5.0', true),
            false
        );
    }
    assert.equal(selectRoute('/missing', true), 'app');
});

test('privacy is a public web route and never replaces the desktop workspace', () => {
    for (const path of ['/privacy', '/privacy/', '/privacy/index.html']) {
        assert.equal(selectRoute(path), 'privacy');
        assert.equal(selectRoute(path, true), 'app');
        assert.equal(
            shouldRedirectHomeToApp({ pathname: path, search: '' }, false, 'Mozilla/5.0', true),
            false
        );
    }
    assert.equal(selectRoute('/privacy/missing'), 'not-found');
});

test('terms is a public web route and never replaces the desktop workspace', () => {
    for (const path of ['/terms', '/terms/', '/terms/index.html']) {
        assert.equal(selectRoute(path), 'terms');
        assert.equal(selectRoute(path, true), 'app');
        assert.equal(
            shouldRedirectHomeToApp({ pathname: path, search: '' }, false, 'Mozilla/5.0', true),
            false
        );
    }
    for (const path of ['/terms/missing', '/terms-and-conditions', '/termsofservice']) {
        assert.equal(selectRoute(path), 'not-found', path);
    }
});

test('route constants expose stable public paths', () => {
    assert.equal(LANDING_PATH, '/');
    assert.equal(APP_PATH, '/app');
    assert.equal(DOCS_PATH, '/docs');
    assert.equal(PRIVACY_PATH, '/privacy');
    assert.equal(TERMS_PATH, '/terms');
    assert.equal(appPath(false), '/app');
    assert.equal(appPath(true), '/');
    assert.equal(landingPath(false), '/?landing=1');
    assert.equal(landingPath(true), '/');
    assert.equal(docsPath(), '/docs');
    assert.equal(docsPath('/quick-start/'), '/docs/quick-start');
});

test('returning users redirect only from the web home page', () => {
    const returningHome = { pathname: '/', search: '' } as const;
    assert.equal(shouldRedirectHomeToApp(returningHome, false, 'Mozilla/5.0', true), true);
    assert.equal(
        shouldRedirectHomeToApp(
            { pathname: '/', search: '?landing=1' },
            false,
            'Mozilla/5.0',
            true
        ),
        false
    );
    assert.equal(
        shouldRedirectHomeToApp({ pathname: '/app', search: '' }, false, 'Mozilla/5.0', true),
        false
    );
    assert.equal(shouldRedirectHomeToApp(returningHome, true, 'Mozilla/5.0', true), false);
    assert.equal(shouldRedirectHomeToApp(returningHome, false, 'Googlebot/2.1', true), false);
    assert.equal(shouldRedirectHomeToApp(returningHome, false, 'Mozilla/5.0', false), false);
});

test('landing bypass query parameter is explicit', () => {
    assert.equal(hasLandingBypass('?landing=1'), true);
    assert.equal(hasLandingBypass('?landing=0'), false);
    assert.equal(hasLandingBypass(''), false);
    assert.equal(isCrawlerUserAgent('facebookexternalhit/1.1'), true);
    assert.equal(isCrawlerUserAgent('Mozilla/5.0'), false);
});
