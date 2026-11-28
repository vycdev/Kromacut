import { useEffect, useRef, type RefObject } from 'react';

/**
 * A model export disables the download button and its menu items, and the slicer chooser that
 * started it closes, so focus would fall to the page body. While `exporting`, focus waits on the
 * export's progress overlay instead, and returns to the download button once the export ends,
 * unless something else took focus meanwhile.
 */
export function useExportFocus(
    exporting: boolean,
    overlayRef: RefObject<HTMLElement | null>,
    downloadButtonRef: RefObject<HTMLElement | null>
) {
    // Whether focus was moved to the overlay, so only that focus is handed back.
    const parkedRef = useRef(false);

    useEffect(() => {
        const active = document.activeElement;
        if (exporting) {
            const lost =
                !active ||
                active === document.body ||
                active === downloadButtonRef.current ||
                active.matches(':disabled');
            if (!lost) return;
            overlayRef.current?.focus();
            parkedRef.current = document.activeElement === overlayRef.current;
            return;
        }
        if (!parkedRef.current) return;
        parkedRef.current = false;
        // The overlay is gone with the export, which leaves focus on the body unless the user
        // moved it elsewhere.
        if (!active || active === document.body) downloadButtonRef.current?.focus();
    }, [exporting, overlayRef, downloadButtonRef]);
}
