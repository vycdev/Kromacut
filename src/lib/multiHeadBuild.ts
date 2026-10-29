import type { MultiHeadRoutingPlan, ThreeDControlsStateShape } from '../types';
import type { ColorFirstResult } from './multiHeadAnalysisColorFirst.ts';
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

/** Publish a routed plan only when all its regions can use the scheduled heads. */
export function multiHeadBuildSnapshot(
    state: ThreeDControlsStateShape,
    result: ColorFirstResult | null
): ThreeDControlsStateShape {
    if (
        !result?.windows.length ||
        !result.patchedLayers.length ||
        !result.nozzleAssignments.length
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
        perColorLayerColors: buildPerColorLayerColors(
            result.patchedLayers,
            result.colorLayerFilaments,
            state.filaments,
            state.autoPaintResult?.finalStack?.appearanceModel.effectiveOptics
        ),
        colorLayerFilaments: result.colorLayerFilaments,
        windowRunFilaments: result.windowRunFilaments,
        nozzleAssignments: result.nozzleAssignments,
        preWindowFilaments: result.preWindowFilaments,
        nonWindowedRanges: result.nonWindowedRanges,
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
