export interface CanonicalSrgbColor {
    space: 'srgb';
    encoding: 'uint8';
    whitePoint: 'D65';
    rgb: readonly [number, number, number];
    hex: string;
}

export interface AppearanceAnchorLayer {
    filamentId: string;
    filamentColor: string;
    thickness: number;
}

export interface AppearanceExactAnchorV1 {
    id: string;
    proofId: string;
    source?: 'palette-proof' | 'stack-matrix';
    sourceStackKey: string;
    targetLab: readonly [number, number, number];
    suffixLayers: readonly AppearanceAnchorLayer[];
    maxSubstrateTransmission: number;
    observedAt?: string;
    confidence?: number;
}

export interface AppearanceLocalEvidenceV1 {
    id: string;
    proofIds: readonly string[];
    judgmentIds: readonly string[];
    sourceStackKey: string;
    /** Simulated color of this physically tested recipe before appearance fitting. */
    baseLab: readonly [number, number, number];
    /** Desired proof color whose neighborhood this comparison describes. */
    targetLab: readonly [number, number, number];
    /** Recent bottom-to-top physical layers used for recipe-neighborhood matching. */
    suffixLayers: readonly AppearanceAnchorLayer[];
    observedAt: string;
    winnerCount: number;
    loserCount: number;
    noneCount: number;
    tieWinnerCount: number;
    supportWeight: number;
    rejectionWeight: number;
    /** Signed local optimizer signal: negative supports this recipe, positive rejects it. */
    preference: number;
    confidence: number;
    /** Close/Dead-on target estimate used to correct nearby recipes, when available. */
    correctionTargetLab?: readonly [number, number, number];
    correctionStrength: number;
}

export interface AppearanceEmpiricalLutSampleV1 {
    id: string;
    sourceStackKey: string;
    /** Bottom-to-top fixed-depth recipe measured by the Stack Matrix. */
    recipeFilamentIds: readonly string[];
    predictedLab: readonly [number, number, number];
    measuredLab: readonly [number, number, number];
    confidence: number;
    /** Leave-one-out error of this recipe under the empirical resolver. */
    crossValidationDeltaE?: number;
    exactAnchorId: string;
}

export interface AppearanceEmpiricalLutV1 {
    id: string;
    sourceMatrixId: string;
    observedAt: string;
    layerHeight: number;
    stackLayerCount: number;
    backingFilamentId: string;
    /** Shared bottom-to-top foundation beneath every recipe measured by this matrix. */
    foundationLayers: readonly AppearanceAnchorLayer[];
    filamentIds: readonly string[];
    /** Confidence in the photographed board alignment. */
    alignmentWeight: number;
    /** Breadth of measured recipes relative to the printable recipe space. */
    coverageWeight: number;
    /** Time-decay weight relative to the newest compatible matrix. */
    recencyWeight: number;
    /** Robust agreement with recipes measured by at least two other matrices. */
    agreementWeight: number;
    /** Product of the four matrix-level evidence weights. */
    matrixWeight: number;
    /** Local predicted-Lab radius that defines measured territory. */
    coverageRadius: number;
    crossValidationMeanDeltaE?: number;
    crossValidationP90DeltaE?: number;
    crossValidationSampleCount?: number;
    samples: readonly AppearanceEmpiricalLutSampleV1[];
}

export interface AppearanceEffectiveFilamentOpticsV1 {
    filamentId: string;
    /** Existing wedge/swatch calibration retained as the regularizing prior. */
    priorHdChannels: readonly [number, number, number];
    /** Conservative wedge/swatch fallback for unsupported Matrix transitions. */
    fallbackHdChannels?: readonly [number, number, number];
    /** Runtime wedge prior for each actual substrate, shared by every predictor. */
    substrateHdChannels?: readonly {
        substrateFilamentId: string;
        hdChannels: readonly [number, number, number];
    }[];
    effectiveHdChannels: readonly [number, number, number];
    priorOpaqueColor: readonly [number, number, number];
    effectiveOpaqueColor: readonly [number, number, number];
    /** Power in T = 10^(-(thickness / effectiveHd)^exponent). */
    transmissionExponent: number;
    sampleCount: number;
}

export interface AppearanceSubstrateInteractionV1 {
    foregroundFilamentId: string;
    substrateFilamentId: string;
    /** Multiplies the foreground RGB-channel HDs for this ordered material pair. */
    hdMultiplier: number;
    sampleCount: number;
    /** Thickest contiguous foreground run directly observed for this pair. */
    maxObservedThickness?: number;
}

export interface AppearanceEffectiveOpticsModelV1 {
    schemaVersion: 1;
    modelVersion: 'matrix-effective-optics-v3' | 'matrix-effective-optics-v4';
    fingerprint: string;
    applied: boolean;
    gateReason: 'applied' | 'no-compatible-matrix' | 'insufficient-samples' | 'no-improvement';
    matrixCount: number;
    sampleCount: number;
    baselineMeanDeltaE: number;
    fittedMeanDeltaE: number;
    /** Deterministic K-fold held-out error for the fitted physical model. */
    crossValidationMeanDeltaE: number;
    crossValidationP90DeltaE: number;
    crossValidationSampleCount: number;
    confidence: number;
    filaments: readonly AppearanceEffectiveFilamentOpticsV1[];
    substrateInteractions: readonly AppearanceSubstrateInteractionV1[];
}

export interface AppearanceRankModelV1 {
    schemaVersion: 1;
    modelVersion: 'lab-rank-local-v9' | 'lab-rank-local-v10';
    fingerprint: string;
    contextFingerprint: string;
    applied: boolean;
    gateReason:
        | 'applied'
        | 'insufficient-evidence'
        | 'insufficient-heldout'
        | 'no-training-improvement'
        | 'heldout-below-threshold'
        | 'heldout-no-improvement';
    deltaL: number;
    logChromaScale: number;
    confidence: number;
    observationCount: number;
    trainingObservationCount: number;
    trainingDistinctStackCount: number;
    noneCount: number;
    distinctStackCount: number;
    heldOutCount: number;
    heldOutDistinctStackCount: number;
    baselineAgreement: number;
    fittedAgreement: number;
    sourceProofIds: readonly string[];
    comparedStackKeys: readonly string[];
    exactAnchors: readonly AppearanceExactAnchorV1[];
    localEvidence: readonly AppearanceLocalEvidenceV1[];
    empiricalLuts: readonly AppearanceEmpiricalLutV1[];
    /** Runtime-only physical refit derived from compatible Stack Matrix measurements. */
    effectiveOptics?: AppearanceEffectiveOpticsModelV1;
}

export type AppearanceGeometryClass = 'flat-interior' | 'edge-limited' | 'mixed' | 'unknown';
export type AppearanceSupportStatus =
    | 'anchored'
    | 'interpolated'
    | 'locally-fitted'
    | 'compared'
    | 'fitted'
    | 'estimated';

export type AppearancePredictionMethod = 'exact' | 'interpolated' | 'fitted' | 'simulated';

/** Evidence-aware confidence attached to every newly generated predicted color. */
export interface AppearancePredictionConfidenceV1 {
    method: AppearancePredictionMethod;
    confidence: number;
    uncertainty: number;
    nearestMeasuredDeltaE: number | null;
    nearestMeasuredRecipeDistance: number | null;
    distanceConfidence: number;
    agreementConfidence: number;
    crossValidationDeltaE: number | null;
    crossValidationConfidence: number;
    evidenceSampleCount: number;
}

export interface TargetSampleContext {
    geometryClass: AppearanceGeometryClass;
    interiorRadiusMm?: number;
    flatInteriorWeight?: number;
    edgeLimitedWeight?: number;
}

export interface FinalStackLayerSnapshot {
    /** False for a foundation prefix that has not reached its required opacity. */
    surfaceEligible?: boolean;
    id: string;
    index: number;
    filamentId: string;
    filamentColor: string;
    startHeight: number;
    endHeight: number;
    thickness: number;
    zoneIndex: number;
    canonicalStackKey: string;
    basePredictedColor: CanonicalSrgbColor;
    basePredictedLab: readonly [number, number, number];
    predictedColor: CanonicalSrgbColor;
    predictedLab: readonly [number, number, number];
    appearanceStatus: AppearanceSupportStatus;
    /** Optional only for snapshots created before prediction confidence existed. */
    predictionConfidence?: AppearancePredictionConfidenceV1;
    exactAnchorId?: string;
    exactAnchorTargetLab?: readonly [number, number, number];
    empiricalLutId?: string;
    empiricalSampleIds?: readonly string[];
    localEvidenceIds?: readonly string[];
    localCorrectionStrength?: number;
    localUncertainty?: number;
}

export interface FinalStackZoneSnapshot {
    id: string;
    index: number;
    filamentId: string;
    filamentColor: string;
    filamentHd: number;
    filamentHdChannels?: readonly [number, number, number];
    effectiveOpaqueColor?: readonly [number, number, number];
    effectiveHdChannels?: readonly [number, number, number];
    transmissionExponent?: number;
    substrateFilamentId?: string;
    substrateHdMultiplier?: number;
    maxFittedThickness?: number;
    fallbackColor?: readonly [number, number, number];
    fallbackHdChannels?: readonly [number, number, number];
    minimumThickness?: number;
    startHeight: number;
    endHeight: number;
    idealThickness: number;
    actualThickness: number;
}

export interface FinalStackSwapSnapshot {
    id: string;
    index: number;
    filamentId: string;
    filamentColor: string;
    startLayerIndex: number;
    endLayerIndex: number;
    startHeight: number;
    endHeight: number;
}

export interface FinalStackPaletteEntrySnapshot {
    surfaceEligible?: boolean;
    id: string;
    index: number;
    layerId: string;
    height: number;
    canonicalStackKey: string;
    basePredictedColor: CanonicalSrgbColor;
    basePredictedLab: readonly [number, number, number];
    predictedColor: CanonicalSrgbColor;
    predictedLab: readonly [number, number, number];
    appearanceStatus: AppearanceSupportStatus;
    /** Optional only for snapshots created before prediction confidence existed. */
    predictionConfidence?: AppearancePredictionConfidenceV1;
    exactAnchorId?: string;
    exactAnchorTargetLab?: readonly [number, number, number];
    empiricalLutId?: string;
    empiricalSampleIds?: readonly string[];
    localEvidenceIds?: readonly string[];
    localCorrectionStrength?: number;
    localUncertainty?: number;
}

export interface FinalStackTargetMappingSnapshot {
    id: string;
    index: number;
    targetColor: CanonicalSrgbColor;
    targetLab: readonly [number, number, number];
    usageWeight: number;
    paletteIndex: number;
    paletteEntryId: string;
    canonicalStackKey: string;
    projectedHeight: number;
    predictedColor: CanonicalSrgbColor;
    predictedLab: readonly [number, number, number];
    /** Optional only for snapshots created before prediction confidence existed. */
    predictionConfidence?: AppearancePredictionConfidenceV1;
    /** False when Preserve color separation merged this source color into a surviving mapping. */
    preservedWithinThreshold?: boolean;
    sampleContext: TargetSampleContext;
}

export interface FinalPrintableStackSnapshot {
    schemaVersion: 1;
    fingerprint: string;
    modelFingerprint: string;
    modelVersion: 'rgb-beer-lambert-v1' | 'rgb-effective-optics-v2';
    appearanceModel: AppearanceRankModelV1;
    settings: {
        layerHeight: number;
        firstLayerHeight: number;
        requestedMaxHeight: number | null;
        printableMaxHeight: number;
        transitionOpacity: number;
        compressionRatio: number;
        /** Hard ΔE00 boundary used by Preserve color separation, when enabled. */
        separationMaxDeltaE?: number;
        /** Whether a missed separation target invalidates the whole Auto-paint result. */
        failOnSeparationError?: boolean;
    };
    totalHeight: number;
    truncated: boolean;
    layers: readonly FinalStackLayerSnapshot[];
    zones: readonly FinalStackZoneSnapshot[];
    swapSequence: readonly FinalStackSwapSnapshot[];
    palette: readonly FinalStackPaletteEntrySnapshot[];
    targetMappings: readonly FinalStackTargetMappingSnapshot[];
}
