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
}: ThreeDControlsProps) {
    // 3D printing controls (owned by this component)
    const [layerHeight, setLayerHeight] = useState<number>(
        persisted?.layerHeight ?? 0.12
    ); // mm
    const [baseSliceHeight, setBaseSliceHeight] = useState<number>(
        persisted?.baseSliceHeight ?? 0.2
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

    // Note: baseSliceHeight is intentionally freeform now (no snapping to layerHeight).
    // We still enforce reasonable bounds when the user edits it.

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

    // Prepare dynamic 3D print instruction data derived from current control state
    type SwapEntry =
        | { type: "start"; swatch: Swatch }
        | { type: "swap"; swatch: Swatch; layer: number; height: number };

    // Build cumulative slice heights following the same logic used by the renderer
    const cumulativeHeights: number[] = [];
    let run = 0;
    for (let pos = 0; pos < colorOrder.length; pos++) {
        const fi = colorOrder[pos];
        const h = Number(colorSliceHeights[fi] ?? 0) || 0;
        run += h;
        cumulativeHeights[pos] = run;
    }

    // Build swap plan entries (typed)
    const swapPlan: SwapEntry[] = [];
    for (let pos = 0; pos < colorOrder.length; pos++) {
        const fi = colorOrder[pos];
        const sw = filtered[fi];
        if (!sw) continue;
        if (pos === 0) {
            swapPlan.push({ type: "start", swatch: sw });
            continue;
        }
        const prevCum = cumulativeHeights[pos - 1] ?? 0;
        const heightAt = Math.max(0, (baseSliceHeight ?? 0) + prevCum);
        const layerNum =
            layerHeight > 0 ? Math.floor(heightAt / layerHeight) + 1 : 1;
        swapPlan.push({
            type: "swap",
            swatch: sw,
            layer: layerNum,
            height: heightAt,
        });
    }

    // Build a plain-text representation of the instructions for copying
    const buildInstructionsText = () => {
        const lines: string[] = [];
        lines.push("3D print instructions");
        lines.push(`Layer height: ${layerHeight.toFixed(3)} mm`);
        if (swapPlan.length) {
            const first = swapPlan[0];
            if (first.type === "start")
                lines.push(`Start with color: ${first.swatch.hex}`);
        }
        lines.push("Color swap plan:");
        if (swapPlan.length <= 1) {
            lines.push("- No swaps — only one color configured.");
        } else {
            for (const entry of swapPlan) {
                if (entry.type === "start") {
                    lines.push(`- Start print with ${entry.swatch.hex}`);
                } else {
                    lines.push(
                        `- Swap to ${entry.swatch.hex} at layer ${
                            entry.layer
                        } (~${entry.height.toFixed(3)} mm)`
                    );
                }
            }
        }
        return lines.join("\n");
    };

    // Clipboard copy with fallback and brief copied feedback
    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef<number | null>(null);
    const copyToClipboard = async () => {
        const text = buildInstructionsText();
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                // fallback for older browsers
                const ta = document.createElement("textarea");
                ta.value = text;
                // avoid scrolling to bottom
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                document.execCommand("copy");
                ta.remove();
            }
            setCopied(true);
            if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
            copyTimerRef.current = window.setTimeout(
                () => setCopied(false),
                2000
            );
        } catch (err) {
            // best-effort: ignore failures silently for now
            console.error("Copy to clipboard failed", err);
        }
    };

    return (
        <div className="controls-scroll">
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
                            max={10}
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

            {/* Base slice height (numeric input) */}
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
                            type="number"
                            min={0}
                            max={10}
                            step={0.01}
                            value={baseSliceHeight}
                            onChange={(e) => {
                                let v = Number(e.target.value);
                                if (Number.isNaN(v)) return;
                                v = Math.max(0, Math.min(10, v));
                                setBaseSliceHeight(v);
                            }}
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

            {/* 3D printing instruction group (dynamic) */}
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
                    <div>3D print instructions</div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <button
                            type="button"
                            onClick={copyToClipboard}
                            title="Copy print instructions to clipboard"
                            aria-pressed={copied}
                            className={copied ? "compact-btn copied-pressed" : "compact-btn"}
                        >
                            {copied ? "Copied!" : "Copy"}
                        </button>
                    </div>
                </div>

                <div style={{ fontSize: 13, lineHeight: "1.4" }}>
                    <div style={{ marginBottom: 8 }}>
                        <strong>1.</strong> Layer height —{" "}
                        {layerHeight.toFixed(3)} mm
                    </div>

                    <div
                        style={{
                            marginBottom: 8,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <strong style={{ width: 18 }}>2.</strong>
                        <div>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                }}
                            >
                                <div style={{ fontWeight: 700 }}>
                                    Start with color
                                </div>
                                {swapPlan.length ? (
                                    (() => {
                                        const entry = swapPlan[0];
                                        if (entry && entry.type === "start") {
                                            const sw = entry.swatch;
                                            return (
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            width: 14,
                                                            height: 14,
                                                            display:
                                                                "inline-block",
                                                            background: sw.hex,
                                                            border: "1px solid #000",
                                                        }}
                                                    />
                                                    <span
                                                        style={{
                                                            fontFamily:
                                                                "monospace",
                                                        }}
                                                    >
                                                        {sw.hex}
                                                    </span>
                                                </div>
                                            );
                                        }
                                        return <span>—</span>;
                                    })()
                                ) : (
                                    <span>—</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div>
                        <strong>3.</strong>
                        <div style={{ marginTop: 6 }}>
                            <div style={{ marginBottom: 6 }}>
                                Color swap plan:
                            </div>
                            {swapPlan.length <= 1 ? (
                                <div>No swaps — only one color configured.</div>
                            ) : (
                                <ol style={{ paddingLeft: 18, marginTop: 6 }}>
                                    {swapPlan.map((entry, idx) => {
                                        if (entry.type === "start")
                                            return (
                                                <li key={idx}>
                                                    Start print with{" "}
                                                    <span
                                                        style={{
                                                            fontFamily:
                                                                "monospace",
                                                        }}
                                                    >
                                                        {entry.swatch.hex}
                                                    </span>
                                                </li>
                                            );
                                        return (
                                            <li key={idx}>
                                                Swap to{" "}
                                                <span
                                                    style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            width: 12,
                                                            height: 12,
                                                            display:
                                                                "inline-block",
                                                            background:
                                                                entry.swatch
                                                                    .hex,
                                                            border: "1px solid #000",
                                                        }}
                                                    />
                                                    <span
                                                        style={{
                                                            fontFamily:
                                                                "monospace",
                                                        }}
                                                    >
                                                        {entry.swatch.hex}
                                                    </span>
                                                </span>{" "}
                                                at layer{" "}
                                                <strong>{entry.layer}</strong>{" "}
                                                (~{entry.height.toFixed(3)} mm)
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
