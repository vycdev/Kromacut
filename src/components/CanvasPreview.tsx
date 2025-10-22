import React, {
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    forwardRef,
    useCallback,
} from 'react';
import { applyAdjustments, isAllDefault } from '../lib/applyAdjustments';

export interface CanvasPreviewHandle {
    redraw: () => void;
    // promise-based helpers so callers can await the next draw cycle
    redrawAsync?: () => Promise<void>;
    waitForNextDraw?: () => Promise<void>;
    exportCroppedImage: () => Promise<Blob | null>;
    exportImageBlob: () => Promise<Blob | null>;
    exportAdjustedImageBlob?: () => Promise<Blob | null>;
}

interface Props {
    imageSrc: string | null;
    isCropMode?: boolean;
    showCheckerboard?: boolean;
    adjustments?: Record<string, number>;
}

const CanvasPreview = forwardRef<CanvasPreviewHandle, Props>(
    ({ imageSrc, isCropMode, showCheckerboard, adjustments }, ref) => {
        const canvasRef = useRef<HTMLCanvasElement | null>(null);
        const previewContainerRef = useRef<HTMLDivElement | null>(null);
        const imgRef = useRef<HTMLImageElement | null>(null);
        const zoomRef = useRef<number>(1);
        const [zoomState, setZoomState] = useState<number>(1);
        const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
        const panningRef = useRef(false);
        const panStartXRef = useRef(0);
        const panStartYRef = useRef(0);
        const panStartOffsetRef = useRef({ x: 0, y: 0 });
        // crop selection in CSS pixels relative to container
        const [selection, setSelection] = useState<null | {
            x: number;
            y: number;
            w: number;
            h: number;
        }>(null);
        const selectionRef = useRef(selection);
        selectionRef.current = selection;
        const draggingRef = useRef<null | {
            type: 'move' | 'resize';
            handle?: string;
            startX: number;
            startY: number;
            orig: { x: number; y: number; w: number; h: number };
        }>(null);

        // Offscreen originals & processed versions
        const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
        const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);
        const lastAdjSigRef = useRef<string>('');

        const drawToCanvas = useCallback(() => {
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

            const ctx = canvas.getContext('2d');
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
            // disable smoothing for preview so we don't introduce blended
            // colors when the image is scaled; use nearest-neighbor display
            // to show the exact pixel values after quantization.
            ctx.imageSmoothingEnabled = false;
            // imageSmoothingQuality is not relevant when smoothing is disabled
            const original = originalCanvasRef.current;
            if (adjustments && !isAllDefault(adjustments)) {
                const sig = JSON.stringify(adjustments);
                // Recompute processed canvas only if signature changed or missing.
                if (sig !== lastAdjSigRef.current) {
                    try {
                        const baseSource: HTMLCanvasElement | HTMLImageElement = original ?? img;
                        const iw2 =
                            baseSource instanceof HTMLImageElement ? baseSource.naturalWidth : iw;
                        const ih2 =
                            baseSource instanceof HTMLImageElement ? baseSource.naturalHeight : ih;
                        let srcCtx: CanvasRenderingContext2D | null = null;
                        if (original) {
                            srcCtx = original.getContext('2d');
                        } else {
                            // lazily build original if missing
                            originalCanvasRef.current = document.createElement('canvas');
                            originalCanvasRef.current.width = iw2;
                            originalCanvasRef.current.height = ih2;
                            const octx = originalCanvasRef.current.getContext('2d');
                            if (octx) {
                                octx.imageSmoothingEnabled = false;
                                octx.drawImage(img, 0, 0, iw2, ih2);
                                srcCtx = octx;
                            }
                        }
                        if (srcCtx) {
                            const imgData = srcCtx.getImageData(0, 0, iw, ih);
                            const adjData = applyAdjustments(imgData, adjustments);
                            const proc = document.createElement('canvas');
                            proc.width = iw;
                            proc.height = ih;
                            const pctx = proc.getContext('2d');
                            if (pctx) pctx.putImageData(adjData, 0, 0);
                            processedCanvasRef.current = proc;
                            lastAdjSigRef.current = sig;
                        }
                    } catch {
                        // fallback to original draw
                    }
                }
                if (processedCanvasRef.current) {
                    ctx.drawImage(processedCanvasRef.current, 0, 0, iw, ih);
                } else if (original) {
                    ctx.drawImage(original, 0, 0, iw, ih);
                } else {
                    ctx.drawImage(img, 0, 0, iw, ih);
                }
            } else {
                // No adjustments – ensure processed cache cleared so future adjustment toggles refresh.
                processedCanvasRef.current = null;
                lastAdjSigRef.current = '';
                if (original) {
                    ctx.drawImage(original, 0, 0, iw, ih);
                } else {
                    ctx.drawImage(img, 0, 0, iw, ih);
                }
            }
            // resolve any waiters that are awaiting the next draw
            try {
                const waiters = drawWaitersRef.current.splice(0);
                waiters.forEach((r) => r());
            } catch {
                // ignore
            }
        }, [adjustments]);

        // list of pending resolvers that callers can await via waitForNextDraw
        const drawWaitersRef = useRef<Array<() => void>>([]);

        const computeImageLayout = () => {
            const container = previewContainerRef.current;
            const img = imgRef.current;
            if (!container || !img) return null;
            const cw = container.clientWidth;
            const ch = container.clientHeight;
            const iw = img.naturalWidth;
            const ih = img.naturalHeight;
            if (!iw || !ih) return null;
            const baseScale = Math.min(cw / iw, ch / ih);
            const dw = iw * baseScale;
            const dh = ih * baseScale;
            const dx = (cw - dw) / 2;
            const dy = (ch - dh) / 2;
            return { baseScale, dx, dy, dw, dh, cw, ch, iw, ih };
        };

        useEffect(() => {
            if (!imageSrc) {
                imgRef.current = null;
                const canvas = canvasRef.current;
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }
                }
                return;
            }

            // Capture visible center image coordinates so we can preserve the
            // user's view when the underlying image is replaced (e.g. after
            // baking, dedithering, or cropping). If there's no previous layout
            // available we'll fall back to the existing offset.
            const container = previewContainerRef.current;
            let prevCenterImageCoord: { x: number; y: number } | null = null;
            if (container && imgRef.current) {
                const rect = container.getBoundingClientRect();
                const cx = rect.width / 2;
                const cy = rect.height / 2;
                const prevLayout = computeImageLayout();
                if (prevLayout) {
                    const prevScale = prevLayout.baseScale * (zoomRef.current || 1);
                    const imgX = (cx - (offsetRef.current.x + prevLayout.dx)) / prevScale;
                    const imgY = (cy - (offsetRef.current.y + prevLayout.dy)) / prevScale;
                    prevCenterImageCoord = { x: imgX, y: imgY };
                }
            }

            const img = new Image();
            imgRef.current = img;
            img.onload = () => {
                // preserve current zoom (don't reset) and try to restore the
                // same image coordinate under the container center so the view
                // doesn't jump when swapping the image source.
                const iw = img.naturalWidth;
                const ih = img.naturalHeight;
                if (iw && ih) {
                    originalCanvasRef.current = document.createElement('canvas');
                    originalCanvasRef.current.width = iw;
                    originalCanvasRef.current.height = ih;
                    const octx = originalCanvasRef.current.getContext('2d');
                    if (octx) {
                        octx.imageSmoothingEnabled = false;
                        octx.drawImage(img, 0, 0, iw, ih);
                    }
                    processedCanvasRef.current = null; // invalidate processed
                    lastAdjSigRef.current = '';
                }

                // restore view center if we computed it earlier
                if (prevCenterImageCoord && container) {
                    const rect = container.getBoundingClientRect();
                    const cx = rect.width / 2;
                    const cy = rect.height / 2;
                    const newLayout = computeImageLayout();
                    if (newLayout) {
                        const newScale = newLayout.baseScale * (zoomRef.current || 1);
                        const newOffsetX = cx - newLayout.dx - prevCenterImageCoord.x * newScale;
                        const newOffsetY = cy - newLayout.dy - prevCenterImageCoord.y * newScale;
                        offsetRef.current = { x: newOffsetX, y: newOffsetY };
                    }
                }

                drawToCanvas();
            };
            img.src = imageSrc;
            return () => {
                imgRef.current = null;
                originalCanvasRef.current = null;
                processedCanvasRef.current = null;
            };
        }, [imageSrc, drawToCanvas]);

        // initialize selection when entering crop mode
        useEffect(() => {
            if (!isCropMode) return;
            const initSelection = () => {
                const layout = computeImageLayout();
                if (!layout) return false;
                const { dx, dy, dw, dh, cw, ch } = layout;
                const userZoom = zoomRef.current || 1;
                // account for user pan (offsetRef) and zoom when computing visible image rect
                const x = dx + offsetRef.current.x;
                const y = dy + offsetRef.current.y;
                const w = dw * userZoom;
                const h = dh * userZoom;

                // clamp to container
                const sx = Math.max(0, Math.min(cw - 1, x));
                const sy = Math.max(0, Math.min(ch - 1, y));
                const sw = Math.max(1, Math.min(cw - sx, w));
                const sh = Math.max(1, Math.min(ch - sy, h));
                setSelection({ x: sx, y: sy, w: sw, h: sh });
                return true;
            };

            // try to init immediately; if image hasn't loaded yet computeImageLayout may return null
            const ok = initSelection();
            if (ok) return;
            // retry once on next animation frame after layout/img may be ready
            let raf = 0 as number;
            raf = requestAnimationFrame(() => initSelection());
            return () => cancelAnimationFrame(raf);
        }, [isCropMode, imageSrc]);

        const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

        // native wheel handler (non-passive) so we can call preventDefault()
        const onWheelCanvasRef = useRef<(e: WheelEvent) => void | null>(null);
        const onWheelCanvas = (e: WheelEvent) => {
            const container = previewContainerRef.current;
            if (!container) return;
            e.preventDefault();
            const rect = container.getBoundingClientRect();
            const cx = e.clientX - rect.left;
            const cy = e.clientY - rect.top;

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

            const newOffsetX = cx - dx - (cx - dx - offsetRef.current.x) * (z2 / z);
            const newOffsetY = cy - dy - (cy - dy - offsetRef.current.y) * (z2 / z);

            zoomRef.current = z2;
            // update React state so HUD re-renders with new crop size
            setZoomState(z2);
            offsetRef.current = { x: newOffsetX, y: newOffsetY };
            drawToCanvas();
        };
        onWheelCanvasRef.current = onWheelCanvas;

        const startPan = (e: React.MouseEvent) => {
            // prevent browser's native drag behavior when dragging quickly
            e.preventDefault();
            if (e.button !== 0) return;
            panningRef.current = true;
            panStartXRef.current = e.clientX;
            panStartYRef.current = e.clientY;
            panStartOffsetRef.current = { ...offsetRef.current };
            document.body.style.cursor = 'grabbing';

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
                document.body.style.cursor = '';
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        };

        // Pointer interactions for crop selection
        const onSelectionPointerDown = (e: React.MouseEvent) => {
            // only handle left button
            // prevent native drag (images/anchors) and text selection
            e.preventDefault();
            if (e.button !== 0) return;
            const target = e.target as HTMLElement;
            const handle = target.dataset.handle;
            const rect = previewContainerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const sel = selectionRef.current;
            if (!sel) return;
            if (handle) {
                // start resize
                draggingRef.current = {
                    type: 'resize',
                    handle,
                    startX: x,
                    startY: y,
                    orig: { ...sel },
                };
            } else {
                // inside selection -> move
                draggingRef.current = {
                    type: 'move',
                    startX: x,
                    startY: y,
                    orig: { ...sel },
                };
            }

            const onMove = (ev: MouseEvent) => {
                const r = previewContainerRef.current?.getBoundingClientRect();
                if (!r) return;
                const mx = ev.clientX - r.left;
                const my = ev.clientY - r.top;
                const drag = draggingRef.current;
                if (!drag) return;
                const minSize = 20;
                if (drag.type === 'move') {
                    const dx = mx - drag.startX;
                    const dy = my - drag.startY;
                    const nx = drag.orig.x + dx;
                    const ny = drag.orig.y + dy;
                    // clamp within container
                    const cw = r.width;
                    const ch = r.height;
                    const clampedX = Math.max(0, Math.min(cw - drag.orig.w, nx));
                    const clampedY = Math.max(0, Math.min(ch - drag.orig.h, ny));
                    setSelection({
                        x: clampedX,
                        y: clampedY,
                        w: drag.orig.w,
                        h: drag.orig.h,
                    });
                } else if (drag.type === 'resize') {
                    const handle = drag.handle || '';
                    const { x: ox, y: oy, w: ow, h: oh } = drag.orig;
                    let nx = ox;
                    let ny = oy;
                    let nw = ow;
                    let nh = oh;
                    const cx = mx;
                    const cy = my;
                    // handle resize logic for corners/sides
                    if (handle.includes('n')) {
                        const newY = Math.min(oy + oh - minSize, cy);
                        nh = oy + oh - newY;
                        ny = newY;
                    }
                    if (handle.includes('s')) {
                        nh = Math.max(minSize, cy - oy);
                    }
                    if (handle.includes('w')) {
                        const newX = Math.min(ox + ow - minSize, cx);
                        nw = ox + ow - newX;
                        nx = newX;
                    }
                    if (handle.includes('e')) {
                        nw = Math.max(minSize, cx - ox);
                    }
                    // clamp to container
                    const cw = r.width;
                    const ch = r.height;
                    nx = Math.max(0, Math.min(nx, cw - 1));
                    ny = Math.max(0, Math.min(ny, ch - 1));
                    nw = Math.max(minSize, Math.min(nw, cw - nx));
                    nh = Math.max(minSize, Math.min(nh, ch - ny));
                    setSelection({ x: nx, y: ny, w: nw, h: nh });
                }
            };

            const onUp = () => {
                draggingRef.current = null;
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        };

        useEffect(() => {
            const container = previewContainerRef.current;
            if (!container) return;
            const ro = new ResizeObserver(() => drawToCanvas());
            ro.observe(container);
            window.addEventListener('resize', drawToCanvas);

            // attach native wheel listener as non-passive so we can call preventDefault()
            const wrapper = (ev: Event) => {
                const w = ev as WheelEvent;
                if (onWheelCanvasRef.current) onWheelCanvasRef.current(w);
            };
            container.addEventListener('wheel', wrapper as EventListener, {
                passive: false,
            });

            return () => {
                ro.disconnect();
                window.removeEventListener('resize', drawToCanvas);
                container.removeEventListener('wheel', wrapper as EventListener);
            };
        }, [drawToCanvas]);

        // Trigger redraw when adjustments object changes
        useEffect(() => {
            drawToCanvas();
        }, [adjustments, drawToCanvas]);

        useImperativeHandle(ref, () => ({
            redraw: () => drawToCanvas(),
            redrawAsync: async (): Promise<void> => {
                drawToCanvas();
                await new Promise((r) => requestAnimationFrame(r));
            },
            waitForNextDraw: (): Promise<void> => {
                return new Promise((resolve) => {
                    drawWaitersRef.current.push(resolve);
                });
            },
            exportCroppedImage: async (): Promise<Blob | null> => {
                const img = imgRef.current;
                const sel = selectionRef.current;
                if (!img || !sel) return null;
                const layout = computeImageLayout();
                if (!layout) return null;
                const { baseScale, dx, dy } = layout;
                const userZoom = zoomRef.current || 1;
                const scale = baseScale * userZoom;

                // map selection (container CSS pixels) back to image pixel coordinates
                const sx = (sel.x - (offsetRef.current.x + dx)) / scale;
                const sy = (sel.y - (offsetRef.current.y + dy)) / scale;
                const sw = sel.w / scale;
                const sh = sel.h / scale;

                const iw = img.naturalWidth;
                const ih = img.naturalHeight;

                // clamp and integerize
                const sxClamped = Math.max(0, Math.min(iw, sx));
                const syClamped = Math.max(0, Math.min(ih, sy));
                const swClamped = Math.max(1, Math.min(iw - sxClamped, sw));
                const shClamped = Math.max(1, Math.min(ih - syClamped, sh));

                const outW = Math.max(1, Math.round(swClamped));
                const outH = Math.max(1, Math.round(shClamped));

                const outCanvas = document.createElement('canvas');
                outCanvas.width = outW;
                outCanvas.height = outH;
                const ctx = outCanvas.getContext('2d');
                if (!ctx) return null;
                // draw selection without smoothing to avoid interpolation
                ctx.imageSmoothingEnabled = false;
                ctx.imageSmoothingQuality = 'low';
                ctx.drawImage(img, sxClamped, syClamped, swClamped, shClamped, 0, 0, outW, outH);

                return await new Promise<Blob | null>((resolve) =>
                    outCanvas.toBlob((b) => resolve(b), 'image/png')
                );
            },
            exportImageBlob: async (): Promise<Blob | null> => {
                const img = imgRef.current;
                if (!img) return null;
                const iw = img.naturalWidth;
                const ih = img.naturalHeight;
                if (!iw || !ih) return null;
                const outCanvas = document.createElement('canvas');
                outCanvas.width = iw;
                outCanvas.height = ih;
                const ctx = outCanvas.getContext('2d');
                if (!ctx) return null;
                // draw without smoothing to ensure exported pixels match
                // the source image exactly (no interpolation artifacts)
                ctx.imageSmoothingEnabled = false;
                ctx.imageSmoothingQuality = 'low';
                ctx.drawImage(img, 0, 0, iw, ih);
                return await new Promise<Blob | null>((resolve) =>
                    outCanvas.toBlob((b) => resolve(b), 'image/png')
                );
            },
            exportAdjustedImageBlob: async (): Promise<Blob | null> => {
                const img = imgRef.current;
                if (!img) return null;
                const iw = img.naturalWidth;
                const ih = img.naturalHeight;
                if (!iw || !ih) return null;
                const canvas = document.createElement('canvas');
                canvas.width = iw;
                canvas.height = ih;
                const ctx = canvas.getContext('2d');
                if (!ctx) return null;
                ctx.imageSmoothingEnabled = false;
                ctx.imageSmoothingQuality = 'low';
                // Prefer processed canvas if exists, else original or image element
                if (processedCanvasRef.current) {
                    ctx.drawImage(processedCanvasRef.current, 0, 0, iw, ih);
                } else if (originalCanvasRef.current) {
                    ctx.drawImage(originalCanvasRef.current, 0, 0, iw, ih);
                } else {
                    ctx.drawImage(img, 0, 0, iw, ih);
                }
                return await new Promise<Blob | null>((resolve) =>
                    canvas.toBlob((b) => resolve(b), 'image/png')
                );
            },
        }));

        return (
            <div
                ref={previewContainerRef}
                className="w-full h-full relative overflow-hidden bg-background"
                onMouseDown={startPan}
                onDragStart={(e) => e.preventDefault()}
                style={
                    showCheckerboard
                        ? {
                              background:
                                  'repeating-conic-gradient(rgba(255,255,255,0.1) 0% 25%, rgba(0,0,0,0.1) 0% 50%) 50% / 16px 16px',
                          }
                        : undefined
                }
            >
                <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
                {/* small HUD showing image size and crop size (when active) */}
                {imgRef.current ? (
                    <div
                        className="absolute top-2 left-2 bg-black/80 text-foreground text-xs px-2 py-1 rounded"
                        aria-hidden
                    >
                        {(() => {
                            const img = imgRef.current!;
                            const iw = img.naturalWidth;
                            const ih = img.naturalHeight;
                            let text = `Image: ${iw}×${ih}`;
                            if (isCropMode && selection) {
                                const layout = computeImageLayout();
                                if (layout) {
                                    const { baseScale, dx, dy } = layout;
                                    const userZoom = zoomState || zoomRef.current || 1;
                                    const scale = baseScale * userZoom;

                                    const sx = (selection.x - (offsetRef.current.x + dx)) / scale;
                                    const sy = (selection.y - (offsetRef.current.y + dy)) / scale;
                                    const sw = selection.w / scale;
                                    const sh = selection.h / scale;

                                    const sxClamped = Math.max(0, Math.min(iw, sx));
                                    const syClamped = Math.max(0, Math.min(ih, sy));
                                    const swClamped = Math.max(1, Math.min(iw - sxClamped, sw));
                                    const shClamped = Math.max(1, Math.min(ih - syClamped, sh));

                                    const outW = Math.max(1, Math.round(swClamped));
                                    const outH = Math.max(1, Math.round(shClamped));
                                    text += ` • Crop: ${outW}×${outH}`;
                                }
                            }
                            return text;
                        })()}
                    </div>
                ) : null}
                {/* crop overlay rendered on top of canvas when crop mode active */}
                {isCropMode && selection ? (
                    <div
                        className="crop-overlay"
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => e.preventDefault()}
                    >
                        {/* dimmed outside implemented as four panels so the inside of the crop box remains clear */}
                        <div
                            className="crop-dim"
                            style={{
                                left: 0,
                                top: 0,
                                right: 0,
                                height: `${selection.y}px`,
                            }}
                        />
                        <div
                            className="crop-dim"
                            style={{
                                left: 0,
                                top: `${selection.y}px`,
                                width: `${selection.x}px`,
                                height: `${selection.h}px`,
                            }}
                        />
                        <div
                            className="crop-dim"
                            style={{
                                left: `${selection.x + selection.w}px`,
                                top: `${selection.y}px`,
                                right: 0,
                                height: `${selection.h}px`,
                            }}
                        />
                        <div
                            className="crop-dim"
                            style={{
                                left: 0,
                                top: `${selection.y + selection.h}px`,
                                right: 0,
                                bottom: 0,
                            }}
                        />
                        {/* selection box */}
                        <div
                            className="crop-box"
                            style={{
                                left: selection.x,
                                top: selection.y,
                                width: selection.w,
                                height: selection.h,
                            }}
                            onMouseDown={onSelectionPointerDown}
                        >
                            {/* grid lines */}
                            <div className="crop-grid">
                                <div className="v v1" />
                                <div className="v v2" />
                                <div className="h h1" />
                                <div className="h h2" />
                            </div>
                            {/* corners */}
                            <div
                                className="corner nw"
                                data-handle="nw"
                                onMouseDown={onSelectionPointerDown}
                            />
                            <div
                                className="corner ne"
                                data-handle="ne"
                                onMouseDown={onSelectionPointerDown}
                            />
                            <div
                                className="corner sw"
                                data-handle="sw"
                                onMouseDown={onSelectionPointerDown}
                            />
                            <div
                                className="corner se"
                                data-handle="se"
                                onMouseDown={onSelectionPointerDown}
                            />
                            {/* side handles */}
                            <div
                                className="side n"
                                data-handle="n"
                                onMouseDown={onSelectionPointerDown}
                            />
                            <div
                                className="side s"
                                data-handle="s"
                                onMouseDown={onSelectionPointerDown}
                            />
                            <div
                                className="side w"
                                data-handle="w"
                                onMouseDown={onSelectionPointerDown}
                            />
                            <div
                                className="side e"
                                data-handle="e"
                                onMouseDown={onSelectionPointerDown}
                            />
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }
);

export default CanvasPreview;
