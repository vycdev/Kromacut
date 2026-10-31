import type { MultiHeadRoutingPlan, ThreeDControlsStateShape } from '../types';
import type { FinalPrintableStackSnapshot } from '../types/appearance';
import { hexToRgb, rgbToHex } from './autoPaint.ts';
import { deltaE2000, type Rgb } from './colorDifference.ts';
import { findLayerIdxAtHeight, type PrinterLayer } from './multiHeadAnalysis.ts';
import { MAX_MULTI_HEAD_HEADS, type ColorFirstResult } from './multiHeadAnalysisColorFirst.ts';
import type { Export3MFOptions } from './export3mf.ts';
import {
    buildPerColorLayerColors,
    patchedLayersToPlan,
    patchedLayersToSliceData,
} from './patchedLayersToPlan.ts';
import { buildMultiHeadSchedule } from './multiHeadSchedule.ts';

/** Clear previous analysis data when a build falls back to the original stack. */
export function singleHeadBuildSnapshot(state: ThreeDControlsStateShape): ThreeDControlsStateShape {
    return {
        ...state,
        multiHeadMode: false,
        multiHeadWindows: [],
        patchedTransitionZones: undefined,
        patchedSliceData: undefined,
        perColorLayerColors: undefined,
        colorLayerFilaments: undefined,
        windowRunFilaments: undefined,
        nozzleAssignments: undefined,
        preWindowFilaments: undefined,
        nonWindowedRanges: undefined,
    };
}

/** Resolve a physical, 1-based head; an incomplete plan must never guess head 1. */
export function resolveNozzleIndex(
    plan: MultiHeadRoutingPlan,
    filamentIndex: number,
    layerIndex: number
): number | undefined {
    const filamentId = plan.filaments[filamentIndex]?.id;
    if (!filamentId) return undefined;
    const windowIndex = plan.multiHeadWindows.findIndex(
        (window) => layerIndex >= window.windowStart && layerIndex <= window.windowEnd
    );
    if (windowIndex >= 0) {
        const runs = plan.windowRunFilaments[windowIndex];
        const head = plan.nozzleAssignments[windowIndex]?.findIndex(
            (slot) => slot >= 0 && runs?.[slot] === filamentId
        );
        return head !== undefined && head >= 0 ? head + 1 : undefined;
    }
    const range = plan.nonWindowedRanges.find(
        (range) => layerIndex >= range.rangeStart && layerIndex <= range.rangeEnd
    );
    const head = range?.nozzleFilaments.indexOf(filamentId);
    return head !== undefined && head >= 0 ? head + 1 : undefined;
}

export function getMultiHeadRoutingPlan(
    state: ThreeDControlsStateShape
): MultiHeadRoutingPlan | undefined {
    const {
        multiHeadCount,
        patchedSliceData,
        perColorLayerColors,
        colorLayerFilaments,
        multiHeadWindows,
        windowRunFilaments,
        nozzleAssignments,
        nonWindowedRanges,
        filaments,
    } = state;
    if (
        !state.multiHeadMode ||
        state.flatPaint ||
        state.paintMode !== 'autopaint' ||
        !multiHeadCount ||
        !Number.isInteger(multiHeadCount) ||
        multiHeadCount < 2 ||
        multiHeadCount > 8 ||
        !patchedSliceData?.colorOrder.length ||
        !perColorLayerColors?.size ||
        !colorLayerFilaments?.size ||
        !multiHeadWindows?.length ||
        !windowRunFilaments?.length ||
        !nozzleAssignments?.length ||
        !nonWindowedRanges ||
        !filaments.length ||
        !state.autoPaintResult?.finalStack
    )
        return undefined;
    const plan: MultiHeadRoutingPlan = {
        multiHeadCount,
        patchedSliceData,
        perColorLayerColors,
        colorLayerFilaments,
        multiHeadWindows,
        windowRunFilaments,
        nozzleAssignments,
        nonWindowedRanges,
        filaments,
    };
    const layerCount = patchedSliceData.colorOrder.length;
    if (
        !Number.isFinite(state.layerHeight) ||
        state.layerHeight <= 0 ||
        !Number.isFinite(state.slicerFirstLayerHeight) ||
        patchedSliceData.colorSliceHeights.length !== layerCount ||
        patchedSliceData.swatches.length !== layerCount ||
        nozzleAssignments.length !== multiHeadWindows.length ||
        windowRunFilaments.length !== multiHeadWindows.length ||
        nozzleAssignments.some((heads) => heads.length !== multiHeadCount) ||
        nonWindowedRanges.some((range) => range.nozzleFilaments.length !== multiHeadCount)
    )
        return undefined;
    for (let i = 0; i < layerCount; i++) {
        if (
            patchedSliceData.colorOrder[i] !== i ||
            !Number.isFinite(patchedSliceData.colorSliceHeights[i]) ||
            Math.abs(
                patchedSliceData.colorSliceHeights[i] -
                    (i === 0
                        ? Math.max(state.layerHeight, state.slicerFirstLayerHeight)
                        : state.layerHeight)
            ) > 1e-6
        )
            return undefined;
    }
    for (const [hex, path] of colorLayerFilaments) {
        if (path.length !== layerCount || perColorLayerColors.get(hex)?.length !== layerCount)
            return undefined;
        for (let i = 0; i < layerCount; i++) {
            if (!Number.isInteger(path[i]) || resolveNozzleIndex(plan, path[i], i) === undefined)
                return undefined;
        }
    }
    return plan;
}

/**
 * Smallest predicted gain over the normal stack, in usage-weighted mean CIEDE2000,
 * that justifies a routed build's head swaps.
 */
export const MIN_MULTI_HEAD_PREDICTED_GAIN = 0.25;

/**
 * Usage-weighted mean CIEDE2000 improvement of routed colors over the final
 * stack's own predictions. Pass colors corrected with the same appearance model.
 */
export function multiHeadPredictedGain(
    finalStack: FinalPrintableStackSnapshot,
    layers: PrinterLayer[],
    perColorLayerColors: Map<string, string[]>
): number {
    const colorsByHex = new Map(
        [...perColorLayerColors].map(([hex, colors]) => [rgbToHex(hexToRgb(hex)), colors])
    );
    let totalWeight = 0;
    let weightedGain = 0;
    for (const mapping of finalStack.targetMappings) {
        const colors = colorsByHex.get(mapping.targetColor.hex);
        const routedHex = colors?.[findLayerIdxAtHeight(layers, mapping.projectedHeight)];
        if (!routedHex || mapping.usageWeight <= 0) continue;
        const target = [...mapping.targetColor.rgb] as Rgb;
        const { r, g, b } = hexToRgb(routedHex);
        totalWeight += mapping.usageWeight;
        weightedGain += mapping.usageWeight * (
            deltaE2000(target, [...mapping.predictedColor.rgb] as Rgb) - deltaE2000(target, [r, g, b])
        );
    }
    return totalWeight > 0 ? weightedGain / totalWeight : 0;
}

/**
 * Publish a routed plan only when all its regions can use the scheduled heads
 * and its predicted colors are worth their head swaps.
 */
export function multiHeadBuildSnapshot(
    state: ThreeDControlsStateShape,
    result: ColorFirstResult | null
): ThreeDControlsStateShape {
    const headCount = state.multiHeadCount ?? 0;
    if (
        !Number.isInteger(headCount) ||
        headCount < 2 ||
        headCount > MAX_MULTI_HEAD_HEADS ||
        !result?.windows.length ||
        !result.patchedLayers.length ||
        !result.nozzleAssignments.length
    ) {
        return singleHeadBuildSnapshot(state);
    }
    const finalStack = state.autoPaintResult?.finalStack;
    const perColorLayerColors = buildPerColorLayerColors(
        result.patchedLayers,
        result.colorLayerFilaments,
        state.filaments,
        finalStack?.appearanceModel.effectiveOptics,
        finalStack?.appearanceModel
    );
    if (
        finalStack &&
        multiHeadPredictedGain(finalStack, result.patchedLayers, perColorLayerColors) <
            MIN_MULTI_HEAD_PREDICTED_GAIN
    ) {
        return singleHeadBuildSnapshot(state);
    }
    const built: ThreeDControlsStateShape = {
        ...state,
        multiHeadMode: true,
        slicerFirstLayerHeight: Math.max(state.layerHeight, state.slicerFirstLayerHeight),
        multiHeadWindows: result.windows,
        patchedTransitionZones: patchedLayersToPlan(result.patchedLayers, state.filaments),
        patchedSliceData: patchedLayersToSliceData(
            result.patchedLayers,
            state.filaments,
            state.slicerFirstLayerHeight
        ),
        perColorLayerColors,
        colorLayerFilaments: result.colorLayerFilaments,
        windowRunFilaments: result.windowRunFilaments,
        // Analysis only needs as many slots as there are filaments. Retain the
        // selected physical head count, including never-used heads, downstream.
        nozzleAssignments: result.nozzleAssignments.map((heads) => [
            ...heads,
            ...new Array(Math.max(0, headCount - heads.length)).fill(-1),
        ]),
        preWindowFilaments: result.preWindowFilaments,
        nonWindowedRanges: result.nonWindowedRanges.map((range) => ({
            ...range,
            nozzleFilaments: [
                ...range.nozzleFilaments,
                ...new Array(Math.max(0, headCount - range.nozzleFilaments.length)).fill(''),
            ],
        })),
    };
    return getMultiHeadRoutingPlan(built) ? built : singleHeadBuildSnapshot(state);
}

/** The same schedule drives the on-screen instructions and exported pauses. */
export function multiHeadExportOptions(
    plan: MultiHeadRoutingPlan | undefined
): Pick<Export3MFOptions, 'extruderCount' | 'swapLayers'> {
    if (!plan) return {};
    const schedule = buildMultiHeadSchedule(plan);
    return {
        extruderCount: plan.multiHeadCount,
        swapLayers: schedule
            ?.filter((event) => !event.isPrePrint && event.swapCount > 0)
            .map((event) => ({
                layer: event.startLayer,
                color: event.nozzles.find((head) => head.changed)?.filamentHex,
            })),
    };
}
