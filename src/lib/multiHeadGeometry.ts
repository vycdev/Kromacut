import * as THREE from 'three';
import type { MultiHeadRoutingPlan, SmoothMeshingStrength } from '../types/index.ts';
import type { FinalPrintableStackSnapshot } from '../types/appearance.ts';
import type { MeshData, MeshProgress, MeshYieldOptions } from './meshing.ts';
import {
    createFinalStackTargetHeightCache,
    hexToRgb,
    mapTargetsToPrintablePalette,
    rgbToLab,
    type AchievableColor,
} from './autoPaint.ts';
import { createFlatPaintMesher } from './flatPaintMeshing.ts';
import { LAYER_ACTIVATION_EPSILON } from './layerActivation.ts';
import { resolveNozzleIndex } from './multiHeadBuild.ts';
import { translate } from './i18n.ts';

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

interface MultiHeadGeometryOptions extends MeshYieldOptions {
    plan: MultiHeadRoutingPlan;
    data: Uint8ClampedArray;
    imageWidth: number;
    minX: number;
    minY: number;
    width: number;
    height: number;
    /** Crop-local image rows, before flipping Y for Three.js. */
    pixelHeights: Float32Array;
    pixelSize: number;
    heightScale: number;
    strength: SmoothMeshingStrength;
    isCurrent?: () => boolean;
    onLayerProgress?: (layer: number, progress: MeshProgress) => void;
}

interface ColorRegion {
    hex: string;
    topLayer: number;
    pixels: number[];
    geometry?: MeshData;
}

export interface MultiHeadMeshPart {
    mesh: THREE.Mesh;
    layerIndex: number;
    activePixelCount: number;
    metrics?: MeshData['metrics'];
}

/**
 * Partition the image into stable color/height footprints, and extrude each on
 * every occupied printer layer using that color's actual filament path. One XY
 * tessellation is shared by ALL regions and layers, including diagonal repairs,
 * so both smoothed and grid-aligned material boundaries remain joined.
 */
export async function* generateMultiHeadMeshes(
    options: MultiHeadGeometryOptions
): AsyncGenerator<MultiHeadMeshPart> {
    const {
        plan,
        data,
        imageWidth,
        minX,
        minY,
        width,
        height,
        pixelHeights,
        pixelSize,
        heightScale,
        strength,
    } = options;
    const onYield =
        options.onYield ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    const isCurrent = options.isCurrent ?? (() => true);
    let lastYield = performance.now();
    const maybeYield = async () => {
        if (performance.now() - lastYield < (options.yieldIntervalMs ?? 8)) return;
        await onYield();
        lastYield = performance.now();
    };
    const invalidPlan = () => new Error(translate('printing:multiHead.invalidPlan'));
    const heights: number[] = [];
    let top = 0;
    for (const index of plan.patchedSliceData.colorOrder) {
        top += plan.patchedSliceData.colorSliceHeights[index];
        heights.push(top);
    }
    const palette = new Map<number, string>();
    for (const hex of plan.colorLayerFilaments.keys()) {
        palette.set(parseInt(hex.replace('#', ''), 16), hex);
    }
    const labels = new Uint32Array(width * height);
    const regions: ColorRegion[] = [];
    const regionByKey = new Map<string, number>();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const source = ((minY + y) * imageWidth + minX + x) * 4;
            const pixelHeight = pixelHeights[y * width + x];
            if (!data[source + 3] || pixelHeight <= 0) continue;
            const hex = palette.get(
                (data[source] << 16) | (data[source + 1] << 8) | data[source + 2]
            );
            if (!hex) throw invalidPlan();
            // Binary search retains exactly the same layer activation tolerance
            // as the ordinary layered builder, without scanning the whole stack.
            let low = 0;
            let high = heights.length;
            while (low < high) {
                const mid = (low + high) >>> 1;
                if (heights[mid] <= pixelHeight + LAYER_ACTIVATION_EPSILON) low = mid + 1;
                else high = mid;
            }
            const topLayer = low - 1;
            if (topLayer < 0) throw invalidPlan();
            const key = `${hex}/${topLayer}`;
            let regionIndex = regionByKey.get(key);
            if (regionIndex === undefined) {
                regionIndex = regions.length;
                regionByKey.set(key, regionIndex);
                regions.push({ hex, topLayer, pixels: [] });
            }
            const pixel = (height - 1 - y) * width + x;
            labels[pixel] = regionIndex + 1;
            regions[regionIndex].pixels.push(pixel);
            if (x % 1024 === 0) await maybeYield();
        }
        await maybeYield();
        if (!isCurrent()) return;
    }
    const meshMask = await createFlatPaintMesher(labels, width, height, pixelSize, strength, {
        yieldIntervalMs: options.yieldIntervalMs,
        onYield,
    });
    if (!isCurrent()) return;
    for (let layerIndex = 0; layerIndex < heights.length; layerIndex++) {
        const baseZ = layerIndex === 0 ? 0 : heights[layerIndex - 1];
        const topZ = heights[layerIndex];
        const activeRegions = regions.filter((region) => region.topLayer >= layerIndex);
        for (let regionIndex = 0; regionIndex < activeRegions.length; regionIndex++) {
            const region = activeRegions[regionIndex];
            if (!isCurrent()) return;
            const filamentIndex = plan.colorLayerFilaments.get(region.hex)?.[layerIndex];
            const previewHex = plan.perColorLayerColors.get(region.hex)?.[layerIndex];
            const filament =
                filamentIndex === undefined ? undefined : plan.filaments[filamentIndex];
            const nozzleIndex =
                filamentIndex === undefined
                    ? undefined
                    : resolveNozzleIndex(plan, filamentIndex, layerIndex);
            if (!filament || !previewHex || nozzleIndex === undefined) throw invalidPlan();
            if (!region.geometry) {
                const mask = new Uint8Array(labels.length);
                for (let i = 0; i < region.pixels.length; i++) {
                    mask[region.pixels[i]] = 1;
                    if (i % 4096 === 0) await maybeYield();
                }
                if (!isCurrent()) return;
                region.geometry = await meshMask(mask, {
                    yieldIntervalMs: options.yieldIntervalMs,
                    onYield,
                    onProgress: (progress) =>
                        options.onLayerProgress?.(layerIndex, {
                            ...progress,
                            progress:
                                (regionIndex + progress.progress * 0.9) / activeRegions.length,
                        }),
                });
            }
            if (!isCurrent()) return;
            const { positions: unitPositions, indices, metrics } = region.geometry;
            const positions = new Float32Array(unitPositions.length);
            for (let i = 0; i < positions.length; i += 3) {
                positions[i] = unitPositions[i];
                positions[i + 1] = unitPositions[i + 1];
                positions[i + 2] = (unitPositions[i + 2] === 0 ? baseZ : topZ) * heightScale;
                if (i % 6144 === 0) await maybeYield();
            }
            if (!isCurrent()) return;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setIndex(indices);
            // Retain the actual shared tessellation. Supplying voxel occupancy
            // here would make export replace smoothing and collapse different
            // physical filaments used by one head across swap checkpoints.
            geometry.userData.kromacutExportGeometry = { positions, indices };
            const material = new THREE.MeshStandardMaterial({
                color: previewHex,
                side: THREE.FrontSide,
                metalness: 0,
                roughness: 0.7,
                flatShading: true,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.baseZ = baseZ;
            mesh.userData.topZ = topZ;
            mesh.userData.nozzleIndex = nozzleIndex;
            mesh.userData.kromacutFilamentHex = filament.color;
            mesh.userData.kromacutPreviewVirtualHex = previewHex;
            mesh.userData.kromacutPreviewFilamentHex = filament.color;
            yield { mesh, layerIndex, activePixelCount: region.pixels.length, metrics };
            options.onLayerProgress?.(layerIndex, {
                phase: 'walls',
                label: 'Layer mesh complete',
                progress: (regionIndex + 1) / activeRegions.length,
            });
            await maybeYield();
        }
    }
}
