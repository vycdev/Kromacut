import { Trans, useTranslation } from 'react-i18next';
import { translateRuntimeMessage } from '../lib/runtimeMessages';
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
import {
    MAX_SEPARATION_MAX_DELTA_E,
    MIN_SEPARATION_MAX_DELTA_E,
    normalizeSeparationMaxDeltaE,
    type AutoPaintResult,
    type TransitionZone,
} from '../lib/autoPaint';
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
import type { PrintableFeatureSimulation } from '../lib/printableFeatures.ts';
import PrintableFeaturePreview from './PrintableFeaturePreview';
import { formatColorSeparationStatus } from '../lib/colorSeparationStatus';

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

function ColorSeparationStatus({ result }: { result: AutoPaintResult }) {
    const report = result.colorSeparation;
    if (!report) return null;
    const extraRepeatCount = result.optimizerMetadata?.extraRepeatCount ?? 0;

    return (
        <p
            data-testid="autopaint-color-separation-status"
            role="status"
            aria-live="polite"
            className={`font-medium ${
                report.satisfied
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
            }`}
        >
            {translateRuntimeMessage(formatColorSeparationStatus(report, extraRepeatCount))}
        </p>
    );
}

function AppearanceModelStat({ result }: { result: AutoPaintResult }) {
    const { t } = useTranslation('printing');
    const model = result.finalStack.appearanceModel;
    const effectiveOptics = model.effectiveOptics;
    const physicalFitApplied = effectiveOptics?.applied ?? false;
    const exactAnchorCount = model.exactAnchors?.length ?? 0;
    const matrixAnchorCount =
        model.exactAnchors?.filter((anchor) => anchor.source === 'stack-matrix').length ?? 0;
    const matrixLutSampleCount =
        model.empiricalLuts?.reduce((sum, lut) => sum + lut.samples.length, 0) ?? 0;
    const localEvidenceCount = model.localEvidence?.length ?? 0;
    const proofAnchorCount = exactAnchorCount - matrixAnchorCount;
    const comparedStackKeys = new Set(model.comparedStackKeys);
    const comparedCoverage = result.finalStack.targetMappings
        .filter((mapping) => comparedStackKeys.has(mapping.canonicalStackKey))
        .reduce((sum, mapping) => sum + mapping.usageWeight, 0);
    const localCoverage = result.finalStack.targetMappings
        .filter(
            (mapping) =>
                (result.finalStack.palette[mapping.paletteIndex]?.localEvidenceIds?.length ?? 0) > 0
        )
        .reduce((sum, mapping) => sum + mapping.usageWeight, 0);
    const mappedPredictionConfidence = result.finalStack.targetMappings
        .map((mapping) => ({
            confidence: mapping.predictionConfidence,
            weight: mapping.usageWeight,
        }))
        .filter(
            (
                entry
            ): entry is {
                confidence: NonNullable<typeof entry.confidence>;
                weight: number;
            } => Boolean(entry.confidence)
        );
    const predictionWeight = mappedPredictionConfidence.reduce(
        (sum, entry) => sum + entry.weight,
        0
    );
    const averagePredictionConfidence =
        predictionWeight > 0
            ? mappedPredictionConfidence.reduce(
                  (sum, entry) => sum + entry.confidence.confidence * entry.weight,
                  0
              ) / predictionWeight
            : null;
    const minimumPredictionConfidence =
        mappedPredictionConfidence.length > 0
            ? Math.min(...mappedPredictionConfidence.map((entry) => entry.confidence.confidence))
            : null;
    const predictionMethods = new Map<string, number>();
    for (const entry of mappedPredictionConfidence) {
        const method = entry.confidence.method;
        predictionMethods.set(method, (predictionMethods.get(method) ?? 0) + 1);
    }
    const evidenceNeeds = [
        model.trainingObservationCount < 8
            ? t('autoPaintTab.moreTrainingChoices', { count: 8 - model.trainingObservationCount })
            : null,
        model.trainingDistinctStackCount < 8
            ? t('autoPaintTab.moreTrainingStacks', { count: 8 - model.trainingDistinctStackCount })
            : null,
    ].filter((need): need is string => need !== null);
    const gateDetail =
        model.gateReason === 'insufficient-evidence'
            ? evidenceNeeds.join(' / ')
            : model.gateReason === 'insufficient-heldout'
              ? t('autoPaintTab.completeValidationProof')
              : model.gateReason === 'no-training-improvement'
                ? t('autoPaintTab.baseModelRanksChoices')
                : model.gateReason === 'heldout-below-threshold'
                  ? t('autoPaintTab.heldOutAgreementLow')
                  : model.gateReason === 'heldout-no-improvement'
                    ? t('autoPaintTab.heldOutGainLow')
                    : null;

    return (
        <div className="rounded border border-border/50 bg-background/40 px-2 py-1.5 text-[10px]">
            <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{t('autoPaintTab.appearanceModel')}</span>
                <span
                    className={
                        model.applied || physicalFitApplied
                            ? getConfidenceColor(
                                  physicalFitApplied
                                      ? (effectiveOptics?.confidence ?? 0)
                                      : model.confidence
                              )
                            : exactAnchorCount > 0 || localEvidenceCount > 0
                              ? 'text-green-500'
                              : 'text-muted-foreground'
                    }
                >
                    {physicalFitApplied
                        ? t('autoPaintTab.matrixPhysicalFit', {
                              percentage: ((effectiveOptics?.confidence ?? 0) * 100).toFixed(0),
                          })
                        : model.applied
                          ? localEvidenceCount > 0
                              ? t('autoPaintTab.globalLocalFit', {
                                    percentage: (model.confidence * 100).toFixed(0),
                                })
                              : t('autoPaintTab.fittedEstimate', {
                                    percentage: (model.confidence * 100).toFixed(0),
                                })
                          : localEvidenceCount > 0
                            ? exactAnchorCount > 0 || matrixLutSampleCount > 0
                                ? t('autoPaintTab.measuredLocalEvidenceActive')
                                : t('autoPaintTab.localPaletteProofEvidenceActive')
                            : exactAnchorCount > 0 || matrixLutSampleCount > 0
                              ? matrixAnchorCount > 0 && proofAnchorCount === 0
                                  ? t('autoPaintTab.stackMatrixLUTActive')
                                  : t('autoPaintTab.measuredAnchorsActive')
                              : model.observationCount > 0 || model.noneCount > 0
                                ? t('autoPaintTab.evidenceGatheredFitGated')
                                : t('autoPaintTab.estimatedOnly')}
                </span>
            </div>
            <div className="mt-0.5 text-muted-foreground">
                {t('autoPaintTab.evidenceSets', { count: model.sourceProofIds.length })} {' / '}
                {t('autoPaintTab.comparedStacks', { count: model.distinctStackCount })} {' / '}
                {t('autoPaintTab.exactAnchors', { count: proofAnchorCount })} {' / '}
                {t('autoPaintTab.localNeighborhoods', { count: localEvidenceCount })} {' / '}
                {t('autoPaintTab.matrixRecipes', { count: matrixLutSampleCount })} {' / '}
                {t('autoPaintTab.noMatches', { count: model.noneCount })}
            </div>
            {effectiveOptics && effectiveOptics.sampleCount > 0 && (
                <div className="mt-0.5 text-muted-foreground">
                    {t('autoPaintTab.physicalFitSamples', { count: effectiveOptics.sampleCount })}{' '}
                    {' / '}
                    {t('autoPaintTab.substratePairs', {
                        count: effectiveOptics.substrateInteractions.length,
                    })}
                    {physicalFitApplied && (
                        <>
                            {' / '}
                            {t('autoPaintTab.meanDeltaEChange', {
                                before: effectiveOptics.baselineMeanDeltaE.toFixed(1),
                                after: effectiveOptics.fittedMeanDeltaE.toFixed(1),
                            })}
                            {effectiveOptics.crossValidationSampleCount > 0 && (
                                <>
                                    {' / '}
                                    {t('autoPaintTab.heldOutDeltaE', {
                                        value: effectiveOptics.crossValidationMeanDeltaE.toFixed(1),
                                    })}
                                </>
                            )}
                        </>
                    )}
                </div>
            )}
            {averagePredictionConfidence !== null && minimumPredictionConfidence !== null && (
                <div className="mt-0.5 text-muted-foreground">
                    {t('autoPaintTab.predictionConfidence', {
                        average: (averagePredictionConfidence * 100).toFixed(0),
                        lowest: (minimumPredictionConfidence * 100).toFixed(0),
                    })}
                    {[...predictionMethods.entries()].map(([method, count]) => (
                        <span key={method}>
                            {' / '}
                            {t(`autoPaintTab.predictionMethod.${method}`, { count })}
                        </span>
                    ))}
                </div>
            )}
            <div className="mt-0.5 text-muted-foreground">
                {t('autoPaintTab.trainingChoices', { count: model.trainingObservationCount })}{' '}
                {' / '}
                {t('autoPaintTab.trainingStacks', { count: model.trainingDistinctStackCount })}{' '}
                {' / '}
                {t('autoPaintTab.heldOutChoices', { count: model.heldOutCount })} {' / '}
                {t('autoPaintTab.heldOutStacks', { count: model.heldOutDistinctStackCount })}
            </div>
            {(model.applied || physicalFitApplied || localEvidenceCount > 0) && (
                <div className="mt-0.5 text-muted-foreground">
                    {t('autoPaintTab.evidenceCoverage', {
                        compared: (comparedCoverage * 100).toFixed(0),
                        local: (localCoverage * 100).toFixed(0),
                    })}
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
    labelKey: string;
}

const OPTIMIZER_TIERS: readonly OptimizerTierMeta[] = [
    {
        value: 'fast',
        labelKey: 'autoPaintTab.tierFast',
    },
    {
        value: 'balanced',
        labelKey: 'autoPaintTab.tierBalanced',
    },
    {
        value: 'thorough',
        labelKey: 'autoPaintTab.tierThorough',
    },
    {
        value: 'deep',
        labelKey: 'autoPaintTab.tierDeep',
    },
    {
        value: 'exact',
        labelKey: 'autoPaintTab.tierExact',
    },
];

function formatBaseOrderCount(count: number, locale: string): string {
    return new Intl.NumberFormat(locale, {
        notation: count >= 1_000_000 ? 'compact' : 'standard',
        maximumFractionDigits: count >= 1_000_000 ? 1 : 0,
    }).format(count);
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
    printableFeatureSimulation?: PrintableFeatureSimulation;
    printableFeatureIsComputing?: boolean;
    printLayerHeight: number;
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
    separationMaxDeltaE: number;
    setSeparationMaxDeltaE: (v: number) => void;
    failOnSeparationError: boolean;
    setFailOnSeparationError: (v: boolean) => void;
    maxRepeatedSwaps: AutoPaintRepeatLimit;
    setMaxRepeatedSwaps: (v: AutoPaintRepeatLimit) => void;
    transitionOpacity: AutoPaintTransitionOpacity;
    setTransitionOpacity: (v: AutoPaintTransitionOpacity) => void;
    heightDithering: boolean;
    setHeightDithering: (v: boolean) => void;
    omitAtRiskPixels: boolean;
    setOmitAtRiskPixels: (v: boolean) => void;

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
    printableFeatureSimulation,
    printableFeatureIsComputing = false,
    printLayerHeight,
    calibrationLayerHeight,
    firstLayerHeight,
    filteredCount,
    imageSwatches,
    paletteProofImageSrc,
    enhancedColorMatch,
    setEnhancedColorMatch,
    preserveSeparation,
    setPreserveSeparation,
    separationMaxDeltaE,
    setSeparationMaxDeltaE,
    failOnSeparationError,
    setFailOnSeparationError,
    maxRepeatedSwaps,
    setMaxRepeatedSwaps,
    transitionOpacity,
    setTransitionOpacity,
    heightDithering,
    setHeightDithering,
    omitAtRiskPixels,
    setOmitAtRiskPixels,
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
    const { t, i18n } = useTranslation('printing');
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
    const [localSeparationMaxDeltaE, setLocalSeparationMaxDeltaE] = React.useState(
        separationMaxDeltaE.toString()
    );
    React.useEffect(() => {
        setLocalSeparationMaxDeltaE(separationMaxDeltaE.toString());
    }, [separationMaxDeltaE]);
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
        setLocalOptimizerSeed(optimizerSeed?.toString() ?? '');
    }, [optimizerSeed]);

    return (
        <TabsContent value="autopaint" forceMount className="data-[state=inactive]:hidden">
            <CollapsibleCard
                id="autopaint"
                title={t('autoPaintTab.autoPaint')}
                collapsedSummary={
                    <>
                        {isComputing && (
                            <Loader2
                                className="w-4 h-4 animate-spin text-muted-foreground"
                                aria-label={t('autoPaintTab.computingAutoPaintLayers')}
                            />
                        )}
                        {error && !isComputing && (
                            <DirtyDot
                                title={t('autoPaintTab.errorTitle', {
                                    error: translateRuntimeMessage(error),
                                })}
                            />
                        )}
                        {activeProfileId && isDirty && (
                            <DirtyDot title={t('autoPaintTab.filamentProfileHasUnsavedChanges')} />
                        )}
                    </>
                }
            >
                {/* Profiles Section */}
                <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">
                            {t('autoPaintTab.profiles')}
                        </span>
                        {activeProfileId && isDirty && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                {t('autoPaintTab.unsavedChanges')}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Select value={activeProfileId ?? ''} onValueChange={handleLoadProfile}>
                            <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue placeholder={t('autoPaintTab.unsavedConfiguration')} />
                            </SelectTrigger>
                            <SelectContent className="w-[var(--radix-select-trigger-width)]">
                                {profiles.length === 0 ? (
                                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                        {t('autoPaintTab.noSavedProfiles')}
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
                                            {t('autoPaintTab.templates')}
                                        </div>
                                        <div className="px-2 pb-1.5 text-[9px] leading-snug whitespace-normal text-muted-foreground/70 select-none">
                                            {t(
                                                'autoPaintTab.unofficialReferenceFilamentSetsBasedOnSupplierColorCharts'
                                            )}
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
                                    ? t('autoPaintTab.templatesAreReadOnlyUseSaveAsNewProfile')
                                    : t('autoPaintTab.saveChangesToCurrentProfile')
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
                                    title={t('autoPaintTab.saveAsNewProfile')}
                                >
                                    <FilePlus className="w-4 h-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-3" align="end">
                                <div className="space-y-2">
                                    <h4 className="text-xs font-semibold">
                                        {t('autoPaintTab.saveNewProfile')}
                                    </h4>
                                    <Input
                                        placeholder={t('autoPaintTab.profileName')}
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
                                        {t('autoPaintTab.save')}
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
                                            ? t('autoPaintTab.templatesCannotBeRenamed')
                                            : t('autoPaintTab.renameSelectedProfile')
                                    }
                                    disabled={!activeProfileId || isTemplateActive}
                                >
                                    <Pencil className="w-4 h-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-3" align="end">
                                <div className="space-y-2">
                                    <h4 className="text-xs font-semibold">
                                        {t('autoPaintTab.renameProfile')}
                                    </h4>
                                    <Input
                                        placeholder={t('autoPaintTab.profileName')}
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
                                        {t('autoPaintTab.rename')}
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
                            title={t('autoPaintTab.importProfileFromFile')}
                            onClick={() => importInputRef.current?.click()}
                        >
                            <Upload className="w-4 h-4" />
                        </Button>

                        {/* Export */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0"
                            title={t('autoPaintTab.exportCurrentFilamentsAsKfilFile')}
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
                                    ? t('autoPaintTab.templatesCannotBeDeleted')
                                    : t('autoPaintTab.deleteSelectedProfile')
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
                            {translateRuntimeMessage(importFeedback)}
                        </div>
                    )}

                    {/* Persistent template notice — estimates need calibration */}
                    {isTemplateActive && (
                        <div className="text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            {t(
                                'autoPaintTab.templateHidingDistancesAreEstimatedFromColorCalibrateBefore'
                            )}
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    {filaments.length === 0 ? (
                        <div className="text-center py-4 text-xs text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border">
                            {t('autoPaintTab.noFilamentsAdded')}
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
                            {t('autoPaintTab.addFilament')}
                        </Button>

                        {filaments.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenCalibration()}
                                className="w-full text-xs gap-1.5 h-8 cursor-pointer"
                            >
                                <FlaskConical className="w-3.5 h-3.5" />
                                {t('autoPaintTab.calibrate')}
                            </Button>
                        )}
                    </div>

                    {/* Max Height Constraint */}
                    {filaments.length > 0 && (
                        <div className="space-y-2 pt-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-foreground">
                                    {t('autoPaintTab.maxHeight')}
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
                                    placeholder={
                                        autoPaintResult?.totalHeight?.toFixed(1) ??
                                        t('autoPaintTab.auto')
                                    }
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
                                    title={t('autoPaintTab.useAutomaticHeight')}
                                >
                                    {t('autoPaintTab.auto')}
                                </Button>
                            </div>
                            {autoPaintResult && (
                                <div className="text-[10px] text-muted-foreground">
                                    {t('autoPaintTab.height', {
                                        height: autoPaintResult.totalHeight.toFixed(2),
                                    })}
                                    {autoPaintMaxHeight === undefined && (
                                        <span className="ml-1 text-primary">
                                            {t('autoPaintTab.auto2')}
                                        </span>
                                    )}
                                    {autoPaintMaxHeight !== undefined &&
                                        autoPaintMaxHeight < autoPaintResult.autoHeight && (
                                            <span className="ml-2 text-amber-600">
                                                {t('autoPaintTab.compressedBelowAuto', {
                                                    height: autoPaintResult.autoHeight.toFixed(1),
                                                })}
                                            </span>
                                        )}
                                </div>
                            )}
                            {isComputing && (
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px] text-primary">
                                        <span className="flex items-center gap-1.5">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            {printableFeatureIsComputing
                                                ? t('autoPaintTab.analyzingPrintableDetail')
                                                : t('autoPaintTab.optimizingFilamentOrder')}
                                        </span>
                                        <span className="tabular-nums">
                                            {!printableFeatureIsComputing &&
                                                `${Math.round(progress * 100)}%`}
                                        </span>
                                    </div>
                                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                                        <div
                                            className={`h-full rounded-full bg-primary transition-[width] duration-200 ease-out ${printableFeatureIsComputing ? 'animate-pulse' : ''}`}
                                            style={{
                                                width: printableFeatureIsComputing
                                                    ? '100%'
                                                    : `${Math.max(2, Math.min(100, Math.round(progress * 100)))}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                            {error && !isComputing && (
                                <div
                                    role="alert"
                                    className="space-y-1 text-[10px] text-destructive"
                                >
                                    <p>{translateRuntimeMessage(error)}</p>
                                    <p>
                                        {t('autoPaintTab.noNewAutoPaintModelWasCreatedThePreview')}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Effective printable feature size */}
                    {filaments.length > 0 && (
                        <div className="space-y-3 pt-2">
                            <div className="h-px bg-border/50" />
                            <div className="flex items-center justify-between gap-3">
                                <Label
                                    htmlFor="omit-at-risk-pixels"
                                    className="cursor-pointer text-xs font-medium text-foreground"
                                >
                                    {t('autoPaintTab.omitIsolatedColorSpecks')}
                                </Label>
                                <Switch
                                    id="omit-at-risk-pixels"
                                    data-testid="autopaint-omit-at-risk-pixels"
                                    aria-describedby="omit-color-specks-description"
                                    checked={omitAtRiskPixels}
                                    onCheckedChange={setOmitAtRiskPixels}
                                />
                            </div>
                            <p
                                id="omit-color-specks-description"
                                className="text-[10px] text-muted-foreground"
                            >
                                {t(
                                    'autoPaintTab.onlyReplacesColorsUsedExclusivelyInTinyEnclosedSpecks'
                                )}
                            </p>
                            <PrintableFeaturePreview
                                simulation={printableFeatureSimulation}
                                isComputing={printableFeatureIsComputing}
                            />
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
                                    {t('autoPaintTab.enhancedColorMatching')}
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
                                        {t('autoPaintTab.totalRepeatLimit')}
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
                                                {t('autoPaintTab.off')}
                                            </SelectItem>
                                            <SelectItem value="2" className="text-xs">
                                                {t('autoPaintTab.upTo2ExtraAppearances')}
                                            </SelectItem>
                                            <SelectItem value="4" className="text-xs">
                                                {t('autoPaintTab.upTo4ExtraAppearances')}
                                            </SelectItem>
                                            <SelectItem value="6" className="text-xs">
                                                {t('autoPaintTab.upTo6ExtraAppearances')}
                                            </SelectItem>
                                            <SelectItem value="8" className="text-xs">
                                                {t('autoPaintTab.upTo8ExtraAppearances')}
                                            </SelectItem>
                                            <SelectItem value="12" className="text-xs">
                                                {t('autoPaintTab.upTo12ExtraAppearances')}
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
                                        {t('autoPaintTab.preserveColorSeparation')}
                                    </Label>
                                    <Switch
                                        id="preserve-separation"
                                        data-testid="autopaint-preserve-separation"
                                        checked={preserveSeparation}
                                        onCheckedChange={setPreserveSeparation}
                                        disabled={!enhancedColorMatch}
                                    />
                                </div>
                                {preserveSeparation && enhancedColorMatch && (
                                    <div className="space-y-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-[10px] text-muted-foreground">
                                        <div className="flex items-center justify-between gap-3">
                                            <Label
                                                htmlFor="separation-max-delta-e"
                                                className="text-[11px] font-medium text-foreground"
                                            >
                                                {t('autoPaintTab.uniqueMatchLimitE')}
                                            </Label>
                                            <NumberInput
                                                id="separation-max-delta-e"
                                                data-testid="autopaint-separation-max-delta-e"
                                                aria-label={t(
                                                    'autoPaintTab.uniqueMatchColorErrorLimit'
                                                )}
                                                title={t(
                                                    'autoPaintTab.hardColorErrorLimitForPreservingAnImageColor'
                                                )}
                                                min={MIN_SEPARATION_MAX_DELTA_E}
                                                max={MAX_SEPARATION_MAX_DELTA_E}
                                                step={0.1}
                                                inputMode="decimal"
                                                value={localSeparationMaxDeltaE}
                                                onChange={(event) =>
                                                    setLocalSeparationMaxDeltaE(event.target.value)
                                                }
                                                onBlur={() => {
                                                    const parsed = Number(localSeparationMaxDeltaE);
                                                    const normalized =
                                                        localSeparationMaxDeltaE.trim() === '' ||
                                                        !Number.isFinite(parsed)
                                                            ? separationMaxDeltaE
                                                            : normalizeSeparationMaxDeltaE(parsed);
                                                    setSeparationMaxDeltaE(normalized);
                                                    setLocalSeparationMaxDeltaE(
                                                        normalized.toString()
                                                    );
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        event.currentTarget.blur();
                                                    }
                                                }}
                                                className="h-7 w-20 text-right font-mono text-xs font-semibold"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-2">
                                            <Label
                                                htmlFor="fail-on-separation-error"
                                                className="text-[11px] font-medium text-foreground cursor-pointer"
                                            >
                                                {t('autoPaintTab.requireAUniqueMatchForEveryColor')}
                                            </Label>
                                            <Switch
                                                id="fail-on-separation-error"
                                                data-testid="autopaint-fail-on-separation-error"
                                                checked={failOnSeparationError}
                                                onCheckedChange={setFailOnSeparationError}
                                            />
                                        </div>
                                        <p className="leading-relaxed">
                                            {t(
                                                'autoPaintTab.colorsWithoutAUniqueMatchInsideTheLimitAre'
                                            )}
                                        </p>
                                        {autoPaintResult && (
                                            <ColorSeparationStatus result={autoPaintResult} />
                                        )}
                                    </div>
                                )}
                                <div
                                    className={`flex items-center justify-between transition-opacity ${enhancedColorMatch ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
                                >
                                    <Label
                                        htmlFor="height-dithering"
                                        className="text-xs font-medium text-foreground cursor-pointer"
                                    >
                                        {t('autoPaintTab.heightDithering')}
                                    </Label>
                                    <Switch
                                        id="height-dithering"
                                        data-testid="autopaint-height-dithering"
                                        checked={heightDithering}
                                        onCheckedChange={setHeightDithering}
                                        disabled={!enhancedColorMatch}
                                    />
                                </div>
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
                                    {t('autoPaintTab.flatPaint')}
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
                                        {t('autoPaintTab.faceUpNoClearLayer')}
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
                                {t('autoPaintTab.optimizerSettings')}
                            </Label>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Label
                                        htmlFor="optimizer-algorithm"
                                        className="w-28 shrink-0 text-xs text-muted-foreground whitespace-nowrap"
                                    >
                                        {t('autoPaintTab.algorithm')}
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
                                                    {t(tier.labelKey)}
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
                                        {t('autoPaintTab.exactSearchEstimate', {
                                            orders: formatBaseOrderCount(
                                                exactBaseOrderCount,
                                                i18n.resolvedLanguage ?? 'en'
                                            ),
                                        })}
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <Label
                                        htmlFor="region-weighting"
                                        className="w-28 shrink-0 text-xs text-muted-foreground whitespace-nowrap"
                                    >
                                        {t('autoPaintTab.regionPriority')}
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
                                                {t('autoPaintTab.uniformAllEqual')}
                                            </SelectItem>
                                            <SelectItem value="center" className="text-xs">
                                                {t('autoPaintTab.centerWeighted')}
                                            </SelectItem>
                                            <SelectItem value="edge" className="text-xs">
                                                {t('autoPaintTab.edgeWeighted')}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Label
                                        htmlFor="transition-opacity"
                                        className="w-28 shrink-0 text-xs text-muted-foreground whitespace-nowrap"
                                    >
                                        {t('autoPaintTab.transitionDetail')}
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
                                                {t('autoPaintTab.compact80Opacity')}
                                            </SelectItem>
                                            <SelectItem value="0.9" className="text-xs">
                                                {t('autoPaintTab.detailed90Opacity')}
                                            </SelectItem>
                                            <SelectItem value="0.95" className="text-xs">
                                                {t('autoPaintTab.maximum95Opacity')}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Label
                                        htmlFor="optimizer-seed"
                                        className="w-28 shrink-0 text-xs text-muted-foreground whitespace-nowrap"
                                    >
                                        {t('autoPaintTab.seedOptional')}
                                    </Label>
                                    <Input
                                        id="optimizer-seed"
                                        type="text"
                                        placeholder={t('autoPaintTab.automatic')}
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
                                        {t('autoPaintTab.transitionZones')}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                        {t('autoPaintTab.zoneCount', {
                                            count: autoPaintResult.transitionZones.length,
                                        })}
                                    </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground space-y-0.5">
                                    <div>
                                        {t('autoPaintTab.totalHeight', {
                                            height: autoPaintResult.totalHeight.toFixed(2),
                                        })}
                                        {autoPaintSliceData && (
                                            <span className="ml-2 text-muted-foreground/70">
                                                {t('autoPaintTab.physicalLayers', {
                                                    count: autoPaintSliceData.virtualSwatches
                                                        .length,
                                                })}
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
                                        <span>{t('autoPaintTab.0MmPlate')}</span>
                                        <span>
                                            {t('autoPaintTab.topHeight', {
                                                height: autoPaintResult.totalHeight.toFixed(2),
                                            })}
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
                                                            ? t('autoPaintTab.compressedZone', {
                                                                  thickness:
                                                                      zone.idealThickness.toFixed(
                                                                          2
                                                                      ),
                                                              })
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
                                                            {t('autoPaintTab.compressed')}
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
                            {t('autoPaintTab.addAtLeastOneFilamentToGenerateAutoPaint')}
                        </div>
                    )}

                    {/* Warning when no image colors */}
                    {filaments.length > 0 && filteredCount === 0 && (
                        <div className="mt-3 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 text-[10px]">
                            {t('autoPaintTab.loadAnImageToGenerateAutoPaintLayers')}
                        </div>
                    )}

                    {/* Overall Confidence Indicator */}
                    {autoPaintResult && (
                        <div className="mt-4 p-3 rounded-md border border-border/50 bg-muted/30 space-y-2">
                            <AppearanceModelStat result={autoPaintResult} />
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold">
                                    {t('autoPaintTab.resultConfidence')}
                                </span>
                                <span
                                    className={`text-sm font-bold ${getConfidenceColor(autoPaintResult.confidence)}`}
                                >
                                    {t('autoPaintTab.confidenceValue', {
                                        confidence: translateRuntimeMessage(
                                            getConfidenceLabel(autoPaintResult.confidence)
                                        ),
                                        percentage: (autoPaintResult.confidence * 100).toFixed(0),
                                    })}
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
                                    label={t('autoPaintTab.calibration')}
                                    value={autoPaintResult.confidenceFactors.calibrationQuality}
                                />
                                <ConfidenceStat
                                    label={t('autoPaintTab.coverage')}
                                    value={autoPaintResult.confidenceFactors.filamentCoverage}
                                />
                                <ConfidenceStat
                                    label={t('autoPaintTab.compression')}
                                    value={autoPaintResult.confidenceFactors.compressionImpact}
                                />
                            </div>
                            {autoPaintResult.confidence < 0.7 && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                    {t('autoPaintTab.tipCalibrateYourFilamentsForBetterAccuracy')}
                                </p>
                            )}
                            {/* Optimizer Metadata */}
                            {autoPaintResult.optimizerMetadata && (
                                <div className="space-y-1.5 pt-2">
                                    <div className="h-px bg-border/50" />
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold text-foreground">
                                            {t('autoPaintTab.optimizerPerformance')}
                                        </span>
                                        <span className="ml-auto flex items-center gap-1.5 text-[9px] text-muted-foreground">
                                            {autoPaintResult.optimizerMetadata.cacheHit && (
                                                <span className="px-1.5 py-0.5 rounded border border-border/60 bg-background/50">
                                                    {t('autoPaintTab.cacheHit')}
                                                </span>
                                            )}
                                            <span
                                                className="px-1.5 py-0.5 rounded border border-border/60 bg-background/50"
                                                title={
                                                    autoPaintResult.optimizerMetadata.optimality ===
                                                    'exact'
                                                        ? t(
                                                              'autoPaintTab.everyCandidateInTheApplicableExactSearchSpaceWas'
                                                          )
                                                        : t(
                                                              'autoPaintTab.heuristicSearchResultABetterCombinedOrderMayStill'
                                                          )
                                                }
                                            >
                                                {autoPaintResult.optimizerMetadata.optimality ===
                                                'exact'
                                                    ? t('autoPaintTab.exactOptimum')
                                                    : t('autoPaintTab.bestFound')}
                                            </span>
                                            {autoPaintResult.optimizerMetadata
                                                .singleRemovalMinimal && (
                                                <span
                                                    className="px-1.5 py-0.5 rounded border border-border/60 bg-background/50"
                                                    title={t(
                                                        'autoPaintTab.removingAnyOneFilamentOccurrenceWorsensPreservedColorsCoverage'
                                                    )}
                                                >
                                                    {t('autoPaintTab.noRemovableRun')}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                                        <div className="text-center p-2 rounded bg-background">
                                            <div className="text-muted-foreground mb-1">
                                                {t('autoPaintTab.algorithm')}
                                            </div>
                                            <div className="font-semibold text-foreground capitalize">
                                                {t(
                                                    `autoPaintTab.algorithms.${autoPaintResult.optimizerMetadata.algorithm}`,
                                                    {
                                                        defaultValue:
                                                            autoPaintResult.optimizerMetadata.algorithm.replace(
                                                                /-/g,
                                                                ' '
                                                            ),
                                                    }
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-center p-2 rounded bg-background">
                                            <div className="text-muted-foreground mb-1">
                                                {t('autoPaintTab.qualityScore')}
                                            </div>
                                            <div
                                                className={`font-semibold ${
                                                    autoPaintResult.colorSeparation?.satisfied ===
                                                    false
                                                        ? 'text-amber-600 dark:text-amber-400'
                                                        : 'text-green-600 dark:text-green-400'
                                                }`}
                                                title={
                                                    autoPaintResult.colorSeparation?.satisfied ===
                                                    false
                                                        ? t(
                                                              'autoPaintTab.someSourceColorsHadNoDistinctPrintableMatchInside'
                                                          )
                                                        : t('autoPaintTab.lowerIsBetter')
                                                }
                                            >
                                                {autoPaintResult.colorSeparation?.satisfied ===
                                                false
                                                    ? t('autoPaintTab.partialPalette')
                                                    : Number.isFinite(
                                                            autoPaintResult.optimizerMetadata.score
                                                        )
                                                      ? autoPaintResult.optimizerMetadata.score.toFixed(
                                                            2
                                                        )
                                                      : t('autoPaintTab.unavailable')}
                                            </div>
                                        </div>
                                        <div className="text-center p-2 rounded bg-background">
                                            <div className="text-muted-foreground mb-1">
                                                {t('autoPaintTab.iterations')}
                                            </div>
                                            <div className="font-semibold text-foreground">
                                                {autoPaintResult.optimizerMetadata.iterations.toLocaleString(
                                                    i18n.resolvedLanguage
                                                )}
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
                                    ? t('autoPaintTab.findingSuggestion')
                                    : t('autoPaintTab.suggestNextFilament')}
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
                                            title={t(
                                                'autoPaintTab.estimatedReductionInBlendAwareAverageColorErrorE'
                                            )}
                                        >
                                            <Trans
                                                ns="printing"
                                                i18nKey="autoPaintTab.estimatedImprovement"
                                                values={{
                                                    percentage:
                                                        nextBestResult.candidate.improvementPct.toFixed(
                                                            1
                                                        ),
                                                }}
                                                components={{
                                                    value: (
                                                        <span className="text-sm font-bold text-green-600 dark:text-green-400" />
                                                    ),
                                                }}
                                            />
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5 text-[10px] text-muted-foreground">
                                        <span
                                            title={t(
                                                'autoPaintTab.recommendedStartingHidingDistanceMmBorrowedFromTheNearest'
                                            )}
                                        >
                                            <Trans
                                                ns="printing"
                                                i18nKey="autoPaintTab.suggestedHd"
                                                values={{
                                                    value: nextBestResult.candidate.td.toFixed(2),
                                                }}
                                                components={{
                                                    value: (
                                                        <span className="font-semibold text-foreground" />
                                                    ),
                                                }}
                                            />
                                        </span>
                                        <span
                                            title={t(
                                                'autoPaintTab.percentageOfImagePixelsWhoseBlendAwareColorError'
                                            )}
                                        >
                                            <Trans
                                                ns="printing"
                                                i18nKey="autoPaintTab.capturesPixels"
                                                values={{
                                                    percentage: (
                                                        (nextBestResult.candidate.pixelsCaptured /
                                                            nextBestResult.totalPixels) *
                                                        100
                                                    ).toFixed(1),
                                                }}
                                                components={{
                                                    value: (
                                                        <span className="font-semibold text-foreground" />
                                                    ),
                                                }}
                                            />
                                        </span>
                                        <span
                                            title={t(
                                                'autoPaintTab.howFarThisColorSitsFromExistingFilamentsIn'
                                            )}
                                        >
                                            <Trans
                                                ns="printing"
                                                i18nKey="autoPaintTab.isolationValue"
                                                values={{
                                                    value: nextBestResult.candidate.isolationScore.toFixed(
                                                        2
                                                    ),
                                                }}
                                                components={{
                                                    value: (
                                                        <span className="font-semibold text-foreground" />
                                                    ),
                                                }}
                                            />
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
                                        {t('autoPaintTab.addToFilaments')}
                                    </Button>
                                </div>
                            )}
                            {nextBestResult && !nextBestResult.candidate && (
                                <p className="text-[10px] text-muted-foreground text-center">
                                    {t(
                                        'autoPaintTab.currentFilamentSetAlreadyCoversAllImageColorsWell'
                                    )}
                                </p>
                            )}
                            {nextBestError && (
                                <p className="text-[10px] text-destructive text-center">
                                    {translateRuntimeMessage(nextBestError)}
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
                printLayerHeight={printLayerHeight}
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
