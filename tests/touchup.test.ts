import test from 'node:test';
import assert from 'node:assert/strict';
import {
    brushSpans,
    clipBrushSpans,
    floodFill,
    hardenAlphaToColor,
    parseHexColor,
    rgbToHex,
    stampSpansIntoSurface,
    strokeLinePoints,
    TEXT_ALPHA_THRESHOLD,
    wrapTextLines,
    type PixelSurface,
} from '../src/lib/touchup.ts';

/** 10px per character, like a monospace font. */
const measure10 = (s: string) => s.length * 10;

type Rgba = [number, number, number, number];

function makeSurface(width: number, height: number, fill: Rgba = [0, 0, 0, 0]): PixelSurface {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = fill[0];
        data[i + 1] = fill[1];
        data[i + 2] = fill[2];
        data[i + 3] = fill[3];
    }
    return { data, width, height };
}

function setPx(surface: PixelSurface, x: number, y: number, rgba: Rgba): void {
    surface.data.set(rgba, (y * surface.width + x) * 4);
}

function getPx(surface: PixelSurface, x: number, y: number): Rgba {
    const i = (y * surface.width + x) * 4;
    return [surface.data[i], surface.data[i + 1], surface.data[i + 2], surface.data[i + 3]];
}

const RED: Rgba = [255, 0, 0, 255];
const GREEN: Rgba = [0, 255, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];

test('brush colors parse only complete six-digit hex values', () => {
    assert.deepEqual(parseHexColor('#3050c0'), [0x30, 0x50, 0xc0]);
    assert.deepEqual(parseHexColor('FF8800'), [0xff, 0x88, 0x00]);
    assert.equal(parseHexColor('#fff'), null);
    assert.equal(parseHexColor('#zzzzzz'), null);
});

test('brush size 1 stamps exactly the cursor pixel', () => {
    assert.deepEqual(brushSpans(1), [{ dy: 0, dx0: 0, dx1: 0 }]);
});

test('brush size 2 stamps a 2x2 square anchored at the cursor pixel', () => {
    assert.deepEqual(brushSpans(2), [
        { dy: 0, dx0: 0, dx1: 1 },
        { dy: 1, dx0: 0, dx1: 1 },
    ]);
});

test('brush size 4 is a hard-edged disc with cut corners', () => {
    const spans = brushSpans(4);
    const pixels = spans.reduce((sum, span) => sum + (span.dx1 - span.dx0 + 1), 0);
    assert.equal(pixels, 12);
    assert.deepEqual(
        spans.find((span) => span.dy === -1),
        { dy: -1, dx0: 0, dx1: 1 }
    );
    assert.deepEqual(
        spans.find((span) => span.dy === 0),
        { dy: 0, dx0: -1, dx1: 2 }
    );
});

test('odd brush sizes are symmetric around the cursor pixel', () => {
    for (const size of [3, 5, 9]) {
        const spans = brushSpans(size);
        for (const span of spans) {
            assert.equal(span.dx0, -span.dx1, `size ${size} row ${span.dy}`);
            const mirrored = spans.find((candidate) => candidate.dy === -span.dy);
            assert.ok(mirrored, `size ${size} row ${span.dy} has mirror`);
            assert.equal(mirrored.dx0, span.dx0);
            assert.equal(mirrored.dx1, span.dx1);
        }
    }
});

test('non-positive and fractional brush sizes clamp to whole pixels', () => {
    assert.deepEqual(brushSpans(0), brushSpans(1));
    assert.deepEqual(brushSpans(-3), brushSpans(1));
    assert.deepEqual(brushSpans(2.9), brushSpans(2));
});

test('brush spans clip cleanly at image edges', () => {
    assert.deepEqual(clipBrushSpans(brushSpans(3), 0, 0, 4, 4), [
        { y: 0, x0: 0, x1: 1 },
        { y: 1, x0: 0, x1: 1 },
    ]);
});

test('brush spans outside the image produce no writes', () => {
    const stamp = brushSpans(3);
    assert.deepEqual(clipBrushSpans(stamp, -3, 2, 4, 4), []);
    assert.deepEqual(clipBrushSpans(stamp, 2, 5, 4, 4), []);
    assert.deepEqual(clipBrushSpans(stamp, 0, 0, 0, 4), []);
});

test('stroke line points include both endpoints and leave no gaps', () => {
    assert.deepEqual(strokeLinePoints(0, 0, 3, 0), [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
    ]);
    assert.deepEqual(strokeLinePoints(0, 0, 3, 3), [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
    ]);

    const points = strokeLinePoints(0, 0, 7, 3);
    assert.deepEqual(points[0], [0, 0]);
    assert.deepEqual(points[points.length - 1], [7, 3]);
    for (let index = 1; index < points.length; index++) {
        assert.ok(Math.abs(points[index][0] - points[index - 1][0]) <= 1);
        assert.ok(Math.abs(points[index][1] - points[index - 1][1]) <= 1);
    }
});

test('single-point stroke yields exactly one point', () => {
    assert.deepEqual(strokeLinePoints(5, 5, 5, 5), [[5, 5]]);
});

test('stamping writes the brush color and reports the change', () => {
    const surface = makeSurface(4, 4, RED);
    assert.equal(stampSpansIntoSurface(surface, 1, 1, brushSpans(2), BLUE), true);
    assert.deepEqual(getPx(surface, 1, 1), BLUE);
    assert.deepEqual(getPx(surface, 2, 2), BLUE);
    assert.deepEqual(getPx(surface, 0, 0), RED);
    assert.deepEqual(getPx(surface, 3, 3), RED);
});

test('stamping the same color again reports no change', () => {
    const surface = makeSurface(4, 4, RED);
    assert.equal(stampSpansIntoSurface(surface, 1, 1, brushSpans(3), RED), false);
    assert.equal(stampSpansIntoSurface(surface, 1, 1, brushSpans(3), BLUE), true);
    assert.equal(stampSpansIntoSurface(surface, 1, 1, brushSpans(3), BLUE), false);
});

test('stamping with alpha 0 erases to the canonical transparent pixel', () => {
    const surface = makeSurface(2, 2, RED);
    assert.equal(stampSpansIntoSurface(surface, 0, 0, brushSpans(1), [99, 99, 99, 0]), true);
    assert.deepEqual(getPx(surface, 0, 0), [0, 0, 0, 0]);
    assert.deepEqual(getPx(surface, 1, 0), RED);
});

test('stamps overlapping the image edge clip instead of wrapping', () => {
    const surface = makeSurface(3, 3, RED);
    assert.equal(stampSpansIntoSurface(surface, 0, 0, brushSpans(3), BLUE), true);
    // Only the in-bounds quadrant changed; the far edge stayed intact.
    assert.deepEqual(getPx(surface, 0, 0), BLUE);
    assert.deepEqual(getPx(surface, 1, 0), BLUE);
    assert.deepEqual(getPx(surface, 0, 1), BLUE);
    assert.deepEqual(getPx(surface, 2, 0), RED);
    assert.deepEqual(getPx(surface, 0, 2), RED);
    assert.deepEqual(getPx(surface, 2, 2), RED);
});

test('flood fill replaces the whole connected region', () => {
    const surface = makeSurface(4, 4, RED);
    assert.equal(floodFill(surface, 1, 1, BLUE), true);
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            assert.deepEqual(getPx(surface, x, y), BLUE);
        }
    }
});

test('flood fill stops at differently colored boundaries', () => {
    // Red | green wall at x=2 | red
    const surface = makeSurface(5, 5, RED);
    for (let y = 0; y < 5; y++) setPx(surface, 2, y, GREEN);

    assert.equal(floodFill(surface, 0, 2, BLUE), true);
    for (let y = 0; y < 5; y++) {
        assert.deepEqual(getPx(surface, 0, y), BLUE);
        assert.deepEqual(getPx(surface, 1, y), BLUE);
        assert.deepEqual(getPx(surface, 2, y), GREEN);
        assert.deepEqual(getPx(surface, 3, y), RED);
        assert.deepEqual(getPx(surface, 4, y), RED);
    }
});

test('flood fill is 4-connected and does not leak diagonally', () => {
    const surface = makeSurface(2, 2, GREEN);
    setPx(surface, 0, 0, RED);
    setPx(surface, 1, 1, RED);

    assert.equal(floodFill(surface, 0, 0, BLUE), true);
    assert.deepEqual(getPx(surface, 0, 0), BLUE);
    assert.deepEqual(getPx(surface, 1, 1), RED);
    assert.deepEqual(getPx(surface, 1, 0), GREEN);
    assert.deepEqual(getPx(surface, 0, 1), GREEN);
});

test('flood fill treats same RGB with different alpha as a boundary', () => {
    const surface = makeSurface(3, 1, [10, 20, 30, 255]);
    setPx(surface, 1, 0, [10, 20, 30, 128]);

    assert.equal(floodFill(surface, 0, 0, BLUE), true);
    assert.deepEqual(getPx(surface, 0, 0), BLUE);
    assert.deepEqual(getPx(surface, 1, 0), [10, 20, 30, 128]);
    assert.deepEqual(getPx(surface, 2, 0), [10, 20, 30, 255]);
});

test('flood fill is a no-op when the seed already has the fill color', () => {
    const surface = makeSurface(3, 3, RED);
    const before = Array.from(surface.data);
    assert.equal(floodFill(surface, 1, 1, RED), false);
    assert.deepEqual(Array.from(surface.data), before);
});

test('flood fill rejects out-of-bounds seeds', () => {
    const surface = makeSurface(3, 3, RED);
    assert.equal(floodFill(surface, -1, 0, BLUE), false);
    assert.equal(floodFill(surface, 3, 0, BLUE), false);
    assert.equal(floodFill(surface, 0, 3, BLUE), false);
});

test('flood fill with alpha 0 writes the canonical transparent pixel', () => {
    const surface = makeSurface(2, 1, RED);
    assert.equal(floodFill(surface, 0, 0, [99, 99, 99, 0]), true);
    assert.deepEqual(getPx(surface, 0, 0), [0, 0, 0, 0]);
    assert.deepEqual(getPx(surface, 1, 0), [0, 0, 0, 0]);
});

test('flood fill can fill a transparent region with a solid color', () => {
    const surface = makeSurface(3, 1, [0, 0, 0, 0]);
    setPx(surface, 2, 0, RED);
    assert.equal(floodFill(surface, 0, 0, GREEN), true);
    assert.deepEqual(getPx(surface, 0, 0), GREEN);
    assert.deepEqual(getPx(surface, 1, 0), GREEN);
    assert.deepEqual(getPx(surface, 2, 0), RED);
});

test('hardening splits anti-aliased pixels into exact color or transparent', () => {
    const data = new Uint8ClampedArray([
        // one pixel per line: r, g, b, a
        90, 90, 90, 255, // fully opaque → kept
        50, 60, 70, TEXT_ALPHA_THRESHOLD, // exactly at threshold → kept
        50, 60, 70, TEXT_ALPHA_THRESHOLD - 1, // just below → dropped
        0, 0, 0, 0, // transparent → stays canonical transparent
    ]);
    hardenAlphaToColor(data, [17, 34, 51]);

    assert.deepEqual(Array.from(data.slice(0, 4)), [17, 34, 51, 255]);
    assert.deepEqual(Array.from(data.slice(4, 8)), [17, 34, 51, 255]);
    assert.deepEqual(Array.from(data.slice(8, 12)), [0, 0, 0, 0]);
    assert.deepEqual(Array.from(data.slice(12, 16)), [0, 0, 0, 0]);
});

test('text wraps greedily at spaces within the box width', () => {
    assert.deepEqual(wrapTextLines('the quick brown fox', 100, measure10), [
        'the quick',
        'brown fox',
    ]);
});

test('text that fits stays on one line', () => {
    assert.deepEqual(wrapTextLines('hello', 100, measure10), ['hello']);
});

test('explicit newlines are preserved, including empty lines', () => {
    assert.deepEqual(wrapTextLines('one\n\ntwo', 100, measure10), ['one', '', 'two']);
});

test('a single word wider than the box breaks mid-word', () => {
    assert.deepEqual(wrapTextLines('abcdefghij', 50, measure10), ['abcde', 'fghij']);
});

test('an over-wide word after other words starts on its own line', () => {
    assert.deepEqual(wrapTextLines('hi abcdefgh', 50, measure10), ['hi', 'abcde', 'fgh']);
});

test('picked colors format as lowercase hex and round-trip through parse', () => {
    assert.equal(rgbToHex(0x30, 0x50, 0xc0), '#3050c0');
    assert.equal(rgbToHex(-5, 300, 128), '#00ff80');
    assert.deepEqual(parseHexColor(rgbToHex(0xa1, 0xb2, 0xc3)), [0xa1, 0xb2, 0xc3]);
});
