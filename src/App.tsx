import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ThreeDControls from './components/ThreeDControls';
import {
    AUTO_PAINT_REPEAT_LIMITS,
    AUTO_PAINT_TRANSITION_OPACITIES,
    type AutoPaintRepeatLimit,
    type AutoPaintTransitionOpacity,
    type PreviewColorMode,
    type PreviewRenderMode,
    type ThreeDControlsStateShape,
    type TouchUpTool,
} from './types';
import ThreeDView from './components/ThreeDView';
import logo from './assets/logo.png';
import CanvasPreview from './components/CanvasPreview';
import type { CanvasPreviewHandle } from './components/CanvasPreview';
import { SwatchesPanel } from './components/SwatchesPanel';
import AdjustmentsPanel from './components/AdjustmentsPanel';
import DeditherPanel from './components/DeditherPanel';
import ImageResizePanel from './components/ImageResizePanel';
import { ADJUSTMENT_DEFAULTS } from './lib/applyAdjustments';
import { calculateImageResizeDimensions } from './lib/imageResize';
import SLIDER_DEFS from './components/sliderDefs';
import { useSwatches } from './hooks/useSwatches';
import type { SwatchEntry } from './hooks/useSwatches';
import { useImageHistory } from './hooks/useImageHistory';
import { useQuantize } from './hooks/useQuantize';
import Header from './components/Header';
import ModeTabs from './components/ModeTabs';
import PreviewActions from './components/PreviewActions';
import { useDropzone } from './hooks/useDropzone';
import { exportObjectToStlBlob } from './lib/exportStl';
import { exportObjectTo3MFBlob } from './lib/export3mf';
import { useAppHandlers, type ExportProgressStep } from './hooks/useAppHandlers';
import { useProcessingState } from './hooks/useProcessingState';
import { useBuildWarning } from './hooks/useBuildWarning';
import { clampProgress } from './lib/progress';
import { normalizeOptimizerTier } from './lib/optimizer';
import ResizableSplitter from './components/ResizableSplitter';
import { ControlsPanel } from './components/ControlsPanel';
import { usePaletteManager } from './hooks/usePaletteManager';
import { UpdateChecker } from './components/UpdateChecker';
import ProgressOverlay from './components/ProgressOverlay';
import DocsPage from './components/docs/DocsPage';
import { defaultDocSlug } from './docs';
import { loadCameraMode, saveCameraMode } from './lib/cameraPrefs';
import {
    loadPreviewColorMode,
    loadPreviewRenderMode,
    savePreviewColorMode,
    savePreviewRenderMode,
} from './lib/previewPrefs';
import { buildDocsPath, parseDocsLocation } from './lib/docs/navigation';
import { applyAppSeo } from './lib/seo';
import { appPath, markLaunched } from './lib/routes';
import { isTauri } from '@tauri-apps/api/core';
import { migrateLegacyFilamentTd, sanitizeProfileFilament } from './lib/profileManager';
import PrintUnlockEffect from './components/PrintUnlockEffect';
import { useSecretCode } from './hooks/useSecretCode';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
    AlertDialogCancel,
} from './components/ui/alert-dialog';
// ...existing imports

const AUTOPAINT_STORAGE_KEY = 'kromacut.autopaint.v1';

function progressStepName(label: string) {
    const stepName = label.replace(/\.+$/, '').trim();
    if (/dedither/i.test(stepName)) return 'Dedithering';
    if (/quantiz/i.test(stepName)) return 'Quantizing colors';
    return stepName || 'Processing';
}

function progressOperationTitle() {
    return 'Processing image';
}

interface ProcessingStepState {
    stepIndex: number;
    stepCount: number;
    label?: string;
    stepProgress?: number;
}

type AutoPaintPersisted = Pick<
    ThreeDControlsStateShape,
    | 'filaments'
    | 'paintMode'
    | 'optimizerAlgorithm'
    | 'optimizerSeed'
    | 'regionWeightingMode'
    | 'enhancedColorMatch'
    | 'preserveSeparation'
    | 'allowRepeatedSwaps'
    | 'maxRepeatedSwaps'
    | 'transitionOpacity'
    | 'heightDithering'
    | 'ditherLineWidth'
    | 'flatPaint'
>;

// Schema v2: filament `td` values store frontlit hiding distances. State
// persisted without this marker predates the change and carries uncalibrated
// tds on the conventional backlit scale, which must be migrated once on load.
const AUTOPAINT_SCHEMA_VERSION = 2;

function isOneOf<T extends readonly number[]>(value: unknown, values: T): value is T[number] {
    return typeof value === 'number' && values.includes(value as T[number]);
}

function normalizeRepeatLimit(value: unknown, legacyEnabled: unknown): AutoPaintRepeatLimit {
    if (isOneOf(value, AUTO_PAINT_REPEAT_LIMITS)) return value;
    return legacyEnabled === true ? 4 : 0;
}

function normalizeTransitionOpacity(value: unknown): AutoPaintTransitionOpacity {
    return isOneOf(value, AUTO_PAINT_TRANSITION_OPACITIES) ? value : 0.9;
}

const loadAutoPaintPersisted = (): AutoPaintPersisted | null => {
    try {
        const raw = localStorage.getItem(AUTOPAINT_STORAGE_KEY);
        if (!raw) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = JSON.parse(raw) as any;
        if (!parsed || !Array.isArray(parsed.filaments)) return null;
        const sanitized = parsed.filaments
            .map((filament: unknown) => sanitizeProfileFilament(filament))
            .filter(
                (
                    filament: ReturnType<typeof sanitizeProfileFilament>
                ): filament is NonNullable<ReturnType<typeof sanitizeProfileFilament>> =>
                    filament !== null
            );
        const persistedSchema = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 1;
        const filaments =
            persistedSchema >= AUTOPAINT_SCHEMA_VERSION
                ? sanitized
                : sanitized.map(migrateLegacyFilamentTd);
        // Migrate legacy `autoPaintEnabled` boolean → `paintMode`
        const paintMode: 'manual' | 'autopaint' =
            parsed.paintMode === 'autopaint' || parsed.paintMode === 'manual'
                ? parsed.paintMode
                : parsed.autoPaintEnabled
                  ? 'autopaint'
                  : 'manual';
        return {
            filaments,
            paintMode,
            optimizerAlgorithm: normalizeOptimizerTier(parsed.optimizerAlgorithm),
            optimizerSeed: parsed.optimizerSeed,
            regionWeightingMode: parsed.regionWeightingMode,
            enhancedColorMatch: parsed.enhancedColorMatch ?? false,
            preserveSeparation: parsed.preserveSeparation ?? false,
            maxRepeatedSwaps: normalizeRepeatLimit(
                parsed.maxRepeatedSwaps,
                parsed.allowRepeatedSwaps
            ),
            transitionOpacity: normalizeTransitionOpacity(parsed.transitionOpacity),
            heightDithering: parsed.heightDithering ?? false,
            ditherLineWidth: parsed.ditherLineWidth,
            flatPaint: parsed.flatPaint ?? false,
        };
    } catch {
        return null;
    }
};

const saveAutoPaintPersisted = (value: AutoPaintPersisted) => {
    try {
        localStorage.setItem(
            AUTOPAINT_STORAGE_KEY,
            JSON.stringify({ schemaVersion: AUTOPAINT_SCHEMA_VERSION, ...value })
        );
    } catch {
        // ignore storage errors
    }
};

function App(): React.ReactElement | null {
    const toolPath = appPath(isTauri());
    // Multi-plate mode (issue #35) is still a stub. Per the plan, the flow diverges
    // at *image upload*, not at app start — so until an image is uploaded the app
    // must look and behave exactly like today. Typing "feat35" anywhere on the page
    // (Chrome "thisisunsafe"-style — no box, no prompt) silently arms
    // `multiPlateEnabled`; the future upload decider will read that flag inside the
    // upload path to fork into multi-plate handling. Arming it plays a one-shot
    // 3D-print flourish over the normal app as unlock feedback, then hands straight
    // back to the untouched single-image UI. Nothing persists across a reload and
    // there is no other trace of it.
    const [multiPlateEnabled, setMultiPlateEnabled] = useState(false);
    const [printing, setPrinting] = useState(false);

    useSecretCode('feat35', () => {
        if (!multiPlateEnabled) setPrinting(true); // flourish only when arming, not disarming
        setMultiPlateEnabled((on) => !on);
    });

    const handleEffectDone = useCallback(() => setPrinting(false), []);

    // dropzone state managed by hook below
    // `weight` is the algorithm parameter; `finalColors` is the postprocess target
    const [weight, setWeight] = useState<number>(128);
    const [finalColors, setFinalColors] = useState<number>(16);
    const [algorithm, setAlgorithm] = useState<string>('kmeans');
    const SWATCH_CAP = 2 ** 10;
    // Palette manager: custom palettes CRUD + merged palette list + selected palette
    const {
        customPalettes,
        allPalettes,
        selectedPalette,
        setSelectedPalette,
        importFeedback: paletteImportFeedback,
        importInputRef: paletteImportInputRef,
        handleCreatePalette,
        handleUpdatePalette,
        handleDeletePalette,
        handleExportPalette,
        handleImportFile: handleImportPaletteFile,
    } = usePaletteManager();
    const { imageSrc, setImage, clearCurrent, undo, redo, canUndo, canRedo } = useImageHistory(
        logo,
        undefined
    );
    const { swatches, swatchesLoading, imageDimensions, invalidate, immediateOverride } =
        useSwatches(imageSrc);
    // adjustments managed locally inside AdjustmentsPanel now
    // initial selectedPalette derived from initial weight above
    const inputRef = useRef<HTMLInputElement | null>(null);
    const canvasPreviewRef = useRef<CanvasPreviewHandle | null>(null);
    const [showCheckerboard, setShowCheckerboard] = useState<boolean>(false);
    const [isCropMode, setIsCropMode] = useState(false);
    const [hasValidCropSelection, setHasValidCropSelection] = useState(false);
    // 2D touch-up tools are session-only; image changes still use shared history.
    const [touchUpTool, setTouchUpTool] = useState<TouchUpTool | null>(null);
    const [touchUpColor, setTouchUpColor] = useState('#000000');
    const [touchUpBrushSize, setTouchUpBrushSize] = useState(4);
    const [touchUpTextSize, setTouchUpTextSize] = useState(24);
    const {
        isQuantizing,
        setIsQuantizing,
        isDedithering,
        setIsDedithering,
        processingLabel,
        setProcessingLabel,
        processingProgress,
        setProcessingProgress,
        processingIndeterminate,
        setProcessingIndeterminate,
    } = useProcessingState();
    const [processingStep, setProcessingStep] = useState<ProcessingStepState>({
        stepIndex: 1,
        stepCount: 1,
    });
    const { applyQuantize } = useQuantize({
        algorithm,
        weight,
        finalColors,
        selectedPalette,
        customPalettes,
        imageSrc,
        setImage: (u, push = true) => {
            invalidate();
            setImage(u, push);
        },
        onImmediateSwatches: (colors: SwatchEntry[]) => immediateOverride(colors),
        onProgress: (value) => {
            setProcessingProgress(clampProgress(value));
        },
        onStepChange: setProcessingStep,
        onStage: (stage) => {
            if (stage === 'final') {
                setProcessingIndeterminate(false);
            }
        },
    });

    // persistent (committed) adjustments applied on redraw. Key/value map.
    const [adjustments, setAdjustments] = useState<Record<string, number>>(ADJUSTMENT_DEFAULTS);
    // epoch counter to force remount of AdjustmentsPanel when we bake & reset
    const [adjustmentsEpoch, setAdjustmentsEpoch] = useState(0);
    // UI mode toggles (2D / 3D) - UI only for now
    const [mode, setMode] = useState<'2d' | '3d'>('2d');
    const [docsOpen, setDocsOpen] = useState(() => parseDocsLocation(window.location) !== null);
    const [isOrtho, setIsOrtho] = useState(loadCameraMode);
    const [previewRenderMode, setPreviewRenderMode] =
        useState<PreviewRenderMode>(loadPreviewRenderMode);
    const [previewColorMode, setPreviewColorMode] =
        useState<PreviewColorMode>(loadPreviewColorMode);
    const [exportingSTL, setExportingSTL] = useState(false);
    const [exportProgress, setExportProgress] = useState(0); // 0..1
    const [exportStep, setExportStep] = useState<ExportProgressStep>({
        title: 'Exporting model',
        stepLabel: 'Preparing export',
        stepIndex: 1,
        stepCount: 1,
    });
    // 3D printing shared state
    const {
        threeDState,
        setThreeDState,
        threeDBuildSignal,
        builtThreeDState,
        builtFlatPaint,
        buildWarning,
        handleThreeDStateChange,
        confirmBuild,
        cancelBuild,
    } = useBuildWarning({ imageSrc });
    const builtModelState = builtThreeDState ?? threeDState;
    const builtModelAutoPaint = builtModelState.paintMode === 'autopaint';

    // Hydrate threeDState once with persisted autopaint data
    const [autopaintHydrated] = useState(() => {
        const persisted = loadAutoPaintPersisted();
        return persisted;
    });
    useEffect(() => {
        if (autopaintHydrated) {
            setThreeDState((prev) => ({
                ...prev,
                filaments: autopaintHydrated.filaments ?? prev.filaments,
                paintMode: autopaintHydrated.paintMode ?? prev.paintMode,
                optimizerAlgorithm: autopaintHydrated.optimizerAlgorithm ?? prev.optimizerAlgorithm,
                optimizerSeed: autopaintHydrated.optimizerSeed ?? prev.optimizerSeed,
                regionWeightingMode:
                    autopaintHydrated.regionWeightingMode ?? prev.regionWeightingMode,
                enhancedColorMatch: autopaintHydrated.enhancedColorMatch ?? prev.enhancedColorMatch,
                preserveSeparation: autopaintHydrated.preserveSeparation ?? prev.preserveSeparation,
                maxRepeatedSwaps: autopaintHydrated.maxRepeatedSwaps ?? prev.maxRepeatedSwaps,
                transitionOpacity: autopaintHydrated.transitionOpacity ?? prev.transitionOpacity,
                heightDithering: autopaintHydrated.heightDithering ?? prev.heightDithering,
                ditherLineWidth: autopaintHydrated.ditherLineWidth ?? prev.ditherLineWidth,
                flatPaint: autopaintHydrated.flatPaint ?? prev.flatPaint,
            }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const prevModeRef = useRef<typeof mode>(mode);

    useEffect(() => {
        saveAutoPaintPersisted({
            filaments: threeDState.filaments,
            paintMode: threeDState.paintMode ?? 'manual',
            optimizerAlgorithm: threeDState.optimizerAlgorithm,
            optimizerSeed: threeDState.optimizerSeed,
            regionWeightingMode: threeDState.regionWeightingMode,
            enhancedColorMatch: threeDState.enhancedColorMatch,
            preserveSeparation: threeDState.preserveSeparation,
            maxRepeatedSwaps: threeDState.maxRepeatedSwaps,
            transitionOpacity: threeDState.transitionOpacity,
            heightDithering: threeDState.heightDithering,
            ditherLineWidth: threeDState.ditherLineWidth,
            flatPaint: threeDState.flatPaint,
        });
    }, [
        threeDState.filaments,
        threeDState.paintMode,
        threeDState.optimizerAlgorithm,
        threeDState.optimizerSeed,
        threeDState.regionWeightingMode,
        threeDState.enhancedColorMatch,
        threeDState.preserveSeparation,
        threeDState.maxRepeatedSwaps,
        threeDState.transitionOpacity,
        threeDState.heightDithering,
        threeDState.ditherLineWidth,
        threeDState.flatPaint,
    ]);

    // No auto-build on tab switch — the user must click "Build 3D Model" / "Apply Changes".
    useEffect(() => {
        prevModeRef.current = mode;
    }, [mode]);

    // removed duplicate syncing: manual changes to the numeric input should set Auto via onWeightChange
    // redraw when image changes
    useEffect(() => {
        canvasPreviewRef.current?.redraw();
    }, [imageSrc]);

    useEffect(() => {
        const syncDocsLocation = () => {
            const target = parseDocsLocation(window.location);
            setDocsOpen(target !== null);
        };
        window.addEventListener('hashchange', syncDocsLocation);
        window.addEventListener('popstate', syncDocsLocation);
        return () => {
            window.removeEventListener('hashchange', syncDocsLocation);
            window.removeEventListener('popstate', syncDocsLocation);
        };
    }, []);

    useEffect(() => {
        if (!docsOpen) {
            markLaunched();
        }
    }, [docsOpen]);

    useEffect(() => {
        if (!docsOpen) {
            applyAppSeo();
        }
    }, [docsOpen]);

    const backToApp = () => {
        setDocsOpen(false);
        if (parseDocsLocation(window.location)) {
            window.history.pushState(null, '', toolPath);
        }
    };

    const openDocs = () => {
        setDocsOpen(true);
        if (!parseDocsLocation(window.location)) {
            window.history.pushState(null, '', buildDocsPath(defaultDocSlug));
        }
    };

    const handleFiles = (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file');
            return;
        }
        setTouchUpTool(null);
        const url = URL.createObjectURL(file);
        invalidate();
        setImage(url, true);
    };

    // removed unused handlers (inline handlers used instead)

    const clear = () => {
        setTouchUpTool(null);
        clearCurrent();
        if (inputRef.current) inputRef.current.value = '';
    };

    const resizeCurrentImage = async (percent: number) => {
        if (!canvasPreviewRef.current || !imageSrc) return;

        let sourceUrl: string | null = null;
        try {
            const sourceBlob = await canvasPreviewRef.current.exportImageBlob();
            if (!sourceBlob) return;

            sourceUrl = URL.createObjectURL(sourceBlob);
            const imageUrl = sourceUrl;
            const img = await new Promise<HTMLImageElement | null>((resolve) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => resolve(null);
                image.src = imageUrl;
            });

            if (!img) return;

            const target = calculateImageResizeDimensions(
                img.naturalWidth,
                img.naturalHeight,
                percent
            );

            if (target.width >= img.naturalWidth && target.height >= img.naturalHeight) return;

            const canvas = document.createElement('canvas');
            canvas.width = target.width;
            canvas.height = target.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, target.width, target.height);

            const resizedBlob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob((blob) => resolve(blob), 'image/png')
            );
            if (!resizedBlob) return;

            const url = URL.createObjectURL(resizedBlob);
            invalidate();
            setImage(url, true);
        } catch (error) {
            console.warn('Image resize failed', error);
            alert('Image resize failed. See console for details.');
        } finally {
            if (sourceUrl) URL.revokeObjectURL(sourceUrl);
        }
    };

    // splitter & layout management preserved below

    // wheel/pan handled in CanvasPreview
    // startPan handled in CanvasPreview
    // resize observer handled by CanvasPreview; keep for layout redraw hook
    // Layout splitter state
    const layoutRef = useRef<HTMLDivElement | null>(null);

    const touchUpPaletteColors = useMemo(
        () =>
            Array.from(
                new Set(swatches.filter((swatch) => swatch.a !== 0).map((swatch) => swatch.hex))
            ),
        [swatches]
    );

    const handleTouchUpToolChange = (nextTool: TouchUpTool | null) => {
        if (!imageSrc) return;
        setTouchUpTool(nextTool);
    };

    const dropzone = useDropzone({ enabled: mode === '2d', onFile: handleFiles });
    const { onExportImage, onExportStl, onExport3MF, onSwatchApply, onSwatchDelete } =
        useAppHandlers({
            canvasPreviewRef,
            imageSrc,
            invalidate,
            setImage,
            setExportingSTL,
            setExportProgress,
            setExportStep,
            exportingSTL,
            exportObjectToStlBlob,
            exportObjectTo3MFBlob: (obj, onProgress, onZipProgress) =>
                exportObjectTo3MFBlob(obj, {
                    layerHeight: builtModelState.layerHeight,
                    firstLayerHeight: builtModelState.slicerFirstLayerHeight,
                    layerFilamentColors: builtModelAutoPaint
                        ? builtModelState.autoPaintFilamentSwatches?.map((s) => s.hex)
                        : undefined,
                    onProgress,
                    onZipProgress,
                }),
            applyQuantize,
            swatches,
        });

    const processingActive = mode === '2d' && (isQuantizing || isDedithering);

    return (
        <>
            <div className="box-border text-inherit font-sans flex flex-col flex-1 min-w-0 max-w-full min-h-0 h-screen w-full">
                <Header
                    docsOpen={docsOpen}
                    onBackToApp={backToApp}
                    onOpenDocs={openDocs}
                />
                {docsOpen && (
                    <div className="flex flex-1 min-h-0 w-full">
                        <DocsPage />
                    </div>
                )}
                <div
                    className={`${docsOpen ? 'hidden' : 'flex'} flex-1 min-h-0 w-full`}
                    ref={layoutRef}
                >
                    <ResizableSplitter defaultSize={30} minSize={20} maxSize={50}>
                        <aside className="w-full bg-card border-r border-border flex flex-col min-h-0">
                            <ModeTabs mode={mode} onChange={setMode} />
                            <div className="flex-1 overflow-y-auto overflow-x-auto p-4">
                                {mode === '2d' ? (
                                    <>
                                        <input
                                            ref={inputRef}
                                            type="file"
                                            accept="image/*"
                                            data-testid="image-file-input"
                                            onChange={(e) => {
                                                if (e.target.files && e.target.files[0])
                                                    handleFiles(e.target.files[0]);
                                            }}
                                            className="hidden-file-input"
                                        />
                                        {/* file input stays here (hidden); uploader buttons moved to preview actions */}
                                        <div className="space-y-4">
                                            <AdjustmentsPanel
                                                key={adjustmentsEpoch}
                                                defs={SLIDER_DEFS}
                                                initial={ADJUSTMENT_DEFAULTS}
                                                onCommit={(vals) => {
                                                    setTouchUpTool(null);
                                                    setAdjustments(vals);
                                                    // schedule a redraw
                                                    requestAnimationFrame(() =>
                                                        canvasPreviewRef.current?.redraw()
                                                    );
                                                }}
                                                onBake={async (vals) => {
                                                    if (!canvasPreviewRef.current) return;
                                                    try {
                                                        const blob =
                                                            await canvasPreviewRef.current.exportAdjustedImageBlob?.(
                                                                vals
                                                            );
                                                        if (!blob) return;
                                                        const url = URL.createObjectURL(blob);
                                                        invalidate();
                                                        setImage(url, true);
                                                        // After baking, reset adjustments state to defaults
                                                        setAdjustments(ADJUSTMENT_DEFAULTS);
                                                        setAdjustmentsEpoch((e) => e + 1);
                                                    } catch (e) {
                                                        console.warn('Bake adjustments failed', e);
                                                    }
                                                }}
                                            />
                                            <ImageResizePanel
                                                imageDimensions={imageDimensions}
                                                disabled={!imageSrc || isCropMode}
                                                onApply={resizeCurrentImage}
                                            />
                                            <DeditherPanel
                                                canvasRef={canvasPreviewRef}
                                                onApplyResult={(url) => {
                                                    invalidate();
                                                    setImage(url, true);
                                                }}
                                                onWorkingChange={(working) => {
                                                    setIsDedithering(working);
                                                    if (working) {
                                                        setProcessingLabel('Dedithering...');
                                                        setProcessingStep({
                                                            stepIndex: 1,
                                                            stepCount: 1,
                                                            label: 'Dedithering pass 1',
                                                            stepProgress: 0,
                                                        });
                                                        setProcessingProgress(0);
                                                        setProcessingIndeterminate(false);
                                                    }
                                                }}
                                                onStepChange={setProcessingStep}
                                                onProgress={(value) => {
                                                    setProcessingProgress(clampProgress(value));
                                                }}
                                            />
                                            <ControlsPanel
                                                // finalColors controls postprocessing result count
                                                finalColors={finalColors}
                                                onFinalColorsChange={(n) => {
                                                    setFinalColors(n);
                                                    // changing the final colors should switch to auto palette
                                                    setSelectedPalette('auto');
                                                }}
                                                // weight remains the algorithm parameter
                                                weight={weight}
                                                onWeightChange={(n) => {
                                                    setWeight(n);
                                                }}
                                                algorithm={algorithm}
                                                setAlgorithm={setAlgorithm}
                                                onApply={async () => {
                                                    if (isQuantizing) return;
                                                    setIsQuantizing(true);
                                                    setProcessingLabel('Quantizing...');
                                                    setProcessingStep({
                                                        stepIndex: 1,
                                                        stepCount: 5,
                                                        label: 'Loading image data',
                                                        stepProgress: 0,
                                                    });
                                                    setProcessingProgress(0);
                                                    setProcessingIndeterminate(false);
                                                    await new Promise((r) =>
                                                        requestAnimationFrame(r)
                                                    );
                                                    try {
                                                        await applyQuantize(canvasPreviewRef);
                                                    } finally {
                                                        setIsQuantizing(false);
                                                        setProcessingProgress(1);
                                                        setProcessingIndeterminate(false);
                                                    }
                                                }}
                                                disabled={!imageSrc || isCropMode}
                                                applying={isQuantizing}
                                                weightDisabled={algorithm === 'none'}
                                                selectedPalette={selectedPalette}
                                                onPaletteSelect={(id, size) => {
                                                    setSelectedPalette(id);
                                                    // set the postprocess target to the palette size, but do not lock it
                                                    if (id !== 'auto') setFinalColors(size);
                                                }}
                                                onReset={() => {
                                                    setFinalColors(16);
                                                    setWeight(128);
                                                    setAlgorithm('kmeans');
                                                    setSelectedPalette('auto');
                                                }}
                                                allPalettes={allPalettes}
                                                customPalettes={customPalettes}
                                                importFeedback={paletteImportFeedback}
                                                importInputRef={paletteImportInputRef}
                                                onCreatePalette={handleCreatePalette}
                                                onUpdatePalette={handleUpdatePalette}
                                                onDeletePalette={handleDeletePalette}
                                                onExportPalette={handleExportPalette}
                                                onImportPaletteFile={handleImportPaletteFile}
                                            />
                                            <SwatchesPanel
                                                swatches={swatches}
                                                loading={swatchesLoading}
                                                cap={SWATCH_CAP}
                                                onSwatchDelete={onSwatchDelete}
                                                onSwatchApply={onSwatchApply}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <ThreeDControls
                                        swatches={swatches}
                                        imageDimensions={imageDimensions}
                                        builtState={builtThreeDState}
                                        builtFlatPaint={builtFlatPaint}
                                        onChange={handleThreeDStateChange}
                                        onSettingsChange={(partial) =>
                                            setThreeDState((prev) => ({ ...prev, ...partial }))
                                        }
                                        persisted={threeDState}
                                    />
                                )}
                            </div>
                        </aside>
                        <main className="h-full w-full bg-background flex flex-col min-h-0">
                            <div
                                className={`flex-1 relative min-h-0 w-full ${dropzone.dragOver ? 'bg-primary/20' : ''}`}
                                onDrop={dropzone.onDrop}
                                onDragOver={dropzone.onDragOver}
                                onDragLeave={dropzone.onDragLeave}
                            >
                                {mode === '2d' ? (
                                    <>
                                        <CanvasPreview
                                            ref={canvasPreviewRef}
                                            imageSrc={imageSrc}
                                            isCropMode={isCropMode}
                                            showCheckerboard={showCheckerboard}
                                            adjustments={adjustments}
                                            onCropSelectionChange={setHasValidCropSelection}
                                            touchUpTool={touchUpTool}
                                            touchUpColor={touchUpColor}
                                            touchUpBrushSize={touchUpBrushSize}
                                            touchUpTextSize={touchUpTextSize}
                                            onTouchUpCommit={(blob) => {
                                                const url = URL.createObjectURL(blob);
                                                invalidate();
                                                setImage(url, true);
                                                return url;
                                            }}
                                            onTouchUpPickColor={(hex) => {
                                                setTouchUpColor(hex);
                                                setTouchUpTool('brush');
                                            }}
                                            onTouchUpExit={() => setTouchUpTool(null)}
                                        />
                                        {processingActive && (
                                            <ProgressOverlay
                                                title={progressOperationTitle()}
                                                stepLabel={
                                                    processingStep.label ??
                                                    progressStepName(processingLabel)
                                                }
                                                stepIndex={processingStep.stepIndex}
                                                stepCount={processingStep.stepCount}
                                                stepProgress={processingStep.stepProgress}
                                                progress={processingProgress}
                                                indeterminate={processingIndeterminate}
                                            />
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <ThreeDView
                                            imageSrc={imageSrc}
                                            baseSliceHeight={0}
                                            layerHeight={builtModelState.layerHeight}
                                            slicerFirstLayerHeight={
                                                builtModelState.slicerFirstLayerHeight
                                            }
                                            colorSliceHeights={builtModelState.colorSliceHeights}
                                            colorOrder={builtModelState.colorOrder}
                                            swatches={builtModelState.filteredSwatches}
                                            filamentSwatches={
                                                builtModelAutoPaint
                                                    ? builtModelState.autoPaintFilamentSwatches
                                                    : undefined
                                            }
                                            pixelSize={builtModelState.pixelSize}
                                            rebuildSignal={threeDBuildSignal}
                                            autoPaintEnabled={builtModelAutoPaint}
                                            autoPaintTotalHeight={
                                                builtModelState.autoPaintResult?.totalHeight
                                            }
                                            autoPaintFilamentOrder={
                                                builtModelState.autoPaintResult?.filamentOrder
                                            }
                                            enhancedColorMatch={builtModelState.enhancedColorMatch}
                                            preserveSeparation={builtModelState.preserveSeparation}
                                            heightDithering={builtModelState.heightDithering}
                                            ditherLineWidth={builtModelState.ditherLineWidth}
                                            smoothMeshing={builtModelState.smoothMeshing}
                                            isOrtho={isOrtho}
                                            flatPaint={builtFlatPaint}
                                            previewRenderMode={previewRenderMode}
                                            previewColorMode={previewColorMode}
                                        />
                                        {exportingSTL && (
                                            <ProgressOverlay
                                                title={exportStep.title}
                                                stepLabel={exportStep.stepLabel}
                                                stepIndex={exportStep.stepIndex}
                                                stepCount={exportStep.stepCount}
                                                stepProgress={exportStep.stepProgress}
                                                progress={exportProgress}
                                                indeterminate={exportProgress <= 0}
                                            />
                                        )}
                                    </>
                                )}
                                <PreviewActions
                                    mode={mode}
                                    canUndo={canUndo}
                                    canRedo={canRedo}
                                    isCropMode={isCropMode}
                                    imageAvailable={!!imageSrc}
                                    hasValidCropSelection={hasValidCropSelection}
                                    exportingSTL={exportingSTL}
                                    exportProgress={exportProgress}
                                    onUndo={undo}
                                    onRedo={redo}
                                    onEnterCrop={() => {
                                        if (!imageSrc) return;
                                        setTouchUpTool(null);
                                        setIsCropMode(true);
                                    }}
                                    onSaveCrop={async () => {
                                        if (!canvasPreviewRef.current) return;
                                        const blob =
                                            await canvasPreviewRef.current.exportCroppedImage();
                                        if (!blob) return;
                                        const url = URL.createObjectURL(blob);
                                        invalidate();
                                        setImage(url, true);
                                        setIsCropMode(false);
                                    }}
                                    onCancelCrop={() => setIsCropMode(false)}
                                    onToggleCheckerboard={() => setShowCheckerboard((s) => !s)}
                                    onPickFile={() => inputRef.current?.click()}
                                    onClear={clear}
                                    onExportImage={onExportImage}
                                    onExportStl={onExportStl}
                                    onExport3MF={onExport3MF}
                                    flatPaintModel={builtFlatPaint}
                                    isOrtho={isOrtho}
                                    previewRenderMode={previewRenderMode}
                                    onPreviewRenderModeChange={(next) => {
                                        setPreviewRenderMode(next);
                                        savePreviewRenderMode(next);
                                    }}
                                    autoPaintEnabled={builtModelAutoPaint}
                                    previewColorMode={previewColorMode}
                                    onPreviewColorModeChange={(next) => {
                                        setPreviewColorMode(next);
                                        savePreviewColorMode(next);
                                    }}
                                    touchUpTool={touchUpTool}
                                    onTouchUpToolChange={handleTouchUpToolChange}
                                    touchUpColor={touchUpColor}
                                    onTouchUpColorChange={setTouchUpColor}
                                    touchUpBrushSize={touchUpBrushSize}
                                    onTouchUpBrushSizeChange={setTouchUpBrushSize}
                                    touchUpTextSize={touchUpTextSize}
                                    onTouchUpTextSizeChange={setTouchUpTextSize}
                                    paletteColors={touchUpPaletteColors}
                                    onToggleCamera={() =>
                                        setIsOrtho((v) => {
                                            const next = !v;
                                            saveCameraMode(next);
                                            return next;
                                        })
                                    }
                                />
                            </div>
                        </main>
                    </ResizableSplitter>
                </div>

                {/* Build warning dialog */}
                <AlertDialog
                    open={buildWarning !== null}
                    onOpenChange={(open) => !open && cancelBuild()}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Performance Warning</AlertDialogTitle>
                            <AlertDialogDescription asChild>
                                <div className="space-y-2">
                                    <p>Building the 3D model may be slow due to:</p>
                                    <ul className="list-disc pl-5 space-y-1">
                                        {buildWarning?.warnings.map((w, i) => (
                                            <li key={i}>{w}</li>
                                        ))}
                                    </ul>
                                    <p>Do you want to continue?</p>
                                </div>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={confirmBuild}>
                                Build Anyway
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Update checker for Tauri desktop app */}
                <UpdateChecker />
            </div>
            {printing && <PrintUnlockEffect onDone={handleEffectDone} />}
        </>
    );
}

export default App;
