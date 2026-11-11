import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    fitsImageCanvasLimits,
    isImageFile,
    MAX_IMAGE_PIXELS,
    MAX_IMAGE_SIDE,
    validateImageFile,
} from '../src/lib/imageFile.ts';

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

test('images fit the canvas limits up to 32767 pixels a side and 16384×16384 in total', () => {
    assert.equal(MAX_IMAGE_SIDE, 32767);
    assert.equal(MAX_IMAGE_PIXELS, 268_435_456);
    assert.equal(fitsImageCanvasLimits(1000, 835), true);
    assert.equal(fitsImageCanvasLimits(16384, 16384), true);
    assert.equal(fitsImageCanvasLimits(32767, 8192), true);
    assert.equal(fitsImageCanvasLimits(32767, 1), true);
    assert.equal(fitsImageCanvasLimits(1, 32767), true);
    // Over the total pixel limit, as in Chromium and WebKit.
    assert.equal(fitsImageCanvasLimits(16385, 16384), false);
    assert.equal(fitsImageCanvasLimits(16384, 16385), false);
    assert.equal(fitsImageCanvasLimits(17000, 17000), false);
    // Over the per-side limit, as in Firefox.
    assert.equal(fitsImageCanvasLimits(32768, 1), false);
    assert.equal(fitsImageCanvasLimits(1, 32768), false);
});

const rocco = readFileSync(new URL('./assets/rocco__source.png', import.meta.url));

/**
 * Stands in for the browser decoders and counts how often each one runs. Like
 * WebKit, the stubs decode a truncated PNG to a partial image and accept it in
 * createImageBitmap, so only the structural check can refuse it.
 */
async function withBrowserStubs(
    options: { decodes?: boolean; bitmapRejects?: boolean; noBitmap?: boolean },
    run: (
        urls: { created: string[]; revoked: string[] },
        decodes: { images: number; bitmaps: number; closedBitmaps: number }
    ) => Promise<void>
) {
    const urls = { created: [] as string[], revoked: [] as string[] };
    const decodes = { images: 0, bitmaps: 0, closedBitmaps: 0 };
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
            decodes.images += 1;
            queueMicrotask(() => {
                if (options.decodes === false) return this.onerror?.();
                this.naturalWidth = 40;
                this.naturalHeight = 30;
                this.onload?.();
            });
        }
    };
    if (options.noBitmap) delete globals.createImageBitmap;
    else
        globals.createImageBitmap = async () => {
            decodes.bitmaps += 1;
            if (options.bitmapRejects) throw new Error('decode failed');
            return { width: 1000, height: 835, close: () => (decodes.closedBitmaps += 1) };
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
        await run(urls, decodes);
    } finally {
        // Node has neither global, so remove the stubs rather than leave them undefined.
        for (const name of ['Image', 'createImageBitmap'] as const) {
            if (saved[name] === undefined) delete globals[name];
            else globals[name] = saved[name];
        }
        URL.createObjectURL = saved.createObjectURL;
        URL.revokeObjectURL = saved.revokeObjectURL;
    }
}

const png = (bytes: Uint8Array, name = 'photo.png') =>
    new File([bytes], name, { type: 'image/png' });
const svg = () =>
    new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'shape.svg', {
        type: 'image/svg+xml',
    });

test('validateImageFile decodes a raster file once and leaves its URL open', async () => {
    await withBrowserStubs({}, async (urls, decodes) => {
        const result = await validateImageFile(png(rocco));
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.image.width, 1000);
        assert.equal(result.image.height, 835);
        assert.deepEqual(decodes, { images: 0, bitmaps: 1, closedBitmaps: 0 });
        assert.deepEqual(urls.created, [result.url]);
        assert.deepEqual(urls.revoked, []);
        result.image.close();
        assert.equal(decodes.closedBitmaps, 1);
        URL.revokeObjectURL(result.url);
    });
});

test('validateImageFile refuses a truncated PNG before decoding it', async () => {
    await withBrowserStubs({}, async (urls, decodes) => {
        const result = await validateImageFile(
            png(rocco.subarray(0, Math.floor(rocco.length / 3)))
        );
        assert.deepEqual(result, { ok: false, reason: 'undecodable' });
        assert.deepEqual(decodes, { images: 0, bitmaps: 0, closedBitmaps: 0 });
        assert.deepEqual(urls.revoked, urls.created);
    });
});

test('validateImageFile refuses raster files createImageBitmap rejects', async () => {
    await withBrowserStubs({ bitmapRejects: true }, async (urls) => {
        const result = await validateImageFile(png(rocco));
        assert.deepEqual(result, { ok: false, reason: 'undecodable' });
        assert.deepEqual(urls.revoked, urls.created);
    });
});

test('validateImageFile refuses a file whose bytes can no longer be read', async () => {
    await withBrowserStubs({}, async (urls) => {
        const file = png(rocco);
        file.arrayBuffer = () => Promise.reject(new Error('NotReadableError'));
        const result = await validateImageFile(file);
        assert.deepEqual(result, { ok: false, reason: 'undecodable' });
        assert.deepEqual(urls.revoked, urls.created);
    });
});

test('validateImageFile decodes SVG files in an <img> instead of createImageBitmap', async () => {
    await withBrowserStubs({ bitmapRejects: true }, async (urls, decodes) => {
        const result = await validateImageFile(svg());
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.image.width, 40);
        assert.equal(result.image.height, 30);
        assert.deepEqual(decodes, { images: 1, bitmaps: 0, closedBitmaps: 0 });
        result.image.close();
        URL.revokeObjectURL(result.url);
        assert.deepEqual(urls.revoked, urls.created);
    });
    await withBrowserStubs({ decodes: false }, async (urls) => {
        assert.deepEqual(await validateImageFile(svg()), { ok: false, reason: 'undecodable' });
        assert.deepEqual(urls.revoked, urls.created);
    });
});

test('validateImageFile decodes raster files in an <img> without createImageBitmap', async () => {
    await withBrowserStubs({ noBitmap: true }, async (_urls, decodes) => {
        const result = await validateImageFile(png(rocco));
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.image.width, 40);
        assert.equal(decodes.images, 1);
        URL.revokeObjectURL(result.url);
    });
    await withBrowserStubs({ noBitmap: true, decodes: false }, async (urls) => {
        assert.deepEqual(await validateImageFile(png(rocco)), {
            ok: false,
            reason: 'undecodable',
        });
        assert.deepEqual(urls.revoked, urls.created);
    });
});

test('validateImageFile refuses non-images without opening a URL', async () => {
    await withBrowserStubs({}, async (urls) => {
        const text = new File(['not an image'], 'notes.txt', { type: 'text/plain' });
        assert.deepEqual(await validateImageFile(text), { ok: false, reason: 'notImage' });
        assert.deepEqual(urls.created, []);
    });
});
