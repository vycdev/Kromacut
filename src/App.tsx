import React, { useEffect, useRef, useState, useCallback } from 'react';
import ThreeDControls from './components/ThreeDControls';
import ThreeDView from './components/ThreeDView';
import logo from './assets/logo.png';
import tdTestImg from './assets/tdTest.png';
import CanvasPreview from './components/CanvasPreview';
import type { CanvasPreviewHandle } from './components/CanvasPreview';
import { PaletteSelector } from './components/PaletteSelector';
import { ControlsPanel } from './components/ControlsPanel';
import { SwatchesPanel } from './components/SwatchesPanel';
import AdjustmentsPanel from './components/AdjustmentsPanel';
import DeditherPanel from './components/DeditherPanel';
import { ADJUSTMENT_DEFAULTS } from './lib/applyAdjustments';
import SLIDER_DEFS from './components/sliderDefs';
import { useSwatches } from './hooks/useSwatches';
import type { SwatchEntry } from './hooks/useSwatches';
import { useImageHistory } from './hooks/useImageHistory';
import { useQuantize } from './hooks/useQuantize';
import Header from './components/Header';
import ModeTabs from './components/ModeTabs';
import PreviewActions from './components/PreviewActions';
import { useDropzone } from './hooks/useDropzone';
import { exportMeshToStlBlob } from './lib/exportStl';
import { useAppHandlers } from './hooks/useAppHandlers';
import ResizableSplitter from './components/ResizableSplitter';
// ...existing imports

function App(): React.ReactElement | null {
    // dropzone state managed by hook below
    // `weight` is the algorithm parameter; `finalColors` is the postprocess target
    const [weight, setWeight] = useState<number>(128);
    const [finalColors, setFinalColors] = useState<number>(16);
    const [algorithm, setAlgorithm] = useState<string>('kmeans');
    const SWATCH_CAP = 2 ** 10;
    // default to the Auto palette
    const [selectedPalette, setSelectedPalette] = useState<string>('auto');
    const { imageSrc, setImage, clearCurrent, undo, redo, canUndo, canRedo } = useImageHistory(
        logo,
        undefined
    );
    const { swatches, swatchesLoading, invalidate, immediateOverride } = useSwatches(imageSrc);
    // adjustments managed locally inside AdjustmentsPanel now
    // initial selectedPalette derived from initial weight above
    const inputRef = useRef<HTMLInputElement | null>(null);
    const canvasPreviewRef = useRef<CanvasPreviewHandle | null>(null);
    const [showCheckerboard, setShowCheckerboard] = useState<boolean>(true);
    const [isCropMode, setIsCropMode] = useState(false);
    const { applyQuantize } = useQuantize({
        algorithm,
        weight,
        finalColors,
        selectedPalette,
        imageSrc,
        setImage: (u, push = true) => {
            invalidate();
            setImage(u, push);
        },
        onImmediateSwatches: (colors: SwatchEntry[]) => immediateOverride(colors),
    });

    // persistent (committed) adjustments applied on redraw. Key/value map.
    const [adjustments, setAdjustments] = useState<Record<string, number>>(ADJUSTMENT_DEFAULTS);
    // epoch counter to force remount of AdjustmentsPanel when we bake & reset
    const [adjustmentsEpoch, setAdjustmentsEpoch] = useState(0);
    // UI mode toggles (2D / 3D) - UI only for now
    const [mode, setMode] = useState<'2d' | '3d'>('2d');
    const [exportingSTL, setExportingSTL] = useState(false);
    const [exportProgress, setExportProgress] = useState(0); // 0..1
    // 3D printing shared state
    const [threeDState, setThreeDState] = useState<{
        layerHeight: number;
        baseSliceHeight: number;
        colorSliceHeights: number[];
        colorOrder: number[];
        filteredSwatches: { hex: string; a: number }[];
        pixelSize: number;
    }>({
        layerHeight: 0.12,
        baseSliceHeight: 0.2,
        colorSliceHeights: [],
        colorOrder: [],
        filteredSwatches: [],
        pixelSize: 0.1,
    });
    // Signal to force a rebuild of the 3D view when incremented
    const [threeDBuildSignal, setThreeDBuildSignal] = useState(0);
    const prevModeRef = useRef<typeof mode>(mode);

    // When the user switches to 3D mode, trigger the rebuild signal (same effect as the Rebuild button).
    // Schedule the rebuild on a short timeout so that the ThreeDControls have a chance to mount
    // and emit their initial state (filteredSwatches / color heights) before ThreeDView starts building.
    useEffect(() => {
        let t: number | undefined;
        if (prevModeRef.current !== mode && mode === '3d') {
            t = window.setTimeout(() => setThreeDBuildSignal((s) => s + 1), 50);
        }
        prevModeRef.current = mode;
        return () => {
            if (t) clearTimeout(t);
        };
    }, [mode]);

    // removed duplicate syncing: manual changes to the numeric input should set Auto via onWeightChange
    // redraw when image changes
    useEffect(() => {
        canvasPreviewRef.current?.redraw();
    }, [imageSrc]);

    const handleFiles = (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file');
            return;
        }
        const url = URL.createObjectURL(file);
        invalidate();
        setImage(url, true);
    };

    // removed unused handlers (inline handlers used instead)

    const clear = () => {
        clearCurrent();
        if (inputRef.current) inputRef.current.value = '';
    };

    // splitter & layout management preserved below

    // wheel/pan handled in CanvasPreview
    // startPan handled in CanvasPreview
    // resize observer handled by CanvasPreview; keep for layout redraw hook
    // Layout splitter state
    const layoutRef = useRef<HTMLDivElement | null>(null);

    const dropzone = useDropzone({ enabled: mode === '2d', onFile: handleFiles });
    const { onExportImage, onExportStl, onSwatchApply, onSwatchDelete } = useAppHandlers({
        canvasPreviewRef,
        imageSrc,
        invalidate,
        setImage,
        setExportingSTL,
        setExportProgress,
        exportingSTL,
        exportMeshToStlBlob,
        applyQuantize,
        swatches,
    });
    // Stable handler to avoid recreating function each render and to prevent redundant state sets
    const handleThreeDStateChange = useCallback(
        (s: {
            layerHeight: number;
            baseSliceHeight: number;
            colorSliceHeights: number[];
            colorOrder: number[];
            filteredSwatches: { hex: string; a: number }[];
            pixelSize: number;
        }) => {
            setThreeDState((prev) => {
                if (
                    prev.layerHeight === s.layerHeight &&
                    prev.baseSliceHeight === s.baseSliceHeight &&
                    prev.colorSliceHeights === s.colorSliceHeights &&
                    prev.colorOrder === s.colorOrder &&
                    prev.filteredSwatches === s.filteredSwatches &&
                    prev.pixelSize === s.pixelSize
                ) {
                    return prev; // no change; avoid triggering rerender cascade
                }
                return s;
            });
        },
        []
    );

    return (
        <div className="p-4 box-border text-inherit font-sans flex flex-col flex-1 min-w-0 max-w-full min-h-0 h-screen w-full">
            <Header
                onLoadTest={() => {
                    invalidate();
                    setImage(tdTestImg, true);
                }}
            />
            <div className="flex flex-1 min-h-0 w-full" ref={layoutRef}>
                <ResizableSplitter defaultSize={30} minSize={20} maxSize={50}>
                    <aside className="w-full bg-card border-r border-border flex flex-col">
                        <ModeTabs mode={mode} onChange={setMode} />
                        <div className="flex-1 overflow-y-auto p-4">
                            {mode === '2d' ? (
                                <>
                                    <input
                                        ref={inputRef}
                                        type="file"
                                        accept="image/*"
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
                                                setAdjustments(vals);
                                                // schedule a redraw
                                                requestAnimationFrame(() =>
                                                    canvasPreviewRef.current?.redraw()
                                                );
                                            }}
                                            onBake={async () => {
                                                if (!canvasPreviewRef.current) return;
                                                try {
                                                    const blob =
                                                        await canvasPreviewRef.current.exportAdjustedImageBlob?.();
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
                                        <DeditherPanel
                                            canvasRef={canvasPreviewRef}
                                            onApplyResult={(url) => {
                                                invalidate();
                                                setImage(url, true);
                                            }}
                                        />
                                        <PaletteSelector
                                            selected={selectedPalette}
                                            onSelect={(id, size) => {
                                                setSelectedPalette(id);
                                                // set the postprocess target to the palette size, but do not lock it
                                                if (id !== 'auto') setFinalColors(size);
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
                                            disabled={!imageSrc || isCropMode}
                                            weightDisabled={algorithm === 'none'}
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
                                    onChange={handleThreeDStateChange}
                                    persisted={threeDState}
                                />
                            )}
                        </div>
                    </aside>
                    <main className="h-full w-full bg-background flex flex-col min-h-0">
                        <div
                            className={`flex-1 relative min-h-0 w-full ${dropzone.dragOver ? 'bg-blue-900/20' : ''}`}
                            onDrop={dropzone.onDrop}
                            onDragOver={dropzone.onDragOver}
                            onDragLeave={dropzone.onDragLeave}
                        >
                            {mode === '2d' ? (
                                <CanvasPreview
                                    ref={canvasPreviewRef}
                                    imageSrc={imageSrc}
                                    isCropMode={isCropMode}
                                    showCheckerboard={showCheckerboard}
                                    adjustments={adjustments}
                                />
                            ) : (
                                <ThreeDView
                                    imageSrc={imageSrc}
                                    baseSliceHeight={threeDState.baseSliceHeight}
                                    layerHeight={threeDState.layerHeight}
                                    colorSliceHeights={threeDState.colorSliceHeights}
                                    colorOrder={threeDState.colorOrder}
                                    swatches={threeDState.filteredSwatches}
                                    pixelSize={threeDState.pixelSize}
                                    rebuildSignal={threeDBuildSignal}
                                />
                            )}
                            <PreviewActions
                                mode={mode}
                                canUndo={canUndo}
                                canRedo={canRedo}
                                isCropMode={isCropMode}
                                imageAvailable={!!imageSrc}
                                exportingSTL={exportingSTL}
                                exportProgress={exportProgress}
                                onUndo={undo}
                                onRedo={redo}
                                onEnterCrop={() => imageSrc && setIsCropMode(true)}
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
                            />
                        </div>
                    </main>
                </ResizableSplitter>
            </div>
        </div>
    );
}

export default App;
