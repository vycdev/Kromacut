import React, { useState, useEffect } from "react";
import { RgbaColorPicker } from "react-colorful";

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
    onSwatchDelete?: (sw: SwatchEntry) => Promise<void> | void;
    onSwatchApply?: (
        original: SwatchEntry,
        newHex: string
    ) => Promise<void> | void;
}

export const SwatchesPanel: React.FC<Props> = ({
    swatches,
    loading,
    cap,
    onSwatchDelete,
    onSwatchApply,
}) => {
    const [openSwatch, setOpenSwatch] = useState<SwatchEntry | null>(null);
    const [pickerColor, setPickerColor] = useState<string>("#000000");
    const [rgba, setRgba] = useState<{
        r: number;
        g: number;
        b: number;
        a: number;
    }>({ r: 0, g: 0, b: 0, a: 1 });

    useEffect(() => {
        if (openSwatch) {
            // initialize picker color and RGBA from the swatch
            const hex = (openSwatch.hex || "#000000").replace(/^#/, "");
            const r = parseInt(hex.slice(0, 2), 16) || 0;
            const g = parseInt(hex.slice(2, 4), 16) || 0;
            const b = parseInt(hex.slice(4, 6), 16) || 0;
            const a = typeof openSwatch.a === "number" ? openSwatch.a / 255 : 1;
            setRgba({ r, g, b, a });
            // include alpha byte in the displayed hex (RRGGBBAA)
            const aHex = Math.round(a * 255)
                .toString(16)
                .padStart(2, "0");
            setPickerColor(
                "#" +
                    [r, g, b]
                        .map((v) => v.toString(16).padStart(2, "0"))
                        .join("") +
                    aHex
            );
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
                        } else if (s.a < 255) {
                            // semi-transparent color: use rgba background so opacity shows
                            const r = parseInt(s.hex.slice(1, 3), 16) || 0;
                            const g = parseInt(s.hex.slice(3, 5), 16) || 0;
                            const b = parseInt(s.hex.slice(5, 7), 16) || 0;
                            style.background = `rgba(${r}, ${g}, ${b}, ${(
                                s.a / 255
                            ).toFixed(3)})`;
                        } else {
                            style.background = s.hex;
                        }
                        return (
                            <div
                                key={s.hex + "-" + s.a}
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
                    // clicking the backdrop should not close the modal (close via header button or Escape)
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
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 36,
                                    height: 36,
                                    padding: 0,
                                    borderRadius: 8,
                                }}
                            >
                                <i
                                    className="fa-solid fa-xmark"
                                    aria-hidden="true"
                                />
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
                                    <RgbaColorPicker
                                        color={rgba}
                                        onChange={(c: {
                                            r: number;
                                            g: number;
                                            b: number;
                                            a: number;
                                        }) => {
                                            setRgba(c);
                                            const aHex = Math.round(c.a * 255)
                                                .toString(16)
                                                .padStart(2, "0");
                                            setPickerColor(
                                                "#" +
                                                    [c.r, c.g, c.b]
                                                        .map((v) =>
                                                            v
                                                                .toString(16)
                                                                .padStart(
                                                                    2,
                                                                    "0"
                                                                )
                                                        )
                                                        .join("") +
                                                    aHex
                                            );
                                        }}
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
                                            position: "relative",
                                            width: "100%",
                                            height: 103,
                                            borderRadius: 8,
                                            overflow: "hidden",
                                            background:
                                                "repeating-conic-gradient(#666 0% 25%, #333 0% 50%) 50% / 16px 16px",
                                            border: "1px solid rgba(255,255,255,0.06)",
                                        }}
                                    >
                                        <div
                                            aria-hidden
                                            style={{
                                                position: "absolute",
                                                inset: 0,
                                                background: `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`,
                                            }}
                                        />
                                    </div>
                                </div>

                                <input
                                    value={pickerColor}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        // allow up to 8 hex digits (RRGGBBAA)
                                        if (/^#?[0-9a-fA-F]{0,8}$/.test(v)) {
                                            const hex = v.startsWith("#")
                                                ? v.slice(1)
                                                : v;
                                            if (hex.length === 8) {
                                                const r =
                                                    parseInt(
                                                        hex.slice(0, 2),
                                                        16
                                                    ) || 0;
                                                const g =
                                                    parseInt(
                                                        hex.slice(2, 4),
                                                        16
                                                    ) || 0;
                                                const b =
                                                    parseInt(
                                                        hex.slice(4, 6),
                                                        16
                                                    ) || 0;
                                                const a =
                                                    (parseInt(
                                                        hex.slice(6, 8),
                                                        16
                                                    ) || 255) / 255;
                                                setRgba((p) => ({
                                                    ...p,
                                                    r,
                                                    g,
                                                    b,
                                                    a,
                                                }));
                                            } else if (hex.length === 6) {
                                                const r =
                                                    parseInt(
                                                        hex.slice(0, 2),
                                                        16
                                                    ) || 0;
                                                const g =
                                                    parseInt(
                                                        hex.slice(2, 4),
                                                        16
                                                    ) || 0;
                                                const b =
                                                    parseInt(
                                                        hex.slice(4, 6),
                                                        16
                                                    ) || 0;
                                                setRgba((p) => ({
                                                    ...p,
                                                    r,
                                                    g,
                                                    b,
                                                }));
                                            }
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
                                        onClick={async () => {
                                            if (!openSwatch) return;
                                            try {
                                                if (onSwatchDelete) {
                                                    await onSwatchDelete(
                                                        openSwatch
                                                    );
                                                }
                                            } catch (err) {
                                                console.warn(
                                                    "swatch delete handler failed",
                                                    err
                                                );
                                            }
                                            closeModal();
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
                                        onClick={async () => {
                                            if (!openSwatch) return;
                                            // normalize hex: allow 6 or 8 digit input; always produce 8-digit (#RRGGBBAA)
                                            let hex = pickerColor || "";
                                            const normFromRgba = () => {
                                                const { r, g, b, a } = rgba;
                                                const aHex = Math.round(a * 255)
                                                    .toString(16)
                                                    .padStart(2, "0");
                                                return (
                                                    "#" +
                                                    [r, g, b]
                                                        .map((v) =>
                                                            v
                                                                .toString(16)
                                                                .padStart(
                                                                    2,
                                                                    "0"
                                                                )
                                                        )
                                                        .join("") +
                                                    aHex
                                                );
                                            };
                                            if (
                                                !/^#?[0-9a-fA-F]{6,8}$/.test(
                                                    hex
                                                )
                                            ) {
                                                hex = normFromRgba();
                                            } else {
                                                if (!hex.startsWith("#"))
                                                    hex = "#" + hex;
                                                // normalize to lowercase
                                                hex =
                                                    "#" +
                                                    hex.slice(1).toLowerCase();
                                                // if user provided 6-digit, append alpha from rgba
                                                if (hex.length === 7) {
                                                    const aHex = Math.round(
                                                        rgba.a * 255
                                                    )
                                                        .toString(16)
                                                        .padStart(2, "0");
                                                    hex = hex + aHex;
                                                }
                                            }
                                            try {
                                                if (onSwatchApply) {
                                                    await onSwatchApply(
                                                        openSwatch,
                                                        hex
                                                    );
                                                }
                                            } catch (err) {
                                                console.warn(
                                                    "swatch apply handler failed",
                                                    err
                                                );
                                            }
                                            closeModal();
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
