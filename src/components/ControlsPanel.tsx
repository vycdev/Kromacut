import React from 'react';

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
        <div className="space-y-3">
            <label className="block">
                <span className="block text-sm font-medium text-gray-300 mb-1">
                    Number of colors
                </span>
                <input
                    type="number"
                    min={2}
                    value={finalColors}
                    onChange={(e) =>
                        onFinalColorsChange(Math.max(2, Math.min(256, Number(e.target.value) || 2)))
                    }
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
            </label>
            <label className="block">
                <span className="block text-sm font-medium text-gray-300 mb-1">
                    Algorithm Weight
                </span>
                <input
                    type="number"
                    min={2}
                    value={weight}
                    disabled={weightDisabled}
                    onChange={(e) =>
                        onWeightChange(Math.max(2, Math.min(256, Number(e.target.value) || 2)))
                    }
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                />
            </label>
            <label className="block">
                <span className="block text-sm font-medium text-gray-300 mb-1">Algorithm</span>
                <select
                    value={algorithm}
                    onChange={(e) => setAlgorithm(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Apply
                </button>
            </div>
        </div>
    );
};
