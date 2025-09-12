import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import logo from "./assets/logo.png";
import CanvasPreview from "./components/CanvasPreview";
import type { CanvasPreviewHandle } from "./components/CanvasPreview";
import { PaletteSelector } from "./components/PaletteSelector";
import { ControlsPanel } from "./components/ControlsPanel";
import { SwatchesPanel } from "./components/SwatchesPanel";
import { useSwatches } from "./hooks/useSwatches";
import type { SwatchEntry } from "./hooks/useSwatches";
import { useImageHistory } from "./hooks/useImageHistory";
import { useQuantize } from "./hooks/useQuantize";
// ...existing imports

function App(): React.ReactElement | null {
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    // `weight` is the algorithm parameter; `finalColors` is the postprocess target
    const [weight, setWeight] = useState<number>(128);
    const [finalColors, setFinalColors] = useState<number>(16);
    const [algorithm, setAlgorithm] = useState<string>("kmeans");
    const SWATCH_CAP = 2 ** 14;
    // default to the Auto palette
    const [selectedPalette, setSelectedPalette] = useState<string>("auto");
    const { imageSrc, setImage, clearCurrent, undo, redo, canUndo, canRedo } =
        useImageHistory(logo, undefined);
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
        onImmediateSwatches: (colors: SwatchEntry[]) =>
            immediateOverride(colors),
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
                        {/* file input stays here (hidden); uploader buttons moved to preview actions */}
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
                            onSwatchDelete={async (deleted) => {
                                // Build override palette from current swatches excluding the deleted one
                                const remaining = swatches.filter(
                                    (s) =>
                                        !(
                                            s.hex === deleted.hex &&
                                            s.a === deleted.a
                                        )
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
                                        "applyQuantize failed for swatch delete",
                                        err
                                    );
                                }
                            }}
                            onSwatchApply={async (original, newHex) => {
                                // Perform literal pixel replacement on the full-size image
                                if (!canvasPreviewRef.current || !imageSrc)
                                    return;
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
                                                i.src =
                                                    URL.createObjectURL(blob);
                                            }
                                        );
                                    if (!img) return;
                                    const w = img.naturalWidth;
                                    const h = img.naturalHeight;
                                    const c = document.createElement("canvas");
                                    c.width = w;
                                    c.height = h;
                                    const ctx = c.getContext("2d");
                                    if (!ctx) return;
                                    ctx.drawImage(img, 0, 0, w, h);
                                    const data = ctx.getImageData(0, 0, w, h);
                                    const dd = data.data;
                                    const parseHex = (s: string) => {
                                        const raw = s.replace(/^#/, "");
                                        return [
                                            parseInt(raw.slice(0, 2), 16) || 0,
                                            parseInt(raw.slice(2, 4), 16) || 0,
                                            parseInt(raw.slice(4, 6), 16) || 0,
                                        ];
                                    };
                                    const [r1, g1, b1] = parseHex(original.hex);
                                    const [r2, g2, b2] = parseHex(newHex);
                                    if (original.a === 0) {
                                        // Replace fully transparent pixels: give them the new color (opaque)
                                        for (let i = 0; i < dd.length; i += 4) {
                                            if (dd[i + 3] === 0) {
                                                dd[i] = r2;
                                                dd[i + 1] = g2;
                                                dd[i + 2] = b2;
                                                dd[i + 3] = 255;
                                            }
                                        }
                                    } else {
                                        // Replace pixels that match the original RGB exactly (ignore fully transparent pixels)
                                        for (let i = 0; i < dd.length; i += 4) {
                                            const a = dd[i + 3];
                                            if (a === 0) continue;
                                            if (
                                                dd[i] === r1 &&
                                                dd[i + 1] === g1 &&
                                                dd[i + 2] === b1
                                            ) {
                                                dd[i] = r2;
                                                dd[i + 1] = g2;
                                                dd[i + 2] = b2;
                                            }
                                        }
                                    }
                                    ctx.putImageData(data, 0, 0);
                                    const outBlob =
                                        await new Promise<Blob | null>((res) =>
                                            c.toBlob((b) => res(b), "image/png")
                                        );
                                    if (!outBlob) return;
                                    const url = URL.createObjectURL(outBlob);
                                    invalidate();
                                    setImage(url, true);
                                } catch (err) {
                                    console.warn("literal replace failed", err);
                                }
                            }}
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
                            {/* Download full image button (same style as crop) */}
                            <button
                                className="preview-crop-btn"
                                title="Download image"
                                aria-label="Download image"
                                disabled={!imageSrc}
                                onClick={async () => {
                                    if (!canvasPreviewRef.current) return;
                                    const blob =
                                        await canvasPreviewRef.current.exportImageBlob();
                                    if (!blob) {
                                        alert("No image available to download");
                                        return;
                                    }
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = "image.png";
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                    URL.revokeObjectURL(url);
                                }}
                            >
                                <i
                                    className="fa-solid fa-download"
                                    aria-hidden="true"
                                />
                            </button>
                            {/* moved uploader buttons into the top-right preview actions */}
                            <button
                                className="preview-crop-btn"
                                title="Choose file"
                                aria-label="Choose file"
                                onClick={() => inputRef.current?.click()}
                            >
                                <i
                                    className="fa-solid fa-file-upload"
                                    aria-hidden="true"
                                />
                            </button>
                            <button
                                className="preview-crop-btn"
                                title="Remove image"
                                aria-label="Remove image"
                                onClick={clear}
                                disabled={!imageSrc || isCropMode}
                            >
                                <i
                                    className="fa-solid fa-trash"
                                    aria-hidden="true"
                                />
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}

export default App;
