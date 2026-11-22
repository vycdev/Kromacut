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
    // The latest export, so a slow saved-slicer check exports the current build's settings
    // with the current mesh, not the settings captured when Open in Slicer was clicked.
    const openInSlicerRef = useRef(openInSlicer);
    openInSlicerRef.current = openInSlicer;
    // The Open in Slicer click whose saved-slicer check may still act. Showing any chooser
    // clears it, so a late check result never replaces or launches over that chooser.
    const pendingOpenRef = useRef<object | null>(null);

    const showChooser = useCallback((request: SlicerChooserRequest) => {
        pendingOpenRef.current = null;
        setChooser(request);
    }, []);

    const updatePreference = useCallback((next: SlicerPreference | null) => {
        saveSlicerPreference(next);
        preferenceRef.current = next;
        setPreference(next);
    }, []);

    const onOpenInSlicer = useCallback(async () => {
        const preference = preferenceRef.current;
        if (preference?.kind === 'system') return openInSlicer(null);
        if (preference?.kind === 'app') {
            const request = {};
            pendingOpenRef.current = request;
            // Changed in Settings, a chooser shown, or another click during the check: the
            // newer action wins, so do nothing.
            const superseded = () =>
                preferenceRef.current !== preference || pendingOpenRef.current !== request;
            let found: SlicerApp | null;
            try {
                found = await findSlicerApp(preference.app.path);
            } catch (err) {
                if (superseded()) return;
                console.warn('Checking the saved slicer failed', err);
                showChooser({ missingSlicerName: null, saveOnly: false });
                return;
            }
            if (superseded()) return;
            pendingOpenRef.current = null;
            if (found) return openInSlicerRef.current(found);
            // The slicer was moved or uninstalled: forget it and ask again.
            updatePreference(null);
            showChooser({ missingSlicerName: preference.app.name, saveOnly: false });
            return;
        }
        showChooser({ missingSlicerName: null, saveOnly: false });
    }, [openInSlicer, showChooser, updatePreference]);

    const onChooseSlicer = useCallback(
        () => showChooser({ missingSlicerName: null, saveOnly: false }),
        [showChooser]
    );

    const onChangeSavedSlicer = useCallback(
        () => showChooser({ missingSlicerName: null, saveOnly: true }),
        [showChooser]
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
