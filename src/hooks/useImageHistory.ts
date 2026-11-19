import { useCallback, useEffect, useRef, useState } from 'react';

function revokeObjectUrl(url: string) {
    if (!url.startsWith('blob:')) return;
    try {
        URL.revokeObjectURL(url);
    } catch {
        /* ignore revoke error */
    }
}

// Manages image history (undo/redo) and objectURL revocation.
export function useImageHistory(initial: string | null, onBeforeSet?: () => void) {
    const [imageSrc, setImageSrc] = useState<string | null>(initial);
    const [past, setPast] = useState<string[]>([]);
    const [future, setFuture] = useState<string[]>([]);

    const imageRef = useRef<string | null>(initial);
    useEffect(() => {
        imageRef.current = imageSrc;
    }, [imageSrc]);

    // Release each object URL once no history entry uses it: a discarded redo
    // branch, a removed image, or everything left on unmount.
    const retainedRef = useRef(new Set<string>());
    useEffect(() => {
        const retained = new Set([...past, ...future]);
        if (imageSrc) retained.add(imageSrc);
        retainedRef.current.forEach((url) => {
            if (!retained.has(url)) revokeObjectUrl(url);
        });
        retainedRef.current = retained;
    }, [imageSrc, past, future]);
    useEffect(() => () => retainedRef.current.forEach(revokeObjectUrl), []);

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

    // onBeforeSet runs in the event handler, not inside the state updaters below,
    // which React may run later or twice. Skip it when there is nothing to undo or
    // redo, so a no-op does not count as an image change.
    const undo = useCallback(() => {
        if (past.length === 0) return;
        if (onBeforeSet) onBeforeSet();
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
            setImageSrc(prev);
            return p.slice(0, p.length - 1);
        });
    }, [past.length, onBeforeSet]);

    const redo = useCallback(() => {
        if (future.length === 0) return;
        if (onBeforeSet) onBeforeSet();
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
            setImageSrc(next);
            return f.slice(0, f.length - 1);
        });
    }, [future.length, onBeforeSet]);

    const clearCurrent = useCallback(() => {
        if (onBeforeSet) onBeforeSet();
        setImageSrc(null);
    }, [onBeforeSet]);

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
