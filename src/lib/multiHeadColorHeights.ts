import type { FinalPrintableStackSnapshot } from '../types/appearance.ts';
import type { MultiHeadDitherContext } from '../types/index.ts';
import { quantizeHeightMap } from './heightDithering.ts';
import { LAYER_ACTIVATION_EPSILON } from './layerActivation.ts';
import {
    createFinalStackTargetHeightCache,
    hexToRgb,
    mapTargetsToPrintablePalette,
    rgbToLab,
    type AchievableColor,
} from './autoPaint.ts';

/** Keep zero-weight colors on the same printable surfaces used by analysis. */
export function createMultiHeadTargetHeightCache(
    stack: FinalPrintableStackSnapshot,
    colors: Iterable<string>,
    minimumHeight: number,
    maximumHeight: number,
    dithering?: { layerHeight: number }
): Map<number, number> {
    const cache = createFinalStackTargetHeightCache(
        stack.targetMappings,
        minimumHeight,
        maximumHeight,
        dithering ? { palette: stack.palette, layerHeight: dithering.layerHeight } : undefined
    );
    let palette: AchievableColor[] | undefined;
    for (const hex of colors) {
        const key = parseInt(hex.replace('#', ''), 16);
        if (cache.has(key)) continue;
        // Regional weighting can omit a printable color from targetMappings.
        // Match buildPixelData's single-target fallback, including eligibility,
        // confidence, and calibrated anchors; keep existing target mappings.
        palette ??= stack.palette.map((entry) => ({
            height: entry.height,
            rgb: {
                r: entry.predictedColor.rgb[0],
                g: entry.predictedColor.rgb[1],
                b: entry.predictedColor.rgb[2],
            },
            lab: { L: entry.predictedLab[0], a: entry.predictedLab[1], b: entry.predictedLab[2] },
            surfaceEligible: entry.surfaceEligible,
            predictionConfidence: entry.predictionConfidence,
            exactAnchorId: entry.exactAnchorId,
            exactAnchorTargetLab: entry.exactAnchorTargetLab
                ? {
                      L: entry.exactAnchorTargetLab[0],
                      a: entry.exactAnchorTargetLab[1],
                      b: entry.exactAnchorTargetLab[2],
                  }
                : undefined,
        }));
        const mapped = mapTargetsToPrintablePalette(palette, [
            { ...rgbToLab(hexToRgb(hex)), weight: 1 },
        ])[0];
        if (mapped) {
            cache.set(
                key,
                Math.max(minimumHeight, Math.min(maximumHeight, mapped.projectedHeight))
            );
        }
    }
    return cache;
}

/** Highest physical layer each color can reach; path suffixes above it never print. */
export function multiHeadColorTopLayers(
    stack: FinalPrintableStackSnapshot,
    colors: Iterable<string>,
    layerTops: number[],
    ditheringLayerHeight?: number,
    ditherContext?: MultiHeadDitherContext
): Map<string, number> {
    const hexes = [...colors];
    const minimumHeight =
        stack.palette.find((entry) => entry.surfaceEligible !== false)?.height ?? layerTops[0];
    const heights = createMultiHeadTargetHeightCache(
        stack,
        hexes,
        minimumHeight,
        layerTops[layerTops.length - 1],
        ditheringLayerHeight ? { layerHeight: ditheringLayerHeight } : undefined
    );
    if (ditheringLayerHeight && ditherContext) {
        return ditheredColorTopLayers(
            hexes,
            heights,
            layerTops,
            minimumHeight,
            ditheringLayerHeight,
            ditherContext
        );
    }
    const topLayers = new Map(
        hexes.map((hex) => {
            const height = heights.get(parseInt(hex.replace('#', ''), 16));
            // Diffusion can occupy the upper neighbor of a fractional target. The
            // first surface at/above it also matches analysis's ordinary home layer.
            const top = height === undefined ? -1 : layerTops.findIndex((z) => z + 1e-8 >= height);
            return [hex, top];
        })
    );
    if (ditheringLayerHeight) {
        const fractionalColors: string[] = [];
        let highestFractionalLayer = -1;
        for (const hex of hexes) {
            const height = heights.get(parseInt(hex.replace('#', ''), 16));
            if (height === undefined) continue;
            // Match the quantizer's Float32 input, grid snap, and exact-match
            // protection. An exact pixel prevents its whole block from dithering.
            const input = Math.fround(height);
            const snapped = Math.fround(
                Math.max(
                    minimumHeight,
                    Math.min(
                        layerTops[layerTops.length - 1],
                        layerTops[0] +
                            Math.round(Math.max(0, input - layerTops[0]) / ditheringLayerHeight) *
                                ditheringLayerHeight
                    )
                )
            );
            if (Math.abs(input - snapped) <= 1e-6) continue;
            fractionalColors.push(hex);
            highestFractionalLayer = Math.max(highestFractionalLayer, topLayers.get(hex)!);
        }
        // Without the image's block layout, bound every fractional color by the
        // highest fractional target's upper surface. A shared block can lift a
        // color above its own adjacent pair; transparent gaps can even let distant
        // surface heights share a block without triggering edge protection.
        for (const hex of fractionalColors) topLayers.set(hex, highestFractionalLayer);
    }
    return topLayers;
}

/** Resolve the same alpha crop, Float32 targets, and block grid used by ThreeDView. */
function ditheredColorTopLayers(
    colors: string[],
    heights: Map<number, number>,
    layerTops: number[],
    minimumHeight: number,
    layerHeight: number,
    { pixels: { width, height, data }, pixelSize, ditherLineWidth }: MultiHeadDitherContext
): Map<string, number> {
    if (
        !Number.isInteger(width) ||
        width <= 0 ||
        !Number.isInteger(height) ||
        height <= 0 ||
        data.length !== width * height * 4 ||
        !Number.isFinite(pixelSize) ||
        !(pixelSize > 0) ||
        !Number.isFinite(ditherLineWidth) ||
        !(ditherLineWidth > 0)
    ) {
        throw new Error('Invalid multi-head dither pixels or block settings');
    }
    let minX = width,
        minY = height,
        maxX = -1,
        maxY = -1;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            if (!data[(y * width + x) * 4 + 3]) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    const tops = new Map(colors.map((hex) => [hex, -1]));
    if (maxX < minX || maxY < minY) return tops;
    const boxWidth = maxX - minX + 1,
        boxHeight = maxY - minY + 1;
    const pixelHeights = new Float32Array(boxWidth * boxHeight);
    const hexByKey = new Map(colors.map((hex) => [parseInt(hex.replace('#', ''), 16), hex]));
    for (let y = 0; y < boxHeight; y++)
        for (let x = 0; x < boxWidth; x++) {
            const source = ((minY + y) * width + minX + x) * 4;
            if (!data[source + 3]) continue;
            const key = (data[source] << 16) | (data[source + 1] << 8) | data[source + 2];
            const target = heights.get(key);
            if (target === undefined || !hexByKey.has(key))
                throw new Error('Missing multi-head dither color');
            pixelHeights[y * boxWidth + x] = target;
        }
    quantizeHeightMap(pixelHeights, boxWidth, boxHeight, {
        layerHeight,
        slicerFirstLayerHeight: layerTops[0],
        minModelH: minimumHeight,
        maxModelH: layerTops[layerTops.length - 1],
        heightDithering: true,
        ditherLineWidth,
        pixelSize,
    });
    const topAtHeight = new Map<number, number>();
    for (let y = 0; y < boxHeight; y++)
        for (let x = 0; x < boxWidth; x++) {
            const source = ((minY + y) * width + minX + x) * 4;
            if (!data[source + 3]) continue;
            const printedHeight = pixelHeights[y * boxWidth + x];
            let top = topAtHeight.get(printedHeight);
            if (top === undefined) {
                // Match generateMultiHeadMeshes' layer activation tolerance.
                let low = 0,
                    high = layerTops.length;
                while (low < high) {
                    const mid = (low + high) >>> 1;
                    if (layerTops[mid] <= printedHeight + LAYER_ACTIVATION_EPSILON) low = mid + 1;
                    else high = mid;
                }
                top = low - 1;
                topAtHeight.set(printedHeight, top);
            }
            const key = (data[source] << 16) | (data[source + 1] << 8) | data[source + 2];
            const hex = hexByKey.get(key)!;
            tops.set(hex, Math.max(tops.get(hex)!, top));
        }
    return tops;
}
