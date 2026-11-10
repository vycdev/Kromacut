import { decodeImage } from './decodeImage.ts';
import { isTruncatedImageData } from './imageTruncation.ts';

/**
 * Whether a chosen or dropped file should be treated as an image. Some platforms
 * and desktop WebViews report an empty MIME type for valid images, so fall back
 * to the file extension. The browser's decoder still decides whether it reads.
 */
export function isImageFile(file: Pick<File, 'name' | 'type'>): boolean {
    return (
        file.type.startsWith('image/') ||
        (!file.type && /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name))
    );
}

/**
 * A decoded image file, ready to draw. Call close() once it is no longer needed
 * to release its pixels.
 */
export type DecodedImage = {
    source: CanvasImageSource;
    width: number;
    height: number;
    close: () => void;
};

/**
 * Decodes a file once, refusing it if it is incomplete.
 *
 * An `<img>` still loads a truncated or partly damaged raster file and shows only
 * the rows it could decode. WebKit, which the macOS and Linux desktop apps use,
 * also accepts truncated files in `createImageBitmap`, so first check PNG, JPEG,
 * and WebP for their end marker on every engine. Raster files then decode with
 * `createImageBitmap` alone: in Chromium and WebKit it accepts the same formats as
 * `<img>`, applies the same EXIF orientation, and also catches other damage in
 * Chrome. Chrome rejects SVG blobs there, so SVGs, and engines without
 * `createImageBitmap`, decode in an `<img>` instead. Reading the bytes can also
 * fail, for example when the file changes on disk after it was chosen.
 */
async function decodeImageFile(file: Blob, url: string): Promise<DecodedImage | null> {
    try {
        if (isTruncatedImageData(new Uint8Array(await file.arrayBuffer()))) return null;
        if (file.type === 'image/svg+xml' || typeof createImageBitmap !== 'function') {
            const image = await decodeImage(url);
            if (!image) return null;
            const { naturalWidth: width, naturalHeight: height } = image;
            return { source: image, width, height, close: () => {} };
        }
        const bitmap = await createImageBitmap(file);
        const { width, height } = bitmap;
        return { source: bitmap, width, height, close: () => bitmap.close() };
    } catch {
        return null;
    }
}

export type ImageFileValidation =
    | { ok: true; image: DecodedImage; url: string }
    | { ok: false; reason: 'notImage' | 'undecodable' };

/**
 * Checks that a chosen or dropped file is an image the browser can read in full.
 * On success the caller owns the decoded image and the returned object URL, and
 * must close the image and revoke the URL when they are no longer needed; on
 * failure no URL is left open.
 */
export async function validateImageFile(file: File): Promise<ImageFileValidation> {
    if (!isImageFile(file)) return { ok: false, reason: 'notImage' };
    const url = URL.createObjectURL(file);
    const image = await decodeImageFile(file, url);
    if (image) return { ok: true, image, url };
    URL.revokeObjectURL(url);
    return { ok: false, reason: 'undecodable' };
}
