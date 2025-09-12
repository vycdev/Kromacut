import React, { useState, useEffect } from "react";
import { HexColorPicker } from "react-colorful";

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
                            background:
                                "linear-gradient(180deg,#0f1113,#0b0c0d)",
                            padding: 18,
                            borderRadius: 12,
                            minWidth: 420,
                            maxWidth: "min(90vw,680px)",
                            boxShadow: "0 12px 48px rgba(2,6,23,0.75)",
                            color: "#eee",
                            border: "1px solid rgba(255,255,255,0.03)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginBottom: 12,
                            }}
                        >
                            <div style={{ fontSize: 16, fontWeight: 800 }}>
                                Edit swatch
                            </div>
                            <button
                                aria-label="Close"
                                onClick={() => closeModal()}
                                style={{
                                    background: "transparent",
                                    border: 0,
                                    color: "#888",
                                    cursor: "pointer",
                                    fontSize: 18,
                                    lineHeight: 1,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div style={{ display: "flex", gap: 0 }}>
                            {/* Left column: picker and actions */}
                            <div
                                style={{
                                    flex: 1,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                    paddingRight: 12,
                                }}
                            >
                                <div style={{ maxWidth: 420 }}>
                                    <HexColorPicker
                                        color={pickerColor}
                                        onChange={(c: string) =>
                                            setPickerColor(c)
                                        }
                                    />
                                </div>

                                {/* actions moved to the right column (preview area) */}
                                <div style={{ marginTop: "auto" }} />
                            </div>

                            {/* Right column: preview above hex input */}
                            <div
                                style={{
                                    width: 160,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 10,
                                }}
                            >
                                <div style={{ width: "100%" }}>
                                    <div
                                        aria-hidden
                                        style={{
                                            width: "100%",
                                            height: 72,
                                            borderRadius: 8,
                                            background: pickerColor,
                                            border: "1px solid rgba(255,255,255,0.06)",
                                        }}
                                    />
                                </div>

                                <input
                                    value={pickerColor}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (/^#?[0-9a-fA-F]{0,8}$/.test(v)) {
                                            setPickerColor(
                                                v.startsWith("#") ? v : "#" + v
                                            );
                                        }
                                    }}
                                    style={{
                                        width: "100%",
                                        padding: "8px 10px",
                                        background: "#0b0d0e",
                                        border: "1px solid rgba(255,255,255,0.04)",
                                        color: "#fff",
                                        borderRadius: 6,
                                        fontFamily: "monospace",
                                    }}
                                />

                                <div
                                    style={{
                                        marginTop: 6,
                                        display: "flex",
                                        gap: 8,
                                        width: "100%",
                                    }}
                                >
                                    <button
                                        onClick={() => {
                                            // delete placeholder - does nothing yet
                                        }}
                                        style={{
                                            flex: 1,
                                            minWidth: 0,
                                            padding: "8px 12px",
                                            background: "transparent",
                                            border: "1px solid rgba(255,60,60,0.12)",
                                            color: "#ff6b6b",
                                            borderRadius: 8,
                                            cursor: "pointer",
                                        }}
                                    >
                                        Delete
                                    </button>

                                    <button
                                        onClick={() => {
                                            // Apply currently does nothing (placeholder)
                                        }}
                                        style={{
                                            flex: 1,
                                            minWidth: 0,
                                            padding: "8px 12px",
                                            background: "#f3f4f6",
                                            border: "1px solid #d1d5db",
                                            color: "#111827",
                                            borderRadius: 8,
                                            cursor: "pointer",
                                        }}
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// (native color input used; integrated sliders removed)
