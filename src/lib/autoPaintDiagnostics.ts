import type { Filament } from '../types';
import type { AppearanceAnchorLayer, AppearanceRankModelV1 } from '../types/appearance';
import {
    deltaE2000Lab,
    deltaELab,
    type AutoPaintImageSwatch,
    type AutoPaintResult,
    type Lab,
} from './autoPaint';
import { resolveAppearanceRankModel, type ResolvedAppearancePrediction } from './appearanceModel';
import type { AppearanceProfileV1 } from './appearanceProfile';
import type { OptimizerDiagnosticEvent } from './optimizer';
import type { FrontlitCalibrationDiagnostics } from './calibration';

export const AUTO_PAINT_DIAGNOSTIC_TRACE_SCHEMA_VERSION = 1;

export interface AutoPaintDiagnosticRunInputV1 {
    schemaVersion: typeof AUTO_PAINT_DIAGNOSTIC_TRACE_SCHEMA_VERSION;
    appVersion: string;
    requestId: number;
    runtime: {
        userAgent: string;
        hardwareConcurrency: number | null;
        deviceMemoryGiB: number | null;
        crossOriginIsolated: boolean;
    };
    appearanceEvidenceFingerprint: string;
    regionWeightingMode: 'uniform' | 'center' | 'edge';
    filaments: Filament[];
    calibrationDiagnostics: Array<{
        filamentId: string;
        filamentColor: string;
        calibration: FrontlitCalibrationDiagnostics;
    }>;
    imageSwatches: AutoPaintImageSwatch[];
    settings: {
        layerHeight: number;
        firstLayerHeight: number;
        maxHeight: number | null;
        enhancedColorMatch: boolean;
        maxRepeatedSwaps: number;
        optimizerAlgorithm: string;
        optimizerSeed: number | null;
        transitionOpacity: number;
        preserveSeparation: boolean;
        separationMaxDeltaE: number;
        failOnSeparationError: boolean;
    };
    appearanceProfile: AppearanceProfileV1 | null;
}

export interface AutoPaintDiagnosticTimingV1 {
    appearanceFitMs: number;
    generationMs: number;
    traceAssemblyMs: number;
    totalWorkerMs: number;
}

interface DiagnosticPaletteEntryV1 {
    paletteIndex: number;
    height: number;
    canonicalStackKey: string;
    basePredictedColor: string;
    basePredictedLab: readonly [number, number, number];
    predictedColor: string;
    predictedLab: readonly [number, number, number];
    snapshotResolutionDeltaE: number;
    appearanceStatus: string;
    predictionConfidence: unknown;
    /** Inclusive layer range in result.finalStack.layers; avoids duplicating every prefix. */
    physicalStackLayerRange: readonly [number, number];
    provenance: {
        exactAnchor?: unknown;
        empiricalMatch?: unknown;
        localMatch?: unknown;
        empiricalSamples: unknown[];
        localEvidence: unknown[];
    };
}

interface DiagnosticTargetCandidateV1 {
    paletteIndex: number;
    height: number;
    predictedColor: string;
    deltaE76: number;
    deltaE2000: number;
    withinSeparationLimit: boolean | null;
    selected: boolean;
    confidence: number | null;
    method: string | null;
}

interface DiagnosticTargetMappingV1 {
    targetIndex: number;
    targetColor: string;
    targetLab: readonly [number, number, number];
    usageWeight: number;
    selectedPaletteIndex: number;
    selectedPredictedColor: string;
    selectedDeltaE76: number;
    selectedDeltaE2000: number;
    selectedCandidateRankByDeltaE2000: number;
    preservedWithinThreshold: boolean | null;
    decision: 'nearest-printable' | 'unique-within-limit' | 'merged-into-preserved';
    sampleContext: unknown;
    candidates: DiagnosticTargetCandidateV1[];
}

export interface AutoPaintDiagnosticRunResultV1 {
    schemaVersion: typeof AUTO_PAINT_DIAGNOSTIC_TRACE_SCHEMA_VERSION;
    timing: AutoPaintDiagnosticTimingV1;
    optimizerEvents: OptimizerDiagnosticEvent[];
    result: AutoPaintResult;
    analysis: {
        appearanceModel: {
            fingerprint: string;
            contextFingerprint: string;
            applied: boolean;
            gateReason: string;
            confidence: number;
            exactAnchorCount: number;
            localEvidenceCount: number;
            empiricalLutCount: number;
            empiricalSampleCount: number;
            effectiveOptics: unknown;
        };
        objective: {
            weightedMeanDeltaE2000: number;
            weightedP95DeltaE2000: number;
            worstDeltaE2000: number;
            coverageWithinDeltaE6: number;
            weightedPredictionUncertainty: number;
            selectedPrintableColorCount: number;
            availablePrintableColorCount: number;
            unusedPrintableColorCount: number;
        };
        printablePalette: DiagnosticPaletteEntryV1[];
        targetMappings: DiagnosticTargetMappingV1[];
    };
}

function tupleLab(tuple: readonly [number, number, number]): Lab {
    return { L: tuple[0], a: tuple[1], b: tuple[2] };
}

function roundMetric(value: number): number {
    return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : value;
}

function evidenceById(model: AppearanceRankModelV1) {
    const empiricalSamples = new Map<string, unknown>();
    for (const lut of model.empiricalLuts) {
        for (const sample of lut.samples) {
            empiricalSamples.set(sample.id, {
                lutId: lut.id,
                sourceMatrixId: lut.sourceMatrixId,
                sample,
            });
        }
    }
    return {
        empiricalSamples,
        localEvidence: new Map(model.localEvidence.map((evidence) => [evidence.id, evidence])),
    };
}

function buildPaletteDiagnostics(result: AutoPaintResult): DiagnosticPaletteEntryV1[] {
    const { finalStack } = result;
    const evidence = evidenceById(finalStack.appearanceModel);
    const prefix: AppearanceAnchorLayer[] = [];

    return finalStack.palette.map((entry, index) => {
        const layer = finalStack.layers[index];
        prefix.push({
            filamentId: layer.filamentId,
            filamentColor: layer.filamentColor,
            thickness: layer.thickness,
        });
        const resolution: ResolvedAppearancePrediction = resolveAppearanceRankModel(
            tupleLab(layer.basePredictedLab),
            finalStack.appearanceModel,
            prefix,
            { includeContributions: true }
        );
        const empiricalSampleIds = resolution.empiricalMatch?.sampleIds ?? [];
        const localEvidenceIds = resolution.localMatch?.evidenceIds ?? [];

        return {
            paletteIndex: index,
            height: entry.height,
            canonicalStackKey: entry.canonicalStackKey,
            basePredictedColor: entry.basePredictedColor.hex,
            basePredictedLab: entry.basePredictedLab,
            predictedColor: entry.predictedColor.hex,
            predictedLab: entry.predictedLab,
            snapshotResolutionDeltaE: roundMetric(
                deltaE2000Lab(tupleLab(entry.predictedLab), resolution.lab)
            ),
            appearanceStatus: entry.appearanceStatus,
            predictionConfidence: entry.predictionConfidence ?? null,
            physicalStackLayerRange: [0, index],
            provenance: {
                ...(resolution.exactAnchor ? { exactAnchor: resolution.exactAnchor } : {}),
                ...(resolution.empiricalMatch ? { empiricalMatch: resolution.empiricalMatch } : {}),
                ...(resolution.localMatch ? { localMatch: resolution.localMatch } : {}),
                empiricalSamples: empiricalSampleIds
                    .map((id) => evidence.empiricalSamples.get(id))
                    .filter((sample) => sample !== undefined),
                localEvidence: localEvidenceIds
                    .map((id) => evidence.localEvidence.get(id))
                    .filter((sample) => sample !== undefined),
            },
        };
    });
}

function buildTargetDiagnostics(result: AutoPaintResult): DiagnosticTargetMappingV1[] {
    const limit = result.finalStack.settings.separationMaxDeltaE;
    return result.finalStack.targetMappings.map((mapping) => {
        const targetLab = tupleLab(mapping.targetLab);
        const candidates: DiagnosticTargetCandidateV1[] = result.finalStack.palette
            .map((entry) => {
                const candidateLab = tupleLab(entry.predictedLab);
                const deltaE2000 = deltaE2000Lab(targetLab, candidateLab);
                return {
                    paletteIndex: entry.index,
                    height: entry.height,
                    predictedColor: entry.predictedColor.hex,
                    deltaE76: roundMetric(deltaELab(targetLab, candidateLab)),
                    deltaE2000: roundMetric(deltaE2000),
                    withinSeparationLimit: limit === undefined ? null : deltaE2000 <= limit,
                    selected: entry.index === mapping.paletteIndex,
                    confidence: entry.predictionConfidence?.confidence ?? null,
                    method: entry.predictionConfidence?.method ?? null,
                };
            })
            .sort(
                (left, right) =>
                    left.deltaE2000 - right.deltaE2000 || left.paletteIndex - right.paletteIndex
            );
        const selected = candidates.find((candidate) => candidate.selected)!;
        const preserved = mapping.preservedWithinThreshold;
        const decision =
            preserved === true
                ? ('unique-within-limit' as const)
                : preserved === false
                  ? ('merged-into-preserved' as const)
                  : ('nearest-printable' as const);

        return {
            targetIndex: mapping.index,
            targetColor: mapping.targetColor.hex,
            targetLab: mapping.targetLab,
            usageWeight: mapping.usageWeight,
            selectedPaletteIndex: mapping.paletteIndex,
            selectedPredictedColor: mapping.predictedColor.hex,
            selectedDeltaE76: selected.deltaE76,
            selectedDeltaE2000: selected.deltaE2000,
            selectedCandidateRankByDeltaE2000: candidates.indexOf(selected) + 1,
            preservedWithinThreshold: preserved ?? null,
            decision,
            sampleContext: mapping.sampleContext,
            candidates,
        };
    });
}

function weightedPercentile(
    samples: Array<{ value: number; weight: number }>,
    percentile: number
): number {
    if (samples.length === 0) return 0;
    const ordered = [...samples].sort((left, right) => left.value - right.value);
    const total = ordered.reduce((sum, sample) => sum + sample.weight, 0);
    const threshold = total * percentile;
    let cumulative = 0;
    for (const sample of ordered) {
        cumulative += sample.weight;
        if (cumulative >= threshold) return sample.value;
    }
    return ordered.at(-1)!.value;
}

function buildObjectiveSummary(
    result: AutoPaintResult,
    mappings: DiagnosticTargetMappingV1[]
): AutoPaintDiagnosticRunResultV1['analysis']['objective'] {
    const totalWeight = mappings.reduce((sum, mapping) => sum + mapping.usageWeight, 0);
    const normalizedTotal = Math.max(Number.EPSILON, totalWeight);
    const errors = mappings.map((mapping) => ({
        value: mapping.selectedDeltaE2000,
        weight: mapping.usageWeight,
    }));
    const selectedIndices = new Set(mappings.map((mapping) => mapping.selectedPaletteIndex));
    const uncertainty = mappings.reduce((sum, mapping) => {
        const entry = result.finalStack.palette[mapping.selectedPaletteIndex];
        return sum + (entry.predictionConfidence?.uncertainty ?? 1) * mapping.usageWeight;
    }, 0);

    return {
        weightedMeanDeltaE2000: roundMetric(
            errors.reduce((sum, sample) => sum + sample.value * sample.weight, 0) / normalizedTotal
        ),
        weightedP95DeltaE2000: roundMetric(weightedPercentile(errors, 0.95)),
        worstDeltaE2000: roundMetric(
            errors.reduce((worst, sample) => Math.max(worst, sample.value), 0)
        ),
        coverageWithinDeltaE6: roundMetric(
            errors
                .filter((sample) => sample.value <= 6)
                .reduce((sum, sample) => sum + sample.weight, 0) / normalizedTotal
        ),
        weightedPredictionUncertainty: roundMetric(uncertainty / normalizedTotal),
        selectedPrintableColorCount: selectedIndices.size,
        availablePrintableColorCount: result.finalStack.palette.length,
        unusedPrintableColorCount: Math.max(
            0,
            result.finalStack.palette.length - selectedIndices.size
        ),
    };
}

export function buildAutoPaintDiagnosticRunResult(
    result: AutoPaintResult,
    optimizerEvents: OptimizerDiagnosticEvent[],
    timing: AutoPaintDiagnosticTimingV1
): AutoPaintDiagnosticRunResultV1 {
    const printablePalette = buildPaletteDiagnostics(result);
    const targetMappings = buildTargetDiagnostics(result);
    const model = result.finalStack.appearanceModel;

    return {
        schemaVersion: AUTO_PAINT_DIAGNOSTIC_TRACE_SCHEMA_VERSION,
        timing,
        optimizerEvents,
        result,
        analysis: {
            appearanceModel: {
                fingerprint: model.fingerprint,
                contextFingerprint: model.contextFingerprint,
                applied: model.applied,
                gateReason: model.gateReason,
                confidence: model.confidence,
                exactAnchorCount: model.exactAnchors.length,
                localEvidenceCount: model.localEvidence.length,
                empiricalLutCount: model.empiricalLuts.length,
                empiricalSampleCount: model.empiricalLuts.reduce(
                    (sum, lut) => sum + lut.samples.length,
                    0
                ),
                effectiveOptics: model.effectiveOptics ?? null,
            },
            objective: buildObjectiveSummary(result, targetMappings),
            printablePalette,
            targetMappings,
        },
    };
}
