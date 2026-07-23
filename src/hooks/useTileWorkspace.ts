import { useRef, useState } from 'react';
import type { CanvasPreviewHandle } from '../components/CanvasPreview';
import type { SwatchEntry, ImageDimensions } from './useSwatches';
import type { TileSettings } from '../types/tileSettings';

// Pins down the Step 2 common-core hook's signature ahead of its real
// implementation (see tmp_multi_modularization.plan.txt, Step 0). Single-image
// mode will eventually be exactly one instance of this hook; multi-image mode
// one instance per tile plus one global-defaults instance. For now every
// value is inert — no image processing is wired through it yet.
export interface TileWorkspace {
    imageSrc: string | null;
    setImage: (url: string | null, pushHistory?: boolean) => void;
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
    swatches: SwatchEntry[];
    swatchesLoading: boolean;
    imageDimensions: ImageDimensions | null;
    canvasPreviewRef: React.RefObject<CanvasPreviewHandle | null>;
    isCropMode: boolean;
    setIsCropMode: (value: boolean) => void;
    showCheckerboard: boolean;
    setShowCheckerboard: (value: boolean) => void;
}

export function useTileWorkspace(imageSrc: string | null, settings: TileSettings): TileWorkspace {
    // Signature-only for now; real settings resolution lands in Step 2.
    void settings;
    const canvasPreviewRef = useRef<CanvasPreviewHandle | null>(null);
    const [isCropMode, setIsCropMode] = useState(false);
    const [showCheckerboard, setShowCheckerboard] = useState(false);

    return {
        imageSrc,
        setImage: () => {},
        canUndo: false,
        canRedo: false,
        undo: () => {},
        redo: () => {},
        swatches: [],
        swatchesLoading: false,
        imageDimensions: null,
        canvasPreviewRef,
        isCropMode,
        setIsCropMode,
        showCheckerboard,
        setShowCheckerboard,
    };
}
