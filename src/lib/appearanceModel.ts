import type { AppearanceRankModelV1 } from '../types/appearance';
import { deltaE2000Lab, labToRgb, rgbToLab, type Lab, type Rgb } from './colorDifference';
import {
    getPaletteProofEvaluationState,
    type AppearanceProfileV1,
    type PaletteProofRecord,
} from './appearanceProfile';
import { fingerprintJson } from './fingerprint';

export interface AppearanceFitContext {
    filamentProfileFingerprint: string;
    layerHeight: number;
    firstLayerHeight: number;
    transitionOpacity: number;
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
}

const MODEL_VERSION = 'lab-rank-global-v1' as const;
const SOFTMAX_TEMPERATURE = 5;
const TIE_LOGIT_PENALTY = 0.5;
const LIGHTNESS_PRIOR_SIGMA = 2;
const CHROMA_PRIOR_SIGMA = 0.05;
const MIN_OBSERVATIONS = 8;
const MIN_DISTINCT_STACKS = 8;
const MIN_HELD_OUT = 2;
const MIN_HELD_OUT_AGREEMENT = 0.7;
const MIN_HELD_OUT_IMPROVEMENT = 0.1;

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
    };
    return {
        schemaVersion: 1,
        modelVersion: MODEL_VERSION,
        fingerprint: fingerprintJson('appearance-rank-model-v1', payload),
        contextFingerprint,
        applied: false,
        gateReason: 'insufficient-evidence',
        deltaL: 0,
        logChromaScale: 0,
        confidence: 0,
        observationCount: 0,
        noneCount: 0,
        distinctStackCount: 0,
        heldOutCount: 0,
        baselineAgreement: 0,
        fittedAgreement: 0,
        sourceProofIds: [],
        comparedStackKeys: [],
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
                        baseLab: colorLab(
                            (prefix.basePredictedColor ?? prefix.predictedColor).rgb
                        ),
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
    return {
        L: Math.max(0, Math.min(100, base.L + deltaL)),
        a: base.a * chromaScale,
        b: base.b * chromaScale,
    };
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
        selectedLogits.reduce((sum, logit) => sum + logit, 0) /
        Math.max(1, selectedLogits.length);
    const tiePenalty =
        selectedLogits.length > 1
            ? TIE_LOGIT_PENALTY *
              selectedLogits.reduce(
                  (sum, logit) => sum + (logit - selectedMean) ** 2,
                  0
              ) /
              selectedLogits.length
            : 0;
    return (
        -Math.log(Math.max(1e-12, winnerMass / Math.max(1e-12, denominator))) + tiePenalty
    );
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
    const heldOutProofIds = new Set<string>();
    const desiredHeldOutCount = Math.max(MIN_HELD_OUT, Math.floor(observations.length * 0.2));
    let heldOutCount = 0;
    for (const proofId of proofIds.slice(0, -1)) {
        heldOutProofIds.add(proofId);
        heldOutCount += observations.filter(
            (observation) => observation.proofId === proofId
        ).length;
        if (heldOutCount >= desiredHeldOutCount) break;
    }
    return {
        training: observations.filter((observation) => !heldOutProofIds.has(observation.proofId)),
        heldOut: observations.filter((observation) => heldOutProofIds.has(observation.proofId)),
    };
}

export function fitAppearanceRankModel(
    appearance: AppearanceProfileV1 | undefined,
    context: AppearanceFitContext
): AppearanceRankModelV1 {
    const contextFingerprint = fingerprintJson('appearance-fit-context-v1', context);
    const { observations, noneCount, noneJudgmentIds, proofIds, stackKeys } = collectObservations(
        appearance,
        context
    );
    const { training, heldOut } = splitObservations(observations);
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
    const hasEvidence =
        observations.length >= MIN_OBSERVATIONS &&
        stackKeys.size >= MIN_DISTINCT_STACKS &&
        heldOut.length >= MIN_HELD_OUT;
    const improvesTraining = bestObjective < objective(training, 0, 0) - 1e-6;
    const heldOutImprovement = fittedAgreement - baselineAgreement;
    const applied =
        hasEvidence &&
        improvesTraining &&
        fittedAgreement >= MIN_HELD_OUT_AGREEMENT &&
        heldOutImprovement >= MIN_HELD_OUT_IMPROVEMENT;
    const gateReason: AppearanceRankModelV1['gateReason'] = !hasEvidence
        ? observations.length < MIN_OBSERVATIONS || stackKeys.size < MIN_DISTINCT_STACKS
            ? 'insufficient-evidence'
            : 'insufficient-heldout'
        : !improvesTraining
          ? 'no-training-improvement'
          : fittedAgreement < MIN_HELD_OUT_AGREEMENT
            ? 'heldout-below-threshold'
            : heldOutImprovement < MIN_HELD_OUT_IMPROVEMENT
              ? 'heldout-no-improvement'
              : 'applied';
    const evidenceStrength = Math.min(1, observations.length / 24);
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
        })),
        noneJudgmentIds,
    };

    return {
        schemaVersion: 1,
        modelVersion: MODEL_VERSION,
        fingerprint: fingerprintJson('appearance-rank-model-v1', fingerprintPayload),
        contextFingerprint,
        applied,
        gateReason,
        deltaL: resolvedDeltaL,
        logChromaScale: resolvedLogChromaScale,
        confidence,
        observationCount: observations.length,
        noneCount,
        distinctStackCount: stackKeys.size,
        heldOutCount: heldOut.length,
        baselineAgreement,
        fittedAgreement,
        sourceProofIds: proofIds,
        comparedStackKeys: [...stackKeys].sort(),
    };
}

export function applyAppearanceRankModel(base: Lab, model: AppearanceRankModelV1): Lab {
    return model.applied ? transformLab(base, model.deltaL, model.logChromaScale) : { ...base };
}

export function appearanceLabToRgb(lab: Lab): Rgb {
    return labToRgb(lab);
}
