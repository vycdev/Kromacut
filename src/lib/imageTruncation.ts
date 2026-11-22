/**
 * Detects PNG, JPEG, and WebP files that end before their format's final marker,
 * such as a partly downloaded file. WebKit decodes these to a partial image
 * without reporting an error, so a decode alone cannot catch them.
 *
 * Returns true only when the file is one of these formats and its structure runs
 * past the end of the data. Other formats and malformed headers return false, so
 * the browser's decoder still decides whether they are readable.
 */
export function isTruncatedImageData(bytes: Uint8Array): boolean {
    if (startsWith(bytes, PNG_SIGNATURE)) return isTruncatedPng(bytes);
    if (startsWith(bytes, JPEG_SIGNATURE)) return isTruncatedJpeg(bytes);
    if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return isTruncatedWebp(bytes);
    return false;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const IEND = [0x49, 0x45, 0x4e, 0x44];

function startsWith(bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean {
    if (bytes.length < offset + prefix.length) return false;
    return prefix.every((value, i) => bytes[offset + i] === value);
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian = false): number {
    return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, littleEndian);
}

/** Walks the chunk list; a complete PNG reaches its IEND chunk. */
function isTruncatedPng(bytes: Uint8Array): boolean {
    let offset = PNG_SIGNATURE.length;
    while (offset + 8 <= bytes.length) {
        if (startsWith(bytes, IEND, offset + 4)) return false;
        // Length, type, data, and CRC.
        offset += 12 + readUint32(bytes, offset);
    }
    return true;
}

const isRestartMarker = (marker: number) => marker >= 0xd0 && marker <= 0xd7;

/**
 * Walks the marker segments and the entropy-coded data after each start of scan,
 * including every scan of a progressive JPEG. A complete JPEG reaches its EOI
 * marker. An embedded EXIF thumbnail's EOI sits inside a length-prefixed segment,
 * so it is skipped rather than mistaken for the end of the image.
 */
function isTruncatedJpeg(bytes: Uint8Array): boolean {
    let offset = 2;
    while (offset + 1 < bytes.length) {
        if (bytes[offset] !== 0xff) return false;
        const marker = bytes[offset + 1];
        if (marker === 0xd9) return false;
        if (marker === 0xff) {
            // Fill byte before a marker.
            offset += 1;
            continue;
        }
        if (marker === 0x01 || isRestartMarker(marker)) {
            offset += 2;
            continue;
        }
        if (offset + 4 > bytes.length) return true;
        offset += 2 + ((bytes[offset + 2] << 8) | bytes[offset + 3]);
        if (marker !== 0xda) continue;
        // Entropy-coded data ends at the next marker other than a stuffed 0xFF00
        // byte, a fill byte, or a restart marker.
        while (offset + 1 < bytes.length) {
            const next = bytes[offset + 1];
            const continuesScan = next === 0x00 || next === 0xff || isRestartMarker(next);
            if (bytes[offset] === 0xff && !continuesScan) break;
            offset += 1;
        }
    }
    return true;
}

/** The RIFF header records the size of the rest of the file. */
function isTruncatedWebp(bytes: Uint8Array): boolean {
    return 8 + readUint32(bytes, 4, true) > bytes.length;
}
