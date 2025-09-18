import { useCallback, useEffect, useRef, useState } from 'react';

// Manages image history (undo/redo) and objectURL revocation.
export function useImageHistory(initial: string | null, onBeforeSet?: () => void) {
    const [imageSrc, setImageSrc] = useState<string | null>(initial);
    const [past, setPast] = useState<string[]>([]);
    const [future, setFuture] = useState<string[]>([]);

    const imageRef = useRef<string | null>(initial);
    const pastRef = useRef<string[]>([]);
    const futureRef = useRef<string[]>([]);
    useEffect(() => {
        imageRef.current = imageSrc;
    }, [imageSrc]);
    useEffect(() => {
        pastRef.current = past;
    }, [past]);
    useEffect(() => {
        futureRef.current = future;
    }, [future]);

    useEffect(() => {
        return () => {
            const revokeIf = (u: string | null) => {
                if (u && u.startsWith('blob:')) {
                    try {
                        URL.revokeObjectURL(u);
                    } catch {
                        /* ignore revoke error */
                    }
                }
            };
            revokeIf(imageRef.current);
            pastRef.current.forEach(revokeIf);
            futureRef.current.forEach(revokeIf);
        };
    }, []);

    const setImage = useCallback(
        (next: string | null, pushHistory = true) => {
            if (onBeforeSet) onBeforeSet();
            setFuture([]);
            setImageSrc((prev) => {
                if (pushHistory && prev)
                    setPast((p) => {
                        // avoid pushing the same URL twice in a row
                        if (p.length > 0 && p[p.length - 1] === prev) return p;
                        return [...p, prev];
                    });
                return next;
            });
        },
        [onBeforeSet]
    );

    const undo = useCallback(() => {
        setPast((p) => {
            if (p.length === 0) return p;
            const prev = p[p.length - 1];
            setFuture((f) => {
                // avoid pushing duplicate current image into future
                if (imageRef.current) {
                    if (f.length > 0 && f[f.length - 1] === imageRef.current) return f;
                    return [...f, imageRef.current];
                }
                return f;
            });
            if (onBeforeSet) onBeforeSet();
            setImageSrc(prev);
            return p.slice(0, p.length - 1);
        });
    }, [onBeforeSet]);

    const redo = useCallback(() => {
        setFuture((f) => {
            if (f.length === 0) return f;
            const next = f[f.length - 1];
            setPast((p) => {
                if (imageRef.current) {
                    if (p.length > 0 && p[p.length - 1] === imageRef.current) return p;
                    return [...p, imageRef.current];
                }
                return p;
            });
            if (onBeforeSet) onBeforeSet();
            setImageSrc(next);
            return f.slice(0, f.length - 1);
        });
    }, [onBeforeSet]);

    const clearCurrent = useCallback(() => {
        if (imageSrc && !past.includes(imageSrc) && !future.includes(imageSrc)) {
            try {
                URL.revokeObjectURL(imageSrc);
            } catch {
                /* ignore revoke error */
            }
        }
        if (onBeforeSet) onBeforeSet();
        setImageSrc(null);
    }, [imageSrc, past, future, onBeforeSet]);

    return {
        imageSrc,
        setImage,
        clearCurrent,
        undo,
        redo,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        past,
        future,
    };
}
