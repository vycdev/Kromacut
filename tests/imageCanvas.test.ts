import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageCanvas, loadImageCanvas } from '../src/lib/imageCanvas.ts';
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
        return { width: 4, height: 3, close: () => counts.closes++ };
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
                              assert.equal(
                                  counts.closes,
                                  0,
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
