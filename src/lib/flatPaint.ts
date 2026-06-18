/**
 * Flat Paint layout planning for Auto-paint face-down flat prints.
 *
 * A normal auto-paint model varies each pixel column's height: the stack is
 * built dark-to-light from the plate and the image is viewed from the stepped
 * top surface. Flat Paint instead produces a uniform-thickness slab that is
 * printed FACE DOWN:
 *
 * 1. Each pixel column's layer sequence is REVERSED so the final visible
 *    blend layer touches the build plate. Optically this is identical to the
 *    normal print viewed from above, because the filament order along the
 *    viewing axis is unchanged.
 * 2. A transparent carrier layer (printed first, in clear filament) absorbs
 *    the slicer's thick first layer so every image layer keeps its exact
 *    simulated thickness, and protects the image face.
 * 3. The space behind each column (above its reversed stack) is backfilled
 *    with the foundation filament so every printed layer has the exact same
 *    footprint — the defining Flat Paint property.
 *
 * Because a single printed layer now contains several filaments side by side,
 * Flat Paint prints require a multi-material setup (AMS/toolchanger). Parts are
 * therefore tagged with a per-filament export group so the 3MF exporter can
 * emit one object per physical filament.
 *
 * Coordinate conventions: the caller provides a per-pixel layer-count grid
 * already oriented for the 3D scene (Y flipped) and mirrored in X — mirroring
 * is required so the artwork reads correctly after the finished print is
 * flipped over.
 */

import { normalizeHexColor } from './colorUtils.ts';
import { LAYER_ACTIVATION_EPSILON } from './layerActivation.ts';

/** A solid axis-aligned slab of a single color in the flat stack */
export interface FlatPaintPart {
    kind: 'carrier' | 'face' | 'zone' | 'backing';
    /**
     * Pixel layer-count class this part belongs to (pixels whose columns
     * contain exactly `classIndex` layers). 0 for the carrier, which spans
     * every opaque pixel.
     */
    classIndex: number;
    /** Mask of active pixels (shared between parts of the same class) */
    mask: Uint8Array;
    activeCount: number;
    /** Z range of the slab in mm, measured from the build plate */
    baseZ: number;
    topZ: number;
    /** Color used for the preview mesh material */
    previewHex: string;
    /** Physical filament color used for export color mapping */
    filamentHex: string;
    /** 3MF object grouping key — one exported object per physical filament */
    exportGroup: string;
    /** Human-readable part name for slicer metadata */
    partName: string;
}

export interface FlatPaintLayout {
    parts: FlatPaintPart[];
    /**
     * Uniform slab height: carrier + tallest present column class ×
     * layerHeight. Trailing stack layers no pixel reaches are trimmed.
     */
    totalHeight: number;
    carrierThickness: number;
    /** Number of distinct pixel layer-count classes found in the image */
    classCount: number;
}

export interface FlatPaintLayoutOptions {
    /**
     * Per-pixel layer counts (0 = transparent pixel, otherwise 1..layerCount),
     * already oriented for the scene (Y flipped) and mirrored in X for
     * face-down printing.
     */
    layerCounts: Uint16Array | Uint8Array;
    width: number;
    height: number;
    /** Total number of layers in the auto-paint stack */
    layerCount: number;
    /** Uniform image layer thickness in mm */
    layerHeight: number;
    /** Thickness of the transparent carrier layer in mm */
    carrierThickness: number;
    /** Per-layer blended preview colors (virtual swatches), bottom-up order */
    layerVirtualHexes: string[];
    /** Per-layer physical filament colors, bottom-up order */
    layerFilamentHexes: string[];
}

export const FLAT_PAINT_CARRIER_GROUP = 'flat-paint:carrier';
export const FLAT_PAINT_CARRIER_HEX = '#D8FFF8';

/**
 * Convert a per-pixel target height map (mm) into per-pixel layer counts.
 *
 * A pixel's column contains layer `i` when its height reaches that layer's
 * cumulative top — the same `height >= top - epsilon` rule the normal
 * auto-paint mask build uses, so flat and normal geometry stay consistent.
 *
 * @param pixelHeightMap - Per-pixel target heights in mm (0 = transparent)
 * @param cumulativeHeights - Cumulative layer top heights, bottom-up
 * @param epsilon - Height comparison tolerance (default matches mask build)
 */
export function heightMapToLayerCounts(
    pixelHeightMap: Float32Array,
    cumulativeHeights: number[],
    epsilon: number = LAYER_ACTIVATION_EPSILON
): Uint16Array {
    const counts = new Uint16Array(pixelHeightMap.length);
    const layerCount = cumulativeHeights.length;
    if (layerCount === 0) return counts;

    for (let i = 0; i < pixelHeightMap.length; i++) {
        const h = pixelHeightMap[i];
        if (h <= 0) continue;

        // Binary search: number of cumulative tops <= h + epsilon
        let lo = 0;
        let hi = layerCount;
        const target = h + epsilon;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cumulativeHeights[mid] <= target) lo = mid + 1;
            else hi = mid;
        }
        counts[i] = Math.max(1, Math.min(layerCount, lo));
    }

    return counts;
}

/**
 * Convert normal auto-paint target heights into Flat Paint image-layer counts.
 *
 * Auto-paint heights are generated for a normal print where the first colored
 * layer may be the slicer's thicker first layer. Flat Paint moves that thick
 * first layer to the transparent carrier, so image colors are counted on
 * regular image-layer steps behind the carrier.
 */
export function heightMapToFlatPaintLayerCounts(
    pixelHeightMap: Float32Array,
    cumulativeHeights: number[],
    imageLayerHeight: number,
    epsilon: number = LAYER_ACTIVATION_EPSILON
): Uint16Array {
    if (cumulativeHeights.length === 0) return new Uint16Array(pixelHeightMap.length);
    if (imageLayerHeight <= 0) {
        return heightMapToLayerCounts(pixelHeightMap, cumulativeHeights, epsilon);
    }

    const normalFirstTop = cumulativeHeights[0] ?? imageLayerHeight;
    const firstLayerOffset = Math.max(0, normalFirstTop - imageLayerHeight);
    const flatCumulativeHeights = cumulativeHeights.map((_, index) =>
        Number(((index + 1) * imageLayerHeight).toFixed(8))
    );
    const adjustedHeightMap = new Float32Array(pixelHeightMap.length);

    for (let i = 0; i < pixelHeightMap.length; i++) {
        const h = pixelHeightMap[i];
        adjustedHeightMap[i] = h > 0 ? Math.max(0, h - firstLayerOffset) : 0;
    }

    return heightMapToLayerCounts(adjustedHeightMap, flatCumulativeHeights, epsilon);
}

/**
 * Plan the solid parts of a uniform face-down slab.
 *
 * Pixels are grouped into classes by their layer count `k`. Each class
 * produces (bottom-up, in printed orientation):
 *
 * - a FACE slab at the plate: the column's top layer (index k-1), colored
 *   with its blended virtual swatch — this is the visible artwork surface;
 * - ZONE slabs for the remaining reversed layers (k-2 down to 0), with
 *   consecutive layers of the same physical filament merged into one box;
 * - a BACKING slab from the end of the column to the slab top, in the
 *   foundation filament (layer 0), when the column is shorter than the stack.
 *
 * Every opaque pixel additionally receives the transparent CARRIER slab at
 * [0, carrierThickness]; all image slabs are shifted up by the carrier.
 */
export function buildFlatPaintLayout(options: FlatPaintLayoutOptions): FlatPaintLayout {
    const {
        layerCounts,
        width,
        height,
        layerCount,
        layerHeight,
        carrierThickness,
        layerVirtualHexes,
        layerFilamentHexes,
    } = options;

    const parts: FlatPaintPart[] = [];
    const pixelCount = width * height;

    if (layerCount <= 0 || layerHeight <= 0 || pixelCount === 0) {
        return {
            parts,
            totalHeight: Math.max(0, carrierThickness),
            carrierThickness,
            classCount: 0,
        };
    }

    // --- Gather per-class masks (and the opaque mask for the carrier) ---
    const classActiveCounts = new Uint32Array(layerCount + 1);
    let opaqueCount = 0;

    for (let i = 0; i < pixelCount; i++) {
        const k = layerCounts[i];
        if (k <= 0) continue;
        const clamped = Math.min(layerCount, k);
        classActiveCounts[clamped]++;
        opaqueCount++;
    }

    if (opaqueCount === 0) {
        return { parts, totalHeight: carrierThickness, carrierThickness, classCount: 0 };
    }

    // The auto-paint stack can end with layers no pixel actually reaches
    // (normal mode just skips their empty masks). Padding backing up to those
    // phantom layers would only waste height and filament, so size the slab
    // to the tallest column class that is actually present.
    let effectiveLayerCount = 0;
    for (let k = layerCount; k >= 1; k--) {
        if (classActiveCounts[k] > 0) {
            effectiveLayerCount = k;
            break;
        }
    }

    const totalHeight = carrierThickness + effectiveLayerCount * layerHeight;

    const opaqueMask = new Uint8Array(pixelCount);
    const classMasks = new Map<number, Uint8Array>();
    for (let k = 1; k <= layerCount; k++) {
        if (classActiveCounts[k] > 0) classMasks.set(k, new Uint8Array(pixelCount));
    }

    for (let i = 0; i < pixelCount; i++) {
        const k = layerCounts[i];
        if (k <= 0) continue;
        opaqueMask[i] = 1;
        classMasks.get(Math.min(layerCount, k))![i] = 1;
    }

    const levelBase = (level: number) => carrierThickness + level * layerHeight;
    const filamentHex = (layer: number) =>
        normalizeHexColor(
            layerFilamentHexes[layer],
            normalizeHexColor(layerVirtualHexes[layer], '#888888')
        );
    const virtualHex = (layer: number) =>
        normalizeHexColor(layerVirtualHexes[layer], filamentHex(layer));
    const filamentGroup = (hex: string) => `flat-paint:filament:${hex}`;
    const filamentPartName = (hex: string) => `Flat Paint filament (${hex})`;

    // --- Carrier slab: full opaque footprint at the plate ---
    parts.push({
        kind: 'carrier',
        classIndex: 0,
        mask: opaqueMask,
        activeCount: opaqueCount,
        baseZ: 0,
        topZ: carrierThickness,
        previewHex: FLAT_PAINT_CARRIER_HEX,
        filamentHex: FLAT_PAINT_CARRIER_HEX,
        exportGroup: FLAT_PAINT_CARRIER_GROUP,
        partName: 'Flat Paint transparent carrier (use clear filament)',
    });

    // --- Per-class slabs ---
    const foundationHex = filamentHex(0);

    for (const [k, mask] of classMasks) {
        const activeCount = classActiveCounts[k];

        // Face slab: printed level 0 = the column's top (visible) layer k-1.
        // Preview uses the blended virtual color so the face shows the artwork.
        parts.push({
            kind: 'face',
            classIndex: k,
            mask,
            activeCount,
            baseZ: levelBase(0),
            topZ: levelBase(1),
            previewHex: virtualHex(k - 1),
            filamentHex: filamentHex(k - 1),
            exportGroup: filamentGroup(filamentHex(k - 1)),
            partName: filamentPartName(filamentHex(k - 1)),
        });

        // Zone slabs: printed level j holds original layer k-1-j. Merge runs
        // of consecutive levels that use the same physical filament.
        let runStart = 1;
        while (runStart < k) {
            const runHex = filamentHex(k - 1 - runStart);
            let runEnd = runStart;
            while (runEnd + 1 < k && filamentHex(k - 1 - (runEnd + 1)) === runHex) {
                runEnd++;
            }

            parts.push({
                kind: 'zone',
                classIndex: k,
                mask,
                activeCount,
                baseZ: levelBase(runStart),
                topZ: levelBase(runEnd + 1),
                previewHex: runHex,
                filamentHex: runHex,
                exportGroup: filamentGroup(runHex),
                partName: filamentPartName(runHex),
            });

            runStart = runEnd + 1;
        }

        // Backing slab: fill behind the column up to the uniform slab top.
        if (k < effectiveLayerCount) {
            parts.push({
                kind: 'backing',
                classIndex: k,
                mask,
                activeCount,
                baseZ: levelBase(k),
                topZ: levelBase(effectiveLayerCount),
                previewHex: foundationHex,
                filamentHex: foundationHex,
                exportGroup: filamentGroup(foundationHex),
                partName: filamentPartName(foundationHex),
            });
        }
    }

    // Stable build order: bottom-up by baseZ, then by class for determinism.
    parts.sort((a, b) => a.baseZ - b.baseZ || a.classIndex - b.classIndex);

    return { parts, totalHeight, carrierThickness, classCount: classMasks.size };
}
