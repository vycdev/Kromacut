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
