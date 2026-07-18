export interface CanonicalSrgbColor {
    space: 'srgb';
    encoding: 'uint8';
    whitePoint: 'D65';
    rgb: readonly [number, number, number];
    hex: string;
}

export interface AppearanceRankModelV1 {
    schemaVersion: 1;
    modelVersion: 'lab-rank-global-v1';
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
    noneCount: number;
    distinctStackCount: number;
    heldOutCount: number;
    baselineAgreement: number;
    fittedAgreement: number;
    sourceProofIds: readonly string[];
    comparedStackKeys: readonly string[];
}

export type AppearanceGeometryClass = 'flat-interior' | 'edge-limited' | 'mixed' | 'unknown';
export type AppearanceSupportStatus = 'compared' | 'fitted' | 'estimated';

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
    };
    totalHeight: number;
    truncated: boolean;
    layers: readonly FinalStackLayerSnapshot[];
    zones: readonly FinalStackZoneSnapshot[];
    swapSequence: readonly FinalStackSwapSnapshot[];
    palette: readonly FinalStackPaletteEntrySnapshot[];
    targetMappings: readonly FinalStackTargetMappingSnapshot[];
}
