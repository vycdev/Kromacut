import React from "react";

interface Props {
    weight: number;
    onWeightChange: (n: number) => void;
    algorithm: string;
    setAlgorithm: (a: string) => void;
    onApply: () => void;
    disabled: boolean;
}

export const ControlsPanel: React.FC<Props> = ({
    weight,
    onWeightChange,
    algorithm,
    setAlgorithm,
    onApply,
    disabled,
}) => {
    return (
        <div className="controls-group">
            <label>
                Color
                <input
                    type="number"
                    min={2}
                    value={weight}
                    onChange={(e) =>
                        onWeightChange(
                            Math.max(
                                2,
                                Math.min(256, Number(e.target.value) || 2)
                            )
                        )
                    }
                />
            </label>
            <label>
                Algorithm
                <select
                    value={algorithm}
                    onChange={(e) => setAlgorithm(e.target.value)}
                >
                    <option value="posterize">Posterize</option>
                    <option value="median-cut">Median-cut</option>
                    <option value="kmeans">K-means</option>
                    <option value="wu">Wu</option>
                    <option value="octree">Octree</option>
                </select>
            </label>
            <div style={{ marginTop: 8 }}>
                <button onClick={onApply} disabled={disabled}>
                    Apply
                </button>
            </div>
        </div>
    );
};
