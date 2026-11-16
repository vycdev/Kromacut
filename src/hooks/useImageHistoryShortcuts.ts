import { useEffect } from 'react';

export function useImageHistoryShortcuts({
    undo,
    redo,
    canUndo,
    canRedo,
    disabled,
}: {
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    disabled: boolean;
}) {
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (
                disabled ||
                event.defaultPrevented ||
                event.isComposing ||
                event.altKey ||
                !(event.ctrlKey || event.metaKey) ||
                event.key.toLowerCase() !== 'z'
            )
                return;
            const target = event.target instanceof Element ? event.target : document.activeElement;
            if (
                target?.closest(
                    'input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="textbox"]'
                )
            )
                return;
            // Draft dialogs keep their own edits; do not undo the image behind them.
            if (
                document.querySelector(
                    'dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"]'
                )
            )
                return;
            event.preventDefault();
            if (event.shiftKey ? canRedo : canUndo) (event.shiftKey ? redo : undo)();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [undo, redo, canUndo, canRedo, disabled]);
}
