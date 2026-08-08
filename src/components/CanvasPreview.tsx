import React, {
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    forwardRef,
    useCallback,
    useMemo,
} from 'react';
import { applyAdjustments, isAllDefault } from '../lib/applyAdjustments';
import { Check, Move, X } from 'lucide-react';
import {
    brushSpans,
    floodFill,
    hardenAlphaToColor,
    parseHexColor,
    rgbToHex,
    stampSpansIntoSurface,
    strokeLinePoints,
    wrapTextLines,
} from '../lib/touchup';
import type { TouchUpTool } from '../types';

export interface CanvasPreviewHandle {
    redraw: () => void;
    // promise-based helpers so callers can await the next draw cycle
    redrawAsync?: () => Promise<void>;
    waitForNextDraw?: () => Promise<void>;
    exportCroppedImage: () => Promise<Blob | null>;
    exportImageBlob: () => Promise<Blob | null>;
    hasValidCropSelection: () => boolean;
    onCropSelectionChange?: (hasValid: boolean) => void;
    exportAdjustedImageBlob?: (
        adjustmentsOverride?: Record<string, number>
    ) => Promise<Blob | null>;
}

interface Props {
    imageSrc: string | null;
    isCropMode?: boolean;
    showCheckerboard?: boolean;
    adjustments?: Record<string, number>;
    onCropSelectionChange?: (hasValid: boolean) => void;
    /** Active 2D touch-up tool; while set, left-drag edits instead of panning. */
    touchUpTool?: TouchUpTool | null;
    touchUpColor?: string;
    touchUpBrushSize?: number;
    touchUpTextSize?: number;
    /**
     * Receives the edited full-resolution PNG after each committed edit and
     * returns the object URL it was published under, so the preview can keep
     * its live canvases when that same URL comes back as the new imageSrc.
     */
    onTouchUpCommit?: (blob: Blob) => string | void;
    onTouchUpPickColor?: (hex: string) => void;
    /** Called when the user presses Escape while a tool is active. */
    onTouchUpExit?: () => void;
}

interface ActiveTouchStroke {
    pointerId: number;
    lastPoint: { x: number; y: number } | null;
    spans: ReturnType<typeof brushSpans>;
    rgba: [number, number, number, number];
    /** CPU-side working copy of the image; stamped in JS, blitted per event. */
    buffer: ImageData;
    changed: boolean;
    /** Pending region of `buffer` not yet blitted to the offscreen canvases. */
    dirty: { x0: number; y0: number; x1: number; y1: number } | null;
}

/** In-progress text placement, in image-pixel coordinates. */
interface TextDraft {
    /** Monotonic id so a freshly placed box grabs keyboard focus once. */
    id: number;
    x: number;
    y: number;
    /** Wrap width of the box in image pixels. */
    width: number;
    text: string;
}

const CanvasPreview = forwardRef<CanvasPreviewHandle, Props>(
    (
        {
            imageSrc,
            isCropMode,
            showCheckerboard,
            adjustments,
            onCropSelectionChange,
            touchUpTool,
            touchUpColor,
            touchUpBrushSize,
            touchUpTextSize,
            onTouchUpCommit,
            onTouchUpPickColor,
            onTouchUpExit,
        },
        ref
    ) => {
        const canvasRef = useRef<HTMLCanvasElement | null>(null);
        const previewContainerRef = useRef<HTMLDivElement | null>(null);
        const imgRef = useRef<HTMLImageElement | null>(null);
        const zoomRef = useRef<number>(1);
        const [zoomState, setZoomState] = useState<number>(1);
        const [imageLoaded, setImageLoaded] = useState<boolean>(false);
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
        const [hasValidCropSelection, setHasValidCropSelection] = useState(false);
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
        const mountedRef = useRef(true);
        const imageLoadGenerationRef = useRef(0);
        const activeTouchStrokeRef = useRef<ActiveTouchStroke | null>(null);
        // Object URLs of our own pending commits. When one of them arrives back
        // as imageSrc, the live canvases already hold exactly those pixels and
        // are kept as-is — drawing never blocks on the round trip.
        const selfCommitSrcsRef = useRef<Set<string>>(new Set());
        // Bumped only when the image is replaced from outside the touch-up
        // tools (undo, quantize, crop, …); invalidates in-flight commits.
        const externalImageGenerationRef = useRef(0);
        const touchUpCommitChainRef = useRef<Promise<void>>(Promise.resolve());
        const onTouchUpCommitRef = useRef(onTouchUpCommit);
        onTouchUpCommitRef.current = onTouchUpCommit;

        const hasAdjustments = useMemo(
            () => !!adjustments && !isAllDefault(adjustments),
            [adjustments]
        );
        const adjustmentsSig = useMemo(
            () => (hasAdjustments && adjustments ? JSON.stringify(adjustments) : ''),
            [adjustments, hasAdjustments]
        );

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
            // Prefer the live offscreen canvas dimensions: while a committed
            // touch-up edit's image is still loading, the original canvas is
            // the source of truth and keeps the preview from blanking out.
            const original = originalCanvasRef.current;
            const iw = original?.width || img.naturalWidth;
            const ih = original?.height || img.naturalHeight;
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
            if (hasAdjustments) {
                const sig = adjustmentsSig;
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
                            const adjData = applyAdjustments(imgData, adjustments ?? {});
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
        }, [adjustments, adjustmentsSig, hasAdjustments]);

        const drawRafRef = useRef<number | null>(null);
        const requestDraw = useCallback(() => {
            if (drawRafRef.current !== null) return;
            drawRafRef.current = requestAnimationFrame(() => {
                drawRafRef.current = null;
                drawToCanvas();
            });
        }, [drawToCanvas]);

        // list of pending resolvers that callers can await via waitForNextDraw
        const drawWaitersRef = useRef<Array<() => void>>([]);

        const computeImageLayout = () => {
            const container = previewContainerRef.current;
            const img = imgRef.current;
            if (!container || !img) return null;
            const cw = container.clientWidth;
            const ch = container.clientHeight;
            // Same fallback as drawToCanvas: the offscreen canvas keeps layout
            // (and tool coordinates) stable while a committed edit reloads.
            const original = originalCanvasRef.current;
            const iw = original?.width || img.naturalWidth;
            const ih = original?.height || img.naturalHeight;
            if (!iw || !ih) return null;
            const baseScale = Math.min(cw / iw, ch / ih);
            const dw = iw * baseScale;
            const dh = ih * baseScale;
            const dx = (cw - dw) / 2;
            const dy = (ch - dh) / 2;
            return { baseScale, dx, dy, dw, dh, cw, ch, iw, ih };
        };

        useEffect(() => {
            const loadGeneration = ++imageLoadGenerationRef.current;
            // Our own commits come back with canvases already holding exactly
            // these pixels; keep the canvases (and any in-progress stroke)
            // untouched so drawing stays continuous across history commits.
            const isSelfCommit = !!imageSrc && selfCommitSrcsRef.current.delete(imageSrc);
            if (!isSelfCommit) {
                selfCommitSrcsRef.current.clear();
                externalImageGenerationRef.current += 1;
                activeTouchStrokeRef.current = null;
                // A text draft's coordinates belong to the replaced image.
                if (textDraftRef.current) setTextDraft(null);
            }

            if (!imageSrc) {
                imgRef.current = null;
                originalCanvasRef.current = null;
                processedCanvasRef.current = null;
                setImageLoaded(false);
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
            if (!isSelfCommit && container && imgRef.current) {
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
            if (!isSelfCommit) setImageLoaded(false); // Reset loading state
            img.onload = () => {
                if (
                    !mountedRef.current ||
                    loadGeneration !== imageLoadGenerationRef.current ||
                    imgRef.current !== img
                ) {
                    return;
                }
                if (isSelfCommit) {
                    // The img element only feeds the export helpers here; the
                    // offscreen canvases already show exactly these pixels.
                    setImageLoaded(true);
                    drawToCanvas();
                    return;
                }
                // preserve current zoom (don't reset) and try to restore the
                // same image coordinate under the container center so the view
                // doesn't jump when swapping the image source.
                const iw = img.naturalWidth;
                const ih = img.naturalHeight;
                if (iw && ih) {
                    setImageLoaded(true); // Image is now loaded
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
            img.onerror = () => {
                if (
                    !mountedRef.current ||
                    loadGeneration !== imageLoadGenerationRef.current ||
                    imgRef.current !== img
                ) {
                    return;
                }
                setImageLoaded(false);
            };
            img.src = imageSrc;
            return () => {
                img.onload = null;
                img.onerror = null;
                if (imageLoadGenerationRef.current === loadGeneration) {
                    imageLoadGenerationRef.current += 1;
                }
                if (imgRef.current === img) imgRef.current = null;
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

        // update hasValidCropSelection when selection changes
        useEffect(() => {
            const img = imgRef.current;
            const sel = selectionRef.current;
            if (!img || !sel) {
                setHasValidCropSelection(false);
                onCropSelectionChange?.(false);
                return;
            }
            const layout = computeImageLayout();
            const isValid = !!layout;
            setHasValidCropSelection(isValid);
            onCropSelectionChange?.(isValid);
        }, [selection, onCropSelectionChange]);

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

        // === 2D touch-up tools ===

        const touchUpActive = !!touchUpTool && !isCropMode && imageLoaded;
        const showBrushOutline =
            touchUpActive && (touchUpTool === 'brush' || touchUpTool === 'eraser');
        const brushOutlineRef = useRef<HTMLDivElement | null>(null);
        const onTouchUpExitRef = useRef(onTouchUpExit);
        onTouchUpExitRef.current = onTouchUpExit;

        // In-progress text placement: edited directly on the image, movable,
        // and width-resizable (word wrap), then rasterized on commit.
        const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
        const textDraftRef = useRef(textDraft);
        textDraftRef.current = textDraft;
        const textDraftIdRef = useRef(0);
        const textDraftBoxRef = useRef<HTMLDivElement | null>(null);
        const textDraftAreaRef = useRef<HTMLTextAreaElement | null>(null);
        const commitTextDraftRef = useRef<() => void>(() => {});
        const syncTextDraftGeometryRef = useRef<() => void>(() => {});
        const touchUpFontSize = Math.max(4, Math.round(touchUpTextSize ?? 24));
        const TEXT_DRAFT_LINE_HEIGHT = 1.25;

        useEffect(() => {
            if (!touchUpTool) return;
            const onKey = (e: KeyboardEvent) => {
                if (e.key !== 'Escape') return;
                // First Escape discards an open text draft, second exits the tool.
                if (textDraftRef.current) {
                    setTextDraft(null);
                    return;
                }
                onTouchUpExitRef.current?.();
            };
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [touchUpTool]);

        // Leaving the text tool (or entering crop) commits whatever was typed
        // instead of silently dropping it.
        useEffect(() => {
            if (touchUpTool === 'text' && !isCropMode) return;
            if (textDraftRef.current) commitTextDraftRef.current();
        }, [touchUpTool, isCropMode]);

        const clientToImagePixel = (clientX: number, clientY: number) => {
            const container = previewContainerRef.current;
            const layout = computeImageLayout();
            if (!container || !layout) return null;
            const rect = container.getBoundingClientRect();
            const scale = layout.baseScale * (zoomRef.current || 1);
            return {
                x: Math.floor((clientX - rect.left - (offsetRef.current.x + layout.dx)) / scale),
                y: Math.floor((clientY - rect.top - (offsetRef.current.y + layout.dy)) / scale),
                scale,
            };
        };

        const isInsideImage = (x: number, y: number) => {
            const original = originalCanvasRef.current;
            return !!original && x >= 0 && y >= 0 && x < original.width && y < original.height;
        };

        // Invalidate the adjustments cache so the next draw recomputes the
        // processed canvas from the freshly edited original.
        const invalidateProcessedCache = () => {
            processedCanvasRef.current = null;
            lastAdjSigRef.current = '';
        };

        // Stamps one stroke point into the CPU buffer (no canvas readbacks)
        // and grows the pending dirty rect by the stamp's clamped bounding box.
        const stampStrokePoint = (stroke: ActiveTouchStroke, x: number, y: number) => {
            if (!stampSpansIntoSurface(stroke.buffer, x, y, stroke.spans, stroke.rgba)) return;
            stroke.changed = true;

            let x0 = x;
            let x1 = x;
            let y0 = y;
            let y1 = y;
            for (const span of stroke.spans) {
                if (x + span.dx0 < x0) x0 = x + span.dx0;
                if (x + span.dx1 > x1) x1 = x + span.dx1;
                if (y + span.dy < y0) y0 = y + span.dy;
                if (y + span.dy > y1) y1 = y + span.dy;
            }
            x0 = Math.max(0, x0);
            y0 = Math.max(0, y0);
            x1 = Math.min(stroke.buffer.width - 1, x1);
            y1 = Math.min(stroke.buffer.height - 1, y1);
            if (x1 < x0 || y1 < y0) return;

            const dirty = stroke.dirty;
            if (!dirty) {
                stroke.dirty = { x0, y0, x1, y1 };
            } else {
                dirty.x0 = Math.min(dirty.x0, x0);
                dirty.y0 = Math.min(dirty.y0, y0);
                dirty.x1 = Math.max(dirty.x1, x1);
                dirty.y1 = Math.max(dirty.y1, y1);
            }
        };

        // Blits the pending buffer region onto the offscreen canvases.
        // putImageData writes raw RGBA (including transparent pixels), which
        // is exactly right for hard-edged edits; the processed canvas gets the
        // same raw pixels so live feedback survives active adjustments, and a
        // single recompute at commit time reconciles the adjusted view.
        const blitStrokeDirty = (stroke: ActiveTouchStroke) => {
            const dirty = stroke.dirty;
            if (!dirty) return;
            stroke.dirty = null;
            const w = dirty.x1 - dirty.x0 + 1;
            const h = dirty.y1 - dirty.y0 + 1;
            for (const canvas of [originalCanvasRef.current, processedCanvasRef.current]) {
                const ctx = canvas?.getContext('2d');
                if (!ctx) continue;
                ctx.putImageData(stroke.buffer, 0, 0, dirty.x0, dirty.y0, w, h);
            }
            requestDraw();
        };

        // Commits are serialized so rapid strokes land in history in order.
        // Drawing never waits on a commit: the offscreen canvases stay the
        // source of truth, and the imageSrc round trip is absorbed by the
        // self-commit fast path in the image-loading effect.
        const queueTouchUpCommit = () => {
            const externalGeneration = externalImageGenerationRef.current;
            touchUpCommitChainRef.current = touchUpCommitChainRef.current.then(async () => {
                const original = originalCanvasRef.current;
                const commitCallback = onTouchUpCommitRef.current;
                if (!original || !commitCallback || !mountedRef.current) return;
                // The image was replaced from outside (undo, quantize, …)
                // after this edit was made — the edit is gone by design.
                if (externalImageGenerationRef.current !== externalGeneration) return;

                const blob = await new Promise<Blob | null>((resolve) =>
                    original.toBlob((result) => resolve(result), 'image/png')
                );
                if (
                    !mountedRef.current ||
                    externalImageGenerationRef.current !== externalGeneration
                ) {
                    return;
                }
                if (blob) {
                    const url = commitCallback(blob);
                    if (typeof url === 'string') selfCommitSrcsRef.current.add(url);
                } else {
                    // Encoding failed — restore the canvases from the last
                    // committed image so the preview matches the history.
                    const img = imgRef.current;
                    const octx = original.getContext('2d');
                    if (img && octx) {
                        octx.clearRect(0, 0, original.width, original.height);
                        octx.imageSmoothingEnabled = false;
                        octx.drawImage(img, 0, 0);
                    }
                }
                // One recompute per commit keeps the adjusted preview exact
                // without paying for it on every pointer move.
                invalidateProcessedCache();
                requestDraw();
            });
        };

        // Rasterizes the draft box: canvas-measured word wrap at the draft
        // width, hardened to the exact tool color, drawn at the box origin.
        const commitTextDraft = () => {
            const draft = textDraftRef.current;
            setTextDraft(null);
            if (!draft || !draft.text.trim()) return;
            const rgb = parseHexColor(touchUpColor ?? '#000000');
            if (!rgb) return;
            const original = originalCanvasRef.current;
            const octx = original?.getContext('2d');
            if (!original || !octx) return;

            const fontSize = touchUpFontSize;
            const lineHeight = Math.round(fontSize * TEXT_DRAFT_LINE_HEIGHT);
            const font = `bold ${fontSize}px sans-serif`;
            const scratch = document.createElement('canvas');
            const measureCtx = scratch.getContext('2d');
            if (!measureCtx) return;
            measureCtx.font = font;
            const lines = wrapTextLines(draft.text, draft.width, (s) =>
                measureCtx.measureText(s).width
            );
            scratch.width = Math.max(1, Math.ceil(draft.width) + 2);
            scratch.height = Math.max(1, lines.length * lineHeight + 2);
            const sctx = scratch.getContext('2d');
            if (!sctx) return;
            // Resizing the canvas reset the context state — set font again.
            sctx.font = font;
            sctx.textBaseline = 'top';
            const baselinePad = Math.round((lineHeight - fontSize) / 2);
            lines.forEach((line, index) => {
                if (line) sctx.fillText(line, 1, 1 + index * lineHeight + baselinePad);
            });
            // Harden anti-aliased glyph edges to the exact target color so
            // text does not leak blended colors into the palette.
            const stamp = sctx.getImageData(0, 0, scratch.width, scratch.height);
            hardenAlphaToColor(stamp.data, rgb);
            sctx.putImageData(stamp, 0, 0);
            for (const canvas of [originalCanvasRef.current, processedCanvasRef.current]) {
                const ctx = canvas?.getContext('2d');
                if (!ctx) continue;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(scratch, draft.x - 1, draft.y - 1);
            }
            requestDraw();
            queueTouchUpCommit();
        };
        commitTextDraftRef.current = commitTextDraft;

        // Positions the draft box over its image-pixel rect. Applied outside
        // React so panning and zooming keep the box glued to the image.
        const syncTextDraftGeometry = () => {
            const el = textDraftBoxRef.current;
            const draft = textDraftRef.current;
            if (!el || !draft) return;
            const layout = computeImageLayout();
            if (!layout) return;
            const scale = layout.baseScale * (zoomRef.current || 1);
            el.style.left = `${draft.x * scale + offsetRef.current.x + layout.dx}px`;
            el.style.top = `${draft.y * scale + offsetRef.current.y + layout.dy}px`;
            el.style.width = `${draft.width * scale}px`;
            el.style.fontSize = `${touchUpFontSize * scale}px`;
            const area = textDraftAreaRef.current;
            if (area) {
                // Grow the textarea to its wrapped content.
                area.style.height = '0px';
                area.style.height = `${Math.max(area.scrollHeight, touchUpFontSize * scale * TEXT_DRAFT_LINE_HEIGHT)}px`;
            }
        };
        syncTextDraftGeometryRef.current = syncTextDraftGeometry;

        useEffect(() => {
            syncTextDraftGeometryRef.current();
        });

        // A freshly placed draft box grabs keyboard focus so typing starts
        // immediately after the click.
        useEffect(() => {
            if (textDraft?.id) textDraftAreaRef.current?.focus();
        }, [textDraft?.id]);

        // Dragging the move handle repositions the box; dragging the right
        // edge changes its wrap width. Both are in image-pixel space.
        const startTextDraftDrag = (
            e: React.PointerEvent,
            mode: 'move' | 'resize'
        ) => {
            const draft = textDraftRef.current;
            if (!draft || e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            const startClientX = e.clientX;
            const startClientY = e.clientY;
            const start = { x: draft.x, y: draft.y, width: draft.width };
            const original = originalCanvasRef.current;
            const iw = original?.width ?? draft.width;
            const ih = original?.height ?? 0;

            const onMove = (ev: PointerEvent) => {
                const layout = computeImageLayout();
                if (!layout) return;
                const scale = layout.baseScale * (zoomRef.current || 1);
                const dxImg = (ev.clientX - startClientX) / scale;
                const dyImg = (ev.clientY - startClientY) / scale;
                setTextDraft((current) => {
                    if (!current) return current;
                    if (mode === 'move') {
                        return {
                            ...current,
                            x: Math.round(
                                Math.max(
                                    -current.width + 8,
                                    Math.min(iw - 8, start.x + dxImg)
                                )
                            ),
                            y: Math.round(
                                Math.max(
                                    -touchUpFontSize,
                                    Math.min(ih - 4, start.y + dyImg)
                                )
                            ),
                        };
                    }
                    const minWidth = Math.max(16, touchUpFontSize * 2);
                    return {
                        ...current,
                        width: Math.round(
                            Math.max(minWidth, Math.min(iw, start.width + dxImg))
                        ),
                    };
                });
            };
            const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        };

        const onTouchUpPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
            const tool = touchUpTool;
            if (!tool || !touchUpActive || e.button !== 0) return;
            const original = originalCanvasRef.current;
            const octx = original?.getContext('2d');
            if (!original || !octx) return;
            const pt = clientToImagePixel(e.clientX, e.clientY);
            if (!pt || !isInsideImage(pt.x, pt.y)) return;

            e.preventDefault();

            if (tool === 'brush' || tool === 'eraser') {
                const rgb = tool === 'eraser' ? null : parseHexColor(touchUpColor ?? '#000000');
                if (tool === 'brush' && !rgb) return;
                // One readback per stroke: every stamp afterwards works on this
                // CPU buffer and is blitted back with putImageData.
                const stroke: ActiveTouchStroke = {
                    pointerId: e.pointerId,
                    lastPoint: { x: pt.x, y: pt.y },
                    spans: brushSpans(touchUpBrushSize ?? 1),
                    rgba: rgb ? [rgb[0], rgb[1], rgb[2], 255] : [0, 0, 0, 0],
                    buffer: octx.getImageData(0, 0, original.width, original.height),
                    changed: false,
                    dirty: null,
                };
                stampStrokePoint(stroke, pt.x, pt.y);
                blitStrokeDirty(stroke);
                activeTouchStrokeRef.current = stroke;
                e.currentTarget.setPointerCapture(e.pointerId);
                return;
            }

            if (tool === 'picker') {
                const pixel = octx.getImageData(pt.x, pt.y, 1, 1).data;
                if (pixel[3] > 0) onTouchUpPickColor?.(rgbToHex(pixel[0], pixel[1], pixel[2]));
                return;
            }

            if (tool === 'fill') {
                const rgb = parseHexColor(touchUpColor ?? '#000000');
                if (!rgb) return;
                const surface = octx.getImageData(0, 0, original.width, original.height);
                if (!floodFill(surface, pt.x, pt.y, [rgb[0], rgb[1], rgb[2], 255])) return;
                octx.putImageData(surface, 0, 0);
                const pctx = processedCanvasRef.current?.getContext('2d');
                if (pctx) pctx.putImageData(surface, 0, 0);
                requestDraw();
                queueTouchUpCommit();
                return;
            }

            if (tool === 'text') {
                // Clicking outside an open draft commits it, then a fresh box
                // opens at the click point and takes keyboard focus.
                if (textDraftRef.current) commitTextDraft();
                const iw = original.width;
                const ih = original.height;
                const minWidth = Math.max(16, touchUpFontSize * 2);
                const width = Math.max(minWidth, Math.min(iw - pt.x, Math.round(iw * 0.4)));
                setTextDraft({
                    id: ++textDraftIdRef.current,
                    x: Math.max(0, Math.min(iw - minWidth, pt.x)),
                    y: Math.max(0, Math.min(ih - touchUpFontSize, pt.y)),
                    width,
                    text: '',
                });
            }
        };

        const onTouchUpPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
            const stroke = activeTouchStrokeRef.current;
            if (!stroke || stroke.pointerId !== e.pointerId) return;
            e.preventDefault();

            const pt = clientToImagePixel(e.clientX, e.clientY);
            if (!pt) return;
            // Points outside the image are stamped too (clipped per span) so a
            // fast stroke across the image edge stays connected.
            const points = stroke.lastPoint
                ? strokeLinePoints(stroke.lastPoint.x, stroke.lastPoint.y, pt.x, pt.y)
                : [[pt.x, pt.y] as [number, number]];
            for (const [x, y] of points) stampStrokePoint(stroke, x, y);
            stroke.lastPoint = { x: pt.x, y: pt.y };
            blitStrokeDirty(stroke);
        };

        const finishTouchUpStroke = (e: React.PointerEvent<HTMLDivElement>) => {
            const stroke = activeTouchStrokeRef.current;
            if (!stroke || stroke.pointerId !== e.pointerId) return;

            activeTouchStrokeRef.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
            blitStrokeDirty(stroke);
            if (stroke.changed) queueTouchUpCommit();
        };

        // Size-accurate hover outline for brush/eraser, updated via direct DOM
        // writes on pointermove to avoid re-rendering per pointer event.
        const updateBrushOutline = (clientX: number, clientY: number) => {
            const el = brushOutlineRef.current;
            if (!el) return;
            const pt = clientToImagePixel(clientX, clientY);
            const layout = computeImageLayout();
            if (!pt || !layout || !isInsideImage(pt.x, pt.y)) {
                el.style.display = 'none';
                return;
            }
            const size = Math.max(1, Math.floor(touchUpBrushSize ?? 1));
            const originX = pt.x - Math.floor((size - 1) / 2);
            const originY = pt.y - Math.floor((size - 1) / 2);
            el.style.display = 'block';
            el.style.left = `${originX * pt.scale + offsetRef.current.x + layout.dx}px`;
            el.style.top = `${originY * pt.scale + offsetRef.current.y + layout.dy}px`;
            el.style.width = `${size * pt.scale}px`;
            el.style.height = `${size * pt.scale}px`;
        };

        const hideBrushOutline = () => {
            const el = brushOutlineRef.current;
            if (el) el.style.display = 'none';
        };

        const startPan = (e: React.MouseEvent) => {
            // prevent browser's native drag behavior when dragging quickly
            e.preventDefault();
            if (e.button === 0 && touchUpActive) {
                return;
            }
            // Middle-drag always pans, so the view stays movable with a tool active.
            if (e.button !== 0 && e.button !== 1) return;
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
                // Keep the text draft box glued to the image while panning.
                syncTextDraftGeometryRef.current();
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

        const selectionRafRef = useRef<number | null>(null);
        const pendingSelectionRef = useRef<null | { x: number; y: number; w: number; h: number }>(
            null
        );
        const scheduleSelection = (next: { x: number; y: number; w: number; h: number }) => {
            pendingSelectionRef.current = next;
            if (selectionRafRef.current !== null) return;
            selectionRafRef.current = requestAnimationFrame(() => {
                selectionRafRef.current = null;
                if (pendingSelectionRef.current) {
                    setSelection(pendingSelectionRef.current);
                    pendingSelectionRef.current = null;
                }
            });
        };
        const flushPendingSelection = () => {
            if (selectionRafRef.current !== null) {
                cancelAnimationFrame(selectionRafRef.current);
                selectionRafRef.current = null;
            }
            if (pendingSelectionRef.current) {
                setSelection(pendingSelectionRef.current);
                pendingSelectionRef.current = null;
            }
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
                    scheduleSelection({
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
                    scheduleSelection({ x: nx, y: ny, w: nw, h: nh });
                }
            };

            const onUp = () => {
                draggingRef.current = null;
                flushPendingSelection();
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        };

        useEffect(() => {
            const container = previewContainerRef.current;
            if (!container) return;
            const ro = new ResizeObserver(() => requestDraw());
            ro.observe(container);
            window.addEventListener('resize', requestDraw);

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
                window.removeEventListener('resize', requestDraw);
                container.removeEventListener('wheel', wrapper as EventListener);
            };
        }, [requestDraw]);

        // Trigger redraw when adjustments object changes
        useEffect(() => {
            requestDraw();
        }, [adjustmentsSig, requestDraw]);

        useEffect(() => {
            mountedRef.current = true;
            return () => {
                mountedRef.current = false;
                imageLoadGenerationRef.current += 1;
                externalImageGenerationRef.current += 1;
                activeTouchStrokeRef.current = null;
                originalCanvasRef.current = null;
                processedCanvasRef.current = null;
                if (drawRafRef.current !== null) {
                    cancelAnimationFrame(drawRafRef.current);
                    // Reset so requestDraw works again after a StrictMode
                    // remount; a stale id here permanently gates scheduling.
                    drawRafRef.current = null;
                }
                if (selectionRafRef.current !== null) {
                    cancelAnimationFrame(selectionRafRef.current);
                    selectionRafRef.current = null;
                }
            };
        }, []);

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
            hasValidCropSelection: (): boolean => {
                return hasValidCropSelection;
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
            exportAdjustedImageBlob: async (
                adjustmentsOverride?: Record<string, number>
            ): Promise<Blob | null> => {
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

                let source = originalCanvasRef.current;
                if (!source) {
                    source = document.createElement('canvas');
                    source.width = iw;
                    source.height = ih;
                    const sourceCtx = source.getContext('2d');
                    if (!sourceCtx) return null;
                    sourceCtx.imageSmoothingEnabled = false;
                    sourceCtx.drawImage(img, 0, 0, iw, ih);
                }
                const sourceCtx = source.getContext('2d');
                if (!sourceCtx) return null;
                const sourceData = sourceCtx.getImageData(0, 0, iw, ih);
                const values = adjustmentsOverride ?? adjustments ?? {};
                ctx.putImageData(
                    isAllDefault(values) ? sourceData : applyAdjustments(sourceData, values),
                    0,
                    0
                );
                return await new Promise<Blob | null>((resolve) =>
                    canvas.toBlob((b) => resolve(b), 'image/png')
                );
            },
        }));

        return (
            <div
                ref={previewContainerRef}
                className="w-full h-full relative overflow-hidden bg-background"
                onPointerDown={onTouchUpPointerDown}
                onPointerMove={(e) => {
                    onTouchUpPointerMove(e);
                    if (showBrushOutline) updateBrushOutline(e.clientX, e.clientY);
                }}
                onPointerUp={finishTouchUpStroke}
                onPointerCancel={finishTouchUpStroke}
                onPointerLeave={showBrushOutline ? hideBrushOutline : undefined}
                onMouseDown={startPan}
                onDragStart={(e) => e.preventDefault()}
                style={{
                    ...(showCheckerboard
                        ? {
                              background:
                                  'repeating-conic-gradient(rgba(255,255,255,0.1) 0% 25%, rgba(0,0,0,0.1) 0% 50%) 50% / 16px 16px',
                          }
                        : null),
                    ...(touchUpActive
                        ? {
                              cursor: touchUpTool === 'text' ? 'text' : 'crosshair',
                              touchAction: 'none',
                          }
                        : null),
                }}
            >
                <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
                {showBrushOutline ? (
                    <div
                        ref={brushOutlineRef}
                        className="absolute pointer-events-none rounded-full border border-white mix-blend-difference"
                        style={{ display: 'none' }}
                        aria-hidden
                    />
                ) : null}
                {touchUpActive && touchUpTool === 'text' && textDraft ? (
                    <div
                        ref={textDraftBoxRef}
                        className="absolute z-20"
                        data-testid="touchup-text-draft"
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="absolute -top-8 left-0 flex items-center gap-0.5 rounded-md border border-border/40 bg-card p-0.5 shadow-md select-none">
                            <button
                                type="button"
                                title="Drag to move the text"
                                aria-label="Move text"
                                onPointerDown={(e) => startTextDraftDrag(e, 'move')}
                                className="h-6 w-6 flex items-center justify-center rounded cursor-move text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <Move className="w-3.5 h-3.5" />
                            </button>
                            <button
                                type="button"
                                title="Apply text (Ctrl+Enter)"
                                aria-label="Apply text"
                                data-testid="touchup-text-apply"
                                onClick={commitTextDraft}
                                className="h-6 w-6 flex items-center justify-center rounded cursor-pointer text-primary hover:bg-accent"
                            >
                                <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                                type="button"
                                title="Discard text (Esc)"
                                aria-label="Discard text"
                                onClick={() => setTextDraft(null)}
                                className="h-6 w-6 flex items-center justify-center rounded cursor-pointer text-muted-foreground hover:bg-accent hover:text-destructive"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <textarea
                            ref={textDraftAreaRef}
                            value={textDraft.text}
                            onChange={(e) => {
                                const value = e.target.value;
                                setTextDraft((current) =>
                                    current ? { ...current, text: value } : current
                                );
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();
                                    commitTextDraft();
                                }
                            }}
                            placeholder="Type…"
                            aria-label="Text to place on the image"
                            spellCheck={false}
                            className="block w-full resize-none overflow-hidden bg-transparent outline-none border border-dashed border-white/80 mix-blend-normal placeholder:text-white/40"
                            style={{
                                color: touchUpColor,
                                fontFamily: 'sans-serif',
                                fontWeight: 700,
                                lineHeight: TEXT_DRAFT_LINE_HEIGHT,
                                padding: 0,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                caretColor: 'white',
                            }}
                        />
                        <div
                            title="Drag to change the wrap width"
                            aria-label="Resize text box"
                            onPointerDown={(e) => startTextDraftDrag(e, 'resize')}
                            className="absolute top-0 -right-1.5 h-full w-1.5 cursor-ew-resize rounded bg-primary/70 hover:bg-primary"
                        />
                    </div>
                ) : null}
                {/* small HUD showing image size and crop size (when active) */}
                {imageLoaded && imgRef.current ? (
                    <div
                        className="absolute top-2 left-2 z-40 px-2 py-1 rounded-full bg-background/90 text-primary text-xs font-mono font-semibold shadow-sm"
                        aria-hidden
                    >
                        {(() => {
                            const img = imgRef.current!;
                            const iw = originalCanvasRef.current?.width || img.naturalWidth;
                            const ih = originalCanvasRef.current?.height || img.naturalHeight;
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
                            className="crop-box text-primary"
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
                                className="corner nw bg-primary"
                                data-handle="nw"
                                onMouseDown={onSelectionPointerDown}
                            />
                            <div
                                className="corner ne bg-primary"
                                data-handle="ne"
                                onMouseDown={onSelectionPointerDown}
                            />
                            <div
                                className="corner sw bg-primary"
                                data-handle="sw"
                                onMouseDown={onSelectionPointerDown}
                            />
                            <div
                                className="corner se bg-primary"
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
