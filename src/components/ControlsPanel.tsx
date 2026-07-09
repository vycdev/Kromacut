import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CollapsibleCard, DirtyDot } from '@/components/CollapsibleCard';
import { Check, Loader, RotateCcw } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { PALETTES } from '../data/palettes';
import type { MergedPalette } from '../hooks/usePaletteManager';
import type { CustomPalette } from '../types';
import { PaletteManager } from './PaletteManager';

interface Props {
    finalColors: number;
    onFinalColorsChange: (n: number) => void;
    weight: number;
    onWeightChange: (n: number) => void;
    algorithm: string;
    setAlgorithm: (a: string) => void;
    onApply: () => Promise<void> | void;
    disabled: boolean;
    weightDisabled?: boolean;
    selectedPalette: string;
    onPaletteSelect: (id: string, size: number) => void;
    applying?: boolean;
    onReset?: () => void;
    // Palette manager props
    allPalettes: MergedPalette[];
    customPalettes: CustomPalette[];
    importFeedback: string | null;
    importInputRef: React.RefObject<HTMLInputElement | null>;
    onCreatePalette: (name: string, colors: string[]) => void;
    onUpdatePalette: (id: string, patch: { name?: string; colors?: string[] }) => void;
    onDeletePalette: (id: string) => void;
    onExportPalette: (id: string) => void;
    onImportPaletteFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
    applying = false,
    onReset,
    allPalettes,
    customPalettes,
    importFeedback,
    importInputRef,
    onCreatePalette,
    onUpdatePalette,
    onDeletePalette,
    onExportPalette,
    onImportPaletteFile,
}) => {
    // Local state for relaxed typing
    const [localColors, setLocalColors] = useState(finalColors);
    const [localWeight, setLocalWeight] = useState(weight);

    // Sync from parent props
    useEffect(() => {
        setLocalColors(finalColors);
    }, [finalColors]);

    useEffect(() => {
        setLocalWeight(weight);
    }, [weight]);

    const allDefault =
        finalColors === 16 &&
        weight === 128 &&
        algorithm === 'kmeans' &&
        selectedPalette === 'auto';

    return (
        <CollapsibleCard
            id="quantization"
            title="Quantization Settings"
            subtitle="Configure palette and reduce colors"
                collapsedSummary={
                    applying ? (
                        <Loader
                            className="w-4 h-4 animate-spin text-muted-foreground"
                            aria-label="Applying quantization"
                        />
                    ) : !allDefault ? (
                        <DirtyDot title="Quantization settings modified" />
                    ) : undefined
                }
            actions={
                onReset && (
                    <button
                        type="button"
                        onClick={onReset}
                        disabled={allDefault}
                        title="Reset quantization settings to default"
                        aria-label="Reset quantization settings"
                        className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-600/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground select-none cursor-pointer"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                )
            }
        >
            <div className="space-y-4">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="palette-select" className="font-medium">
                            Palette
                        </Label>
                        <Select
                            value={selectedPalette}
                            onValueChange={(paletteId) => {
                                const palette = allPalettes.find((p) => p.id === paletteId);
                                if (palette) {
                                    onPaletteSelect(paletteId, palette.size);
                                }
                            }}
                        >
                            <SelectTrigger id="palette-select">
                                <SelectValue placeholder="Select a palette" />
                            </SelectTrigger>
                            <SelectContent className="max-h-48 overflow-y-auto">
                                {PALETTES.map((p) => (
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
                                {customPalettes.length > 0 && (
                                    <>
                                        <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider select-none border-t border-border/50 mt-1 pt-2">
                                            Custom Palettes
                                        </div>
                                        {customPalettes.map((cp) => (
                                            <SelectItem key={cp.id} value={cp.id}>
                                                <div className="flex items-center gap-2">
                                                    <span>
                                                        {cp.name} ({cp.colors.length})
                                                    </span>
                                                    <div className="flex gap-1">
                                                        {cp.colors
                                                            .slice(0, 5)
                                                            .map((c: string, i: number) => (
                                                                <div
                                                                    key={i}
                                                                    className="rounded border border-border/70 select-none"
                                                                    style={{
                                                                        background: c,
                                                                        width: '15px',
                                                                        height: '15px',
                                                                        aspectRatio: '1',
                                                                    }}
                                                                />
                                                            ))}
                                                        {cp.colors.length > 5 && (
                                                            <div className="text-xs text-muted-foreground">
                                                                +{cp.colors.length - 5}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </>
                                )}
                            </SelectContent>
                        </Select>
                        <PaletteManager
                            customPalettes={customPalettes}
                            allPalettes={allPalettes}
                            selectedPalette={selectedPalette}
                            importFeedback={importFeedback}
                            importInputRef={importInputRef}
                            onCreatePalette={onCreatePalette}
                            onUpdatePalette={onUpdatePalette}
                            onDeletePalette={onDeletePalette}
                            onExportPalette={onExportPalette}
                            onImportFile={onImportPaletteFile}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="final-colors" className="font-medium">
                                Number of Colors
                            </Label>
                        </div>
                        <NumberInput
                            id="final-colors"
                            min={2}
                            max={256}
                            value={localColors}
                            onChange={(e) => {
                                const v = Number(e.target.value);
                                if (!Number.isNaN(v)) {
                                    setLocalColors(v);
                                }
                            }}
                            onBlur={() => {
                                // clamp and commit on blur
                                const clamped = Math.max(2, Math.min(256, localColors));
                                setLocalColors(clamped);
                                onFinalColorsChange(clamped);
                            }}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="weight" className="font-medium">
                                Algorithm Weight
                            </Label>
                        </div>
                        <NumberInput
                            id="weight"
                            min={2}
                            max={256}
                            value={localWeight}
                            disabled={weightDisabled}
                            onChange={(e) => {
                                const v = Number(e.target.value);
                                if (!Number.isNaN(v)) {
                                    setLocalWeight(v);
                                }
                            }}
                            onBlur={() => {
                                const clamped = Math.max(2, Math.min(256, localWeight));
                                setLocalWeight(clamped);
                                onWeightChange(clamped);
                            }}
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
                <Button
                    onClick={onApply}
                    data-testid="quantize-apply"
                    disabled={disabled || applying}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold disabled:bg-green-600/50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg active:scale-95 gap-1.5"
                >
                    {applying ? (
                        <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                        <Check className="w-4 h-4" />
                    )}
                    <span>{applying ? 'Applying...' : 'Apply'}</span>
                </Button>
            </div>
        </CollapsibleCard>
    );
};

export default ControlsPanel;
