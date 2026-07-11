/**
 * Convert a patched printer-layer stack (from ColorFirstResult.patchedLayers)
 * into a TransitionZone[] that the existing swap-plan and mesh-generation
 * pipeline can consume without further modification.
 *
 * The output has the same shape as AutoPaintResult.transitionZones, so any
 * code that already iterates transition zones works unchanged.
 */

import type { TransitionZone } from './autoPaint.ts';
import { rgbToHex, hexToRgb } from './autoPaint.ts';
import type { PrinterLayer } from './multiHeadAnalysis.ts';
import { buildColorStack } from './multiHeadAnalysis.ts';
import type { Filament } from '../types';
import { buildColorRuns } from './multiHeadAnalysisColorFirst.ts';

/** Frontlit TD scaling — must match the value used in the analysis pipeline. */
const FRONTLIT_TD_SCALE = 0.1;

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
 *
 * @returns Map keyed by image-colour hex → array (length = layers.length) of
 *          blended colour hex strings, one per printer layer.
 */
export function buildPerColorLayerColors(
    layers: PrinterLayer[],
    colorLayerFilaments: Map<string, number[]>,
    filaments: Filament[]
): Map<string, string[]> {
    const out = new Map<string, string[]>();
    if (layers.length === 0) return out;

    // Pre-resolve each palette filament's rgb + frontlit-scaled TD.
    const palette = filaments.map((f) => ({
        rgb: hexToRgb(f.color),
        td: f.td * FRONTLIT_TD_SCALE,
    }));

    for (const [hex, seq] of colorLayerFilaments) {
        // Build a per-colour printer-layer stack: same geometry as `layers`, but
        // each layer's filament comes from this colour's path.
        const colorLayers: PrinterLayer[] = layers.map((l, i) => {
            const p = palette[seq[i]] ?? { rgb: l.filamentRgb, td: l.td };
            return { ...l, filamentIdx: seq[i], filamentRgb: p.rgb, td: p.td };
        });
        const stack = buildColorStack(colorLayers);
        out.set(hex, stack.map(rgbToHex));
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

    return runs.map((run) => {
        const filament = filaments[run.filamentIdx];
        const startHeight = layers[run.startLayerIdx].startZ;
        const lastLayer = layers[run.endLayerIdx];
        const endHeight = lastLayer.startZ + lastLayer.thickness;
        const thickness = endHeight - startHeight;

        return {
            filamentId:      filament?.id    ?? `f${run.filamentIdx}`,
            filamentColor:   filament?.color ?? '#000000',
            filamentTd:      filament?.td    ?? 0,
            startHeight,
            endHeight,
            idealThickness:  thickness,
            actualThickness: thickness,
        };
    });
}
