import { useEffect, useRef } from 'react';

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Fires `onMatch` the moment `code` is typed anywhere on the page, Chrome
 * "thisisunsafe"-style — no input box, no visible prompt, keys typed into
 * form fields don't count.
 */
export function useSecretCode(code: string, onMatch: () => void): void {
    const bufferRef = useRef('');
    const onMatchRef = useRef(onMatch);
    onMatchRef.current = onMatch;
    const target = code.toLowerCase();

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (isEditableTarget(e.target) || e.key.length !== 1) return;
            bufferRef.current = (bufferRef.current + e.key.toLowerCase()).slice(-target.length);
            if (bufferRef.current === target) {
                bufferRef.current = '';
                onMatchRef.current();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [target]);
}
