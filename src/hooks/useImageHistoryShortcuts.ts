import { useEffect, useRef } from 'react';

export function useImageHistoryShortcuts(options: {
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    disabled: boolean;
    /** Same synchronous edit lock as the toolbar buttons. */
    beginEdit: () => unknown;
}) {
    const latest = useRef(options);
    latest.current = options;
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const { undo, redo, canUndo, canRedo, disabled, beginEdit } = latest.current;
            // Non-Latin layouts report their own letter in `key`; fall back to the physical key.
            const key = /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : event.code;
            if (
                disabled ||
                event.defaultPrevented ||
                event.isComposing ||
                event.altKey ||
                !(event.ctrlKey || event.metaKey) ||
                (key !== 'z' && key !== 'KeyZ')
            )
                return;
            const target = event.target instanceof Element ? event.target : document.activeElement;
            if (
                target?.closest(
                    'input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="textbox"]'
                )
            )
                return;
            // Dialogs, popovers, menus and open select lists keep their own edits;
            // do not undo the image behind them.
            if (
                document.querySelector(
                    'dialog[open], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]'
                )
            )
                return;
            event.preventDefault();
            const run = event.shiftKey ? canRedo && redo : canUndo && undo;
            if (run && beginEdit()) run();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
}
