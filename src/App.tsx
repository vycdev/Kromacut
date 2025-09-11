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
    const zoomRef = useRef<number>(1);
    const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const panningRef = useRef(false);
    const panStartXRef = useRef(0);
    const panStartYRef = useRef(0);
    const panStartOffsetRef = useRef({ x: 0, y: 0 });

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
        // clear using device-pixel transform, then set our final transform
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);

        const img = imgRef.current;
        if (!img) return;

        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        if (!iw || !ih) return;

        // calculate aspect-fit size
        const baseScale = Math.min(cw / iw, ch / ih);
        const dw = iw * baseScale;
        const dh = ih * baseScale;
        const dx = (cw - dw) / 2;
        const dy = (ch - dh) / 2;

        const userZoom = zoomRef.current || 1;
        const totalScale = baseScale * userZoom;

        // apply final transform: scale and translation in CSS pixels (will be multiplied by dpr)
        ctx.setTransform(
            dpr * totalScale,
            0,
            0,
            dpr * totalScale,
            dpr * (offsetRef.current.x + dx),
            dpr * (offsetRef.current.y + dy)
        );
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        // draw image at image-space coordinates (0,0) sized to its natural pixels
        ctx.drawImage(img, 0, 0, iw, ih);
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

    // pan/zoom handlers
    const clamp = (v: number, a: number, b: number) =>
        Math.max(a, Math.min(b, v));

    const onWheelCanvas = (e: React.WheelEvent) => {
        if (!previewContainerRef.current) return;
        e.preventDefault();
        const rect = previewContainerRef.current.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        const container = previewContainerRef.current;
        const cw = container.clientWidth;
        const ch = container.clientHeight;

        const img = imgRef.current;
        if (!img) return;
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        if (!iw || !ih) return;

        const baseScale = Math.min(cw / iw, ch / ih);
        const dw = iw * baseScale;
        const dh = ih * baseScale;
        const dx = (cw - dw) / 2;
        const dy = (ch - dh) / 2;

        const z = zoomRef.current || 1;
        const delta = -e.deltaY; // invert so wheel up zooms in
        const factor = Math.exp(delta * 0.0015);
        const z2 = clamp(z * factor, 0.1, 32);

        // keep canvas point under cursor stable
        const cxRel = cx;
        const cyRel = cy;
        const newOffsetX =
            cxRel - dx - (cxRel - dx - offsetRef.current.x) * (z2 / z);
        const newOffsetY =
            cyRel - dy - (cyRel - dy - offsetRef.current.y) * (z2 / z);

        zoomRef.current = z2;
        offsetRef.current = { x: newOffsetX, y: newOffsetY };
        drawToCanvas();
    };

    const startPan = (e: React.MouseEvent) => {
        // only left button
        if (e.button !== 0) return;
        panningRef.current = true;
        panStartXRef.current = e.clientX;
        panStartYRef.current = e.clientY;
        panStartOffsetRef.current = { ...offsetRef.current };
        document.body.style.cursor = "grabbing";

        const onMove = (ev: MouseEvent) => {
            if (!panningRef.current) return;
            const dx = ev.clientX - panStartXRef.current;
            const dy = ev.clientY - panStartYRef.current;
            offsetRef.current = {
                x: panStartOffsetRef.current.x + dx,
                y: panStartOffsetRef.current.y + dy,
            };
            drawToCanvas();
        };
        const onUp = () => {
            panningRef.current = false;
            document.body.style.cursor = "";
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

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
    const [isDragging, setIsDragging] = useState(false);
    const startXRef = useRef(0);
    const startLeftRef = useRef(0);

    // initialize leftWidth once on mount
    useEffect(() => {
        const el = layoutRef.current;
        if (el) {
            setLeftWidth(Math.floor(el.clientWidth / 2));
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
                    drawToCanvas();
                } catch {
                    // ignore draw errors during rapid drag
                }
                try {
                    drawToCanvas();
                } catch {
                    // ignore draw errors during rapid drag
                }
            });
        };
        const onUp = () => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            setIsDragging(false);
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
        drawToCanvas();
    }, [leftWidth]);

    // observe layout changes (in case grid resizing affects preview size)
    useEffect(() => {
        const el = layoutRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => drawToCanvas());
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const onSplitterDown = (e: React.MouseEvent<HTMLDivElement>) => {
        draggingRef.current = true;
        setIsDragging(true);
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
                        <div
                            style={{
                                fontSize: 12,
                                opacity: 0.85,
                                marginBottom: 8,
                            }}
                        >
                            <div>leftWidth: {leftWidth}px</div>
                        </div>
                        <div className="uploader-controls">
                            <input
                                ref={inputRef}
                                type="file"
                                accept="image/*"
                                onChange={onChange}
                                style={{ display: "none" }}
                            />
                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                            >
                                Choose file
                            </button>
                            <button onClick={clear} disabled={!imageSrc}>
                                Remove
                            </button>
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
                            className={`preview-container ${
                                isDragging ? "dragging" : ""
                            }`}
                            onWheel={onWheelCanvas}
                            onMouseDown={startPan}
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
