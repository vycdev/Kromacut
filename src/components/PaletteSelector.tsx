import React from "react";
import { PALETTES } from "../data/palettes";

interface Props {
    selected: string;
    onSelect: (id: string, size: number) => void;
}

export const PaletteSelector: React.FC<Props> = ({ selected, onSelect }) => {
    return (
        <div className="controls-group">
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Palette
            </div>
            <div
                className="palette-list"
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    maxHeight: 200,
                    overflowY: "auto",
                    paddingRight: 4,
                }}
            >
                {PALETTES.map((p) => {
                    const active = p.id === selected;
                    return (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => onSelect(p.id, p.size)}
                            title={
                                p.id === "auto" ? "Auto" : `${p.size} colors`
                            }
                            style={{
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
                            <div style={{ display: "flex", gap: 4 }}>
                                {p.id === "auto" ? (
                                    <div
                                        style={{
                                            width: 36,
                                            height: 20,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "#ddd",
                                            fontSize: 12,
                                        }}
                                    >
                                        Auto
                                    </div>
                                ) : (
                                    <div
                                        style={{
                                            display: "flex",
                                            gap: 4,
                                            flexWrap: "wrap",
                                            maxWidth: 200,
                                        }}
                                    >
                                        {p.colors.map((c, i) => (
                                            <div
                                                key={i}
                                                className="swatch"
                                                style={{
                                                    width: 12,
                                                    height: 12,
                                                    borderRadius: 2,
                                                    background: c,
                                                    border: "1px solid rgba(0,0,0,0.15)",
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                            {p.id === "auto" ? null : (
                                <div style={{ fontSize: 12, color: "#ddd" }}>
                                    {p.size}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
