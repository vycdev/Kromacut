import { useCallback, useEffect, useRef } from 'react';

/** Invalidate pending edits on source changes or either edge of the processing lock. */
export function useImageEditGuard(source: unknown, blocked: boolean) {
    const state = useRef({ source, blocked, generation: 0 });
    if (state.current.source !== source || state.current.blocked !== blocked) {
        state.current = { source, blocked, generation: state.current.generation + 1 };
    }
    useEffect(
        () => () => {
            state.current.generation++;
        },
        []
    );
    return useCallback(() => {
        if (state.current.blocked) return null;
        const generation = state.current.generation;
        return () => !state.current.blocked && generation === state.current.generation;
    }, []);
}
