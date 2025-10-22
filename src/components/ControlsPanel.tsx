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
import { PALETTES } from '../data/palettes';

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
    selectedPalette: string;
    onPaletteSelect: (id: string, size: number) => void;
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
    selectedPalette,
    onPaletteSelect,
}) => {
    return (
        <Card className="p-4 border border-border/50 space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">
                    Quantization Settings
                </h3>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="palette-select" className="font-medium">
                            Palette
                        </Label>
                        <Select
                            value={selectedPalette}
                            onValueChange={(paletteId) => {
                                const palette = PALETTES.find((p: any) => p.id === paletteId);
                                if (palette) {
                                    onPaletteSelect(paletteId, palette.size);
                                }
                            }}
                        >
                            <SelectTrigger id="palette-select">
                                <SelectValue placeholder="Select a palette" />
                            </SelectTrigger>
                            <SelectContent className="max-h-48 overflow-y-auto">
                                {PALETTES.map((p: any) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        <div className="flex items-center gap-2">
                                            <span>
                                                {p.id === 'auto' ? 'Auto' : `${p.size} colors`}
                                            </span>
                                            {p.id !== 'auto' && (
                                                <div className="flex gap-1">
                                                    {p.colors
                                                        .slice(0, 5)
                                                        .map((c: string, i: number) => (
                                                            <div
                                                                key={i}
                                                                className="rounded border border-border/70 cursor-pointer hover:border-primary hover:shadow-md transition-all duration-200 hover:scale-110 select-none"
                                                                style={{
                                                                    background: c,
                                                                    width: '15px',
                                                                    height: '15px',
                                                                    aspectRatio: '1',
                                                                }}
                                                            />
                                                        ))}
                                                    {p.colors.length > 5 && (
                                                        <div className="text-xs text-muted-foreground">
                                                            +{p.colors.length - 5}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
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
                    <div className="h-px bg-border/50" />
                </div>
            </div>
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

export default ControlsPanel;
