import { useCallback, useState } from 'react';
import { findSlicerApp, type SlicerApp } from '../lib/desktopSlicer';
import {
    loadSlicerPreference,
    saveSlicerPreference,
    type SlicerPreference,
} from '../lib/slicerPreference';

export interface SlicerChooserRequest {
    /** Name of a saved slicer that could no longer be found, so the user knows why we ask. */
    missingSlicerName: string | null;
}

/**
 * Desktop only: decides which slicer **Open in Slicer** uses. With a saved slicer the model
 * opens straight away; otherwise, or when the saved slicer is gone, the chooser is shown first.
 * `openInSlicer` exports the model and opens it with the given slicer (`null`: system default).
 */
export function useSlicerChoice(openInSlicer: (slicer: SlicerApp | null) => Promise<void>) {
    const [preference, setPreference] = useState<SlicerPreference | null>(loadSlicerPreference);
    const [chooser, setChooser] = useState<SlicerChooserRequest | null>(null);

    const updatePreference = useCallback((next: SlicerPreference | null) => {
        saveSlicerPreference(next);
        setPreference(next);
    }, []);

    const onOpenInSlicer = useCallback(async () => {
        if (preference?.kind === 'system') return openInSlicer(null);
        if (preference?.kind === 'app') {
            let found: SlicerApp | null;
            try {
                found = await findSlicerApp(preference.app.path);
            } catch (err) {
                console.warn('Checking the saved slicer failed', err);
                setChooser({ missingSlicerName: null });
                return;
            }
            if (found) return openInSlicer(found);
            // The slicer was moved or uninstalled: forget it and ask again.
            updatePreference(null);
            setChooser({ missingSlicerName: preference.app.name });
            return;
        }
        setChooser({ missingSlicerName: null });
    }, [openInSlicer, preference, updatePreference]);

    const onChooseSlicer = useCallback(() => setChooser({ missingSlicerName: null }), []);

    const onChooserConfirm = useCallback(
        (slicer: SlicerApp | null, remember: boolean) => {
            updatePreference(
                remember ? (slicer ? { kind: 'app', app: slicer } : { kind: 'system' }) : null
            );
            setChooser(null);
            void openInSlicer(slicer);
        },
        [openInSlicer, updatePreference]
    );

    const onChooserCancel = useCallback(() => setChooser(null), []);

    return {
        preference,
        chooser,
        onOpenInSlicer,
        onChooseSlicer,
        onChooserConfirm,
        onChooserCancel,
    };
}
