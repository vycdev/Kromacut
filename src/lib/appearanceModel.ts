import type { Filament } from '../types';
import type {
    AppearanceAnchorLayer,
    AppearanceEmpiricalLutSampleV1,
    AppearanceEmpiricalLutV1,
    AppearanceExactAnchorV1,
    AppearanceLocalEvidenceV1,
    AppearanceRankModelV1,
} from '../types/appearance';
import { deltaE2000Lab, labToRgb, rgbToLab, type Lab, type Rgb } from './colorDifference';
import {
    fingerprintAppearanceFilaments,
    getPaletteProofEvaluationState,
    MAX_STACK_MATRIX_SAMPLES,
    type AppearanceProfileV1,
    type PaletteProofRecord,
    type PaletteTargetMatchQuality,
    type StackMatrixCalibrationV1,
} from './appearanceProfile';
import { channelHds } from './calibration';
import { fingerprintJson } from './fingerprint';

export interface AppearanceFitContext {
    filamentProfileFingerprint: string;
    layerHeight: number;
    firstLayerHeight: number;
    transitionOpacity: number;
    filaments?: readonly Filament[];
}

interface RankCandidate {
    cellId: string;
    stackKey: string;
    baseLab: Lab;
}

interface RankObservation {
    id: string;
    proofId: string;
    targetLab: Lab;
    candidates: RankCandidate[];
    winnerCellIds: Set<string>;
    matchQuality: PaletteTargetMatchQuality;
}

const MODEL_VERSION = 'lab-rank-local-v7' as const;
const SOFTMAX_TEMPERATURE = 5;
const TIE_LOGIT_PENALTY = 0.5;
const EXACT_MATCH_SIGMA = 2;
const CLOSE_MATCH_SIGMA = 6;
const LIGHTNESS_PRIOR_SIGMA = 2;
const CHROMA_PRIOR_SIGMA = 0.05;
const MIN_TRAINING_OBSERVATIONS = 8;
const MIN_TRAINING_DISTINCT_STACKS = 8;
const MIN_HELD_OUT = 2;
const MIN_HELD_OUT_AGREEMENT = 0.7;
const MIN_HELD_OUT_IMPROVEMENT = 0.1;
const EMPIRICAL_NEIGHBOR_COUNT = 8;
const EMPIRICAL_MAX_RECIPE_DISTANCE = 0.6;
const EMPIRICAL_MIN_COVERAGE_RADIUS = 5;
const EMPIRICAL_MAX_COVERAGE_RADIUS = 30;
const MATRIX_RECENCY_HALF_LIFE_DAYS = 365;
const MATRIX_AGREEMENT_SCALE_DELTA_E = 10;
const LOCAL_RECIPE_LAYER_DEPTH = 8;
const LOCAL_EVIDENCE_TARGET_RADIUS = 18;
const LOCAL_EVIDENCE_COLOR_RADIUS = 24;
const LOCAL_EVIDENCE_COLOR_SIGMA = 12;
const LOCAL_EVIDENCE_MIN_RECIPE_SIMILARITY = 0.2;
const LOCAL_EVIDENCE_CANDIDATE_LIMIT = 96;
const LOCAL_EVIDENCE_MAX_NEIGHBORS = 24;

function contextFingerprintPayload(context: AppearanceFitContext) {
    return {
        filamentProfileFingerprint: context.filamentProfileFingerprint,
        layerHeight: context.layerHeight,
        firstLayerHeight: context.firstLayerHeight,
        transitionOpacity: context.transitionOpacity,
    };
}

export function createIdentityAppearanceRankModel(
    contextFingerprint = fingerprintJson('appearance-fit-context-v1', null)
): AppearanceRankModelV1 {
    const payload = {
        modelVersion: MODEL_VERSION,
        contextFingerprint,
        applied: false,
        gateReason: 'insufficient-evidence',
        deltaL: 0,
        logChromaScale: 0,
        observations: [],
        noneJudgmentIds: [],
        exactAnchors: [],
        localEvidence: [],
        empiricalLuts: [],
    };
    return {
        schemaVersion: 1,
        modelVersion: MODEL_VERSION,
        fingerprint: fingerprintJson('appearance-rank-model-v7', payload),
        contextFingerprint,
        applied: false,
        gateReason: 'insufficient-evidence',
        deltaL: 0,
        logChromaScale: 0,
        confidence: 0,
        observationCount: 0,
        trainingObservationCount: 0,
        trainingDistinctStackCount: 0,
        noneCount: 0,
        distinctStackCount: 0,
        heldOutCount: 0,
        heldOutDistinctStackCount: 0,
        baselineAgreement: 0,
        fittedAgreement: 0,
        sourceProofIds: [],
        comparedStackKeys: [],
        exactAnchors: [],
        localEvidence: [],
        empiricalLuts: [],
    };
}

function sameProcess(record: PaletteProofRecord, context: AppearanceFitContext): boolean {
    return (
        record.process.filamentProfileFingerprint === context.filamentProfileFingerprint &&
        record.process.layerHeight === context.layerHeight &&
        record.process.firstLayerHeight === context.firstLayerHeight &&
        record.process.transitionOpacity === context.transitionOpacity
    );
}

function sameAnchorProcess(record: PaletteProofRecord, context: AppearanceFitContext): boolean {
    return (
        record.process.filamentProfileFingerprint === context.filamentProfileFingerprint &&
        record.process.layerHeight === context.layerHeight &&
        record.process.firstLayerHeight === context.firstLayerHeight
    );
}

function sameMatrixProcess(
    record: NonNullable<AppearanceProfileV1['stackMatrices']>[number],
    context: AppearanceFitContext
): boolean {
    const exactProfileMatch =
        record.process.filamentProfileFingerprint === context.filamentProfileFingerprint;
    const currentById = new Map(
        (context.filaments ?? []).map((filament) => [filament.id, filament])
    );
    const currentSubset = record.filaments
        .map((filament) => currentById.get(filament.id))
        .filter((filament): filament is Filament => Boolean(filament));
    const legacySubsetMatch =
        currentSubset.length === record.filaments.length &&
        fingerprintAppearanceFilaments(currentSubset) === record.process.filamentProfileFingerprint;
    return (
        record.status === 'complete' &&
        record.alignmentVerified !== false &&
        (exactProfileMatch || legacySubsetMatch) &&
        record.process.layerHeight === context.layerHeight
    );
}

function compatibleStackMatrices(
    appearance: AppearanceProfileV1 | undefined,
    context: AppearanceFitContext
): StackMatrixCalibrationV1[] {
    return (appearance?.stackMatrices ?? [])
        .filter((record) => sameMatrixProcess(record, context))
        .sort(
            (left, right) =>
                (right.completedAt ?? right.createdAt).localeCompare(
                    left.completedAt ?? left.createdAt
                ) || left.id.localeCompare(right.id)
        );
}

function matrixConfidence(record: NonNullable<AppearanceProfileV1['stackMatrices']>[number]) {
    return record.alignmentMethod === 'manual'
        ? 0.95
        : Math.max(0.55, record.alignmentConfidence ?? 0.75);
}

interface WeightedCompatibleStackMatrix {
    record: StackMatrixCalibrationV1;
    alignmentWeight: number;
    coverageWeight: number;
    recencyWeight: number;
    agreementWeight: number;
    matrixWeight: number;
}

function matrixRecipeKey(record: StackMatrixCalibrationV1, stack: readonly number[]): string {
    return stack.map((filamentIndex) => record.filaments[filamentIndex].id).join('\0');
}

function median(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Weight all compatible completed matrices without allowing a newer board to
 * erase earlier recipes. Agreement is intentionally neutral until at least
 * three boards measured the same recipe; two conflicting observations do not
 * contain enough information to identify the outlier.
 */
function weightedCompatibleStackMatrices(
    appearance: AppearanceProfileV1 | undefined,
    context: AppearanceFitContext
): WeightedCompatibleStackMatrix[] {
    const records = compatibleStackMatrices(appearance, context);
    if (records.length === 0) return [];

    const newestTimestamp = Math.max(
        ...records.map((record) => Date.parse(record.completedAt ?? record.createdAt))
    );
    const recipeGroups = new Map<string, Lab[]>();
    for (const record of records) {
        for (const sample of record.samples) {
            if (!sample.measuredColor) continue;
            const key = matrixRecipeKey(record, sample.stack);
            const measured = colorLab(sample.measuredColor.rgb);
            const group = recipeGroups.get(key) ?? [];
            group.push(measured);
            recipeGroups.set(key, group);
        }
    }

    return records.map((record) => {
        const measuredCount = record.samples.filter((sample) => sample.measuredColor).length;
        const recipeSpace = Math.max(
            1,
            Math.min(record.totalCombinationCount, MAX_STACK_MATRIX_SAMPLES)
        );
        const coverageFraction = Math.min(1, measuredCount / recipeSpace);
        // Keep sparse matrices useful while rewarding genuinely broader recipe coverage.
        const coverageWeight = 0.5 + 0.5 * Math.sqrt(coverageFraction);
        const observedTimestamp = Date.parse(record.completedAt ?? record.createdAt);
        const ageDays =
            Number.isFinite(observedTimestamp) && Number.isFinite(newestTimestamp)
                ? Math.max(0, newestTimestamp - observedTimestamp) / 86_400_000
                : 0;
        // Recency breaks otherwise-equal conflicts, but old unique evidence retains at least 50%.
        const recencyWeight =
            0.5 + 0.5 * Math.exp((-Math.LN2 * ageDays) / MATRIX_RECENCY_HALF_LIFE_DAYS);
        const agreementDistances: number[] = [];
        for (const sample of record.samples) {
            if (!sample.measuredColor) continue;
            const group = recipeGroups.get(matrixRecipeKey(record, sample.stack)) ?? [];
            if (group.length < 3) continue;
            const consensus: Lab = {
                L: median(group.map((entry) => entry.L)),
                a: median(group.map((entry) => entry.a)),
                b: median(group.map((entry) => entry.b)),
            };
            agreementDistances.push(deltaE2000Lab(colorLab(sample.measuredColor.rgb), consensus));
        }
        const disagreement = median(agreementDistances);
        const agreementWeight =
            agreementDistances.length === 0
                ? 1
                : 0.35 + 0.65 * Math.exp(-disagreement / MATRIX_AGREEMENT_SCALE_DELTA_E);
        const alignmentWeight = matrixConfidence(record);
        return {
            record,
            alignmentWeight,
            coverageWeight,
            recencyWeight,
            agreementWeight,
            matrixWeight: alignmentWeight * coverageWeight * recencyWeight * agreementWeight,
        };
    });
}

function colorLab(rgb: readonly [number, number, number]): Lab {
    return rgbToLab([rgb[0], rgb[1], rgb[2]]);
}

function collectObservations(
    appearance: AppearanceProfileV1 | undefined,
    context: AppearanceFitContext
): {
    observations: RankObservation[];
    noneCount: number;
    noneJudgmentIds: string[];
    proofIds: string[];
    stackKeys: Set<string>;
} {
    if (!appearance) {
        return {
            observations: [],
            noneCount: 0,
            noneJudgmentIds: [],
            proofIds: [],
            stackKeys: new Set(),
        };
    }

    const observations: RankObservation[] = [];
    const proofIds = new Set<string>();
    const stackKeys = new Set<string>();
    const noneJudgmentIds: string[] = [];
    let noneCount = 0;

    for (const record of [...appearance.proofs].sort((left, right) =>
        left.id.localeCompare(right.id)
    )) {
        if (!sameProcess(record, context)) continue;
        const evaluation = getPaletteProofEvaluationState(appearance, record.id);
        if (!evaluation.complete) continue;
        const cellsById = new Map(record.proof.cells.map((cell) => [cell.id, cell]));
        const prefixesByKey = new Map(
            record.prefixes.map((prefix) => [prefix.canonicalStackKey, prefix])
        );

        for (const judgment of [...evaluation.judgments].sort((left, right) =>
            left.id.localeCompare(right.id)
        )) {
            const candidates = judgment.candidateCellIds
                .map((cellId): RankCandidate | null => {
                    const cell = cellsById.get(cellId);
                    const prefix = cell ? prefixesByKey.get(cell.canonicalStackKey) : undefined;
                    if (!cell || !prefix) return null;
                    stackKeys.add(cell.canonicalStackKey);
                    return {
                        cellId,
                        stackKey: cell.canonicalStackKey,
                        baseLab: colorLab((prefix.basePredictedColor ?? prefix.predictedColor).rgb),
                    };
                })
                .filter((candidate): candidate is RankCandidate => candidate !== null);
            proofIds.add(record.id);
            if (judgment.response === 'none') {
                noneCount++;
                noneJudgmentIds.push(judgment.id);
                continue;
            }
            if (candidates.length < 2) continue;
            observations.push({
                id: judgment.id,
                proofId: record.id,
                targetLab: colorLab(judgment.targetColor.rgb),
                candidates,
                winnerCellIds: new Set(judgment.closestCellIds),
                matchQuality: judgment.matchQuality ?? 'best-available',
            });
        }
    }

    observations.sort((left, right) => left.id.localeCompare(right.id));
    return {
        observations,
        noneCount,
        noneJudgmentIds: noneJudgmentIds.sort(),
        proofIds: [...proofIds].sort(),
        stackKeys,
    };
}

interface LocalEvidenceAccumulator {
    sourceStackKey: string;
    targetLab: Lab;
    suffixLayers: AppearanceAnchorLayer[];
    proofIds: Set<string>;
    judgmentIds: Set<string>;
    observedAt: string;
    baseLightness: number;
    baseA: number;
    baseB: number;
    baseCount: number;
    winnerCount: number;
    loserCount: number;
    noneCount: number;
    tieWinnerCount: number;
    supportWeight: number;
    rejectionWeight: number;
    correctionWeight: number;
    correctionCount: number;
}

function localMatchQualityWeight(quality: PaletteTargetMatchQuality): number {
    if (quality === 'exact') return 1;
    if (quality === 'close') return 0.8;
    return 0.6;
}

function localCorrectionWeight(quality: PaletteTargetMatchQuality): number {
    if (quality === 'exact') return 1;
    if (quality === 'close') return 0.65;
    return 0;
}

function localTargetAffinity(candidate: Lab, target: Lab): number {
    const distance = deltaE2000Lab(candidate, target);
    return Math.exp(-0.5 * (distance / LOCAL_EVIDENCE_TARGET_RADIUS) ** 2);
}

/**
 * Turn every completed Palette Proof answer into target-aware local evidence.
 * Best-available winners provide local support without pretending to be an
 * absolute measurement. Close and Dead-on winners additionally provide a
 * decaying target-color correction. Losers and None answers provide rejection
 * evidence only when the candidate was plausibly close to the tested target.
 */
function collectLocalEvidence(
    appearance: AppearanceProfileV1 | undefined,
    context: AppearanceFitContext
): AppearanceLocalEvidenceV1[] {
    if (!appearance) return [];
    const accumulators = new Map<string, LocalEvidenceAccumulator>();

    for (const record of [...appearance.proofs].sort((left, right) =>
        left.id.localeCompare(right.id)
    )) {
        if (!sameProcess(record, context)) continue;
        const evaluation = getPaletteProofEvaluationState(appearance, record.id);
        if (!evaluation.complete) continue;
        const cellsById = new Map(record.proof.cells.map((cell) => [cell.id, cell]));
        const prefixesByKey = new Map(
            record.prefixes.map((prefix) => [prefix.canonicalStackKey, prefix])
        );

        for (const judgment of [...evaluation.judgments].sort((left, right) =>
            left.id.localeCompare(right.id)
        )) {
            const targetLab = colorLab(judgment.targetColor.rgb);
            const winnerCellIds = new Set(
                judgment.response === 'closest' ? judgment.closestCellIds : []
            );
            const quality =
                judgment.response === 'closest'
                    ? (judgment.matchQuality ?? 'best-available')
                    : 'best-available';
            const qualityWeight = localMatchQualityWeight(quality);
            const correctionWeight = localCorrectionWeight(quality);
            const tie = winnerCellIds.size > 1;

            for (const cellId of judgment.candidateCellIds) {
                const cell = cellsById.get(cellId);
                const prefix = cell ? prefixesByKey.get(cell.canonicalStackKey) : undefined;
                if (!cell || !prefix || prefix.prefixIndex >= record.stack.length) continue;
                const baseLab = colorLab((prefix.basePredictedColor ?? prefix.predictedColor).rgb);
                const targetKey = judgment.targetColor.hex.toLowerCase();
                const accumulatorKey = `${cell.canonicalStackKey}\0${targetKey}`;
                let accumulator = accumulators.get(accumulatorKey);
                if (!accumulator) {
                    const suffixStart = Math.max(
                        0,
                        prefix.prefixIndex + 1 - LOCAL_RECIPE_LAYER_DEPTH
                    );
                    accumulator = {
                        sourceStackKey: cell.canonicalStackKey,
                        targetLab,
                        suffixLayers: record.stack
                            .slice(suffixStart, prefix.prefixIndex + 1)
                            .map((layer) => ({ ...layer })),
                        proofIds: new Set(),
                        judgmentIds: new Set(),
                        observedAt: judgment.updatedAt,
                        baseLightness: 0,
                        baseA: 0,
                        baseB: 0,
                        baseCount: 0,
                        winnerCount: 0,
                        loserCount: 0,
                        noneCount: 0,
                        tieWinnerCount: 0,
                        supportWeight: 0,
                        rejectionWeight: 0,
                        correctionWeight: 0,
                        correctionCount: 0,
                    };
                    accumulators.set(accumulatorKey, accumulator);
                }

                accumulator.proofIds.add(record.id);
                accumulator.judgmentIds.add(judgment.id);
                if (judgment.updatedAt > accumulator.observedAt) {
                    accumulator.observedAt = judgment.updatedAt;
                }
                accumulator.baseLightness += baseLab.L;
                accumulator.baseA += baseLab.a;
                accumulator.baseB += baseLab.b;
                accumulator.baseCount++;

                const affinity = localTargetAffinity(baseLab, targetLab);
                if (judgment.response === 'none') {
                    accumulator.noneCount++;
                    accumulator.rejectionWeight += 0.85 * affinity;
                } else if (winnerCellIds.has(cellId)) {
                    accumulator.winnerCount++;
                    if (tie) accumulator.tieWinnerCount++;
                    // Even a distant Best-available winner is useful relative evidence.
                    accumulator.supportWeight += qualityWeight * (0.35 + 0.65 * affinity);
                    if (correctionWeight > 0) {
                        accumulator.correctionWeight += correctionWeight;
                        accumulator.correctionCount++;
                    }
                } else {
                    accumulator.loserCount++;
                    accumulator.rejectionWeight += qualityWeight * affinity;
                }
            }
        }
    }

    return [...accumulators.entries()]
        .map(([key, accumulator]): AppearanceLocalEvidenceV1 => {
            const totalEvidence = accumulator.supportWeight + accumulator.rejectionWeight;
            const preference =
                totalEvidence > 0
                    ? (accumulator.rejectionWeight - accumulator.supportWeight) /
                      (1 + totalEvidence)
                    : 0;
            const correctionStrength =
                accumulator.correctionCount > 0
                    ? (accumulator.correctionWeight / accumulator.correctionCount) *
                      (accumulator.supportWeight / Math.max(1e-9, totalEvidence))
                    : 0;
            return {
                id: fingerprintJson('appearance-local-evidence-v1', key),
                proofIds: [...accumulator.proofIds].sort(),
                judgmentIds: [...accumulator.judgmentIds].sort(),
                sourceStackKey: accumulator.sourceStackKey,
                baseLab: [
                    accumulator.baseLightness / accumulator.baseCount,
                    accumulator.baseA / accumulator.baseCount,
                    accumulator.baseB / accumulator.baseCount,
                ],
                targetLab: [
                    accumulator.targetLab.L,
                    accumulator.targetLab.a,
                    accumulator.targetLab.b,
                ],
                suffixLayers: accumulator.suffixLayers,
                observedAt: accumulator.observedAt,
                winnerCount: accumulator.winnerCount,
                loserCount: accumulator.loserCount,
                noneCount: accumulator.noneCount,
                tieWinnerCount: accumulator.tieWinnerCount,
                supportWeight: accumulator.supportWeight,
                rejectionWeight: accumulator.rejectionWeight,
                preference: Math.max(-1, Math.min(1, preference)),
                confidence: 1 - Math.exp(-totalEvidence),
                ...(correctionStrength > 0
                    ? {
                          correctionTargetLab: [
                              accumulator.targetLab.L,
                              accumulator.targetLab.a,
                              accumulator.targetLab.b,
                          ] as const,
                      }
                    : {}),
                correctionStrength,
            };
        })
        .sort((left, right) => left.id.localeCompare(right.id));
}

function transformLab(base: Lab, deltaL: number, logChromaScale: number): Lab {
    const chromaScale = Math.exp(logChromaScale);
    const transformed = {
        L: Math.max(0, Math.min(100, base.L + deltaL)),
        a: base.a * chromaScale,
        b: base.b * chromaScale,
    };
    return rgbToLab(labToRgb(transformed));
}

function layerToken(layer: AppearanceAnchorLayer): string {
    return [
        layer.filamentId,
        layer.filamentColor.toLowerCase(),
        Number(layer.thickness.toFixed(8)),
    ].join('\0');
}

function suffixTransmission(
    layers: readonly AppearanceAnchorLayer[],
    filamentsById: ReadonlyMap<string, Filament>
): number {
    const transmission: [number, number, number] = [1, 1, 1];
    for (const layer of layers) {
        const filament = filamentsById.get(layer.filamentId);
        if (!filament) return 1;
        const hds = channelHds(filament);
        for (let channel = 0; channel < 3; channel++) {
            if (!Number.isFinite(hds[channel]) || hds[channel] <= 0) return 1;
            transmission[channel] *= Math.pow(0.1, layer.thickness / hds[channel]);
        }
    }
    return Math.max(...transmission);
}

/**
 * Keep the complete visible filament run from the measured patch, then extend
 * downward by whole runs until the retained suffix hides the omitted substrate
 * to the same opacity endpoint used to build the proof.
 */
function transferableLayerSuffix(
    prefix: readonly AppearanceAnchorLayer[],
    filamentsById: ReadonlyMap<string, Filament>,
    maximumTransmission: number
): { layers: AppearanceAnchorLayer[]; maxSubstrateTransmission: number } {
    if (prefix.length === 0) return { layers: [], maxSubstrateTransmission: 1 };

    let start = prefix.length - 1;
    const terminalFilamentId = prefix[start].filamentId;
    while (start > 0 && prefix[start - 1].filamentId === terminalFilamentId) start--;

    let retained = prefix.slice(start);
    let transmission = suffixTransmission(retained, filamentsById);
    while (start > 0 && transmission > maximumTransmission + 1e-12) {
        const previousFilamentId = prefix[start - 1].filamentId;
        do {
            start--;
        } while (start > 0 && prefix[start - 1].filamentId === previousFilamentId);
        retained = prefix.slice(start);
        transmission = suffixTransmission(retained, filamentsById);
    }

    return {
        layers: retained.map((layer) => ({ ...layer })),
        maxSubstrateTransmission: start === 0 ? 0 : transmission,
    };
}

function transferableSuffix(
    record: PaletteProofRecord,
    prefixIndex: number,
    filamentsById: ReadonlyMap<string, Filament>
): { layers: AppearanceAnchorLayer[]; maxSubstrateTransmission: number } {
    return transferableLayerSuffix(
        record.stack.slice(0, prefixIndex + 1),
        filamentsById,
        Math.max(0.01, 1 - record.process.transitionOpacity)
    );
}

function collectExactAnchors(
    appearance: AppearanceProfileV1 | undefined,
    context: AppearanceFitContext,
    matrixEvidence = weightedCompatibleStackMatrices(appearance, context)
): AppearanceExactAnchorV1[] {
    if (!appearance) return [];
    const filamentsById = new Map(
        (context.filaments ?? []).map((filament) => [filament.id, filament])
    );
    const anchors: AppearanceExactAnchorV1[] = [];

    for (const record of appearance.proofs) {
        if (!sameAnchorProcess(record, context)) continue;
        const evaluation = getPaletteProofEvaluationState(appearance, record.id);
        if (!evaluation.complete) continue;
        const cellsById = new Map(record.proof.cells.map((cell) => [cell.id, cell]));

        for (const judgment of evaluation.judgments) {
            if (judgment.response !== 'closest' || judgment.matchQuality !== 'exact') {
                continue;
            }
            for (const cellId of judgment.closestCellIds) {
                const cell = cellsById.get(cellId);
                if (!cell || !judgment.candidateCellIds.includes(cellId)) continue;
                const suffix = transferableSuffix(record, cell.prefixIndex, filamentsById);
                if (suffix.layers.length === 0) continue;
                const targetLab = colorLab(judgment.targetColor.rgb);
                anchors.push({
                    id: `${judgment.id}:${cell.id}`,
                    proofId: record.id,
                    source: 'palette-proof',
                    sourceStackKey: cell.canonicalStackKey,
                    targetLab: [targetLab.L, targetLab.a, targetLab.b],
                    suffixLayers: suffix.layers,
                    maxSubstrateTransmission: suffix.maxSubstrateTransmission,
                    observedAt: judgment.updatedAt,
                    confidence: 1,
                });
            }
        }
    }

    for (const evidence of matrixEvidence) {
        const matrix = evidence.record;
        const backing = matrix.filaments[matrix.backingFilamentIndex];
        if (!backing) continue;
        for (const sample of matrix.samples) {
            if (!sample.measuredColor || !backing) continue;
            const foundation: AppearanceAnchorLayer[] = matrix.foundationLayerThicknesses.map(
                (thickness) => ({
                    filamentId: backing.id,
                    filamentColor: backing.color,
                    thickness,
                })
            );
            const matrixLayers: AppearanceAnchorLayer[] = sample.stack.map((filamentIndex) => {
                const filament = matrix.filaments[filamentIndex];
                return {
                    filamentId: filament.id,
                    filamentColor: filament.color,
                    thickness: matrix.process.layerHeight,
                };
            });
            const suffix = transferableLayerSuffix(
                [...foundation, ...matrixLayers],
                filamentsById,
                0.1
            );
            if (suffix.layers.length === 0) continue;
            const targetLab = colorLab(sample.measuredColor.rgb);
            anchors.push({
                id: `${matrix.id}:${sample.index}`,
                proofId: matrix.id,
                source: 'stack-matrix',
                sourceStackKey: sample.canonicalStackKey,
                targetLab: [targetLab.L, targetLab.a, targetLab.b],
                suffixLayers: suffix.layers,
                maxSubstrateTransmission: suffix.maxSubstrateTransmission,
                observedAt: matrix.completedAt ?? matrix.createdAt,
                confidence: evidence.matrixWeight,
            });
        }
    }

    return anchors.sort((left, right) => left.id.localeCompare(right.id));
}

function labTupleDistance(
    left: readonly [number, number, number],
    right: readonly [number, number, number]
): number {
    return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function empiricalCoverageRadius(samples: readonly AppearanceEmpiricalLutSampleV1[]): number {
    if (samples.length < 2) return EMPIRICAL_MIN_COVERAGE_RADIUS;
    const neighborRank = Math.min(4, samples.length - 1);
    const localSpacings = samples.map((sample, sampleIndex) => {
        const nearest: number[] = [];
        for (let index = 0; index < samples.length; index++) {
            if (index === sampleIndex) continue;
            const distance = labTupleDistance(sample.predictedLab, samples[index].predictedLab);
            const insertion = nearest.findIndex((value) => distance < value);
            if (insertion < 0) nearest.push(distance);
            else nearest.splice(insertion, 0, distance);
            if (nearest.length > neighborRank) nearest.pop();
        }
        return nearest[neighborRank - 1] ?? nearest.at(-1) ?? EMPIRICAL_MIN_COVERAGE_RADIUS;
    });
    localSpacings.sort((left, right) => left - right);
    const median = localSpacings[Math.floor(localSpacings.length / 2)];
    return Math.max(
        EMPIRICAL_MIN_COVERAGE_RADIUS,
        Math.min(EMPIRICAL_MAX_COVERAGE_RADIUS, median * 2.5)
    );
}

function collectEmpiricalLuts(
    appearance: AppearanceProfileV1 | undefined,
    context: AppearanceFitContext,
    matrixEvidence = weightedCompatibleStackMatrices(appearance, context)
): AppearanceEmpiricalLutV1[] {
    return matrixEvidence.flatMap((evidence): AppearanceEmpiricalLutV1[] => {
        const matrix = evidence.record;
        const backing = matrix.filaments[matrix.backingFilamentIndex];
        if (!backing) return [];
        const samples = matrix.samples
            .filter((sample) => Boolean(sample.measuredColor))
            .map((sample): AppearanceEmpiricalLutSampleV1 => {
                const predicted = colorLab(sample.predictedColor.rgb);
                const measured = colorLab(sample.measuredColor!.rgb);
                return {
                    id: `${matrix.id}:${sample.index}`,
                    sourceStackKey: sample.canonicalStackKey,
                    recipeFilamentIds: sample.stack.map(
                        (filamentIndex) => matrix.filaments[filamentIndex].id
                    ),
                    predictedLab: [predicted.L, predicted.a, predicted.b],
                    measuredLab: [measured.L, measured.a, measured.b],
                    confidence: evidence.matrixWeight,
                    exactAnchorId: `${matrix.id}:${sample.index}`,
                };
            })
            .sort((left, right) => left.id.localeCompare(right.id));
        if (samples.length === 0) return [];
        return [
            {
                id: `empirical-lut:${matrix.id}`,
                sourceMatrixId: matrix.id,
                observedAt: matrix.completedAt ?? matrix.createdAt,
                layerHeight: matrix.process.layerHeight,
                stackLayerCount: matrix.stackLayerCount,
                backingFilamentId: backing.id,
                filamentIds: matrix.filaments.map((filament) => filament.id),
                alignmentWeight: evidence.alignmentWeight,
                coverageWeight: evidence.coverageWeight,
                recencyWeight: evidence.recencyWeight,
                agreementWeight: evidence.agreementWeight,
                matrixWeight: evidence.matrixWeight,
                coverageRadius: empiricalCoverageRadius(samples),
                samples,
            },
        ];
    });
}

function observationLoss(
    observation: RankObservation,
    deltaL: number,
    logChromaScale: number
): number {
    const logits = observation.candidates.map(
        (candidate) =>
            -deltaE2000Lab(
                observation.targetLab,
                transformLab(candidate.baseLab, deltaL, logChromaScale)
            ) / SOFTMAX_TEMPERATURE
    );
    const maximum = Math.max(...logits);
    const weights = logits.map((logit) => Math.exp(logit - maximum));
    const denominator = weights.reduce((sum, value) => sum + value, 0);
    const winnerMass = observation.candidates.reduce(
        (sum, candidate, index) =>
            sum + (observation.winnerCellIds.has(candidate.cellId) ? weights[index] : 0),
        0
    );
    const selectedLogits = observation.candidates
        .map((candidate, index) =>
            observation.winnerCellIds.has(candidate.cellId) ? logits[index] : null
        )
        .filter((logit): logit is number => logit !== null);
    const selectedMean =
        selectedLogits.reduce((sum, logit) => sum + logit, 0) / Math.max(1, selectedLogits.length);
    const tiePenalty =
        selectedLogits.length > 1
            ? (TIE_LOGIT_PENALTY *
                  selectedLogits.reduce((sum, logit) => sum + (logit - selectedMean) ** 2, 0)) /
              selectedLogits.length
            : 0;
    const rankLoss =
        -Math.log(Math.max(1e-12, winnerMass / Math.max(1e-12, denominator))) + tiePenalty;
    if (observation.matchQuality === 'best-available') return rankLoss;

    const selectedDistances = observation.candidates
        .filter((candidate) => observation.winnerCellIds.has(candidate.cellId))
        .map((candidate) =>
            deltaE2000Lab(
                observation.targetLab,
                transformLab(candidate.baseLab, deltaL, logChromaScale)
            )
        );
    const sigma = observation.matchQuality === 'exact' ? EXACT_MATCH_SIGMA : CLOSE_MATCH_SIGMA;
    const anchorLoss =
        selectedDistances.reduce((sum, distance) => sum + 0.5 * (distance / sigma) ** 2, 0) /
        Math.max(1, selectedDistances.length);
    return rankLoss + anchorLoss;
}

function objective(
    observations: readonly RankObservation[],
    deltaL: number,
    logChromaScale: number
): number {
    const likelihood = observations.reduce(
        (sum, observation) => sum + observationLoss(observation, deltaL, logChromaScale),
        0
    );
    const prior =
        0.5 * (deltaL / LIGHTNESS_PRIOR_SIGMA) ** 2 +
        0.5 * (logChromaScale / CHROMA_PRIOR_SIGMA) ** 2;
    return likelihood + prior;
}

function agreement(
    observations: readonly RankObservation[],
    deltaL: number,
    logChromaScale: number
): number {
    if (observations.length === 0) return 0;
    let matches = 0;
    for (const observation of observations) {
        let best = observation.candidates[0];
        let bestDistance = Infinity;
        for (const candidate of observation.candidates) {
            const distance = deltaE2000Lab(
                observation.targetLab,
                transformLab(candidate.baseLab, deltaL, logChromaScale)
            );
            if (
                distance < bestDistance ||
                (distance === bestDistance && candidate.cellId < best.cellId)
            ) {
                best = candidate;
                bestDistance = distance;
            }
        }
        if (observation.winnerCellIds.has(best.cellId)) matches++;
    }
    return matches / observations.length;
}

function stableHash32(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index++) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
    }
    return hash >>> 0;
}

function splitObservations(observations: readonly RankObservation[]): {
    training: RankObservation[];
    heldOut: RankObservation[];
} {
    const proofIds = [...new Set(observations.map((observation) => observation.proofId))];
    if (proofIds.length < 2) return { training: [...observations], heldOut: [] };
    proofIds.sort(
        (left, right) => stableHash32(left) - stableHash32(right) || left.localeCompare(right)
    );
    const groups = proofIds.map((proofId) => ({
        proofId,
        observationCount: observations.filter((observation) => observation.proofId === proofId)
            .length,
    }));
    const desiredHeldOutCount = Math.max(MIN_HELD_OUT, Math.floor(observations.length * 0.2));
    const subsetsByCount = new Map<number, string[]>([[0, []]]);
    for (const group of groups) {
        for (const [count, selectedProofIds] of [...subsetsByCount.entries()].reverse()) {
            const nextCount = count + group.observationCount;
            if (nextCount >= observations.length || subsetsByCount.has(nextCount)) continue;
            subsetsByCount.set(nextCount, [...selectedProofIds, group.proofId]);
        }
    }
    const heldOutProofIds = new Set(
        [...subsetsByCount.entries()]
            .filter(([count]) => count > 0 && count < observations.length)
            .sort(
                ([leftCount, leftIds], [rightCount, rightIds]) =>
                    Number(leftCount < MIN_HELD_OUT) - Number(rightCount < MIN_HELD_OUT) ||
                    Math.abs(leftCount - desiredHeldOutCount) -
                        Math.abs(rightCount - desiredHeldOutCount) ||
                    leftCount - rightCount ||
                    leftIds.join('\0').localeCompare(rightIds.join('\0'))
            )[0]?.[1] ?? []
    );
    return {
        training: observations.filter((observation) => !heldOutProofIds.has(observation.proofId)),
        heldOut: observations.filter((observation) => heldOutProofIds.has(observation.proofId)),
    };
}

function observationStackKeys(observations: readonly RankObservation[]): Set<string> {
    return new Set(
        observations.flatMap((observation) =>
            observation.candidates.map((candidate) => candidate.stackKey)
        )
    );
}

export function fitAppearanceRankModel(
    appearance: AppearanceProfileV1 | undefined,
    context: AppearanceFitContext
): AppearanceRankModelV1 {
    const contextFingerprint = fingerprintJson(
        'appearance-fit-context-v1',
        contextFingerprintPayload(context)
    );
    const matrixEvidence = weightedCompatibleStackMatrices(appearance, context);
    const exactAnchors = collectExactAnchors(appearance, context, matrixEvidence);
    const localEvidence = collectLocalEvidence(appearance, context);
    const empiricalLuts = collectEmpiricalLuts(appearance, context, matrixEvidence);
    const { observations, noneCount, noneJudgmentIds, proofIds, stackKeys } = collectObservations(
        appearance,
        context
    );
    const sourceProofIds = [
        ...new Set([...proofIds, ...exactAnchors.map((anchor) => anchor.proofId)]),
    ].sort();
    const comparedStackKeys = new Set([
        ...stackKeys,
        ...exactAnchors.map((anchor) => anchor.sourceStackKey),
    ]);
    const { training, heldOut } = splitObservations(observations);
    const trainingStackKeys = observationStackKeys(training);
    const heldOutStackKeys = observationStackKeys(heldOut);
    let bestDeltaL = 0;
    let bestLogChromaScale = 0;
    let bestObjective = objective(training, 0, 0);

    const consider = (deltaL: number, logChromaScale: number) => {
        const candidateObjective = objective(training, deltaL, logChromaScale);
        const candidateMagnitude = Math.abs(deltaL) + Math.abs(logChromaScale) * 20;
        const bestMagnitude = Math.abs(bestDeltaL) + Math.abs(bestLogChromaScale) * 20;
        if (
            candidateObjective < bestObjective - 1e-9 ||
            (Math.abs(candidateObjective - bestObjective) <= 1e-9 &&
                candidateMagnitude < bestMagnitude)
        ) {
            bestObjective = candidateObjective;
            bestDeltaL = deltaL;
            bestLogChromaScale = logChromaScale;
        }
    };
    for (let lightnessStep = -12; lightnessStep <= 12; lightnessStep++) {
        for (let chromaStep = -15; chromaStep <= 10; chromaStep++) {
            consider(lightnessStep / 2, chromaStep / 100);
        }
    }
    const coarseDeltaL = bestDeltaL;
    const coarseLogChromaScale = bestLogChromaScale;
    for (let lightnessStep = -2; lightnessStep <= 2; lightnessStep++) {
        for (let chromaStep = -2; chromaStep <= 2; chromaStep++) {
            consider(
                Math.max(-6, Math.min(6, coarseDeltaL + lightnessStep / 4)),
                Math.max(-0.15, Math.min(0.1, coarseLogChromaScale + chromaStep / 200))
            );
        }
    }

    const baselineAgreement = agreement(heldOut, 0, 0);
    const fittedAgreement = agreement(heldOut, bestDeltaL, bestLogChromaScale);
    const hasTrainingEvidence =
        training.length >= MIN_TRAINING_OBSERVATIONS &&
        trainingStackKeys.size >= MIN_TRAINING_DISTINCT_STACKS;
    const hasHeldOutEvidence = heldOut.length >= MIN_HELD_OUT;
    const improvesTraining = bestObjective < objective(training, 0, 0) - 1e-6;
    const heldOutImprovement = fittedAgreement - baselineAgreement;
    const applied =
        hasTrainingEvidence &&
        hasHeldOutEvidence &&
        improvesTraining &&
        fittedAgreement >= MIN_HELD_OUT_AGREEMENT &&
        heldOutImprovement >= MIN_HELD_OUT_IMPROVEMENT;
    const gateReason: AppearanceRankModelV1['gateReason'] = !hasTrainingEvidence
        ? 'insufficient-evidence'
        : !hasHeldOutEvidence
          ? 'insufficient-heldout'
          : !improvesTraining
            ? 'no-training-improvement'
            : fittedAgreement < MIN_HELD_OUT_AGREEMENT
              ? 'heldout-below-threshold'
              : heldOutImprovement < MIN_HELD_OUT_IMPROVEMENT
                ? 'heldout-no-improvement'
                : 'applied';
    const evidenceStrength = Math.min(1, training.length / 24);
    const confidence = applied
        ? Math.max(
              0,
              Math.min(
                  1,
                  evidenceStrength *
                      (0.4 + 0.4 * fittedAgreement + 0.2 * Math.min(1, heldOutImprovement / 0.3))
              )
          )
        : 0;
    const resolvedDeltaL = applied ? bestDeltaL : 0;
    const resolvedLogChromaScale = applied ? bestLogChromaScale : 0;
    const fingerprintPayload = {
        modelVersion: MODEL_VERSION,
        contextFingerprint,
        applied,
        gateReason,
        deltaL: resolvedDeltaL,
        logChromaScale: resolvedLogChromaScale,
        observations: observations.map((observation) => ({
            id: observation.id,
            targetLab: observation.targetLab,
            candidates: observation.candidates.map((candidate) => ({
                cellId: candidate.cellId,
                stackKey: candidate.stackKey,
                baseLab: candidate.baseLab,
            })),
            winnerCellIds: [...observation.winnerCellIds].sort(),
            matchQuality: observation.matchQuality,
        })),
        trainingObservationIds: training.map((observation) => observation.id),
        heldOutObservationIds: heldOut.map((observation) => observation.id),
        noneJudgmentIds,
        exactAnchors,
        localEvidence,
        empiricalLuts,
    };

    return {
        schemaVersion: 1,
        modelVersion: MODEL_VERSION,
        fingerprint: fingerprintJson('appearance-rank-model-v7', fingerprintPayload),
        contextFingerprint,
        applied,
        gateReason,
        deltaL: resolvedDeltaL,
        logChromaScale: resolvedLogChromaScale,
        confidence,
        observationCount: observations.length,
        trainingObservationCount: training.length,
        trainingDistinctStackCount: trainingStackKeys.size,
        noneCount,
        distinctStackCount: comparedStackKeys.size,
        heldOutCount: heldOut.length,
        heldOutDistinctStackCount: heldOutStackKeys.size,
        baselineAgreement,
        fittedAgreement,
        sourceProofIds,
        comparedStackKeys: [...comparedStackKeys].sort(),
        exactAnchors,
        localEvidence,
        empiricalLuts,
    };
}

interface AnchorTrieNode {
    children: Map<string, AnchorTrieNode>;
    anchors: AppearanceExactAnchorV1[];
}

const anchorTrieCache = new WeakMap<AppearanceRankModelV1, AnchorTrieNode>();

function anchorTrie(model: AppearanceRankModelV1): AnchorTrieNode {
    const cached = anchorTrieCache.get(model);
    if (cached) return cached;
    const root: AnchorTrieNode = { children: new Map(), anchors: [] };
    for (const anchor of model.exactAnchors ?? []) {
        let node = root;
        for (let index = anchor.suffixLayers.length - 1; index >= 0; index--) {
            const token = layerToken(anchor.suffixLayers[index]);
            let child = node.children.get(token);
            if (!child) {
                child = { children: new Map(), anchors: [] };
                node.children.set(token, child);
            }
            node = child;
        }
        node.anchors.push(anchor);
    }
    for (const node of [root, ...root.children.values()]) {
        node.anchors.sort((left, right) => left.id.localeCompare(right.id));
    }
    anchorTrieCache.set(model, root);
    return root;
}

function matchingExactAnchors(
    model: AppearanceRankModelV1,
    prefixLayers: readonly AppearanceAnchorLayer[]
): AppearanceExactAnchorV1[] {
    if ((model.exactAnchors?.length ?? 0) === 0 || prefixLayers.length === 0) return [];
    let node = anchorTrie(model);
    let deepest: AppearanceExactAnchorV1[] = [];
    for (let index = prefixLayers.length - 1; index >= 0; index--) {
        const child = node.children.get(layerToken(prefixLayers[index]));
        if (!child) break;
        node = child;
        if (node.anchors.length > 0) deepest = node.anchors;
    }
    return deepest;
}

function recipeKey(filamentIds: readonly string[]): string {
    return filamentIds.join('\0');
}

function recipeWindow(
    lut: AppearanceEmpiricalLutV1,
    prefixLayers: readonly AppearanceAnchorLayer[]
): string[] | null {
    if (prefixLayers.length < lut.stackLayerCount) return null;
    const window = prefixLayers.slice(-lut.stackLayerCount);
    const supportedFilaments = new Set(lut.filamentIds);
    if (
        window.some(
            (layer) =>
                !supportedFilaments.has(layer.filamentId) ||
                Math.abs(layer.thickness - lut.layerHeight) > 1e-6
        )
    ) {
        return null;
    }
    return window.map((layer) => layer.filamentId);
}

function recipeDistance(left: readonly string[], right: readonly string[]): number {
    if (left.length !== right.length || left.length === 0) return Infinity;
    let mismatch = 0;
    let total = 0;
    for (let index = 0; index < left.length; index++) {
        // Top layers have more optical influence, but bottom layers still
        // participate so order and substrate context remain meaningful.
        const weight = Math.pow(2, index / Math.max(1, left.length - 1));
        total += weight;
        if (left[index] !== right[index]) mismatch += weight;
    }
    return mismatch / total;
}

interface IndexedEmpiricalNeighbor {
    sample: AppearanceEmpiricalLutSampleV1;
    recipeDistance: number;
}

interface EmpiricalLutIndex {
    exactByRecipe: Map<string, AppearanceEmpiricalLutSampleV1>;
    neighborsByRecipe: Map<string, IndexedEmpiricalNeighbor[]>;
}

const empiricalLutIndexCache = new WeakMap<AppearanceEmpiricalLutV1, EmpiricalLutIndex>();

function empiricalLutIndex(lut: AppearanceEmpiricalLutV1): EmpiricalLutIndex {
    const cached = empiricalLutIndexCache.get(lut);
    if (cached) return cached;
    const index = {
        exactByRecipe: new Map<string, AppearanceEmpiricalLutSampleV1>(),
        neighborsByRecipe: new Map<string, IndexedEmpiricalNeighbor[]>(),
    };
    for (const sample of lut.samples) {
        index.exactByRecipe.set(recipeKey(sample.recipeFilamentIds), sample);
    }
    empiricalLutIndexCache.set(lut, index);
    return index;
}

function nearbyEmpiricalSamples(
    lut: AppearanceEmpiricalLutV1,
    recipe: readonly string[]
): IndexedEmpiricalNeighbor[] {
    const index = empiricalLutIndex(lut);
    const key = recipeKey(recipe);
    const cached = index.neighborsByRecipe.get(key);
    if (cached) return cached;
    const neighbors: IndexedEmpiricalNeighbor[] = [];
    for (const sample of lut.samples) {
        const distance = recipeDistance(recipe, sample.recipeFilamentIds);
        if (distance > EMPIRICAL_MAX_RECIPE_DISTANCE) continue;
        const candidate = { sample, recipeDistance: distance };
        const insertion = neighbors.findIndex(
            (neighbor) =>
                candidate.recipeDistance < neighbor.recipeDistance ||
                (candidate.recipeDistance === neighbor.recipeDistance &&
                    candidate.sample.id < neighbor.sample.id)
        );
        if (insertion < 0) neighbors.push(candidate);
        else neighbors.splice(insertion, 0, candidate);
        if (neighbors.length > EMPIRICAL_NEIGHBOR_COUNT) neighbors.pop();
    }
    index.neighborsByRecipe.set(key, neighbors);
    return neighbors;
}

interface IndexedLocalEvidence {
    evidence: AppearanceLocalEvidenceV1;
    influence: number;
    colorDistance: number;
    recipeSimilarity: number;
}

interface LocalEvidenceIndex {
    byFilamentId: Map<string, AppearanceLocalEvidenceV1[]>;
    byTopFilamentId: Map<string, AppearanceLocalEvidenceV1[]>;
    byTopRunPair: Map<string, AppearanceLocalEvidenceV1[]>;
}

const localEvidenceIndexCache = new WeakMap<AppearanceRankModelV1, LocalEvidenceIndex>();

function localEvidenceIndex(model: AppearanceRankModelV1): LocalEvidenceIndex {
    const cached = localEvidenceIndexCache.get(model);
    if (cached) return cached;
    const byFilamentId = new Map<string, AppearanceLocalEvidenceV1[]>();
    const byTopFilamentId = new Map<string, AppearanceLocalEvidenceV1[]>();
    const byTopRunPair = new Map<string, AppearanceLocalEvidenceV1[]>();
    const add = (
        index: Map<string, AppearanceLocalEvidenceV1[]>,
        key: string | undefined,
        evidence: AppearanceLocalEvidenceV1
    ) => {
        if (!key) return;
        const entries = index.get(key) ?? [];
        entries.push(evidence);
        index.set(key, entries);
    };
    for (const evidence of model.localEvidence ?? []) {
        for (const filamentId of new Set(evidence.suffixLayers.map((layer) => layer.filamentId))) {
            add(byFilamentId, filamentId, evidence);
        }
        const topRuns = recentRunFilamentIds(evidence.suffixLayers);
        add(byTopFilamentId, topRuns[0], evidence);
        add(byTopRunPair, localRunPairKey(topRuns), evidence);
    }
    for (const index of [byFilamentId, byTopFilamentId, byTopRunPair]) {
        for (const entries of index.values()) {
            entries.sort((left, right) => left.id.localeCompare(right.id));
        }
    }
    const index = { byFilamentId, byTopFilamentId, byTopRunPair };
    localEvidenceIndexCache.set(model, index);
    return index;
}

function recentRunFilamentIds(layers: readonly AppearanceAnchorLayer[]): string[] {
    const runs: string[] = [];
    for (let index = layers.length - 1; index >= 0 && runs.length < 2; index--) {
        const filamentId = layers[index].filamentId;
        if (runs.at(-1) !== filamentId) runs.push(filamentId);
    }
    return runs;
}

function localRunPairKey(runs: readonly string[]): string | undefined {
    return runs.length >= 2 ? `${runs[0]}\0${runs[1]}` : undefined;
}

function localRecipeSimilarity(
    evidenceLayers: readonly AppearanceAnchorLayer[],
    prefixLayers: readonly AppearanceAnchorLayer[]
): number {
    if (evidenceLayers.length === 0 || prefixLayers.length === 0) return 0;
    const evidence = evidenceLayers.slice(-LOCAL_RECIPE_LAYER_DEPTH).reverse();
    const current = prefixLayers.slice(-LOCAL_RECIPE_LAYER_DEPTH).reverse();
    const currentFilaments = new Set(current.map((layer) => layer.filamentId));
    const depth = Math.max(evidence.length, current.length);
    let similarity = 0;
    let totalWeight = 0;

    for (let index = 0; index < depth; index++) {
        const weight = Math.pow(0.75, index);
        totalWeight += weight;
        const expected = evidence[index];
        const actual = current[index];
        if (!expected || !actual) continue;
        if (expected.filamentId === actual.filamentId) {
            const thicknessScale = Math.max(0.04, expected.thickness, actual.thickness);
            similarity +=
                weight *
                Math.exp(-Math.abs(expected.thickness - actual.thickness) / thicknessScale);
        } else if (currentFilaments.has(expected.filamentId)) {
            // Preserve a weaker composition relationship when the same material
            // moved within the recent optical stack.
            similarity += weight * 0.2;
        }
    }
    return totalWeight > 0 ? similarity / totalWeight : 0;
}

function nearbyLocalEvidence(
    base: Lab,
    model: AppearanceRankModelV1,
    prefixLayers: readonly AppearanceAnchorLayer[]
): IndexedLocalEvidence[] {
    if ((model.localEvidence?.length ?? 0) === 0 || prefixLayers.length === 0) return [];
    const index = localEvidenceIndex(model);
    const considered = new Set<string>();
    const colorCandidates: Array<{
        evidence: AppearanceLocalEvidenceV1;
        colorDistance: number;
        recipeTier: number;
    }> = [];
    const consider = (entries: readonly AppearanceLocalEvidenceV1[], recipeTier: number) => {
        for (const evidence of entries) {
            if (considered.has(evidence.id)) continue;
            considered.add(evidence.id);
            const evidenceBase: Lab = {
                L: evidence.baseLab[0],
                a: evidence.baseLab[1],
                b: evidence.baseLab[2],
            };
            const colorDistance = deltaE2000Lab(base, evidenceBase);
            if (colorDistance <= LOCAL_EVIDENCE_COLOR_RADIUS) {
                colorCandidates.push({ evidence, colorDistance, recipeTier });
            }
        }
    };
    const topRuns = recentRunFilamentIds(prefixLayers);
    const runPairKey = localRunPairKey(topRuns);
    if (runPairKey) consider(index.byTopRunPair.get(runPairKey) ?? [], 0);
    if (topRuns[0]) consider(index.byTopFilamentId.get(topRuns[0]) ?? [], 1);

    // Matching the optically dominant top run is normally enough to fill the
    // bounded candidate set. Only broaden to moved/reordered recent materials
    // when that strong neighborhood is sparse.
    if (colorCandidates.length < LOCAL_EVIDENCE_CANDIDATE_LIMIT) {
        for (const filamentId of new Set(
            prefixLayers.slice(-LOCAL_RECIPE_LAYER_DEPTH).map((layer) => layer.filamentId)
        )) {
            consider(index.byFilamentId.get(filamentId) ?? [], 2);
        }
    }

    return colorCandidates
        .sort(
            (left, right) =>
                left.recipeTier - right.recipeTier ||
                left.colorDistance - right.colorDistance ||
                left.evidence.id.localeCompare(right.evidence.id)
        )
        .slice(0, LOCAL_EVIDENCE_CANDIDATE_LIMIT)
        .map((candidate): IndexedLocalEvidence | null => {
            const evidence = candidate.evidence;
            const colorDistance = candidate.colorDistance;
            const recipeSimilarity = localRecipeSimilarity(evidence.suffixLayers, prefixLayers);
            if (recipeSimilarity < LOCAL_EVIDENCE_MIN_RECIPE_SIMILARITY) return null;
            const colorKernel = Math.exp(-0.5 * (colorDistance / LOCAL_EVIDENCE_COLOR_SIGMA) ** 2);
            return {
                evidence,
                colorDistance,
                recipeSimilarity,
                influence: evidence.confidence * colorKernel * recipeSimilarity * recipeSimilarity,
            };
        })
        .filter((entry): entry is IndexedLocalEvidence => entry !== null && entry.influence > 0)
        .sort(
            (left, right) =>
                right.influence - left.influence ||
                left.colorDistance - right.colorDistance ||
                left.evidence.id.localeCompare(right.evidence.id)
        )
        .slice(0, LOCAL_EVIDENCE_MAX_NEIGHBORS);
}

export interface AppearanceLocalPreferenceMatch {
    targetLab: Lab;
    preference: number;
    confidence: number;
    evidenceIds: readonly string[];
}

export interface AppearanceLocalMatch {
    evidenceIds: readonly string[];
    correctionStrength: number;
    uncertainty: number;
    preferences: readonly AppearanceLocalPreferenceMatch[];
}

interface LocalAppearanceResolution {
    lab: Lab;
    match: AppearanceLocalMatch;
}

function resolveLocalEvidence(
    base: Lab,
    current: Lab,
    model: AppearanceRankModelV1,
    prefixLayers: readonly AppearanceAnchorLayer[]
): LocalAppearanceResolution | undefined {
    const neighbors = nearbyLocalEvidence(base, model, prefixLayers);
    if (neighbors.length === 0) return undefined;

    const preferenceGroups = new Map<
        string,
        {
            targetLab: Lab;
            signedMass: number;
            totalMass: number;
            evidenceIds: string[];
        }
    >();
    let positivePreferenceMass = 0;
    let preferenceMass = 0;
    let correctionMass = 0;
    let correctionLightness = 0;
    let correctionA = 0;
    let correctionB = 0;

    for (const neighbor of neighbors) {
        const targetLab: Lab = {
            L: neighbor.evidence.targetLab[0],
            a: neighbor.evidence.targetLab[1],
            b: neighbor.evidence.targetLab[2],
        };
        const targetKey = neighbor.evidence.targetLab.map((value) => value.toFixed(4)).join('\0');
        const group = preferenceGroups.get(targetKey) ?? {
            targetLab,
            signedMass: 0,
            totalMass: 0,
            evidenceIds: [],
        };
        group.signedMass += neighbor.influence * neighbor.evidence.preference;
        group.totalMass += neighbor.influence;
        group.evidenceIds.push(neighbor.evidence.id);
        preferenceGroups.set(targetKey, group);
        positivePreferenceMass += neighbor.influence * Math.max(0, neighbor.evidence.preference);
        preferenceMass += neighbor.influence * Math.abs(neighbor.evidence.preference);

        if (neighbor.evidence.correctionTargetLab && neighbor.evidence.correctionStrength > 0) {
            const weight = neighbor.influence * neighbor.evidence.correctionStrength;
            correctionMass += weight;
            correctionLightness += neighbor.evidence.correctionTargetLab[0] * weight;
            correctionA += neighbor.evidence.correctionTargetLab[1] * weight;
            correctionB += neighbor.evidence.correctionTargetLab[2] * weight;
        }
    }

    const correctionStrength = Math.min(0.9, correctionMass);
    let corrected = current;
    if (correctionMass > 0 && correctionStrength > 0) {
        const target = {
            L: correctionLightness / correctionMass,
            a: correctionA / correctionMass,
            b: correctionB / correctionMass,
        };
        corrected = rgbToLab(
            labToRgb({
                L: current.L + (target.L - current.L) * correctionStrength,
                a: current.a + (target.a - current.a) * correctionStrength,
                b: current.b + (target.b - current.b) * correctionStrength,
            })
        );
    }

    const preferences = [...preferenceGroups.values()]
        .map(
            (group): AppearanceLocalPreferenceMatch => ({
                targetLab: group.targetLab,
                preference: Math.max(
                    -1,
                    Math.min(1, group.signedMass / Math.max(0.5, group.totalMass))
                ),
                confidence: Math.min(1, group.totalMass),
                evidenceIds: [...new Set(group.evidenceIds)].sort(),
            })
        )
        .sort(
            (left, right) =>
                right.confidence - left.confidence ||
                left.evidenceIds.join('\0').localeCompare(right.evidenceIds.join('\0'))
        );

    return {
        lab: corrected,
        match: {
            evidenceIds: neighbors.map((neighbor) => neighbor.evidence.id).sort(),
            correctionStrength,
            uncertainty:
                preferenceMass > 0
                    ? Math.min(1, positivePreferenceMass / Math.max(0.5, preferenceMass))
                    : 0,
            preferences,
        },
    };
}

export interface EmpiricalLutMatch {
    kind: 'exact' | 'interpolated';
    /** Highest-weight contributing LUT, retained for compact snapshot provenance. */
    lutId: string;
    /** Every matrix LUT that contributed to the combined prediction. */
    lutIds: readonly string[];
    sampleIds: readonly string[];
    confidence: number;
    nearestPredictedDistance: number;
}

interface EmpiricalResolution {
    lab: Lab;
    match: EmpiricalLutMatch;
    exactAnchorIds?: readonly string[];
}

function resolveEmpiricalLut(
    base: Lab,
    model: AppearanceRankModelV1,
    prefixLayers: readonly AppearanceAnchorLayer[]
): EmpiricalResolution | undefined {
    const resolutions: EmpiricalResolution[] = [];
    const baseTuple: [number, number, number] = [base.L, base.a, base.b];

    for (const lut of model.empiricalLuts ?? []) {
        const recipe = recipeWindow(lut, prefixLayers);
        if (!recipe) continue;
        const index = empiricalLutIndex(lut);
        const exact = index.exactByRecipe.get(recipeKey(recipe));
        if (exact) {
            resolutions.push({
                lab: {
                    L: exact.measuredLab[0],
                    a: exact.measuredLab[1],
                    b: exact.measuredLab[2],
                },
                match: {
                    kind: 'exact',
                    lutId: lut.id,
                    lutIds: [lut.id],
                    sampleIds: [exact.id],
                    confidence: exact.confidence,
                    nearestPredictedDistance: labTupleDistance(baseTuple, exact.predictedLab),
                },
                exactAnchorIds: [exact.exactAnchorId],
            });
            continue;
        }

        const neighbors = nearbyEmpiricalSamples(lut, recipe)
            .map((neighbor) => ({
                ...neighbor,
                predictedDistance: labTupleDistance(baseTuple, neighbor.sample.predictedLab),
            }))
            .sort(
                (left, right) =>
                    left.predictedDistance - right.predictedDistance ||
                    left.recipeDistance - right.recipeDistance ||
                    left.sample.id.localeCompare(right.sample.id)
            );
        if (neighbors.length < 2) continue;
        const nearestPredictedDistance = neighbors[0].predictedDistance;
        if (nearestPredictedDistance > lut.coverageRadius) continue;

        let totalWeight = 0;
        let lightness = 0;
        let a = 0;
        let b = 0;
        let weightedConfidence = 0;
        for (const neighbor of neighbors) {
            const normalizedPredictedDistance =
                neighbor.predictedDistance / Math.max(1, lut.coverageRadius);
            const combinedDistance = normalizedPredictedDistance + neighbor.recipeDistance * 2;
            const weight = neighbor.sample.confidence / Math.max(0.05, combinedDistance) ** 2;
            totalWeight += weight;
            lightness += neighbor.sample.measuredLab[0] * weight;
            a += neighbor.sample.measuredLab[1] * weight;
            b += neighbor.sample.measuredLab[2] * weight;
            weightedConfidence += neighbor.sample.confidence * weight;
        }
        if (!Number.isFinite(totalWeight) || totalWeight <= 0) continue;
        const interpolated = rgbToLab(
            labToRgb({
                L: lightness / totalWeight,
                a: a / totalWeight,
                b: b / totalWeight,
            })
        );
        resolutions.push({
            lab: interpolated,
            match: {
                kind: 'interpolated',
                lutId: lut.id,
                lutIds: [lut.id],
                sampleIds: neighbors.map((neighbor) => neighbor.sample.id),
                confidence:
                    (weightedConfidence / totalWeight) *
                    Math.max(0, 1 - nearestPredictedDistance / lut.coverageRadius),
                nearestPredictedDistance,
            },
        });
    }

    const exact = resolutions.filter((resolution) => resolution.match.kind === 'exact');
    const contributors = (exact.length > 0 ? exact : resolutions)
        .filter((resolution) => resolution.match.confidence > 0)
        .sort(
            (left, right) =>
                right.match.confidence - left.match.confidence ||
                left.match.nearestPredictedDistance - right.match.nearestPredictedDistance ||
                left.match.lutId.localeCompare(right.match.lutId)
        );
    if (contributors.length === 0) return undefined;
    if (contributors.length === 1) return contributors[0];

    let totalWeight = 0;
    let lightness = 0;
    let a = 0;
    let b = 0;
    for (const contributor of contributors) {
        const weight = contributor.match.confidence;
        totalWeight += weight;
        lightness += contributor.lab.L * weight;
        a += contributor.lab.a * weight;
        b += contributor.lab.b * weight;
    }
    const blended = rgbToLab(
        labToRgb({
            L: lightness / totalWeight,
            a: a / totalWeight,
            b: b / totalWeight,
        })
    );
    return {
        lab: blended,
        match: {
            kind: exact.length > 0 ? 'exact' : 'interpolated',
            lutId: contributors[0].match.lutId,
            lutIds: contributors.map((contributor) => contributor.match.lutId),
            sampleIds: [
                ...new Set(contributors.flatMap((contributor) => contributor.match.sampleIds)),
            ],
            confidence:
                contributors.reduce((sum, contributor) => sum + contributor.match.confidence, 0) /
                contributors.length,
            nearestPredictedDistance: Math.min(
                ...contributors.map((contributor) => contributor.match.nearestPredictedDistance)
            ),
        },
        ...(exact.length > 0
            ? {
                  exactAnchorIds: [
                      ...new Set(
                          contributors.flatMap((contributor) => contributor.exactAnchorIds ?? [])
                      ),
                  ],
              }
            : {}),
    };
}

export interface ResolvedAppearancePrediction {
    lab: Lab;
    exactAnchor?: AppearanceExactAnchorV1;
    empiricalMatch?: EmpiricalLutMatch;
    localMatch?: AppearanceLocalMatch;
}

export function resolveAppearanceRankModel(
    base: Lab,
    model: AppearanceRankModelV1,
    prefixLayers?: readonly AppearanceAnchorLayer[]
): ResolvedAppearancePrediction {
    const fitted = model.applied
        ? transformLab(base, model.deltaL, model.logChromaScale)
        : { ...base };
    const anchors = prefixLayers ? matchingExactAnchors(model, prefixLayers) : [];
    const sourcePriority = (anchor: AppearanceExactAnchorV1) =>
        anchor.source === 'palette-proof' ? 2 : anchor.source === 'stack-matrix' ? 1 : 0;
    const sortedAnchors = [...anchors].sort(
        (left, right) =>
            sourcePriority(right) - sourcePriority(left) ||
            (right.confidence ?? 0) - (left.confidence ?? 0) ||
            (right.observedAt ?? '').localeCompare(left.observedAt ?? '') ||
            left.id.localeCompare(right.id)
    );
    const paletteProofAnchor = sortedAnchors.find((anchor) => anchor.source === 'palette-proof');
    if (paletteProofAnchor) {
        return {
            lab: {
                L: paletteProofAnchor.targetLab[0],
                a: paletteProofAnchor.targetLab[1],
                b: paletteProofAnchor.targetLab[2],
            },
            exactAnchor: paletteProofAnchor,
        };
    }

    const empirical = prefixLayers ? resolveEmpiricalLut(base, model, prefixLayers) : undefined;
    let resolvedLab = fitted;
    let exactAnchor: AppearanceExactAnchorV1 | undefined;
    let empiricalMatch: EmpiricalLutMatch | undefined;
    if (empirical) {
        const empiricalAnchors = (empirical.exactAnchorIds ?? [])
            .map((id) => model.exactAnchors.find((anchor) => anchor.id === id))
            .filter((anchor): anchor is AppearanceExactAnchorV1 => Boolean(anchor));
        const primaryAnchor = empiricalAnchors[0];
        exactAnchor =
            empiricalAnchors.length <= 1
                ? primaryAnchor
                : {
                      ...primaryAnchor,
                      id: `empirical-exact:${empirical.match.sampleIds.join('|')}`,
                      targetLab: [empirical.lab.L, empirical.lab.a, empirical.lab.b] as const,
                      confidence: empirical.match.confidence,
                      observedAt: empiricalAnchors
                          .map((anchor) => anchor.observedAt ?? '')
                          .sort()
                          .at(-1),
                  };
        resolvedLab = empirical.lab;
        empiricalMatch = empirical.match;
    } else {
        exactAnchor = sortedAnchors[0];
        if (exactAnchor) {
            resolvedLab = {
                L: exactAnchor.targetLab[0],
                a: exactAnchor.targetLab[1],
                b: exactAnchor.targetLab[2],
            };
        }
    }

    const local = prefixLayers
        ? resolveLocalEvidence(base, resolvedLab, model, prefixLayers)
        : undefined;
    if (!local) {
        return {
            lab: resolvedLab,
            ...(exactAnchor ? { exactAnchor } : {}),
            ...(empiricalMatch ? { empiricalMatch } : {}),
        };
    }

    // A local Close/Dead-on correction supersedes a Stack Matrix exact sample's
    // color, so retaining that matrix anchor would incorrectly advertise the
    // corrected result as the untouched measured matrix value. Palette Proof
    // exact anchors already returned above and therefore remain authoritative.
    if (local.match.correctionStrength > 0 && exactAnchor?.source === 'stack-matrix') {
        exactAnchor = undefined;
    }
    return {
        lab: local.lab,
        ...(exactAnchor ? { exactAnchor } : {}),
        ...(empiricalMatch ? { empiricalMatch } : {}),
        localMatch: local.match,
    };
}

export function applyAppearanceRankModel(
    base: Lab,
    model: AppearanceRankModelV1,
    prefixLayers?: readonly AppearanceAnchorLayer[]
): Lab {
    return resolveAppearanceRankModel(base, model, prefixLayers).lab;
}

export function appearanceLabToRgb(lab: Lab): Rgb {
    return labToRgb(lab);
}
