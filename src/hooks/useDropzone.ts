import { useCallback, useState } from 'react';

export interface UseDropzone {
    dragOver: boolean;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
}

// Generic dropzone hook: blocks drops when disabled, extracts first File and passes to handler
export function useDropzone(options: {
    enabled: boolean;
    onFile: (file: File) => void;
}): UseDropzone {
    const { enabled, onFile } = options;
    const [dragOver, setDragOver] = useState(false);

    const onDragOver = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            if (!enabled) return;
            setDragOver(true);
        },
        [enabled]
    );

    const onDragLeave = useCallback(() => {
        setDragOver(false);
    }, []);

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            if (!enabled) return;
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) onFile(file);
        },
        [enabled, onFile]
    );

    return { dragOver, onDragOver, onDragLeave, onDrop };
}

export default useDropzone;
