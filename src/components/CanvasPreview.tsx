import React, {
    useEffect,
    useImperativeHandle,
    useRef,
    forwardRef,
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

        const startPan = (e: React.MouseEvent) => {
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
                <button className="preview-crop-btn" title="Crop">
                    <i className="fa-solid fa-crop" aria-hidden="true"></i>
                </button>
            </div>
        );
    }
);

export default CanvasPreview;
