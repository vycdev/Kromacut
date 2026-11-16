import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createImageCanvas,
    loadImageCanvas,
    validateCanvasImageFile,
} from '../src/lib/imageCanvas.ts';
import { validateImageFile } from '../src/lib/imageFile.ts';

async function withBrowser(
    failure: 'context' | 'draw' | null,
    run: (counts: {
        bitmaps: number;
        images: number;
        closes: number;
        draws: number;
    }) => Promise<void>
) {
    const counts = { bitmaps: 0, images: 0, closes: 0, draws: 0 };
    const names = ['Image', 'document', 'createImageBitmap'] as const;
    const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
    const globals = globalThis as Record<string, unknown>;
    globals.Image = class {
        naturalWidth = 4;
        naturalHeight = 3;
        onload?: () => void;
        set src(_value: string) {
            counts.images++;
            queueMicrotask(() => this.onload?.());
        }
    };
    globals.createImageBitmap = async () => {
        counts.bitmaps++;
        return {
            width: 4,
            height: 3,
            closed: false,
            close() {
                this.closed = true;
                counts.closes++;
            },
        };
    };
    globals.document = {
        createElement: () => ({
            width: 0,
            height: 0,
            getContext: () =>
                failure === 'context'
                    ? null
                    : {
                          drawImage: (
                              _source: unknown,
                              x: number,
                              y: number,
                              w: number,
                              h: number
                          ) => {
                              assert.notEqual(
                                  (_source as { closed?: boolean }).closed,
                                  true,
                                  'draw must finish before the bitmap is closed'
                              );
                              assert.deepEqual([x, y, w, h], [0, 0, 4, 3]);
                              counts.draws++;
                              if (failure === 'draw') throw new Error('draw failed');
                          },
                      },
        }),
    };
    try {
        await run(counts);
    } finally {
        names.forEach((name, i) => {
            if (saved[i]) Object.defineProperty(globalThis, name, saved[i]!);
            else delete globals[name];
        });
    }
}

test('validated raster pixels reach the shared canvas with one decode and one close', async () => {
    await withBrowser(null, async (counts) => {
        const result = await validateImageFile(
            new File(['pixels'], 'photo.bmp', { type: 'image/bmp' })
        );
        assert.ok(result.ok);
        try {
            const canvas = createImageCanvas(result.image);
            assert.deepEqual([canvas.width, canvas.height], [4, 3]);
            assert.deepEqual(counts, { bitmaps: 1, images: 0, closes: 1, draws: 1 });
        } finally {
            URL.revokeObjectURL(result.url);
        }
    });
});

for (const failure of ['context', 'draw'] as const) {
    test(`the shared canvas closes its decode when ${failure} fails`, async () => {
        await withBrowser(failure, async (counts) => {
            const result = await validateImageFile(
                new File(['pixels'], 'photo.bmp', { type: 'image/bmp' })
            );
            assert.ok(result.ok);
            try {
                assert.throws(() => createImageCanvas(result.image));
                assert.equal(counts.bitmaps, 1);
                assert.equal(counts.images, 0);
                assert.equal(counts.closes, 1);
            } finally {
                URL.revokeObjectURL(result.url);
            }
        });
    });
}

test('edits and history URLs load into the shared canvas with a single image decode', async () => {
    await withBrowser(null, async (counts) => {
        const canvas = await loadImageCanvas('blob:edited-image');
        assert.ok(canvas);
        assert.deepEqual([canvas.width, canvas.height], [4, 3]);
        assert.deepEqual(counts, { bitmaps: 0, images: 1, closes: 0, draws: 1 });
    });
});

test('an obsolete URL decode does not allocate or draw another full-size canvas', async () => {
    await withBrowser(null, async (counts) => {
        let current = true;
        const pending = loadImageCanvas('blob:obsolete-edit', () => current);
        current = false;
        assert.equal(await pending, null);
        assert.deepEqual(counts, { bitmaps: 0, images: 1, closes: 0, draws: 0 });
    });
});

test('imports and their history reloads decode the same encoded file with the same options', async () => {
    await withBrowser(null, async (counts) => {
        const file = new File(['pixels'], 'photo.bmp', { type: 'image/bmp' });
        const arrayBuffer = file.arrayBuffer.bind(file);
        let reads = 0;
        file.arrayBuffer = () => {
            reads++;
            return arrayBuffer();
        };
        const calls: unknown[][] = [];
        const bitmap = globalThis.createImageBitmap;
        globalThis.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => {
            calls.push(args);
            return bitmap(...args);
        }) as typeof createImageBitmap;
        const result = await validateCanvasImageFile(file);
        assert.ok(result.ok);
        assert.equal(result.sourceFile, file);
        try {
            createImageCanvas(result.image);
            const restored = await loadImageCanvas(result.url, () => true, result.sourceFile);
            assert.ok(restored);
            assert.deepEqual(calls, [
                [file, { premultiplyAlpha: 'none' }],
                [file, { premultiplyAlpha: 'none' }],
            ]);
            assert.equal(
                reads,
                1,
                'already validated encoded bytes need no second structural check'
            );
            assert.deepEqual(counts, { bitmaps: 2, images: 0, closes: 2, draws: 2 });
        } finally {
            URL.revokeObjectURL(result.url);
        }
    });
});

test('an obsolete imported-file decode closes its bitmap without allocating a canvas', async () => {
    await withBrowser(null, async (counts) => {
        let current = true;
        const bitmap = globalThis.createImageBitmap;
        globalThis.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
            const decoded = await bitmap(...args);
            current = false;
            return decoded;
        }) as typeof createImageBitmap;
        const file = new File(['pixels'], 'photo.bmp', { type: 'image/bmp' });
        assert.equal(await loadImageCanvas('blob:obsolete-import', () => current, file), null);
        assert.deepEqual(counts, { bitmaps: 1, images: 0, closes: 1, draws: 0 });
    });
});

for (const failure of ['context', 'draw'] as const) {
    test(`an imported-file history reload closes its bitmap when ${failure} fails`, async () => {
        await withBrowser(failure, async (counts) => {
            const file = new File(['pixels'], 'photo.bmp', { type: 'image/bmp' });
            await assert.rejects(loadImageCanvas('blob:failed-import', () => true, file));
            assert.equal(counts.bitmaps, 1);
            assert.equal(counts.closes, 1);
        });
    });
}

test('imported-file history reloads keep the image fallback without bitmap support', async () => {
    await withBrowser(null, async (counts) => {
        Object.defineProperty(globalThis, 'createImageBitmap', {
            value: undefined,
            configurable: true,
        });
        const file = new File(['pixels'], 'photo.png', { type: 'image/png' });
        assert.ok(await loadImageCanvas('blob:fallback-import', () => true, file));
        assert.deepEqual(counts, { bitmaps: 0, images: 1, closes: 0, draws: 1 });
    });
});

test('an imported-file decode failure returns null without allocating a canvas', async () => {
    await withBrowser(null, async (counts) => {
        globalThis.createImageBitmap = (async () => {
            counts.bitmaps++;
            throw new Error('decode failed');
        }) as typeof createImageBitmap;
        const file = new File(['pixels'], 'photo.bmp', { type: 'image/bmp' });
        assert.equal(await loadImageCanvas('blob:failed-decode', () => true, file), null);
        assert.deepEqual(counts, { bitmaps: 1, images: 0, closes: 0, draws: 0 });
    });
});
