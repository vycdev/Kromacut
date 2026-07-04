import React from 'react';
import { Card } from '@/components/ui/card';
import { NumberInput, Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Plus,
    Trash2,
    Sparkles,
    Save,
    Download,
    Upload,
    FilePlus,
    Pencil,
    BadgeCheck,
    Loader2,
    FlaskConical,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TabsContent } from '@/components/ui/tabs';
import type { AutoPaintResult, TransitionZone } from '../lib/autoPaint';
import type { AutoPaintProfile } from '../lib/profileManager';
import type { AutoPaintRepeatLimit, AutoPaintTransitionOpacity, Filament, Swatch } from '../types';
import FilamentRow from './FilamentRow';
import { FilamentCalibrationDialog, type CalibrationApplyUpdate } from './FilamentCalibrationDialog';
import { getConfidenceLabel, getConfidenceColor } from '../lib/calibration';
import { useNextBestColorWorker } from '../hooks/useNextBestColorWorker';

type OptimizerTierValue = 'fast' | 'balanced' | 'thorough' | 'deep' | 'exact';

interface OptimizerTierMeta {
    value: OptimizerTierValue;
    label: string;
}

const OPTIMIZER_TIERS: readonly OptimizerTierMeta[] = [
    {
        value: 'fast',
        label: 'Fast',
    },
    {
        value: 'balanced',
        label: 'Balanced',
    },
    {
        value: 'thorough',
        label: 'Thorough',
    },
    {
        value: 'deep',
        label: 'Deep',
    },
    {
        value: 'exact',
        label: 'Exact base order',
    },
];

interface AutoPaintSliceData {
    virtualSwatches: Swatch[];
    colorSliceHeights: number[];
    colorOrder: number[];
    filamentSwatches: Swatch[];
}

interface AutoPaintTabProps {
    // Filament state
    filaments: Filament[];
    addFilament: () => void;
    addFilamentWithProps: (props: { color: string; td: number; name: string }) => void;
    removeFilament: (id: string) => void;
    updateFilament: (id: string, updates: Partial<Omit<Filament, 'id'>>) => void;

    // Profile state
    profiles: AutoPaintProfile[];
    activeProfileId: string | null;
    isDirty: boolean;
    showSaveNewPopover: boolean;
    setShowSaveNewPopover: (v: boolean) => void;
    saveProfileName: string;
    setSaveProfileName: (v: string) => void;
    showRenamePopover: boolean;
    setShowRenamePopover: (v: boolean) => void;
    renameProfileName: string;
    setRenameProfileName: (v: string) => void;
    importFeedback: string | null;
    importInputRef: React.RefObject<HTMLInputElement | null>;
    handleSaveNewProfile: (name: string) => void;
    handleOverwriteProfile: () => void;
    handleRenameProfile: (name: string) => void;
    handleLoadProfile: (id: string) => void;
    handleDeleteProfile: (id: string) => void;
    handleExportProfile: () => void;
    handleImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;

    // Auto-paint state
    autoPaintMaxHeight: number | undefined;
    setAutoPaintMaxHeight: (v: number | undefined) => void;
    autoPaintResult?: AutoPaintResult;
    autoPaintSliceData?: AutoPaintSliceData;
    isComputing?: boolean;
    progress?: number;
    error?: string;
    calibrationLayerHeight: number;
    setCalibrationLayerHeight: (v: number) => void;
    firstLayerHeight: number;

    // Image colors
    filteredCount: number;
    imageSwatches: Array<{ hex: string; count?: number }>;

    // Enhanced matching options
    enhancedColorMatch: boolean;
    setEnhancedColorMatch: (v: boolean) => void;
    preserveSeparation: boolean;
    setPreserveSeparation: (v: boolean) => void;
    maxRepeatedSwaps: AutoPaintRepeatLimit;
    setMaxRepeatedSwaps: (v: AutoPaintRepeatLimit) => void;
    transitionOpacity: AutoPaintTransitionOpacity;
    setTransitionOpacity: (v: AutoPaintTransitionOpacity) => void;
    heightDithering: boolean;
    setHeightDithering: (v: boolean) => void;
    ditherLineWidth: number;
    setDitherLineWidth: (v: number) => void;

    // Flat Paint (flat face-down print)
    flatPaint: boolean;
    setFlatPaint: (v: boolean) => void;

    // Optimizer options
    optimizerAlgorithm: 'fast' | 'balanced' | 'thorough' | 'deep' | 'exact';
    setOptimizerAlgorithm: (v: 'fast' | 'balanced' | 'thorough' | 'deep' | 'exact') => void;
    optimizerSeed: number | undefined;
    setOptimizerSeed: (v: number | undefined) => void;
    regionWeightingMode: 'uniform' | 'center' | 'edge';
    setRegionWeightingMode: (v: 'uniform' | 'center' | 'edge') => void;
}

export default function AutoPaintTab({
    filaments,
    addFilament,
    addFilamentWithProps,
    removeFilament,
    updateFilament,
    profiles,
    activeProfileId,
    isDirty,
    showSaveNewPopover,
    setShowSaveNewPopover,
    saveProfileName,
    setSaveProfileName,
    showRenamePopover,
    setShowRenamePopover,
    renameProfileName,
    setRenameProfileName,
    importFeedback,
    importInputRef,
    handleSaveNewProfile,
    handleOverwriteProfile,
    handleRenameProfile,
    handleLoadProfile,
    handleDeleteProfile,
    handleExportProfile,
    handleImportFile,
    autoPaintMaxHeight,
    setAutoPaintMaxHeight,
    autoPaintResult,
    autoPaintSliceData,
    isComputing = false,
    progress = 0,
    error,
    calibrationLayerHeight,
    firstLayerHeight,
    filteredCount,
    imageSwatches,
    enhancedColorMatch,
    setEnhancedColorMatch,
    preserveSeparation,
    setPreserveSeparation,
    maxRepeatedSwaps,
    setMaxRepeatedSwaps,
    transitionOpacity,
    setTransitionOpacity,
    heightDithering,
    setHeightDithering,
    ditherLineWidth,
    setDitherLineWidth,
    flatPaint,
    setFlatPaint,
    optimizerAlgorithm,
    setOptimizerAlgorithm,
    optimizerSeed,
    setOptimizerSeed,
    regionWeightingMode,
    setRegionWeightingMode,
}: AutoPaintTabProps) {
    const {
        result: nextBestResult,
        isComputing: isNextBestComputing,
        error: nextBestError,
        requestSuggestion: requestNextBestSuggestion,
        reset: resetNextBestSuggestion,
    } = useNextBestColorWorker();
    const suggestionCountRef = React.useRef(0);

    React.useEffect(() => {
        resetNextBestSuggestion();
    }, [filaments, imageSwatches, resetNextBestSuggestion]);
    const [localDitherLineWidth, setLocalDitherLineWidth] = React.useState(
        ditherLineWidth.toString()
    );
    const [localOptimizerSeed, setLocalOptimizerSeed] = React.useState(
        optimizerSeed?.toString() ?? ''
    );

    // Calibration dialog state
    const [calibrationDialogOpen, setCalibrationDialogOpen] = React.useState(false);

    const handleOpenCalibration = React.useCallback(() => {
        setCalibrationDialogOpen(true);
    }, []);

    const handleCloseCalibration = React.useCallback(() => {
        setCalibrationDialogOpen(false);
    }, []);

    const handleApplyCalibration = React.useCallback(
        (updates: CalibrationApplyUpdate[]) => {
            for (const update of updates) {
                updateFilament(update.id, {
                    td: update.td,
                    calibration: update.calibration,
                });
            }
        },
        [updateFilament]
    );

    React.useEffect(() => {
        setLocalDitherLineWidth(ditherLineWidth.toString());
    }, [ditherLineWidth]);

    React.useEffect(() => {
        setLocalOptimizerSeed(optimizerSeed?.toString() ?? '');
    }, [optimizerSeed]);

    return (
        <TabsContent value="autopaint" forceMount className="data-[state=inactive]:hidden">
            <Card className="p-4 border border-border/50">
                <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">Auto-paint</h3>
                </div>
                <div className="h-px bg-border/50 my-4" />

                {/* Profiles Section */}
                <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">Profiles</span>
                        {activeProfileId && isDirty && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                Unsaved changes
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Select value={activeProfileId ?? ''} onValueChange={handleLoadProfile}>
                            <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue placeholder="Unsaved Configuration" />
                            </SelectTrigger>
                            <SelectContent>
                                {profiles.length === 0 ? (
                                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                        No saved profiles
                                    </div>
                                ) : (
                                    profiles.map((p) => (
                                        <SelectItem key={p.id} value={p.id} className="text-xs">
                                            <div className="flex items-center gap-2">
                                                <div className="flex gap-0.5">
                                                    {p.filaments.slice(0, 4).map((f, i) => (
                                                        <span
                                                            key={i}
                                                            className="w-3 h-3 rounded-full border border-border/50"
                                                            style={{
                                                                backgroundColor: f.color,
                                                            }}
                                                        />
                                                    ))}
                                                    {p.filaments.length > 4 && (
                                                        <span className="text-[9px] text-muted-foreground ml-0.5">
                                                            +{p.filaments.length - 4}
                                                        </span>
                                                    )}
                                                </div>
                                                <span>{p.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>

                        {/* Save (overwrite active profile) */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Save changes to current profile"
                            disabled={!activeProfileId || !isDirty}
                            onClick={handleOverwriteProfile}
                        >
                            <Save className="w-4 h-4" />
                        </Button>

                        {/* Save New */}
                        <Popover open={showSaveNewPopover} onOpenChange={setShowSaveNewPopover}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0"
                                    title="Save as new profile"
                                >
                                    <FilePlus className="w-4 h-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-3" align="end">
                                <div className="space-y-2">
                                    <h4 className="text-xs font-semibold">Save New Profile</h4>
                                    <Input
                                        placeholder="Profile name..."
                                        value={saveProfileName}
                                        onChange={(e) => setSaveProfileName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleSaveNewProfile(saveProfileName);
                                            }
                                        }}
                                        className="h-8 text-xs"
                                        autoFocus
                                    />
                                    <Button
                                        size="sm"
                                        onClick={() => handleSaveNewProfile(saveProfileName)}
                                        disabled={!saveProfileName.trim()}
                                        className="w-full h-7 text-xs cursor-pointer"
                                    >
                                        Save
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>

                        {/* Rename */}
                        <Popover open={showRenamePopover} onOpenChange={setShowRenamePopover}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Rename selected profile"
                                    disabled={!activeProfileId}
                                >
                                    <Pencil className="w-4 h-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-3" align="end">
                                <div className="space-y-2">
                                    <h4 className="text-xs font-semibold">Rename Profile</h4>
                                    <Input
                                        placeholder="Profile name..."
                                        value={renameProfileName}
                                        onChange={(e) => setRenameProfileName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleRenameProfile(renameProfileName);
                                            }
                                        }}
                                        className="h-8 text-xs"
                                        autoFocus
                                    />
                                    <Button
                                        size="sm"
                                        onClick={() => handleRenameProfile(renameProfileName)}
                                        disabled={!renameProfileName.trim()}
                                        className="w-full h-7 text-xs cursor-pointer"
                                    >
                                        Rename
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>

                        <div className="w-px h-5 bg-border/70 flex-shrink-0" />

                        {/* Import */}
                        <input
                            ref={importInputRef}
                            type="file"
                            accept=".kfil,.kapp,.json"
                            data-testid="autopaint-profile-import-input"
                            className="hidden"
                            onChange={handleImportFile}
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0"
                            title="Import profile from file"
                            onClick={() => importInputRef.current?.click()}
                        >
                            <Upload className="w-4 h-4" />
                        </Button>

                        {/* Export */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0"
                            title="Export current filaments as .kfil file"
                            onClick={handleExportProfile}
                            disabled={filaments.length === 0}
                        >
                            <Download className="w-4 h-4" />
                        </Button>

                        <div className="w-px h-5 bg-border/70 flex-shrink-0" />

                        {/* Delete — always rendered so the strip width stays stable */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Delete selected profile"
                            disabled={!activeProfileId}
                            onClick={() => activeProfileId && handleDeleteProfile(activeProfileId)}
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Import feedback */}
                    {importFeedback && (
                        <div className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
                            {importFeedback}
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    {filaments.length === 0 ? (
                        <div className="text-center py-4 text-xs text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border">
                            No filaments added
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filaments.map((f) => (
                                <FilamentRow
                                    key={f.id}
                                    filament={f}
                                    onUpdate={updateFilament}
                                    onRemove={removeFilament}
                                />
                            ))}
                        </div>
                    )}
                    <div className={filaments.length > 0 ? 'grid grid-cols-2 gap-2' : ''}>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={addFilament}
                            className="w-full text-xs gap-1.5 h-8 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-primary cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Add Filament
                        </Button>

                        {filaments.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenCalibration()}
                                className="w-full text-xs gap-1.5 h-8 cursor-pointer"
                            >
                                <FlaskConical className="w-3.5 h-3.5" />
                                Calibrate Filaments
                            </Button>
                        )}
                    </div>

                    {/* Max Height Constraint */}
                    {filaments.length > 0 && (
                        <div className="space-y-2 pt-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-foreground">
                                    Max Height
                                </label>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    mm
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <NumberInput
                                    min={0.5}
                                    max={20}
                                    step={0.1}
                                    value={autoPaintMaxHeight ?? ''}
                                    placeholder={autoPaintResult?.totalHeight?.toFixed(1) ?? 'Auto'}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === '' || v === undefined) {
                                            setAutoPaintMaxHeight(undefined);
                                        } else {
                                            const num = Number(v);
                                            if (!isNaN(num) && num > 0) {
                                                setAutoPaintMaxHeight(num);
                                            }
                                        }
                                    }}
                                    onBlur={() => {
                                        if (autoPaintMaxHeight !== undefined) {
                                            setAutoPaintMaxHeight(
                                                Math.max(0.5, Math.min(20, autoPaintMaxHeight))
                                            );
                                        }
                                    }}
                                    className="flex-1"
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setAutoPaintMaxHeight(undefined)}
                                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    title="Use automatic height"
                                >
                                    Auto
                                </Button>
                            </div>
                            {autoPaintResult && (
                                <div className="text-[10px] text-muted-foreground">
                                    Height: {autoPaintResult.totalHeight.toFixed(2)}mm
                                    {autoPaintMaxHeight === undefined && (
                                        <span className="ml-1 text-primary">(auto)</span>
                                    )}
                                    {autoPaintMaxHeight !== undefined &&
                                        autoPaintMaxHeight < autoPaintResult.autoHeight && (
                                            <span className="ml-2 text-amber-600">
                                                ⚠️ compressed below auto (
                                                {autoPaintResult.autoHeight.toFixed(1)}mm)
                                            </span>
                                        )}
                                </div>
                            )}
                            {isComputing && (
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px] text-primary">
                                        <span className="flex items-center gap-1.5">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Optimizing filament order…
                                        </span>
                                        <span className="tabular-nums">
                                            {Math.round(progress * 100)}%
                                        </span>
                                    </div>
                                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                                            style={{
                                                width: `${Math.max(2, Math.min(100, Math.round(progress * 100)))}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                            {error && !isComputing && (
                                <div className="text-[10px] text-destructive">{error}</div>
                            )}
                        </div>
                    )}

                    {/* Enhanced matching options */}
                    {filaments.length > 0 && (
                        <div className="space-y-3 pt-2">
                            <div className="h-px bg-border/50" />
                            <div className="flex items-center justify-between">
                                <Label
                                    htmlFor="enhanced-color-match"
                                    className="text-xs font-medium text-foreground cursor-pointer"
                                >
                                    Enhanced color matching
                                </Label>
                                <Switch
                                    id="enhanced-color-match"
                                    data-testid="autopaint-enhanced-color-match"
                                    checked={enhancedColorMatch}
                                    onCheckedChange={setEnhancedColorMatch}
                                />
                            </div>
                            <div className="space-y-3 border-l border-border/50 pl-3 ml-1">
                                <div
                                    className={`flex items-center gap-2 transition-opacity ${enhancedColorMatch ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
                                >
                                    <Label
                                        htmlFor="repeated-swaps"
                                        className="text-xs font-medium text-foreground whitespace-nowrap"
                                    >
                                        Extra repeated swaps
                                    </Label>
                                    <Select
                                        value={maxRepeatedSwaps.toString()}
                                        onValueChange={(value) =>
                                            setMaxRepeatedSwaps(
                                                Number(value) as AutoPaintRepeatLimit
                                            )
                                        }
                                        disabled={!enhancedColorMatch}
                                    >
                                        <SelectTrigger
                                            id="repeated-swaps"
                                            className="h-7 text-xs flex-1"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="0" className="text-xs">
                                                Off
                                            </SelectItem>
                                            <SelectItem value="2" className="text-xs">
                                                2 extra swaps
                                            </SelectItem>
                                            <SelectItem value="4" className="text-xs">
                                                4 extra swaps
                                            </SelectItem>
                                            <SelectItem value="6" className="text-xs">
                                                6 extra swaps
                                            </SelectItem>
                                            <SelectItem value="8" className="text-xs">
                                                8 extra swaps
                                            </SelectItem>
                                            <SelectItem value="12" className="text-xs">
                                                12 extra swaps
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div
                                    className={`flex items-center justify-between transition-opacity ${enhancedColorMatch ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
                                >
                                    <Label
                                        htmlFor="preserve-separation"
                                        className="text-xs font-medium text-foreground cursor-pointer"
                                    >
                                        Preserve color separation
                                    </Label>
                                    <Switch
                                        id="preserve-separation"
                                        data-testid="autopaint-preserve-separation"
                                        checked={preserveSeparation}
                                        onCheckedChange={setPreserveSeparation}
                                        disabled={!enhancedColorMatch}
                                    />
                                </div>
                                <div
                                    className={`flex items-center justify-between transition-opacity ${enhancedColorMatch ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
                                >
                                    <Label
                                        htmlFor="height-dithering"
                                        className="text-xs font-medium text-foreground cursor-pointer"
                                    >
                                        Height dithering
                                    </Label>
                                    <Switch
                                        id="height-dithering"
                                        data-testid="autopaint-height-dithering"
                                        checked={heightDithering}
                                        onCheckedChange={setHeightDithering}
                                        disabled={!enhancedColorMatch}
                                    />
                                </div>
                                {heightDithering && enhancedColorMatch && (
                                    <div className="flex items-center gap-2 pl-0.5">
                                        <label className="text-[11px] text-muted-foreground whitespace-nowrap">
                                            Line width
                                        </label>
                                        <NumberInput
                                            min={0.1}
                                            max={2}
                                            step={0.01}
                                            value={localDitherLineWidth}
                                            onChange={(e) => {
                                                setLocalDitherLineWidth(e.target.value);
                                            }}
                                            onBlur={() => {
                                                let val = parseFloat(localDitherLineWidth);
                                                if (isNaN(val)) {
                                                    setLocalDitherLineWidth(
                                                        ditherLineWidth.toString()
                                                    );
                                                    return;
                                                }
                                                val = Math.max(0.1, Math.min(2, val));
                                                setDitherLineWidth(val);
                                                setLocalDitherLineWidth(val.toString());
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.currentTarget.blur();
                                                }
                                            }}
                                            className="w-20 h-7 text-xs"
                                        />
                                        <span className="text-[10px] text-muted-foreground">
                                            mm
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setDitherLineWidth(0.42)}
                                            className="h-7 px-1.5 text-[10px] text-muted-foreground hover:text-foreground ml-auto"
                                            title="Reset to default (0.42mm)"
                                        >
                                            Reset
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Flat Paint */}
                    {filaments.length > 0 && (
                        <div className="space-y-3 pt-2">
                            <div className="h-px bg-border/50" />
                            <div className="flex items-center justify-between">
                                <Label
                                    htmlFor="flat-paint"
                                    className="text-xs font-medium text-foreground cursor-pointer"
                                >
                                    Flat Paint
                                </Label>
                                <Switch
                                    id="flat-paint"
                                    data-testid="autopaint-flat-paint"
                                    checked={flatPaint}
                                    onCheckedChange={setFlatPaint}
                                />
                            </div>
                        </div>
                    )}

                    {/* Optimizer Settings */}
                    {filaments.length > 0 && (
                        <div
                            className={`space-y-3 pt-2 transition-opacity ${enhancedColorMatch ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
                        >
                            <div className="h-px bg-border/50" />
                            <Label className="text-xs font-semibold text-foreground">
                                Optimizer Settings
                            </Label>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Label
                                        htmlFor="optimizer-algorithm"
                                        className="w-28 shrink-0 text-xs text-muted-foreground whitespace-nowrap"
                                    >
                                        Algorithm
                                    </Label>
                                    <Select
                                        value={optimizerAlgorithm}
                                        onValueChange={setOptimizerAlgorithm}
                                        disabled={!enhancedColorMatch}
                                    >
                                        <SelectTrigger
                                            id="optimizer-algorithm"
                                            className="h-7 text-xs flex-1"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {OPTIMIZER_TIERS.map((tier) => (
                                                <SelectItem
                                                    key={tier.value}
                                                    value={tier.value}
                                                    className="text-xs"
                                                >
                                                    {tier.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Label
                                        htmlFor="region-weighting"
                                        className="w-28 shrink-0 text-xs text-muted-foreground whitespace-nowrap"
                                    >
                                        Region priority
                                    </Label>
                                    <Select
                                        value={regionWeightingMode}
                                        onValueChange={setRegionWeightingMode}
                                        disabled={!enhancedColorMatch}
                                    >
                                        <SelectTrigger
                                            id="region-weighting"
                                            className="h-7 text-xs flex-1"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="uniform" className="text-xs">
                                                Uniform (all equal)
                                            </SelectItem>
                                            <SelectItem value="center" className="text-xs">
                                                Center-weighted
                                            </SelectItem>
                                            <SelectItem value="edge" className="text-xs">
                                                Edge-weighted
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Label
                                        htmlFor="transition-opacity"
                                        className="w-28 shrink-0 text-xs text-muted-foreground whitespace-nowrap"
                                    >
                                        Transition detail
                                    </Label>
                                    <Select
                                        value={transitionOpacity.toString()}
                                        onValueChange={(value) =>
                                            setTransitionOpacity(
                                                Number(value) as AutoPaintTransitionOpacity
                                            )
                                        }
                                        disabled={!enhancedColorMatch}
                                    >
                                        <SelectTrigger
                                            id="transition-opacity"
                                            className="h-7 text-xs flex-1"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="0.8" className="text-xs">
                                                Compact (80% opacity)
                                            </SelectItem>
                                            <SelectItem value="0.9" className="text-xs">
                                                Detailed (90% opacity)
                                            </SelectItem>
                                            <SelectItem value="0.95" className="text-xs">
                                                Maximum (95% opacity)
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Label
                                        htmlFor="optimizer-seed"
                                        className="w-28 shrink-0 text-xs text-muted-foreground whitespace-nowrap"
                                    >
                                        Seed (optional)
                                    </Label>
                                    <Input
                                        id="optimizer-seed"
                                        type="text"
                                        placeholder="Automatic"
                                        value={localOptimizerSeed}
                                        onChange={(e) => setLocalOptimizerSeed(e.target.value)}
                                        onBlur={() => {
                                            const trimmed = localOptimizerSeed.trim();
                                            if (trimmed === '') {
                                                setOptimizerSeed(undefined);
                                                setLocalOptimizerSeed('');
                                                return;
                                            }
                                            const val = parseInt(trimmed, 10);
                                            if (isNaN(val)) {
                                                setLocalOptimizerSeed(
                                                    optimizerSeed?.toString() ?? ''
                                                );
                                                return;
                                            }
                                            setOptimizerSeed(val);
                                            setLocalOptimizerSeed(val.toString());
                                        }}
                                        disabled={!enhancedColorMatch}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.currentTarget.blur();
                                            }
                                        }}
                                        className="h-7 text-xs flex-1"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Auto-paint transition zones preview */}
                    {autoPaintResult && autoPaintResult.transitionZones.length > 0 && (
                        <>
                            <div className="h-px bg-border/50 my-4" />
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-amber-500" />
                                    <span className="text-xs font-semibold text-foreground">
                                        Transition Zones
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                        {autoPaintResult.transitionZones.length} zones
                                    </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground space-y-0.5">
                                    <div>
                                        Total height: {autoPaintResult.totalHeight.toFixed(2)}mm
                                        {autoPaintSliceData && (
                                            <span className="ml-2 text-muted-foreground/70">
                                                ({autoPaintSliceData.virtualSwatches.length}{' '}
                                                physical layers)
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                    {autoPaintResult.transitionZones.map(
                                        (zone: TransitionZone, idx: number) => {
                                            const isCompressed =
                                                autoPaintMaxHeight !== undefined &&
                                                autoPaintMaxHeight < autoPaintResult.autoHeight &&
                                                zone.actualThickness < zone.idealThickness - 0.01;
                                            return (
                                                <div
                                                    key={`zone-${idx}`}
                                                    className={`flex items-center gap-2 p-2 rounded-md border ${
                                                        isCompressed
                                                            ? 'bg-amber-500/5 border-amber-500/30'
                                                            : 'bg-muted/30 border-border/30'
                                                    }`}
                                                >
                                                    <span
                                                        className="w-5 h-5 rounded-full border border-border flex-shrink-0 shadow-sm"
                                                        style={{
                                                            backgroundColor: zone.filamentColor,
                                                        }}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] font-mono text-foreground">
                                                                {zone.filamentColor}
                                                            </span>
                                                            {isCompressed && (
                                                                <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-600 font-medium">
                                                                    compressed
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-[9px] text-muted-foreground">
                                                            {zone.startHeight.toFixed(2)}mm →{' '}
                                                            {zone.endHeight.toFixed(2)}mm
                                                            <span className="ml-1 text-primary font-medium">
                                                                (Δ
                                                                {zone.actualThickness.toFixed(2)}
                                                                mm)
                                                            </span>
                                                            {isCompressed && (
                                                                <span className="ml-1 text-amber-600/70">
                                                                    ideal:{' '}
                                                                    {zone.idealThickness.toFixed(2)}
                                                                    mm
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Warning when no filaments */}
                    {filaments.length === 0 && (
                        <div className="mt-3 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 text-[10px]">
                            Add at least one filament to generate auto-paint layers
                        </div>
                    )}

                    {/* Warning when no image colors */}
                    {filaments.length > 0 && filteredCount === 0 && (
                        <div className="mt-3 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 text-[10px]">
                            Load an image to generate auto-paint layers
                        </div>
                    )}

                    {/* Overall Confidence Indicator */}
                    {autoPaintResult && (
                        <div className="mt-4 p-3 rounded-md border border-border/50 bg-muted/30 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <BadgeCheck
                                        className={`w-4 h-4 ${getConfidenceColor(autoPaintResult.confidence)}`}
                                    />
                                    <span className="text-xs font-semibold">Result Confidence</span>
                                </div>
                                <span
                                    className={`text-sm font-bold ${getConfidenceColor(autoPaintResult.confidence)}`}
                                >
                                    {getConfidenceLabel(autoPaintResult.confidence)} (
                                    {(autoPaintResult.confidence * 100).toFixed(0)}%)
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[10px]">
                                <div className="text-center p-2 rounded bg-background">
                                    <div className="text-muted-foreground mb-1">Calibration</div>
                                    <div
                                        className={`font-semibold ${getConfidenceColor(autoPaintResult.confidenceFactors.calibrationQuality)}`}
                                    >
                                        {(
                                            autoPaintResult.confidenceFactors.calibrationQuality *
                                            100
                                        ).toFixed(0)}
                                        %
                                    </div>
                                </div>
                                <div className="text-center p-2 rounded bg-background">
                                    <div className="text-muted-foreground mb-1">Coverage</div>
                                    <div
                                        className={`font-semibold ${getConfidenceColor(autoPaintResult.confidenceFactors.filamentCoverage)}`}
                                    >
                                        {(
                                            autoPaintResult.confidenceFactors.filamentCoverage * 100
                                        ).toFixed(0)}
                                        %
                                    </div>
                                </div>
                                <div className="text-center p-2 rounded bg-background">
                                    <div className="text-muted-foreground mb-1">Compression</div>
                                    <div
                                        className={`font-semibold ${getConfidenceColor(autoPaintResult.confidenceFactors.compressionImpact)}`}
                                    >
                                        {(
                                            autoPaintResult.confidenceFactors.compressionImpact *
                                            100
                                        ).toFixed(0)}
                                        %
                                    </div>
                                </div>
                            </div>
                            {autoPaintResult.confidence < 0.7 && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                    💡 Tip: Calibrate your filaments for better accuracy
                                </p>
                            )}
                            {/* Optimizer Metadata */}
                            {autoPaintResult.optimizerMetadata && (
                                <div className="space-y-1.5 pt-2">
                                    <div className="h-px bg-border/50" />
                                    <div className="flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                                        <span className="text-xs font-semibold text-foreground">
                                            Optimizer Performance
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                                        <div className="text-center p-2 rounded bg-background">
                                            <div className="text-muted-foreground mb-1">
                                                Algorithm
                                            </div>
                                            <div className="font-semibold text-foreground capitalize">
                                                {autoPaintResult.optimizerMetadata.algorithm.replace(
                                                    /-/g,
                                                    ' '
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-center p-2 rounded bg-background">
                                            <div className="text-muted-foreground mb-1">
                                                Quality Score
                                            </div>
                                            <div className="font-semibold text-green-600 dark:text-green-400">
                                                {autoPaintResult.optimizerMetadata.score.toFixed(2)}
                                            </div>
                                        </div>
                                        <div className="text-center p-2 rounded bg-background">
                                            <div className="text-muted-foreground mb-1">
                                                Iterations
                                            </div>
                                            <div className="font-semibold text-foreground">
                                                {autoPaintResult.optimizerMetadata.iterations.toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                        {autoPaintResult.optimizerMetadata.cacheHit && (
                                            <span className="inline-flex items-center gap-1">
                                                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                                                Cache hit
                                            </span>
                                        )}
                                        {autoPaintResult.optimizerMetadata.converged && (
                                            <span className="inline-flex items-center gap-1">
                                                <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                                                Converged
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Next-best-color suggestion */}
                    {autoPaintResult && imageSwatches.length > 0 && (
                        <div className="mt-3 space-y-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-7 text-xs"
                                disabled={isNextBestComputing}
                                onClick={() => requestNextBestSuggestion(filaments, imageSwatches)}
                            >
                                {isNextBestComputing ? (
                                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                ) : (
                                    <Sparkles className="w-3 h-3 mr-1.5" />
                                )}
                                {isNextBestComputing
                                    ? 'Finding suggestion...'
                                    : 'Suggest next filament'}
                            </Button>
                            {nextBestResult?.candidate && (
                                <div className="p-2.5 rounded-md border border-border/50 bg-muted/30 space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="w-5 h-5 rounded border border-border/50 flex-shrink-0"
                                            style={{
                                                backgroundColor: nextBestResult.candidate.hex,
                                            }}
                                        />
                                        <span className="text-xs font-mono font-semibold flex-1">
                                            {nextBestResult.candidate.hex.toUpperCase()}
                                        </span>
                                        <span
                                            className="text-xs font-semibold cursor-default"
                                            title="Estimated reduction in blend-aware average color error (ΔE) across the image if this filament is added. Higher is better, but this is a rough estimate, not a confidence rating."
                                        >
                                            Est. ΔE{' '}
                                            <span className="text-sm font-bold text-green-600 dark:text-green-400">
                                                +
                                                {nextBestResult.candidate.improvementPct.toFixed(1)}
                                                %
                                            </span>
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5 text-[10px] text-muted-foreground">
                                        <span title="Recommended starting hiding distance (mm), borrowed from the nearest existing filament by color distance (ΔE).">
                                            HD:{' '}
                                            <span className="font-semibold text-foreground">
                                                {nextBestResult.candidate.td.toFixed(2)}
                                            </span>
                                        </span>
                                        <span title="Percentage of image pixels whose blend-aware color error would improve with this filament added.">
                                            Captures:{' '}
                                            <span className="font-semibold text-foreground">
                                                {(
                                                    (nextBestResult.candidate.pixelsCaptured /
                                                        nextBestResult.totalPixels) *
                                                    100
                                                ).toFixed(1)}
                                                %
                                            </span>
                                        </span>
                                        <span title="How far this color sits from existing filaments in perceptual color space (0–1). Higher means it fills a more distinct gap; lower means it overlaps with colors already covered.">
                                            Isolation:{' '}
                                            <span className="font-semibold text-foreground">
                                                {nextBestResult.candidate.isolationScore.toFixed(2)}
                                            </span>
                                        </span>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full h-7 text-xs mt-0.5"
                                        onClick={() => {
                                            suggestionCountRef.current += 1;
                                            const nn = String(suggestionCountRef.current).padStart(
                                                2,
                                                '0'
                                            );
                                            addFilamentWithProps({
                                                color: nextBestResult.candidate!.hex,
                                                td: nextBestResult.candidate!.td,
                                                name: `Kromacut-Suggestion-${nn}`,
                                            });
                                            resetNextBestSuggestion();
                                        }}
                                    >
                                        <Plus className="w-3 h-3 mr-1.5" />
                                        Add to filaments
                                    </Button>
                                </div>
                            )}
                            {nextBestResult && !nextBestResult.candidate && (
                                <p className="text-[10px] text-muted-foreground text-center">
                                    Current filament set already covers all image colors well.
                                </p>
                            )}
                            {nextBestError && (
                                <p className="text-[10px] text-destructive text-center">
                                    {nextBestError}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </Card>

            {/* Calibration Dialog */}
            <FilamentCalibrationDialog
                open={calibrationDialogOpen}
                onClose={handleCloseCalibration}
                filaments={filaments}
                layerHeight={calibrationLayerHeight}
                firstLayerHeight={firstLayerHeight}
                onApply={handleApplyCalibration}
            />
        </TabsContent>
    );
}
