import { useCallback, useEffect, useRef, useState } from 'react';
import { createImageCanvas } from '../lib/imageCanvas';
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
            // Refused canvases stay transparent, but privacy protections can add
            // small alpha noise. Use the midpoint between transparent and opaque.
            if (context.getImageData(w - 1, h - 1, 1, 1).data[3] < 128) return false;
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
    const busyTimerRef = useRef<number | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<ImageImportError | null>(null);

    const finishChecking = useCallback(() => {
        if (busyTimerRef.current !== null) window.clearTimeout(busyTimerRef.current);
        busyTimerRef.current = null;
        setIsImporting(false);
    }, []);

    useEffect(
        () => () => {
            requestRef.current += 1;
            if (busyTimerRef.current !== null) window.clearTimeout(busyTimerRef.current);
        },
        []
    );

    const cancelPendingImport = useCallback(() => {
        requestRef.current += 1;
        finishChecking();
        setImportError(null);
    }, [finishChecking]);

    const dismissImportError = useCallback(() => setImportError(null), []);

    /**
     * Validates the file, then copies and closes its decode. Commit takes
     * ownership of the URL and an immutable canvas snapshot. Unreadable or
     * oversized files leave the image, undo stack, and swatches intact.
     */
    const importFile = useCallback(
        async (
            file: File,
            hasImage: boolean,
            commit: (url: string, canvas: HTMLCanvasElement) => void
        ) => {
            const request = ++requestRef.current;
            finishChecking();
            // Avoid flashing a spinner for the usual fast checks.
            busyTimerRef.current = window.setTimeout(() => {
                busyTimerRef.current = null;
                if (request === requestRef.current) setIsImporting(true);
            }, 150);
            // Convert profiled colors before premultiplying alpha, as <img>
            // does on history reloads. Premultiplying in the source color space
            // first can change translucent Display P3 pixels in Chromium.
            const result = await validateImageFile(file, { premultiplyAlpha: 'none' });
            if (request !== requestRef.current) {
                if (result.ok) {
                    result.image.close();
                    URL.revokeObjectURL(result.url);
                }
                return;
            }
            finishChecking();
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
            const { width, height } = result.image;
            const maxSquareSide = importMaxSquareSide();
            // Past the canvas limits the preview would stay blank, so refuse the image.
            if (
                !fitsImageCanvasLimits(width, height, maxSquareSide * maxSquareSide) ||
                !canDrawCanvasDimensions(width, height)
            ) {
                result.image.close();
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
            let canvas: HTMLCanvasElement;
            try {
                // createImageCanvas consumes the decode, including on failure.
                canvas = createImageCanvas(result.image);
            } catch {
                URL.revokeObjectURL(result.url);
                setImportError({ kind: 'undecodable', name: file.name, keptImage: hasImage });
                return;
            }
            setImportError(null);
            commit(result.url, canvas);
        },
        [finishChecking]
    );

    return { importFile, importError, isImporting, dismissImportError, cancelPendingImport };
}
