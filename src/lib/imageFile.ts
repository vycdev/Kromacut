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

/** Resolves to null when the browser cannot decode the URL as an image. */
export function decodeImage(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image.naturalWidth && image.naturalHeight ? image : null);
        image.onerror = () => resolve(null);
        image.src = url;
    });
}

/**
 * An `<img>` still loads a truncated or partly damaged raster file and shows only
 * the rows it could decode. WebKit, which the macOS and Linux desktop apps use,
 * also accepts truncated files in `createImageBitmap`, so first check PNG, JPEG,
 * and WebP for their end marker on every engine. `createImageBitmap` then catches
 * other damage in Chrome. Chrome rejects SVG blobs there, so SVGs rely on the
 * `<img>` decode alone. Reading the bytes can also fail, for example when the
 * file changes on disk after it was chosen.
 */
async function isCompleteRasterImage(file: Blob): Promise<boolean> {
    try {
        if (isTruncatedImageData(new Uint8Array(await file.arrayBuffer()))) return false;
        if (file.type === 'image/svg+xml' || typeof createImageBitmap !== 'function') return true;
        const bitmap = await createImageBitmap(file);
        bitmap.close();
        return true;
    } catch {
        return false;
    }
}

export type ImageFileValidation =
    | { ok: true; image: HTMLImageElement; url: string }
    | { ok: false; reason: 'notImage' | 'undecodable' };

/**
 * Checks that a chosen or dropped file is an image the browser can read in full.
 * On success the caller owns the returned object URL and must revoke it when it
 * is no longer needed; on failure no URL is left open.
 */
export async function validateImageFile(file: File): Promise<ImageFileValidation> {
    if (!isImageFile(file)) return { ok: false, reason: 'notImage' };
    const url = URL.createObjectURL(file);
    const image = await decodeImage(url);
    if (image && (await isCompleteRasterImage(file))) return { ok: true, image, url };
    URL.revokeObjectURL(url);
    return { ok: false, reason: 'undecodable' };
}
