import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import CanvasPreview from "./components/CanvasPreview";
import type { CanvasPreviewHandle } from "./components/CanvasPreview";
import UploaderControls from "./components/UploaderControls";
import {
    posterizeImageData,
    medianCutImageData,
    kmeansImageData,
} from "./lib/algorithms";

function App(): React.ReactElement | null {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [past, setPast] = useState<string[]>([]);
    const [future, setFuture] = useState<string[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [colorCount, setColorCount] = useState<number>(4);
    const [algorithm, setAlgorithm] = useState<string>("posterize");

    // keep refs to avoid listing state in effect deps for cleanup
    const imageRef = useRef<string | null>(null);
    const pastRef = useRef<string[]>([]);
    const futureRef = useRef<string[]>([]);
    useEffect(() => {
        imageRef.current = imageSrc;
    }, [imageSrc]);
    useEffect(() => {
        pastRef.current = past;
    }, [past]);
    useEffect(() => {
        futureRef.current = future;
    }, [future]);

    useEffect(() => {
        return () => {
            const revokeIf = (u: string | null) => {
                if (u && u.startsWith("blob:")) {
                    try {
                        URL.revokeObjectURL(u);
                    } catch (err) {
                        console.warn(
                            "Failed to revoke object URL on cleanup",
                            err
                        );
                    }
                }
            };
            revokeIf(imageRef.current);
            pastRef.current.forEach(revokeIf);
            futureRef.current.forEach(revokeIf);
        };
    }, []);

    const handleFiles = (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            // lightweight validation
            // keep this minimal for now
            alert("Please upload an image file");
            return;
        }
        const url = URL.createObjectURL(file);
        setPast((p) => (imageSrc ? [...p, imageSrc as string] : p));
        setImageSrc(url);
        setFuture([]);
    };

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) handleFiles(e.target.files[0]);
    };

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) handleFiles(file);
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(true);
    };

    const clear = () => {
        if (imageSrc) {
            // only revoke if it's not referenced in history
            if (!past.includes(imageSrc) && !future.includes(imageSrc)) {
                try {
                    URL.revokeObjectURL(imageSrc);
                } catch (err) {
                    console.warn("Failed to revoke object URL on clear", err);
                }
            }
            setImageSrc(null);
        }
        if (inputRef.current) inputRef.current.value = "";
    };
    const [isCropMode, setIsCropMode] = useState(false);
    const canvasPreviewRef = useRef<CanvasPreviewHandle | null>(null);

    // draw delegated to CanvasPreview component; keep refs for legacy hooks

    // when imageSrc changes, load image element and draw
    useEffect(() => {
        // mirror previous behavior: notify canvas preview to redraw when image changes
        if (canvasPreviewRef.current) canvasPreviewRef.current.redraw();
    }, [imageSrc]);

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
        if (el) {
            setLeftWidth(Math.floor(el.clientWidth / 4));
        }
    }, []);

    // apply leftWidth to CSS variable on the layout element so grid is CSS-driven
    useEffect(() => {
        const el = layoutRef.current;
        if (el) {
            el.style.setProperty("--left-width", `${leftWidth}px`);
        }
    }, [leftWidth]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!draggingRef.current) return;
            const delta = e.clientX - startXRef.current;
            const newLeft = startLeftRef.current + delta;
            const el = layoutRef.current;
            if (!el) return;
            // enforce minimum width for both sides = 25% of container
            const min = Math.floor(el.clientWidth * 0.25);
            const max = el.clientWidth - min;
            const clamped = Math.max(min, Math.min(max, newLeft));
            setLeftWidth(clamped);
            // schedule a check on the next frame AFTER layout has had a chance to update
            requestAnimationFrame(() => {
                try {
                    canvasPreviewRef.current?.redraw();
                } catch {
                    // ignore draw errors during rapid drag
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
        if (canvasPreviewRef.current) canvasPreviewRef.current.redraw();
    }, [leftWidth]);

    // observe layout changes (in case grid resizing affects preview size)
    useEffect(() => {
        const el = layoutRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            // clamp leftWidth to ensure both areas remain at least 25% on resize
            const min = Math.floor(el.clientWidth * 0.25);
            const max = el.clientWidth - min;
            setLeftWidth((lw) => {
                if (lw < min) return min;
                if (lw > max) return max;
                return lw;
            });
            if (canvasPreviewRef.current) canvasPreviewRef.current.redraw();
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const onSplitterDown = (e: React.MouseEvent<HTMLDivElement>) => {
        draggingRef.current = true;
        // mark dragging state via ref only
        // setIsDragging(true);
        startXRef.current = e.clientX;
        startLeftRef.current =
            leftWidth ||
            (layoutRef.current
                ? Math.floor(layoutRef.current.clientWidth / 2)
                : 300);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    };

    return (
        <div className="uploader-root">
            <div className="app-layout" ref={layoutRef}>
                <aside className="sidebar">
                    <div className="controls-panel">
                        {/* controls header removed (leftWidth debug removed) */}
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/*"
                            onChange={onChange}
                            style={{ display: "none" }}
                        />

                        <div className="controls-group controls-group--center">
                            <UploaderControls
                                onChoose={() => inputRef.current?.click()}
                                onRemove={clear}
                                canRemove={!!imageSrc && !isCropMode}
                            />
                        </div>
                        <div className="controls-group">
                            <label>
                                Colors
                                <input
                                    type="number"
                                    min={2}
                                    max={256}
                                    value={colorCount}
                                    onChange={(e) => {
                                        // coerce to number and clamp to [2,256]
                                        const v = Number(e.target.value);
                                        if (Number.isNaN(v)) {
                                            setColorCount(2);
                                        } else {
                                            setColorCount(
                                                Math.max(2, Math.min(256, v))
                                            );
                                        }
                                    }}
                                />
                            </label>
                            <label>
                                Algorithm
                                <select
                                    value={algorithm}
                                    onChange={(e) =>
                                        setAlgorithm(e.target.value)
                                    }
                                >
                                    <option value="posterize">Posterize</option>
                                    <option value="median-cut">Median Cut</option>
                                    <option value="kmeans">K-means</option>
                                </select>
                            </label>
                            <div style={{ marginTop: 8 }}>
                                <button
                                    onClick={async () => {
                                        if (
                                            !canvasPreviewRef.current ||
                                            !imageSrc
                                        )
                                            return;
                                        // export current full-size image
                                        const blob =
                                            await canvasPreviewRef.current.exportImageBlob();
                                        if (!blob) return;
                                        const img =
                                            await new Promise<HTMLImageElement | null>(
                                                (resolve) => {
                                                    const i = new Image();
                                                    i.onload = () => resolve(i);
                                                    i.onerror = () =>
                                                        resolve(null);
                                                    i.src =
                                                        URL.createObjectURL(
                                                            blob
                                                        );
                                                }
                                            );
                                        if (!img) return;

                                        // draw to canvas then quantize using selected algorithm
                                        const w = img.naturalWidth;
                                        const h = img.naturalHeight;
                                        const c =
                                            document.createElement("canvas");
                                        c.width = w;
                                        c.height = h;
                                        const ctx = c.getContext("2d");
                                        if (!ctx) return;
                                        ctx.drawImage(img, 0, 0, w, h);
                                        const data = ctx.getImageData(
                                            0,
                                            0,
                                            w,
                                            h
                                        );
                                        // call selected algorithm (mutates ImageData)
                                        if (algorithm === "median-cut") {
                                            medianCutImageData(data, colorCount);
                                        } else if (algorithm === "kmeans") {
                                            kmeansImageData(data, colorCount);
                                        } else {
                                            posterizeImageData(data, colorCount);
                                        }
                                        ctx.putImageData(data, 0, 0);
                                        const outBlob =
                                            await new Promise<Blob | null>(
                                                (res) =>
                                                    c.toBlob(
                                                        (b) => res(b),
                                                        "image/png"
                                                    )
                                            );
                                        if (!outBlob) return;

                                        // push current image into history
                                        if (imageSrc)
                                            setPast((p) =>
                                                imageSrc ? [...p, imageSrc] : p
                                            );
                                        const url =
                                            URL.createObjectURL(outBlob);
                                        setImageSrc(url);
                                        setFuture([]);
                                    }}
                                    disabled={!imageSrc || isCropMode}
                                >
                                    Apply
                                </button>
                            </div>
                        </div>
                        {/* placeholder for future controls (color count, layer heights, etc.) */}
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
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onDragLeave={() => setDragOver(false)}
                    >
                        <CanvasPreview
                            ref={canvasPreviewRef}
                            imageSrc={imageSrc}
                            isCropMode={isCropMode}
                        />

                        {/* Undo / Redo buttons top-right (match crop button style) */}
                        <div className="preview-actions">
                            <button
                                className="preview-action-btn"
                                title="Undo"
                                aria-label="Undo"
                                disabled={isCropMode || past.length === 0}
                                onClick={() => {
                                    if (past.length === 0) return;
                                    const prev = past[past.length - 1];
                                    setPast((p) => p.slice(0, p.length - 1));
                                    setFuture((f) =>
                                        imageSrc ? [...f, imageSrc] : f
                                    );
                                    setImageSrc(prev || null);
                                }}
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
                                disabled={isCropMode || future.length === 0}
                                onClick={() => {
                                    if (future.length === 0) return;
                                    const next = future[future.length - 1];
                                    setFuture((f) => f.slice(0, f.length - 1));
                                    setPast((p) =>
                                        imageSrc ? [...p, imageSrc] : p
                                    );
                                    setImageSrc(next || null);
                                }}
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
                                            // push current image into history so undo can restore it
                                            if (imageSrc) {
                                                setPast((p) =>
                                                    imageSrc
                                                        ? [...p, imageSrc]
                                                        : p
                                                );
                                            }
                                            // create new URL for cropped image
                                            const url =
                                                URL.createObjectURL(blob);
                                            setImageSrc(url);
                                            // clearing future since this is a new branch
                                            setFuture([]);
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
                                        onClick={() => {
                                            setIsCropMode(false);
                                        }}
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
