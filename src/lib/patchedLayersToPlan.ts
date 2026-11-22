/**
 * Convert a patched printer-layer stack (from ColorFirstResult.patchedLayers)
 * into a TransitionZone[] that the existing swap-plan and mesh-generation
 * pipeline can consume without further modification.
 *
 * The output has the same shape as AutoPaintResult.transitionZones, so any
 * code that already iterates transition zones works unchanged.
 */

import type { TransitionZone } from './autoPaint.ts';
import { hexToRgb, rgbToHex } from './autoPaint.ts';
import type { PrinterLayer } from './multiHeadAnalysis.ts';
import { buildColorStack, correctedStackColor } from './multiHeadAnalysis.ts';
import type { Filament } from '../types';
import type {
    AppearanceAnchorLayer,
    AppearanceEffectiveOpticsModelV1,
    AppearanceRankModelV1,
} from '../types/appearance';
import { buildColorRuns } from './multiHeadAnalysisColorFirst.ts';
import {
    createPriorEffectiveOpticsModel,
    resolveEffectiveFilamentOptics,
    resolveEffectiveTransitionOptics,
} from './effectiveOptics.ts';

// ---------------------------------------------------------------------------
// Slice data — ThreeDView mesh generation
// ---------------------------------------------------------------------------

/**
 * The three arrays ThreeDView needs to build a layered mesh, derived from the
 * patched printer-layer stack.  Structurally identical to what App.tsx normally
 * derives from autoPaintSliceData, so ThreeDView requires no changes.
 *
 * colorOrder is always the identity mapping [0, 1, …, N-1] so that
 * colorSliceHeights[colorOrder[i]] == colorSliceHeights[i] == thickness of layer i.
 */
export interface PatchedSliceData {
    colorOrder: number[];
    colorSliceHeights: number[];
    swatches: { hex: string; a: number }[];
}

/**
 * Derive a PatchedSliceData triple from the patched printer-layer stack.
 *
 * Mirrors autoPaintToSliceHeights: one slice per *printer layer* (not per run),
 * each carrying the Beer-Lambert blended colour at that layer.  This preserves
 * the smooth per-layer gradient of the standard auto-paint render while
 * reflecting the reordered filament assignment in patchedLayers — that is what
 * makes the remixed window layers visible.
 *
 * Layer 0's thickness already accounts for firstLayerHeight because
 * expandZonesToPrinterLayers clamps it to max(firstLayerHeight, layerHeight).
 * The firstLayerHeight argument is kept for signature parity with the original
 * slice-height helper and to guard against a degenerate base.
 */
export function patchedLayersToSliceData(
    layers: PrinterLayer[],
    _filaments: Filament[],
    firstLayerHeight: number
): PatchedSliceData {
    if (layers.length === 0) return { colorOrder: [], colorSliceHeights: [], swatches: [] };

    // Beer-Lambert blended colour accumulated from the opaque foundation up.
    const colorAtLayer = buildColorStack(layers);

    const colorOrder: number[] = [];
    const colorSliceHeights: number[] = [];
    const swatches: { hex: string; a: number }[] = [];

    for (let i = 0; i < layers.length; i++) {
        colorOrder.push(i);
        colorSliceHeights.push(
            i === 0 ? Math.max(layers[i].thickness, firstLayerHeight) : layers[i].thickness
        );
        swatches.push({ hex: rgbToHex(colorAtLayer[i]), a: 255 });
    }

    return { colorOrder, colorSliceHeights, swatches };
}

// ---------------------------------------------------------------------------
// Per-colour layer colours — per-pixel mesh rendering
// ---------------------------------------------------------------------------

/**
 * For each image colour, compute the Beer-Lambert blended colour at every printer
 * layer following that colour's own filament path (from colorLayerFilaments).
 *
 * Two pixels of different colour at the same height can therefore show different
 * colours, which is what makes the reordered "mixed" window layers visible.
 * Pass the analysis's effective optics model when fitted appearance data is used,
 * and the final stack's appearance model to correct each layer from its physical
 * prefix, the way the final stack predicts its single-head colors.
 *
 * @returns Map keyed by image-colour hex → array (length = layers.length) of
 *          blended colour hex strings, one per printer layer.
 */
export function buildPerColorLayerColors(
    layers: PrinterLayer[],
    colorLayerFilaments: Map<string, number[]>,
    filaments: Filament[],
    effectiveOptics?: AppearanceEffectiveOpticsModelV1,
    appearanceModel?: AppearanceRankModelV1
): Map<string, string[]> {
    const out = new Map<string, string[]>();
    if (layers.length === 0) return out;

    // Pre-resolve each palette filament's rgb + per-channel hiding distances,
    // using the shared optical model so multi-head colors match normal auto-paint.
    const model = effectiveOptics?.filaments.length ? effectiveOptics : createPriorEffectiveOpticsModel(filaments);
    const palette = filaments.map((f) => {
        const optics = resolveEffectiveFilamentOptics(model, f);
        const td: PrinterLayer['td'] = [...optics.hdChannels];
        return {
            filamentId: f.id,
            filamentColor: rgbToHex(hexToRgb(f.color)),
            rgb: { r: optics.color[0], g: optics.color[1], b: optics.color[2] },
            td,
        };
    });
    // Paths sharing a physical prefix share every corrected color up to that layer.
    const correctedByPrefix = new Map<string, string>();

    for (const [hex, seq] of colorLayerFilaments) {
        // Build a per-colour printer-layer stack: same geometry as `layers`, but
        // each layer's filament comes from this colour's path.
        const colorLayers: PrinterLayer[] = layers.map((l, i) => {
            const p = palette[seq[i]] ?? { filamentId: l.filamentId, rgb: l.filamentRgb, td: l.td };
            const substrateId = i > 0
                ? palette[seq[i - 1]]?.filamentId ?? layers[i - 1].filamentId
                : undefined;
            // The consensus layer's cached transition belongs to a different
            // filament path. Resolve this color's actual foreground/substrate.
            return {
                filamentIdx: seq[i], filamentId: p.filamentId,
                filamentRgb: p.rgb, td: p.td,
                startZ: l.startZ, thickness: l.thickness,
                transitionOptics: p.filamentId && substrateId
                    ? resolveEffectiveTransitionOptics(model, p.filamentId, substrateId)
                    : undefined,
            };
        });
        const stack = buildColorStack(colorLayers);
        if (!appearanceModel) {
            out.set(hex, stack.map(rgbToHex));
            continue;
        }
        const prefix: AppearanceAnchorLayer[] = [];
        let prefixKey = '';
        out.set(hex, stack.map((color, i) => {
            const layer = colorLayers[i];
            prefix.push({
                filamentId: layer.filamentId ?? `f${seq[i]}`,
                filamentColor: palette[seq[i]]?.filamentColor ?? layers[i].filamentColor ?? rgbToHex(layers[i].filamentRgb),
                thickness: layer.thickness,
            });
            prefixKey += `${seq[i]},`;
            let corrected = correctedByPrefix.get(prefixKey);
            if (corrected === undefined) {
                corrected = rgbToHex(correctedStackColor(color, appearanceModel, prefix));
                correctedByPrefix.set(prefixKey, corrected);
            }
            return corrected;
        }));
    }

    return out;
}

/**
 * Convert a (possibly reordered) printer-layer stack into a TransitionZone[].
 *
 * Each contiguous run of layers sharing the same filamentIdx becomes one zone.
 * Zone heights are derived from the actual layer startZ values and thicknesses
 * stored in the stack, so they are exact rather than ideal floats.
 *
 * idealThickness and actualThickness are set to the same value — there is no
 * compression step in the multi-head pipeline; the layer heights are already
 * discretised to the printer's layer height.
 */
export function patchedLayersToPlan(
    layers: PrinterLayer[],
    filaments: Filament[]
): TransitionZone[] {
    if (layers.length === 0) return [];

    const runs = buildColorRuns(layers);

    return runs.map((run): TransitionZone => {
        const filament = filaments[run.filamentIdx];
        const firstLayer = layers[run.startLayerIdx];
        const startHeight = firstLayer.startZ;
        const lastLayer = layers[run.endLayerIdx];
        const endHeight = lastLayer.startZ + lastLayer.thickness;
        const thickness = endHeight - startHeight;

        return {
            filamentId:      filament?.id    ?? `f${run.filamentIdx}`,
            filamentColor:   filament?.color ?? '#000000',
            filamentTd:      filament?.td    ?? 0,
            filamentTdChannels: typeof firstLayer.td === 'number'
                ? [firstLayer.td, firstLayer.td, firstLayer.td]
                : firstLayer.td,
            effectiveColor: firstLayer.filamentRgb,
            transmissionExponent: firstLayer.transmissionExponent,
            substrateHdMultiplier: firstLayer.substrateHdMultiplier,
            transitionOptics: firstLayer.transitionOptics,
            startHeight,
            endHeight,
            idealThickness:  thickness,
            actualThickness: thickness,
        };
    });
}
