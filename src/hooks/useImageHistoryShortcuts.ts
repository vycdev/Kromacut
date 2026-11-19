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
        // Ctrl+Y also redoes on Windows and Linux; Apple platforms redo only with Shift+Z.
        const apple = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
        const onKey = (event: KeyboardEvent) => {
            const { undo, redo, canUndo, canRedo, disabled, beginEdit } = latest.current;
            // Non-Latin layouts report their own letter in `key`; fall back to the physical key.
            const key = /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : event.code;
            const redoKey =
                !apple &&
                event.ctrlKey &&
                !event.metaKey &&
                !event.shiftKey &&
                (key === 'y' || key === 'KeyY');
            if (
                disabled ||
                event.defaultPrevented ||
                event.isComposing ||
                event.altKey ||
                !(event.ctrlKey || event.metaKey) ||
                (key !== 'z' && key !== 'KeyZ' && !redoKey)
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
            const run = redoKey || event.shiftKey ? canRedo && redo : canUndo && undo;
            if (run && beginEdit()) run();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
}
