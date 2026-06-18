import { useCallback, useEffect, useState } from 'react';
import type { ThreeDControlsStateShape } from '../types';

const LAYER_WARNING_THRESHOLD = 64;
const PIXEL_WARNING_THRESHOLD = 2500000;
const FLAT_PAINT_LAYER_WARNING_THRESHOLD = 32;

export interface BuildWarning {
    warnings: string[];
    pendingState: ThreeDControlsStateShape;
}

export interface UseBuildWarningOptions {
    imageSrc?: string | null;
}

const INITIAL_THREE_D_STATE: ThreeDControlsStateShape = {
    layerHeight: 0.12,
    slicerFirstLayerHeight: 0.2,
    colorSliceHeights: [],
    colorOrder: [],
    filteredSwatches: [],
    pixelSize: 0.1,
    filaments: [],
    paintMode: 'manual',
};

function clearLastBuiltMeshRef() {
    if (typeof window === 'undefined') return;
    (window as unknown as { __KROMACUT_LAST_MESH?: unknown }).__KROMACUT_LAST_MESH = undefined;
}

export function useBuildWarning({ imageSrc }: UseBuildWarningOptions) {
    const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null);
    const [buildWarning, setBuildWarning] = useState<BuildWarning | null>(null);
    const [threeDState, setThreeDState] =
        useState<ThreeDControlsStateShape>(INITIAL_THREE_D_STATE);
    const [threeDBuildSignal, setThreeDBuildSignal] = useState(0);
    const [builtThreeDState, setBuiltThreeDState] = useState<ThreeDControlsStateShape | null>(
        null
    );
    const builtFlatPaint =
        builtThreeDState?.paintMode === 'autopaint' && !!builtThreeDState.flatPaint;

    // Track image dimensions for build warning checks
    useEffect(() => {
        setBuiltThreeDState(null);
        clearLastBuiltMeshRef();
        if (!imageSrc) {
            setImageDimensions(null);
            return;
        }
        const img = new Image();
        img.onload = () => setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => setImageDimensions(null);
        img.src = imageSrc;
    }, [imageSrc]);

    // Apply state without warning (used after user confirms, or when no warning needed)
    const applyThreeDState = useCallback((s: ThreeDControlsStateShape) => {
        setThreeDState(s);
        setBuiltThreeDState({
            ...s,
            colorSliceHeights: [...s.colorSliceHeights],
            colorOrder: [...s.colorOrder],
            filteredSwatches: [...s.filteredSwatches],
            filaments: [...s.filaments],
            autoPaintSwatches: s.autoPaintSwatches ? [...s.autoPaintSwatches] : undefined,
            autoPaintFilamentSwatches: s.autoPaintFilamentSwatches
                ? [...s.autoPaintFilamentSwatches]
                : undefined,
        });
        setThreeDBuildSignal((n) => n + 1);
    }, []);

    // Stable handler that checks for warnings before applying
    const handleThreeDStateChange = useCallback(
        (s: ThreeDControlsStateShape) => {
            const warnings: string[] = [];

            const layerCount = s.colorOrder?.length ?? 0;
            if (layerCount > LAYER_WARNING_THRESHOLD) {
                warnings.push(
                    `The model will have ${layerCount} layers to build. Consider reducing colors in 2D mode first for better performance.`
                );
            }

            if (imageDimensions) {
                const totalPixels = imageDimensions.w * imageDimensions.h;
                if (totalPixels > PIXEL_WARNING_THRESHOLD) {
                    warnings.push(
                        `The image resolution is ${imageDimensions.w}\u00D7${imageDimensions.h} (${(totalPixels / 1000).toFixed(0)}k pixels). Large images may take a long time to build and use significant memory.`
                    );
                }
            }

            if (s.paintMode === 'autopaint' && s.flatPaint && layerCount > FLAT_PAINT_LAYER_WARNING_THRESHOLD) {
                warnings.push(
                    `Flat Paint fills every one of the ${layerCount} layers at full size, producing much heavier geometry and slower slicing. Consider raising the layer height or lowering Max Height.`
                );
            }

            if (s.paintMode === 'autopaint' && s.flatPaint && s.heightDithering) {
                warnings.push(
                    'Flat Paint with height dithering can fragment color regions into many small parts, making builds, exports, and slicer processing much slower.'
                );
            }

            if (warnings.length > 0) {
                setBuildWarning({ warnings, pendingState: s });
            } else {
                applyThreeDState(s);
            }
        },
        [imageDimensions, applyThreeDState]
    );

    const confirmBuild = useCallback(() => {
        if (buildWarning) {
            applyThreeDState(buildWarning.pendingState);
            setBuildWarning(null);
        }
    }, [buildWarning, applyThreeDState]);

    const cancelBuild = useCallback(() => {
        setBuildWarning(null);
    }, []);

    return {
        threeDState,
        setThreeDState,
        threeDBuildSignal,
        builtThreeDState,
        builtFlatPaint,
        buildWarning,
        handleThreeDStateChange,
        confirmBuild,
        cancelBuild,
    };
}
