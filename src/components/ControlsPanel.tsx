import React from "react";

interface Props {
    finalColors: number;
    onFinalColorsChange: (n: number) => void;
    weight: number;
    onWeightChange: (n: number) => void;
    algorithm: string;
    setAlgorithm: (a: string) => void;
    onApply: () => void;
    disabled: boolean;
    weightDisabled?: boolean;
}

export const ControlsPanel: React.FC<Props> = ({
    finalColors,
    onFinalColorsChange,
    weight,
    onWeightChange,
    algorithm,
    setAlgorithm,
    onApply,
    disabled,
    weightDisabled = false,
}) => {
    return (
        <div className="controls-group">
            <label>
                Number of colors
                <input
                    type="number"
                    min={2}
                    value={finalColors}
                    onChange={(e) =>
                        onFinalColorsChange(
                            Math.max(
                                2,
                                Math.min(256, Number(e.target.value) || 2)
                            )
                        )
                    }
                />
            </label>
            <label>
                Algorithm Weight
                <input
                    type="number"
                    min={2}
                    value={weight}
                    disabled={weightDisabled}
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
                    <option value="none">None (postprocess only)</option>
                    <option value="posterize">Posterize</option>
                    <option value="median-cut">Median-cut</option>
                    <option value="kmeans">K-means</option>
                    <option value="wu">Wu</option>
                    <option value="octree">Octree</option>
                </select>
            </label>
            <div>
                <button
                    onClick={onApply}
                    disabled={disabled}
                    className="apply-btn"
                >
                    Apply
                </button>
            </div>
        </div>
    );
};
