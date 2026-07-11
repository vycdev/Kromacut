import type { AutoPaintResult, TransitionZone } from '../lib/autoPaint';
import type { WindowResult } from '../lib/multiHeadAnalysis';
import type { PatchedSliceData } from '../lib/patchedLayersToPlan';
import type { FrontlitCalibration } from '../lib/calibration';

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
};

export interface CustomPalette {
    id: string;
    name: string;
    version: number;
    colors: string[];
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

/** Realized nozzle state for a non-windowed layer range (pre-window, gap, or post-window). */
export interface MultiHeadRangeAssignment {
    /** First layer index (0-indexed, inclusive). */
    rangeStart: number;
    /** Last layer index (0-indexed, inclusive). */
    rangeEnd: number;
    /**
     * Which filament is loaded on each head during this range (length = N heads).
     * nozzleFilaments[k] = filament ID for head k+1. '' = head is unused.
     */
    nozzleFilaments: string[];
}

export interface ThreeDControlsStateShape {
    layerHeight: number;
    slicerFirstLayerHeight: number;
    calibrationLayerHeight?: number;
    colorSliceHeights: number[];
    colorOrder: number[];
    filteredSwatches: Swatch[];
    pixelSize: number; // mm per pixel (XY)
    smoothMeshing?: boolean; // Smooth connected boundaries using welded grid topology
    filaments: Filament[];
    paintMode: 'manual' | 'autopaint';
    // Enhanced color matching options
    enhancedColorMatch?: boolean;
    /** Assign each image color to a distinct printable color (no collapse). */
    preserveSeparation?: boolean;
    /** Legacy persisted value. Migrate to maxRepeatedSwaps when loading. */
    allowRepeatedSwaps?: boolean;
    /** Maximum extra non-adjacent filament occurrences the optimizer may add. */
    maxRepeatedSwaps?: AutoPaintRepeatLimit;
    /** Target transition opacity used to create the printable color ramp. */
    transitionOpacity?: AutoPaintTransitionOpacity;
    heightDithering?: boolean;
    ditherLineWidth?: number;
    /** Flat Paint: build a flat, face-down slab (auto-paint only) */
    flatPaint?: boolean;
    // Optimizer options (effort tier; legacy values migrate on load)
    optimizerAlgorithm?: 'fast' | 'balanced' | 'thorough' | 'deep' | 'exact';
    optimizerSeed?: number;
    regionWeightingMode?: 'uniform' | 'center' | 'edge';
    // Multi-head mode (per-pixel layer order optimization)
    multiHeadMode?: boolean;
    multiHeadCount?: number; // any integer ≥ 2
    multiHeadSearchDepth?: 'fast' | 'balanced' | 'thorough';
    multiHeadWindows?: WindowResult[];
    /** Reordered transition zones derived from the multi-head patched layer stack. */
    patchedTransitionZones?: TransitionZone[];
    /** Slice data for ThreeDView mesh generation derived from the patched layer stack. */
    patchedSliceData?: PatchedSliceData;
    /**
     * Per image-colour blended colour per printer layer (keys = image palette hex).
     * Drives per-pixel filament mixing in the 3D render: a pixel of colour `hex`
     * shows perColorLayerColors.get(hex)[layerIdx] at each layer.
     */
    perColorLayerColors?: Map<string, string[]>;
    /**
     * Per image-colour filament index per printer layer (keys = image palette hex).
     * colorLayerFilaments.get(hex)[layerIdx] is the global filament-array index
     * that a pixel of colour `hex` uses at that layer.  Used with nozzleAssignments
     * to tag each sub-mesh with the physical nozzle that prints it.
     */
    colorLayerFilaments?: Map<string, number[]>;
    /**
     * Consensus filament ID per run slot per window.
     * windowRunFilaments[w][r] is the filament ID that run slot r carries in window w.
     */
    windowRunFilaments?: string[][];
    /**
     * Optimal nozzle-to-run-slot permutation per window.
     * nozzleAssignments[w][k] = run-slot index for nozzle (k+1) in window w.
     */
    nozzleAssignments?: number[][];
    /** Filament IDs used in non-windowed layers before the first window. */
    preWindowFilaments?: string[];
    /** Nozzle assignments for non-windowed layer ranges (pre-window, gaps, post-window). */
    nonWindowedRanges?: MultiHeadRangeAssignment[];
    // Auto-paint computed state (only used when paintMode is 'autopaint')
    autoPaintResult?: AutoPaintResult;
    autoPaintSwatches?: Swatch[];
    autoPaintFilamentSwatches?: Swatch[];
}
