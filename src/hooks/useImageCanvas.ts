import { useCallback, useEffect, useRef, useState } from 'react';
import { loadImageCanvas } from '../lib/imageCanvas';

/** Shares committed pixels without retaining decoded bitmaps in image history. */
export function useImageCanvas(imageSrc: string | null) {
    const [ready, setReady] = useState<{ src: string; canvas: HTMLCanvasElement } | null>(null);
    const preparedRef = useRef<typeof ready>(null);
    const cancelLoadRef = useRef<(() => void) | null>(null);

    // Imports already decoded during validation. Publish their snapshot in the
    // same event as the history commit, without a second URL decode.
    const prepareImageCanvas = useCallback((src: string, canvas: HTMLCanvasElement) => {
        cancelLoadRef.current?.();
        preparedRef.current = { src, canvas };
        setReady(preparedRef.current);
    }, []);

    useEffect(() => {
        let cancelled = false;
        cancelLoadRef.current = () => {
            cancelled = true;
        };
        if (!imageSrc) {
            preparedRef.current = null;
            setReady(null);
        } else if (preparedRef.current?.src !== imageSrc) {
            preparedRef.current = null;
            setReady(null);
            void loadImageCanvas(imageSrc, () => !cancelled)
                .then((canvas) => {
                    if (cancelled || !canvas) return;
                    setReady({ src: imageSrc, canvas });
                })
                .catch((error) => {
                    if (!cancelled) {
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
        imageCanvas: ready?.src === imageSrc ? ready.canvas : null,
        prepareImageCanvas,
    };
}
