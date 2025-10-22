import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

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
            <div className="space-y-2">
                <Label htmlFor="final-colors">Number of colors</Label>
                <Input
                    id="final-colors"
                    type="number"
                    min={2}
                    value={finalColors}
                    onChange={(e) =>
                        onFinalColorsChange(Math.max(2, Math.min(256, Number(e.target.value) || 2)))
                    }
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="weight">Algorithm Weight</Label>
                <Input
                    id="weight"
                    type="number"
                    min={2}
                    value={weight}
                    disabled={weightDisabled}
                    onChange={(e) =>
                        onWeightChange(Math.max(2, Math.min(256, Number(e.target.value) || 2)))
                    }
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="algorithm">Algorithm</Label>
                <Select value={algorithm} onValueChange={setAlgorithm}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select algorithm" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">None (postprocess only)</SelectItem>
                        <SelectItem value="posterize">Posterize</SelectItem>
                        <SelectItem value="median-cut">Median-cut</SelectItem>
                        <SelectItem value="kmeans">K-means</SelectItem>
                        <SelectItem value="wu">Wu</SelectItem>
                        <SelectItem value="octree">Octree</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <Button
                onClick={onApply}
                disabled={disabled}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:bg-purple-600/50 disabled:cursor-not-allowed"
            >
                Apply
            </Button>
        </div>
    );
};
