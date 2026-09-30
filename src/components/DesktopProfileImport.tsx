import { useEffect, useRef, useState } from 'react';
import type { DesktopFileRequest } from '../lib/desktopFileInbox';
import { DesktopFileDialog } from './DesktopFileDialog';

interface Props {
    file: DesktopFileRequest | null;
    hasUnsavedChanges: boolean;
    importText: (content: string, name: string, selectExisting?: boolean) => boolean;
    onImported: () => void;
    onFinished: (id: number) => void;
}

export function DesktopProfileImport({
    file,
    hasUnsavedChanges,
    importText,
    onImported,
    onFinished,
}: Props) {
    const handled = useRef<number | null>(null);
    const [dialog, setDialog] = useState<{ file: DesktopFileRequest; confirm: boolean } | null>(
        null
    );
    const [completedId, setCompletedId] = useState<number | null>(null);
    const callbacks = useRef({ importText, onImported, onFinished });
    callbacks.current = { importText, onImported, onFinished };

    const importFile = (request: DesktopFileRequest) => {
        let imported = false;
        try {
            imported = callbacks.current.importText(request.content!, request.name, true);
        } catch (error) {
            console.error('Could not import the opened profile', error);
        }
        if (imported) {
            callbacks.current.onImported();
            setCompletedId(request.id);
            setDialog(null);
        } else {
            setDialog({ file: request, confirm: false });
        }
    };
    const runImport = useRef(importFile);
    runImport.current = importFile;
    useEffect(() => {
        if (!file || handled.current === file.id) return;
        handled.current = file.id;
        if (hasUnsavedChanges) setDialog({ file, confirm: true });
        else runImport.current(file);
    }, [file, hasUnsavedChanges]);
    // Advance only after the imported profiles/filaments have committed to React state.
    useEffect(() => {
        if (completedId !== null) callbacks.current.onFinished(completedId);
    }, [completedId]);

    if (!dialog) return null;
    return (
        <DesktopFileDialog
            name={dialog.file.name}
            onDismiss={() => {
                callbacks.current.onFinished(dialog.file.id);
                setDialog(null);
            }}
            onConfirm={dialog.confirm ? () => runImport.current(dialog.file) : undefined}
        />
    );
}
