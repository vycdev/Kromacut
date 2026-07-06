/**
 * Frontlit Filament Calibration Dialog
 *
 * Camera-free calibration: pick one or more filaments, choose the base layer each
 * prints over (defaults to the darkest filament), download a calibration print
 * (STL or multi-material 3MF), then report the single layer count at which each
 * filament's wedge first matches its opaque reference rail. Each read is converted
 * to a frontlit TD and saved to the filament profile.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    X,
    Download,
    Check,
    Minus,
    ArrowLeft,
    ArrowRight,
    FlaskConical,
    AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Filament } from '../types';
import {
    activeFrontlitCalibration,
    channelHds,
    computeFrontlitCalibration,
    computeFrontlitCalibrationSession,
    predictFrontlitColor,
    predictOpacityLayersForTds,
    solveOpacityTransmission,
    getConfidenceLabel,
    getConfidenceColor,
    OPACITY_JND,
    type FrontlitCalibration,
    type FrontlitCalibrationRead,
} from '@/lib/calibration';
import {
    generateCalibrationStl,
    generateCalibration3mf,
    calibrationBaseHeight,
    DEFAULT_CALIBRATION_PRINT_OPTIONS,
    type CalibrationPrintOptions,
    type CalibrationTile,
} from '@/lib/generateCalibrationPrint';

type Step = 'select' | 'base' | 'print' | 'measure';
type PrintFormat = 'stl' | '3mf';
type CalibrationMode = 'quick' | 'accurate';

export interface CalibrationApplyUpdate {
    id: string;
    td: number;
    calibration: FrontlitCalibration;
}

interface FilamentCalibrationDialogProps {
    open: boolean;
    onClose: () => void;
    filaments: Filament[];
    layerHeight: number;
    firstLayerHeight: number;
    onApply: (updates: CalibrationApplyUpdate[]) => void;
}

const MIN_MAX_LAYERS = 4;
const MAX_MAX_LAYERS = 40;
const MAX_BASES_PER_FILAMENT = 3;

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

function hexToRgbTuple(hex: string): [number, number, number] {
    const h = hex.replace(/^#/, '');
    return [
        parseInt(h.slice(0, 2), 16) || 0,
        parseInt(h.slice(2, 4), 16) || 0,
        parseInt(h.slice(4, 6), 16) || 0,
    ];
}

function readKey(filamentId: string, baseId: string): string {
    return `${filamentId}::${baseId}`;
}

function parseLayerInput(value: string | undefined): number | null {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

function governingChannel(
    filamentColor: string,
    baseColor: string,
    td: [number, number, number]
): number {
    const filament = hexToRgbTuple(filamentColor);
    const base = hexToRgbTuple(baseColor);
    let best = 0;
    let bestScore = -Infinity;
    for (let channel = 0; channel < 3; channel++) {
        const score = Math.abs(filament[channel] - base[channel]) * td[channel];
        if (score > bestScore) {
            best = channel;
            bestScore = score;
        }
    }
    return best;
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function formatMm(value: number): string {
    return `${value.toFixed(2)} mm`;
}

export function FilamentCalibrationDialog({
    open,
    onClose,
    filaments,
    layerHeight,
    firstLayerHeight,
    onApply,
}: FilamentCalibrationDialogProps) {
    const [step, setStep] = useState<Step>('select');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
    const [maxLayers, setMaxLayers] = useState(DEFAULT_CALIBRATION_PRINT_OPTIONS.maxLayers);
    const [calibrationLayerHeight, setCalibrationLayerHeight] = useState(layerHeight);
    // Free-typing drafts for the numeric inputs; clamped to the committed value on blur.
    const [maxLayersDraft, setMaxLayersDraft] = useState(() =>
        String(DEFAULT_CALIBRATION_PRINT_OPTIONS.maxLayers)
    );
    const [layerHeightDraft, setLayerHeightDraft] = useState(() => String(layerHeight));
    const [format, setFormat] = useState<PrintFormat>('stl');
    const [mode, setMode] = useState<CalibrationMode>('quick');
    const [reads, setReads] = useState<Record<string, string>>({});
    const [mergeReads, setMergeReads] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    // filament id -> chosen base filament ids (defaults are auto-picked).
    const [baseChoices, setBaseChoices] = useState<Record<string, string[]>>({});
    const wasOpenRef = useRef(open);

    const darkestFilamentId = useMemo(() => {
        if (filaments.length === 0) return undefined;
        return filaments.reduce((darkest, f) =>
            luminance(f.color) < luminance(darkest.color) ? f : darkest
        ).id;
    }, [filaments]);

    const lightestFilamentId = useMemo(() => {
        if (filaments.length === 0) return undefined;
        return filaments.reduce((lightest, f) =>
            luminance(f.color) > luminance(lightest.color) ? f : lightest
        ).id;
    }, [filaments]);

    const filamentById = useMemo(
        () => new Map(filaments.map((filament) => [filament.id, filament])),
        [filaments]
    );

    const estimateChannelTds = useCallback(
        // `td` already stores the frontlit hiding distance (schema v2).
        (filament: Filament): [number, number, number] => channelHds(filament),
        []
    );

    const recommendedBaseIds = useCallback(
        (filament: Filament): string[] => {
            const targetCount = mode === 'accurate' ? 2 : 1;
            const td = estimateChannelTds(filament);
            const candidates = filaments
                .map((base) => {
                    if (!solveOpacityTransmission(filament.color, OPACITY_JND, base.color)) {
                        return null;
                    }
                    const predicted = predictOpacityLayersForTds(
                        filament.color,
                        td,
                        calibrationLayerHeight,
                        OPACITY_JND,
                        base.color,
                        maxLayers
                    );
                    if (predicted === undefined) return null;
                    const useful = predicted > 1 && predicted <= maxLayers;
                    return {
                        base,
                        predicted,
                        useful,
                        channel: governingChannel(filament.color, base.color, td),
                    };
                })
                .filter(
                    (candidate): candidate is NonNullable<typeof candidate> => candidate !== null
                );

            const useful = candidates.filter((candidate) => candidate.useful);
            const pool = useful.length > 0 ? useful : candidates;
            if (pool.length === 0) {
                return [lightestFilamentId ?? darkestFilamentId ?? filament.id];
            }

            const selected: typeof pool = [];
            const anchor =
                pool.find((candidate) => candidate.base.id === darkestFilamentId) ??
                [...pool].sort((a, b) => luminance(a.base.color) - luminance(b.base.color))[0];
            selected.push(anchor);

            while (selected.length < targetCount && selected.length < pool.length) {
                const covered = new Set(selected.map((candidate) => candidate.channel));
                const next = pool
                    .filter(
                        (candidate) => !selected.some((item) => item.base.id === candidate.base.id)
                    )
                    .sort((a, b) => {
                        const aDiversity = covered.has(a.channel) ? 0 : 1;
                        const bDiversity = covered.has(b.channel) ? 0 : 1;
                        const aMidness =
                            1 - Math.abs(a.predicted - maxLayers / 2) / Math.max(1, maxLayers / 2);
                        const bMidness =
                            1 - Math.abs(b.predicted - maxLayers / 2) / Math.max(1, maxLayers / 2);
                        return bDiversity * 10 + bMidness - (aDiversity * 10 + aMidness);
                    })[0];
                if (!next) break;
                selected.push(next);
            }

            return selected.map((candidate) => candidate.base.id);
        },
        [
            calibrationLayerHeight,
            darkestFilamentId,
            estimateChannelTds,
            filaments,
            lightestFilamentId,
            maxLayers,
            mode,
        ]
    );

    const resolveBaseIds = useCallback(
        (filamentId: string): string[] => {
            const filament = filamentById.get(filamentId);
            if (!filament) return [];
            const explicit = baseChoices[filamentId]?.filter((id) => filamentById.has(id));
            if (explicit && explicit.length > 0) return explicit;
            return recommendedBaseIds(filament).filter((id) => filamentById.has(id));
        },
        [baseChoices, filamentById, recommendedBaseIds]
    );

    const toggleBaseChoice = useCallback(
        (filamentId: string, baseId: string) => {
            const current = resolveBaseIds(filamentId);
            if (mode === 'quick') {
                setBaseChoices((prev) => ({ ...prev, [filamentId]: [baseId] }));
                return;
            }

            let next: string[];
            if (current.includes(baseId)) {
                next = current.length > 1 ? current.filter((id) => id !== baseId) : current;
            } else {
                next =
                    current.length >= MAX_BASES_PER_FILAMENT
                        ? [...current.slice(1), baseId]
                        : [...current, baseId];
            }
            setBaseChoices((prev) => ({ ...prev, [filamentId]: next }));
        },
        [mode, resolveBaseIds]
    );

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

    const calibrationTargets = useMemo(() => {
        return selectedFilaments.flatMap((filament) =>
            resolveBaseIds(filament.id)
                .map((baseId) => {
                    const base = filamentById.get(baseId);
                    if (!base) return null;
                    return {
                        key: readKey(filament.id, base.id),
                        filament,
                        base,
                    };
                })
                .filter((target): target is NonNullable<typeof target> => target !== null)
        );
    }, [filamentById, resolveBaseIds, selectedFilaments]);

    const printOptions = useMemo<CalibrationPrintOptions>(
        () => ({
            ...DEFAULT_CALIBRATION_PRINT_OPTIONS,
            layerHeight: calibrationLayerHeight,
            firstLayerHeight,
            maxLayers,
        }),
        [calibrationLayerHeight, firstLayerHeight, maxLayers]
    );
    const firstLayerPrintHeight = Math.max(calibrationLayerHeight, firstLayerHeight);
    const swapZ = calibrationBaseHeight(printOptions);

    const reset = useCallback(() => {
        setStep('select');
        setSelectedIds(new Set());
        setMaxLayers(DEFAULT_CALIBRATION_PRINT_OPTIONS.maxLayers);
        setMaxLayersDraft(String(DEFAULT_CALIBRATION_PRINT_OPTIONS.maxLayers));
        setCalibrationLayerHeight(layerHeight);
        setLayerHeightDraft(String(layerHeight));
        setFormat('stl');
        setMode('quick');
        setReads({});
        setMergeReads({});
        setIsSaving(false);
        setBaseChoices({});
    }, [layerHeight]);

    useEffect(() => {
        if (open && !wasOpenRef.current) reset();
        wasOpenRef.current = open;
    }, [open, reset]);

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
        const tiles: CalibrationTile[] = calibrationTargets.map(({ filament, base }) => ({
            filamentId: filament.id,
            color: filament.color,
            baseFilamentId: base.id,
            baseColor: base.color,
            name: `${filamentLabel(filament)} over ${filamentLabel(base)}`,
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
            downloadBlob(blob, `kromacut-calibration-${tiles.length}reads.3mf`);
        }
    }, [calibrationTargets, filaments, format, printOptions, maxLayers]);

    const setRead = useCallback((key: string, value: string) => {
        setReads((prev) => ({ ...prev, [key]: value }));
    }, []);

    const setMergeRead = useCallback((key: string, value: string) => {
        setMergeReads((prev) => ({ ...prev, [key]: value }));
    }, []);

    // Complete read inputs per filament (merge reads excluded — they never
    // affect the fit, only the saved record).
    const readInputs = useMemo(() => {
        return selectedFilaments.map((filament) => {
            const targets = calibrationTargets.filter(
                (target) => target.filament.id === filament.id
            );
            const readValues: FrontlitCalibrationRead[] = [];
            let complete = targets.length > 0;
            for (const target of targets) {
                const opacityLayers = parseLayerInput(reads[target.key]);
                if (opacityLayers === null) {
                    complete = false;
                    continue;
                }
                readValues.push({
                    baseColor: target.base.color,
                    opacityLayers,
                });
            }
            const input = complete
                ? {
                      filamentColor: filament.color,
                      opacityLayers: readValues[0]?.opacityLayers,
                      layerHeight: calibrationLayerHeight,
                      firstLayerHeight,
                      baseColor: readValues[0]?.baseColor,
                      reads: readValues,
                      maxLayers,
                  }
                : null;
            return { filament, targets, input };
        });
    }, [
        selectedFilaments,
        calibrationTargets,
        reads,
        calibrationLayerHeight,
        firstLayerHeight,
        maxLayers,
    ]);

    // Session JND fit, computed once in the background when the entered reads
    // settle. Preview and Save both consume this cached result so the values
    // shown are exactly the values saved.
    const sessionKey = useMemo(
        () => JSON.stringify(readInputs.map((entry) => entry.input)),
        [readInputs]
    );
    const [sessionJndFit, setSessionJndFit] = useState<{
        key: string;
        jnd: number;
        jndSource: 'default' | 'session-fit';
    } | null>(null);
    const [isFittingJnd, setIsFittingJnd] = useState(false);
    const latestSessionKeyRef = useRef(sessionKey);
    latestSessionKeyRef.current = sessionKey;

    // The JND search needs at least two multi-base filaments with complete
    // reads; anything less always resolves to the default JND.
    const sessionFitEligible = useMemo(() => {
        if (readInputs.length === 0) return false;
        if (readInputs.some((entry) => entry.input === null)) return false;
        const multiBase = readInputs.filter(
            (entry) => (entry.input?.reads?.length ?? 0) >= 2
        );
        return multiBase.length >= 2;
    }, [readInputs]);

    useEffect(() => {
        if (!sessionFitEligible) {
            setSessionJndFit(null);
            return;
        }
        if (sessionJndFit?.key === sessionKey) return;
        const ready = readInputs
            .map((entry) => entry.input)
            .filter((input): input is NonNullable<typeof input> => input !== null);

        const key = sessionKey;
        const timer = window.setTimeout(() => {
            if (latestSessionKeyRef.current !== key) return;
            setIsFittingJnd(true);
            // Defer past a paint so the "fitting" state renders before the
            // multi-second search blocks the main thread.
            window.requestAnimationFrame(() => {
                window.setTimeout(() => {
                    try {
                        if (latestSessionKeyRef.current !== key) return;
                        const session = computeFrontlitCalibrationSession({
                            filaments: ready,
                            maxLayers,
                        });
                        setSessionJndFit({
                            key,
                            jnd: session.jnd,
                            jndSource: session.jndSource,
                        });
                    } finally {
                        setIsFittingJnd(false);
                    }
                });
            });
        }, 800);
        return () => window.clearTimeout(timer);
    }, [readInputs, sessionFitEligible, sessionKey, sessionJndFit, maxLayers]);

    const activeJndFit = sessionJndFit?.key === sessionKey ? sessionJndFit : null;
    // True while an eligible session fit hasn't landed yet (debounce + search).
    // Save is blocked during this window so saved values always match preview.
    const sessionFitPending = sessionFitEligible && activeJndFit === null;

    // Per-filament calibration computed live from the entered reads, using the
    // fitted session JND once it is available.
    const computed = useMemo(() => {
        return readInputs.map(({ filament, targets, input }) => ({
            filament,
            targets,
            input,
            result: input
                ? computeFrontlitCalibration({
                      ...input,
                      jnd: activeJndFit?.jnd,
                      jndSource: activeJndFit?.jndSource,
                  })
                : null,
            jndSource: activeJndFit?.jndSource ?? null,
        }));
    }, [readInputs, activeJndFit]);

    const allReadsValid =
        computed.length > 0 && computed.every((c) => c.result !== null && c.result.ok);

    const handleSave = useCallback(() => {
        if (isSaving || sessionFitPending) return;
        setIsSaving(true);
        const saveEntries = computed.filter((entry) => entry.input && entry.result?.ok);
        window.requestAnimationFrame(() => {
            window.setTimeout(() => {
                try {
                    const saveInputs = saveEntries.map((entry) => {
                        const readsWithMerge: FrontlitCalibrationRead[] = entry.targets.map(
                            (target) => {
                                const opacityLayers = parseLayerInput(reads[target.key])!;
                                const mergeLayers = parseLayerInput(mergeReads[target.key]);
                                return {
                                    baseColor: target.base.color,
                                    opacityLayers,
                                    mergeLayers: mergeLayers ?? undefined,
                                };
                            }
                        );
                        return {
                            ...entry.input!,
                            reads: readsWithMerge,
                            opacityLayers: readsWithMerge[0]?.opacityLayers,
                            baseColor: readsWithMerge[0]?.baseColor,
                        };
                    });
                    // Compute exactly what the preview showed: the cached session
                    // JND when one exists, otherwise the default JND (the only
                    // no-cache case left is a non-eligible session, e.g. quick
                    // mode — Save is disabled while an eligible fit is pending).
                    const results = saveInputs.map((input) =>
                        computeFrontlitCalibration({
                            ...input,
                            jnd: activeJndFit?.jnd,
                            jndSource: activeJndFit?.jndSource,
                        })
                    );
                    const updates: CalibrationApplyUpdate[] = [];
                    results.forEach((result, index) => {
                        if (!result.ok) return;
                        const entry = saveEntries[index];
                        updates.push({
                            id: entry.filament.id,
                            td: result.calibration.tdSingleValue,
                            calibration: result.calibration,
                        });
                    });
                    if (updates.length > 0) onApply(updates);
                    handleClose();
                } finally {
                    setIsSaving(false);
                }
            });
        });
    }, [
        computed,
        activeJndFit,
        sessionFitPending,
        reads,
        mergeReads,
        onApply,
        handleClose,
        isSaving,
    ]);

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
                        const isCalibrated = !!activeFrontlitCalibration(filament);
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
                                        HD {filament.td.toFixed(2)} mm
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
                    Quick mode uses one base per filament. Accurate mode repeats the same read over
                    multiple bases so Kromacut can measure RGB hiding distances directly.
                </p>
                <div className="grid grid-cols-2 gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            setMode('quick');
                            setBaseChoices({});
                        }}
                        className={cn(mode === 'quick' && 'border-primary/60 bg-primary/5')}
                    >
                        Quick
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            setMode('accurate');
                            setBaseChoices({});
                        }}
                        className={cn(mode === 'accurate' && 'border-primary/60 bg-primary/5')}
                    >
                        Accurate
                    </Button>
                </div>
                <div className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">
                    {selectedFilaments.map((filament) => {
                        const baseIds = resolveBaseIds(filament.id);
                        return (
                            <Card key={filament.id} className="space-y-3 p-3">
                                <div className="flex items-center gap-3">
                                    <span
                                        className="h-7 w-7 flex-none rounded-lg border border-border/70 shadow-inner"
                                        style={{ backgroundColor: filament.color }}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium text-foreground">
                                            {filamentLabel(filament)}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">
                                            {mode === 'accurate'
                                                ? `${baseIds.length} base reads selected`
                                                : '1 base read selected'}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                    {filaments.map((base) => {
                                        const selected = baseIds.includes(base.id);
                                        return (
                                            <button
                                                key={base.id}
                                                type="button"
                                                onClick={() =>
                                                    toggleBaseChoice(filament.id, base.id)
                                                }
                                                className={cn(
                                                    'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                                                    selected
                                                        ? 'border-primary/60 bg-primary/5 text-foreground'
                                                        : 'border-border/60 bg-background hover:border-border'
                                                )}
                                            >
                                                <span
                                                    className="h-4 w-4 flex-none rounded border border-border/70"
                                                    style={{ backgroundColor: base.color }}
                                                />
                                                <span className="min-w-0 flex-1 truncate">
                                                    {filamentLabel(base)}
                                                </span>
                                                {selected && (
                                                    <Check className="h-3.5 w-3.5 flex-none" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
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
                                ? 'One printable tile. Print one copy for each filament/base read using the matching swap line below.'
                                : 'Colors + bases baked in for AMS / multi-material - all selected reads in one print.'}
                        </p>
                    </div>

                    {format === 'stl' && (
                        <div className="space-y-2 rounded-md border border-border/60 bg-background/70 p-3 text-[12px]">
                            <p className="text-muted-foreground">
                                Slice at layer height {formatMm(calibrationLayerHeight)} and first
                                layer {formatMm(firstLayerPrintHeight)}.
                            </p>
                            <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                                {calibrationTargets.map(({ key, filament, base }) => (
                                    <div
                                        key={key}
                                        className="flex items-start gap-2 text-foreground"
                                    >
                                        <span
                                            className="mt-0.5 h-3 w-3 flex-none rounded-sm border border-border/70"
                                            style={{ backgroundColor: filament.color }}
                                        />
                                        <span className="min-w-0">
                                            <span className="font-medium">
                                                {filamentLabel(filament)}
                                            </span>{' '}
                                            over {filamentLabel(base)}: swap after layer{' '}
                                            {printOptions.baseLayers} / Z {formatMm(swapZ)}.
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

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
                            Find the{' '}
                            <span className="font-medium text-foreground">first patch</span> that
                            looks identical to the rail beside it — that&apos;s its opacity layer.
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
                    Enter the first patch number that matched the rail for each filament/base print.
                    {isFittingJnd && (
                        <span className="ml-1.5 text-[11px] text-primary">
                            Fitting session JND…
                        </span>
                    )}
                </p>
                <div className="grid gap-1 rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                    <div>
                        <span className="font-semibold text-foreground">Match:</span> first patch
                        that matches the rail.
                    </div>
                    <div>
                        <span className="font-semibold text-foreground">Merge:</span> optional last
                        patch still different from the previous patch.
                    </div>
                </div>
                <div className="max-h-[26rem] space-y-2.5 overflow-y-auto pr-1">
                    {computed.map(({ filament, targets, result, jndSource }) => {
                        const calibration = result && result.ok ? result.calibration : null;
                        const errorText = result && !result.ok ? result.error : null;
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
                                    <div className="text-right text-[11px] text-muted-foreground">
                                        {targets.length} read{targets.length === 1 ? '' : 's'}
                                    </div>
                                </div>

                                <div className="mt-3 space-y-2">
                                    <div className="hidden grid-cols-[1fr_auto_auto] gap-2 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                                        <span>Base</span>
                                        <span className="w-[6.5rem]">Match rail</span>
                                        <span className="w-[6.5rem]">Merge steps</span>
                                    </div>
                                    {targets.map((target) => {
                                        const opacityLayers = parseLayerInput(reads[target.key]);
                                        const mergeLayers = parseLayerInput(mergeReads[target.key]);
                                        const mergeAfterMatch =
                                            mergeLayers !== null &&
                                            opacityLayers !== null &&
                                            mergeLayers > opacityLayers;
                                        const predicted =
                                            calibration && opacityLayers
                                                ? predictFrontlitColor(
                                                      filament.color,
                                                      opacityLayers,
                                                      calibrationLayerHeight,
                                                      calibration.td,
                                                      target.base.color
                                                  )
                                                : null;
                                        return (
                                            <div
                                                key={target.key}
                                                className="grid gap-2 rounded-md border border-border/50 bg-background/70 p-2 sm:grid-cols-[1fr_auto_auto]"
                                            >
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span
                                                        className="h-5 w-5 flex-none rounded border border-border/70"
                                                        style={{
                                                            backgroundColor: target.base.color,
                                                        }}
                                                        title="Base"
                                                    />
                                                    <span className="min-w-0 truncate text-xs">
                                                        over {filamentLabel(target.base)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        max={maxLayers}
                                                        value={reads[target.key] ?? ''}
                                                        onChange={(e) =>
                                                            setRead(target.key, e.target.value)
                                                        }
                                                        placeholder="match"
                                                        title="First patch that matches the reference rail"
                                                        className="h-8 w-20 text-sm"
                                                    />
                                                    <span className="text-[11px] text-muted-foreground">
                                                        / {maxLayers}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        max={maxLayers}
                                                        value={mergeReads[target.key] ?? ''}
                                                        onChange={(e) =>
                                                            setMergeRead(target.key, e.target.value)
                                                        }
                                                        placeholder="merge"
                                                        title="Optional: last patch that still looks different from the patch before it"
                                                        className={cn(
                                                            'h-8 w-20 text-sm',
                                                            mergeAfterMatch &&
                                                                'border-amber-500/70 bg-amber-500/10'
                                                        )}
                                                    />
                                                    {mergeAfterMatch && (
                                                        <span
                                                            title="Merge read is usually before or equal to the rail-match read"
                                                            aria-label="Merge read is later than match read"
                                                        >
                                                            <AlertTriangle className="h-3.5 w-3.5 flex-none text-amber-600" />
                                                        </span>
                                                    )}
                                                    {predicted && (
                                                        <span
                                                            className="h-6 w-6 rounded border border-border/70"
                                                            style={{
                                                                backgroundColor: rgbCss(predicted),
                                                            }}
                                                            title="Predicted at this read"
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {calibration && (
                                    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-muted-foreground">
                                                Fit
                                            </span>
                                            <span
                                                className="h-6 w-6 rounded border border-border/70"
                                                style={{ backgroundColor: filament.color }}
                                                title="Reference (opaque)"
                                            />
                                            <span className="text-[11px] text-muted-foreground">
                                                {calibration.channelSource === 'measured'
                                                    ? 'measured RGB HDs'
                                                    : 'heuristic RGB HDs'}
                                                {jndSource === 'session-fit'
                                                    ? ' / session JND'
                                                    : ''}
                                            </span>
                                        </div>
                                        <div className="text-right text-xs">
                                            <div className="font-semibold">
                                                HD {calibration.tdSingleValue.toFixed(2)} mm
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
                <Button
                    onClick={handleSave}
                    disabled={!allReadsValid || isSaving || sessionFitPending}
                >
                    <Check className="mr-1 h-4 w-4" />
                    {isSaving || sessionFitPending ? 'Fitting...' : 'Save Calibration'}
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
