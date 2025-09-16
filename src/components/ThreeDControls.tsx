import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import ThreeDColorRow from "./ThreeDColorRow";

type Swatch = { hex: string; a: number };

interface ThreeDControlsStateShape {
    layerHeight: number;
    baseSliceHeight: number;
    colorSliceHeights: number[];
    colorOrder: number[];
    filteredSwatches: Swatch[];
    pixelSize: number; // mm per pixel (XY)
}

interface ThreeDControlsProps {
    swatches: Swatch[] | null;
    onChange?: (state: ThreeDControlsStateShape) => void;
    onRebuild?: () => void;
    /**
     * Persisted state from a previous mount used to hydrate this component
     * when the user switches away from 3D mode and comes back later.
     */
    persisted?: ThreeDControlsStateShape | null;
}

export default function ThreeDControls({
    swatches,
    onChange,
    persisted,
    onRebuild,
}: ThreeDControlsProps) {
    // 3D printing controls (owned by this component)
    const [layerHeight, setLayerHeight] = useState<number>(
        persisted?.layerHeight ?? 0.12
    ); // mm
    const [baseSliceHeight, setBaseSliceHeight] = useState<number>(
        persisted?.baseSliceHeight ?? 0
    );
    const [colorSliceHeights, setColorSliceHeights] = useState<number[]>(
        persisted?.colorSliceHeights?.slice() ?? []
    );
    const [pixelSize, setPixelSize] = useState<number>(
        persisted?.pixelSize ?? 0.1
    ); // mm per pixel (XY plane)

    // derive non-transparent swatches once per render and memoize
    const filtered = useMemo(() => {
        return swatches ? swatches.filter((s) => s.a !== 0) : [];
    }, [swatches]);

    // ordering state: indices into `filtered` that control displayed order.
    const [colorOrder, setColorOrder] = useState<number[]>(
        persisted?.colorOrder?.slice() ?? []
    );
    const prevFilteredRef = useRef<Swatch[] | null>(
        persisted?.filteredSwatches ? persisted.filteredSwatches.slice() : null
    );
    const prevHeightsRef = useRef<number[]>(
        persisted?.colorSliceHeights ? persisted.colorSliceHeights.slice() : []
    );
    const prevOrderRef = useRef<number[]>(
        persisted?.colorOrder ? persisted.colorOrder.slice() : []
    );

    // guard so we only emit immediately after hydration if needed
    const hydratedRef = useRef<boolean>(false);
    useEffect(() => {
        if (persisted && !hydratedRef.current) {
            hydratedRef.current = true; // states already initialized from persisted above
        }
    }, [persisted]);

    // Ensure baseSliceHeight stays within valid bounds when layerHeight changes
    // and snap it to the nearest multiple of layerHeight to keep it aligned.
    useEffect(() => {
        setBaseSliceHeight((prev) => {
            const clamped = Math.max(0, Math.min(10, prev));
            if (layerHeight <= 0) return clamped; // safety
            const multiple = Math.round(clamped / layerHeight) * layerHeight;
            const snapped = Math.max(0, Math.min(10, multiple));
            return Number(snapped.toFixed(8));
        });
    }, [layerHeight]);

    // Initialize or resize per-color slice heights and preserve ordering when swatches change.
    useEffect(() => {
        // If we have no swatches currently (e.g., initial mount while upstream still loading),
        // avoid clearing previously persisted state. We'll wait for real data.
        if (filtered.length === 0) return;

        const prevFiltered = prevFilteredRef.current || [];
        const prevHeights = prevHeightsRef.current || [];
        const prevOrder = prevOrderRef.current || [];

        // Map prior heights by (hex,a) signature for quick lookup.
        const heightMap = new Map<string, number>();
        for (let i = 0; i < prevFiltered.length; i++) {
            const pf = prevFiltered[i];
            const key = pf.hex + ":" + pf.a;
            heightMap.set(key, prevHeights[i]);
        }

        const nextHeights = filtered.map((s) => {
            const key = s.hex + ":" + s.a;
            const existing = heightMap.get(key);
            const base = typeof existing === "number" ? existing : layerHeight;
            const clamped = Math.max(layerHeight, Math.min(10, base));
            const multiple = Math.round(clamped / layerHeight) * layerHeight;
            const snapped = Math.max(layerHeight, Math.min(10, multiple));
            return Number(snapped.toFixed(8));
        });
        setColorSliceHeights(nextHeights);

        // Reconstruct order using previous colorOrder mapping if available.
        const nextOrder: number[] = [];
        if (prevOrder.length && prevFiltered.length) {
            // prevOrder contains indices into prevFiltered; iterate in that order.
            for (const prevIdx of prevOrder) {
                const sw = prevFiltered[prevIdx];
                if (!sw) continue;
                const idx = filtered.findIndex(
                    (f) => f.hex === sw.hex && f.a === sw.a
                );
                if (idx !== -1 && !nextOrder.includes(idx)) nextOrder.push(idx);
            }
        }
        // Fallback / append any remaining colors not yet in order.
        for (let i = 0; i < filtered.length; i++)
            if (!nextOrder.includes(i)) nextOrder.push(i);
        setColorOrder(nextOrder);

        // Stash for next diff
        prevFilteredRef.current = filtered.slice();
        prevHeightsRef.current = nextHeights.slice();
        prevOrderRef.current = nextOrder.slice();
    }, [filtered, layerHeight]);

    // drag ordering helpers
    const dragStartRef = useRef<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [dragOverPosition, setDragOverPosition] = useState<
        "above" | "below" | null
    >(null);

    const handleDragStart = useCallback(
        (e: DragEvent<HTMLDivElement>, fi: number) => {
            dragStartRef.current = fi;
            setDragOverIndex(null);
            setDragOverPosition(null);
            e.dataTransfer?.setData("text/plain", String(fi));
            if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        },
        []
    );

    const handleDragOver = useCallback(
        (e: DragEvent<HTMLDivElement>, toDisplayIdx: number) => {
            e.preventDefault();
            const cur = e.currentTarget as HTMLElement | null;
            if (cur) {
                const rect = cur.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                const pos = e.clientY <= mid ? "above" : "below";
                setDragOverPosition(pos);
            } else {
                setDragOverPosition(null);
            }
            setDragOverIndex(toDisplayIdx);
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        },
        []
    );

    const handleDragLeave = useCallback(() => {
        setDragOverIndex(null);
        setDragOverPosition(null);
    }, []);

    const handleDrop = useCallback(
        (e: DragEvent<HTMLDivElement>, toDisplayIdx: number) => {
            e.preventDefault();
            const fromStr = e.dataTransfer?.getData("text/plain");
            const fromFi = fromStr ? Number(fromStr) : dragStartRef.current;
            if (fromFi == null || Number.isNaN(fromFi)) return;
            const currentOrder =
                colorOrder.length === filtered.length
                    ? colorOrder.slice()
                    : filtered.map((_, i) => i);
            const fromPos = currentOrder.indexOf(fromFi);
            if (fromPos === -1) return;

            let insertAt =
                toDisplayIdx + (dragOverPosition === "below" ? 1 : 0);
            currentOrder.splice(fromPos, 1);
            if (fromPos < insertAt) insertAt -= 1;
            if (insertAt < 0) insertAt = 0;
            if (insertAt > currentOrder.length) insertAt = currentOrder.length;
            currentOrder.splice(insertAt, 0, fromFi);
            setColorOrder(currentOrder);
            // update refs so persistence picks up new order immediately
            prevOrderRef.current = currentOrder.slice();
            dragStartRef.current = null;
            setDragOverIndex(null);
            setDragOverPosition(null);
        },
        [colorOrder, filtered, dragOverPosition]
    );

    // stable per-row change handler so memoized rows don't re-render due to
    // a new function identity being created each parent render
    const onRowChange = useCallback((idx: number, v: number) => {
        setColorSliceHeights((prev) => {
            const next = prev.slice();
            next[idx] = v;
            return next;
        });
    }, []);

    // Emit consolidated state upwards only when references or primitive values actually change.
    const lastEmittedRef = useRef<{
        layerHeight: number;
        baseSliceHeight: number;
        colorSliceHeights: number[];
        colorOrder: number[];
        filteredSwatches: Swatch[];
        pixelSize: number;
    } | null>(null);

    useEffect(() => {
        if (!onChange) return;
        const prev = lastEmittedRef.current;
        const same =
            prev &&
            prev.layerHeight === layerHeight &&
            prev.baseSliceHeight === baseSliceHeight &&
            prev.colorSliceHeights === colorSliceHeights &&
            prev.colorOrder === colorOrder &&
            prev.filteredSwatches === filtered &&
            prev.pixelSize === pixelSize;
        if (same) return;
        const next: ThreeDControlsStateShape = {
            layerHeight,
            baseSliceHeight,
            colorSliceHeights,
            colorOrder,
            filteredSwatches: filtered,
            pixelSize,
        };
        lastEmittedRef.current = next;
        onChange(next);
    }, [
        onChange,
        layerHeight,
        baseSliceHeight,
        colorSliceHeights,
        colorOrder,
        filtered,
        pixelSize,
    ]);

    return (
        <div className="controls-scroll">
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button
                    type="button"
                    className="preview-crop-btn"
                    onClick={() => onRebuild && onRebuild()}
                    title="Rebuild 3D model"
                >
                    Rebuild 3D
                </button>
            </div>
            <div className="controls-group">
                <label>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <span style={{ fontWeight: 700 }}>Layer height</span>
                        <span className="adjustment-unit">
                            {layerHeight.toFixed(2)} mm
                        </span>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                        }}
                    >
                        <input
                            type="number"
                            min={0.01}
                            max={1}
                            step={0.01}
                            value={layerHeight}
                            onChange={(e) => {
                                const v = Number(e.target.value);
                                if (!Number.isNaN(v)) setLayerHeight(v);
                            }}
                            style={{ width: "100%" }}
                        />
                    </div>
                </label>
            </div>

            {/* Pixel size (XY scaling) */}
            <div className="controls-group">
                <label>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <span style={{ fontWeight: 700 }}>Pixel size (XY)</span>
                        <span className="adjustment-unit">
                            {pixelSize.toFixed(3)} mm/pixel
                        </span>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                        }}
                    >
                        <input
                            type="number"
                            min={0.01}
                            max={10}
                            step={0.01}
                            value={pixelSize}
                            onChange={(e) => {
                                const v = Number(e.target.value);
                                if (Number.isNaN(v)) return;
                                setPixelSize(Math.max(0.01, Math.min(10, v)));
                            }}
                            style={{ width: "100%" }}
                        />
                    </div>
                </label>
            </div>

            {/* Base slice height */}
            <div className="controls-group">
                <label>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <span style={{ fontWeight: 700 }}>
                            Base slice height
                        </span>
                        <span className="adjustment-unit">
                            {baseSliceHeight.toFixed(2)} mm
                        </span>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                        }}
                    >
                        <input
                            type="range"
                            min={0}
                            max={10}
                            step={layerHeight}
                            value={baseSliceHeight}
                            onChange={(e) => {
                                const v = Number(e.target.value);
                                if (Number.isNaN(v)) return;
                                setBaseSliceHeight(v);
                            }}
                            className="range--styled"
                            style={{ width: "100%" }}
                        />
                    </div>
                </label>
            </div>

            {/* Per-color slice heights */}
            <div className="controls-group">
                <div
                    style={{
                        fontWeight: 700,
                        marginBottom: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <div>Color slice heights</div>
                    <div className="adjustment-unit">
                        {filtered.length} colors
                    </div>
                </div>
                <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                    {
                        // determine display order; fallback to natural order when colorOrder not initialized
                        (colorOrder.length === filtered.length
                            ? colorOrder
                            : filtered.map((_, i) => i)
                        ).map((fi, displayIdx) => {
                            const s = filtered[fi];
                            const val = colorSliceHeights[fi] ?? layerHeight;
                            return (
                                <ThreeDColorRow
                                    key={`${s.hex}-${fi}`}
                                    fi={fi}
                                    displayIdx={displayIdx}
                                    hex={s.hex}
                                    value={val}
                                    layerHeight={layerHeight}
                                    isDragOver={dragOverIndex === displayIdx}
                                    dragPosition={dragOverPosition}
                                    onDragStart={handleDragStart}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onChange={onRowChange}
                                />
                            );
                        })
                    }
                </div>
            </div>
        </div>
    );
}
