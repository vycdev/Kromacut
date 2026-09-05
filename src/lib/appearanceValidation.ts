/** Offline Matrix validation. Not imported by the application or optimizer. */
import {
    compatibleStackMatrices,
    fitAppearanceRankModel,
    resolveAppearanceRankModel,
    type AppearanceFitContext,
} from './appearanceModel';
import {
    createEmptyAppearanceProfile,
    fingerprintAppearanceFilaments,
    type AppearanceProfileV1,
    type StackMatrixCalibrationV1,
} from './appearanceProfile';
import {
    createPriorEffectiveOpticsModel,
    predictEffectiveAutoPaintColor,
    predictEffectiveRecipeColor,
    resolveEffectiveTransitionOptics,
} from './effectiveOptics';
import { deltaE2000Lab, labToRgb, rgbToLab, type Lab } from './colorDifference';
import { fingerprintJson } from './fingerprint';
import type { AppearanceAnchorLayer } from '../types/appearance';

export type AppearanceValidationScenario = 'recipe' | 'interaction' | 'board';
export interface AppearanceValidationOptions {
    folds?: number;
    maximumDeltaE?: number;
    scenarios?: readonly AppearanceValidationScenario[];
    /** Explicit matrix-id -> shared print/photo session. All matrices must be assigned. */
    sessions?: Readonly<Record<string, string>>;
    onProgress?: (message: string) => void;
}

interface Observation {
    id: string;
    matrixId: string;
    sampleIndex: number;
    recipeKey: string;
    /** Coalesced runs for duplicate grouping, interaction holdouts and reporting. */
    layers: AppearanceAnchorLayer[];
    /** Actual Matrix layers, including the foundation, for deployed appearance lookup. */
    physicalLayers: AppearanceAnchorLayer[];
    interactions: string[];
    terminalInteraction?: string;
    measured: Lab;
}

export interface AppearanceValidationFold {
    id: string;
    scenario: AppearanceValidationScenario;
    heldOutGroups: string[];
    trainingIds: string[];
    validationIds: string[];
    purgedIds: string[];
}

function compare(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function requirePrediction(rgb: [number, number, number] | undefined): [number, number, number] {
    if (!rgb)
        throw new Error('Cannot predict a Matrix recipe with missing filaments or foundation');
    return rgb;
}

function observation(matrix: StackMatrixCalibrationV1, sampleIndex: number): Observation {
    const sample = matrix.samples[sampleIndex];
    const backing = matrix.filaments[matrix.backingFilamentIndex];
    const layers: AppearanceAnchorLayer[] = [];
    const physicalLayers: AppearanceAnchorLayer[] = [];
    const append = (filamentId: string, filamentColor: string, thickness: number) => {
        if (!Number.isFinite(thickness) || thickness <= 0)
            throw new Error('Invalid recipe thickness');
        physicalLayers.push({ filamentId, filamentColor, thickness });
        const previous = layers.at(-1);
        if (previous?.filamentId === filamentId) previous.thickness += thickness;
        else layers.push({ filamentId, filamentColor, thickness });
    };
    for (const thickness of matrix.foundationLayerThicknesses)
        append(backing.id, backing.color, thickness);
    for (const index of sample.stack) {
        const filament = matrix.filaments[index];
        if (!filament) throw new Error(`Unknown filament in Matrix ${matrix.id}`);
        append(filament.id, filament.color, matrix.process.layerHeight);
    }
    for (const layer of layers) layer.thickness = Math.round(layer.thickness * 1e8) / 1e8;
    const interactions = layers
        .slice(1)
        .map((layer, index) => JSON.stringify([layers[index].filamentId, layer.filamentId]));
    return {
        id: `${matrix.id}:${sample.index}`,
        matrixId: matrix.id,
        sampleIndex: sample.index,
        recipeKey: JSON.stringify(layers.map((layer) => [layer.filamentId, layer.thickness])),
        layers,
        physicalLayers,
        interactions: [...new Set(interactions)],
        terminalInteraction: interactions.at(-1),
        measured: rgbToLab([...sample.measuredColor!.rgb]),
    };
}

function boardGroups(
    matrices: readonly StackMatrixCalibrationV1[],
    sessions?: Readonly<Record<string, string>>
) {
    if (sessions && matrices.some((matrix) => !sessions[matrix.id]?.trim())) {
        throw new Error(
            'Session mapping must assign every compatible Matrix to a nonempty session'
        );
    }
    // Merge known shared photos and exact duplicate boards even if imported under new IDs.
    const parents = new Map(matrices.map((matrix) => [matrix.id, matrix.id]));
    const root = (id: string): string => {
        while (parents.get(id) !== id) id = parents.get(id)!;
        return id;
    };
    const owners = new Map<string, string>();
    for (const matrix of matrices) {
        const signature = JSON.stringify(
            matrix.samples
                .filter((sample) => sample.measuredColor)
                .map((sample) => {
                    const item = observation({ ...matrix, samples: [sample] }, 0);
                    return [item.recipeKey, sample.measuredColor!.rgb];
                })
                .sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)))
        );
        const keys = [`duplicate:${signature}`];
        if (matrix.photoName?.trim()) keys.push(`photo:${matrix.photoName.trim().toLowerCase()}`);
        if (sessions) keys.push(`session:${sessions[matrix.id]}`);
        for (const key of keys) {
            const owner = owners.get(key);
            if (owner) parents.set(root(matrix.id), root(owner));
            else owners.set(key, matrix.id);
        }
    }
    return new Map(matrices.map((matrix) => [matrix.id, root(matrix.id)]));
}

export function planAppearanceValidation(
    appearance: AppearanceProfileV1,
    context: AppearanceFitContext,
    options: AppearanceValidationOptions = {}
) {
    const foldCount = options.folds ?? 4;
    const maximumDeltaE = options.maximumDeltaE ?? 10;
    if (!Number.isInteger(foldCount) || foldCount < 2 || foldCount > 10)
        throw new Error('Use 2–10 folds');
    if (!Number.isFinite(maximumDeltaE) || maximumDeltaE <= 0)
        throw new Error('Delta E must be positive');
    if (
        !context.filaments?.length ||
        fingerprintAppearanceFilaments(context.filaments) !== context.filamentProfileFingerprint
    ) {
        throw new Error('Validation requires the current filaments and their matching fingerprint');
    }
    const scenarios = options.scenarios ?? ['recipe', 'interaction', 'board'];
    if (
        new Set(scenarios).size !== scenarios.length ||
        scenarios.some((s) => !['recipe', 'interaction', 'board'].includes(s))
    ) {
        throw new Error('Unknown or duplicate validation scenario');
    }
    const compatible = compatibleStackMatrices(appearance, context);
    // Corrected observations cannot act as independent reference colors for the same simulator.
    const matrices = compatible.filter(
        (matrix) =>
            matrix.referenceCorrection !== true && matrix.samples.some((s) => s.measuredColor)
    );
    const observations = matrices
        .flatMap((matrix) =>
            matrix.samples.flatMap((sample, index) =>
                sample.measuredColor ? [observation(matrix, index)] : []
            )
        )
        .sort((a, b) => compare(a.id, b.id));
    if (new Set(observations.map((s) => s.id)).size !== observations.length)
        throw new Error('Duplicate Matrix/sample IDs');
    const boards = boardGroups(matrices, options.sessions);
    const folds: AppearanceValidationFold[] = [];
    const skipped: { scenario: AppearanceValidationScenario; reason: string }[] = [];
    for (const scenario of scenarios) {
        const groupOf = (sample: Observation) =>
            scenario === 'recipe'
                ? sample.recipeKey
                : scenario === 'interaction'
                  ? sample.terminalInteraction
                  : boards.get(sample.matrixId);
        const groups = new Map<string, Observation[]>();
        for (const sample of observations) {
            const key = groupOf(sample);
            if (key !== undefined) groups.set(key, [...(groups.get(key) ?? []), sample]);
        }
        if (groups.size < 2) {
            skipped.push({
                scenario,
                reason: 'Fewer than two independent groups; no holdout score reported.',
            });
            continue;
        }
        const bins = Array.from({ length: Math.min(foldCount, groups.size) }, () => [] as string[]);
        const sizes = bins.map(() => 0);
        for (const [key, samples] of [...groups].sort(
            (a, b) => b[1].length - a[1].length || compare(a[0], b[0])
        )) {
            const index = sizes.indexOf(Math.min(...sizes));
            bins[index].push(key);
            sizes[index] += samples.length;
        }
        bins.forEach((keys, index) => {
            const heldOut = new Set(keys);
            const validation = observations.filter((s) => heldOut.has(groupOf(s) ?? ''));
            const validationIds = new Set(validation.map((s) => s.id));
            const remainder = observations.filter((s) => !validationIds.has(s.id));
            // An unseen ordered pair must be absent throughout training recipes, not only at their tops.
            const purged =
                scenario === 'interaction'
                    ? remainder.filter((s) => s.interactions.some((pair) => heldOut.has(pair)))
                    : [];
            const purgedIds = new Set(purged.map((s) => s.id));
            folds.push({
                id: `${scenario}-${index + 1}`,
                scenario,
                heldOutGroups: keys,
                validationIds: validation.map((s) => s.id),
                trainingIds: remainder.filter((s) => !purgedIds.has(s.id)).map((s) => s.id),
                purgedIds: [...purgedIds],
            });
        });
    }
    return {
        matrices,
        observations,
        folds,
        skipped,
        maximumDeltaE,
        excludedMatrixIds: (appearance.stackMatrices ?? [])
            .filter((m) => !matrices.includes(m))
            .map((m) => m.id),
        boardGroupCount: new Set(boards.values()).size,
    };
}

/** Only this training-only copy enters any fit, support estimate, anchor or LUT builder. */
export function appearanceValidationTrainingProfile(
    matrices: readonly StackMatrixCalibrationV1[],
    trainingIds: readonly string[],
    context: AppearanceFitContext
): AppearanceProfileV1 {
    const ids = new Set(trainingIds);
    const prior = createPriorEffectiveOpticsModel(context.filaments);
    const copies = structuredClone(matrices);
    return {
        ...createEmptyAppearanceProfile(),
        stackMatrices: copies.flatMap((matrix) => {
            matrix.samples = matrix.samples
                .filter((s) => ids.has(`${matrix.id}:${s.index}`))
                .map((sample) => {
                    // Stored preview coordinates can be stale. Rebuild them from the fixed prior,
                    // never from a full-data fitted model or withheld photographed color.
                    const rgb = requirePrediction(
                        predictEffectiveRecipeColor(
                            prior,
                            matrix.filaments[matrix.backingFilamentIndex].id,
                            sample.stack.map((i) => ({
                                filamentId: matrix.filaments[i].id,
                                thickness: matrix.process.layerHeight,
                            }))
                        )
                    ).map((value) => Math.round(value)) as [number, number, number];
                    return {
                        ...sample,
                        predictedColor: {
                            ...sample.predictedColor,
                            rgb,
                            hex: `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
                        },
                    };
                });
            return matrix.samples.length ? [matrix] : [];
        }),
    };
}

function errorSummary(values: number[], threshold: number) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
    return {
        count: values.length,
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        median: percentile(0.5),
        p90: percentile(0.9),
        p95: percentile(0.95),
        worst: sorted.at(-1)!,
        withinLimit: values.filter((value) => value <= threshold).length,
    };
}

export function runAppearanceValidation(
    appearance: AppearanceProfileV1,
    context: AppearanceFitContext,
    options: AppearanceValidationOptions = {}
) {
    const plan = planAppearanceValidation(appearance, context, options);
    const prior = createPriorEffectiveOpticsModel(context.filaments);
    const byId = new Map(plan.observations.map((s) => [s.id, s]));
    const foldReports = plan.folds.map((fold) => {
        options.onProgress?.(
            `${fold.id}: refitting ${fold.trainingIds.length} training samples; ${fold.validationIds.length} held out; ${fold.purgedIds.length} purged`
        );
        const training = appearanceValidationTrainingProfile(
            plan.matrices,
            fold.trainingIds,
            context
        );
        const model = fitAppearanceRankModel(training, context);
        const optics = model.effectiveOptics ?? prior;
        const trainedIds = model.empiricalLuts.flatMap((lut) => lut.samples.map((s) => s.id));
        if (trainedIds.some((id) => !fold.trainingIds.includes(id)))
            throw new Error('Held-out evidence leaked into fitted model');
        const trainingPairs = new Set(fold.trainingIds.flatMap((id) => byId.get(id)!.interactions));
        const predictions = fold.validationIds.map((id) => {
            const sample = byId.get(id)!;
            const baseline = rgbToLab(
                requirePrediction(predictEffectiveAutoPaintColor(prior, sample.layers))
            );
            const physical = rgbToLab(
                requirePrediction(predictEffectiveAutoPaintColor(optics, sample.layers))
            );
            const resolved = resolveAppearanceRankModel(physical, model, sample.physicalLayers);
            const errors = {
                baseline: deltaE2000Lab(baseline, sample.measured),
                physical: deltaE2000Lab(physical, sample.measured),
                full: deltaE2000Lab(resolved.lab, sample.measured),
            };
            if (Object.values(errors).some((error) => !Number.isFinite(error)))
                throw new Error(`Nonfinite prediction: ${id}`);
            return {
                id,
                matrixId: sample.matrixId,
                recipe: sample.layers,
                physicalLayers: sample.physicalLayers,
                terminalInteraction: sample.terminalInteraction ?? 'foundation-only',
                familiarInteractions: sample.interactions.every((pair) => trainingPairs.has(pair)),
                measuredLab: sample.measured,
                predictedLab: { baseline, physical, full: resolved.lab },
                predictedRgb: {
                    baseline: labToRgb(baseline),
                    physical: labToRgb(physical),
                    full: labToRgb(resolved.lab),
                },
                errors,
                transitionSupport: sample.layers.slice(1).map((layer, index) => {
                    const substrate = sample.layers[index].filamentId;
                    const transition = resolveEffectiveTransitionOptics(
                        optics,
                        layer.filamentId,
                        substrate
                    );
                    const fittedThickness = Math.min(
                        layer.thickness,
                        transition?.maxFittedThickness ?? 0
                    );
                    return {
                        substrate,
                        foreground: layer.filamentId,
                        thickness: layer.thickness,
                        fittedThickness,
                        priorContinuationThickness: layer.thickness - fittedThickness,
                    };
                }),
                method: resolved.predictionConfidence.method,
                confidence: resolved.predictionConfidence.confidence,
                empiricalSampleIds: resolved.empiricalMatch?.sampleIds ?? [],
                empiricalTransfers: resolved.empiricalMatch?.transfers ?? [],
                exactAnchorId: resolved.exactAnchor?.id ?? null,
            };
        });
        return {
            ...fold,
            fittedModelFingerprint: model.fingerprint,
            opticsApplied: optics.applied,
            opticsGateReason: optics.gateReason,
            opticalTrainingSampleCount: optics.sampleCount,
            empiricalTrainingSampleCount: trainedIds.length,
            trainingOnly: true,
            predictions,
        };
    });
    const summarize = (rows: (typeof foldReports)[number]['predictions']) => ({
        baseline: errorSummary(
            rows.map((s) => s.errors.baseline),
            plan.maximumDeltaE
        ),
        physical: errorSummary(
            rows.map((s) => s.errors.physical),
            plan.maximumDeltaE
        ),
        full: errorSummary(
            rows.map((s) => s.errors.full),
            plan.maximumDeltaE
        ),
        fullBetterThanBaseline: rows.filter((s) => s.errors.full < s.errors.baseline - 1e-9).length,
        fullWorseThanBaseline: rows.filter((s) => s.errors.full > s.errors.baseline + 1e-9).length,
        exactPredictions: rows.filter((s) => s.method === 'exact').length,
    });
    return {
        schemaVersion: 1,
        benchmark: 'matrix-end-to-end-v2',
        inputFingerprint: fingerprintJson('matrix-validation-input-v1', { appearance, context }),
        context: { ...context, filaments: undefined },
        maximumDeltaE: plan.maximumDeltaE,
        scope: 'Matrix pathway conditional on fixed filament/wedge priors; Palette Proof evidence excluded.',
        limitations: [
            'Photographed RGB is not independent colorimetry; shared-photo holdouts cannot validate lighting or camera accuracy.',
            'Fixed filament/wedge priors must be independent of withheld Matrix observations. Their provenance is not automatically verifiable.',
            'Palette Proof judgments are excluded from every fit and score because their session provenance cannot be linked reliably to Matrix photographs.',
            'Training copies rebuild stored preview coordinates from the fixed prior before fitting; original calibration files are unchanged.',
            'Reference-corrected, incompatible, explicitly unverified and unmeasured boards are excluded.',
            options.sessions
                ? 'Board holdouts use supplied session groups, also merging identical photos/duplicate boards.'
                : 'Board groups merge matching photo names/duplicate boards; otherwise board IDs are proxies, not proof of independent sessions.',
            'No optimizer-selected unmeasured recipe is counted as validated. This benchmark neither changes fit gates nor certifies printable output.',
            'Metrics are unweighted per photographed observation, not pixel-weighted or confidence-weighted; missing scores are null, not zero.',
        ],
        compatibleMatrixCount: plan.matrices.length,
        measuredSampleCount: plan.observations.length,
        boardGroupCount: plan.boardGroupCount,
        excludedMatrixIds: plan.excludedMatrixIds,
        excludedMatrices: (appearance.stackMatrices ?? [])
            .filter((m) => plan.excludedMatrixIds.includes(m.id))
            .map((m) => ({
                id: m.id,
                reason:
                    m.referenceCorrection === true
                        ? 'reference-corrected'
                        : m.alignmentVerified === false
                          ? 'unverified-alignment'
                          : !m.samples.some((s) => s.measuredColor)
                            ? 'no-measurements'
                            : 'runtime-incompatible',
            })),
        excludedPaletteProofCount: appearance.proofs.length,
        skipped: plan.skipped,
        scenarios: (options.scenarios ?? (['recipe', 'interaction', 'board'] as const)).map(
            (scenario) => {
                const rows = foldReports
                    .filter((f) => f.scenario === scenario)
                    .flatMap((f) => f.predictions);
                return {
                    scenario,
                    evaluatedSampleCount: rows.length,
                    unevaluatedSampleCount: plan.observations.length - rows.length,
                    ...summarize(rows),
                    familiar: summarize(rows.filter((s) => s.familiarInteractions)),
                    unfamiliar: summarize(rows.filter((s) => !s.familiarInteractions)),
                    byTerminalInteraction: [...new Set(rows.map((s) => s.terminalInteraction))]
                        .sort(compare)
                        .map((pair) => ({
                            pair,
                            ...summarize(rows.filter((s) => s.terminalInteraction === pair)),
                        })),
                    worstCases: [...rows]
                        .sort((a, b) => b.errors.full - a.errors.full || compare(a.id, b.id))
                        .slice(0, 12),
                };
            }
        ),
        folds: foldReports,
    };
}
