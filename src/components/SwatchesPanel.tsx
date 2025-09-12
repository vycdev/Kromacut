import React from "react";

interface Props {
    swatches: string[];
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
                    swatches
                        .slice(0, cap)
                        .map((c) => (
                            <div
                                key={c}
                                className="swatch"
                                title={c}
                                style={{ background: c }}
                            />
                        ))
                )}
            </div>
        </div>
    );
};
