import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { translateRuntimeMessage } from './lib/runtimeMessages';
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
import SLIDER_DEFS from './lib/sliderDefs';
import ProjectControls from './components/ProjectControls';
import { useProjectWorkspace } from './hooks/useProjectWorkspace';
import {
    DEFAULT_PRINT_SETTINGS,
    loadPrintSettingsFromStorage,
    type PrintSettings,
} from './lib/printSettingsStorage';
import { useSwatches } from './hooks/useSwatches';
import type { SwatchEntry } from './hooks/useSwatches';
import { useImageHistory } from './hooks/useImageHistory';
import { useImageEditingActions } from './hooks/useImageEditingActions';
import { useImageHistoryShortcuts } from './hooks/useImageHistoryShortcuts';
import { useImageCanvas } from './hooks/useImageCanvas';
import { useImageImport, type ImageImportError } from './hooks/useImageImport';
import { useQuantize } from './hooks/useQuantize';
import Header from './components/Header';
import ModeTabs from './components/ModeTabs';
import PreviewActions from './components/PreviewActions';
import { useDropzone } from './hooks/useDropzone';
import { exportObjectToStlBlob } from './lib/exportStl';
import { exportObjectTo3MFBlob } from './lib/export3mf';
import { getMultiHeadRoutingPlan, multiHeadExportOptions } from './lib/multiHeadBuild';
import { normalizeMaxFilamentsPerLayer } from './lib/regionStacks';
import { useAppHandlers, type ExportProgressStep } from './hooks/useAppHandlers';
import { useProcessingState } from './hooks/useProcessingState';
import { useBuildWarning } from './hooks/useBuildWarning';
import { clampProgress } from './lib/progress';
import {
    scheduleAfterTwoAnimationFrames,
    type CancelDeferredWork,
} from './lib/threeDWorkLifecycle';
import { normalizeOptimizerTier } from './lib/optimizer';
import { normalizeSeparationMaxDeltaE } from './lib/autoPaint';
import ResizableSplitter from './components/ResizableSplitter';
import { ControlsPanel } from './components/ControlsPanel';
import { usePaletteManager } from './hooks/usePaletteManager';
import { useDesktopFileOpen } from './hooks/useDesktopFileOpen';
import { useSlicerChoice } from './hooks/useSlicerChoice';
import { DesktopFileDialog } from './components/DesktopFileDialog';
import { SlicerChooserDialog } from './components/SlicerChooserDialog';
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
import { appPath, isDocsRoute, markLaunched } from './lib/routes';
import { isTauri } from '@tauri-apps/api/core';
import {
    migrateLegacyFilamentTd,
    prewarmAutoPaintProfiles,
    repairDuplicateFilamentIds,
    sanitizeProfileFilament,
} from './lib/profileManager';
import PrintUnlockEffect from './components/PrintUnlockEffect';
import { getMultiPlateEnabled, subscribeToMultiPlateEnabled } from './lib/experimentalFeatures';
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
import { Button } from './components/ui/button';
import { Loader, X } from 'lucide-react';
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
    | 'autoPaintMaxHeight'
    | 'calibrationLayerHeight'
    | 'optimizerAlgorithm'
    | 'optimizerSeed'
    | 'regionWeightingMode'
    | 'enhancedColorMatch'
    | 'preserveSeparation'
    | 'separationMaxDeltaE'
    | 'failOnSeparationError'
    | 'allowRepeatedSwaps'
    | 'maxRepeatedSwaps'
    | 'transitionOpacity'
    | 'heightDithering'
    | 'ditherLineWidth'
    | 'omitAtRiskPixels'
    | 'flatPaint'
    | 'flatPaintFaceUp'
    | 'regionStacks'
    | 'regionStacksMaxFilaments'
    | 'multiHeadMode'
    | 'multiHeadCount'
    | 'multiHeadSearchDepth'
    | 'multiHeadColorMode'
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
        const migratedFilaments =
            persistedSchema >= AUTOPAINT_SCHEMA_VERSION
                ? sanitized
                : sanitized.map(migrateLegacyFilamentTd);
        const filaments = repairDuplicateFilamentIds(migratedFilaments);
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
            autoPaintMaxHeight:
                typeof parsed.autoPaintMaxHeight === 'number' &&
                Number.isFinite(parsed.autoPaintMaxHeight) &&
                parsed.autoPaintMaxHeight > 0
                    ? parsed.autoPaintMaxHeight
                    : undefined,
            calibrationLayerHeight:
                typeof parsed.calibrationLayerHeight === 'number' &&
                Number.isFinite(parsed.calibrationLayerHeight) &&
                parsed.calibrationLayerHeight > 0
                    ? parsed.calibrationLayerHeight
                    : undefined,
            optimizerAlgorithm: normalizeOptimizerTier(parsed.optimizerAlgorithm),
            optimizerSeed: parsed.optimizerSeed,
            regionWeightingMode: parsed.regionWeightingMode,
            enhancedColorMatch: parsed.enhancedColorMatch ?? false,
            preserveSeparation: parsed.preserveSeparation ?? false,
            separationMaxDeltaE: normalizeSeparationMaxDeltaE(parsed.separationMaxDeltaE),
            failOnSeparationError: parsed.failOnSeparationError !== false,
            maxRepeatedSwaps: normalizeRepeatLimit(
                parsed.maxRepeatedSwaps,
                parsed.allowRepeatedSwaps
            ),
            transitionOpacity: normalizeTransitionOpacity(parsed.transitionOpacity),
            heightDithering: parsed.heightDithering ?? false,
            ditherLineWidth: parsed.ditherLineWidth,
            omitAtRiskPixels: parsed.omitAtRiskPixels === true,
            flatPaint: parsed.flatPaint ?? false,
            flatPaintFaceUp: parsed.flatPaintFaceUp === true,
            regionStacks: parsed.regionStacks === true,
            regionStacksMaxFilaments: normalizeMaxFilamentsPerLayer(
                parsed.regionStacksMaxFilaments
            ),
            multiHeadMode: parsed.multiHeadMode ?? false,
            multiHeadCount: parsed.multiHeadCount ?? 4,
            multiHeadSearchDepth: parsed.multiHeadSearchDepth ?? 'balanced',
            multiHeadColorMode: parsed.multiHeadColorMode ?? 'luminance',
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
    const { t } = useTranslation('common');
    const toolPath = appPath(isTauri());
    // Multi-plate mode (issue #35) is still a stub. Per the plan, the flow diverges
    // at *image upload*, not at app start — so until an image is uploaded the app
    // must look and behave exactly like today. The experimental "Multi-plate mode"
    // toggle in Settings arms the flag; the future upload decider will read it (via
    // `getMultiPlateEnabled()`) inside the upload path to fork into multi-plate
    // handling. The toggle persists (localStorage) like the other settings. Flipping
    // it on plays a one-shot 3D-print flourish as feedback, then hands straight back
    // to the untouched single-image UI; a persisted-on flag on a fresh load does not
    // replay the flourish, so App only reacts to off→on transitions.
    const multiPlateEnabledRef = useRef(getMultiPlateEnabled());
    const [printing, setPrinting] = useState(false);

    useEffect(() => {
        return subscribeToMultiPlateEnabled((enabled) => {
            if (enabled && !multiPlateEnabledRef.current) setPrinting(true); // flourish only on off→on
            multiPlateEnabledRef.current = enabled;
        });
    }, []);

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
        restoreProjectPalette,
        importFeedback: paletteImportFeedback,
        importInputRef: paletteImportInputRef,
        handleCreatePalette,
        handleUpdatePalette,
        handleClonePalette,
        handleDeletePalette,
        handleExportPalette,
        handleImportFile: handleImportPaletteFile,
        importText: importPaletteText,
    } = usePaletteManager();
    const [paletteEditorOpen, setPaletteEditorOpen] = useState(false);
    const [restoringProject, setRestoringProject] = useState(false);
    const projectRestoreLock = useRef(false);
    const [projectPrintSettings, setProjectPrintSettings] = useState<PrintSettings>();
    const [calibrationDialogOpen, setCalibrationDialogOpen] = useState(false);
    const [profileSaveNewOpen, setProfileSaveNewOpen] = useState(false);
    const [profileRenameOpen, setProfileRenameOpen] = useState(false);
    const [filamentEditing, setFilamentEditing] = useState(false);
    const { file: queuedDesktopFile, finish: finishDesktopFile } = useDesktopFileOpen();
    // OS file opens can arrive through an active editor. Keep the request queued
    // until its draft is saved or dismissed, before changing either workspace.
    const desktopFile =
        restoringProject ||
        paletteEditorOpen ||
        calibrationDialogOpen ||
        profileSaveNewOpen ||
        profileRenameOpen ||
        filamentEditing
            ? null
            : queuedDesktopFile;
    const handledPaletteFile = useRef<number | null>(null);
    const [failedPaletteFileId, setFailedPaletteFileId] = useState<number | null>(null);
    const [completedPaletteFileId, setCompletedPaletteFileId] = useState<number | null>(null);

    // Keep the postprocess color count in sync with the selected palette's
    // enabled size. Edits, per-color toggles, clones, and imports all change
    // the size without a re-selection, so the dropdown callback alone is not
    // enough. Manual overrides persist until the palette or selection changes.
    useEffect(() => {
        if (selectedPalette === 'auto') return;
        const pal = allPalettes.find((p) => p.id === selectedPalette);
        if (pal && pal.size > 0) setFinalColors(pal.size);
    }, [allPalettes, selectedPalette]);
    const {
        importFile,
        isImporting,
        importError: imageImportError,
        dismissImportError,
        cancelPendingImport,
    } = useImageImport();
    const {
        imageSrc,
        setImage,
        replaceWorkspaceImage,
        clearCurrent,
        undo,
        redo,
        canUndo,
        canRedo,
        past,
        future,
    } = useImageHistory(logo, cancelPendingImport);
    const { imageCanvas, imageCanvasLoading, prepareImageCanvas } = useImageCanvas(
        imageSrc,
        past,
        future
    );
    const { swatches, swatchesLoading, imageDimensions, invalidate, immediateOverride } =
        useSwatches(imageCanvas, imageCanvasLoading);
    // adjustments managed locally inside AdjustmentsPanel now
    // initial selectedPalette derived from initial weight above
    const inputRef = useRef<HTMLInputElement | null>(null);
    const canvasPreviewRef = useRef<CanvasPreviewHandle | null>(null);
    const downloadMenuButtonRef = useRef<HTMLButtonElement | null>(null);
    const [showCheckerboard, setShowCheckerboard] = useState<boolean>(false);
    const [isCropMode, setIsCropMode] = useState(false);
    const [hasValidCropSelection, setHasValidCropSelection] = useState(false);
    // 2D touch-up tools are session-only; image changes still use shared history.
    const [touchUpTool, setTouchUpTool] = useState<TouchUpTool | null>(null);
    const [touchUpColor, setTouchUpColor] = useState('#000000');
    const [touchUpBrushSize, setTouchUpBrushSize] = useState(4);
    const [touchUpTextSize, setTouchUpTextSize] = useState(24);
    const processing = useProcessingState();
    const {
        isQuantizing,
        isDedithering,
        processingLabel,
        processingProgress,
        setProcessingProgress,
        processingIndeterminate,
        setProcessingIndeterminate,
    } = processing;
    const [processingStep, setProcessingStep] = useState<ProcessingStepState>({
        stepIndex: 1,
        stepCount: 1,
    });
    const { applyQuantize: quantize } = useQuantize({
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
    const [hasMountedThreeDControls, setHasMountedThreeDControls] = useState(false);
    const [, startThreeDControlsTransition] = useTransition();
    const cancelThreeDMountRef = useRef<CancelDeferredWork | null>(null);
    const handleModeChange = useCallback(
        (nextMode: '2d' | '3d') => {
            setMode(nextMode);
            if (nextMode !== '3d') {
                cancelThreeDMountRef.current?.();
                cancelThreeDMountRef.current = null;
                return;
            }

            if (!hasMountedThreeDControls && !cancelThreeDMountRef.current) {
                cancelThreeDMountRef.current = scheduleAfterTwoAnimationFrames(() => {
                    cancelThreeDMountRef.current = null;
                    startThreeDControlsTransition(() => setHasMountedThreeDControls(true));
                });
            }
        },
        [hasMountedThreeDControls]
    );
    useEffect(
        () => () => {
            cancelThreeDMountRef.current?.();
            cancelThreeDMountRef.current = null;
        },
        []
    );
    useEffect(() => {
        let cancelled = false;
        const prewarm = () => {
            if (!cancelled) prewarmAutoPaintProfiles();
        };

        const idleWindow = window as unknown as {
            requestIdleCallback?: Window['requestIdleCallback'];
            cancelIdleCallback?: Window['cancelIdleCallback'];
        };
        if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
            const idleId = idleWindow.requestIdleCallback(prewarm);
            return () => {
                cancelled = true;
                idleWindow.cancelIdleCallback?.(idleId);
            };
        }

        const timerId = globalThis.setTimeout(prewarm, 250);
        return () => {
            cancelled = true;
            globalThis.clearTimeout(timerId);
        };
    }, []);
    const [docsOpen, setDocsOpen] = useState(() => isDocsRoute(window.location.pathname));
    useEffect(() => {
        if (!desktopFile || desktopFile.content === null) return;
        setDocsOpen(false);
        if (isDocsRoute(window.location.pathname)) window.history.pushState(null, '', toolPath);
        if (desktopFile.kind === 'profile') {
            handleModeChange('3d');
        } else if (handledPaletteFile.current !== desktopFile.id) {
            handledPaletteFile.current = desktopFile.id;
            handleModeChange('2d');
            try {
                if (importPaletteText(desktopFile.content, true))
                    setCompletedPaletteFileId(desktopFile.id);
                else setFailedPaletteFileId(desktopFile.id);
            } catch (error) {
                console.error('Could not import the opened palette', error);
                setFailedPaletteFileId(desktopFile.id);
            }
        }
    }, [desktopFile, handleModeChange, importPaletteText, toolPath]);
    useEffect(() => {
        if (completedPaletteFileId !== null) finishDesktopFile(completedPaletteFileId);
    }, [completedPaletteFileId, finishDesktopFile]);
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
    // Hydrate before the shared 3D state is created. Hydrating in an effect lets
    // the persistence effect from the same initial commit overwrite saved values
    // with defaults before React applies the hydrated state (especially on HMR).
    const [autopaintHydrated] = useState(loadAutoPaintPersisted);
    const autoPaintWorkingStateInitializedRef = useRef(autopaintHydrated !== null);

    // 3D printing shared state
    const {
        threeDState,
        handleThreeDSettingsChange,
        restoreThreeDSettings,
        threeDBuildSignal,
        builtThreeDState,
        builtFlatPaint,
        buildWarning,
        isBuildStarting,
        handleThreeDStateChange,
        confirmBuild,
        cancelBuild,
        markBuildStarted,
    } = useBuildWarning({ imageSrc, imageCanvas, initialState: autopaintHydrated });
    const [isThreeDBuilding, setIsThreeDBuilding] = useState(false);
    // The build overlays cover the preview actions, but not from keyboard or screen readers.
    const threeDBuildBusy = isBuildStarting || isThreeDBuilding;
    const builtModelState = builtThreeDState ?? threeDState;
    const builtModelAutoPaint = builtModelState.paintMode === 'autopaint';
    const builtModelValid = !builtModelAutoPaint || builtModelState.autoPaintResult !== undefined;
    const builtMultiHeadPlan = useMemo(
        () => getMultiHeadRoutingPlan(builtModelState),
        [builtModelState]
    );
    const builtRegionStackPlan = builtModelAutoPaint ? builtModelState.regionStackPlan : undefined;
    // These models are built from parts that only 3MF keeps apart.
    const builtModelStlUnavailable =
        builtFlatPaint || builtMultiHeadPlan !== undefined || builtRegionStackPlan !== undefined;

    const prevModeRef = useRef<typeof mode>(mode);

    useEffect(() => {
        if (projectPrintSettings) return;
        saveAutoPaintPersisted({
            filaments: threeDState.filaments,
            paintMode: threeDState.paintMode ?? 'manual',
            autoPaintMaxHeight: threeDState.autoPaintMaxHeight,
            calibrationLayerHeight: threeDState.calibrationLayerHeight,
            optimizerAlgorithm: threeDState.optimizerAlgorithm,
            optimizerSeed: threeDState.optimizerSeed,
            regionWeightingMode: threeDState.regionWeightingMode,
            enhancedColorMatch: threeDState.enhancedColorMatch,
            preserveSeparation: threeDState.preserveSeparation,
            separationMaxDeltaE: threeDState.separationMaxDeltaE,
            failOnSeparationError: threeDState.failOnSeparationError,
            maxRepeatedSwaps: threeDState.maxRepeatedSwaps,
            transitionOpacity: threeDState.transitionOpacity,
            heightDithering: threeDState.heightDithering,
            ditherLineWidth: threeDState.ditherLineWidth,
            omitAtRiskPixels: threeDState.omitAtRiskPixels,
            flatPaint: threeDState.flatPaint,
            flatPaintFaceUp: threeDState.flatPaintFaceUp,
            regionStacks: threeDState.regionStacks,
            regionStacksMaxFilaments: threeDState.regionStacksMaxFilaments,
            multiHeadMode: threeDState.multiHeadMode,
            multiHeadCount: threeDState.multiHeadCount,
            multiHeadSearchDepth: threeDState.multiHeadSearchDepth,
            multiHeadColorMode: threeDState.multiHeadColorMode,
        });
    }, [
        projectPrintSettings,
        threeDState.filaments,
        threeDState.paintMode,
        threeDState.autoPaintMaxHeight,
        threeDState.calibrationLayerHeight,
        threeDState.optimizerAlgorithm,
        threeDState.optimizerSeed,
        threeDState.regionWeightingMode,
        threeDState.enhancedColorMatch,
        threeDState.preserveSeparation,
        threeDState.separationMaxDeltaE,
        threeDState.failOnSeparationError,
        threeDState.maxRepeatedSwaps,
        threeDState.transitionOpacity,
        threeDState.heightDithering,
        threeDState.ditherLineWidth,
        threeDState.omitAtRiskPixels,
        threeDState.flatPaint,
        threeDState.flatPaintFaceUp,
        threeDState.regionStacks,
        threeDState.regionStacksMaxFilaments,
        threeDState.multiHeadMode,
        threeDState.multiHeadCount,
        threeDState.multiHeadSearchDepth,
        threeDState.multiHeadColorMode,
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
            setDocsOpen(isDocsRoute(window.location.pathname));
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
        if (isDocsRoute(window.location.pathname)) {
            window.history.pushState(null, '', toolPath);
        }
    };

    const openDocs = () => {
        setDocsOpen(true);
        if (!parseDocsLocation(window.location)) {
            window.history.pushState(null, '', buildDocsPath(defaultDocSlug));
        }
    };

    const processingActive = isQuantizing || isDedithering || restoringProject;
    const projectBlocked =
        processingActive ||
        threeDBuildBusy ||
        isImporting ||
        isCropMode ||
        paletteEditorOpen ||
        calibrationDialogOpen ||
        profileSaveNewOpen ||
        profileRenameOpen ||
        filamentEditing;
    const project = useProjectWorkspace({
        blocked: projectBlocked,
        imageCanvas,
        captureSettings: () => ({
            name: '',
            appVersion: __APP_VERSION__,
            adjustments,
            quantize: {
                algorithm,
                weight,
                finalColors,
                paletteId: selectedPalette,
                palette: customPalettes.find((palette) => palette.id === selectedPalette),
            },
            print: hasMountedThreeDControls
                ? {
                      layerHeight: threeDState.layerHeight,
                      slicerFirstLayerHeight:
                          threeDState.slicerFirstLayerHeight ??
                          DEFAULT_PRINT_SETTINGS.slicerFirstLayerHeight,
                      pixelSize: threeDState.pixelSize,
                      smoothMeshingStrength:
                          threeDState.smoothMeshingStrength ??
                          DEFAULT_PRINT_SETTINGS.smoothMeshingStrength,
                  }
                : (projectPrintSettings ??
                  loadPrintSettingsFromStorage() ??
                  DEFAULT_PRINT_SETTINGS),
            working3D: threeDState,
        }),
        cancelImport: cancelPendingImport,
        onRestoringChange: (restoring) => {
            projectRestoreLock.current = restoring;
            setRestoringProject(restoring);
        },
        commit: (settings, src, canvas, file) => {
            restoreProjectPalette(settings.quantize.paletteId, settings.quantize.palette);
            setAlgorithm(settings.quantize.algorithm);
            setWeight(settings.quantize.weight);
            setFinalColors(settings.quantize.finalColors);
            setAdjustments(settings.adjustments);
            setAdjustmentsEpoch((epoch) => epoch + 1);
            setTouchUpTool(null);
            setIsCropMode(false);
            setHasValidCropSelection(false);
            handleModeChange('2d');
            setHasMountedThreeDControls(false);
            setProjectPrintSettings(settings.print);
            autoPaintWorkingStateInitializedRef.current = true;
            restoreThreeDSettings({ ...settings.working3D, ...settings.print });
            prepareImageCanvas(src, canvas, file);
            invalidate();
            replaceWorkspaceImage(src);
        },
    });
    const imageActions = useImageEditingActions({
        imageSrc,
        workspaceLock: projectRestoreLock,
        imageCanvasLoading,
        canvasPreviewRef,
        inputRef,
        importFile,
        cancelPendingImport,
        prepareImageCanvas,
        invalidate,
        setImage,
        clearCurrent,
        resetTouchUp: () => setTouchUpTool(null),
        setAdjustments,
        resetAdjustmentsPanel: () => setAdjustmentsEpoch((epoch) => epoch + 1),
        exitCrop: () => setIsCropMode(false),
        processing,
        setProcessingStep,
        quantize,
    });
    const { handleFiles, applyQuantize } = imageActions;
    useImageHistoryShortcuts({
        undo,
        redo,
        canUndo,
        canRedo,
        disabled: mode !== '2d' || docsOpen || isCropMode || processingActive,
        beginEdit: imageActions.beginEdit,
    });

    const imageImportErrorMessage = (error: ImageImportError) => {
        if (error.kind === 'notImage') return t('app.uploadImage');
        if (error.kind === 'tooLarge') {
            const values = {
                name: error.name,
                width: error.width,
                height: error.height,
                maxSize: `${error.maxSquareSide}×${error.maxSquareSide}`,
            };
            return error.keptImage
                ? t('app.imageTooLarge', values)
                : t('app.imageTooLargeNoImage', values);
        }
        return error.keptImage
            ? t('app.imageDecodeFailed', { name: error.name })
            : t('app.imageDecodeFailedNoImage', { name: error.name });
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
        if (!imageSrc || !imageActions.beginEdit()) return;
        setTouchUpTool(nextTool);
    };

    // Quantize and dedither commit their result through image history, which cancels a
    // pending import, so refuse new imports until they finish rather than drop one silently.
    const dropzone = useDropzone({
        enabled: mode === '2d' && !processingActive,
        onFile: handleFiles,
    });
    const {
        onExportImage,
        onExportStl,
        onExport3MF,
        onOpenInSlicer,
        onSwatchApply,
        onSwatchDelete,
    } = useAppHandlers({
        beginEdit: imageActions.beginEdit,
        canvasPreviewRef,
        imageSrc,
        invalidate,
        setImage,
        setExportingSTL,
        setExportProgress,
        setExportStep,
        exportingSTL,
        threeDBuildBusy,
        stlUnavailable: builtModelStlUnavailable,
        exportObjectToStlBlob,
        exportObjectTo3MFBlob: (obj, onProgress, onZipProgress) =>
            exportObjectTo3MFBlob(obj, {
                ...multiHeadExportOptions(builtMultiHeadPlan),
                layerHeight: builtModelState.layerHeight,
                firstLayerHeight: builtModelState.slicerFirstLayerHeight,
                smoothMeshingStrength: builtModelState.smoothMeshingStrength,
                layerFilamentColors: builtModelAutoPaint
                    ? builtModelState.autoPaintFilamentSwatches?.map((s) => s.hex)
                    : undefined,
                onProgress,
                onZipProgress,
            }),
        applyQuantize,
        swatches,
    });
    const slicerChoice = useSlicerChoice(onOpenInSlicer);

    return (
        <>
            <div className="box-border text-inherit font-sans flex flex-col flex-1 min-w-0 max-w-full min-h-0 h-screen w-full">
                <Header
                    docsOpen={docsOpen}
                    onBackToApp={backToApp}
                    onOpenDocs={openDocs}
                    slicer={
                        isTauri()
                            ? {
                                  preference: slicerChoice.preference,
                                  onChange: slicerChoice.onChangeSavedSlicer,
                                  onForget: slicerChoice.onForgetSlicer,
                              }
                            : undefined
                    }
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
                        <aside className="h-full w-full bg-card border-r border-border flex flex-col min-h-0">
                            <ModeTabs mode={mode} onChange={handleModeChange} />
                            <ProjectControls
                                disabled={projectBlocked}
                                canSave={!!imageCanvas}
                                name={project.name}
                                onNameChange={project.setName}
                                onCapture={project.capture}
                                onRestore={project.restore}
                            />
                            <div className="flex-1 overflow-y-auto overflow-x-auto p-4">
                                {mode === '2d' && (
                                    <>
                                        <input
                                            ref={inputRef}
                                            type="file"
                                            accept="image/*"
                                            disabled={processingActive}
                                            data-testid="image-file-input"
                                            onChange={(e) => {
                                                const file = e.currentTarget.files?.[0];
                                                // Allow choosing this same source again after
                                                // cropping, resizing, or other image edits.
                                                e.currentTarget.value = '';
                                                if (file) void handleFiles(file);
                                            }}
                                            className="hidden-file-input"
                                        />
                                        {/* file input stays here (hidden); uploader buttons moved to preview actions */}
                                        <fieldset
                                            className="space-y-4 min-w-0"
                                            disabled={processingActive}
                                        >
                                            <AdjustmentsPanel
                                                disabled={processingActive}
                                                key={adjustmentsEpoch}
                                                defs={SLIDER_DEFS}
                                                initial={adjustments}
                                                onCommit={(vals) => {
                                                    if (!imageActions.beginEdit()) return;
                                                    setTouchUpTool(null);
                                                    setAdjustments(vals);
                                                    // schedule a redraw
                                                    requestAnimationFrame(() =>
                                                        canvasPreviewRef.current?.redraw()
                                                    );
                                                }}
                                                onBake={imageActions.bakeAdjustments}
                                            />
                                            <ImageResizePanel
                                                imageDimensions={imageDimensions}
                                                disabled={
                                                    !imageSrc ||
                                                    isCropMode ||
                                                    processingActive ||
                                                    imageCanvasLoading
                                                }
                                                onApply={imageActions.resizeCurrentImage}
                                            />
                                            <DeditherPanel
                                                beginEdit={imageActions.beginProcessingEdit}
                                                canvasRef={canvasPreviewRef}
                                                onApplyResult={(url) => {
                                                    invalidate();
                                                    setImage(url, true);
                                                }}
                                                onWorkingChange={
                                                    imageActions.onDeditherWorkingChange
                                                }
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
                                                onApply={() => applyQuantize(canvasPreviewRef)}
                                                disabled={
                                                    !imageSrc ||
                                                    isCropMode ||
                                                    processingActive ||
                                                    imageCanvasLoading
                                                }
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
                                                onClonePalette={handleClonePalette}
                                                onDeletePalette={handleDeletePalette}
                                                onExportPalette={handleExportPalette}
                                                onImportPaletteFile={handleImportPaletteFile}
                                                paletteEditorOpen={paletteEditorOpen}
                                                onPaletteEditorOpenChange={setPaletteEditorOpen}
                                            />
                                            <SwatchesPanel
                                                swatches={swatches}
                                                loading={swatchesLoading}
                                                cap={SWATCH_CAP}
                                                onSwatchDelete={onSwatchDelete}
                                                onSwatchApply={onSwatchApply}
                                            />
                                        </fieldset>
                                    </>
                                )}
                                {mode === '3d' && !hasMountedThreeDControls && (
                                    <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
                                        {t('app.preparingControls')}
                                    </div>
                                )}
                                {hasMountedThreeDControls && (
                                    <div className={mode === '3d' ? undefined : 'hidden'}>
                                        <ThreeDControls
                                            active={mode === '3d'}
                                            swatches={swatches}
                                            imageSrc={imageSrc}
                                            imageCanvas={imageCanvas}
                                            imageDimensions={imageDimensions}
                                            builtState={builtThreeDState}
                                            builtFlatPaint={builtFlatPaint}
                                            onChange={handleThreeDStateChange}
                                            onSettingsChange={(partial) => {
                                                autoPaintWorkingStateInitializedRef.current = true;
                                                handleThreeDSettingsChange(partial);
                                            }}
                                            persisted={threeDState}
                                            projectPrintSettings={projectPrintSettings}
                                            hasAutoPaintWorkingState={
                                                autoPaintWorkingStateInitializedRef.current
                                            }
                                            desktopProfileFile={
                                                desktopFile?.kind === 'profile' &&
                                                desktopFile.content !== null
                                                    ? desktopFile
                                                    : null
                                            }
                                            onDesktopFileFinished={finishDesktopFile}
                                            calibrationDialogOpen={calibrationDialogOpen}
                                            onCalibrationDialogOpenChange={setCalibrationDialogOpen}
                                            profileSaveNewOpen={profileSaveNewOpen}
                                            onProfileSaveNewOpenChange={setProfileSaveNewOpen}
                                            profileRenameOpen={profileRenameOpen}
                                            onProfileRenameOpenChange={setProfileRenameOpen}
                                            onFilamentEditingChange={setFilamentEditing}
                                        />
                                    </div>
                                )}
                            </div>
                        </aside>
                        <main className="h-full w-full bg-background flex flex-col min-h-0">
                            <div
                                className={`flex-1 relative min-h-0 w-full ${dropzone.dragOver ? 'bg-primary/20' : ''}`}
                                data-testid="image-dropzone"
                                aria-busy={isImporting}
                                onDrop={dropzone.onDrop}
                                onDragOver={dropzone.onDragOver}
                                onDragLeave={dropzone.onDragLeave}
                            >
                                {mode === '3d' && !hasMountedThreeDControls && (
                                    <ProgressOverlay
                                        title="Preparing 3D workspace"
                                        stepLabel="Loading controls"
                                        progress={0}
                                        indeterminate
                                    />
                                )}
                                {mode === '2d' && (
                                    <>
                                        <CanvasPreview
                                            ref={canvasPreviewRef}
                                            imageSrc={imageSrc}
                                            imageCanvas={imageCanvas}
                                            isCropMode={isCropMode}
                                            showCheckerboard={showCheckerboard}
                                            adjustments={adjustments}
                                            onCropSelectionChange={setHasValidCropSelection}
                                            touchUpTool={touchUpTool}
                                            touchUpDisabled={processingActive}
                                            touchUpColor={touchUpColor}
                                            touchUpBrushSize={touchUpBrushSize}
                                            touchUpTextSize={touchUpTextSize}
                                            onTouchUpCommit={imageActions.commitTouchUp}
                                            onTouchUpPickColor={(hex) => {
                                                setTouchUpColor(hex);
                                                setTouchUpTool('brush');
                                            }}
                                            onTouchUpExit={() => setTouchUpTool(null)}
                                        />
                                        {isImporting && (
                                            <div
                                                role="status"
                                                data-testid="image-import-busy"
                                                className="pointer-events-none absolute bottom-4 right-4 z-40 flex items-center gap-2 rounded-md bg-background/95 px-3 py-2 text-sm shadow-sm"
                                            >
                                                <Loader
                                                    className="h-4 w-4 animate-spin"
                                                    aria-hidden
                                                />
                                                {t('app.checkingImage')}
                                            </div>
                                        )}
                                        {imageImportError && (
                                            <div
                                                role="alert"
                                                data-testid="image-import-error"
                                                className="absolute bottom-4 left-4 right-4 z-30 flex items-start gap-3 rounded-md border border-destructive/50 bg-background/95 p-4 text-sm break-words"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-semibold text-destructive">
                                                        {t('app.imageImportFailed')}
                                                    </p>
                                                    <p className="mt-1 text-muted-foreground">
                                                        {imageImportErrorMessage(imageImportError)}
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={dismissImportError}
                                                    aria-label={t('app.dismissImageImportError')}
                                                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}
                                        {(isQuantizing || isDedithering) && (
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
                                )}
                                {hasMountedThreeDControls && (
                                    <div
                                        className={`absolute inset-0 ${mode === '3d' ? '' : 'hidden'}`}
                                    >
                                        <>
                                            <ThreeDView
                                                imageSrc={builtModelValid ? imageSrc : null}
                                                imageCanvas={builtModelValid ? imageCanvas : null}
                                                baseSliceHeight={0}
                                                layerHeight={builtModelState.layerHeight}
                                                slicerFirstLayerHeight={
                                                    builtModelState.slicerFirstLayerHeight
                                                }
                                                colorSliceHeights={
                                                    builtModelState.patchedSliceData
                                                        ?.colorSliceHeights ??
                                                    builtModelState.colorSliceHeights
                                                }
                                                colorOrder={
                                                    builtModelState.patchedSliceData?.colorOrder ??
                                                    builtModelState.colorOrder
                                                }
                                                swatches={
                                                    builtModelAutoPaint &&
                                                    builtModelState.patchedSliceData
                                                        ? builtModelState.patchedSliceData.swatches
                                                        : builtModelState.filteredSwatches
                                                }
                                                filamentSwatches={
                                                    builtModelAutoPaint &&
                                                    !builtModelState.patchedSliceData
                                                        ? builtModelState.autoPaintFilamentSwatches
                                                        : undefined
                                                }
                                                pixelSize={builtModelState.pixelSize}
                                                rebuildSignal={threeDBuildSignal}
                                                multiHeadPlan={builtMultiHeadPlan}
                                                autoPaintEnabled={builtModelAutoPaint}
                                                autoPaintTotalHeight={
                                                    builtModelState.autoPaintResult?.totalHeight
                                                }
                                                autoPaintFilamentOrder={
                                                    builtModelState.autoPaintResult?.filamentOrder
                                                }
                                                autoPaintFinalStack={
                                                    builtModelState.autoPaintResult?.finalStack
                                                }
                                                enhancedColorMatch={
                                                    builtModelState.enhancedColorMatch
                                                }
                                                preserveSeparation={
                                                    builtModelState.preserveSeparation
                                                }
                                                separationMaxDeltaE={
                                                    builtModelState.separationMaxDeltaE
                                                }
                                                heightDithering={builtModelState.heightDithering}
                                                ditherLineWidth={builtModelState.ditherLineWidth}
                                                printableFeaturePixels={
                                                    builtModelState.printableFeaturePixels
                                                }
                                                smoothMeshingStrength={
                                                    builtModelState.smoothMeshingStrength
                                                }
                                                isOrtho={isOrtho}
                                                flatPaint={builtFlatPaint}
                                                flatPaintFaceUp={!!builtModelState.flatPaintFaceUp}
                                                regionStackPlan={builtRegionStackPlan}
                                                previewRenderMode={previewRenderMode}
                                                previewColorMode={previewColorMode}
                                                onBuildStarted={markBuildStarted}
                                                onBuildingChange={setIsThreeDBuilding}
                                                active={mode === '3d'}
                                            />
                                            {isBuildStarting && (
                                                <ProgressOverlay
                                                    title="Preparing 3D model"
                                                    stepLabel="Starting build"
                                                    progress={0}
                                                    indeterminate
                                                />
                                            )}
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
                                    </div>
                                )}
                                <PreviewActions
                                    mode={mode}
                                    canUndo={canUndo && !processingActive}
                                    canRedo={canRedo && !processingActive}
                                    isCropMode={isCropMode}
                                    imageAvailable={!!imageSrc && !processingActive}
                                    hasValidCropSelection={hasValidCropSelection}
                                    exportingSTL={exportingSTL}
                                    exportProgress={exportProgress}
                                    onUndo={() => {
                                        if (imageActions.beginEdit()) undo();
                                    }}
                                    onRedo={() => {
                                        if (imageActions.beginEdit()) redo();
                                    }}
                                    onEnterCrop={() => {
                                        if (!imageSrc || !imageActions.beginEdit()) return;
                                        setTouchUpTool(null);
                                        setIsCropMode(true);
                                    }}
                                    onSaveCrop={imageActions.saveCrop}
                                    onCancelCrop={imageActions.cancelCrop}
                                    onToggleCheckerboard={() => setShowCheckerboard((s) => !s)}
                                    onPickFile={() => inputRef.current?.click()}
                                    pickFileDisabled={processingActive}
                                    onClear={imageActions.clearImage}
                                    onExportImage={onExportImage}
                                    onExportStl={onExportStl}
                                    onExport3MF={onExport3MF}
                                    onOpenInSlicer={
                                        isTauri() ? slicerChoice.onOpenInSlicer : undefined
                                    }
                                    savedSlicerName={
                                        slicerChoice.preference?.kind === 'app'
                                            ? slicerChoice.preference.app.name
                                            : undefined
                                    }
                                    onChooseSlicer={
                                        slicerChoice.preference
                                            ? slicerChoice.onChooseSlicer
                                            : undefined
                                    }
                                    downloadMenuButtonRef={downloadMenuButtonRef}
                                    stlUnavailable={builtModelStlUnavailable}
                                    modelExportDisabled={!builtModelValid || threeDBuildBusy}
                                    inert={mode === '3d' && threeDBuildBusy}
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
                            <AlertDialogTitle>{t('app.performanceWarning')}</AlertDialogTitle>
                            <AlertDialogDescription asChild>
                                <div className="space-y-2">
                                    <p>{t('app.slowBuild')}</p>
                                    <ul className="list-disc pl-5 space-y-1">
                                        {buildWarning?.warnings.map((w, i) => (
                                            <li key={i}>{translateRuntimeMessage(w)}</li>
                                        ))}
                                    </ul>
                                    <p>{t('app.continue')}</p>
                                </div>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t('app.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={confirmBuild}>
                                {t('app.buildAnyway')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {slicerChoice.chooser && (
                    <SlicerChooserDialog
                        preference={slicerChoice.preference}
                        missingSlicerName={slicerChoice.chooser.missingSlicerName}
                        saveOnly={slicerChoice.chooser.saveOnly}
                        fallbackFocusRef={downloadMenuButtonRef}
                        onConfirm={slicerChoice.onChooserConfirm}
                        onCancel={slicerChoice.onChooserCancel}
                    />
                )}
                {/* Update checker for Tauri desktop app */}
                <UpdateChecker />
                {desktopFile &&
                    (desktopFile.content === null || failedPaletteFileId === desktopFile.id) && (
                        <DesktopFileDialog
                            name={desktopFile.name}
                            onDismiss={() => {
                                setFailedPaletteFileId(null);
                                finishDesktopFile(desktopFile.id);
                            }}
                        />
                    )}
            </div>
            {printing && <PrintUnlockEffect onDone={handleEffectDone} />}
        </>
    );
}

export default App;
