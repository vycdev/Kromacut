import { useCallback, useEffect, useRef, useState } from 'react';
import { loadImageCanvas } from '../lib/imageCanvas';

/** Shares committed pixels without retaining decoded bitmaps in image history. */
export function useImageCanvas(imageSrc: string | null) {
    // A matching result with no canvas records a failed load, distinct from a
    // load still in progress or an empty workspace.
    const [result, setResult] = useState<{ src: string; canvas: HTMLCanvasElement | null } | null>(
        null
    );
    const preparedRef = useRef<{ src: string; canvas: HTMLCanvasElement } | null>(null);
    const cancelLoadRef = useRef<(() => void) | null>(null);

    // Imports already decoded during validation. Publish their snapshot in the
    // same event as the history commit, without a second URL decode.
    const prepareImageCanvas = useCallback((src: string, canvas: HTMLCanvasElement) => {
        cancelLoadRef.current?.();
        preparedRef.current = { src, canvas };
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
            void loadImageCanvas(imageSrc, () => !cancelled)
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

    return {
        // Never expose pixels belonging to the previous history entry while a
        // new URL is loading. An obsolete completion cannot publish them either.
        imageCanvas: result?.src === imageSrc ? result.canvas : null,
        imageCanvasLoading: !!imageSrc && result?.src !== imageSrc,
        prepareImageCanvas,
    };
}
