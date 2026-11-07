/**
 * Loads `url` into an `<img>` and resolves once it has decoded. Resolves null,
 * never rejects, when the browser cannot decode the URL as an image or the image
 * has no width or height, so callers only need a single `if (!img)` check.
 */
export function decodeImage(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image.naturalWidth && image.naturalHeight ? image : null);
        image.onerror = () => resolve(null);
        image.src = url;
    });
}
