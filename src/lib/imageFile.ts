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

type BitmapDecodeOptions = Pick<ImageBitmapOptions, 'premultiplyAlpha'>;

/**
 * Decodes a checked image blob once. The caller owns the returned decode and
 * closes it; ownership of the supplied URL stays with the caller.
 *
 * An `<img>` still loads a truncated or partly damaged raster file and shows only
 * the rows it could decode. WebKit, which the macOS and Linux desktop apps use,
 * also accepts truncated files in `createImageBitmap`, so first check PNG, JPEG,
 * and WebP for their end marker in validateImageFile on every engine. Raster
 * files decode with `createImageBitmap` alone: in Chromium and WebKit it accepts the same formats as
 * `<img>`, applies the same EXIF orientation, and also catches other damage in
 * Chrome. Chrome rejects SVG blobs there, so SVGs, and engines without
 * `createImageBitmap`, decode in an `<img>` instead.
 */
export async function decodeImageBlob(
    file: Blob,
    url: string,
    bitmapOptions?: BitmapDecodeOptions
): Promise<DecodedImage | null> {
    try {
        if (file.type === 'image/svg+xml' || typeof createImageBitmap !== 'function') {
            const image = await decodeImage(url);
            if (!image) return null;
            const { naturalWidth: width, naturalHeight: height } = image;
            return { source: image, width, height, close: () => {} };
        }
        const bitmap = bitmapOptions
            ? await createImageBitmap(file, bitmapOptions)
            : await createImageBitmap(file);
        const { width, height } = bitmap;
        return { source: bitmap, width, height, close: () => bitmap.close() };
    } catch {
        return null;
    }
}

/**
 * Conservative import bounds: the preview copies images into full-size canvases.
 * Chromium and desktop WebKit cap canvas area at 16,384² pixels. Current engines
 * can draw thin canvases beyond 32,767 pixels, but older Firefox cannot, so the
 * import hook also probes the requested dimensions with one-pixel-wide canvases.
 */
export const MAX_IMAGE_SIDE = 65535;
export const MAX_SQUARE_IMAGE_SIDE = 16384;
export const MAX_IMAGE_PIXELS = MAX_SQUARE_IMAGE_SIDE * MAX_SQUARE_IMAGE_SIDE;
// Older iOS WebKit caps area at 4,096²; newer versions allow 8,192². Keep the
// lower budget for compatibility, including iPads that request desktop websites.
export const IOS_MAX_SQUARE_IMAGE_SIDE = 4096;
export const IOS_MAX_IMAGE_PIXELS = IOS_MAX_SQUARE_IMAGE_SIDE * IOS_MAX_SQUARE_IMAGE_SIDE;

/** Whether dimensions fit the import budget, before browser capability checks. */
export function fitsImageCanvasLimits(
    width: number,
    height: number,
    maxPixels = MAX_IMAGE_PIXELS
): boolean {
    return (
        Number.isSafeInteger(width) &&
        Number.isSafeInteger(height) &&
        width > 0 &&
        height > 0 &&
        width <= MAX_IMAGE_SIDE &&
        height <= MAX_IMAGE_SIDE &&
        width * height <= maxPixels
    );
}

export type ImageFileValidation =
    | { ok: true; image: DecodedImage; url: string; sourceFile: File }
    | { ok: false; reason: 'notImage' | 'undecodable' };

/**
 * Checks that a chosen or dropped file is an image the browser can read in full.
 * On success the caller owns the decoded image and the returned object URL, and
 * must close the image and revoke the URL when they are no longer needed; on
 * failure no URL is left open. sourceFile is the immutable encoded file backing
 * the URL, which history can retain without keeping decoded pixels. Bitmap
 * options are opt-in so existing consumers, including Stack Matrix, retain
 * their current pixel conversion and sampling.
 */
export async function validateImageFile(
    file: File,
    bitmapOptions?: BitmapDecodeOptions
): Promise<ImageFileValidation> {
    if (!isImageFile(file)) return { ok: false, reason: 'notImage' };
    const url = URL.createObjectURL(file);
    try {
        if (!isTruncatedImageData(new Uint8Array(await file.arrayBuffer()))) {
            const image = await decodeImageBlob(file, url, bitmapOptions);
            if (image) return { ok: true, image, url, sourceFile: file };
        }
    } catch {
        // Reading the chosen file can fail before its bytes reach a decoder.
    }
    URL.revokeObjectURL(url);
    return { ok: false, reason: 'undecodable' };
}
