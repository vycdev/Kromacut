import type { AutoPaintResult } from '../lib/autoPaint';
import type { FrontlitCalibration } from '../lib/calibration';
import type { TargetSampleContext } from './appearance';

export type {
    AppearanceGeometryClass,
    CanonicalSrgbColor,
    FinalPrintableStackSnapshot,
    FinalStackLayerSnapshot,
    FinalStackPaletteEntrySnapshot,
    FinalStackSwapSnapshot,
    FinalStackTargetMappingSnapshot,
    FinalStackZoneSnapshot,
    TargetSampleContext,
} from './appearance';

export const AUTO_PAINT_REPEAT_LIMITS = [0, 2, 4, 6, 8, 12] as const;
export type AutoPaintRepeatLimit = (typeof AUTO_PAINT_REPEAT_LIMITS)[number];

export const AUTO_PAINT_TRANSITION_OPACITIES = [0.8, 0.9, 0.95] as const;
export type AutoPaintTransitionOpacity = (typeof AUTO_PAINT_TRANSITION_OPACITIES)[number];

/** Visual inspection style for the 3D preview. Never changes the printable model. */
export type PreviewRenderMode = 'shaded' | 'transparent' | 'wireframe';

/**
 * Auto-paint 3D preview color source: the estimated blended appearance, or the
 * real physical filament colors stacked at each layer. Preview-only — never
 * changes STL/3MF export content.
 */
export type PreviewColorMode = 'simulated' | 'physical';

/**
 * 2D touch-up tool active in the preview toolbar. Every tool edits the
 * unadjusted source image and commits through the shared image history, so
 * undo/redo treats each stroke, fill, or text stamp as one edit.
 */
export type TouchUpTool = 'brush' | 'eraser' | 'fill' | 'text' | 'picker';

export type Swatch = {
    hex: string;
    a: number;
    /** Raw pixel count, kept for display and non-spatial consumers. */
    count?: number;
    /** Sum of center-priority weights for this color's source pixels. */
    centerWeight?: number;
    /** Sum of edge-priority weights for this color's source pixels. */
    edgeWeight?: number;
    /** Optional spatial transfer context for appearance-proof evidence. */
    sampleContext?: TargetSampleContext;
};

export interface CustomPalette {
    id: string;
    name: string;
    version: number;
    colors: string[];
    /** Indices into `colors` excluded from quantization. Absent = all enabled. */
    disabledColors?: number[];
    /**
     * Optional display names parallel to `colors` (e.g. "Pumpkin Orange");
     * empty string = unnamed. Absent = no names.
     */
    colorNames?: string[];
    createdAt: number;
    updatedAt: number;
}

export interface Filament {
    id: string;
    color: string;
    td: number;
    calibration?: FrontlitCalibration;
    name?: string;
    brand?: string;
}

export interface ThreeDControlsStateShape {
    layerHeight: number;
    slicerFirstLayerHeight: number;
    calibrationLayerHeight?: number;
    colorSliceHeights: number[];
    colorOrder: number[];
    filteredSwatches: Swatch[];
    pixelSize: number; // mm per pixel (XY)
    smoothMeshing?: boolean; // boundary-chain smoothed grid meshing
    filaments: Filament[];
    paintMode: 'manual' | 'autopaint';
    // Enhanced color matching options
    enhancedColorMatch?: boolean;
    /** Assign each image color to a distinct printable color (no collapse). */
    preserveSeparation?: boolean;
    /** Maximum accepted ΔE00 for each separated printable color (1–100). */
    separationMaxDeltaE?: number;
    /** Reject the build when any color cannot be separated within the threshold. */
    failOnSeparationError?: boolean;
    /** Legacy persisted value. Migrate to maxRepeatedSwaps when loading. */
    allowRepeatedSwaps?: boolean;
    /** Maximum extra non-adjacent filament occurrences the optimizer may add. */
    maxRepeatedSwaps?: AutoPaintRepeatLimit;
    /** Target transition opacity used to create the printable color ramp. */
    transitionOpacity?: AutoPaintTransitionOpacity;
    heightDithering?: boolean;
    ditherLineWidth?: number;
    /** Flat Paint: build a uniform multi-material slab (auto-paint only). */
    flatPaint?: boolean;
    /** Print Flat Paint face-up without the transparent carrier layer. */
    flatPaintFaceUp?: boolean;
    // Optimizer options (effort tier; legacy values migrate on load)
    optimizerAlgorithm?: 'fast' | 'balanced' | 'thorough' | 'deep' | 'exact';
    optimizerSeed?: number;
    regionWeightingMode?: 'uniform' | 'center' | 'edge';
    // Auto-paint computed state (only used when paintMode is 'autopaint')
    autoPaintResult?: AutoPaintResult;
    autoPaintSwatches?: Swatch[];
    autoPaintFilamentSwatches?: Swatch[];
}
