/**
 * Frontlit Filament Calibration Dialog
 *
 * Camera-free calibration: pick one or more filaments, choose the base layer each
 * prints over (defaults to the darkest filament), download a calibration print
 * (STL or multi-material 3MF), then report the single layer count at which each
 * filament's wedge first matches its opaque reference rail. Each read is converted
 * to a frontlit TD and saved to the filament profile.
 */

import { useCallback, useMemo, useState } from 'react';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { X, Download, Check, Minus, ArrowLeft, ArrowRight, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Filament } from '../types';
import {
    computeFrontlitCalibration,
    predictFrontlitColor,
    getConfidenceLabel,
    getConfidenceColor,
    type FrontlitCalibration,
} from '@/lib/calibration';
import {
    generateCalibrationStl,
    generateCalibration3mf,
    DEFAULT_CALIBRATION_PRINT_OPTIONS,
    type CalibrationPrintOptions,
    type CalibrationTile,
} from '@/lib/generateCalibrationPrint';

type Step = 'select' | 'base' | 'print' | 'measure';
type PrintFormat = 'stl' | '3mf';

export interface CalibrationApplyUpdate {
    id: string;
    td: number;
    calibration: FrontlitCalibration;
}

interface FilamentCalibrationDialogProps {
    open: boolean;
    onClose: () => void;
    filaments: Filament[];
    initialFilamentId?: string | null;
    layerHeight: number;
    firstLayerHeight: number;
    onApply: (updates: CalibrationApplyUpdate[]) => void;
}

const MIN_MAX_LAYERS = 4;
const MAX_MAX_LAYERS = 40;

function filamentLabel(filament: Filament): string {
    return filament.name || filament.brand || `Filament ${filament.color}`;
}

function luminance(hex: string): number {
    const h = hex.replace(/^#/, '');
    if (h.length < 6) return 0;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbCss(rgb: [number, number, number]): string {
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function FilamentCalibrationDialog({
    open,
    onClose,
    filaments,
    initialFilamentId,
    layerHeight,
    firstLayerHeight,
    onApply,
}: FilamentCalibrationDialogProps) {
    const [step, setStep] = useState<Step>('select');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(initialFilamentId ? [initialFilamentId] : [])
    );
    const [maxLayers, setMaxLayers] = useState(DEFAULT_CALIBRATION_PRINT_OPTIONS.maxLayers);
    const [calibrationLayerHeight, setCalibrationLayerHeight] = useState(layerHeight);
    // Free-typing drafts for the numeric inputs; clamped to the committed value on blur.
    const [maxLayersDraft, setMaxLayersDraft] = useState(() =>
        String(DEFAULT_CALIBRATION_PRINT_OPTIONS.maxLayers)
    );
    const [layerHeightDraft, setLayerHeightDraft] = useState(() => String(layerHeight));
    const [format, setFormat] = useState<PrintFormat>('stl');
    const [reads, setReads] = useState<Record<string, string>>({});
    // filament id -> chosen base filament id (defaults to the darkest filament).
    const [baseChoices, setBaseChoices] = useState<Record<string, string>>({});

    const darkestFilamentId = useMemo(() => {
        if (filaments.length === 0) return undefined;
        return filaments.reduce((darkest, f) =>
            luminance(f.color) < luminance(darkest.color) ? f : darkest
        ).id;
    }, [filaments]);

    const resolveBaseId = useCallback(
        (filamentId: string): string => baseChoices[filamentId] ?? darkestFilamentId ?? filamentId,
        [baseChoices, darkestFilamentId]
    );

    const resolveBaseColor = useCallback(
        (filamentId: string): string => {
            const base = filaments.find((f) => f.id === resolveBaseId(filamentId));
            return base?.color ?? '#000000';
        },
        [filaments, resolveBaseId]
    );

    const setBaseChoice = useCallback((filamentId: string, baseId: string) => {
        setBaseChoices((prev) => ({ ...prev, [filamentId]: baseId }));
    }, []);

    const commitLayerHeight = useCallback(() => {
        const parsed = Number(layerHeightDraft);
        const next = Number.isFinite(parsed)
            ? Math.max(0.04, Math.min(0.4, parsed))
            : calibrationLayerHeight;
        setCalibrationLayerHeight(next);
        setLayerHeightDraft(String(next));
    }, [layerHeightDraft, calibrationLayerHeight]);

    const commitMaxLayers = useCallback(() => {
        const parsed = Math.round(Number(maxLayersDraft));
        const next =
            Number.isFinite(parsed) && parsed > 0
                ? Math.max(MIN_MAX_LAYERS, Math.min(MAX_MAX_LAYERS, parsed))
                : maxLayers;
        setMaxLayers(next);
        setMaxLayersDraft(String(next));
    }, [maxLayersDraft, maxLayers]);

    const selectedFilaments = useMemo(
        () => filaments.filter((f) => selectedIds.has(f.id)),
        [filaments, selectedIds]
    );

    const printOptions = useMemo<CalibrationPrintOptions>(
        () => ({
            ...DEFAULT_CALIBRATION_PRINT_OPTIONS,
            layerHeight: calibrationLayerHeight,
            firstLayerHeight,
            maxLayers,
        }),
        [calibrationLayerHeight, firstLayerHeight, maxLayers]
    );

    const reset = useCallback(() => {
        setStep('select');
        setSelectedIds(new Set(initialFilamentId ? [initialFilamentId] : []));
        setMaxLayers(DEFAULT_CALIBRATION_PRINT_OPTIONS.maxLayers);
        setMaxLayersDraft(String(DEFAULT_CALIBRATION_PRINT_OPTIONS.maxLayers));
        setCalibrationLayerHeight(layerHeight);
        setLayerHeightDraft(String(layerHeight));
        setFormat('stl');
        setReads({});
        setBaseChoices({});
    }, [initialFilamentId, layerHeight]);

    const handleClose = useCallback(() => {
        onClose();
        setTimeout(reset, 300);
    }, [onClose, reset]);

    const toggleFilament = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleAll = useCallback(() => {
        setSelectedIds((prev) =>
            prev.size === filaments.length ? new Set() : new Set(filaments.map((f) => f.id))
        );
    }, [filaments]);

    const handleDownload = useCallback(async () => {
        const tiles: CalibrationTile[] = selectedFilaments.map((f) => ({
            filamentId: f.id,
            color: f.color,
            baseFilamentId: resolveBaseId(f.id),
            baseColor: resolveBaseColor(f.id),
            name: filamentLabel(f),
        }));
        if (tiles.length === 0) return;

        if (format === 'stl') {
            // The wedge geometry is identical for every filament, so one STL is
            // printed once per filament (swapping the color above the base).
            const blob = generateCalibrationStl(printOptions);
            downloadBlob(blob, `kromacut-calibration-${maxLayers}layers.stl`);
        } else {
            // Slots follow the full profile order so they map to the user's machine.
            const profileFilaments = filaments.map((f) => ({
                id: f.id,
                color: f.color,
                name: filamentLabel(f),
            }));
            const blob = await generateCalibration3mf(tiles, printOptions, profileFilaments);
            downloadBlob(blob, `kromacut-calibration-${tiles.length}filaments.3mf`);
        }
    }, [selectedFilaments, filaments, format, printOptions, maxLayers, resolveBaseId, resolveBaseColor]);

    const setRead = useCallback((id: string, value: string) => {
        setReads((prev) => ({ ...prev, [id]: value }));
    }, []);

    // Per-filament calibration computed live from the entered reads.
    const computed = useMemo(() => {
        return selectedFilaments.map((filament) => {
            const raw = reads[filament.id];
            const opacityLayers = Number.parseInt(raw ?? '', 10);
            if (!Number.isFinite(opacityLayers) || opacityLayers < 1) {
                return { filament, result: null, opacityLayers: null };
            }
            const result = computeFrontlitCalibration({
                filamentColor: filament.color,
                opacityLayers,
                layerHeight: calibrationLayerHeight,
                firstLayerHeight,
                baseColor: resolveBaseColor(filament.id),
                maxLayers,
            });
            return { filament, result, opacityLayers };
        });
    }, [
        selectedFilaments,
        reads,
        calibrationLayerHeight,
        firstLayerHeight,
        maxLayers,
        resolveBaseColor,
    ]);

    const allReadsValid =
        computed.length > 0 && computed.every((c) => c.result !== null && c.result.ok);

    const handleSave = useCallback(() => {
        const updates: CalibrationApplyUpdate[] = [];
        for (const entry of computed) {
            if (entry.result && entry.result.ok) {
                updates.push({
                    id: entry.filament.id,
                    td: entry.result.calibration.tdSingleValue,
                    calibration: entry.result.calibration,
                });
            }
        }
        if (updates.length > 0) onApply(updates);
        handleClose();
    }, [computed, onApply, handleClose]);

    const renderSelect = () => (
        <>
            <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-primary" />
                    Calibrate Filaments
                </AlertDialogTitle>
            </AlertDialogHeader>
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Pick the filaments to calibrate. You&apos;ll print a small wedge for each over a
                    base layer, then read back a single number — no camera, no color picking.
                </p>
                {filaments.length > 0 && (
                    <button
                        type="button"
                        onClick={toggleAll}
                        className="flex w-full items-center justify-between rounded-lg px-1 py-1"
                    >
                        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <span
                                className={cn(
                                    'flex h-5 w-5 flex-none items-center justify-center rounded-md border',
                                    selectedIds.size > 0
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border'
                                )}
                            >
                                {selectedIds.size === filaments.length ? (
                                    <Check className="h-3.5 w-3.5" />
                                ) : selectedIds.size > 0 ? (
                                    <Minus className="h-3.5 w-3.5" />
                                ) : null}
                            </span>
                            {selectedIds.size === filaments.length ? 'Deselect all' : 'Select all'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {selectedIds.size} of {filaments.length}
                        </span>
                    </button>
                )}
                <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
                    {filaments.map((filament) => {
                        const selected = selectedIds.has(filament.id);
                        const isCalibrated = !!filament.calibration;
                        return (
                            <button
                                key={filament.id}
                                type="button"
                                onClick={() => toggleFilament(filament.id)}
                                className={cn(
                                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                                    selected
                                        ? 'border-primary/60 bg-primary/5'
                                        : 'border-border/60 bg-card hover:border-border'
                                )}
                            >
                                <span
                                    className={cn(
                                        'flex h-5 w-5 flex-none items-center justify-center rounded-md border',
                                        selected
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border'
                                    )}
                                >
                                    {selected && <Check className="h-3.5 w-3.5" />}
                                </span>
                                <span
                                    className="h-7 w-7 flex-none rounded-lg border border-border/70 shadow-inner"
                                    style={{ backgroundColor: filament.color }}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-foreground">
                                        {filamentLabel(filament)}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        TD {filament.td.toFixed(2)}mm
                                        {isCalibrated ? ' · calibrated' : ''}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
            <AlertDialogFooter>
                <Button variant="outline" onClick={handleClose}>
                    Cancel
                </Button>
                <Button onClick={() => setStep('base')} disabled={selectedIds.size === 0}>
                    Next: Base
                    <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
            </AlertDialogFooter>
        </>
    );

    const renderBase = () => (
        <>
            <AlertDialogHeader>
                <AlertDialogTitle>Pick Base Layers</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Each filament is calibrated over a base, defaulting to your darkest filament. A
                    dark filament needs a lighter base (e.g. white) to read against — change its base
                    here.
                </p>
                <div className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">
                    {selectedFilaments.map((filament) => {
                        const baseId = baseChoices[filament.id] ?? darkestFilamentId ?? '';
                        return (
                            <Card key={filament.id} className="flex items-center gap-3 p-3">
                                <span
                                    className="h-7 w-7 flex-none rounded-lg border border-border/70 shadow-inner"
                                    style={{ backgroundColor: filament.color }}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-foreground">
                                        {filamentLabel(filament)}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground">over base</div>
                                </div>
                                <Select
                                    value={baseId}
                                    onValueChange={(v) => setBaseChoice(filament.id, v)}
                                >
                                    <SelectTrigger className="h-9 w-48">
                                        <SelectValue placeholder="Base filament" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {filaments.map((bf) => (
                                            <SelectItem key={bf.id} value={bf.id}>
                                                <span className="flex items-center gap-2">
                                                    <span
                                                        className="h-4 w-4 flex-none rounded border border-border/70"
                                                        style={{ backgroundColor: bf.color }}
                                                    />
                                                    <span className="truncate">
                                                        {filamentLabel(bf)}
                                                    </span>
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Card>
                        );
                    })}
                </div>
            </div>
            <AlertDialogFooter>
                <Button variant="outline" onClick={() => setStep('select')}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back
                </Button>
                <Button onClick={() => setStep('print')}>
                    Next: Print
                    <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
            </AlertDialogFooter>
        </>
    );

    const renderPrint = () => (
        <>
            <AlertDialogHeader>
                <AlertDialogTitle>Print the Calibration Wedge</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="space-y-4">
                <Card className="space-y-4 p-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Layer height (mm)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                min="0.04"
                                max="0.4"
                                value={layerHeightDraft}
                                onChange={(e) => setLayerHeightDraft(e.target.value)}
                                onBlur={commitLayerHeight}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                }}
                                className="h-8"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Use the layer height you print your models at.
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Max layers (wedge length)</Label>
                            <Input
                                type="number"
                                step="1"
                                min={MIN_MAX_LAYERS}
                                max={MAX_MAX_LAYERS}
                                value={maxLayersDraft}
                                onChange={(e) => setMaxLayersDraft(e.target.value)}
                                onBlur={commitMaxLayers}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                }}
                                className="h-8"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                The wedge runs 1…{maxLayers} layers. Raise it for very translucent
                                filaments.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">Format</Label>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setFormat('stl')}
                                className={cn(format === 'stl' && 'border-primary/60 bg-primary/5')}
                            >
                                STL (any printer)
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setFormat('3mf')}
                                className={cn(format === '3mf' && 'border-primary/60 bg-primary/5')}
                            >
                                3MF (multi-material)
                            </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            {format === 'stl'
                                ? 'Single solid. Print it once per filament: base, then swap to the color above the base.'
                                : 'Colors + bases baked in for AMS / multi-material — all selected filaments in one print.'}
                        </p>
                    </div>

                    <Button onClick={handleDownload} className="w-full gap-2">
                        <Download className="h-4 w-4" />
                        Download {format.toUpperCase()}
                    </Button>
                </Card>

                <Card className="space-y-2 bg-muted/20 p-4 text-sm">
                    <p className="font-semibold">How to read it back</p>
                    <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
                        <li>View the print flat under normal room light.</li>
                        <li>
                            The patches step from 1 layer (the tab end) up to {maxLayers}, with an
                            opaque reference rail running along the back edge.
                        </li>
                        <li>
                            Find the <span className="font-medium text-foreground">first patch</span>{' '}
                            that looks identical to the rail beside it — that&apos;s its opacity layer.
                        </li>
                    </ul>
                </Card>
            </div>
            <AlertDialogFooter>
                <Button variant="outline" onClick={() => setStep('base')}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back
                </Button>
                <Button onClick={() => setStep('measure')}>
                    Next: Enter Results
                    <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
            </AlertDialogFooter>
        </>
    );

    const renderMeasure = () => (
        <>
            <AlertDialogHeader>
                <AlertDialogTitle>Enter Opacity Layers</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                    For each filament, enter the first patch number that matched its reference rail.
                </p>
                <div className="max-h-[26rem] space-y-2.5 overflow-y-auto pr-1">
                    {computed.map(({ filament, result, opacityLayers }) => {
                        const calibration = result && result.ok ? result.calibration : null;
                        const errorText = result && !result.ok ? result.error : null;
                        const predicted =
                            calibration && opacityLayers
                                ? predictFrontlitColor(
                                      filament.color,
                                      opacityLayers,
                                      calibrationLayerHeight,
                                      calibration.td,
                                      resolveBaseColor(filament.id)
                                  )
                                : null;
                        return (
                            <Card key={filament.id} className="p-3">
                                <div className="flex items-center gap-3">
                                    <span
                                        className="h-8 w-8 flex-none rounded-lg border border-border/70 shadow-inner"
                                        style={{ backgroundColor: filament.color }}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium">
                                            {filamentLabel(filament)}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">
                                            {filament.color}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Input
                                            type="number"
                                            min={1}
                                            max={maxLayers}
                                            value={reads[filament.id] ?? ''}
                                            onChange={(e) => setRead(filament.id, e.target.value)}
                                            placeholder="layer"
                                            className="h-8 w-20 text-sm"
                                        />
                                        <span className="text-[11px] text-muted-foreground">
                                            / {maxLayers}
                                        </span>
                                    </div>
                                </div>

                                {calibration && (
                                    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-muted-foreground">
                                                Match
                                            </span>
                                            <span
                                                className="h-6 w-6 rounded border border-border/70"
                                                style={{ backgroundColor: filament.color }}
                                                title="Reference (opaque)"
                                            />
                                            {predicted && (
                                                <span
                                                    className="h-6 w-6 rounded border border-border/70"
                                                    style={{ backgroundColor: rgbCss(predicted) }}
                                                    title="Predicted at this layer"
                                                />
                                            )}
                                        </div>
                                        <div className="text-right text-xs">
                                            <div className="font-semibold">
                                                TD {calibration.tdSingleValue.toFixed(2)}mm
                                            </div>
                                            <div
                                                className={cn(
                                                    'text-[11px] font-medium',
                                                    getConfidenceColor(calibration.confidence)
                                                )}
                                            >
                                                {getConfidenceLabel(calibration.confidence)}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {errorText && (
                                    <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                                        {errorText}
                                    </p>
                                )}
                            </Card>
                        );
                    })}
                </div>
            </div>
            <AlertDialogFooter>
                <Button variant="outline" onClick={() => setStep('print')}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back
                </Button>
                <Button onClick={handleSave} disabled={!allReadsValid}>
                    <Check className="mr-1 h-4 w-4" />
                    Save Calibration
                </Button>
            </AlertDialogFooter>
        </>
    );

    return (
        <AlertDialog
            open={open}
            onOpenChange={(isOpen) => {
                if (!isOpen) handleClose();
            }}
        >
            <AlertDialogContent className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(96vw,42rem)] max-w-[42rem] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg">
                <AlertDialogDescription className="sr-only">
                    Frontlit filament calibration: generate a print and read back opacity layers to
                    derive transmission distance.
                </AlertDialogDescription>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClose}
                    className="absolute right-3 top-3 h-7 w-7 text-muted-foreground hover:text-foreground"
                    aria-label="Close calibration dialog"
                >
                    <X className="h-4 w-4" />
                </Button>
                {step === 'select' && renderSelect()}
                {step === 'base' && renderBase()}
                {step === 'print' && renderPrint()}
                {step === 'measure' && renderMeasure()}
            </AlertDialogContent>
        </AlertDialog>
    );
}
