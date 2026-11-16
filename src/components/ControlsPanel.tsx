import { useTranslation } from 'react-i18next';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
    selectedPaletteIds: string[];
    onPalettesSelect: (ids: string[]) => void;
    applying?: boolean;
    onReset?: () => void;
    // Palette manager props
    allPalettes: MergedPalette[];
    customPalettes: CustomPalette[];
    importFeedback: string | null;
    importInputRef: React.RefObject<HTMLInputElement | null>;
    onCreatePalette: (
        name: string,
        colors: string[],
        disabledColors?: number[],
        colorNames?: string[]
    ) => void;
    onUpdatePalette: (
        id: string,
        patch: {
            name?: string;
            colors?: string[];
            disabledColors?: number[];
            colorNames?: string[];
        }
    ) => void;
    onClonePalette: (id: string) => void;
    onDeletePalette: (id: string) => void;
    onExportPalette: (id: string) => void;
    onImportPaletteFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
    paletteEditorOpen: boolean;
    onPaletteEditorOpenChange: (open: boolean) => void;
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
    selectedPaletteIds,
    onPalettesSelect,
    applying = false,
    onReset,
    allPalettes,
    customPalettes,
    importFeedback,
    importInputRef,
    onCreatePalette,
    onUpdatePalette,
    onClonePalette,
    onDeletePalette,
    onExportPalette,
    onImportPaletteFile,
    paletteEditorOpen,
    onPaletteEditorOpenChange,
}) => {
    const { t } = useTranslation('workspace');
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
            title={t('controlsPanel.quantizationSettings')}
            subtitle={t('controlsPanel.configurePaletteAndReduceColors')}
            collapsedSummary={
                applying ? (
                    <Loader
                        className="w-4 h-4 animate-spin text-muted-foreground"
                        aria-label={t('controlsPanel.applyingQuantization')}
                    />
                ) : !allDefault ? (
                    <DirtyDot title={t('controlsPanel.quantizationSettingsModified')} />
                ) : undefined
            }
            actions={
                onReset && (
                    <button
                        type="button"
                        onClick={onReset}
                        disabled={allDefault}
                        title={t('controlsPanel.resetQuantizationSettingsToDefault')}
                        aria-label={t('controlsPanel.resetQuantizationSettings')}
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
                            {t('controlsPanel.palette')}
                        </Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    id="palette-select"
                                    aria-label={t('controlsPanel.palette')}
                                    className="border rounded w-full px-3 py-2 text-left"
                                >
                                    {selectedPaletteIds.length === 1
                                        ? allPalettes.find((p) => p.id === selectedPaletteIds[0])
                                              ?.label
                                        : selectedPaletteIds.length
                                          ? t('controlsPanel.selectedPalettes', {
                                                count: selectedPaletteIds.length,
                                            })
                                          : t('controlsPanel.auto')}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-96 max-w-[90vw] max-h-80 overflow-y-auto space-y-2"
                                align="start"
                                aria-label={t('controlsPanel.palette')}
                            >
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={!selectedPaletteIds.length}
                                        onChange={() => onPalettesSelect([])}
                                    />
                                    {t('controlsPanel.auto')}
                                </label>
                                {allPalettes
                                    .filter((p) => p.id !== 'auto')
                                    .map((p, i, entries) => (
                                        <div key={p.id}>
                                            {p.group === 'supplier' &&
                                                entries[i - 1]?.group !== 'supplier' && (
                                                    <>
                                                        <p className="text-xs font-semibold mt-3 mb-1">
                                                            {t('controlsPanel.supplierPalettes')}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground mb-2">
                                                            {t(
                                                                'controlsPanel.unofficialReferencePalettesOfFilamentColorNamesAndHex'
                                                            )}
                                                        </p>
                                                    </>
                                                )}
                                            {p.custom && !entries[i - 1]?.custom && (
                                                <p className="text-xs font-semibold mt-3 mb-1">
                                                    {t('controlsPanel.customPalettes')}
                                                </p>
                                            )}
                                            <label className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    aria-label={p.label}
                                                    checked={selectedPaletteIds.includes(p.id)}
                                                    disabled={
                                                        !p.size &&
                                                        !selectedPaletteIds.includes(p.id)
                                                    }
                                                    onChange={(e) =>
                                                        onPalettesSelect(
                                                            e.target.checked
                                                                ? [...selectedPaletteIds, p.id]
                                                                : selectedPaletteIds.filter(
                                                                      (id) => id !== p.id
                                                                  )
                                                        )
                                                    }
                                                />
                                                <span>
                                                    {p.label} (
                                                    {p.totalColors !== undefined &&
                                                    p.totalColors !== p.size
                                                        ? `${p.size}/${p.totalColors}`
                                                        : p.size}
                                                    )
                                                </span>
                                                <span className="flex gap-0.5 ml-auto">
                                                    {p.colors.slice(0, 5).map((color, index) => (
                                                        <span
                                                            key={index}
                                                            className="w-3 h-3 rounded-sm border"
                                                            style={{ background: color }}
                                                        />
                                                    ))}
                                                </span>
                                            </label>
                                        </div>
                                    ))}
                            </PopoverContent>
                        </Popover>
                        <p className="text-xs text-muted-foreground">
                            {t('controlsPanel.reduceThenMatch')} {t('controlsPanel.sharedMatches')}
                        </p>
                        <PaletteManager
                            customPalettes={customPalettes}
                            allPalettes={allPalettes}
                            selectedPalette={selectedPalette}
                            importFeedback={importFeedback}
                            importInputRef={importInputRef}
                            onCreatePalette={onCreatePalette}
                            onUpdatePalette={onUpdatePalette}
                            onClonePalette={onClonePalette}
                            onDeletePalette={onDeletePalette}
                            onExportPalette={onExportPalette}
                            onImportFile={onImportPaletteFile}
                            dialogOpen={paletteEditorOpen}
                            onDialogOpenChange={onPaletteEditorOpenChange}
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="final-colors" className="font-medium">
                                {t('controlsPanel.numberOfColors')}
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
                                {t('controlsPanel.algorithmWeight')}
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
                            {t('controlsPanel.algorithm')}
                        </Label>
                        <Select value={algorithm} onValueChange={setAlgorithm}>
                            <SelectTrigger>
                                <SelectValue placeholder={t('controlsPanel.selectAlgorithm')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">
                                    {t('controlsPanel.nonePostprocessOnly')}
                                </SelectItem>
                                <SelectItem value="posterize">
                                    {t('controlsPanel.posterize')}
                                </SelectItem>
                                <SelectItem value="median-cut">
                                    {t('controlsPanel.medianCut')}
                                </SelectItem>
                                <SelectItem value="kmeans">{t('controlsPanel.kMeans')}</SelectItem>
                                <SelectItem value="wu">{t('controlsPanel.wu')}</SelectItem>
                                <SelectItem value="octree">{t('controlsPanel.octree')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Button
                    onClick={onApply}
                    data-testid="quantize-apply"
                    disabled={
                        disabled ||
                        applying ||
                        (selectedPaletteIds.length > 0 &&
                            !allPalettes.some(
                                (p) => selectedPaletteIds.includes(p.id) && p.size > 0
                            ))
                    }
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold disabled:bg-green-600/50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg active:scale-95 gap-1.5"
                >
                    {applying ? (
                        <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                        <Check className="w-4 h-4" />
                    )}
                    <span>{applying ? t('controlsPanel.applying') : t('controlsPanel.apply')}</span>
                </Button>
            </div>
        </CollapsibleCard>
    );
};

export default ControlsPanel;
