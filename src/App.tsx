import React, { useEffect, useRef, useState, useCallback } from 'react';
import type * as THREE from 'three';
import ThreeDControls from './components/ThreeDControls';
import ThreeDView from './components/ThreeDView';
import './App.css';
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
import { useHorizontalSplit } from './hooks/useHorizontalSplit';
import { useDropzone } from './hooks/useDropzone';
import { exportMeshToStlBlob } from './lib/exportStl';
// ...existing imports

function App(): React.ReactElement | null {
    // dropzone state managed by hook below
    // `weight` is the algorithm parameter; `finalColors` is the postprocess target
    const [weight, setWeight] = useState<number>(128);
    const [finalColors, setFinalColors] = useState<number>(16);
    const [algorithm, setAlgorithm] = useState<string>('kmeans');
    const SWATCH_CAP = 2 ** 14;
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
    const { layoutRef, onSplitterDown } = useHorizontalSplit(() => {
        try {
            canvasPreviewRef.current?.redraw();
        } catch {
            /* noop */
        }
    });
    const dropzone = useDropzone({ enabled: mode === '2d', onFile: handleFiles });
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
        <div className="uploader-root">
            <Header
                onLoadTest={() => {
                    invalidate();
                    setImage(tdTestImg, true);
                }}
            />
            <div className="app-layout" ref={layoutRef}>
                <aside className="sidebar">
                    <ModeTabs mode={mode} onChange={setMode} />
                    <div className="controls-panel">
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
                                <div className="controls-scroll">
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
                                        onSwatchDelete={async (deleted) => {
                                            // Build override palette from current swatches excluding the deleted one
                                            const remaining = swatches.filter(
                                                (s) => !(s.hex === deleted.hex && s.a === deleted.a)
                                            );
                                            const palette = remaining
                                                .filter((s) => s.a !== 0)
                                                .map((s) => s.hex);
                                            // target is number of image colors - 1 (clamped to at least 2)
                                            const target = Math.max(2, palette.length);
                                            // applyQuantize with override palette and override final colors
                                            try {
                                                await applyQuantize(canvasPreviewRef, {
                                                    overridePalette: palette,
                                                    overrideFinalColors: target,
                                                });
                                            } catch (err) {
                                                console.warn(
                                                    'applyQuantize failed for swatch delete',
                                                    err
                                                );
                                            }
                                        }}
                                        onSwatchApply={async (original, newHex) => {
                                            // Perform literal pixel replacement on the full-size image
                                            if (!canvasPreviewRef.current || !imageSrc) return;
                                            try {
                                                const blob =
                                                    await canvasPreviewRef.current.exportImageBlob();
                                                if (!blob) return;
                                                const img =
                                                    await new Promise<HTMLImageElement | null>(
                                                        (res) => {
                                                            const i = new Image();
                                                            i.onload = () => res(i);
                                                            i.onerror = () => res(null);
                                                            i.src = URL.createObjectURL(blob);
                                                        }
                                                    );
                                                if (!img) return;
                                                const w = img.naturalWidth;
                                                const h = img.naturalHeight;
                                                const c = document.createElement('canvas');
                                                c.width = w;
                                                c.height = h;
                                                const ctx = c.getContext('2d');
                                                if (!ctx) return;
                                                ctx.drawImage(img, 0, 0, w, h);
                                                const data = ctx.getImageData(0, 0, w, h);
                                                const dd = data.data;
                                                const parseHex = (s: string) => {
                                                    const raw = s.replace(/^#/, '');
                                                    const r = Number.parseInt(raw.slice(0, 2), 16);
                                                    const g = Number.parseInt(raw.slice(2, 4), 16);
                                                    const b = Number.parseInt(raw.slice(4, 6), 16);
                                                    const a =
                                                        raw.length >= 8
                                                            ? Number.parseInt(raw.slice(6, 8), 16)
                                                            : 255;
                                                    return [
                                                        Number.isNaN(r) ? 0 : r,
                                                        Number.isNaN(g) ? 0 : g,
                                                        Number.isNaN(b) ? 0 : b,
                                                        Number.isNaN(a) ? 255 : a,
                                                    ] as [number, number, number, number];
                                                };
                                                const [r1, g1, b1] = parseHex(original.hex);
                                                const [r2, g2, b2, newA] = parseHex(newHex);
                                                // Apply the new alpha when replacing pixels. If newHex had no alpha, newA === 255.
                                                if (original.a === 0) {
                                                    // Replace fully transparent pixels.
                                                    for (let i = 0; i < dd.length; i += 4) {
                                                        if (dd[i + 3] === 0) {
                                                            if (newA === 0) {
                                                                // canonical transparent representation: black + alpha 0
                                                                dd[i] = 0;
                                                                dd[i + 1] = 0;
                                                                dd[i + 2] = 0;
                                                                dd[i + 3] = 0;
                                                            } else {
                                                                dd[i] = r2;
                                                                dd[i + 1] = g2;
                                                                dd[i + 2] = b2;
                                                                dd[i + 3] = newA;
                                                            }
                                                        }
                                                    }
                                                } else {
                                                    // Replace pixels that match the original RGB and original alpha exactly
                                                    const origA = original.a;
                                                    for (let i = 0; i < dd.length; i += 4) {
                                                        if (dd[i + 3] !== origA) continue;
                                                        if (
                                                            dd[i] === r1 &&
                                                            dd[i + 1] === g1 &&
                                                            dd[i + 2] === b1
                                                        ) {
                                                            if (newA === 0) {
                                                                // set canonical transparent black
                                                                dd[i] = 0;
                                                                dd[i + 1] = 0;
                                                                dd[i + 2] = 0;
                                                                dd[i + 3] = 0;
                                                            } else {
                                                                dd[i] = r2;
                                                                dd[i + 1] = g2;
                                                                dd[i + 2] = b2;
                                                                dd[i + 3] = newA;
                                                            }
                                                        }
                                                    }
                                                }
                                                ctx.putImageData(data, 0, 0);
                                                const outBlob = await new Promise<Blob | null>(
                                                    (res) => c.toBlob((b) => res(b), 'image/png')
                                                );
                                                if (!outBlob) return;
                                                const url = URL.createObjectURL(outBlob);
                                                invalidate();
                                                setImage(url, true);
                                            } catch (err) {
                                                console.warn('literal replace failed', err);
                                            }
                                        }}
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
                <div
                    className="splitter"
                    onMouseDown={onSplitterDown}
                    role="separator"
                    aria-orientation="vertical"
                />
                <main className="preview-area">
                    <div
                        className={`dropzone ${dropzone.dragOver ? 'dragover' : ''}`}
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
                                const blob = await canvasPreviewRef.current.exportCroppedImage();
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
                            onExportImage={async () => {
                                if (!canvasPreviewRef.current) return;
                                const blob = await canvasPreviewRef.current.exportImageBlob();
                                if (!blob) {
                                    alert('No image available to download');
                                    return;
                                }
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'image.png';
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                                URL.revokeObjectURL(url);
                            }}
                            onExportStl={async () => {
                                if (exportingSTL) return;
                                interface StrataWindow extends Window {
                                    __STRATA_LAST_MESH?: THREE.Mesh;
                                }
                                const threeMesh = (window as StrataWindow).__STRATA_LAST_MESH;
                                if (!threeMesh) {
                                    alert('3D mesh not ready yet');
                                    return;
                                }
                                setExportingSTL(true);
                                setExportProgress(0);
                                try {
                                    const blob = await exportMeshToStlBlob(threeMesh, (p) =>
                                        setExportProgress(p)
                                    );
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = 'model.stl';
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                    URL.revokeObjectURL(url);
                                } catch (err) {
                                    console.warn('STL export failed', err);
                                    alert('STL export failed. See console for details.');
                                } finally {
                                    setExportingSTL(false);
                                    setTimeout(() => setExportProgress(0), 300);
                                }
                            }}
                        />
                    </div>
                </main>
            </div>
        </div>
    );
}

export default App;
