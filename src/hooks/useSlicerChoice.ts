import { useCallback, useRef, useState } from 'react';
import { findSlicerApp, type SlicerApp } from '../lib/desktopSlicer';
import {
    loadSlicerPreference,
    saveSlicerPreference,
    type SlicerPreference,
} from '../lib/slicerPreference';

export interface SlicerChooserRequest {
    /** Name of a saved slicer that could no longer be found, so the user knows why we ask. */
    missingSlicerName: string | null;
    /** Opened from Settings: confirming only saves the choice, without exporting or opening. */
    saveOnly: boolean;
}

/**
 * Desktop only: decides which slicer **Open in Slicer** uses. With a saved slicer the model
 * opens straight away; otherwise, or when the saved slicer is gone, the chooser is shown first.
 * `openInSlicer` exports the model and opens it with the given slicer (`null`: system default).
 * Settings can also change or forget the saved slicer without a model.
 */
export function useSlicerChoice(openInSlicer: (slicer: SlicerApp | null) => Promise<void>) {
    const [preference, setPreference] = useState<SlicerPreference | null>(loadSlicerPreference);
    const [chooser, setChooser] = useState<SlicerChooserRequest | null>(null);
    // The latest preference, so a slow saved-slicer check can tell it was changed meanwhile.
    const preferenceRef = useRef(preference);

    const updatePreference = useCallback((next: SlicerPreference | null) => {
        saveSlicerPreference(next);
        preferenceRef.current = next;
        setPreference(next);
    }, []);

    const onOpenInSlicer = useCallback(async () => {
        const preference = preferenceRef.current;
        if (preference?.kind === 'system') return openInSlicer(null);
        if (preference?.kind === 'app') {
            let found: SlicerApp | null;
            try {
                found = await findSlicerApp(preference.app.path);
            } catch (err) {
                if (preferenceRef.current !== preference) return;
                console.warn('Checking the saved slicer failed', err);
                setChooser({ missingSlicerName: null, saveOnly: false });
                return;
            }
            // Changed in Settings during the check: the newer choice wins, so do nothing.
            if (preferenceRef.current !== preference) return;
            if (found) return openInSlicer(found);
            // The slicer was moved or uninstalled: forget it and ask again.
            updatePreference(null);
            setChooser({ missingSlicerName: preference.app.name, saveOnly: false });
            return;
        }
        setChooser({ missingSlicerName: null, saveOnly: false });
    }, [openInSlicer, updatePreference]);

    const onChooseSlicer = useCallback(
        () => setChooser({ missingSlicerName: null, saveOnly: false }),
        []
    );

    const onChangeSavedSlicer = useCallback(
        () => setChooser({ missingSlicerName: null, saveOnly: true }),
        []
    );

    const onForgetSlicer = useCallback(() => updatePreference(null), [updatePreference]);

    const onChooserConfirm = useCallback(
        (slicer: SlicerApp | null, remember: boolean) => {
            updatePreference(
                remember ? (slicer ? { kind: 'app', app: slicer } : { kind: 'system' }) : null
            );
            setChooser(null);
            if (!chooser?.saveOnly) void openInSlicer(slicer);
        },
        [chooser, openInSlicer, updatePreference]
    );

    const onChooserCancel = useCallback(() => setChooser(null), []);

    return {
        preference,
        chooser,
        onOpenInSlicer,
        onChooseSlicer,
        onChangeSavedSlicer,
        onForgetSlicer,
        onChooserConfirm,
        onChooserCancel,
    };
}
