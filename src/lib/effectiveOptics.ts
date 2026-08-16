import type { Filament } from '../types';
import type {
    AppearanceEffectiveFilamentOpticsV1,
    AppearanceEffectiveOpticsModelV1,
    AppearanceSubstrateInteractionV1,
} from '../types/appearance';
import { channelHds } from './calibration';
import { deltaE2000 } from './colorDifference';
import { linearChannelToSrgb, srgbChannelToLinear } from './colorSpace';
import { fingerprintJson } from './fingerprint';

export interface EffectiveOpticsFitSample {
    id: string;
    backingFilamentId: string;
    recipeFilamentIds: readonly string[];
    layerHeight: number;
    measuredRgb: readonly [number, number, number];
    weight: number;
}

export interface EffectiveOpticsFitInput {
    filaments: readonly Filament[];
    matrixCount: number;
    samples: readonly EffectiveOpticsFitSample[];
}

export interface EffectiveOpticsLayer {
    filamentId: string;
    thickness: number;
}

export interface ResolvedEffectiveFilamentOptics {
    color: readonly [number, number, number];
    hdChannels: readonly [number, number, number];
    transmissionExponent: number;
}

interface RecipeRun {
    filamentIndex: number;
    filamentId: string;
    substrateFilamentId: string;
    thickness: number;
    interactionIndex: number;
}

interface FitObservation {
    id: string;
    backingIndex: number;
    runs: RecipeRun[];
    measuredLinear: [number, number, number];
    measuredRgb: [number, number, number];
    weight: number;
}

interface FitLayout {
    hdOffset: number;
    color: number;
    exponent: number;
    interaction: number;
    parameterCount: number;
}

interface FitState {
    parameters: Float64Array;
    layout: FitLayout;
    filamentCount: number;
    interactionCount: number;
}

interface ForwardStep {
    run: RecipeRun;
    foreground: [number, number, number];
    background: [number, number, number];
    transmission: [number, number, number];
    opticalDepth: [number, number, number];
    thicknessRatio: [number, number, number];
    exponent: number;
}

const MODEL_VERSION = 'matrix-effective-optics-v1' as const;
const MIN_FIT_SAMPLES = 16;
const FIT_ITERATIONS = 220;
const HUBER_DELTA = 0.1;
const HD_PRIOR_WEIGHT = 0.004;
const COLOR_PRIOR_WEIGHT = 0.02;
const EXPONENT_PRIOR_WEIGHT = 0.006;
const INTERACTION_PRIOR_WEIGHT = 0.003;
const MIN_ABSOLUTE_DELTA_E_IMPROVEMENT = 0.05;
const MIN_RELATIVE_DELTA_E_IMPROVEMENT = 0.002;
const LN_10 = Math.LN10;

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

function roundModelValue(value: number): number {
    return Math.round(value * 1e8) / 1e8;
}

function parseHexColor(hex: string): [number, number, number] {
    const normalized = hex.replace(/^#/, '').padEnd(6, '0').slice(0, 6);
    return [
        Number.parseInt(normalized.slice(0, 2), 16) || 0,
        Number.parseInt(normalized.slice(2, 4), 16) || 0,
        Number.parseInt(normalized.slice(4, 6), 16) || 0,
    ];
}

function toLinear(rgb: readonly [number, number, number]): [number, number, number] {
    return [srgbChannelToLinear(rgb[0]), srgbChannelToLinear(rgb[1]), srgbChannelToLinear(rgb[2])];
}

function toSrgb(linear: readonly [number, number, number]): [number, number, number] {
    return [
        linearChannelToSrgb(linear[0]),
        linearChannelToSrgb(linear[1]),
        linearChannelToSrgb(linear[2]),
    ];
}

function modelFingerprintPayload(
    applied: boolean,
    gateReason: AppearanceEffectiveOpticsModelV1['gateReason'],
    matrixCount: number,
    sampleCount: number,
    baselineMeanDeltaE: number,
    fittedMeanDeltaE: number,
    confidence: number,
    filaments: readonly AppearanceEffectiveFilamentOpticsV1[],
    substrateInteractions: readonly AppearanceSubstrateInteractionV1[]
) {
    return {
        modelVersion: MODEL_VERSION,
        applied,
        gateReason,
        matrixCount,
        sampleCount,
        baselineMeanDeltaE,
        fittedMeanDeltaE,
        confidence,
        filaments,
        substrateInteractions,
    };
}

function buildModel(
    applied: boolean,
    gateReason: AppearanceEffectiveOpticsModelV1['gateReason'],
    matrixCount: number,
    sampleCount: number,
    baselineMeanDeltaE: number,
    fittedMeanDeltaE: number,
    confidence: number,
    filaments: readonly AppearanceEffectiveFilamentOpticsV1[],
    substrateInteractions: readonly AppearanceSubstrateInteractionV1[]
): AppearanceEffectiveOpticsModelV1 {
    const payload = modelFingerprintPayload(
        applied,
        gateReason,
        matrixCount,
        sampleCount,
        baselineMeanDeltaE,
        fittedMeanDeltaE,
        confidence,
        filaments,
        substrateInteractions
    );
    return {
        schemaVersion: 1,
        fingerprint: fingerprintJson('matrix-effective-optics-v1', payload),
        ...payload,
    };
}

export function createPriorEffectiveOpticsModel(
    filaments: readonly Filament[] = [],
    gateReason: AppearanceEffectiveOpticsModelV1['gateReason'] = 'no-compatible-matrix',
    matrixCount = 0,
    sampleCount = 0,
    baselineMeanDeltaE = 0
): AppearanceEffectiveOpticsModelV1 {
    const properties = [...filaments]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((filament): AppearanceEffectiveFilamentOpticsV1 => {
            const color = parseHexColor(filament.color);
            const hds = channelHds(filament);
            return {
                filamentId: filament.id,
                priorHdChannels: [hds[0], hds[1], hds[2]],
                effectiveHdChannels: [hds[0], hds[1], hds[2]],
                priorOpaqueColor: color,
                effectiveOpaqueColor: color,
                transmissionExponent: 1,
                sampleCount: 0,
            };
        });
    return buildModel(
        false,
        gateReason,
        matrixCount,
        sampleCount,
        baselineMeanDeltaE,
        baselineMeanDeltaE,
        0,
        properties,
        []
    );
}

function makeLayout(filamentCount: number, interactionCount: number): FitLayout {
    const hdOffset = 0;
    const color = hdOffset + filamentCount * 3;
    const exponent = color + filamentCount * 3;
    const interaction = exponent + filamentCount;
    return {
        hdOffset,
        color,
        exponent,
        interaction,
        parameterCount: interaction + interactionCount,
    };
}

function hdParameter(layout: FitLayout, filamentIndex: number, channel: number): number {
    return layout.hdOffset + filamentIndex * 3 + channel;
}

function colorParameter(layout: FitLayout, filamentIndex: number, channel: number): number {
    return layout.color + filamentIndex * 3 + channel;
}

function exponentParameter(layout: FitLayout, filamentIndex: number): number {
    return layout.exponent + filamentIndex;
}

function interactionParameter(layout: FitLayout, interactionIndex: number): number {
    return layout.interaction + interactionIndex;
}

function interactionKey(foregroundFilamentId: string, substrateFilamentId: string): string {
    return `${foregroundFilamentId}\0${substrateFilamentId}`;
}

function compressRecipeRuns(
    backingFilamentId: string,
    recipeFilamentIds: readonly string[],
    layerHeight: number,
    filamentIndexById: ReadonlyMap<string, number>,
    interactionIndexByKey: ReadonlyMap<string, number>
): RecipeRun[] | null {
    const runs: RecipeRun[] = [];
    let substrateFilamentId = backingFilamentId;
    for (const filamentId of recipeFilamentIds) {
        const filamentIndex = filamentIndexById.get(filamentId);
        if (filamentIndex === undefined) return null;
        const previous = runs.at(-1);
        if (previous?.filamentId === filamentId) {
            previous.thickness += layerHeight;
            continue;
        }
        const pairKey = interactionKey(filamentId, substrateFilamentId);
        runs.push({
            filamentIndex,
            filamentId,
            substrateFilamentId,
            thickness: layerHeight,
            interactionIndex:
                filamentId === substrateFilamentId
                    ? -1
                    : (interactionIndexByKey.get(pairKey) ?? -1),
        });
        substrateFilamentId = filamentId;
    }
    return runs;
}

function fitInputs(input: EffectiveOpticsFitInput) {
    const filaments = [...input.filaments].sort((left, right) => left.id.localeCompare(right.id));
    const filamentIndexById = new Map(filaments.map((filament, index) => [filament.id, index]));
    const validSamples = [...input.samples]
        .filter(
            (sample) =>
                Number.isFinite(sample.layerHeight) &&
                sample.layerHeight > 0 &&
                Number.isFinite(sample.weight) &&
                sample.weight > 0 &&
                filamentIndexById.has(sample.backingFilamentId) &&
                sample.recipeFilamentIds.length > 0 &&
                sample.recipeFilamentIds.every((id) => filamentIndexById.has(id)) &&
                sample.measuredRgb.every((channel) => Number.isFinite(channel))
        )
        .sort((left, right) => left.id.localeCompare(right.id));

    const interactionSupport = new Map<string, number>();
    const filamentSupport = new Map<string, number>();
    for (const sample of validSamples) {
        let substrate = sample.backingFilamentId;
        let previous = '';
        for (const filamentId of sample.recipeFilamentIds) {
            filamentSupport.set(filamentId, (filamentSupport.get(filamentId) ?? 0) + 1);
            if (filamentId === previous) continue;
            if (filamentId !== substrate) {
                const key = interactionKey(filamentId, substrate);
                interactionSupport.set(key, (interactionSupport.get(key) ?? 0) + 1);
            }
            substrate = filamentId;
            previous = filamentId;
        }
        filamentSupport.set(
            sample.backingFilamentId,
            (filamentSupport.get(sample.backingFilamentId) ?? 0) + 1
        );
    }
    const interactionKeys = [...interactionSupport.keys()].sort();
    const interactionIndexByKey = new Map(interactionKeys.map((key, index) => [key, index]));
    const observations = validSamples
        .map((sample): FitObservation | null => {
            const runs = compressRecipeRuns(
                sample.backingFilamentId,
                sample.recipeFilamentIds,
                sample.layerHeight,
                filamentIndexById,
                interactionIndexByKey
            );
            const backingIndex = filamentIndexById.get(sample.backingFilamentId);
            if (!runs || backingIndex === undefined) return null;
            const measuredRgb: [number, number, number] = [
                clamp(sample.measuredRgb[0], 0, 255),
                clamp(sample.measuredRgb[1], 0, 255),
                clamp(sample.measuredRgb[2], 0, 255),
            ];
            return {
                id: sample.id,
                backingIndex,
                runs,
                measuredLinear: toLinear(measuredRgb),
                measuredRgb,
                weight: sample.weight,
            };
        })
        .filter((observation): observation is FitObservation => observation !== null);
    return {
        filaments,
        observations,
        interactionKeys,
        interactionSupport,
        filamentSupport,
    };
}

function createInitialState(filaments: readonly Filament[], interactionCount: number): FitState {
    const layout = makeLayout(filaments.length, interactionCount);
    const parameters = new Float64Array(layout.parameterCount);
    for (let filamentIndex = 0; filamentIndex < filaments.length; filamentIndex++) {
        const priorLinear = toLinear(parseHexColor(filaments[filamentIndex].color));
        for (let channel = 0; channel < 3; channel++) {
            parameters[colorParameter(layout, filamentIndex, channel)] = priorLinear[channel];
        }
    }
    return {
        parameters,
        layout,
        filamentCount: filaments.length,
        interactionCount,
    };
}

function forwardObservation(
    observation: FitObservation,
    state: FitState,
    priorHds: readonly (readonly [number, number, number])[]
): { color: [number, number, number]; steps: ForwardStep[] } {
    const { parameters, layout } = state;
    let current: [number, number, number] = [
        parameters[colorParameter(layout, observation.backingIndex, 0)],
        parameters[colorParameter(layout, observation.backingIndex, 1)],
        parameters[colorParameter(layout, observation.backingIndex, 2)],
    ];
    const steps: ForwardStep[] = [];
    for (const run of observation.runs) {
        const foreground: [number, number, number] = [
            parameters[colorParameter(layout, run.filamentIndex, 0)],
            parameters[colorParameter(layout, run.filamentIndex, 1)],
            parameters[colorParameter(layout, run.filamentIndex, 2)],
        ];
        const background: [number, number, number] = [current[0], current[1], current[2]];
        const exponent = Math.exp(parameters[exponentParameter(layout, run.filamentIndex)]);
        const interactionLogScale =
            run.interactionIndex < 0
                ? 0
                : parameters[interactionParameter(layout, run.interactionIndex)];
        const transmission: [number, number, number] = [0, 0, 0];
        const opticalDepth: [number, number, number] = [0, 0, 0];
        const thicknessRatio: [number, number, number] = [0, 0, 0];
        const next: [number, number, number] = [0, 0, 0];
        for (let channel = 0; channel < 3; channel++) {
            const effectiveHd =
                priorHds[run.filamentIndex][channel] *
                Math.exp(
                    parameters[hdParameter(layout, run.filamentIndex, channel)] +
                        interactionLogScale
                );
            const ratio = Math.max(1e-9, run.thickness / effectiveHd);
            const depth = Math.pow(ratio, exponent);
            const channelTransmission = Math.exp(-LN_10 * depth);
            thicknessRatio[channel] = ratio;
            opticalDepth[channel] = depth;
            transmission[channel] = channelTransmission;
            next[channel] =
                foreground[channel] * (1 - channelTransmission) +
                background[channel] * channelTransmission;
        }
        steps.push({
            run,
            foreground,
            background,
            transmission,
            opticalDepth,
            thicknessRatio,
            exponent,
        });
        current = next;
    }
    return { color: current, steps };
}

function objectiveAndGradient(
    observations: readonly FitObservation[],
    state: FitState,
    priorHds: readonly (readonly [number, number, number])[],
    priorColors: readonly (readonly [number, number, number])[],
    includeGradient: boolean
): { objective: number; gradient: Float64Array } {
    const { parameters, layout } = state;
    const gradient = new Float64Array(parameters.length);
    const totalWeight = observations.reduce((sum, observation) => sum + observation.weight, 0);
    let objective = 0;
    for (const observation of observations) {
        const forward = forwardObservation(observation, state, priorHds);
        const outputGradient: [number, number, number] = [0, 0, 0];
        const sampleScale = observation.weight / Math.max(1e-9, totalWeight * 3);
        for (let channel = 0; channel < 3; channel++) {
            const residual = forward.color[channel] - observation.measuredLinear[channel];
            const absolute = Math.abs(residual);
            if (absolute <= HUBER_DELTA) {
                objective += sampleScale * 0.5 * residual * residual;
                outputGradient[channel] = sampleScale * residual;
            } else {
                objective += sampleScale * HUBER_DELTA * (absolute - 0.5 * HUBER_DELTA);
                outputGradient[channel] = sampleScale * HUBER_DELTA * Math.sign(residual);
            }
        }
        if (!includeGradient) continue;

        let propagated: [number, number, number] = outputGradient;
        for (let stepIndex = forward.steps.length - 1; stepIndex >= 0; stepIndex--) {
            const step = forward.steps[stepIndex];
            const nextPropagated: [number, number, number] = [0, 0, 0];
            let exponentGradient = 0;
            let interactionGradient = 0;
            for (let channel = 0; channel < 3; channel++) {
                const transmission = step.transmission[channel];
                const channelGradient = propagated[channel];
                gradient[colorParameter(layout, step.run.filamentIndex, channel)] +=
                    channelGradient * (1 - transmission);
                nextPropagated[channel] = channelGradient * transmission;
                const transmissionGradient =
                    channelGradient * (step.background[channel] - step.foreground[channel]);
                const logHdDerivative =
                    LN_10 * transmission * step.opticalDepth[channel] * step.exponent;
                const sharedGradient = transmissionGradient * logHdDerivative;
                gradient[hdParameter(layout, step.run.filamentIndex, channel)] += sharedGradient;
                interactionGradient += sharedGradient;
                exponentGradient +=
                    transmissionGradient *
                    -LN_10 *
                    transmission *
                    step.opticalDepth[channel] *
                    step.exponent *
                    Math.log(step.thicknessRatio[channel]);
            }
            gradient[exponentParameter(layout, step.run.filamentIndex)] += exponentGradient;
            if (step.run.interactionIndex >= 0) {
                gradient[interactionParameter(layout, step.run.interactionIndex)] +=
                    interactionGradient;
            }
            propagated = nextPropagated;
        }
        for (let channel = 0; channel < 3; channel++) {
            gradient[colorParameter(layout, observation.backingIndex, channel)] +=
                propagated[channel];
        }
    }

    for (let filamentIndex = 0; filamentIndex < state.filamentCount; filamentIndex++) {
        for (let channel = 0; channel < 3; channel++) {
            const hdIndex = hdParameter(layout, filamentIndex, channel);
            const hdOffset = parameters[hdIndex];
            objective += 0.5 * HD_PRIOR_WEIGHT * hdOffset * hdOffset;
            gradient[hdIndex] += HD_PRIOR_WEIGHT * hdOffset;

            const colorIndex = colorParameter(layout, filamentIndex, channel);
            const colorOffset = parameters[colorIndex] - priorColors[filamentIndex][channel];
            objective += 0.5 * COLOR_PRIOR_WEIGHT * colorOffset * colorOffset;
            gradient[colorIndex] += COLOR_PRIOR_WEIGHT * colorOffset;
        }
        const exponentIndex = exponentParameter(layout, filamentIndex);
        const logExponent = parameters[exponentIndex];
        objective += 0.5 * EXPONENT_PRIOR_WEIGHT * logExponent * logExponent;
        gradient[exponentIndex] += EXPONENT_PRIOR_WEIGHT * logExponent;
    }
    for (let interactionIndex = 0; interactionIndex < state.interactionCount; interactionIndex++) {
        const parameterIndex = interactionParameter(layout, interactionIndex);
        const logScale = parameters[parameterIndex];
        objective += 0.5 * INTERACTION_PRIOR_WEIGHT * logScale * logScale;
        gradient[parameterIndex] += INTERACTION_PRIOR_WEIGHT * logScale;
    }
    return { objective, gradient };
}

function clampParameters(state: FitState): void {
    const { parameters, layout } = state;
    for (let filamentIndex = 0; filamentIndex < state.filamentCount; filamentIndex++) {
        for (let channel = 0; channel < 3; channel++) {
            const hdIndex = hdParameter(layout, filamentIndex, channel);
            parameters[hdIndex] = clamp(parameters[hdIndex], Math.log(1 / 3), Math.log(3));
            const colorIndex = colorParameter(layout, filamentIndex, channel);
            parameters[colorIndex] = clamp(parameters[colorIndex], 0, 1);
        }
        const exponentIndex = exponentParameter(layout, filamentIndex);
        parameters[exponentIndex] = clamp(parameters[exponentIndex], Math.log(0.45), Math.log(2.2));
    }
    for (let interactionIndex = 0; interactionIndex < state.interactionCount; interactionIndex++) {
        const index = interactionParameter(layout, interactionIndex);
        parameters[index] = clamp(parameters[index], Math.log(0.5), Math.log(2));
    }
}

function optimize(
    observations: readonly FitObservation[],
    initial: FitState,
    priorHds: readonly (readonly [number, number, number])[],
    priorColors: readonly (readonly [number, number, number])[]
): FitState {
    const state: FitState = {
        ...initial,
        parameters: new Float64Array(initial.parameters),
    };
    const firstMoment = new Float64Array(state.parameters.length);
    const secondMoment = new Float64Array(state.parameters.length);
    let bestParameters = new Float64Array(state.parameters);
    let bestObjective = objectiveAndGradient(
        observations,
        state,
        priorHds,
        priorColors,
        false
    ).objective;
    let staleIterations = 0;

    for (let iteration = 1; iteration <= FIT_ITERATIONS; iteration++) {
        const { gradient } = objectiveAndGradient(observations, state, priorHds, priorColors, true);
        const learningRate = iteration > 180 ? 0.008 : iteration > 120 ? 0.018 : 0.04;
        const beta1Power = 1 - Math.pow(0.9, iteration);
        const beta2Power = 1 - Math.pow(0.999, iteration);
        for (let index = 0; index < state.parameters.length; index++) {
            firstMoment[index] = 0.9 * firstMoment[index] + 0.1 * gradient[index];
            secondMoment[index] =
                0.999 * secondMoment[index] + 0.001 * gradient[index] * gradient[index];
            const correctedFirst = firstMoment[index] / beta1Power;
            const correctedSecond = secondMoment[index] / beta2Power;
            state.parameters[index] -=
                (learningRate * correctedFirst) / (Math.sqrt(correctedSecond) + 1e-8);
        }
        clampParameters(state);
        const candidateObjective = objectiveAndGradient(
            observations,
            state,
            priorHds,
            priorColors,
            false
        ).objective;
        if (candidateObjective < bestObjective - 1e-10) {
            bestObjective = candidateObjective;
            bestParameters = new Float64Array(state.parameters);
            staleIterations = 0;
        } else {
            staleIterations++;
        }
        if (iteration >= 100 && staleIterations >= 45) break;
    }
    state.parameters = bestParameters;
    return state;
}

function predictLinear(
    observation: FitObservation,
    state: FitState,
    priorHds: readonly (readonly [number, number, number])[]
): [number, number, number] {
    return forwardObservation(observation, state, priorHds).color;
}

function weightedMeanDeltaE(
    observations: readonly FitObservation[],
    state: FitState,
    priorHds: readonly (readonly [number, number, number])[]
): number {
    let total = 0;
    let totalWeight = 0;
    for (const observation of observations) {
        const predictedRgb = toSrgb(predictLinear(observation, state, priorHds));
        total +=
            observation.weight *
            deltaE2000(
                [predictedRgb[0], predictedRgb[1], predictedRgb[2]],
                observation.measuredRgb
            );
        totalWeight += observation.weight;
    }
    return totalWeight > 0 ? total / totalWeight : 0;
}

export function fitEffectiveOpticsFromMatrix(
    input: EffectiveOpticsFitInput
): AppearanceEffectiveOpticsModelV1 {
    const prepared = fitInputs(input);
    const priorModel = createPriorEffectiveOpticsModel(
        prepared.filaments,
        input.matrixCount > 0 ? 'insufficient-samples' : 'no-compatible-matrix',
        input.matrixCount,
        prepared.observations.length
    );
    if (input.matrixCount === 0 || prepared.observations.length === 0) return priorModel;

    const priorHds = prepared.filaments.map((filament) => {
        const hds = channelHds(filament);
        return [hds[0], hds[1], hds[2]] as const;
    });
    const priorColors = prepared.filaments.map((filament) =>
        toLinear(parseHexColor(filament.color))
    );
    const initial = createInitialState(prepared.filaments, prepared.interactionKeys.length);
    const baselineMeanDeltaE = weightedMeanDeltaE(prepared.observations, initial, priorHds);
    if (prepared.observations.length < Math.max(MIN_FIT_SAMPLES, prepared.filaments.length * 3)) {
        return createPriorEffectiveOpticsModel(
            prepared.filaments,
            'insufficient-samples',
            input.matrixCount,
            prepared.observations.length,
            baselineMeanDeltaE
        );
    }

    const fitted = optimize(prepared.observations, initial, priorHds, priorColors);
    const fittedMeanDeltaE = weightedMeanDeltaE(prepared.observations, fitted, priorHds);
    const absoluteImprovement = baselineMeanDeltaE - fittedMeanDeltaE;
    const relativeImprovement = absoluteImprovement / Math.max(1e-9, baselineMeanDeltaE);
    const applied =
        Number.isFinite(fittedMeanDeltaE) &&
        absoluteImprovement >= MIN_ABSOLUTE_DELTA_E_IMPROVEMENT &&
        relativeImprovement >= MIN_RELATIVE_DELTA_E_IMPROVEMENT;
    if (!applied) {
        return createPriorEffectiveOpticsModel(
            prepared.filaments,
            'no-improvement',
            input.matrixCount,
            prepared.observations.length,
            baselineMeanDeltaE
        );
    }

    const { parameters, layout } = fitted;
    const filamentProperties = prepared.filaments.map(
        (filament, filamentIndex): AppearanceEffectiveFilamentOpticsV1 => {
            const effectiveLinear: [number, number, number] = [
                parameters[colorParameter(layout, filamentIndex, 0)],
                parameters[colorParameter(layout, filamentIndex, 1)],
                parameters[colorParameter(layout, filamentIndex, 2)],
            ];
            const effectiveColor = toSrgb(effectiveLinear).map(roundModelValue) as [
                number,
                number,
                number,
            ];
            const priorColor = parseHexColor(filament.color);
            const effectiveHds = priorHds[filamentIndex].map((hd, channel) =>
                roundModelValue(
                    hd * Math.exp(parameters[hdParameter(layout, filamentIndex, channel)])
                )
            ) as [number, number, number];
            return {
                filamentId: filament.id,
                priorHdChannels: priorHds[filamentIndex],
                effectiveHdChannels: effectiveHds,
                priorOpaqueColor: priorColor,
                effectiveOpaqueColor: effectiveColor,
                transmissionExponent: roundModelValue(
                    Math.exp(parameters[exponentParameter(layout, filamentIndex)])
                ),
                sampleCount: prepared.filamentSupport.get(filament.id) ?? 0,
            };
        }
    );
    const interactions = prepared.interactionKeys.map(
        (key, interactionIndex): AppearanceSubstrateInteractionV1 => {
            const [foregroundFilamentId, substrateFilamentId] = key.split('\0');
            return {
                foregroundFilamentId,
                substrateFilamentId,
                hdMultiplier: roundModelValue(
                    Math.exp(parameters[interactionParameter(layout, interactionIndex)])
                ),
                sampleCount: prepared.interactionSupport.get(key) ?? 0,
            };
        }
    );
    const sampleCoverage = Math.min(
        1,
        prepared.observations.length / Math.max(32, prepared.filaments.length * 24)
    );
    const confidence = clamp(
        sampleCoverage * (0.35 + 0.65 * Math.min(1, relativeImprovement / 0.35)),
        0,
        1
    );
    return buildModel(
        true,
        'applied',
        input.matrixCount,
        prepared.observations.length,
        roundModelValue(baselineMeanDeltaE),
        roundModelValue(fittedMeanDeltaE),
        roundModelValue(confidence),
        filamentProperties,
        interactions
    );
}

export function resolveEffectiveFilamentOptics(
    model: AppearanceEffectiveOpticsModelV1 | undefined,
    filament: Pick<Filament, 'id' | 'color' | 'td' | 'calibration'>
): ResolvedEffectiveFilamentOptics {
    const fitted = model?.applied
        ? model.filaments.find((entry) => entry.filamentId === filament.id)
        : undefined;
    if (fitted) {
        return {
            color: fitted.effectiveOpaqueColor,
            hdChannels: fitted.effectiveHdChannels,
            transmissionExponent: fitted.transmissionExponent,
        };
    }
    const hds = channelHds(filament);
    return {
        color: parseHexColor(filament.color),
        hdChannels: [hds[0], hds[1], hds[2]],
        transmissionExponent: 1,
    };
}

export function effectiveSubstrateHdMultiplier(
    model: AppearanceEffectiveOpticsModelV1 | undefined,
    foregroundFilamentId: string,
    substrateFilamentId: string | undefined
): number {
    if (!model?.applied || !substrateFilamentId || foregroundFilamentId === substrateFilamentId) {
        return 1;
    }
    return (
        model.substrateInteractions.find(
            (entry) =>
                entry.foregroundFilamentId === foregroundFilamentId &&
                entry.substrateFilamentId === substrateFilamentId
        )?.hdMultiplier ?? 1
    );
}

export function effectiveTransmission(
    thickness: number,
    hd: number,
    exponent = 1,
    substrateHdMultiplier = 1
): number {
    if (!(thickness > 0) || !(hd > 0) || !(exponent > 0) || !(substrateHdMultiplier > 0)) {
        return 1;
    }
    const opticalDepth = Math.pow(thickness / (hd * substrateHdMultiplier), exponent);
    return Math.pow(0.1, opticalDepth);
}

export function blendEffectiveSrgb(
    background: readonly [number, number, number],
    foreground: readonly [number, number, number],
    hdChannels: readonly [number, number, number],
    thickness: number,
    exponent = 1,
    substrateHdMultiplier = 1
): [number, number, number] {
    const backgroundLinear = toLinear(background);
    const foregroundLinear = toLinear(foreground);
    const output: [number, number, number] = [0, 0, 0];
    for (let channel = 0; channel < 3; channel++) {
        const transmission = effectiveTransmission(
            thickness,
            hdChannels[channel],
            exponent,
            substrateHdMultiplier
        );
        output[channel] =
            foregroundLinear[channel] * (1 - transmission) +
            backgroundLinear[channel] * transmission;
    }
    return toSrgb(output);
}

function resolvedModelFilament(
    model: AppearanceEffectiveOpticsModelV1,
    filamentId: string
): AppearanceEffectiveFilamentOpticsV1 | undefined {
    return model.filaments.find((entry) => entry.filamentId === filamentId);
}

export function predictEffectiveRecipeColor(
    model: AppearanceEffectiveOpticsModelV1,
    backingFilamentId: string,
    layers: readonly EffectiveOpticsLayer[]
): [number, number, number] | undefined {
    const backing = resolvedModelFilament(model, backingFilamentId);
    if (!backing) return undefined;
    let current: [number, number, number] = [
        backing.effectiveOpaqueColor[0],
        backing.effectiveOpaqueColor[1],
        backing.effectiveOpaqueColor[2],
    ];
    let substrateFilamentId = backingFilamentId;
    const runs: Array<{ filamentId: string; thickness: number }> = [];
    for (const layer of layers) {
        if (!(layer.thickness > 0)) continue;
        const previous = runs.at(-1);
        if (previous?.filamentId === layer.filamentId) previous.thickness += layer.thickness;
        else runs.push({ filamentId: layer.filamentId, thickness: layer.thickness });
    }
    for (const run of runs) {
        const foreground = resolvedModelFilament(model, run.filamentId);
        if (!foreground) return undefined;
        current = blendEffectiveSrgb(
            current,
            foreground.effectiveOpaqueColor,
            foreground.effectiveHdChannels,
            run.thickness,
            foreground.transmissionExponent,
            effectiveSubstrateHdMultiplier(model, run.filamentId, substrateFilamentId)
        );
        substrateFilamentId = run.filamentId;
    }
    return current;
}

/** Predict an Auto-paint prefix whose first contiguous run is the opaque foundation. */
export function predictEffectiveAutoPaintColor(
    model: AppearanceEffectiveOpticsModelV1,
    layers: readonly EffectiveOpticsLayer[]
): [number, number, number] | undefined {
    const first = layers[0];
    if (!first) return undefined;
    let firstTransition = 0;
    while (
        firstTransition < layers.length &&
        layers[firstTransition].filamentId === first.filamentId
    ) {
        firstTransition++;
    }
    return predictEffectiveRecipeColor(model, first.filamentId, layers.slice(firstTransition));
}

export function effectiveSuffixTransmission(
    model: AppearanceEffectiveOpticsModelV1 | undefined,
    layers: readonly EffectiveOpticsLayer[]
): number {
    if (layers.length === 0) return 1;
    const runs: Array<{ filamentId: string; thickness: number }> = [];
    for (const layer of layers) {
        if (!(layer.thickness > 0)) continue;
        const previous = runs.at(-1);
        if (previous?.filamentId === layer.filamentId) previous.thickness += layer.thickness;
        else runs.push({ filamentId: layer.filamentId, thickness: layer.thickness });
    }
    const transmission: [number, number, number] = [1, 1, 1];
    for (let runIndex = 0; runIndex < runs.length; runIndex++) {
        const run = runs[runIndex];
        const filament = model?.filaments.find((entry) => entry.filamentId === run.filamentId);
        if (!filament) return 1;
        const substrate = runIndex > 0 ? runs[runIndex - 1].filamentId : undefined;
        const interaction = effectiveSubstrateHdMultiplier(model, run.filamentId, substrate);
        for (let channel = 0; channel < 3; channel++) {
            transmission[channel] *= effectiveTransmission(
                run.thickness,
                filament.effectiveHdChannels[channel],
                filament.transmissionExponent,
                interaction
            );
        }
    }
    return Math.max(...transmission);
}
