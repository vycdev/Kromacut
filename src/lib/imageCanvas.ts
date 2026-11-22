import { decodeImage } from './decodeImage.ts';
import { decodeImageBlob, validateImageFile, type DecodedImage } from './imageFile.ts';

const BITMAP_OPTIONS = { premultiplyAlpha: 'none' } as const;

/** Import and restore an encoded file with the same pixel conversion policy. */
export function validateCanvasImageFile(file: File) {
    return validateImageFile(file, BITMAP_OPTIONS);
}

/**
 * Takes ownership of a decode and copies its pixels before closing it, even if
 * canvas allocation or drawing fails. The returned canvas is an immutable
 * snapshot for consumers; editors must copy it before changing pixels.
 */
export function createImageCanvas(image: DecodedImage): HTMLCanvasElement {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Image canvas unavailable');
        context.imageSmoothingEnabled = false;
        context.drawImage(image.source, 0, 0, image.width, image.height);
        return canvas;
    } finally {
        image.close();
    }
}

/** One URL decode for edits, history, and the starter image. */
export async function loadImageCanvas(
    src: string,
    isCurrent: () => boolean = () => true,
    sourceFile?: Blob
): Promise<HTMLCanvasElement | null> {
    if (!isCurrent()) return null;
    if (sourceFile) {
        // Restoring an import must repeat its original decoder and settings:
        // <img> can round profiled pixels differently from createImageBitmap.
        const image = await decodeImageBlob(sourceFile, src, BITMAP_OPTIONS);
        if (!image) return null;
        if (!isCurrent()) {
            image.close();
            return null;
        }
        return createImageCanvas(image);
    }
    // Edited PNG snapshots are already in the canvas's sRGB color space.
    const image = await decodeImage(src);
    if (!image || !isCurrent()) return null;
    return createImageCanvas({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => {},
    });
}
