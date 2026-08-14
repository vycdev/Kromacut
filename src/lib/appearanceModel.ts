import type { Filament } from '../types';
import type {
    AppearanceAnchorLayer,
    AppearanceEmpiricalLutSampleV1,
    AppearanceEmpiricalLutV1,
    AppearanceExactAnchorV1,
    AppearanceRankModelV1,
} from '../types/appearance';
import { deltaE2000Lab, labToRgb, rgbToLab, type Lab, type Rgb } from './colorDifference';
import {
    fingerprintAppearanceFilaments,
    getPaletteProofEvaluationState,
    type AppearanceProfileV1,
    type PaletteProofRecord,
    type PaletteTargetMatchQuality,
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

const MODEL_VERSION = 'lab-rank-global-v5' as const;
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
        empiricalLuts: [],
    };
    return {
        schemaVersion: 1,
        modelVersion: MODEL_VERSION,
        fingerprint: fingerprintJson('appearance-rank-model-v5', payload),
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

function latestCompatibleStackMatrix(
    appearance: AppearanceProfileV1 | undefined,
    context: AppearanceFitContext
): NonNullable<AppearanceProfileV1['stackMatrices']>[number] | undefined {
    return (appearance?.stackMatrices ?? [])
        .filter((record) => sameMatrixProcess(record, context))
        .sort((left, right) =>
            (right.completedAt ?? right.createdAt).localeCompare(left.completedAt ?? left.createdAt)
        )[0];
}

function matrixConfidence(record: NonNullable<AppearanceProfileV1['stackMatrices']>[number]) {
    return record.alignmentMethod === 'manual'
        ? 0.95
        : Math.max(0.55, record.alignmentConfidence ?? 0.75);
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

    for (const record of appearance.proofs) {
        if (!sameProcess(record, context)) continue;
        const evaluation = getPaletteProofEvaluationState(appearance, record.id);
        if (!evaluation.complete) continue;
        const cellsById = new Map(record.proof.cells.map((cell) => [cell.id, cell]));
        const prefixesByKey = new Map(
            record.prefixes.map((prefix) => [prefix.canonicalStackKey, prefix])
        );

        for (const judgment of evaluation.judgments) {
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
    context: AppearanceFitContext
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

    const latestMatrix = latestCompatibleStackMatrix(appearance, context);
    if (latestMatrix) {
        const backing = latestMatrix.filaments[latestMatrix.backingFilamentIndex];
        for (const sample of latestMatrix.samples) {
            if (!sample.measuredColor || !backing) continue;
            const foundation: AppearanceAnchorLayer[] = latestMatrix.foundationLayerThicknesses.map(
                (thickness) => ({
                    filamentId: backing.id,
                    filamentColor: backing.color,
                    thickness,
                })
            );
            const matrixLayers: AppearanceAnchorLayer[] = sample.stack.map((filamentIndex) => {
                const filament = latestMatrix.filaments[filamentIndex];
                return {
                    filamentId: filament.id,
                    filamentColor: filament.color,
                    thickness: latestMatrix.process.layerHeight,
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
                id: `${latestMatrix.id}:${sample.index}`,
                proofId: latestMatrix.id,
                source: 'stack-matrix',
                sourceStackKey: sample.canonicalStackKey,
                targetLab: [targetLab.L, targetLab.a, targetLab.b],
                suffixLayers: suffix.layers,
                maxSubstrateTransmission: suffix.maxSubstrateTransmission,
                observedAt: latestMatrix.completedAt ?? latestMatrix.createdAt,
                confidence: matrixConfidence(latestMatrix),
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
    context: AppearanceFitContext
): AppearanceEmpiricalLutV1[] {
    const matrix = latestCompatibleStackMatrix(appearance, context);
    const backing = matrix?.filaments[matrix.backingFilamentIndex];
    if (!matrix || !backing) return [];

    const confidence = matrixConfidence(matrix);
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
                confidence,
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
            coverageRadius: empiricalCoverageRadius(samples),
            samples,
        },
    ];
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
    const exactAnchors = collectExactAnchors(appearance, context);
    const empiricalLuts = collectEmpiricalLuts(appearance, context);
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
        empiricalLuts,
    };

    return {
        schemaVersion: 1,
        modelVersion: MODEL_VERSION,
        fingerprint: fingerprintJson('appearance-rank-model-v5', fingerprintPayload),
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

export interface EmpiricalLutMatch {
    kind: 'exact' | 'interpolated';
    lutId: string;
    sampleIds: readonly string[];
    confidence: number;
    nearestPredictedDistance: number;
}

interface EmpiricalResolution {
    lab: Lab;
    match: EmpiricalLutMatch;
    exactAnchorId?: string;
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
                    sampleIds: [exact.id],
                    confidence: exact.confidence,
                    nearestPredictedDistance: labTupleDistance(baseTuple, exact.predictedLab),
                },
                exactAnchorId: exact.exactAnchorId,
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
                sampleIds: neighbors.map((neighbor) => neighbor.sample.id),
                confidence:
                    (weightedConfidence / totalWeight) *
                    Math.max(0, 1 - nearestPredictedDistance / lut.coverageRadius),
                nearestPredictedDistance,
            },
        });
    }

    return resolutions.sort(
        (left, right) =>
            Number(left.match.kind !== 'exact') - Number(right.match.kind !== 'exact') ||
            left.match.nearestPredictedDistance - right.match.nearestPredictedDistance ||
            right.match.confidence - left.match.confidence ||
            left.match.lutId.localeCompare(right.match.lutId)
    )[0];
}

export interface ResolvedAppearancePrediction {
    lab: Lab;
    exactAnchor?: AppearanceExactAnchorV1;
    empiricalMatch?: EmpiricalLutMatch;
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
    if (empirical) {
        const exactAnchor = empirical.exactAnchorId
            ? model.exactAnchors.find((anchor) => anchor.id === empirical.exactAnchorId)
            : undefined;
        return {
            lab: empirical.lab,
            exactAnchor,
            empiricalMatch: empirical.match,
        };
    }

    const exactAnchor = sortedAnchors[0];
    if (!exactAnchor) return { lab: fitted };
    return {
        lab: {
            L: exactAnchor.targetLab[0],
            a: exactAnchor.targetLab[1],
            b: exactAnchor.targetLab[2],
        },
        exactAnchor,
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
