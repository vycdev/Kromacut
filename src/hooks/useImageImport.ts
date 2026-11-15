import { useCallback, useRef, useState } from 'react';
import {
    fitsImageCanvasLimits,
    IOS_MAX_SQUARE_IMAGE_SIDE,
    MAX_SQUARE_IMAGE_SIDE,
    validateImageFile,
} from '../lib/imageFile';

function importMaxSquareSide(): number {
    const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isIOS ? IOS_MAX_SQUARE_IMAGE_SIDE : MAX_SQUARE_IMAGE_SIDE;
}

/** Test each axis without allocating a full-size image canvas (at most 256 KB). */
function canDrawCanvasDimensions(width: number, height: number): boolean {
    const canvas = document.createElement('canvas');
    try {
        for (const [w, h] of [
            [width, 1],
            [1, height],
        ]) {
            canvas.width = w;
            canvas.height = h;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) return false;
            context.fillRect(w - 1, h - 1, 1, 1);
            // Chromium can silently refuse a canvas; Firefox can throw instead.
            if (context.getImageData(w - 1, h - 1, 1, 1).data[3] !== 255) return false;
        }
        return true;
    } catch {
        return false;
    } finally {
        // Release the probe's backing store, including after a refused dimension.
        canvas.width = canvas.height = 1;
    }
}

// Kept untranslated so the notice follows language changes while it is open.
// keptImage records whether an image was on screen when the import failed, which
// decides whether the notice says the current image was kept.
export type ImageImportError =
    | { kind: 'notImage' }
    | { kind: 'undecodable'; name: string; keptImage: boolean }
    | {
          kind: 'tooLarge';
          name: string;
          width: number;
          height: number;
          maxSquareSide: number;
          keptImage: boolean;
      };

/**
 * Checks chosen or dropped image files before they reach image history and holds
 * the error for a file that cannot be imported.
 *
 * Pass cancelPendingImport to useImageHistory as onBeforeSet. Every history change
 * (set, clear, undo, redo) then cancels a pending import, so edits such as Remove
 * image, Undo, crop, or resize made while a file is being checked win over it. It
 * also closes the error, so the notice never describes a different image.
 */
export function useImageImport() {
    // Each import takes a token and commits only if no newer image change has
    // happened while it was being checked.
    const requestRef = useRef(0);
    const [importError, setImportError] = useState<ImageImportError | null>(null);

    const cancelPendingImport = useCallback(() => {
        requestRef.current += 1;
        setImportError(null);
    }, []);

    const dismissImportError = useCallback(() => setImportError(null), []);

    /**
     * Validates the file, then hands its object URL to commit, which takes
     * ownership of it. Unreadable or oversized files leave the current image, its
     * undo stack, and its swatches intact.
     */
    const importFile = useCallback(
        async (file: File, hasImage: boolean, commit: (url: string) => void) => {
            const request = ++requestRef.current;
            const result = await validateImageFile(file);
            if (request !== requestRef.current) {
                if (result.ok) {
                    result.image.close();
                    URL.revokeObjectURL(result.url);
                }
                return;
            }
            if (!result.ok) {
                // The request check above means the image has not changed since
                // this import started, so hasImage still describes the screen.
                setImportError(
                    result.reason === 'notImage'
                        ? { kind: 'notImage' }
                        : { kind: 'undecodable', name: file.name, keptImage: hasImage }
                );
                return;
            }
            // The preview and swatches decode the committed URL themselves. Read the
            // size first: a closed ImageBitmap reports zero.
            const { width, height } = result.image;
            result.image.close();
            const maxSquareSide = importMaxSquareSide();
            // Past the canvas limits the preview would stay blank, so refuse the image.
            if (
                !fitsImageCanvasLimits(width, height, maxSquareSide * maxSquareSide) ||
                !canDrawCanvasDimensions(width, height)
            ) {
                URL.revokeObjectURL(result.url);
                setImportError({
                    kind: 'tooLarge',
                    name: file.name,
                    width,
                    height,
                    maxSquareSide,
                    keptImage: hasImage,
                });
                return;
            }
            setImportError(null);
            commit(result.url);
        },
        []
    );

    return { importFile, importError, dismissImportError, cancelPendingImport };
}
