import { useRef, useState } from 'react';
import { createImageCanvas, validateCanvasImageFile } from '../lib/imageCanvas';
import { inspectProjectImage, type ProjectFile, type ProjectState } from '../lib/projectFile';

interface Options {
    blocked: boolean;
    imageCanvas: HTMLCanvasElement | null;
    captureSettings: () => ProjectState;
    cancelImport: () => void;
    onRestoringChange: (restoring: boolean) => void;
    commit: (settings: ProjectState, src: string, canvas: HTMLCanvasElement, file: File) => void;
}

export function useProjectWorkspace({
    blocked,
    imageCanvas,
    captureSettings,
    cancelImport,
    onRestoringChange,
    commit,
}: Options) {
    const [name, setName] = useState('Kromacut');
    const inFlight = useRef(false);

    const capture = async (): Promise<ProjectFile> => {
        if (blocked || inFlight.current || !imageCanvas) throw new Error('image');
        const state = { ...captureSettings(), name };
        const image = await new Promise<Blob | null>((resolve) =>
            imageCanvas.toBlob(resolve, 'image/png')
        );
        if (!image) throw new Error('image');
        await inspectProjectImage(image);
        return { state, image };
    };

    const restore = async ({ state, image }: ProjectFile) => {
        if (blocked || inFlight.current) throw new Error('busy');
        inFlight.current = true;
        onRestoringChange(true);
        cancelImport();
        try {
            const file = new File([image], 'image.png', { type: 'image/png' });
            const decoded = await validateCanvasImageFile(file);
            if (!decoded.ok) throw new Error('image');
            let canvas: HTMLCanvasElement | undefined;
            try {
                canvas = createImageCanvas(decoded.image);
                commit(state, decoded.url, canvas, decoded.sourceFile);
                setName(state.name);
            } catch (error) {
                URL.revokeObjectURL(decoded.url);
                if (canvas) canvas.width = canvas.height = 1;
                throw error;
            }
        } finally {
            inFlight.current = false;
            onRestoringChange(false);
        }
    };

    return { name, setName, capture, restore };
}
