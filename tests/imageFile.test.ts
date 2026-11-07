import assert from 'node:assert/strict';
import test from 'node:test';
import { isImageFile } from '../src/lib/imageFile.ts';

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
