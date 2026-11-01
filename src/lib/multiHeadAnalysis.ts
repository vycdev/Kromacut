/** Shared physical-layer simulation, target mapping, and appearance correction. */

import type { AutoPaintResult } from './autoPaint.ts';
import type { Filament } from '../types';
import type {
    AppearanceAnchorLayer,
    AppearanceEffectiveOpticsModelV1,
    AppearanceRankModelV1,
} from '../types/appearance';
import {
    autoPaintResultMatchesSliceGrid,
    hexToRgb,
    blendColors,
    deltaE,
    rgbToHex,
    rgbToLab,
    mapTargetsToPrintablePalette,
    type RGB,
} from './autoPaint.ts';
import type { CalibrationRgb } from './calibration.ts';
import { appearanceLabToRgb, resolveAppearanceRankModel } from './appearanceModel.ts';
import {
    blendEffectiveTransition,
    resolveEffectiveTransitionOptics,
    type EffectiveTransitionOptics,
} from './effectiveOptics.ts';

export interface PrinterLayer {
    /** Index into the original filaments array */
    filamentIdx: number;
    filamentId?: string;
    /** Physical swatch color, retained separately from the effective optical color. */
    filamentColor?: string;
    filamentRgb: RGB;
    /** Required opaque foundation layers cannot change filament in a window assignment. */
    isFoundation?: boolean;
    /**
     * Effective or calibrated per-channel hiding distances (mm) from the zone.
     * Schema v2 stores frontlit HD directly; it is not rescaled. A scalar is
     * still accepted for hand-built test fixtures.
     */
    td: number | CalibrationRgb;
    transmissionExponent?: number;
    substrateHdMultiplier?: number;
    transitionOptics?: EffectiveTransitionOptics;
    thickness: number;
    startZ: number;
}

export interface WindowFilament {
    /** Original profile index and ID, for matching runs and resolving substrates. */
    filamentIdx?: number;
    filamentId?: string;
    rgb: RGB;
    /** Per-channel hiding distances (mm), from `channelHds()`. See PrinterLayer.td. */
    td: number | CalibrationRgb;
}

export interface PixelData {
    targetRgb: RGB;
    /** Index of the printer layer this swatch maps to. */
    layerIdx: number;
    /** ΔE between target and actual stack color at layerIdx. */
    actualErr: number;
}

/** Per-window output from the run-based search. */
export interface WindowResult {
    /** Index of the first layer in the window (1-based; required foundation layers stay fixed). */
    windowStart: number;
    /** Index of the last layer in the window (inclusive). */
    windowEnd: number;
    windowBottomZ: number;
    windowTopZ: number;
    /** Display names in filamentIds order. */
    currentFilaments: string[];
    /** Physical filaments available to this window. */
    filamentIds: string[];
    /** Weighted usage of groups whose original mapped surface reaches this window. */
    affectedSwatches: number;
    /** Full-model weighted CIEDE2000 opportunity across affected groups, always ≥ 0. */
    errorFactor: number;
}

/** Expand transition zones into individual printer-layer entries. */
export function expandZonesToPrinterLayers(
    result: AutoPaintResult,
    filaments: Filament[],
    layerHeight: number,
    firstLayerHeight: number
): PrinterLayer[] {
    if (!autoPaintResultMatchesSliceGrid(result, layerHeight, firstLayerHeight)) {
        throw new Error('Auto-paint final stack settings do not match the requested slice grid');
    }
    const foundation = result.finalStack.zones[0];
    const minimumFoundationThickness = foundation?.minimumThickness ??
        foundation?.actualThickness ?? firstLayerHeight;
    return result.finalStack.layers.map((layer) => {
        const zone = result.transitionZones[layer.zoneIndex];
        const filamentIdx = filaments.findIndex((f) => f.id === layer.filamentId);
        return {
            filamentIdx: Math.max(0, filamentIdx),
            filamentId: layer.filamentId,
            filamentColor: layer.filamentColor,
            filamentRgb: zone.effectiveColor ?? hexToRgb(layer.filamentColor),
            isFoundation: layer.startHeight + 1e-8 < minimumFoundationThickness,
            td: zone.effectiveTdChannels ?? zone.filamentTdChannels ?? zone.filamentTd,
            transmissionExponent: zone.transmissionExponent,
            substrateHdMultiplier: zone.substrateHdMultiplier,
            transitionOptics: zone.transitionOptics,
            thickness: layer.thickness,
            startZ: layer.startHeight,
        };
    });
}

/** Return the first printable surface at or above h, clamped to the stack. */
export function findLayerIdxAtHeight(layers: PrinterLayer[], h: number): number {
    for (let i = 0; i < layers.length; i++) {
        if (layers[i].startZ + layers[i].thickness + 1e-8 >= h) return i;
    }
    return Math.max(0, layers.length - 1);
}

export interface ColorStackState {
    color: RGB;
    runBackground: RGB;
    run: PrinterLayer;
    runThickness: number;
    foundation: boolean;
}

export function startColorStack(layer: PrinterLayer): ColorStackState {
    return {
        color: { ...layer.filamentRgb },
        runBackground: { ...layer.filamentRgb },
        run: layer,
        runThickness: layer.thickness,
        foundation: true,
    };
}

/** Fitted exponents and support limits apply to a whole run, from its original substrate. */
export function appendColorStackLayer(
    state: ColorStackState,
    layer: PrinterLayer,
    model?: AppearanceEffectiveOpticsModelV1
): void {
    if (layer.filamentIdx !== state.run.filamentIdx) {
        const transitionOptics = model && layer.filamentId && state.run.filamentId
            ? resolveEffectiveTransitionOptics(model, layer.filamentId, state.run.filamentId)
            : undefined;
        state.runBackground = state.color;
        state.run = { ...layer, transitionOptics: transitionOptics ?? layer.transitionOptics };
        state.runThickness = 0;
        state.foundation = false;
    }
    state.runThickness = Number((state.runThickness + layer.thickness).toFixed(8));
    if (state.foundation) return;

    const run = state.run;
    if (run.transitionOptics) {
        const { r, g, b } = state.runBackground;
        const color = blendEffectiveTransition([r, g, b], run.transitionOptics, state.runThickness);
        state.color = { r: color[0], g: color[1], b: color[2] };
    } else {
        state.color = blendColors(state.runBackground, run.filamentRgb, run.td,
            state.runThickness, run.transmissionExponent, run.substrateHdMultiplier);
    }
}

/**
 * Accumulate the Beer-Lambert stack color at each printer layer.
 * The first contiguous run is opaque. Other runs use the fitted zone optics
 * and cumulative thickness, including conservative continuation beyond support.
 */
export function buildColorStack(layers: PrinterLayer[]): RGB[] {
    const colorAtLayer: RGB[] = new Array(layers.length);
    if (layers.length === 0) return colorAtLayer;
    const state = startColorStack(layers[0]);
    colorAtLayer[0] = state.color;
    for (let i = 1; i < layers.length; i++) {
        appendColorStackLayer(state, layers[i]);
        colorAtLayer[i] = state.color;
    }
    return colorAtLayer;
}

/**
 * Reuse the final stack's swatch-to-surface assignments and precompute actual ΔE.
 * Swatches absent from that result use the shared printable-palette mapper.
 */
export function buildPixelData(
    imageSwatches: Array<{ hex: string }>,
    layers: PrinterLayer[],
    colorAtLayer: RGB[],
    stack: AutoPaintResult['finalStack']
): PixelData[] {
    if (layers.length === 0) return [];
    const mappings = new Map(stack.targetMappings.map((mapping) =>
        [mapping.targetColor.hex, mapping.projectedHeight]
    ));
    return imageSwatches.map((s) => {
        const rgb = hexToRgb(s.hex);
        let h = mappings.get(rgbToHex(rgb));
        if (h === undefined) {
            const palette = stack.palette.map((entry) => ({
                height: entry.height,
                rgb: { r: entry.predictedColor.rgb[0], g: entry.predictedColor.rgb[1], b: entry.predictedColor.rgb[2] },
                lab: { L: entry.predictedLab[0], a: entry.predictedLab[1], b: entry.predictedLab[2] },
                surfaceEligible: entry.surfaceEligible,
                predictionConfidence: entry.predictionConfidence,
                exactAnchorId: entry.exactAnchorId,
                exactAnchorTargetLab: entry.exactAnchorTargetLab ? {
                    L: entry.exactAnchorTargetLab[0], a: entry.exactAnchorTargetLab[1], b: entry.exactAnchorTargetLab[2],
                } : undefined,
            }));
            h = mapTargetsToPrintablePalette(palette, [{ ...rgbToLab(rgb), weight: 1 }])[0].projectedHeight;
        }
        const layerIdx = findLayerIdxAtHeight(layers, h);
        const predicted = stack.layers[layerIdx]?.predictedColor.rgb;
        const actualColor = predicted
            ? { r: predicted[0], g: predicted[1], b: predicted[2] }
            : colorAtLayer[layerIdx];
        return { targetRgb: rgb, layerIdx, actualErr: deltaE(rgb, actualColor) };
    });
}

export function toAppearanceLayer(layer: PrinterLayer): AppearanceAnchorLayer {
    return {
        filamentId: layer.filamentId ?? `f${layer.filamentIdx}`,
        filamentColor: layer.filamentColor ?? rgbToHex(layer.filamentRgb),
        thickness: layer.thickness,
    };
}

/** Same appearance correction as the final stack and the routed preview. */
export function correctedStackColor(
    color: RGB,
    model: AppearanceRankModelV1,
    prefix: readonly AppearanceAnchorLayer[]
): RGB {
    const prediction = resolveAppearanceRankModel(rgbToLab(color), model, prefix);
    if (!model.applied && !prediction.exactAnchor && !prediction.empiricalMatch && !prediction.localMatch) {
        return color;
    }
    const [r, g, b] = appearanceLabToRgb(prediction.lab);
    return { r, g, b };
}
