import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseHorizontalSplit {
    layoutRef: React.MutableRefObject<HTMLDivElement | null>;
    leftWidth: number;
    setLeftWidth: (px: number) => void;
    onSplitterDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}

// Manages a resizable left sidebar width via a splitter and syncs a CSS var --left-width
export function useHorizontalSplit(onResize?: () => void): UseHorizontalSplit {
    const layoutRef = useRef<HTMLDivElement | null>(null);
    const [leftWidth, setLeftWidth] = useState<number>(0);
    const draggingRef = useRef(false);
    const startXRef = useRef(0);
    const startLeftRef = useRef(0);

    // init left width on mount
    useEffect(() => {
        const el = layoutRef.current;
        if (el) setLeftWidth(Math.floor(el.clientWidth / 4));
    }, []);

    // apply CSS var
    useEffect(() => {
        const el = layoutRef.current;
        if (el) el.style.setProperty('--left-width', `${leftWidth}px`);
    }, [leftWidth]);

    // mouse events for dragging
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!draggingRef.current) return;
            const delta = e.clientX - startXRef.current;
            const newLeft = startLeftRef.current + delta;
            const el = layoutRef.current;
            if (!el) return;
            const min = Math.floor(el.clientWidth * 0.25);
            const max = el.clientWidth - min;
            const clamped = Math.max(min, Math.min(max, newLeft));
            setLeftWidth(clamped);
            if (onResize) requestAnimationFrame(onResize);
        };
        const onUp = () => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [onResize]);

    // clamp on container resize
    useEffect(() => {
        const el = layoutRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            const min = Math.floor(el.clientWidth * 0.25);
            const max = el.clientWidth - min;
            setLeftWidth((lw) => {
                if (lw < min) return min;
                if (lw > max) return max;
                return lw;
            });
            if (onResize) onResize();
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [onResize]);

    const onSplitterDown = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            draggingRef.current = true;
            startXRef.current = e.clientX;
            startLeftRef.current =
                leftWidth ||
                (layoutRef.current ? Math.floor(layoutRef.current.clientWidth / 2) : 300);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        },
        [leftWidth]
    );

    return { layoutRef, leftWidth, setLeftWidth, onSplitterDown };
}

export default useHorizontalSplit;
