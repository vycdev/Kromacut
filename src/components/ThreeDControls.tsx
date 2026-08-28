import { useCallback, useEffect, useMemo, useState } from 'react';
import { CollapsibleCard, DirtyDot } from '@/components/CollapsibleCard';
import ThreeDColorRow from './ThreeDColorRow';
import { Sortable, SortableContent, SortableOverlay } from '@/components/ui/sortable';
import { Button } from '@/components/ui/button';
import { Check, RotateCcw, Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    autoPaintResultMatchesSliceGrid,
    autoPaintToSliceHeights,
    normalizeSeparationMaxDeltaE,
} from '../lib/autoPaint';
import {
    loadPrintSettingsFromStorage,
    savePrintSettingsToStorage,
    DEFAULT_PRINT_SETTINGS,
} from '../lib/printSettingsStorage';
import { useFilaments } from '../hooks/useFilaments';
import { useProfileManager } from '../hooks/useProfileManager';
import { useColorSlicing } from '../hooks/useColorSlicing';
import { useSwapPlan } from '../hooks/useSwapPlan';
import { useAutoPaintWorker } from '../hooks/useAutoPaintWorker';
import { usePrintableFeatureSimulation } from '../hooks/usePrintableFeatureSimulation';
import type {
    AutoPaintRepeatLimit,
    AutoPaintTransitionOpacity,
    Swatch,
    ThreeDControlsStateShape,
} from '../types';
import PrintSettingsCard from './PrintSettingsCard';
import PrintInstructions from './PrintInstructions';
import AutoPaintTab from './AutoPaintTab';
import type { ImageDimensions } from '../hooks/useSwatches';
import { concealPrintableFeatureBuffers } from '../lib/printableFeatures.ts';

// Re-export types for backward compatibility
export type { Filament, ThreeDControlsStateShape } from '../types';

interface ThreeDControlsProps {
    /** Whether the 3D workspace is visible and may run expensive background work. */
    active?: boolean;
    swatches: Swatch[] | null;
    imageSrc: string | null;
    imageDimensions: ImageDimensions | null;
    /** Snapshot of the settings used for the model currently built in the preview/export pane. */
    builtState?: ThreeDControlsStateShape | null;
    /** Whether the model currently built in the preview/export pane is a Flat Paint slab. */
    builtFlatPaint?: boolean;
    onChange?: (state: ThreeDControlsStateShape) => void;
    /**
     * Called whenever non-build settings change so the parent can keep
     * its snapshot current without triggering a 3D rebuild.
     */
    onSettingsChange?: (partial: Partial<ThreeDControlsStateShape>) => void;
    /**
     * Persisted state from a previous mount used to hydrate this component
     * when the user switches away from 3D mode and comes back later.
     */
    persisted?: ThreeDControlsStateShape | null;
}

export default function ThreeDControls({
    active = true,
    swatches,
    imageSrc,
    imageDimensions,
    builtState = null,
    builtFlatPaint = false,
    onChange,
    onSettingsChange,
    persisted,
}: ThreeDControlsProps) {
    // --- Filaments ---
    const {
        filaments,
        setFilaments,
        addFilament,
        addFilamentWithProps,
        removeFilament,
        updateFilament,
    } = useFilaments({
        initial: persisted?.filaments?.length ? persisted.filaments : undefined,
    });

    // --- Profiles ---
    const profileManager = useProfileManager({ filaments, setFilaments });

    // Apply initial filaments from profile if available (one-time)
    const [appliedProfileInit] = useState(() => {
        if (profileManager.initialFilaments && profileManager.initialFilaments.length > 0) {
            return profileManager.initialFilaments;
        }
        return null;
    });
    useEffect(() => {
        if (appliedProfileInit) {
            setFilaments(appliedProfileInit);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const initialPaintMode = persisted?.paintMode ?? 'manual';
    const initialFlatPaint = persisted?.flatPaint ?? false;

    // --- Print Settings ---
    const [initialPrintSettings] = useState(() => {
        const stored = loadPrintSettingsFromStorage();
        const storedSmoothMeshing =
            stored?.smoothMeshing ??
            persisted?.smoothMeshing ??
            DEFAULT_PRINT_SETTINGS.smoothMeshing;
        return {
            layerHeight:
                stored?.layerHeight ?? persisted?.layerHeight ?? DEFAULT_PRINT_SETTINGS.layerHeight,
            slicerFirstLayerHeight:
                stored?.slicerFirstLayerHeight ??
                persisted?.slicerFirstLayerHeight ??
                DEFAULT_PRINT_SETTINGS.slicerFirstLayerHeight,
            pixelSize:
                stored?.pixelSize ?? persisted?.pixelSize ?? DEFAULT_PRINT_SETTINGS.pixelSize,
            smoothMeshing: storedSmoothMeshing,
        };
    });

    const [layerHeight, setLayerHeight] = useState<number>(initialPrintSettings.layerHeight);
    const [slicerFirstLayerHeight, setSlicerFirstLayerHeight] = useState<number>(
        initialPrintSettings.slicerFirstLayerHeight
    );
    const [pixelSize, setPixelSize] = useState<number>(initialPrintSettings.pixelSize);
    const [smoothMeshing, setSmoothMeshing] = useState<boolean>(initialPrintSettings.smoothMeshing);
    const [calibrationLayerHeight, setCalibrationLayerHeight] = useState<number>(
        persisted?.calibrationLayerHeight ?? initialPrintSettings.layerHeight
    );
    const [paintMode, setPaintMode] = useState<'manual' | 'autopaint'>(initialPaintMode);
    const [autoPaintMaxHeight, setAutoPaintMaxHeight] = useState<number | undefined>(
        persisted?.autoPaintMaxHeight
    );
    const [enhancedColorMatch, setEnhancedColorMatch] = useState(
        persisted?.enhancedColorMatch ?? false
    );
    const initialPreserveSeparation = persisted?.preserveSeparation ?? false;
    const [preserveSeparation, setPreserveSeparation] = useState(initialPreserveSeparation);
    const [separationMaxDeltaE, setSeparationMaxDeltaE] = useState(() =>
        normalizeSeparationMaxDeltaE(persisted?.separationMaxDeltaE)
    );
    const [failOnSeparationError, setFailOnSeparationError] = useState(
        persisted?.failOnSeparationError !== false
    );
    const [maxRepeatedSwaps, setMaxRepeatedSwaps] = useState<AutoPaintRepeatLimit>(
        persisted?.maxRepeatedSwaps ?? (persisted?.allowRepeatedSwaps ? 4 : 0)
    );
    const [transitionOpacity, setTransitionOpacity] = useState<AutoPaintTransitionOpacity>(
        persisted?.transitionOpacity ?? 0.9
    );
    const [heightDithering, setHeightDithering] = useState(
        initialPreserveSeparation ? false : (persisted?.heightDithering ?? false)
    );
    const [ditherLineWidth, setDitherLineWidth] = useState(persisted?.ditherLineWidth ?? 0.42);
    const [omitAtRiskPixels, setOmitAtRiskPixels] = useState(
        persisted?.omitAtRiskPixels ?? false
    );
    const [flatPaint, setFlatPaint] = useState(initialFlatPaint);
    const [flatPaintFaceUp, setFlatPaintFaceUp] = useState(persisted?.flatPaintFaceUp ?? false);

    // --- Optimizer Options ---
    const [optimizerAlgorithm, setOptimizerAlgorithm] = useState<
        'fast' | 'balanced' | 'thorough' | 'deep' | 'exact'
    >(persisted?.optimizerAlgorithm ?? 'balanced');
    const [optimizerSeed, setOptimizerSeed] = useState<number | undefined>(
        persisted?.optimizerSeed
    );
    const [regionWeightingMode, setRegionWeightingMode] = useState<'uniform' | 'center' | 'edge'>(
        persisted?.regionWeightingMode ?? 'uniform'
    );

    const handleEnhancedColorMatchChange = useCallback((v: boolean) => {
        setEnhancedColorMatch(v);
        if (!v) {
            setPreserveSeparation(false);
            setHeightDithering(false);
        }
    }, []);

    const handlePreserveSeparationChange = useCallback((enabled: boolean) => {
        setPreserveSeparation(enabled);
        if (enabled) {
            setHeightDithering(false);
        }
    }, []);

    const handleHeightDitheringChange = useCallback((enabled: boolean) => {
        setHeightDithering(enabled);
        if (enabled) {
            setPreserveSeparation(false);
        }
    }, []);

    const flatPaintActive = paintMode === 'autopaint' && flatPaint;
    const effectiveSmoothMeshing = flatPaintActive ? false : smoothMeshing;

    const handleSmoothMeshingChange = useCallback((enabled: boolean) => {
        setSmoothMeshing(enabled);
        if (enabled) {
            setFlatPaint(false);
        }
    }, []);

    const handleFlatPaintChange = useCallback((enabled: boolean) => {
        setFlatPaint(enabled);
    }, []);

    // Sync non-build settings to parent so persisted stays current across mode switches
    useEffect(() => {
        onSettingsChange?.({
            paintMode,
            filaments,
            autoPaintMaxHeight,
            calibrationLayerHeight,
            enhancedColorMatch,
            preserveSeparation,
            separationMaxDeltaE,
            failOnSeparationError,
            maxRepeatedSwaps,
            transitionOpacity,
            heightDithering,
            ditherLineWidth,
            omitAtRiskPixels,
            flatPaint,
            flatPaintFaceUp,
            optimizerAlgorithm,
            optimizerSeed,
            regionWeightingMode,
            smoothMeshing,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        paintMode,
        filaments,
        autoPaintMaxHeight,
        calibrationLayerHeight,
        enhancedColorMatch,
        preserveSeparation,
        separationMaxDeltaE,
        failOnSeparationError,
        maxRepeatedSwaps,
        transitionOpacity,
        heightDithering,
        ditherLineWidth,
        omitAtRiskPixels,
        flatPaint,
        flatPaintFaceUp,
        optimizerAlgorithm,
        optimizerSeed,
        regionWeightingMode,
        smoothMeshing,
    ]);

    useEffect(() => {
        savePrintSettingsToStorage({
            layerHeight,
            slicerFirstLayerHeight,
            pixelSize,
            smoothMeshing,
        });
    }, [layerHeight, slicerFirstLayerHeight, pixelSize, smoothMeshing]);

    // --- Color Slicing ---
    const {
        filtered,
        colorSliceHeights,
        colorOrder,
        displayOrder,
        onRowChange,
        handleResetHeights,
        resetHeightsToValues,
        handleColorOrderChange,
        isResetState,
    } = useColorSlicing({
        swatches,
        layerHeight,
        slicerFirstLayerHeight,
        persisted,
    });

    const handleResetPrintSettings = useCallback(() => {
        setLayerHeight(DEFAULT_PRINT_SETTINGS.layerHeight);
        setSlicerFirstLayerHeight(DEFAULT_PRINT_SETTINGS.slicerFirstLayerHeight);
        setPixelSize(DEFAULT_PRINT_SETTINGS.pixelSize);
        resetHeightsToValues(
            DEFAULT_PRINT_SETTINGS.layerHeight,
            DEFAULT_PRINT_SETTINGS.slicerFirstLayerHeight
        );
    }, [resetHeightsToValues]);

    // --- Printable-feature simulation (shared by scoring, preview, and geometry) ---
    const {
        simulation: printableFeatureSimulation,
        printableSwatches,
        isComputing: isPrintableFeatureComputing,
        error: printableFeatureError,
    } = usePrintableFeatureSimulation({
        active,
        enabled: paintMode === 'autopaint' && filaments.length > 0 && filtered.length > 0,
        imageSrc,
        sourceSwatches: filtered,
        pixelSizeMm: pixelSize,
        lineWidthMm: ditherLineWidth,
        omitAtRiskPixels,
    });

    // --- Auto-paint (runs in Web Worker to avoid blocking the UI) ---
    const {
        autoPaintResult,
        isComputing: isOptimizerComputing,
        progress: optimizerProgress,
        error: optimizerError,
    } = useAutoPaintWorker({
        active,
        paintMode,
        filaments,
        filtered: printableFeatureSimulation ? printableSwatches : [],
        layerHeight,
        slicerFirstLayerHeight,
        autoPaintMaxHeight,
        enhancedColorMatch,
        preserveSeparation,
        separationMaxDeltaE,
        failOnSeparationError,
        maxRepeatedSwaps,
        transitionOpacity,
        optimizerAlgorithm,
        optimizerSeed,
        regionWeightingMode,
        appearance:
            profileManager.activeProfile && !profileManager.isDirty
                ? profileManager.activeProfile.appearance
                : undefined,
    });
    const isAutoPaintComputing = isPrintableFeatureComputing || isOptimizerComputing;
    const autoPaintProgress = isPrintableFeatureComputing ? 0 : optimizerProgress;
    const autoPaintError = printableFeatureError ?? optimizerError;
    const autoPaintProgressPercent = Math.round(Math.max(0, Math.min(1, autoPaintProgress)) * 100);

    const autoPaintSliceData = useMemo(() => {
        if (!autoPaintResult) return undefined;
        if (
            !autoPaintResultMatchesSliceGrid(autoPaintResult, layerHeight, slicerFirstLayerHeight)
        ) {
            return undefined;
        }
        return autoPaintToSliceHeights(autoPaintResult, layerHeight, slicerFirstLayerHeight);
    }, [autoPaintResult, layerHeight, slicerFirstLayerHeight]);

    const modelSizeEstimate = useMemo(() => {
        if (!imageDimensions) return null;
        if (paintMode === 'autopaint' && !autoPaintSliceData) return null;
        const widthPx = imageDimensions.opaqueWidth || imageDimensions.width;
        const heightPx = imageDimensions.opaqueHeight || imageDimensions.height;
        const estimateOrder =
            paintMode === 'autopaint' && autoPaintSliceData
                ? autoPaintSliceData.colorOrder
                : colorOrder;
        const estimateHeights =
            paintMode === 'autopaint' && autoPaintSliceData
                ? autoPaintSliceData.colorSliceHeights
                : colorSliceHeights;
        const activeFlatLayerCount = estimateOrder.filter(
            (swatchIndex) => (estimateHeights[swatchIndex] ?? 0) > 0
        ).length;
        const depth =
            flatPaintActive && paintMode === 'autopaint'
                ? flatPaintFaceUp
                    ? activeFlatLayerCount > 0
                        ? Math.max(slicerFirstLayerHeight, layerHeight) +
                          Math.max(0, activeFlatLayerCount - 1) * layerHeight
                        : 0
                    : Math.max(slicerFirstLayerHeight, layerHeight) +
                      activeFlatLayerCount * layerHeight
                : estimateOrder.reduce((total, swatchIndex, position) => {
                      const height = estimateHeights[swatchIndex] ?? 0;
                      return (
                          total +
                          (position === 0 ? Math.max(height, slicerFirstLayerHeight) : height)
                      );
                  }, 0);

        return {
            width: widthPx * pixelSize,
            height: heightPx * pixelSize,
            depth,
        };
    }, [
        autoPaintSliceData,
        colorOrder,
        colorSliceHeights,
        imageDimensions,
        flatPaintActive,
        flatPaintFaceUp,
        layerHeight,
        paintMode,
        pixelSize,
        slicerFirstLayerHeight,
    ]);

    const instructionPaintMode = builtState?.paintMode ?? paintMode;
    const instructionAutoPaintResult = builtState?.autoPaintResult ?? autoPaintResult;
    const instructionColorOrder = builtState?.colorOrder ?? colorOrder;
    const instructionColorSliceHeights = builtState?.colorSliceHeights ?? colorSliceHeights;
    const instructionFiltered = builtState?.filteredSwatches ?? filtered;
    const instructionLayerHeight = builtState?.layerHeight ?? layerHeight;
    const instructionSlicerFirstLayerHeight =
        builtState?.slicerFirstLayerHeight ?? slicerFirstLayerHeight;
    const instructionFlatPaint = builtState ? builtFlatPaint : flatPaintActive;
    const instructionFlatPaintFaceUp = builtState
        ? !!builtState.flatPaintFaceUp
        : flatPaintActive && flatPaintFaceUp;
    const instructionColorCount =
        instructionPaintMode === 'autopaint'
            ? (instructionAutoPaintResult?.layers.length ?? 0)
            : instructionColorOrder.length;
    const instructionAvailable =
        instructionPaintMode === 'manual' || instructionAutoPaintResult !== undefined;
    const isInstructionOverLimit = instructionColorCount > 64;

    // --- Swap Plan ---
    const { swapPlan, copied, copyToClipboard } = useSwapPlan({
        colorOrder: instructionColorOrder,
        colorSliceHeights: instructionColorSliceHeights,
        filtered: instructionFiltered,
        layerHeight: instructionLayerHeight,
        slicerFirstLayerHeight: instructionSlicerFirstLayerHeight,
        paintMode: instructionPaintMode,
        autoPaintResult: instructionAutoPaintResult,
        disabled: isInstructionOverLimit,
        flatPaint: instructionFlatPaint,
        flatPaintFaceUp: instructionFlatPaintFaceUp,
    });

    // --- Apply handler ---
    const handleApply = useCallback(() => {
        if (!onChange) return;

        if (paintMode === 'autopaint') {
            // Auto-paint is a hard mode boundary. A missing or rejected result
            // must never fall through to the unrelated manual color heights.
            if (
                isAutoPaintComputing ||
                autoPaintError ||
                !printableFeatureSimulation ||
                !autoPaintSliceData ||
                !autoPaintResult
            ) {
                return;
            }
            onChange({
                layerHeight,
                slicerFirstLayerHeight,
                colorSliceHeights: autoPaintSliceData.colorSliceHeights,
                colorOrder: autoPaintSliceData.colorOrder,
                filteredSwatches: autoPaintSliceData.virtualSwatches,
                pixelSize,
                filaments,
                paintMode,
                autoPaintMaxHeight,
                enhancedColorMatch,
                preserveSeparation,
                separationMaxDeltaE,
                failOnSeparationError,
                maxRepeatedSwaps,
                transitionOpacity,
                heightDithering,
                ditherLineWidth,
                omitAtRiskPixels,
                flatPaint,
                flatPaintFaceUp,
                optimizerAlgorithm,
                optimizerSeed,
                regionWeightingMode,
                autoPaintResult,
                autoPaintSwatches: autoPaintSliceData.virtualSwatches,
                autoPaintFilamentSwatches: autoPaintSliceData.filamentSwatches,
                printableFeaturePixels: concealPrintableFeatureBuffers({
                    width: printableFeatureSimulation.width,
                    height: printableFeatureSimulation.height,
                    data: printableFeatureSimulation.data,
                    fingerprint: printableFeatureSimulation.fingerprint,
                }),
                calibrationLayerHeight,
                smoothMeshing,
            });
            return;
        }

        onChange({
            layerHeight,
            slicerFirstLayerHeight,
            colorSliceHeights,
            colorOrder,
            filteredSwatches: filtered,
            pixelSize,
            filaments,
            paintMode,
            flatPaint,
            flatPaintFaceUp,
            optimizerAlgorithm,
            optimizerSeed,
            regionWeightingMode,
            calibrationLayerHeight,
            smoothMeshing,
        });
    }, [
        onChange,
        layerHeight,
        slicerFirstLayerHeight,
        colorSliceHeights,
        colorOrder,
        filtered,
        pixelSize,
        filaments,
        paintMode,
        autoPaintMaxHeight,
        enhancedColorMatch,
        preserveSeparation,
        separationMaxDeltaE,
        failOnSeparationError,
        maxRepeatedSwaps,
        transitionOpacity,
        heightDithering,
        ditherLineWidth,
        omitAtRiskPixels,
        flatPaint,
        flatPaintFaceUp,
        optimizerAlgorithm,
        optimizerSeed,
        regionWeightingMode,
        calibrationLayerHeight,
        smoothMeshing,
        autoPaintResult,
        autoPaintSliceData,
        printableFeatureSimulation,
        autoPaintError,
        isAutoPaintComputing,
    ]);

    const autoPaintBuildUnavailable =
        paintMode === 'autopaint' &&
        (!!autoPaintError ||
            !printableFeatureSimulation ||
            !autoPaintResult ||
            !autoPaintSliceData);

    return (
        <div className="space-y-4">
            {/* Apply button */}
            <div className="sticky -top-4 z-20 -mx-4 -mt-4 px-4 pt-4 pb-2 bg-card border-b border-border flex justify-end">
                <Button
                    onClick={handleApply}
                    data-testid="build-3d-model"
                    disabled={isAutoPaintComputing || autoPaintBuildUnavailable}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold transition-all duration-200 shadow-md hover:shadow-lg active:scale-95 gap-1.5 disabled:opacity-60"
                >
                    {isAutoPaintComputing ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Computing... {autoPaintProgressPercent}%</span>
                        </>
                    ) : autoPaintBuildUnavailable ? (
                        <span>
                            {autoPaintError ? 'Auto-paint failed' : 'Waiting for Auto-paint'}
                        </span>
                    ) : (
                        <>
                            <Check className="w-4 h-4" />
                            <span>Build 3D Model</span>
                        </>
                    )}
                </Button>
            </div>

            {/* Printing Parameters Card */}
            <PrintSettingsCard
                layerHeight={layerHeight}
                slicerFirstLayerHeight={slicerFirstLayerHeight}
                pixelSize={pixelSize}
                modelSizeEstimate={modelSizeEstimate}
                smoothMeshing={effectiveSmoothMeshing}
                onLayerHeightChange={setLayerHeight}
                onSlicerFirstLayerHeightChange={setSlicerFirstLayerHeight}
                onPixelSizeChange={setPixelSize}
                onSmoothMeshingChange={handleSmoothMeshingChange}
                onReset={handleResetPrintSettings}
                allDefault={
                    layerHeight === DEFAULT_PRINT_SETTINGS.layerHeight &&
                    slicerFirstLayerHeight === DEFAULT_PRINT_SETTINGS.slicerFirstLayerHeight &&
                    pixelSize === DEFAULT_PRINT_SETTINGS.pixelSize
                }
            />

            {/* Paint Mode Tabs */}
            <Tabs
                value={paintMode}
                onValueChange={(v) => setPaintMode(v as 'manual' | 'autopaint')}
            >
                <TabsList className="w-full">
                    <TabsTrigger value="manual" className="flex-1">
                        Manual
                    </TabsTrigger>
                    <TabsTrigger value="autopaint" className="flex-1">
                        Auto-paint
                    </TabsTrigger>
                </TabsList>

                {/* Auto-paint Tab */}
                <AutoPaintTab
                    filaments={filaments}
                    addFilament={addFilament}
                    addFilamentWithProps={addFilamentWithProps}
                    removeFilament={removeFilament}
                    updateFilament={updateFilament}
                    profiles={profileManager.profiles}
                    activeProfileId={profileManager.activeProfileId}
                    isDirty={profileManager.isDirty}
                    showSaveNewPopover={profileManager.showSaveNewPopover}
                    setShowSaveNewPopover={profileManager.setShowSaveNewPopover}
                    saveProfileName={profileManager.saveProfileName}
                    setSaveProfileName={profileManager.setSaveProfileName}
                    showRenamePopover={profileManager.showRenamePopover}
                    setShowRenamePopover={profileManager.setShowRenamePopover}
                    renameProfileName={profileManager.renameProfileName}
                    setRenameProfileName={profileManager.setRenameProfileName}
                    importFeedback={profileManager.importFeedback}
                    importInputRef={profileManager.importInputRef}
                    handleSaveNewProfile={profileManager.handleSaveNewProfile}
                    handleOverwriteProfile={profileManager.handleOverwriteProfile}
                    handleRenameProfile={profileManager.handleRenameProfile}
                    handleLoadProfile={profileManager.handleLoadProfile}
                    handleDeleteProfile={profileManager.handleDeleteProfile}
                    handleExportProfile={profileManager.handleExportProfile}
                    handleImportFile={profileManager.handleImportFile}
                    handleRegisterPaletteProof={profileManager.handleRegisterPaletteProof}
                    handleSetPaletteTargetResponse={profileManager.handleSetPaletteTargetResponse}
                    handleCompletePaletteProofEvaluation={
                        profileManager.handleCompletePaletteProofEvaluation
                    }
                    handleReopenPaletteProofEvaluation={
                        profileManager.handleReopenPaletteProofEvaluation
                    }
                    handleDeletePaletteProof={profileManager.handleDeletePaletteProof}
                    handleUpsertStackMatrixCalibration={
                        profileManager.handleUpsertStackMatrixCalibration
                    }
                    handleDeleteStackMatrixCalibration={
                        profileManager.handleDeleteStackMatrixCalibration
                    }
                    autoPaintMaxHeight={autoPaintMaxHeight}
                    setAutoPaintMaxHeight={setAutoPaintMaxHeight}
                    autoPaintResult={autoPaintResult}
                    autoPaintSliceData={autoPaintSliceData}
                    isComputing={isAutoPaintComputing}
                    progress={autoPaintProgress}
                    error={autoPaintError}
                    printableFeatureSimulation={printableFeatureSimulation}
                    printableFeatureIsComputing={isPrintableFeatureComputing}
                    calibrationLayerHeight={calibrationLayerHeight}
                    setCalibrationLayerHeight={setCalibrationLayerHeight}
                    firstLayerHeight={slicerFirstLayerHeight}
                    filteredCount={printableSwatches.length}
                    imageSwatches={printableSwatches}
                    paletteProofImageSrc={imageSrc}
                    enhancedColorMatch={enhancedColorMatch}
                    setEnhancedColorMatch={handleEnhancedColorMatchChange}
                    preserveSeparation={preserveSeparation}
                    setPreserveSeparation={handlePreserveSeparationChange}
                    separationMaxDeltaE={separationMaxDeltaE}
                    setSeparationMaxDeltaE={setSeparationMaxDeltaE}
                    failOnSeparationError={failOnSeparationError}
                    setFailOnSeparationError={setFailOnSeparationError}
                    maxRepeatedSwaps={maxRepeatedSwaps}
                    setMaxRepeatedSwaps={setMaxRepeatedSwaps}
                    transitionOpacity={transitionOpacity}
                    setTransitionOpacity={setTransitionOpacity}
                    heightDithering={heightDithering}
                    setHeightDithering={handleHeightDitheringChange}
                    ditherLineWidth={ditherLineWidth}
                    setDitherLineWidth={setDitherLineWidth}
                    omitAtRiskPixels={omitAtRiskPixels}
                    setOmitAtRiskPixels={setOmitAtRiskPixels}
                    flatPaint={flatPaint}
                    setFlatPaint={handleFlatPaintChange}
                    flatPaintFaceUp={flatPaintFaceUp}
                    setFlatPaintFaceUp={setFlatPaintFaceUp}
                    optimizerAlgorithm={optimizerAlgorithm}
                    setOptimizerAlgorithm={setOptimizerAlgorithm}
                    optimizerSeed={optimizerSeed}
                    setOptimizerSeed={setOptimizerSeed}
                    regionWeightingMode={regionWeightingMode}
                    setRegionWeightingMode={setRegionWeightingMode}
                />

                {/* Manual Tab */}
                <TabsContent value="manual" forceMount className="data-[state=inactive]:hidden">
                    <CollapsibleCard
                        id="color-slice-heights"
                        title="Color Slice Heights"
                        subtitle="Drag to reorder, adjust sliders to customize"
                        headingLevel={4}
                        collapsedSummary={
                            !isResetState ? (
                                <DirtyDot title="Color heights or order modified" />
                            ) : undefined
                        }
                        actions={
                            <>
                                <button
                                    type="button"
                                    onClick={handleResetHeights}
                                    disabled={isResetState}
                                    title="Reset all heights and sort by luminance"
                                    aria-label="Reset all heights and sorting"
                                    className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-600/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground select-none cursor-pointer"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                </button>
                                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                                    {filtered.length} colors
                                </span>
                            </>
                        }
                    >
                        <Sortable
                            value={displayOrder.map(String)}
                            onValueChange={handleColorOrderChange}
                            orientation="vertical"
                        >
                            <SortableContent asChild>
                                <div className="space-y-2">
                                    {displayOrder.length > 64 ? (
                                        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive-foreground">
                                            <p className="font-semibold mb-2">
                                                Too many colors ({displayOrder.length})
                                            </p>
                                            <p>
                                                The image has more than 64 unique colors. Please
                                                reduce the image to fewer colors in 2D mode using
                                                the quantization tools before switching to 3D mode.
                                            </p>
                                        </div>
                                    ) : (
                                        displayOrder.map((fi, idx) => {
                                            const s = filtered[fi];
                                            const val = colorSliceHeights[fi] ?? layerHeight;
                                            const isFirst = idx === 0;
                                            const minForRow = isFirst
                                                ? Math.max(layerHeight, slicerFirstLayerHeight)
                                                : layerHeight;
                                            return (
                                                <ThreeDColorRow
                                                    key={`${s.hex}-${fi}`}
                                                    fi={fi}
                                                    hex={s.hex}
                                                    value={val}
                                                    layerHeight={layerHeight}
                                                    minHeight={minForRow}
                                                    onChange={onRowChange}
                                                />
                                            );
                                        })
                                    )}
                                </div>
                            </SortableContent>
                            <SortableOverlay>
                                <div className="rounded-lg bg-primary/10 h-11" />
                            </SortableOverlay>
                        </Sortable>
                    </CollapsibleCard>
                </TabsContent>
            </Tabs>

            {/* Print Instructions */}
            {instructionAvailable ? (
                <PrintInstructions
                    swapPlan={swapPlan}
                    layerHeight={instructionLayerHeight}
                    slicerFirstLayerHeight={instructionSlicerFirstLayerHeight}
                    copied={copied}
                    onCopy={copyToClipboard}
                    tooManyColors={isInstructionOverLimit}
                    colorCount={instructionColorCount}
                    flatPaint={instructionFlatPaint}
                    flatPaintFaceUp={instructionFlatPaintFaceUp}
                />
            ) : (
                <CollapsibleCard
                    id="print-instructions"
                    title="Print Instructions"
                    subtitle="No valid Auto-paint model"
                    headingLevel={4}
                    className="mt-6"
                >
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                        Auto-paint did not produce a valid stack. Resolve the error above before
                        building or generating print instructions.
                    </div>
                </CollapsibleCard>
            )}
        </div>
    );
}
