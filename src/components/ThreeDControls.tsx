import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";

type Swatch = { hex: string; a: number };

interface ThreeDControlsProps {
    swatches: Swatch[] | null;
}

export default function ThreeDControls({ swatches }: ThreeDControlsProps) {
    // 3D printing controls (owned by this component)
    const [layerHeight, setLayerHeight] = useState<number>(0.12); // mm
    const [baseSliceHeight, setBaseSliceHeight] = useState<number>(layerHeight);
    const [colorSliceHeights, setColorSliceHeights] = useState<number[]>([]);

    // derive non-transparent swatches once per render and memoize
    const filtered = useMemo(() => {
        return swatches ? swatches.filter((s) => s.a !== 0) : [];
    }, [swatches]);

    // ordering state: indices into `filtered` that control displayed order.
    const [colorOrder, setColorOrder] = useState<number[]>([]);
    const prevFilteredRef = useRef<Swatch[] | null>(null);
    const prevHeightsRef = useRef<number[]>([]);

    // Ensure baseSliceHeight stays within valid bounds when layerHeight changes
    // and snap it to the nearest multiple of layerHeight to keep it aligned.
    useEffect(() => {
        setBaseSliceHeight((prev) => {
            const clamped = Math.max(layerHeight, Math.min(10, prev));
            const multiple = Math.round(clamped / layerHeight) * layerHeight;
            const snapped = Math.max(layerHeight, Math.min(10, multiple));
            return Number(snapped.toFixed(8));
        });
    }, [layerHeight]);

    // Initialize or resize per-color slice heights and preserve ordering when swatches change.
    useEffect(() => {
        // Build next heights reusing previous heights when possible (match by hex+alpha)
        const prevFiltered = prevFilteredRef.current || [];
        const prevHeights = prevHeightsRef.current || [];
        const nextHeights = filtered.map((s) => {
            const found = prevFiltered.findIndex(
                (p) => p.hex === s.hex && p.a === s.a
            );
            const existing = found !== -1 ? prevHeights[found] : undefined;
            const base = typeof existing === "number" ? existing : layerHeight;
            const clamped = Math.max(layerHeight, Math.min(10, base));
            const multiple = Math.round(clamped / layerHeight) * layerHeight;
            const snapped = Math.max(layerHeight, Math.min(10, multiple));
            return Number(snapped.toFixed(8));
        });
        setColorSliceHeights(nextHeights);

        // Build next order preserving previous ordering of colors when possible
        const nextOrder: number[] = [];
        // First, push indices from prevFiltered in their previous order if still present
        for (let i = 0; i < prevFiltered.length; i++) {
            const p = prevFiltered[i];
            const idx = filtered.findIndex(
                (f) => f.hex === p.hex && f.a === p.a
            );
            if (idx !== -1 && !nextOrder.includes(idx)) nextOrder.push(idx);
        }
        // Then append any remaining indices
        for (let i = 0; i < filtered.length; i++)
            if (!nextOrder.includes(i)) nextOrder.push(i);
        setColorOrder(nextOrder);

        // stash for next diff
        prevFilteredRef.current = filtered.slice();
        prevHeightsRef.current = nextHeights.slice();
    }, [filtered, layerHeight]);

    // drag ordering helpers
    const dragStartRef = useRef<number | null>(null);
    const handleDragStart = (e: DragEvent<HTMLDivElement>, fi: number) => {
        dragStartRef.current = fi;
        e.dataTransfer?.setData("text/plain", String(fi));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    };
    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    };
    const handleDrop = (e: DragEvent<HTMLDivElement>, toDisplayIdx: number) => {
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
        currentOrder.splice(fromPos, 1);
        currentOrder.splice(toDisplayIdx, 0, fromFi);
        setColorOrder(currentOrder);
        dragStartRef.current = null;
    };

    return (
        <div className="controls-scroll">
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
                            min={layerHeight}
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
                                <div
                                    key={`${s.hex}-${fi}`}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, fi)}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, displayIdx)}
                                    style={{
                                        display: "flex",
                                        gap: 8,
                                        alignItems: "center",
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 28,
                                            height: 20,
                                            background: s.hex,
                                            border: "1px solid #ccc",
                                            borderRadius: 3,
                                        }}
                                    />
                                    <input
                                        type="range"
                                        min={layerHeight}
                                        max={10}
                                        step={layerHeight}
                                        value={val}
                                        onChange={(e) => {
                                            const v = Number(e.target.value);
                                            if (Number.isNaN(v)) return;
                                            setColorSliceHeights((prev) => {
                                                const next = prev.slice();
                                                next[fi] = v;
                                                return next;
                                            });
                                        }}
                                        className="range--styled"
                                        style={{ flex: 1 }}
                                    />
                                    <div
                                        style={{
                                            width: 72,
                                            textAlign: "right",
                                        }}
                                    >
                                        {val.toFixed(2)} mm
                                    </div>
                                </div>
                            );
                        })
                    }
                </div>
            </div>
        </div>
    );
}
