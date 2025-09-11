import React, { useEffect, useRef, useState } from "react";
import "./App.css";

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
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const previewContainerRef = useRef<HTMLDivElement | null>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);

    // draw image to canvas with aspect-fit and HiDPI support
    const drawToCanvas = () => {
        const canvas = canvasRef.current;
        const container = previewContainerRef.current;
        if (!canvas || !container) return;

        const dpr = window.devicePixelRatio || 1;
        const cw = container.clientWidth;
        const ch = container.clientHeight;

        canvas.width = Math.max(1, Math.floor(cw * dpr));
        canvas.height = Math.max(1, Math.floor(ch * dpr));
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);

        const img = imgRef.current;
        if (!img) return;

        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        if (!iw || !ih) return;

        // calculate aspect-fit size
        const scale = Math.min(cw / iw, ch / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = (cw - dw) / 2;
        const dy = (ch - dh) / 2;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
    };

    // when imageSrc changes, load image element and draw
    useEffect(() => {
        if (!imageSrc) {
            imgRef.current = null;
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext("2d");
                if (ctx && previewContainerRef.current) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            }
            return;
        }

        const img = new Image();
        imgRef.current = img;
        img.onload = () => {
            // draw once loaded
            drawToCanvas();
        };
        img.src = imageSrc;
        return () => {
            // keep reference but don't revoke here (clear handles)
            imgRef.current = null;
        };
    }, [imageSrc]);

    // resize observer to redraw canvas when preview area size changes
    useEffect(() => {
        const container = previewContainerRef.current;
        if (!container) return;
        const ro = new ResizeObserver(() => drawToCanvas());
        ro.observe(container);
        window.addEventListener("resize", drawToCanvas);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", drawToCanvas);
        };
        // empty deps on purpose - we only want to attach once on mount
    }, []);
    // Layout splitter state
    const layoutRef = useRef<HTMLDivElement | null>(null);
    const [leftWidth, setLeftWidth] = useState<number>(0);
    const draggingRef = useRef(false);
    const startXRef = useRef(0);
    const startLeftRef = useRef(0);

    useEffect(() => {
        const el = layoutRef.current;
        if (el && leftWidth === 0) {
            setLeftWidth(Math.floor(el.clientWidth / 2));
        }
    }, [leftWidth]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!draggingRef.current) return;
            const delta = e.clientX - startXRef.current;
            const newLeft = startLeftRef.current + delta;
            const el = layoutRef.current;
            if (!el) return;
            const min = 120;
            const max = el.clientWidth - 120;
            const clamped = Math.max(min, Math.min(max, newLeft));
            setLeftWidth(clamped);
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

    const onSplitterDown = (e: React.MouseEvent<HTMLDivElement>) => {
        draggingRef.current = true;
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
            <div
                className="app-layout"
                ref={layoutRef}
                style={{ gridTemplateColumns: `${leftWidth}px 10px 1fr` }}
            >
                <aside className="sidebar">
                    <div className="controls-panel">
                        <h2>Controls</h2>
                        <p className="muted">
                            Image settings and project controls will appear
                            here.
                        </p>
                        <div className="uploader-controls">
                            <div className="placeholder small">
                                <p>Upload an image</p>
                                <button
                                    type="button"
                                    onClick={() => inputRef.current?.click()}
                                >
                                    Choose file
                                </button>
                            </div>
                            <input
                                ref={inputRef}
                                type="file"
                                accept="image/*"
                                onChange={onChange}
                                style={{ display: "none" }}
                            />
                            {imageSrc && (
                                <div style={{ marginTop: 8 }}>
                                    <button onClick={clear}>Remove</button>
                                </div>
                            )}
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
                        <div
                            ref={previewContainerRef}
                            className="preview-container"
                        >
                            <canvas ref={canvasRef} />
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}

export default App;
