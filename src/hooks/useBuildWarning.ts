import { useCallback, useEffect, useRef, useState } from 'react';
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
    initialState?: Partial<ThreeDControlsStateShape> | null;
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

export function createInitialThreeDState(
    initialState?: Partial<ThreeDControlsStateShape> | null
): ThreeDControlsStateShape {
    return {
        ...INITIAL_THREE_D_STATE,
        ...(initialState ?? {}),
    };
}

function clearLastBuiltMeshRef() {
    if (typeof window === 'undefined') return;
    (window as unknown as { __KROMACUT_LAST_MESH?: unknown }).__KROMACUT_LAST_MESH = undefined;
}

export function useBuildWarning({ imageSrc, initialState }: UseBuildWarningOptions) {
    const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null);
    const [buildWarning, setBuildWarning] = useState<BuildWarning | null>(null);
    const [isBuildStarting, setIsBuildStarting] = useState(false);
    const pendingBuildFrameRef = useRef<number | null>(null);
    const [threeDState, setThreeDState] = useState<ThreeDControlsStateShape>(() =>
        createInitialThreeDState(initialState)
    );
    const [threeDBuildSignal, setThreeDBuildSignal] = useState(0);
    const [builtThreeDState, setBuiltThreeDState] = useState<ThreeDControlsStateShape | null>(
        null
    );
    const builtFlatPaint =
        builtThreeDState?.paintMode === 'autopaint' && !!builtThreeDState.flatPaint;

    // Track image dimensions for build warning checks
    useEffect(() => {
        if (pendingBuildFrameRef.current !== null) {
            window.cancelAnimationFrame(pendingBuildFrameRef.current);
            pendingBuildFrameRef.current = null;
        }
        setIsBuildStarting(false);
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

    const scheduleThreeDState = useCallback(
        (state: ThreeDControlsStateShape) => {
            if (pendingBuildFrameRef.current !== null) {
                window.cancelAnimationFrame(pendingBuildFrameRef.current);
            }

            setBuildWarning(null);
            setIsBuildStarting(true);
            // Let React close the warning and paint the preparation overlay before
            // applying the complete build snapshot. A second frame prevents the
            // snapshot render from sharing the overlay's first paint.
            pendingBuildFrameRef.current = window.requestAnimationFrame(() => {
                pendingBuildFrameRef.current = window.requestAnimationFrame(() => {
                    pendingBuildFrameRef.current = null;
                    applyThreeDState(state);
                });
            });
        },
        [applyThreeDState]
    );

    useEffect(
        () => () => {
            if (pendingBuildFrameRef.current !== null) {
                window.cancelAnimationFrame(pendingBuildFrameRef.current);
            }
        },
        []
    );

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
                scheduleThreeDState(s);
            }
        },
        [imageDimensions, scheduleThreeDState]
    );

    const confirmBuild = useCallback(() => {
        if (buildWarning) {
            scheduleThreeDState(buildWarning.pendingState);
        }
    }, [buildWarning, scheduleThreeDState]);

    const cancelBuild = useCallback(() => {
        setBuildWarning(null);
    }, []);

    const markBuildStarted = useCallback(() => {
        setIsBuildStarting(false);
    }, []);

    return {
        threeDState,
        setThreeDState,
        threeDBuildSignal,
        builtThreeDState,
        builtFlatPaint,
        buildWarning,
        isBuildStarting,
        handleThreeDStateChange,
        confirmBuild,
        cancelBuild,
        markBuildStarted,
    };
}
