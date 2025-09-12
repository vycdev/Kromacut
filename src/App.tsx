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
import { PALETTES } from "./data/palettes";

function App(): React.ReactElement | null {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [past, setPast] = useState<string[]>([]);
    const [future, setFuture] = useState<string[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [weight, setWeight] = useState<number>(4);
    const [algorithm, setAlgorithm] = useState<string>("kmeans");
    const [swatches, setSwatches] = useState<string[]>([]);
    // sampled/exact counters removed from UI; counts still computed locally
    // inside updateSwatches but we don't expose them in state now.
    // cap how many swatches we display (independent from weight used for quantizers)
    const SWATCH_CAP = 2 ** 14;
    // PALETTES imported from src/data/palettes.ts

    const [selectedPalette, setSelectedPalette] = useState<string>("auto");

    // keep selectedPalette in sync with manual changes to the numeric color input
    useEffect(() => {
        const matched = PALETTES.find(
            (p) => p.id !== "auto" && p.size === weight
        );
        setSelectedPalette(matched ? matched.id : "auto");
    }, [weight]);
    // helper to convert rgb -> hsl used for swatch sorting
    const rgbToHsl = (r: number, g: number, b: number) => {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        let s = 0;
        const l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
            }
            h = h * 60;
        }
        return { h, s, l };
    };

    // guard to cancel stale async swatch computations
    const swatchRunRef = useRef(0);

    // wrapper to change imageSrc while invalidating any in-flight swatch scans
    const setImageSrcAndInvalidate = (u: string | null) => {
        // bump run id so any running updateSwatches will no-op when they resume
        swatchRunRef.current++;
        // hide indicator immediately
        setSwatchesLoading(false);
        setImageSrc(u);
    };

    // loading indicator state for swatch computation (show immediately)
    const [swatchesLoading, setSwatchesLoading] = useState(false);

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
        setImageSrcAndInvalidate(url);
        // swatches will be recomputed by the imageSrc effect; no manual call here
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
            setImageSrcAndInvalidate(null);
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

    // NOTE: computeSwatchesFromCanvas removed. Swatches are computed from
    // imageSrc via updateSwatches so they always represent the exact set of
    // distinct colors present in the canonical image data.

    const updateSwatches = async () => {
        // if there's no image, cancel any in-flight scans and ensure nothing shows loading
        if (!imageSrc) {
            swatchRunRef.current++;
            setSwatches([]);
            setSwatchesLoading(false);
            return;
        }

        // mark a new run so earlier async runs will no-op when they finish
        const runId = ++swatchRunRef.current;
        // start fresh and show loading indicator immediately
        setSwatches([]);
        setSwatchesLoading(true);

        try {
            // Load the current imageSrc directly (it may be a blob: URL)
            const img = await new Promise<HTMLImageElement>(
                (resolve, reject) => {
                    const i = new Image();
                    i.onload = () => resolve(i);
                    i.onerror = () => reject(new Error("image load failed"));
                    i.src = imageSrc;
                }
            );

            const w = img.naturalWidth;
            const h = img.naturalHeight;

            // Tiled scan to avoid creating huge canvases for very large images.
            // tileSize chosen for reasonable memory and perf on main thread.
            const TILE = 1024;
            const map = new Map<number, number>();

            const tile = document.createElement("canvas");
            const tctx = tile.getContext("2d", { willReadFrequently: true });
            if (!tctx) return;

            for (let y = 0; y < h; y += TILE) {
                for (let x = 0; x < w; x += TILE) {
                    const sw = Math.min(TILE, w - x);
                    const sh = Math.min(TILE, h - y);
                    tile.width = sw;
                    tile.height = sh;
                    // draw the region of the source image into the tile canvas
                    tctx.clearRect(0, 0, sw, sh);
                    tctx.drawImage(img, x, y, sw, sh, 0, 0, sw, sh);
                    const data = tctx.getImageData(0, 0, sw, sh).data;
                    for (let i = 0; i < data.length; i += 4) {
                        const key =
                            (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
                        map.set(key, (map.get(key) || 0) + 1);
                    }
                }
                // yield to the event loop between rows to keep UI responsive
                await new Promise((r) => setTimeout(r, 0));
                // if another run started while we yielded, stop this one
                if (runId !== swatchRunRef.current) return;
            }

            // counts are intentionally not stored in React state (UI removed)

            // build sorted swatch list same as before
            const top = Array.from(map.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, Math.min(map.size, SWATCH_CAP))
                .map((entry) => {
                    const key = entry[0];
                    const r = (key >> 16) & 0xff;
                    const g = (key >> 8) & 0xff;
                    const b = key & 0xff;
                    const hex =
                        "#" +
                        [r, g, b]
                            .map((v) => v.toString(16).padStart(2, "0"))
                            .join("");
                    return { hex, freq: entry[1], hsl: rgbToHsl(r, g, b) };
                });

            top.sort((a, b) => {
                if (a.hsl.h !== b.hsl.h) return a.hsl.h - b.hsl.h;
                if (a.hsl.s !== b.hsl.s) return b.hsl.s - a.hsl.s;
                return b.hsl.l - a.hsl.l;
            });

            // hide indicator for this run
            if (swatchRunRef.current === runId) setSwatchesLoading(false);

            // only apply results if this run is still current
            if (runId === swatchRunRef.current)
                setSwatches(top.map((t) => t.hex));
        } catch (err) {
            console.warn("swatches: compute failed", err);
            // only clear if still current
            if (swatchRunRef.current === runId) {
                setSwatches([]);
                setSwatchesLoading(false);
            }
        }
    };

    useEffect(() => {
        // recalc when image source changes
        // always compute swatches from the current imageSrc so the UI
        // reflects the true distinct colors in the image (not the
        // current quantizer settings). updateSwatches will perform a
        // tiled, full-resolution scan for exact color counts.
        void updateSwatches();
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
                        {/* Palette selector: Auto + preset palettes (4/8/16/32) */}
                        <div className="controls-group">
                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    marginBottom: 8,
                                }}
                            >
                                Palette
                            </div>
                            <div
                                className="palette-list"
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                    // allow vertical scrolling when many palettes
                                    maxHeight: 200,
                                    overflowY: "auto",
                                    paddingRight: 4,
                                }}
                            >
                                {/* build small inline palette chooser using module-level PALETTES */}
                                {PALETTES.map((p) => {
                                    const active = p.id === selectedPalette;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => {
                                                // select palette
                                                setSelectedPalette(p.id);
                                                // Auto does not change numeric color input
                                                if (p.id !== "auto")
                                                    setWeight(p.size);
                                            }}
                                            title={
                                                p.id === "auto"
                                                    ? "Auto"
                                                    : `${p.size} colors`
                                            }
                                            style={{
                                                // stretch to group width with a small inner margin
                                                width: "100%",
                                                boxSizing: "border-box",
                                                justifyContent: "space-between",
                                                border: active
                                                    ? "2px solid #fff"
                                                    : "1px solid rgba(255,255,255,0.06)",
                                                padding: "8px 10px",
                                                background: "transparent",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 12,
                                                cursor: "pointer",
                                                borderRadius: 6,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: 4,
                                                }}
                                            >
                                                {p.id === "auto" ? (
                                                    <div
                                                        style={{
                                                            width: 36,
                                                            height: 20,
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                            justifyContent:
                                                                "center",
                                                            color: "#ddd",
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        Auto
                                                    </div>
                                                ) : (
                                                    p.colors
                                                        .slice(0, 8)
                                                        .map((c, i) => (
                                                            <div
                                                                key={i}
                                                                className="swatch"
                                                                style={{
                                                                    width: 12,
                                                                    height: 12,
                                                                    borderRadius: 2,
                                                                    background:
                                                                        c,
                                                                    border: "1px solid rgba(0,0,0,0.15)",
                                                                }}
                                                            />
                                                        ))
                                                )}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: 12,
                                                    color: "#ddd",
                                                }}
                                            >
                                                {p.id === "auto"
                                                    ? "Auto"
                                                    : `${p.size}`}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="controls-group">
                            <label>
                                Color
                                <input
                                    type="number"
                                    min={2}
                                    value={weight}
                                    onChange={(e) =>
                                        setWeight(
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
                                        // diagnostic helper: count unique colors in ImageData
                                        const countUnique = (
                                            imgd: ImageData
                                        ) => {
                                            const dd = imgd.data;
                                            const s = new Set<number>();
                                            for (
                                                let i = 0;
                                                i < dd.length;
                                                i += 4
                                            )
                                                s.add(
                                                    (dd[i] << 16) |
                                                        (dd[i + 1] << 8) |
                                                        dd[i + 2]
                                                );
                                            return s.size;
                                        };

                                        // call selected algorithm (mutates ImageData)
                                        if (algorithm === "median-cut") {
                                            medianCutImageData(data, weight);
                                        } else if (algorithm === "kmeans") {
                                            kmeansImageData(data, weight);
                                        } else if (algorithm === "octree") {
                                            octreeImageData(data, weight);
                                        } else if (algorithm === "wu") {
                                            wuImageData(data, weight);
                                        } else {
                                            posterizeImageData(data, weight);
                                        }
                                        // post-processing enforced inside each algorithm
                                        // log counts before/after for debugging
                                        console.log(
                                            "unique before:",
                                            countUnique(data)
                                        );
                                        console.log(
                                            "unique after:",
                                            countUnique(data)
                                        );
                                        ctx.putImageData(data, 0, 0);
                                        // compute and set immediate swatches from the quantized ImageData
                                        try {
                                            const dd = data.data;
                                            const cmap = new Map<
                                                number,
                                                number
                                            >();
                                            for (
                                                let i = 0;
                                                i < dd.length;
                                                i += 4
                                            ) {
                                                const k =
                                                    (dd[i] << 16) |
                                                    (dd[i + 1] << 8) |
                                                    dd[i + 2];
                                                cmap.set(
                                                    k,
                                                    (cmap.get(k) || 0) + 1
                                                );
                                            }
                                            const topLocal = Array.from(
                                                cmap.entries()
                                            )
                                                .sort((a, b) => b[1] - a[1])
                                                .slice(
                                                    0,
                                                    Math.min(
                                                        cmap.size,
                                                        SWATCH_CAP
                                                    )
                                                )
                                                .map((entry) => {
                                                    const key = entry[0];
                                                    const r =
                                                        (key >> 16) & 0xff;
                                                    const g = (key >> 8) & 0xff;
                                                    const b = key & 0xff;
                                                    const hex =
                                                        "#" +
                                                        [r, g, b]
                                                            .map((v) =>
                                                                v
                                                                    .toString(
                                                                        16
                                                                    )
                                                                    .padStart(
                                                                        2,
                                                                        "0"
                                                                    )
                                                            )
                                                            .join("");
                                                    return {
                                                        hex,
                                                        freq: entry[1],
                                                        hsl: rgbToHsl(r, g, b),
                                                    };
                                                });
                                            topLocal.sort((a, b) => {
                                                if (a.hsl.h !== b.hsl.h)
                                                    return a.hsl.h - b.hsl.h;
                                                if (a.hsl.s !== b.hsl.s)
                                                    return b.hsl.s - a.hsl.s;
                                                return b.hsl.l - a.hsl.l;
                                            });
                                            setSwatches(
                                                topLocal.map((t) => t.hex)
                                            );
                                        } catch (err) {
                                            console.warn(
                                                "compute immediate swatches failed",
                                                err
                                            );
                                        }
                                        // compute swatches directly from the quantized canvas so
                                        // the UI updates immediately and doesn't depend on the
                                        // preview redraw timing. If we successfully computed
                                        // these exact swatches we will skip the async sampled
                                        // preview-based update which can reintroduce blended
                                        // colors when downsampling.
                                        // remove immediate swatch computation here so the
                                        // swatches always reflect the canonical imageSrc
                                        // computed by updateSwatches(). If we need an
                                        // immediate preview later we can add a separate
                                        // UI affordance.
                                        const outBlob =
                                            await new Promise<Blob | null>(
                                                (res) =>
                                                    c.toBlob(
                                                        (b) => res(b),
                                                        "image/png"
                                                    )
                                            );
                                        // Load blob back into an image and count unique colors to
                                        // detect whether serialization changed pixels
                                        try {
                                            if (outBlob) {
                                                const checkImg =
                                                    await new Promise<HTMLImageElement | null>(
                                                        (resolve) => {
                                                            const i =
                                                                new Image();
                                                            i.onload = () =>
                                                                resolve(i);
                                                            i.onerror = () =>
                                                                resolve(null);
                                                            i.src =
                                                                URL.createObjectURL(
                                                                    outBlob
                                                                );
                                                        }
                                                    );
                                                if (checkImg) {
                                                    const vc =
                                                        document.createElement(
                                                            "canvas"
                                                        );
                                                    vc.width =
                                                        checkImg.naturalWidth;
                                                    vc.height =
                                                        checkImg.naturalHeight;
                                                    const vctx =
                                                        vc.getContext("2d");
                                                    if (vctx) {
                                                        vctx.drawImage(
                                                            checkImg,
                                                            0,
                                                            0
                                                        );
                                                        try {
                                                            URL.revokeObjectURL(
                                                                checkImg.src
                                                            );
                                                        } catch (err) {
                                                            console.warn(
                                                                "swatches: compute failed",
                                                                err
                                                            );
                                                            setSwatches([]);
                                                        }
                                                        const imgd =
                                                            vctx.getImageData(
                                                                0,
                                                                0,
                                                                vc.width,
                                                                vc.height
                                                            );
                                                        const afterBlobCount =
                                                            countUnique(imgd);
                                                        console.log(
                                                            "unique after blob:",
                                                            afterBlobCount
                                                        );
                                                    }
                                                }
                                            }
                                        } catch (err) {
                                            console.warn(
                                                "post-blob check failed",
                                                err
                                            );
                                        }
                                        if (!outBlob) return;

                                        // push current image into history
                                        if (imageSrc)
                                            setPast((p) =>
                                                imageSrc ? [...p, imageSrc] : p
                                            );
                                        const url =
                                            URL.createObjectURL(outBlob);
                                        setImageSrcAndInvalidate(url);
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
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                }}
                            >
                                <span>Color swatches</span>
                                <span className="swatch-count" aria-hidden>
                                    ({swatches.length})
                                </span>
                                {swatchesLoading ? (
                                    <span
                                        style={{
                                            fontSize: 12,
                                            color: "#ddd",
                                            marginLeft: 6,
                                        }}
                                    >
                                        Updating…
                                    </span>
                                ) : null}
                                {/* sampled/exact counts removed per user request */}
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
                                    swatches
                                        .slice(0, SWATCH_CAP)
                                        .map((c) => (
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
                                    setImageSrcAndInvalidate(prev || null);
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
                                    setImageSrcAndInvalidate(next || null);
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
                                            setImageSrcAndInvalidate(url);
                                            // swatches will be recomputed by the imageSrc effect
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
