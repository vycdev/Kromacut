import { useCallback, useEffect, useRef, useState } from 'react';
import { loadImageCanvas } from '../lib/imageCanvas';

/** Shares committed pixels without retaining decoded bitmaps in image history. */
export function useImageCanvas(
    imageSrc: string | null,
    past: readonly string[],
    future: readonly string[]
) {
    // A matching result with no canvas records a failed load, distinct from a
    // load still in progress or an empty workspace.
    const [result, setResult] = useState<{ src: string; canvas: HTMLCanvasElement | null } | null>(
        null
    );
    const preparedRef = useRef<{ src: string; canvas: HTMLCanvasElement } | null>(null);
    const cancelLoadRef = useRef<(() => void) | null>(null);
    // These files share the encoded data already owned by history's object
    // URLs. Keep no decoded bitmaps here, and release unreachable references.
    const importedFilesRef = useRef(new Map<string, File>());

    // Imports already decoded during validation. Publish their snapshot in the
    // same event as the history commit, without a second URL decode.
    const prepareImageCanvas = useCallback((src: string, canvas: HTMLCanvasElement, file: File) => {
        cancelLoadRef.current?.();
        preparedRef.current = { src, canvas };
        importedFilesRef.current.set(src, file);
        setResult(preparedRef.current);
    }, []);

    useEffect(() => {
        let cancelled = false;
        cancelLoadRef.current = () => {
            cancelled = true;
        };
        if (!imageSrc) {
            preparedRef.current = null;
            setResult(null);
        } else if (preparedRef.current?.src !== imageSrc) {
            preparedRef.current = null;
            setResult(null);
            void loadImageCanvas(imageSrc, () => !cancelled, importedFilesRef.current.get(imageSrc))
                .then((canvas) => {
                    if (cancelled) return;
                    setResult({ src: imageSrc, canvas });
                })
                .catch((error) => {
                    if (!cancelled) {
                        setResult({ src: imageSrc, canvas: null });
                        console.warn('Image canvas could not be loaded', error);
                    }
                });
        }
        return () => {
            cancelled = true;
        };
    }, [imageSrc]);

    useEffect(() => {
        const retained = new Set([...past, ...future]);
        if (imageSrc) retained.add(imageSrc);
        // A prepared import is published in the same batch as its history
        // commit. An older render's effect must not prune that pending file.
        if (preparedRef.current) retained.add(preparedRef.current.src);
        for (const src of importedFilesRef.current.keys()) {
            if (!retained.has(src)) importedFilesRef.current.delete(src);
        }
    }, [imageSrc, past, future]);

    return {
        // Never expose pixels belonging to the previous history entry while a
        // new URL is loading. An obsolete completion cannot publish them either.
        imageCanvas: result?.src === imageSrc ? result.canvas : null,
        imageCanvasLoading: !!imageSrc && result?.src !== imageSrc,
        prepareImageCanvas,
    };
}
