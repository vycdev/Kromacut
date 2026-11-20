import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAdjustments } from '../src/lib/applyAdjustments.ts';
import { renderImageEdit } from '../src/lib/renderImageEdit.ts';
import { replaceImageColors } from '../src/lib/replaceImageColors.ts';

// The renderer only needs rectangular copies. Unpremultiplied test storage
// isolates the adjustment math and exact tile seams from browser color conversion.
class Raster {
    readonly pixels: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.pixels = new Uint8ClampedArray(width * height * 4);
    }

    getContext() {
        return {
            clearRect: () => this.pixels.fill(0),
            drawImage: (source: Raster, x: number, y: number, w: number, h: number) => {
                const tile = source.getContext().getImageData(x, y, w, h);
                for (let j = 0; j < h; j++) {
                    this.pixels.set(
                        tile.data.subarray(j * w * 4, (j + 1) * w * 4),
                        j * this.width * 4
                    );
                }
            },
            getImageData: (x: number, y: number, w: number, h: number) => {
                const data = new Uint8ClampedArray(w * h * 4);
                for (let j = 0; j < h; j++) {
                    const offset = ((y + j) * this.width + x) * 4;
                    data.set(this.pixels.subarray(offset, offset + w * 4), j * w * 4);
                }
                return new ImageData(data, w, h);
            },
            putImageData: (
                image: ImageData,
                x: number,
                y: number,
                left: number,
                top: number,
                w: number,
                h: number
            ) => {
                for (let j = top; j < top + h; j++) {
                    const offset = (j * image.width + left) * 4;
                    this.pixels.set(
                        image.data.subarray(offset, offset + w * 4),
                        ((y + j) * this.width + x + left) * 4
                    );
                }
            },
        };
    }
}

test('tile seams, clipped halos and alpha match the full-frame adjustment', async () => {
    const original = globalThis.ImageData;
    globalThis.ImageData = class {
        readonly data: Uint8ClampedArray;
        readonly width: number;
        readonly height: number;
        constructor(data: Uint8ClampedArray, width: number, height: number) {
            this.data = data;
            this.width = width;
            this.height = height;
        }
    } as unknown as typeof ImageData;
    try {
        const source = new Raster(259, 131);
        for (let i = 0; i < source.pixels.length; i++) {
            source.pixels[i] = (i * 17 + Math.floor(i / 249)) % 256;
        }
        source.pixels.set([40, 81, 15, 200], (128 * source.width + 128) * 4);
        const edit = {
            adjustments: { clarity: 53, exposure: -0.23, hue: 30, saturation: -20 },
            replacements: { '#28510F': '#9A0F26' },
        };
        const fullFrame = source.getContext().getImageData(0, 0, source.width, source.height);
        replaceImageColors(fullFrame.data, edit.replacements);
        const expected = applyAdjustments(fullFrame, edit.adjustments);
        const tiled = await renderImageEdit(
            source as unknown as HTMLCanvasElement,
            edit,
            (w, h) => new Raster(w, h) as unknown as HTMLCanvasElement,
            new AbortController().signal
        );
        assert.deepEqual((tiled as unknown as Raster).pixels, expected.data);
    } finally {
        globalThis.ImageData = original;
    }
});
