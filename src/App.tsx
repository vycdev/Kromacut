import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import CanvasPreview from "./components/CanvasPreview";
import type { CanvasPreviewHandle } from "./components/CanvasPreview";
import UploaderControls from "./components/UploaderControls";
import {
    posterizeImageData,
    medianCutImageData,
    kmeansImageData,
    octreeImageData,
    wuImageData,
} from "./lib/algorithms";

function App(): React.ReactElement | null {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [past, setPast] = useState<string[]>([]);
    const [future, setFuture] = useState<string[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [colorCount, setColorCount] = useState<number>(4);
    const [algorithm, setAlgorithm] = useState<string>("kmeans");
    const [swatches, setSwatches] = useState<string[]>([]);

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
        // update swatches for the new image
        setTimeout(() => void updateSwatches(), 0);
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

    // compute color swatches (most frequent colors) when image changes
    const updateSwatches = async () => {
        setSwatches([]);
        if (!canvasPreviewRef.current || !imageSrc) return;

        try {
            // ask preview to redraw so exportImageBlob reads the latest pixels
            try {
                canvasPreviewRef.current.redraw?.();
            } catch {
                // ignore redraw errors
            }
            // wait a frame to let the canvas draw
            await new Promise((r) => requestAnimationFrame(r));

            const blob = await canvasPreviewRef.current.exportImageBlob();
            if (!blob) return;

            const img = await new Promise<HTMLImageElement | null>(
                (resolve) => {
                    const i = new Image();
                    i.onload = () => resolve(i);
                    i.onerror = () => resolve(null);
                    i.src = URL.createObjectURL(blob);
                }
            );
            if (!img) return;

            // downscale to a small sampling canvas to keep counting fast
            const max = 200;
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            const scale = Math.min(1, max / Math.max(w, h));
            const cw = Math.max(1, Math.round(w * scale));
            const ch = Math.max(1, Math.round(h * scale));
            const c = document.createElement("canvas");
            c.width = cw;
            c.height = ch;
            const ctx = c.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(img, 0, 0, cw, ch);

            try {
                URL.revokeObjectURL(img.src);
            } catch (_err) {
                console.warn("swatches: revoke failed", _err);
            }

            const data = ctx.getImageData(0, 0, cw, ch).data;
            const map = new Map<number, number>();
            for (let i = 0; i < data.length; i += 4) {
                const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
                map.set(key, (map.get(key) || 0) + 1);
            }
            const maxSwatches = 64;
            const arr = Array.from(map.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, maxSwatches)
                .map((entry) => {
                    const key = entry[0];
                    const r = (key >> 16) & 0xff;
                    const g = (key >> 8) & 0xff;
                    const b = key & 0xff;
                    return (
                        "#" +
                        [r, g, b]
                            .map((v) => v.toString(16).padStart(2, "0"))
                            .join("")
                    );
                });
            setSwatches(arr);
        } catch (_err) {
            console.warn("swatches: compute failed", _err);
        }
    };

    useEffect(() => {
        // recalc when image source changes
        updateSwatches();
        // also expose update trigger via ref if needed in future
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                                    value={colorCount}
                                    onChange={(e) =>
                                        setColorCount(
                                            Math.max(
                                                2,
                                                Math.min(
                                                    256,
                                                    Number(e.target.value) || 2
                                                )
                                            )
                                        )
                                    }
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
                                    <option value="median-cut">
                                        Median-cut
                                    </option>
                                    <option value="kmeans">K-means</option>
                                    <option value="wu">Wu</option>
                                    <option value="octree">Octree</option>
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
                                            medianCutImageData(
                                                data,
                                                colorCount
                                            );
                                        } else if (algorithm === "kmeans") {
                                            kmeansImageData(data, colorCount);
                                        } else if (algorithm === "octree") {
                                            octreeImageData(data, colorCount);
                                        } else if (algorithm === "wu") {
                                            wuImageData(data, colorCount);
                                        } else {
                                            posterizeImageData(
                                                data,
                                                colorCount
                                            );
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
                                        // async update swatches after canvas redraw
                                        setTimeout(
                                            () => void updateSwatches(),
                                            0
                                        );
                                        setFuture([]);
                                    }}
                                    disabled={!imageSrc || isCropMode}
                                >
                                    Apply
                                </button>
                            </div>
                        </div>
                        {/* color swatches: separate controls group */}
                        <div className="controls-group">
                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    marginBottom: 8,
                                }}
                            >
                                Color swatches
                            </div>
                            <div className="swatches" aria-live="polite">
                                {swatches.length === 0 ? (
                                    <div
                                        style={{
                                            color: "rgba(255,255,255,0.6)",
                                            fontSize: 13,
                                        }}
                                    >
                                        No swatches
                                    </div>
                                ) : (
                                    swatches.map((c) => (
                                        <div
                                            key={c}
                                            className="swatch"
                                            title={c}
                                            style={{ background: c }}
                                        />
                                    ))
                                )}
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
                                    setTimeout(() => void updateSwatches(), 0);
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
                                    setTimeout(() => void updateSwatches(), 0);
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
                                            // refresh swatches after crop (allow canvas to redraw)
                                            setTimeout(
                                                () => void updateSwatches(),
                                                0
                                            );
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
