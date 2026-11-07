import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeImage } from '../src/lib/decodeImage.ts';

// Stands in for HTMLImageElement: setting `src` fires onload with the size
// registered for that URL, or onerror for an unknown URL.
const sizes = new Map<string, { width: number; height: number }>([
    ['ok.png', { width: 4, height: 3 }],
    ['zero-width.svg', { width: 0, height: 10 }],
    ['zero-height.svg', { width: 10, height: 0 }],
]);

class FakeImage {
    naturalWidth = 0;
    naturalHeight = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(url: string) {
        const size = sizes.get(url);
        queueMicrotask(() => {
            if (!size) {
                this.onerror?.();
                return;
            }
            this.naturalWidth = size.width;
            this.naturalHeight = size.height;
            this.onload?.();
        });
    }
}

function withFakeImage(run: () => Promise<void>) {
    return async () => {
        Object.defineProperty(globalThis, 'Image', { value: FakeImage, configurable: true });
        try {
            await run();
        } finally {
            delete (globalThis as { Image?: unknown }).Image;
        }
    };
}

test(
    'resolves the loaded image',
    withFakeImage(async () => {
        const image = await decodeImage('ok.png');
        assert.ok(image instanceof FakeImage);
        assert.equal(image.naturalWidth, 4);
        assert.equal(image.naturalHeight, 3);
    })
);

test(
    'resolves null instead of rejecting when the image fails to load',
    withFakeImage(async () => {
        assert.equal(await decodeImage('missing.png'), null);
    })
);

test(
    'resolves null when the image has no width or height',
    withFakeImage(async () => {
        assert.equal(await decodeImage('zero-width.svg'), null);
        assert.equal(await decodeImage('zero-height.svg'), null);
    })
);
