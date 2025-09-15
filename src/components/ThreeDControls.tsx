import { useEffect, useState } from "react";

type Swatch = { hex: string; a: number };

interface ThreeDControlsProps {
    swatches: Swatch[] | null;
}

export default function ThreeDControls({ swatches }: ThreeDControlsProps) {
    // 3D printing controls (owned by this component)
    const [layerHeight, setLayerHeight] = useState<number>(0.12); // mm
    const [baseSliceHeight, setBaseSliceHeight] = useState<number>(layerHeight);
    const [colorSliceHeights, setColorSliceHeights] = useState<number[]>([]);

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

    // Initialize or resize per-color slice heights when swatches change.
    useEffect(() => {
        const filtered = swatches ? swatches.filter((s) => s.a !== 0) : [];
        setColorSliceHeights((prev) => {
            const next = filtered.map((_, i) => {
                const existing = prev[i];
                const base =
                    typeof existing === "number" ? existing : layerHeight;
                const clamped = Math.max(layerHeight, Math.min(10, base));
                const multiple =
                    Math.round(clamped / layerHeight) * layerHeight;
                const snapped = Math.max(layerHeight, Math.min(10, multiple));
                return Number(snapped.toFixed(8));
            });
            return next;
        });
    }, [swatches, layerHeight]);

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
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    Color slice heights
                </div>
                <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                    {(swatches || [])
                        .filter((s) => s.a !== 0)
                        .map((s, idx) => {
                            const val = colorSliceHeights[idx] ?? layerHeight;
                            return (
                                <div
                                    key={`${s.hex}-${idx}`}
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
                                                next[idx] = v;
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
                        })}
                </div>
            </div>
        </div>
    );
}
