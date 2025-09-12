import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import benchy from "./assets/benchy.png";
import CanvasPreview from "./components/CanvasPreview";
import type { CanvasPreviewHandle } from "./components/CanvasPreview";
import UploaderControls from "./components/UploaderControls";
import { PaletteSelector } from "./components/PaletteSelector";
import { ControlsPanel } from "./components/ControlsPanel";
import { SwatchesPanel } from "./components/SwatchesPanel";
import { useSwatches } from "./hooks/useSwatches";
import { useImageHistory } from "./hooks/useImageHistory";
import { useQuantize } from "./hooks/useQuantize";
import { PALETTES } from "./data/palettes";

function App(): React.ReactElement | null {
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    // `weight` is the algorithm parameter; `finalColors` is the postprocess target
    const [weight, setWeight] = useState<number>(128);
    const [finalColors, setFinalColors] = useState<number>(4);
    const [algorithm, setAlgorithm] = useState<string>("kmeans");
    const SWATCH_CAP = 2 ** 14;
    const [selectedPalette, setSelectedPalette] = useState<string>(() => {
        const matched = PALETTES.find(
            (p) => p.id !== "auto" && p.size === finalColors
        );
        return matched ? matched.id : "auto";
    });
    const { imageSrc, setImage, clearCurrent, undo, redo, canUndo, canRedo } =
        useImageHistory(benchy, undefined);
    const { swatches, swatchesLoading, invalidate, immediateOverride } =
        useSwatches(imageSrc);
    // initial selectedPalette derived from initial weight above
    const canvasPreviewRef = useRef<CanvasPreviewHandle | null>(null);
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
        onImmediateSwatches: immediateOverride,
    });

    // removed duplicate syncing: manual changes to the numeric input should set Auto via onWeightChange
    // redraw when image changes
    useEffect(() => {
        canvasPreviewRef.current?.redraw();
    }, [imageSrc]);

    const handleFiles = (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            alert("Please upload an image file");
            return;
        }
        const url = URL.createObjectURL(file);
        invalidate();
        setImage(url, true);
    };

    // removed unused handlers (inline handlers used instead)

    const clear = () => {
        clearCurrent();
        if (inputRef.current) inputRef.current.value = "";
    };

    // splitter & layout management preserved below

    // wheel/pan handled in CanvasPreview
    // startPan handled in CanvasPreview
    // resize observer handled by CanvasPreview; keep for layout redraw hook
    // Layout splitter state
    const layoutRef = useRef<HTMLDivElement | null>(null);
    const [leftWidth, setLeftWidth] = useState<number>(0);
    const draggingRef = useRef(false);
    const startXRef = useRef(0);
    const startLeftRef = useRef(0);

    // initialize leftWidth once on mount
    useEffect(() => {
        const el = layoutRef.current;
        if (el) setLeftWidth(Math.floor(el.clientWidth / 4));
    }, []);

    // apply leftWidth to CSS variable on the layout element so grid is CSS-driven
    useEffect(() => {
        const el = layoutRef.current;
        if (el) el.style.setProperty("--left-width", `${leftWidth}px`);
    }, [leftWidth]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!draggingRef.current) return;
            const delta = e.clientX - startXRef.current;
            const newLeft = startLeftRef.current + delta;
            const el = layoutRef.current;
            if (!el) return;
            const min = Math.floor(el.clientWidth * 0.25);
            const max = el.clientWidth - min;
            const clamped = Math.max(min, Math.min(max, newLeft));
            setLeftWidth(clamped);
            requestAnimationFrame(() => {
                try {
                    canvasPreviewRef.current?.redraw();
                } catch {
                    /* ignore rapid drag redraw error */
                }
            });
        };
        const onUp = () => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, []);

    // redraw when leftWidth changes (splitter moved)
    useEffect(() => {
        canvasPreviewRef.current?.redraw();
    }, [leftWidth]);

    // observe layout changes (in case grid resizing affects preview size)
    useEffect(() => {
        const el = layoutRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            const min = Math.floor(el.clientWidth * 0.25);
            const max = el.clientWidth - min;
            setLeftWidth((lw) => {
                if (lw < min) return min;
                if (lw > max) return max;
                return lw;
            });
            canvasPreviewRef.current?.redraw();
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const onSplitterDown = (e: React.MouseEvent<HTMLDivElement>) => {
        draggingRef.current = true;
        startXRef.current = e.clientX;
        startLeftRef.current =
            leftWidth ||
            (layoutRef.current
                ? Math.floor(layoutRef.current.clientWidth / 2)
                : 300);
    };
    return (
        <div className="uploader-root">
            <div className="app-layout" ref={layoutRef}>
                <aside className="sidebar">
                    <div className="controls-panel">
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                                if (e.target.files && e.target.files[0])
                                    handleFiles(e.target.files[0]);
                            }}
                            style={{ display: "none" }}
                        />
                        <div className="controls-group controls-group--center">
                            <UploaderControls
                                onChoose={() => inputRef.current?.click()}
                                onRemove={clear}
                                canRemove={!!imageSrc && !isCropMode}
                            />
                        </div>
                        <PaletteSelector
                            selected={selectedPalette}
                            onSelect={(id, size) => {
                                setSelectedPalette(id);
                                // set the postprocess target to the palette size, but do not lock it
                                if (id !== "auto") setFinalColors(size);
                            }}
                        />
                        <ControlsPanel
                            // finalColors controls postprocessing result count
                            finalColors={finalColors}
                            onFinalColorsChange={(n) => {
                                setFinalColors(n);
                                // changing the final colors should switch to auto palette
                                setSelectedPalette("auto");
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
                            weightDisabled={algorithm === "none"}
                        />
                        <SwatchesPanel
                            swatches={swatches}
                            loading={swatchesLoading}
                            cap={SWATCH_CAP}
                        />
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
                        className={`dropzone ${dragOver ? "dragover" : ""}`}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            const file =
                                e.dataTransfer.files && e.dataTransfer.files[0];
                            if (file) handleFiles(file);
                        }}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                    >
                        <CanvasPreview
                            ref={canvasPreviewRef}
                            imageSrc={imageSrc}
                            isCropMode={isCropMode}
                        />
                        <div className="preview-actions">
                            <button
                                className="preview-action-btn"
                                title="Undo"
                                aria-label="Undo"
                                disabled={isCropMode || !canUndo}
                                onClick={() => undo()}
                            >
                                <i
                                    className="fa-solid fa-rotate-left"
                                    aria-hidden
                                />
                            </button>
                            <button
                                className="preview-action-btn"
                                title="Redo"
                                aria-label="Redo"
                                disabled={isCropMode || !canRedo}
                                onClick={() => redo()}
                            >
                                <i
                                    className="fa-solid fa-rotate-right"
                                    aria-hidden
                                />
                            </button>
                            {!isCropMode ? (
                                <button
                                    className="preview-crop-btn"
                                    title="Crop"
                                    aria-label="Crop"
                                    disabled={!imageSrc}
                                    onClick={() => {
                                        if (imageSrc) setIsCropMode(true);
                                    }}
                                >
                                    <i
                                        className="fa-solid fa-crop"
                                        aria-hidden="true"
                                    ></i>
                                </button>
                            ) : (
                                <>
                                    <button
                                        className="preview-crop-btn preview-crop-btn--save"
                                        title="Save crop"
                                        aria-label="Save crop"
                                        onClick={async () => {
                                            if (!canvasPreviewRef.current)
                                                return;
                                            const blob =
                                                await canvasPreviewRef.current.exportCroppedImage();
                                            if (!blob) return;
                                            const url =
                                                URL.createObjectURL(blob);
                                            invalidate();
                                            setImage(url, true);
                                            setIsCropMode(false);
                                        }}
                                    >
                                        <i
                                            className="fa-solid fa-floppy-disk"
                                            aria-hidden="true"
                                        ></i>
                                    </button>
                                    <button
                                        className="preview-crop-btn preview-crop-btn--cancel"
                                        title="Cancel crop"
                                        aria-label="Cancel crop"
                                        onClick={() => setIsCropMode(false)}
                                    >
                                        <i
                                            className="fa-solid fa-xmark"
                                            aria-hidden="true"
                                        ></i>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}

export default App;
