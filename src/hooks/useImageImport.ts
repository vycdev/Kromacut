import { useCallback, useRef, useState } from 'react';
import { validateImageFile } from '../lib/imageFile';

// Kept untranslated so the notice follows language changes while it is open.
// keptImage records whether an image was on screen when the import failed, which
// decides whether the notice says the current image was kept.
export type ImageImportError =
    | { kind: 'notImage' }
    | { kind: 'undecodable'; name: string; keptImage: boolean };

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
     * ownership of it. Unreadable files leave the current image, its undo stack,
     * and its swatches intact.
     */
    const importFile = useCallback(
        async (file: File, hasImage: boolean, commit: (url: string) => void) => {
            const request = ++requestRef.current;
            const result = await validateImageFile(file);
            // The preview and swatches decode the committed URL themselves.
            if (result.ok) result.image.close();
            if (request !== requestRef.current) {
                if (result.ok) URL.revokeObjectURL(result.url);
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
            setImportError(null);
            commit(result.url);
        },
        []
    );

    return { importFile, importError, dismissImportError, cancelPendingImport };
}
