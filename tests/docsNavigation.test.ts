import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDocsPath } from '../src/lib/docs/navigation.ts';

test('docs root and generated guide aliases resolve to the same documentation target', () => {
    for (const pathname of ['/docs', '/docs/', '/docs/index.html']) {
        assert.deepEqual(parseDocsPath(pathname), { docSlug: 'overview', headingSlug: undefined });
    }
    for (const pathname of [
        '/docs/quick-start',
        '/docs/quick-start/',
        '/docs/quick-start.html',
        '/docs/quick-start/index.html',
        '/docs/quick-start.md',
        '/docs/%71uick-start',
    ]) {
        assert.deepEqual(parseDocsPath(pathname, '#print%20settings'), {
            docSlug: 'quick-start',
            headingSlug: 'print settings',
        });
    }
});

test('unknown docs slugs remain unknown instead of selecting the overview', () => {
    for (const pathname of [
        '/docs/missing-guide',
        '/docs/missing-guide.html',
        '/docs/missing-guide/index.html',
    ]) {
        assert.deepEqual(parseDocsPath(pathname), {
            docSlug: 'missing-guide',
            headingSlug: undefined,
        });
    }
});

test('malformed docs paths and fragments cannot silently select a guide', () => {
    for (const pathname of [
        '/',
        '/documentation',
        '/docs//',
        '/docs//quick-start',
        '/docs/quick-start//',
        '/docs/quick-start/extra',
        '/docs/quick-start/index.html/extra',
        '/docs/quick-start.html/index.html',
        '/docs/docs/quick-start',
        '/docs/%',
        '/docs/%E0%A4%A',
        '/docs/quick-start%2Fextra',
        '/docs/quick-start%5Cextra',
        '/docs/%2E%2E',
        '/docs/%20quick-start',
    ]) {
        assert.equal(parseDocsPath(pathname), null, pathname);
    }
    assert.equal(parseDocsPath('/docs/quick-start', '#%E0%A4%A'), null);
});
