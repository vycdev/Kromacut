import React, {
    useEffect,
    useImperativeHandle,
    useRef,
    forwardRef,
    useState,
} from "react";

export interface CanvasPreviewHandle {
    redraw: () => void;
}

interface Props {
    imageSrc: string | null;
}

const CanvasPreview = forwardRef<CanvasPreviewHandle, Props>(
    ({ imageSrc }, ref) => {
        const canvasRef = useRef<HTMLCanvasElement | null>(null);
        const previewContainerRef = useRef<HTMLDivElement | null>(null);
        const imgRef = useRef<HTMLImageElement | null>(null);
        const zoomRef = useRef<number>(1);
        const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
        const panningRef = useRef(false);
        const panStartXRef = useRef(0);
        const panStartYRef = useRef(0);
        const panStartOffsetRef = useRef({ x: 0, y: 0 });

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

            const baseScale = Math.min(cw / iw, ch / ih);
            const dw = iw * baseScale;
            const dh = ih * baseScale;
            const dx = (cw - dw) / 2;
            const dy = (ch - dh) / 2;

            const userZoom = zoomRef.current || 1;
            const totalScale = baseScale * userZoom;

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
            ctx.drawImage(img, 0, 0, iw, ih);
        };

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
            img.onload = () => drawToCanvas();
            img.src = imageSrc;
            return () => {
                imgRef.current = null;
            };
        }, [imageSrc]);

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
            const delta = -e.deltaY;
            const factor = Math.exp(delta * 0.0015);
            const z2 = clamp(z * factor, 0.1, 32);

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

        // cropping state
        const [isCropMode, setIsCropMode] = useState(false);
        const [selection, setSelection] = useState<{
            x: number;
            y: number;
            w: number;
            h: number;
        } | null>(null);
        const selStartRef = useRef<{ x: number; y: number } | null>(null);

        const startPan = (e: React.MouseEvent) => {
            // if crop mode is active, start drawing selection
            if (isCropMode) {
                if (!previewContainerRef.current) return;
                const rect =
                    previewContainerRef.current.getBoundingClientRect();
                const sx = e.clientX - rect.left;
                const sy = e.clientY - rect.top;
                selStartRef.current = { x: sx, y: sy };
                setSelection({ x: sx, y: sy, w: 0, h: 0 });

                const onMove = (ev: MouseEvent) => {
                    const cur = selStartRef.current;
                    if (!cur || !previewContainerRef.current) return;
                    const rect2 =
                        previewContainerRef.current.getBoundingClientRect();
                    const mx = Math.max(
                        0,
                        Math.min(ev.clientX - rect2.left, rect2.width)
                    );
                    const my = Math.max(
                        0,
                        Math.min(ev.clientY - rect2.top, rect2.height)
                    );
                    const nx = Math.min(cur.x, mx);
                    const ny = Math.min(cur.y, my);
                    const nw = Math.abs(mx - cur.x);
                    const nh = Math.abs(my - cur.y);
                    setSelection({ x: nx, y: ny, w: nw, h: nh });
                };
                const onUp = () => {
                    selStartRef.current = null;
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
                return;
            }

            // otherwise do panning
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

        const toggleCrop = () => {
            setIsCropMode((v) => {
                if (v) setSelection(null);
                return !v;
            });
        };

        const saveCrop = () => {
            const sel = selection;
            const canvas = canvasRef.current;
            if (!sel || !canvas) return;
            const dpr = window.devicePixelRatio || 1;
            const sx = Math.floor(sel.x * dpr);
            const sy = Math.floor(sel.y * dpr);
            const sw = Math.max(1, Math.floor(sel.w * dpr));
            const sh = Math.max(1, Math.floor(sel.h * dpr));

            const out = document.createElement("canvas");
            out.width = sw;
            out.height = sh;
            const outCtx = out.getContext("2d");
            if (!outCtx) return;
            outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
            out.toBlob((blob) => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "crop.png";
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            }, "image/png");
        };

        // expose to window temporarily so the function is referenced (avoids unused-var compile error)
        // this is intentionally left as a no-op on the Save button for now per user request
        (window as unknown as { __saveCrop?: () => void }).__saveCrop =
            saveCrop;

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
        }, []);

        useImperativeHandle(ref, () => ({
            redraw: () => drawToCanvas(),
        }));

        return (
            <div
                ref={previewContainerRef}
                className="preview-container"
                onWheel={onWheelCanvas}
                onMouseDown={startPan}
            >
                <canvas ref={canvasRef} />
                {!isCropMode ? (
                    <button
                        className="preview-crop-btn"
                        title="Crop"
                        onClick={() => toggleCrop()}
                    >
                        <i className="fa-solid fa-crop" aria-hidden="true"></i>
                    </button>
                ) : (
                    <>
                        <button
                            className="preview-crop-btn preview-crop-btn--save"
                            title="Save crop"
                            onClick={() => {
                                // save is currently a no-op by request; placeholder for applying crop
                                // applyCrop();
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
                            onClick={() => {
                                setIsCropMode(false);
                                setSelection(null);
                            }}
                        >
                            <i
                                className="fa-solid fa-xmark"
                                aria-hidden="true"
                            ></i>
                        </button>
                    </>
                )}

                {selection ? (
                    <div
                        className="crop-selection"
                        style={{
                            left: selection.x,
                            top: selection.y,
                            width: selection.w,
                            height: selection.h,
                        }}
                    />
                ) : null}
            </div>
        );
    }
);

export default CanvasPreview;
