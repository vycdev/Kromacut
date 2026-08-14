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

export interface AppearanceEmpiricalLutSampleV1 {
    id: string;
    sourceStackKey: string;
    /** Bottom-to-top fixed-depth recipe measured by the Stack Matrix. */
    recipeFilamentIds: readonly string[];
    predictedLab: readonly [number, number, number];
    measuredLab: readonly [number, number, number];
    confidence: number;
    exactAnchorId: string;
}

export interface AppearanceEmpiricalLutV1 {
    id: string;
    sourceMatrixId: string;
    observedAt: string;
    layerHeight: number;
    stackLayerCount: number;
    backingFilamentId: string;
    filamentIds: readonly string[];
    /** Local predicted-Lab radius that defines measured territory. */
    coverageRadius: number;
    samples: readonly AppearanceEmpiricalLutSampleV1[];
}

export interface AppearanceRankModelV1 {
    schemaVersion: 1;
    modelVersion: 'lab-rank-global-v5';
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
    empiricalLuts: readonly AppearanceEmpiricalLutV1[];
}

export type AppearanceGeometryClass = 'flat-interior' | 'edge-limited' | 'mixed' | 'unknown';
export type AppearanceSupportStatus =
    | 'anchored'
    | 'interpolated'
    | 'compared'
    | 'fitted'
    | 'estimated';

export interface TargetSampleContext {
    geometryClass: AppearanceGeometryClass;
    interiorRadiusMm?: number;
    flatInteriorWeight?: number;
    edgeLimitedWeight?: number;
}

export interface FinalStackLayerSnapshot {
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
    exactAnchorId?: string;
    exactAnchorTargetLab?: readonly [number, number, number];
    empiricalLutId?: string;
    empiricalSampleIds?: readonly string[];
}

export interface FinalStackZoneSnapshot {
    id: string;
    index: number;
    filamentId: string;
    filamentColor: string;
    filamentHd: number;
    filamentHdChannels?: readonly [number, number, number];
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
    exactAnchorId?: string;
    exactAnchorTargetLab?: readonly [number, number, number];
    empiricalLutId?: string;
    empiricalSampleIds?: readonly string[];
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
    sampleContext: TargetSampleContext;
}

export interface FinalPrintableStackSnapshot {
    schemaVersion: 1;
    fingerprint: string;
    modelFingerprint: string;
    modelVersion: 'rgb-beer-lambert-v1';
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
