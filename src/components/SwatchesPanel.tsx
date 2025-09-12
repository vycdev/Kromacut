import React from "react";

interface SwatchEntry {
    hex: string;
    a: number;
    count: number;
}
interface Props {
    swatches: SwatchEntry[];
    loading: boolean;
    cap: number;
}

export const SwatchesPanel: React.FC<Props> = ({ swatches, loading, cap }) => {
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
                <span className="swatch-count" aria-hidden>
                    ({swatches.length})
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
                                title={`${s.hex}${
                                    s.a === 0 ? " (transparent)" : ""
                                }  alpha:${s.a}  count:${s.count}`}
                                style={style}
                            />
                        );
                    })
                )}
            </div>
        </div>
    );
};
