import assert from 'node:assert/strict';
import test from 'node:test';
import {
    APP_PATH,
    DOCS_PATH,
    LANDING_PATH,
    appPath,
    hasLandingBypass,
    isCrawlerUserAgent,
    selectRoute,
    shouldRedirectHomeToApp,
} from '../src/lib/routes.ts';

test('selectRoute distinguishes web landing, app, docs, and desktop root', () => {
    assert.equal(selectRoute('/'), 'landing');
    assert.equal(selectRoute('/app'), 'app');
    assert.equal(selectRoute('/app/'), 'app');
    assert.equal(selectRoute('/docs'), 'docs');
    assert.equal(selectRoute('/docs/quick-start'), 'docs');
    assert.equal(selectRoute('/'), 'landing');
    assert.equal(selectRoute('/', true), 'app');
    assert.equal(selectRoute('/docs/overview', true), 'app');
});

test('route constants expose stable public paths', () => {
    assert.equal(LANDING_PATH, '/');
    assert.equal(APP_PATH, '/app');
    assert.equal(DOCS_PATH, '/docs');
    assert.equal(appPath(false), '/app');
    assert.equal(appPath(true), '/');
});

test('returning users redirect only from the web home page', () => {
    const returningHome = { pathname: '/', search: '' } as const;
    assert.equal(shouldRedirectHomeToApp(returningHome, false, 'Mozilla/5.0', true), true);
    assert.equal(shouldRedirectHomeToApp({ pathname: '/', search: '?landing=1' }, false, 'Mozilla/5.0', true), false);
    assert.equal(shouldRedirectHomeToApp({ pathname: '/app', search: '' }, false, 'Mozilla/5.0', true), false);
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
