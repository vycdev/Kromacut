import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isImageFile, validateImageFile } from '../src/lib/imageFile.ts';

test('image MIME types are images regardless of extension', () => {
    assert.equal(isImageFile({ name: 'photo', type: 'image/png' }), true);
    assert.equal(isImageFile({ name: 'scan.bin', type: 'image/tiff' }), true);
});

test('files with an empty MIME type fall back to the extension', () => {
    for (const name of [
        'a.avif',
        'a.BMP',
        'a.gif',
        'a.heic',
        'a.heif',
        'a.jpg',
        'a.jpeg',
        'a.png',
        'a.webp',
    ]) {
        assert.equal(isImageFile({ name, type: '' }), true, name);
    }
    assert.equal(isImageFile({ name: 'notes.txt', type: '' }), false);
    assert.equal(isImageFile({ name: 'png', type: '' }), false);
});

test('a non-image MIME type is not overridden by an image extension', () => {
    assert.equal(isImageFile({ name: 'renamed.png', type: 'text/plain' }), false);
});

const rocco = readFileSync(new URL('./assets/rocco__source.png', import.meta.url));

/**
 * Stands in for the browser decoders. Like WebKit, the stub decodes a truncated
 * PNG to a partial image and accepts it in createImageBitmap, so only the
 * structural check can refuse it.
 */
async function withBrowserStubs(
    options: { decodes: boolean; bitmapRejects?: boolean },
    run: (urls: { created: string[]; revoked: string[] }) => Promise<void>
) {
    const urls = { created: [] as string[], revoked: [] as string[] };
    const globals = globalThis as Record<string, unknown>;
    const saved = {
        Image: globals.Image,
        createImageBitmap: globals.createImageBitmap,
        createObjectURL: URL.createObjectURL,
        revokeObjectURL: URL.revokeObjectURL,
    };
    globals.Image = class {
        naturalWidth = 0;
        naturalHeight = 0;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_url: string) {
            queueMicrotask(() => {
                if (!options.decodes) return this.onerror?.();
                this.naturalWidth = 1000;
                this.naturalHeight = 835;
                this.onload?.();
            });
        }
    };
    globals.createImageBitmap = async () => {
        if (options.bitmapRejects) throw new Error('decode failed');
        return { close() {} };
    };
    URL.createObjectURL = (blob: Blob) => {
        const url = saved.createObjectURL(blob);
        urls.created.push(url);
        return url;
    };
    URL.revokeObjectURL = (url: string) => {
        urls.revoked.push(url);
        saved.revokeObjectURL(url);
    };
    try {
        await run(urls);
    } finally {
        globals.Image = saved.Image;
        globals.createImageBitmap = saved.createImageBitmap;
        URL.createObjectURL = saved.createObjectURL;
        URL.revokeObjectURL = saved.revokeObjectURL;
    }
}

const png = (bytes: Uint8Array, name = 'photo.png') =>
    new File([bytes], name, { type: 'image/png' });

test('validateImageFile returns the decoded image and leaves its URL open', async () => {
    await withBrowserStubs({ decodes: true }, async (urls) => {
        const result = await validateImageFile(png(rocco));
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.image.naturalWidth, 1000);
        assert.deepEqual(urls.created, [result.url]);
        assert.deepEqual(urls.revoked, []);
        URL.revokeObjectURL(result.url);
    });
});

test('validateImageFile refuses a truncated PNG that the decoders accept', async () => {
    await withBrowserStubs({ decodes: true }, async (urls) => {
        const result = await validateImageFile(
            png(rocco.subarray(0, Math.floor(rocco.length / 3)))
        );
        assert.deepEqual(result, { ok: false, reason: 'undecodable' });
        assert.deepEqual(urls.revoked, urls.created);
    });
});

test('validateImageFile refuses files the decoder or createImageBitmap rejects', async () => {
    await withBrowserStubs({ decodes: false }, async (urls) => {
        const result = await validateImageFile(png(rocco));
        assert.deepEqual(result, { ok: false, reason: 'undecodable' });
        assert.deepEqual(urls.revoked, urls.created);
    });
    await withBrowserStubs({ decodes: true, bitmapRejects: true }, async (urls) => {
        const result = await validateImageFile(png(rocco));
        assert.deepEqual(result, { ok: false, reason: 'undecodable' });
        assert.deepEqual(urls.revoked, urls.created);
    });
});

test('validateImageFile refuses a file whose bytes can no longer be read', async () => {
    await withBrowserStubs({ decodes: true }, async (urls) => {
        const file = png(rocco);
        file.arrayBuffer = () => Promise.reject(new Error('NotReadableError'));
        const result = await validateImageFile(file);
        assert.deepEqual(result, { ok: false, reason: 'undecodable' });
        assert.deepEqual(urls.revoked, urls.created);
    });
});

test('validateImageFile skips createImageBitmap for SVG files', async () => {
    await withBrowserStubs({ decodes: true, bitmapRejects: true }, async () => {
        const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'shape.svg', {
            type: 'image/svg+xml',
        });
        const result = await validateImageFile(svg);
        assert.equal(result.ok, true);
        if (result.ok) URL.revokeObjectURL(result.url);
    });
});

test('validateImageFile refuses non-images without opening a URL', async () => {
    await withBrowserStubs({ decodes: true }, async (urls) => {
        const text = new File(['not an image'], 'notes.txt', { type: 'text/plain' });
        assert.deepEqual(await validateImageFile(text), { ok: false, reason: 'notImage' });
        assert.deepEqual(urls.created, []);
    });
});
