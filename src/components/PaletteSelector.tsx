import React from "react";
import { PALETTES } from "../data/palettes";

interface Props {
    selected: string;
    onSelect: (id: string, size: number) => void;
}

export const PaletteSelector: React.FC<Props> = ({ selected, onSelect }) => {
    return (
        <div className="controls-group">
            <div className="palette-header">Palette</div>
            <div className="palette-list">
                {PALETTES.map((p) => {
                    return (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => onSelect(p.id, p.size)}
                            title={
                                p.id === "auto" ? "Auto" : `${p.size} colors`
                            }
                            className={`palette-item${
                                p.id === selected ? " palette-item--active" : ""
                            }`}
                        >
                            <div className="palette-item-leading">
                                {p.id === "auto" ? (
                                    <div className="palette-auto-label">
                                        Auto
                                    </div>
                                ) : (
                                    <div className="palette-color-grid">
                                        {p.colors.map((c, i) => (
                                            <div
                                                key={i}
                                                className="palette-color-swatch"
                                                style={{ background: c }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                            {p.id === "auto" ? null : (
                                <div className="palette-size-label">
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
