import React from 'react';
import { Button } from '@/components/ui/button';
import { Input, NumberInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Check } from 'lucide-react';
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
        <Card className="p-4 border border-border/50 space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">
                    Quantization Settings
                </h3>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="final-colors" className="font-medium">
                                Number of Colors
                            </Label>
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                                {finalColors} colors
                            </span>
                        </div>
                        <NumberInput
                            id="final-colors"
                            min={2}
                            max={256}
                            value={finalColors}
                            onChange={(e) =>
                                onFinalColorsChange(
                                    Math.max(2, Math.min(256, Number(e.target.value) || 2))
                                )
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="weight" className="font-medium">
                                Algorithm Weight
                            </Label>
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                                {weight}
                            </span>
                        </div>
                        <NumberInput
                            id="weight"
                            min={2}
                            max={256}
                            value={weight}
                            disabled={weightDisabled}
                            onChange={(e) =>
                                onWeightChange(
                                    Math.max(2, Math.min(256, Number(e.target.value) || 2))
                                )
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="algorithm" className="font-medium">
                            Algorithm
                        </Label>
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
                </div>
            </div>
            <div className="h-px bg-border/50" />
            <Button
                onClick={onApply}
                disabled={disabled}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold disabled:bg-green-600/50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 gap-1.5"
            >
                <Check className="w-4 h-4" />
                <span>Apply Quantization</span>
            </Button>
        </Card>
    );
};
