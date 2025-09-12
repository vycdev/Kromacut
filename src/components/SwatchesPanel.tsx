import React, { useState, useEffect } from "react";
import { HexAlphaColorPicker } from "react-colorful";

interface SwatchEntry {
    hex: string;
    a: number;
    count: number;
    isTransparent?: boolean;
}
interface Props {
    swatches: SwatchEntry[];
    loading: boolean;
    cap: number;
}

export const SwatchesPanel: React.FC<Props> = ({ swatches, loading, cap }) => {
    const [openSwatch, setOpenSwatch] = useState<SwatchEntry | null>(null);
    const [pickerColor, setPickerColor] = useState<string>("#000000");

    useEffect(() => {
        if (openSwatch) {
            // initialize picker with the swatch hex (opaque swatches) or black for transparent
            setPickerColor(openSwatch.a === 0 ? "#000000" : openSwatch.hex);
        }
    }, [openSwatch]);

    const closeModal = () => setOpenSwatch(null);

    return (
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
                <span>Image colors</span>
                <span
                    className="swatch-count"
                    aria-hidden
                    title="Number of opaque color swatches (transparent excluded)"
                >
                    ({swatches.filter((s) => !s.isTransparent).length})
                </span>
                {loading && (
                    <span
                        style={{ fontSize: 12, color: "#ddd", marginLeft: 6 }}
                    >
                        Updating…
                    </span>
                )}
            </div>
            <div className="swatches" aria-live="polite">
                {swatches.length === 0 ? (
                    <div
                        style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}
                    >
                        No swatches
                    </div>
                ) : (
                    swatches.slice(0, cap).map((s) => {
                        const style: React.CSSProperties = {
                            position: "relative",
                            cursor: "pointer",
                        };
                        if (s.a === 0) {
                            style.background = `repeating-conic-gradient(#666 0% 25%, #333 0% 50%) 50% / 8px 8px`;
                        } else {
                            style.background = s.hex;
                        }
                        return (
                            <div
                                key={s.hex + s.a}
                                className="swatch"
                                role="button"
                                tabIndex={0}
                                onClick={() => setOpenSwatch(s)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        setOpenSwatch(s);
                                    }
                                }}
                                title={`${s.hex}${
                                    s.a === 0 ? " (transparent)" : ""
                                }  alpha:${s.a}  count:${s.count}`}
                                style={style}
                            />
                        );
                    })
                )}
            </div>

            {/* Modal: color picker + Apply / Cancel */}
            {openSwatch && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Edit swatch color"
                    onKeyDown={(e) => {
                        if (e.key === "Escape") closeModal();
                    }}
                    style={{
                        position: "fixed",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(0,0,0,0.5)",
                        zIndex: 1000,
                    }}
                    onClick={(e) => {
                        // close when clicking backdrop
                        if (e.target === e.currentTarget) closeModal();
                    }}
                >
                    <div
                        style={{
                            background: "#111",
                            padding: 16,
                            borderRadius: 8,
                            minWidth: 280,
                            boxShadow: "0 6px 24px rgba(0,0,0,0.6)",
                        }}
                    >
                        <div style={{ marginBottom: 12, fontWeight: 700 }}>
                            Edit swatch
                        </div>

                        <div
                            style={{
                                display: "flex",
                                gap: 12,
                                alignItems: "flex-start",
                                marginBottom: 12,
                            }}
                        >
                            {/* Color preview */}
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 8,
                                }}
                            >
                                <div
                                    aria-hidden
                                    style={{
                                        width: 56,
                                        height: 56,
                                        borderRadius: 6,
                                        background: pickerColor,
                                        border: "1px solid rgba(255,255,255,0.08)",
                                    }}
                                />
                                <div style={{ color: "#ddd", fontSize: 12 }}>
                                    {openSwatch.a === 0
                                        ? "(transparent)"
                                        : openSwatch.hex}
                                </div>
                            </div>

                            {/* react-colorful integrated picker */}
                            <div
                                style={{
                                    flex: 1,
                                    display: "flex",
                                    gap: 12,
                                    alignItems: "flex-start",
                                }}
                            >
                                <div style={{ minWidth: 220 }}>
                                    <HexAlphaColorPicker
                                        color={pickerColor}
                                        onChange={(c) => setPickerColor(c)}
                                    />
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 8,
                                        flex: 1,
                                    }}
                                >
                                    <div
                                        style={{ color: "#ddd", fontSize: 12 }}
                                    >
                                        Hex
                                    </div>
                                    <input
                                        aria-label="Hex color"
                                        value={pickerColor}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (
                                                /^#?[0-9a-fA-F]{0,8}$/.test(v)
                                            ) {
                                                setPickerColor(
                                                    v.startsWith("#")
                                                        ? v
                                                        : "#" + v
                                                );
                                            }
                                        }}
                                        style={{
                                            width: "100%",
                                            padding: "6px 8px",
                                            background: "#222",
                                            border: "1px solid #333",
                                            color: "#fff",
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: 8,
                            }}
                        >
                            <button
                                onClick={() => {
                                    // Apply currently does nothing (placeholder)
                                    // Future: apply color back to image / palette
                                }}
                                style={{
                                    padding: "6px 10px",
                                    cursor: "pointer",
                                }}
                            >
                                Apply
                            </button>
                            <button
                                onClick={() => closeModal()}
                                style={{
                                    padding: "6px 10px",
                                    cursor: "pointer",
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// (native color input used; integrated sliders removed)
