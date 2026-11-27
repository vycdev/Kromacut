/**
 * Flat Paint layout planning for Auto-paint uniform slabs.
 *
 * A normal auto-paint model varies each pixel column's height: the stack is
 * built dark-to-light from the plate and the image is viewed from the stepped
 * top surface. Flat Paint instead produces a uniform-thickness slab. The
 * original face-down layout:
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
 * The optional face-up layout removes the carrier, keeps every color stack in
 * its normal order, and moves foundation backing below shorter columns so all
 * visible blend layers meet at the flat top surface.
 *
 * Because a single printed layer now contains several filaments side by side,
 * Flat Paint prints require a multi-material setup (AMS/toolchanger). Parts are
 * therefore tagged with a per-filament export group so the 3MF exporter can
 * emit one object per physical filament.
 *
 * Coordinate conventions: the caller provides a per-pixel layer-count grid
 * already oriented for the 3D scene. Face-down grids are mirrored in X;
 * face-up grids are not.
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
     * Uniform slab height. Trailing stack layers no pixel reaches are trimmed.
     */
    totalHeight: number;
    carrierThickness: number;
    /** Number of distinct pixel layer-count classes found in the image */
    classCount: number;
}

export type FlatPaintOrientation = 'face-down' | 'face-up';

export interface FlatPaintLayoutOptions {
    /**
     * Per-pixel layer counts (0 = transparent pixel, otherwise 1..layerCount),
     * already oriented for the selected print direction.
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
    /** Face-down with a clear carrier (default), or exposed face-up. */
    orientation?: FlatPaintOrientation;
    /** Physical thickness of printed level zero in face-up mode. */
    firstLayerThickness?: number;
    /** Per-layer blended preview colors (virtual swatches), bottom-up order */
    layerVirtualHexes: string[];
    /** Per-layer physical filament colors, bottom-up order */
    layerFilamentHexes: string[];
}

export const FLAT_PAINT_CARRIER_GROUP = 'flat-paint:carrier';
export const FLAT_PAINT_CARRIER_HEX = '#D8FFF8';

/**
 * Orient a source-image layer-count grid for the 3D scene. Scene Y is always
 * flipped. Face-down printing additionally mirrors X so the artwork reads
 * correctly after the finished print is flipped over.
 */
export function orientFlatPaintLayerCounts(
    layerCounts: Uint16Array | Uint8Array,
    width: number,
    height: number,
    orientation: FlatPaintOrientation
): Uint16Array {
    const oriented = new Uint16Array(width * height);
    for (let y = 0; y < height; y++) {
        const srcRow = y * width;
        const dstRow = (height - 1 - y) * width;
        for (let x = 0; x < width; x++) {
            const dstX = orientation === 'face-down' ? width - 1 - x : x;
            oriented[dstRow + dstX] = layerCounts[srcRow + x] ?? 0;
        }
    }
    return oriented;
}

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

/** Face-down and face-up Flat Paint slabs, or a stepped relief that keeps each column's own height. */
export type StackLayoutOrientation = FlatPaintOrientation | 'relief';

/** Pixels that print the same bottom-up filament stack. */
export interface StackLayoutClass {
    classIndex: number;
    mask: Uint8Array;
    activeCount: number;
    /** Physical filament color of each stack layer, bottom-up. */
    layerFilamentHexes: readonly string[];
    /**
     * Identity of each layer's physical filament, bottom-up, when two
     * filaments can share a color. Defaults to the color itself.
     */
    layerFilamentKeys?: readonly string[];
    /** Preview color of the visible top layer. */
    faceHex: string;
}

export interface StackLayoutOptions {
    classes: readonly StackLayoutClass[];
    /** Pixels in the grid; class masks all have this length. */
    pixelCount: number;
    /**
     * Every opaque pixel, for the face-down carrier. Callers build it in
     * their own pixel pass; it is derived from the class masks otherwise.
     */
    opaque?: { mask: Uint8Array; count: number };
    layerHeight: number;
    carrierThickness: number;
    orientation: StackLayoutOrientation;
    /** Physical thickness of printed level zero, except under a face-down carrier. */
    firstLayerThickness?: number;
    /** Filament that backs shorter columns in a uniform slab. */
    foundationHex: string;
    /** Identity of the foundation filament; defaults to its color. */
    foundationKey?: string;
    /** 3MF object grouping key for a physical filament, from its identity. */
    filamentGroup?: (key: string) => string;
    /** Slicer part name for a physical filament, from its color and identity. */
    filamentPartName?: (hex: string, key: string) => string;
}

const flatPaintFilamentGroup = (hex: string) => `flat-paint:filament:${hex}`;
const flatPaintFilamentPartName = (hex: string) => `Flat Paint filament (${hex})`;

/**
 * Plan the solid parts of a uniform Flat Paint slab.
 *
 * Pixels are grouped into classes by their layer count `k`, and each class
 * prints the first k layers of the shared Auto-paint stack. See
 * buildStackLayout for the parts each class produces.
 */
export function buildFlatPaintLayout(options: FlatPaintLayoutOptions): FlatPaintLayout {
    const {
        layerCounts,
        width,
        height,
        layerCount,
        layerHeight,
        carrierThickness,
        orientation = 'face-down',
        firstLayerThickness = layerHeight,
        layerVirtualHexes,
        layerFilamentHexes,
    } = options;

    const pixelCount = width * height;
    const empty = (): FlatPaintLayout => {
        const carrier = orientation === 'face-down' ? Math.max(0, carrierThickness) : 0;
        return { parts: [], totalHeight: carrier, carrierThickness: carrier, classCount: 0 };
    };
    if (layerCount <= 0 || layerHeight <= 0 || pixelCount === 0) return empty();

    const classActiveCounts = new Uint32Array(layerCount + 1);
    for (let i = 0; i < pixelCount; i++) {
        const k = layerCounts[i];
        if (k > 0) classActiveCounts[Math.min(layerCount, k)]++;
    }

    const classMasks = new Map<number, Uint8Array>();
    for (let k = 1; k <= layerCount; k++) {
        if (classActiveCounts[k] > 0) classMasks.set(k, new Uint8Array(pixelCount));
    }
    if (classMasks.size === 0) return empty();
    const opaqueMask = new Uint8Array(pixelCount);
    let opaqueCount = 0;
    for (let i = 0; i < pixelCount; i++) {
        const k = layerCounts[i];
        if (k <= 0) continue;
        classMasks.get(Math.min(layerCount, k))![i] = 1;
        opaqueMask[i] = 1;
        opaqueCount++;
    }

    const filamentHex = (layer: number) =>
        normalizeHexColor(
            layerFilamentHexes[layer],
            normalizeHexColor(layerVirtualHexes[layer], '#888888')
        );
    const virtualHex = (layer: number) =>
        normalizeHexColor(layerVirtualHexes[layer], filamentHex(layer));
    const stackHexes = Array.from({ length: layerCount }, (_, layer) => filamentHex(layer));

    return buildStackLayout({
        classes: [...classMasks].map(([k, mask]) => ({
            classIndex: k,
            mask,
            activeCount: classActiveCounts[k],
            layerFilamentHexes: stackHexes.slice(0, k),
            faceHex: virtualHex(k - 1),
        })),
        pixelCount,
        opaque: { mask: opaqueMask, count: opaqueCount },
        layerHeight,
        carrierThickness,
        orientation,
        firstLayerThickness,
        foundationHex: stackHexes[0],
    });
}

/**
 * Plan the solid parts for classes of pixels that each print their own
 * filament stack. Each class produces (bottom-up, in printed orientation):
 *
 * Face-down (uniform slab under a clear carrier):
 * - a FACE slab right above the carrier: the stack's top layer, colored with
 *   its blended preview color — this is the visible artwork surface;
 * - ZONE slabs for the remaining layers in reverse order, with consecutive
 *   layers of the same physical filament merged into one box;
 * - a BACKING slab of foundation up to the slab top when the stack is shorter
 *   than the tallest one.
 *
 * Face-up (uniform slab, artwork on top): BACKING below shorter stacks, then
 * ZONE runs in normal order, then the FACE on the top layer.
 *
 * Relief: ZONE runs in normal order from the plate and the FACE on the
 * stack's own top layer, so columns end at different heights.
 *
 * In face-down mode every opaque pixel also receives the transparent CARRIER
 * slab at [0, carrierThickness].
 */
export function buildStackLayout(options: StackLayoutOptions): FlatPaintLayout {
    const {
        classes,
        pixelCount,
        layerHeight,
        carrierThickness,
        orientation,
        firstLayerThickness = layerHeight,
        foundationHex,
        foundationKey = foundationHex,
        filamentGroup = flatPaintFilamentGroup,
        filamentPartName = flatPaintFilamentPartName,
    } = options;
    const foundation = { hex: foundationHex, key: foundationKey };

    const parts: FlatPaintPart[] = [];
    const effectiveCarrierThickness =
        orientation === 'face-down' ? Math.max(0, carrierThickness) : 0;
    const effectiveFirstLayerThickness = Math.max(layerHeight, firstLayerThickness);
    const present = classes.filter(
        (entry) => entry.activeCount > 0 && entry.layerFilamentHexes.length > 0
    );

    if (layerHeight <= 0 || pixelCount === 0 || present.length === 0) {
        return {
            parts,
            totalHeight: effectiveCarrierThickness,
            carrierThickness: effectiveCarrierThickness,
            classCount: 0,
        };
    }

    // Size the slab to the tallest stack actually present.
    const effectiveLayerCount = Math.max(
        ...present.map((entry) => entry.layerFilamentHexes.length)
    );

    const levelBase = (level: number) => {
        if (orientation === 'face-down') {
            return effectiveCarrierThickness + level * layerHeight;
        }
        if (level <= 0) return 0;
        return effectiveFirstLayerThickness + (level - 1) * layerHeight;
    };
    const totalHeight = levelBase(effectiveLayerCount);

    const part = (
        kind: FlatPaintPart['kind'],
        entry: StackLayoutClass,
        baseZ: number,
        topZ: number,
        filament: { hex: string; key: string },
        previewHex = filament.hex
    ): FlatPaintPart => ({
        kind,
        classIndex: entry.classIndex,
        mask: entry.mask,
        activeCount: entry.activeCount,
        baseZ,
        topZ,
        previewHex,
        filamentHex: filament.hex,
        exportGroup: filamentGroup(filament.key),
        partName: filamentPartName(filament.hex, filament.key),
    });

    /** Runs of the same physical filament within stack layers [from, to), bottom-up. */
    const runs = (entry: StackLayoutClass, from: number, to: number) => {
        const result: Array<{ start: number; end: number; hex: string; key: string }> = [];
        for (let layer = from; layer < to; layer++) {
            const hex = entry.layerFilamentHexes[layer];
            const key = entry.layerFilamentKeys?.[layer] ?? hex;
            const last = result.at(-1);
            if (last?.key === key) last.end = layer;
            else result.push({ start: layer, end: layer, hex, key });
        }
        return result;
    };

    // --- Carrier slab: face-down only, full opaque footprint at the plate ---
    if (orientation === 'face-down' && effectiveCarrierThickness > 0) {
        let opaque = options.opaque;
        if (!opaque) {
            const mask = new Uint8Array(pixelCount);
            for (const entry of present) {
                for (let i = 0; i < pixelCount; i++) mask[i] |= entry.mask[i];
            }
            opaque = { mask, count: mask.reduce((sum, value) => sum + value, 0) };
        }
        parts.push({
            kind: 'carrier',
            classIndex: 0,
            mask: opaque.mask,
            activeCount: opaque.count,
            baseZ: 0,
            topZ: effectiveCarrierThickness,
            previewHex: FLAT_PAINT_CARRIER_HEX,
            filamentHex: FLAT_PAINT_CARRIER_HEX,
            exportGroup: FLAT_PAINT_CARRIER_GROUP,
            partName: 'Flat Paint transparent carrier (use clear filament)',
        });
    }

    // --- Per-class slabs ---
    for (const entry of present) {
        const k = entry.layerFilamentHexes.length;
        const top = {
            hex: entry.layerFilamentHexes[k - 1],
            key: entry.layerFilamentKeys?.[k - 1] ?? entry.layerFilamentHexes[k - 1],
        };

        if (orientation === 'face-down') {
            // Printed level j holds stack layer k-1-j: the face first, then
            // the rest of the column reversed, then foundation behind it.
            parts.push(part('face', entry, levelBase(0), levelBase(1), top, entry.faceHex));
            for (const run of runs(entry, 0, k - 1).reverse()) {
                parts.push(
                    part('zone', entry, levelBase(k - 1 - run.end), levelBase(k - run.start), run)
                );
            }
            if (k < effectiveLayerCount) {
                parts.push(
                    part('backing', entry, levelBase(k), levelBase(effectiveLayerCount), foundation)
                );
            }
            continue;
        }

        // Face-up lifts shorter stacks onto foundation so every face meets the
        // flat top surface. Relief keeps each stack on the plate.
        const start = orientation === 'face-up' ? effectiveLayerCount - k : 0;
        if (start > 0) {
            parts.push(part('backing', entry, 0, levelBase(start), foundation));
        }
        for (const run of runs(entry, 0, k - 1)) {
            parts.push(
                part(
                    'zone',
                    entry,
                    levelBase(start + run.start),
                    levelBase(start + run.end + 1),
                    run
                )
            );
        }
        parts.push(
            part('face', entry, levelBase(start + k - 1), levelBase(start + k), top, entry.faceHex)
        );
    }

    // Stable build order: bottom-up by baseZ, then by class for determinism.
    parts.sort((a, b) => a.baseZ - b.baseZ || a.classIndex - b.classIndex);

    return {
        parts,
        totalHeight,
        carrierThickness: effectiveCarrierThickness,
        classCount: present.length,
    };
}

/**
 * Solid parts to export for a slab layout: one slab per physical filament and
 * run of heights where that filament fills the same pixels.
 *
 * Layout parts are per class, so each class can carry its own preview color.
 * Neighboring classes that print the same filament at the same height would
 * still export as separate shells that touch, and slicers trace a perimeter
 * along every such seam. The merged slabs fill exactly the same pixels with
 * the same filament at every height, and only meet other filaments.
 */
export function mergeLayoutPartsByFilament(
    parts: readonly FlatPaintPart[],
    pixelCount: number
): FlatPaintPart[] {
    const active = parts.filter((part) => part.activeCount > 0 && part.topZ > part.baseZ);
    const heights = [...new Set(active.flatMap((part) => [part.baseZ, part.topZ]))].sort(
        (a, b) => a - b
    );

    // Class masks are disjoint, so one owner per pixel builds any union in one
    // pass. The carrier (class 0) spans every class but is alone in its group.
    const maskIds = new Map<Uint8Array, number>();
    const classMasks = new Set<Uint8Array>();
    for (const part of active) {
        if (!maskIds.has(part.mask)) maskIds.set(part.mask, maskIds.size);
        if (part.classIndex > 0) classMasks.add(part.mask);
    }
    const masks = [...maskIds.keys()];
    const owner = new Int32Array(pixelCount).fill(-1);
    let disjoint = true;
    for (const mask of classMasks) {
        const id = maskIds.get(mask)!;
        for (let i = 0; i < pixelCount && disjoint; i++) {
            if (!mask[i]) continue;
            if (owner[i] !== -1) disjoint = false;
            else owner[i] = id;
        }
    }
    const unionMask = (ids: number[]) => {
        // One class keeps its own mask and count.
        if (ids.length === 1) return { mask: masks[ids[0]], count: undefined };
        const mask = new Uint8Array(pixelCount);
        let count = 0;
        if (disjoint && ids.every((id) => classMasks.has(masks[id]))) {
            const included = new Uint8Array(masks.length);
            for (const id of ids) included[id] = 1;
            for (let i = 0; i < pixelCount; i++) {
                if (owner[i] >= 0 && included[owner[i]]) {
                    mask[i] = 1;
                    count++;
                }
            }
        } else {
            for (const id of ids) {
                const source = masks[id];
                for (let i = 0; i < pixelCount; i++) mask[i] |= source[i];
            }
            for (let i = 0; i < pixelCount; i++) count += mask[i];
        }
        return { mask, count };
    };

    const groups = new Map<string, FlatPaintPart[]>();
    for (const part of active) {
        const group = groups.get(part.exportGroup) ?? [];
        group.push(part);
        groups.set(part.exportGroup, group);
    }

    const merged: FlatPaintPart[] = [];
    for (const [exportGroup, members] of groups) {
        let open: { ids: number[]; key: string; baseZ: number; topZ: number } | undefined;
        const close = () => {
            if (!open) return;
            const sources = members.filter(
                (part) =>
                    part.baseZ < open!.topZ &&
                    part.topZ > open!.baseZ &&
                    open!.ids.includes(maskIds.get(part.mask)!)
            );
            const { mask, count } = unionMask(open.ids);
            const kinds = new Set(sources.map((part) => part.kind));
            merged.push({
                kind: kinds.size === 1 ? sources[0].kind : 'zone',
                classIndex: Math.min(...sources.map((part) => part.classIndex)),
                mask,
                activeCount: count ?? sources[0].activeCount,
                baseZ: open.baseZ,
                topZ: open.topZ,
                previewHex: sources[0].filamentHex,
                filamentHex: sources[0].filamentHex,
                exportGroup,
                partName: sources[0].partName,
            });
            open = undefined;
        };
        for (let band = 0; band + 1 < heights.length; band++) {
            const baseZ = heights[band];
            const topZ = heights[band + 1];
            const ids = [
                ...new Set(
                    members
                        .filter((part) => part.baseZ <= baseZ && part.topZ >= topZ)
                        .map((part) => maskIds.get(part.mask)!)
                ),
            ].sort((a, b) => a - b);
            const key = ids.join(',');
            if (open && open.key === key && open.topZ === baseZ) {
                open.topZ = topZ;
                continue;
            }
            close();
            if (ids.length > 0) open = { ids, key, baseZ, topZ };
        }
        close();
    }

    // Groups stay in first-appearance order: the 3MF exporter numbers
    // filaments in the order it meets them.
    return merged;
}
