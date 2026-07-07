// Shared settings type for multi-image tiles (issue #35) and single-image mode.
// See tmp_multi_modularization.plan.txt, Step 1: single-image mode is modeled as
// "one tile whose override is always empty" against a global TileSettings.
//
// Field placement follows the "Seems good"-approved UI proposal on issue #35:
// only panel 2 (Borders) is explicitly "per-tile overridable like everything
// else" (plus panel 6's per-tile skip/force-include override), so those are
// the only fields on TileSettings. Panels 1/3/4/5/7/8 (Split, Border fit,
// Labels, Colors, Outer border, Plate check) describe the whole assembled
// grid, not any one tile's content, so they live on the separate,
// non-inheritable GridSettings.
//
// Below, definitions are grouped by UI-proposal panel (1-8 in order), each
// panel's sub-settings in the sequence they're used, followed by the two
// aggregate containers (TileSettings, GridSettings) and resolveSettings.
import type { Adjustments } from '../lib/applyAdjustments';
import type { ThreeDControlsStateShape } from './index';

// Panel 1 (Split): explicit M x N, or a target tile size in mm/px (the other
// unit is always echoed back so the mapping stays visible).
export interface SplitSettings {
    rows?: number;
    columns?: number;
    tileSizeMm?: number;
    tileSizePx?: number;
    unit?: 'mm' | 'px';
}

// Panel 2 (Borders): Top/Left/Right/Bottom, each independently overridable
// per tile, distinct from the whole-assembly BorderSettings (panel 7) below.

// Where a border edge's height boundary falls, for sources that need one
// ('filament' always washes out layers below a height; 'layer-color' samples
// whatever color is already painted at a height instead of specifying one).
export type BorderColorHeight =
    | { mode: 'median' }
    | { mode: 'mm'; valueMm: number }
    | { mode: 'percent'; valuePercent: number };

// A discriminated union because each color source needs different follow-up
// params: a flat hex needs nothing else; a filament choice needs a height to
// paint up to plus how many layers below it to wash out; sampling the
// existing layer color needs only the height to sample at.
export type EdgeBorderColor =
    | {
        source: 'hex'; // hex always adds layers above the border, so no height param is needed.
        color: string // flat hex color, e.g. '#ff00ff' or '#f0f'
    }
    | {
        source: 'filament';
        filamentId: string; // filament ID to use for the border color, e.g. 'PLA:Black' or ''
        heightMm: number;
        // how many layers below the border to wash out (0 = none, 1 = one layer, etc.).
        // if washout layers is > 1, and height mm <  the height of the print, we'll display a warning that there will
        // need to be two swaps per layer for n layers while the border is being printed.
        washoutLayers: number
    }
    | { source: 'layer-color'; height: BorderColorHeight }; // simply use the color of the existing layer at this height, no new color is added.

export interface EdgeBorderSettings {
    thicknessMm: number; // thickness of the border in millimeters, can be 0 to disable the border on that edge.
    color?: EdgeBorderColor; // if not specified, defaults to black.
}

export interface TileBorderSettings {
    top?: EdgeBorderSettings;
    left?: EdgeBorderSettings;
    right?: EdgeBorderSettings;
    bottom?: EdgeBorderSettings;
}

// Panel 3 (Border fit): how adjacent tile edges key together physically.
// A discriminated union because each joint style has its own shape params
// (e.g. a T-pattern's joint thickness has no equivalent on a flush butt joint).
// Non-flush members are all required (no partial/inherit within a joint) —
// `fitShrink` is a percentage in [0, 99.99] shrinking the mating surfaces for
// print-fit clearance.
export type BorderFit =
    | { type: 'flush' }
    | {
          type: 't-pattern';
          jointThicknessMm: number; //total mm normal of the edge for the tab to fit into. The tabs will go in n/2 mm in, and n/2 mm out, so the total thickness is n mm.
          tabWidthMm: number; // width of a single tab that sticks out of the edge.
          repeat: boolean; // whether the tabs repeat along the edge or not. If true, the tabWidth will be repeated along the edge, with a gap in between each tab. If false, there will be a single tab in the middle of the edge.
          fitShrink: number; // percentage in [0, 99.99] shrinking the mating surfaces for print-fit clearance. typical value will be `nozzle_dia/image_width_mm * 100`.
      }
    | {
        type: 'sawtooth';
        toothWidthmm: number; // width of a single tooth that sticks out of the edge, tip to tip.
        toothDepthmm: number; // depth of a single tooth that sticks out of the edge, tip to base.
        fitShrink: number  // percentage in [0, 99.99] shrinking the mating surfaces for print-fit clearance. typical value will be `nozzle_dia/image_width_mm * 100`.
    }
    | {
          type: 'jigsaw';
          jointThicknessMm: number; // total mm normal of the edge for the tab to fit into. The tabs will go in n/2 mm in, and n/2 mm out, so the total thickness is n mm.
          tabWidthMm: number; // width of a single tab that sticks out of the edge, tip to tip.
          fitShrink: number; // percentage in [0, 99.99] shrinking the mating surfaces for print-fit clearance. typical value will be `nozzle_dia/image_width_mm * 100`.
      };

// Panel 4 (Labels): orientation/ordering marks, hidden once assembled.
// Position of the mark on the tile face, as a 3x3 grid of anchors.
export type LabelAlignment =
    | 'top-left'
    | 'top'
    | 'top-right'
    | 'left'
    | 'center'
    | 'right'
    | 'bottom-left'
    | 'bottom'
    | 'bottom-right';

// A discriminated union because 'none' carries no mark params, while every
// other style shares the same depth/size/placement shape.
export type LabelStyle =
    | { type: 'none' }
    | {
          type: 'orientation-arrow';
          depth: number; // how many mm the arrow is inset from the tile base.
          totalWidth: number; // how many mm the arrow is wide (tip-to-tip).
          alignment: LabelAlignment;
      }
    | {
          type: 'sequence-index';
          depth: number; // how many mm the number is inset from the tile base.
          totalWidth: number; // how many mm the number is wide (tip-to-tip).
          alignment: LabelAlignment;
      }
    | {
          type: 'row-column';
          depth: number; // how many mm the coordinates are inset from the tile base.
          totalWidth: number; // how many mm the coordinates are wide (tip-to-tip).
          alignment: LabelAlignment;
      };

// Panel 5 (Colors): 'global' quantizes one palette across the whole image so
// tiles reassemble seamlessly; 'local' lets each tile get its own best-fit
// palette (fewer filament swaps per plate, at the cost of seams).
export type ColorMode = 'global' | 'local';

export type QuantizeAlgorithm = 'posterize' | 'median-cut' | 'kmeans' | 'octree' | 'wu' | 'none';

export interface QuantizeSettings {
    algorithm?: QuantizeAlgorithm;
    weight?: number;
    finalColors?: number;
    selectedPalette?: string;
}

// Panel 6 (Skip tiles): background-only tiles below this content threshold
// are dropped from export by default (per-tile TileSettings.skip overrides this).
export interface SkipTilesSettings {
    enabled?: boolean;
    contentThresholdPercent?: number;
}

// Panel 7 ("Outer border"): outer-border/frame settings, usable from
// single-image mode too: "trace the outer edge of whatever geometry is
// given" (one model in single-image mode, the assembled grid in multi-image
// mode). [Issue #45] This is that same edge/frame tool. Shares
// EdgeBorderColor with panel 2 — same hex/filament/layer-color choice.
export interface BorderSettings {
    enabled?: boolean;
    color?: EdgeBorderColor;
    thicknessMm?: number;
    heightBehavior?: 'full' | 'fixed' | 'top-bottom';
    fixedHeightMm?: number;
}

// Panel 8 (Plate check): target plate size every tile (borders/joints
// included) is validated against before export. A discriminated union so
// 'none' (no check) can't carry dimensions, and 'validate' can't omit them.
export type PlateSizeSettings = { mode: 'none' } | { mode: 'validate'; widthMm: number; heightMm: number };

export interface TileSettings {
    /** Core (no panel): per-tile image adjustments. */
    adjustments?: Partial<Adjustments>;
    /** Core (no panel): per-tile 3D/print controls. */
    threeD?: Partial<ThreeDControlsStateShape>;
    /** Panel 2: per-edge borders against this tile's neighbors. */
    tileBorder?: TileBorderSettings;
    /** Panel 6: force-include/exclude this tile, overriding the grid's content threshold. */
    skip?: boolean;
}

/** Whole-assembly settings with no per-tile inherit concept — one value per grid space. */
export interface GridSettings {
    /** Panel 1. */
    split?: SplitSettings;
    /** Panel 3. */
    borderFit?: BorderFit;
    /** Panel 4. */
    labelStyle?: LabelStyle;
    /** Panel 5. */
    colorMode?: ColorMode;
    /** Panel 5. */
    quantize?: QuantizeSettings;
    /** Panel 6 (grid-level threshold; TileSettings.skip is the per-tile override). */
    skipTiles?: SkipTilesSettings;
    /** Panel 7. */
    outerBorder?: BorderSettings;
    /** Panel 8. */
    plateSize?: PlateSizeSettings;
}

/**
 * Naive stub merge: override wins per top-level key, override's absence
 * falls back to global. Real null/inherit semantics (deep per-field merge)
 * land later; this is intentionally shallow for Step 1's stub form.
 */
export function resolveSettings(
    global: TileSettings,
    override: Partial<TileSettings>
): TileSettings {
    return { ...global, ...override };
}
