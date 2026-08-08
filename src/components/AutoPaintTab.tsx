import React from 'react';
import { CollapsibleCard, DirtyDot } from '@/components/CollapsibleCard';
import { NumberInput, Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Plus,
    Trash2,
    Save,
    Download,
    Upload,
    FilePlus,
    Pencil,
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
import type {
    PaletteProofRecord,
    PaletteTargetResponse,
    StackMatrixCalibrationV1,
} from '../lib/appearanceProfile';
import type { PaletteProofSpec } from '../lib/paletteProof';
import type { AutoPaintProfile } from '../lib/profileManager';
import type {
    AutoPaintRepeatLimit,
    AutoPaintTransitionOpacity,
    Filament,
    FinalPrintableStackSnapshot,
    Swatch,
} from '../types';
import FilamentRow from './FilamentRow';
import {
    FilamentCalibrationDialog,
    type CalibrationApplyUpdate,
} from './FilamentCalibrationDialog';
import { TEMPLATE_PROFILES, isTemplateProfileId } from '../data/supplierFilaments';
import { getConfidenceLabel, getConfidenceColor } from '../lib/calibration';
import { getExactBaseOrderCount } from '../lib/optimizer';
import { useNextBestColorWorker } from '../hooks/useNextBestColorWorker';

/** Percentage stat tile with a slim progress bar, colored by confidence band. */
function ConfidenceStat({ label, value }: { label: string; value: number }) {
    const pct = Math.round(value * 100);
    return (
        <div className="text-center p-2 rounded bg-background">
            <div className="text-muted-foreground mb-1">{label}</div>
            <div className={`font-semibold ${getConfidenceColor(value)}`}>
                {pct}%
                <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                        className="h-full rounded-full bg-current"
                        style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

function AppearanceModelStat({ result }: { result: AutoPaintResult }) {
    const model = result.finalStack.appearanceModel;
    const exactAnchorCount = model.exactAnchors?.length ?? 0;
    const matrixAnchorCount =
        model.exactAnchors?.filter((anchor) => anchor.source === 'stack-matrix').length ?? 0;
    const proofAnchorCount = exactAnchorCount - matrixAnchorCount;
    const comparedStackKeys = new Set(model.comparedStackKeys);
    const comparedCoverage = result.finalStack.targetMappings
        .filter((mapping) => comparedStackKeys.has(mapping.canonicalStackKey))
        .reduce((sum, mapping) => sum + mapping.usageWeight, 0);
    const evidenceNeeds = [
        model.trainingObservationCount < 8
            ? `${8 - model.trainingObservationCount} more training choices`
            : null,
        model.trainingDistinctStackCount < 8
            ? `${8 - model.trainingDistinctStackCount} more training stacks`
            : null,
    ].filter((need): need is string => need !== null);
    const gateDetail =
        model.gateReason === 'insufficient-evidence'
            ? evidenceNeeds.join(' / ')
            : model.gateReason === 'insufficient-heldout'
              ? 'Complete another proof for validation'
              : model.gateReason === 'no-training-improvement'
                ? 'Base model already ranks these choices'
                : model.gateReason === 'heldout-below-threshold'
                  ? 'Held-out agreement is below 70%'
                  : model.gateReason === 'heldout-no-improvement'
                    ? 'Held-out gain is below 10 points'
                    : null;

    return (
        <div className="rounded border border-border/50 bg-background/40 px-2 py-1.5 text-[10px]">
            <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Appearance model</span>
                <span
                    className={
                        model.applied
                            ? getConfidenceColor(model.confidence)
                            : exactAnchorCount > 0
                              ? 'text-green-500'
                              : 'text-muted-foreground'
                    }
                >
                    {model.applied
                        ? `Fitted estimate (${(model.confidence * 100).toFixed(0)}%)`
                        : exactAnchorCount > 0
                          ? matrixAnchorCount > 0 && proofAnchorCount === 0
                              ? 'Stack Matrix anchors active'
                              : 'Measured anchors active'
                          : model.observationCount > 0 || model.noneCount > 0
                            ? 'Evidence gathered, fit gated'
                            : 'Estimated only'}
                </span>
            </div>
            <div className="mt-0.5 text-muted-foreground">
                {model.sourceProofIds.length} evidence sets {' / '}
                {model.distinctStackCount} physically compared stacks {' / '}
                {proofAnchorCount} dead-on anchors {' / '}
                {matrixAnchorCount} matrix anchors {' / '}
                {model.noneCount} no matches
            </div>
            <div className="mt-0.5 text-muted-foreground">
                {model.trainingObservationCount} training choices {' / '}
                {model.trainingDistinctStackCount} training stacks {' / '}
                {model.heldOutCount} held-out choices {' / '}
                {model.heldOutDistinctStackCount} held-out stacks
            </div>
            {model.applied && (
                <div className="mt-0.5 text-muted-foreground">
                    {(comparedCoverage * 100).toFixed(0)}% current palette coverage
                </div>
            )}
            {gateDetail && (model.observationCount > 0 || model.noneCount > 0) && (
                <div className="mt-0.5 text-muted-foreground">{gateDetail}</div>
            )}
        </div>
    );
}

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

function formatBaseOrderCount(count: number): string {
    if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    return count.toLocaleString();
}

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
    handleRegisterPaletteProof: (
        snapshot: FinalPrintableStackSnapshot,
        proof: PaletteProofSpec
    ) => PaletteProofRecord;
    handleSetPaletteTargetResponse: (
        proofId: string,
        column: number,
        response: PaletteTargetResponse | null
    ) => void;
    handleCompletePaletteProofEvaluation: (proofId: string) => void;
    handleReopenPaletteProofEvaluation: (proofId: string) => void;
    handleDeletePaletteProof: (proofId: string) => void;
    handleUpsertStackMatrixCalibration: (record: StackMatrixCalibrationV1) => void;
    handleDeleteStackMatrixCalibration: (matrixId: string) => void;

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
    paletteProofImageSrc: string | null;

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

    // Flat Paint
    flatPaint: boolean;
    setFlatPaint: (v: boolean) => void;
    flatPaintFaceUp: boolean;
    setFlatPaintFaceUp: (v: boolean) => void;

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
    handleRegisterPaletteProof,
    handleSetPaletteTargetResponse,
    handleCompletePaletteProofEvaluation,
    handleReopenPaletteProofEvaluation,
    handleDeletePaletteProof,
    handleUpsertStackMatrixCalibration,
    handleDeleteStackMatrixCalibration,
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
    paletteProofImageSrc,
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
    flatPaintFaceUp,
    setFlatPaintFaceUp,
    optimizerAlgorithm,
    setOptimizerAlgorithm,
    optimizerSeed,
    setOptimizerSeed,
    regionWeightingMode,
    setRegionWeightingMode,
}: AutoPaintTabProps) {
    const activeProfile = React.useMemo(
        () => profiles.find((profile) => profile.id === activeProfileId),
        [activeProfileId, profiles]
    );
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
    const exactBaseOrderCount = React.useMemo(
        () => getExactBaseOrderCount(filaments.length),
        [filaments.length]
    );
    const exactBaseOrderIsLarge = exactBaseOrderCount >= 1_000_000 || filaments.length >= 9;

    // Calibration dialog state
    const [calibrationDialogOpen, setCalibrationDialogOpen] = React.useState(false);

    // Built-in templates are read-only: no overwrite, rename, or delete
    const isTemplateActive = activeProfileId !== null && isTemplateProfileId(activeProfileId);

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
            <CollapsibleCard
                id="autopaint"
                title="Auto-paint"
                collapsedSummary={
                    <>
                        {isComputing && (
                            <Loader2
                                className="w-4 h-4 animate-spin text-muted-foreground"
                                aria-label="Computing auto-paint layers"
                            />
                        )}
                        {error && !isComputing && <DirtyDot title={`Auto-paint error: ${error}`} />}
                        {activeProfileId && isDirty && (
                            <DirtyDot title="Filament profile has unsaved changes" />
                        )}
                    </>
                }
            >
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
                            <SelectContent className="w-[var(--radix-select-trigger-width)]">
                                {profiles.length === 0 ? (
                                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                        No saved profiles
                                    </div>
                                ) : (
                                    profiles.map((p) => (
                                        <SelectItem key={p.id} value={p.id} className="text-xs">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <div className="flex shrink-0 gap-0.5">
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
                                                <span className="truncate">{p.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))
                                )}
                                {TEMPLATE_PROFILES.length > 0 && (
                                    <>
                                        <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider select-none border-t border-border/50 mt-1 pt-2">
                                            Templates
                                        </div>
                                        <div className="px-2 pb-1.5 text-[9px] leading-snug whitespace-normal text-muted-foreground/70 select-none">
                                            Unofficial reference filament sets based on supplier
                                            color charts. Not affiliated with, endorsed by, or
                                            sponsored by any manufacturer; names identify the
                                            referenced products only.
                                        </div>
                                        {TEMPLATE_PROFILES.map((p) => (
                                            <SelectItem key={p.id} value={p.id} className="text-xs">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <div className="flex shrink-0 gap-0.5">
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
                                                    <span className="truncate">{p.name}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </>
                                )}
                            </SelectContent>
                        </Select>

                        {/* Save (overwrite active profile) */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                            title={
                                isTemplateActive
                                    ? 'Templates are read-only — use Save as new profile'
                                    : 'Save changes to current profile'
                            }
                            disabled={!activeProfileId || !isDirty || isTemplateActive}
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
                                    title={
                                        isTemplateActive
                                            ? 'Templates cannot be renamed'
                                            : 'Rename selected profile'
                                    }
                                    disabled={!activeProfileId || isTemplateActive}
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
                            accept=".kfil,.kapp,.json,.csv,.tsv"
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
                            title={
                                isTemplateActive
                                    ? 'Templates cannot be deleted'
                                    : 'Delete selected profile'
                            }
                            disabled={!activeProfileId || isTemplateActive}
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

                    {/* Persistent template notice — estimates need calibration */}
                    {isTemplateActive && (
                        <div className="text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            Template hiding distances are estimated from color — calibrate before
                            printing. Colors are the supplier's advertised values. Use "Save as new
                            profile" to keep an editable copy.
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
                    <div
                        className={
                            filaments.length > 0
                                ? 'grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2'
                                : ''
                        }
                    >
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
                                Calibrate
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
                            <div className="space-y-3 border-l border-border/50 pl-3 ml-1">
                                <div
                                    className={`flex items-center justify-between transition-opacity ${flatPaint ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
                                >
                                    <Label
                                        htmlFor="flat-paint-face-up"
                                        className="text-xs font-medium text-foreground cursor-pointer"
                                    >
                                        Face-up, no clear layer
                                    </Label>
                                    <Switch
                                        id="flat-paint-face-up"
                                        data-testid="autopaint-flat-paint-face-up"
                                        checked={flatPaintFaceUp}
                                        onCheckedChange={setFlatPaintFaceUp}
                                        disabled={!flatPaint}
                                    />
                                </div>
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
                                {optimizerAlgorithm === 'exact' && (
                                    <div
                                        className={`rounded-md border px-2 py-1.5 text-[10px] sm:ml-[7.5rem] ${
                                            exactBaseOrderIsLarge
                                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                                : 'border-border/50 bg-muted/30 text-muted-foreground'
                                        }`}
                                    >
                                        Exact base order will score about{' '}
                                        {formatBaseOrderCount(exactBaseOrderCount)} base orders
                                        before repeat refinement.
                                    </div>
                                )}
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

                                {/* Proportional stack bar: left = build plate, right = top */}
                                <div className="space-y-1">
                                    <div className="flex h-4 w-full overflow-hidden rounded-md border border-border/60">
                                        {autoPaintResult.transitionZones.map(
                                            (zone: TransitionZone, idx: number) => (
                                                <div
                                                    key={`bar-${idx}`}
                                                    className="h-full"
                                                    style={{
                                                        width: `${(zone.actualThickness / autoPaintResult.totalHeight) * 100}%`,
                                                        backgroundColor: zone.filamentColor,
                                                    }}
                                                    title={`${zone.filamentColor} · ${zone.startHeight.toFixed(2)}–${zone.endHeight.toFixed(2)} mm · Δ${zone.actualThickness.toFixed(2)} mm`}
                                                />
                                            )
                                        )}
                                    </div>
                                    <div className="flex justify-between text-[9px] text-muted-foreground/70">
                                        <span>0 mm (plate)</span>
                                        <span>
                                            {autoPaintResult.totalHeight.toFixed(2)} mm (top)
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                    {autoPaintResult.transitionZones.map(
                                        (zone: TransitionZone, idx: number) => {
                                            const isCompressed =
                                                autoPaintMaxHeight !== undefined &&
                                                autoPaintMaxHeight < autoPaintResult.autoHeight &&
                                                zone.actualThickness < zone.idealThickness - 0.01;
                                            return (
                                                <div
                                                    key={`zone-${idx}`}
                                                    className={`flex items-center gap-2 px-2 py-1 rounded-md border ${
                                                        isCompressed
                                                            ? 'bg-amber-500/5 border-amber-500/30'
                                                            : 'bg-muted/30 border-border/30'
                                                    }`}
                                                    title={
                                                        isCompressed
                                                            ? `Compressed to fit Max Height — ideal thickness ${zone.idealThickness.toFixed(2)} mm`
                                                            : undefined
                                                    }
                                                >
                                                    <span
                                                        className="w-3.5 h-3.5 rounded-full border border-border flex-shrink-0 shadow-sm"
                                                        style={{
                                                            backgroundColor: zone.filamentColor,
                                                        }}
                                                    />
                                                    <span className="text-[10px] font-mono text-foreground">
                                                        {zone.filamentColor}
                                                    </span>
                                                    {isCompressed && (
                                                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-600 font-medium">
                                                            compressed
                                                        </span>
                                                    )}
                                                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                                                        {zone.startHeight.toFixed(2)} →{' '}
                                                        {zone.endHeight.toFixed(2)} mm
                                                    </span>
                                                    <span className="text-[10px] text-primary font-medium tabular-nums w-14 text-right">
                                                        Δ{zone.actualThickness.toFixed(2)}
                                                    </span>
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
                            <AppearanceModelStat result={autoPaintResult} />
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold">Result Confidence</span>
                                <span
                                    className={`text-sm font-bold ${getConfidenceColor(autoPaintResult.confidence)}`}
                                >
                                    {getConfidenceLabel(autoPaintResult.confidence)} (
                                    {(autoPaintResult.confidence * 100).toFixed(0)}%)
                                </span>
                            </div>
                            <div className={getConfidenceColor(autoPaintResult.confidence)}>
                                <div className="h-1 rounded-full bg-muted overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-current"
                                        style={{
                                            width: `${Math.max(4, Math.min(100, Math.round(autoPaintResult.confidence * 100)))}%`,
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[10px]">
                                <ConfidenceStat
                                    label="Calibration"
                                    value={autoPaintResult.confidenceFactors.calibrationQuality}
                                />
                                <ConfidenceStat
                                    label="Coverage"
                                    value={autoPaintResult.confidenceFactors.filamentCoverage}
                                />
                                <ConfidenceStat
                                    label="Compression"
                                    value={autoPaintResult.confidenceFactors.compressionImpact}
                                />
                            </div>
                            {autoPaintResult.confidence < 0.7 && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                    Tip: calibrate your filaments for better accuracy.
                                </p>
                            )}
                            {/* Optimizer Metadata */}
                            {autoPaintResult.optimizerMetadata && (
                                <div className="space-y-1.5 pt-2">
                                    <div className="h-px bg-border/50" />
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold text-foreground">
                                            Optimizer Performance
                                        </span>
                                        <span className="ml-auto flex items-center gap-1.5 text-[9px] text-muted-foreground">
                                            {autoPaintResult.optimizerMetadata.cacheHit && (
                                                <span className="px-1.5 py-0.5 rounded border border-border/60 bg-background/50">
                                                    Cache hit
                                                </span>
                                            )}
                                            {autoPaintResult.optimizerMetadata.converged && (
                                                <span className="px-1.5 py-0.5 rounded border border-border/60 bg-background/50">
                                                    Converged
                                                </span>
                                            )}
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
                                {isNextBestComputing && (
                                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
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
            </CollapsibleCard>

            {/* Calibration Dialog */}
            <FilamentCalibrationDialog
                open={calibrationDialogOpen}
                onClose={handleCloseCalibration}
                filaments={filaments}
                layerHeight={calibrationLayerHeight}
                firstLayerHeight={firstLayerHeight}
                paletteProofSnapshot={autoPaintResult?.finalStack}
                paletteProofImageSrc={paletteProofImageSrc}
                paletteProofProfile={activeProfile}
                paletteProofProfileDirty={isDirty}
                onRegisterPaletteProof={handleRegisterPaletteProof}
                onSetPaletteTargetResponse={handleSetPaletteTargetResponse}
                onCompletePaletteProofEvaluation={handleCompletePaletteProofEvaluation}
                onReopenPaletteProofEvaluation={handleReopenPaletteProofEvaluation}
                onDeletePaletteProof={handleDeletePaletteProof}
                onUpsertStackMatrixCalibration={handleUpsertStackMatrixCalibration}
                onDeleteStackMatrixCalibration={handleDeleteStackMatrixCalibration}
                onApply={handleApplyCalibration}
            />
        </TabsContent>
    );
}
