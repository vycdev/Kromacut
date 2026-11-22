import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isTruncatedImageData } from '../src/lib/imageTruncation.ts';

const fixture = (name: string) =>
    new Uint8Array(readFileSync(new URL(`./assets/${name}`, import.meta.url)));

function cutPoints(bytes: Uint8Array): Uint8Array[] {
    return Array.from({ length: 19 }, (_, i) =>
        bytes.subarray(0, Math.floor((bytes.length * (i + 1)) / 20))
    );
}

function pngChunk(type: string, data: number[] = []): number[] {
    const length = data.length;
    return [
        (length >>> 24) & 0xff,
        (length >>> 16) & 0xff,
        (length >>> 8) & 0xff,
        length & 0xff,
        ...[...type].map((c) => c.charCodeAt(0)),
        ...data,
        0,
        0,
        0,
        0,
    ];
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const segment = (marker: number, data: number[]) => [
    0xff,
    marker,
    ((data.length + 2) >> 8) & 0xff,
    (data.length + 2) & 0xff,
    ...data,
];
const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];

test('complete PNG and JPEG fixtures are not truncated', () => {
    for (const name of ['rocco__source.png', '1024x1024p.png', '3888x2916p.jpg']) {
        assert.equal(isTruncatedImageData(fixture(name)), false, name);
    }
});

test('PNG and JPEG fixtures cut anywhere are truncated', () => {
    for (const name of ['rocco__source.png', '1024x1024p.png', '3888x2916p.jpg']) {
        for (const cut of cutPoints(fixture(name))) {
            assert.equal(isTruncatedImageData(cut), true, `${name} cut at ${cut.length}`);
        }
    }
});

test('PNG completeness depends on reaching IEND, not on what follows it', () => {
    const header = [...PNG_SIGNATURE, ...pngChunk('IHDR', Array(13).fill(0))];
    const idat = pngChunk('IDAT', [1, 2, 3, 4]);
    const complete = [...header, ...idat, ...pngChunk('IEND')];
    assert.equal(isTruncatedImageData(new Uint8Array(complete)), false);
    assert.equal(
        isTruncatedImageData(new Uint8Array([...complete, 0x74, 0x61, 0x69, 0x6c])),
        false
    );
    assert.equal(isTruncatedImageData(new Uint8Array([...header, ...idat])), true);
    // An IDAT whose declared length runs past the end of the file.
    assert.equal(isTruncatedImageData(new Uint8Array([...header, ...idat.slice(0, 10)])), true);
});

test('JPEG scans are followed through stuffed bytes, restart markers, and progressive scans', () => {
    const scanData = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xff, 0xff, 0xd1, 0x78];
    const scan = [...segment(0xda, [1, 1, 0, 0, 63, 0]), ...scanData];
    const header = [...SOI, ...segment(0xdb, Array(65).fill(1)), ...segment(0xc2, [8, 0, 1])];
    const complete = [...header, ...scan, ...segment(0xc4, [0, 1]), ...scan, ...EOI];
    assert.equal(isTruncatedImageData(new Uint8Array(complete)), false);
    for (let length = 3; length < complete.length - 1; length++) {
        assert.equal(
            isTruncatedImageData(new Uint8Array(complete.slice(0, length))),
            true,
            `cut at ${length}`
        );
    }
    // Data after EOI, such as a camera trailer, is ignored.
    assert.equal(isTruncatedImageData(new Uint8Array([...complete, 1, 2, 3])), false);
});

test("an EXIF thumbnail's EOI does not count as the end of the JPEG", () => {
    const thumbnail = [...SOI, 0xff, 0xda, 0, 2, 9, 9, ...EOI];
    const app1 = segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, ...thumbnail]);
    const scan = [...segment(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0x34, 0x56];
    assert.equal(isTruncatedImageData(new Uint8Array([...SOI, ...app1, ...scan])), true);
    assert.equal(isTruncatedImageData(new Uint8Array([...SOI, ...app1, ...scan, ...EOI])), false);
});

test('WebP completeness follows the RIFF size', () => {
    const webp = (declared: number, payload: number) =>
        new Uint8Array([
            0x52,
            0x49,
            0x46,
            0x46,
            declared & 0xff,
            (declared >> 8) & 0xff,
            (declared >> 16) & 0xff,
            (declared >> 24) & 0xff,
            0x57,
            0x45,
            0x42,
            0x50,
            ...Array(payload).fill(0),
        ]);
    assert.equal(isTruncatedImageData(webp(24, 20)), false);
    assert.equal(isTruncatedImageData(webp(24, 26)), false);
    assert.equal(isTruncatedImageData(webp(24, 19)), true);
});

test('other formats and malformed headers are left to the decoder', () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0]);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const text = new TextEncoder().encode('this is plain text, not image data');
    const badJpegSegment = new Uint8Array([...SOI, 0xff, 0xe0, 0, 4, 0, 0, 0x12, 0x34]);
    for (const bytes of [gif, svg, text, badJpegSegment, new Uint8Array()]) {
        assert.equal(isTruncatedImageData(bytes), false);
    }
});
