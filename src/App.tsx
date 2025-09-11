import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import CanvasPreview from "./components/CanvasPreview";
import type { CanvasPreviewHandle } from "./components/CanvasPreview";
import UploaderControls from "./components/UploaderControls";

function App(): React.ReactElement | null {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        return () => {
            if (imageSrc) URL.revokeObjectURL(imageSrc);
        };
    }, [imageSrc]);

    const handleFiles = (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            // lightweight validation
            // keep this minimal for now
            alert("Please upload an image file");
            return;
        }
        if (imageSrc) URL.revokeObjectURL(imageSrc);
        const url = URL.createObjectURL(file);
        setImageSrc(url);
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
            URL.revokeObjectURL(imageSrc);
            setImageSrc(null);
        }
        if (inputRef.current) inputRef.current.value = "";
    };
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
            const min = 60;
            const max = el.clientWidth - 60;
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
                                canRemove={!!imageSrc}
                            />
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
                        />
                        <button
                            className="preview-crop-btn"
                            title="Crop"
                            aria-label="Crop"
                            disabled={!imageSrc}
                            onClick={() => {
                                // intentionally no-op for now
                            }}
                        >
                            <i
                                className="fa-solid fa-crop"
                                aria-hidden="true"
                            ></i>
                        </button>
                    </div>
                </main>
            </div>
        </div>
    );
}

export default App;
