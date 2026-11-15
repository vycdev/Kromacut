import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    fitsImageCanvasLimits,
    IOS_MAX_IMAGE_PIXELS,
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

test('image budgets allow thin panoramas while limiting each side and total area', () => {
    assert.equal(MAX_IMAGE_SIDE, 65535);
    assert.equal(MAX_IMAGE_PIXELS, 268_435_456);
    assert.equal(fitsImageCanvasLimits(1000, 835), true);
    assert.equal(fitsImageCanvasLimits(16384, 16384), true);
    assert.equal(fitsImageCanvasLimits(32767, 8192), true);
    assert.equal(fitsImageCanvasLimits(32767, 1), true);
    assert.equal(fitsImageCanvasLimits(1, 32767), true);
    assert.equal(fitsImageCanvasLimits(40000, 8), true);
    assert.equal(fitsImageCanvasLimits(8, 40000), true);
    assert.equal(fitsImageCanvasLimits(65535, 1), true);
    assert.equal(fitsImageCanvasLimits(1, 65535), true);
    // Over the total pixel limit, as in Chromium and WebKit.
    assert.equal(fitsImageCanvasLimits(16385, 16384), false);
    assert.equal(fitsImageCanvasLimits(16384, 16385), false);
    assert.equal(fitsImageCanvasLimits(17000, 17000), false);
    assert.equal(fitsImageCanvasLimits(65536, 1), false);
    assert.equal(fitsImageCanvasLimits(1, 65536), false);
});

test('the iOS image budget also protects older Safari and desktop-mode iPads', () => {
    assert.equal(IOS_MAX_IMAGE_PIXELS, 16_777_216);
    assert.equal(fitsImageCanvasLimits(4096, 4096, IOS_MAX_IMAGE_PIXELS), true);
    assert.equal(fitsImageCanvasLimits(8192, 2048, IOS_MAX_IMAGE_PIXELS), true);
    assert.equal(fitsImageCanvasLimits(4097, 4096, IOS_MAX_IMAGE_PIXELS), false);
    assert.equal(fitsImageCanvasLimits(4096, 4097, IOS_MAX_IMAGE_PIXELS), false);
    assert.equal(fitsImageCanvasLimits(9000, 9000, IOS_MAX_IMAGE_PIXELS), false);
});

test('invalid or empty image dimensions do not fit a canvas', () => {
    for (const value of [0, -1, 1.5, NaN, Infinity]) {
        assert.equal(fitsImageCanvasLimits(value, 1), false);
        assert.equal(fitsImageCanvasLimits(1, value), false);
    }
});

const rocco = readFileSync(new URL('./assets/rocco__source.png', import.meta.url));

/**
 * Stands in for the browser decoders and counts how often each one runs. Like
 * WebKit, the stubs decode a truncated PNG to a partial image and accept it in
 * createImageBitmap, so only the structural check can refuse it.
 */
async function withBrowserStubs(
    options: {
        decodes?: boolean;
        bitmapRejects?: boolean;
        noBitmap?: boolean;
        onBitmapCall?: (args: unknown[]) => void;
    },
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
        globals.createImageBitmap = async (...args: unknown[]) => {
            decodes.bitmaps += 1;
            options.onBitmapCall?.(args);
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
    const calls: unknown[][] = [];
    await withBrowserStubs({ onBitmapCall: (args) => calls.push(args) }, async (urls, decodes) => {
        const result = await validateImageFile(png(rocco));
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.image.width, 1000);
        assert.equal(result.image.height, 835);
        assert.deepEqual(decodes, { images: 0, bitmaps: 1, closedBitmaps: 0 });
        assert.deepEqual(urls.created, [result.url]);
        assert.deepEqual(urls.revoked, []);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].length, 1, 'default consumers keep the existing bitmap options');
        result.image.close();
        assert.equal(decodes.closedBitmaps, 1);
        URL.revokeObjectURL(result.url);
    });
});

test('main imports can request unpremultiplied pixels with one decode and one close', async () => {
    const calls: unknown[][] = [];
    await withBrowserStubs({ onBitmapCall: (args) => calls.push(args) }, async (urls, decodes) => {
        const file = png(rocco);
        const result = await validateImageFile(file, { premultiplyAlpha: 'none' });
        assert.ok(result.ok);
        assert.deepEqual(calls, [[file, { premultiplyAlpha: 'none' }]]);
        assert.deepEqual(decodes, { images: 0, bitmaps: 1, closedBitmaps: 0 });
        result.image.close();
        assert.equal(decodes.closedBitmaps, 1);
        URL.revokeObjectURL(result.url);
        assert.deepEqual(urls.revoked, urls.created);
    });
});

test('unpremultiplied bitmap options keep rejection and fallback behavior', async () => {
    await withBrowserStubs({ bitmapRejects: true }, async (urls, decodes) => {
        assert.deepEqual(await validateImageFile(png(rocco), { premultiplyAlpha: 'none' }), {
            ok: false,
            reason: 'undecodable',
        });
        assert.deepEqual(decodes, { images: 0, bitmaps: 1, closedBitmaps: 0 });
        assert.deepEqual(urls.revoked, urls.created);
    });
    for (const options of [{ noBitmap: true }, { bitmapRejects: true }]) {
        await withBrowserStubs(options, async (urls, decodes) => {
            const file = options.noBitmap ? png(rocco) : svg();
            const result = await validateImageFile(file, { premultiplyAlpha: 'none' });
            assert.ok(result.ok);
            assert.deepEqual(decodes, { images: 1, bitmaps: 0, closedBitmaps: 0 });
            result.image.close();
            URL.revokeObjectURL(result.url);
            assert.deepEqual(urls.revoked, urls.created);
        });
    }
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
