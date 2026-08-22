import { createCenterWeight, createEdgeWeight } from './regionWeighting.ts';

/** Why a source pixel changed in the line-width simulation. */
export const PRINTABLE_FEATURE_UNCHANGED = 0;
export const PRINTABLE_FEATURE_NEIGHBOR_TAKEOVER = 1;
export const PRINTABLE_FEATURE_NO_SUPPORT = 2;

export interface PrintableFeatureColorStat {
    hex: string;
    count: number;
    centerWeight: number;
    edgeWeight: number;
}

export interface PrintableFeatureDiagnostics {
    sourceOpaquePixelCount: number;
    printableOpaquePixelCount: number;
    reassignedPixelCount: number;
    unsupportedPixelCount: number;
    changedPixelCount: number;
    affectedFraction: number;
    sourceColorCount: number;
    printableColorCount: number;
    lostColorCount: number;
    omittedPixelCount: number;
    omitAtRiskPixels: boolean;
    effectiveDiameterPixels: number;
    lineWidthMm: number;
    pixelSizeMm: number;
}

export interface PrintableFeatureSimulation {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    changeMask: Uint8Array;
    colorStats: PrintableFeatureColorStat[];
    diagnostics: PrintableFeatureDiagnostics;
    fingerprint: string;
}

export interface PrintableFeatureOptions {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    pixelSizeMm: number;
    lineWidthMm: number;
    omitAtRiskPixels?: boolean;
}

const DISTANCE_INFINITY = 1e20;

function sameRgb(data: Uint8ClampedArray, firstPixel: number, secondPixel: number): boolean {
    const first = firstPixel * 4;
    const second = secondPixel * 4;
    return (
        data[first] === data[second] &&
        data[first + 1] === data[second + 1] &&
        data[first + 2] === data[second + 2]
    );
}

function rgbKey(data: Uint8ClampedArray, pixel: number): number {
    const offset = pixel * 4;
    return (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
}

function keyToHex(key: number): string {
    return `#${key.toString(16).padStart(6, '0')}`;
}

/**
 * Felzenszwalb/Huttenlocher one-dimensional squared Euclidean distance transform.
 * `values` is reused by the caller so the two image passes do not allocate per row/column.
 */
function distanceTransformLine(
    values: Float64Array,
    output: Float64Array,
    locations: Int32Array,
    intersections: Float64Array,
    length: number
): void {
    let envelopeEnd = 0;
    locations[0] = 0;
    intersections[0] = -Infinity;
    intersections[1] = Infinity;

    for (let q = 1; q < length; q++) {
        let previous = locations[envelopeEnd];
        let intersection =
            (values[q] + q * q - (values[previous] + previous * previous)) / (2 * (q - previous));

        while (intersection <= intersections[envelopeEnd] && envelopeEnd > 0) {
            envelopeEnd--;
            previous = locations[envelopeEnd];
            intersection =
                (values[q] + q * q - (values[previous] + previous * previous)) /
                (2 * (q - previous));
        }

        envelopeEnd++;
        locations[envelopeEnd] = q;
        intersections[envelopeEnd] = intersection;
        intersections[envelopeEnd + 1] = Infinity;
    }

    envelopeEnd = 0;
    for (let q = 0; q < length; q++) {
        while (intersections[envelopeEnd + 1] < q) envelopeEnd++;
        const nearest = locations[envelopeEnd];
        const delta = q - nearest;
        output[q] = delta * delta + values[nearest];
    }
}

function computeBoundaryDistanceSquared(
    data: Uint8ClampedArray,
    width: number,
    height: number
): Float32Array {
    const pixelCount = width * height;
    const boundary = new Uint8Array(pixelCount);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixel = y * width + x;
            const alpha = data[pixel * 4 + 3];
            if (alpha === 0) {
                boundary[pixel] = 1;
                continue;
            }

            if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
                boundary[pixel] = 1;
                continue;
            }

            for (let dy = -1; dy <= 1 && boundary[pixel] === 0; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const neighbor = pixel + dy * width + dx;
                    if (data[neighbor * 4 + 3] === 0 || !sameRgb(data, pixel, neighbor)) {
                        boundary[pixel] = 1;
                        break;
                    }
                }
            }
        }
    }

    const maximumLineLength = Math.max(width, height);
    const values = new Float64Array(maximumLineLength);
    const transformed = new Float64Array(maximumLineLength);
    const locations = new Int32Array(maximumLineLength);
    const intersections = new Float64Array(maximumLineLength + 1);
    const rowPass = new Float32Array(pixelCount);
    const result = new Float32Array(pixelCount);

    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            values[x] = boundary[row + x] ? 0 : DISTANCE_INFINITY;
        }
        distanceTransformLine(values, transformed, locations, intersections, width);
        for (let x = 0; x < width; x++) rowPass[row + x] = transformed[x];
    }

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) values[y] = rowPass[y * width + x];
        distanceTransformLine(values, transformed, locations, intersections, height);
        for (let y = 0; y < height; y++) result[y * width + x] = transformed[y];
    }

    return result;
}

function minimumCoreInset(effectiveDiameterPixels: number): number {
    if (effectiveDiameterPixels <= 1) return 0;
    // The simulation works on pixel centers. An exactly even-width feature has no
    // centered raster sample, so treat that knife-edge case as vulnerable instead
    // of promising detail that the slicer may discard after path quantization.
    return Math.ceil((effectiveDiameterPixels - 1) / 2 - 1e-9);
}

function stableFingerprint(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    pixelSizeMm: number,
    lineWidthMm: number,
    omitAtRiskPixels: boolean
): string {
    let hash = 0x811c9dc5;
    const update = (value: number) => {
        hash = Math.imul(hash ^ value, 0x01000193) >>> 0;
    };

    for (const value of data) update(value);
    const metadata = `${width}:${height}:${pixelSizeMm}:${lineWidthMm}:${omitAtRiskPixels ? 1 : 0}:v2`;
    for (let index = 0; index < metadata.length; index++) update(metadata.charCodeAt(index));
    return `printable-v1-${hash.toString(16).padStart(8, '0')}`;
}

/**
 * Approximate the categorical regions a slicer can preserve with the selected line width.
 *
 * Pixels far enough inside their original color form printable cores. A deterministic
 * multi-source flood then lets the nearest printable core claim boundary and sub-line-width
 * pixels, modeling neighboring-color takeover. When omission is enabled, vulnerable source
 * colors are replaced by those neighboring colors before Auto-paint sees them; pixel positions
 * are never made transparent. An isolated component with no printable core keeps its original
 * color because there is no defensible nearby replacement. The operation never invents a blended
 * RGB value, which keeps Auto-paint's target space bounded and physically interpretable.
 */
export function simulatePrintableFeatures(
    options: PrintableFeatureOptions
): PrintableFeatureSimulation {
    const { width, height, data } = options;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        throw new Error('Printable feature simulation requires positive integer dimensions');
    }
    if (data.length !== width * height * 4) {
        throw new Error('Printable feature simulation RGBA data does not match its dimensions');
    }

    const pixelSizeMm = Number.isFinite(options.pixelSizeMm)
        ? Math.max(0.001, options.pixelSizeMm)
        : 0.1;
    const lineWidthMm = Number.isFinite(options.lineWidthMm)
        ? Math.max(0.001, options.lineWidthMm)
        : 0.42;
    const effectiveDiameterPixels = lineWidthMm / pixelSizeMm;
    const omitAtRiskPixels = options.omitAtRiskPixels === true;
    const requiredInset = minimumCoreInset(effectiveDiameterPixels);
    const requiredInsetSquared = requiredInset * requiredInset;
    const pixelCount = width * height;
    const boundaryDistanceSquared =
        requiredInset > 0
            ? computeBoundaryDistanceSquared(data, width, height)
            : new Float32Array(pixelCount);
    const owner = new Int32Array(pixelCount);
    const floodDistance = new Int32Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    owner.fill(-1);
    floodDistance.fill(-1);

    const sourceColors = new Set<number>();
    let sourceOpaquePixelCount = 0;
    let queueHead = 0;
    let queueTail = 0;

    for (let pixel = 0; pixel < pixelCount; pixel++) {
        if (data[pixel * 4 + 3] === 0) continue;
        sourceOpaquePixelCount++;
        sourceColors.add(rgbKey(data, pixel));
        if (requiredInset === 0 || boundaryDistanceSquared[pixel] >= requiredInsetSquared) {
            owner[pixel] = pixel;
            floodDistance[pixel] = 0;
            queue[queueTail++] = pixel;
        }
    }

    const visit = (from: number, neighbor: number) => {
        if (data[neighbor * 4 + 3] === 0) return;
        const candidateDistance = floodDistance[from] + 1;
        if (floodDistance[neighbor] < 0) {
            floodDistance[neighbor] = candidateDistance;
            owner[neighbor] = owner[from];
            queue[queueTail++] = neighbor;
            return;
        }
        if (
            floodDistance[neighbor] === candidateDistance &&
            owner[neighbor] >= 0 &&
            !sameRgb(data, owner[neighbor], neighbor) &&
            sameRgb(data, owner[from], neighbor)
        ) {
            // On an equal-distance boundary, keep the original color if it has a
            // printable core. No requeue is needed because distance is unchanged.
            owner[neighbor] = owner[from];
        }
    };

    while (queueHead < queueTail) {
        const pixel = queue[queueHead++];
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        if (x > 0) visit(pixel, pixel - 1);
        if (x + 1 < width) visit(pixel, pixel + 1);
        if (y > 0) visit(pixel, pixel - width);
        if (y + 1 < height) visit(pixel, pixel + width);
    }

    const output = new Uint8ClampedArray(data);
    const changeMask = new Uint8Array(pixelCount);
    let reassignedPixelCount = 0;
    let unsupportedPixelCount = 0;
    let printableOpaquePixelCount = 0;

    for (let pixel = 0; pixel < pixelCount; pixel++) {
        const offset = pixel * 4;
        if (data[offset + 3] === 0) continue;
        const sourceOwner = owner[pixel];
        if (sourceOwner < 0) {
            changeMask[pixel] = PRINTABLE_FEATURE_NO_SUPPORT;
            unsupportedPixelCount++;
            printableOpaquePixelCount++;
            continue;
        }

        if (!sameRgb(data, pixel, sourceOwner)) {
            changeMask[pixel] = PRINTABLE_FEATURE_NEIGHBOR_TAKEOVER;
            reassignedPixelCount++;
            if (omitAtRiskPixels) {
                const ownerOffset = sourceOwner * 4;
                output[offset] = data[ownerOffset];
                output[offset + 1] = data[ownerOffset + 1];
                output[offset + 2] = data[ownerOffset + 2];
            }
        }
        printableOpaquePixelCount++;
    }

    const centerWeightFor = createCenterWeight(width, height);
    const edgeWeightFor = createEdgeWeight(width, height);
    const stats = new Map<number, Omit<PrintableFeatureColorStat, 'hex'>>();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixel = y * width + x;
            if (output[pixel * 4 + 3] === 0) continue;
            const key = rgbKey(output, pixel);
            const existing = stats.get(key);
            if (existing) {
                existing.count++;
                existing.centerWeight += centerWeightFor(x, y);
                existing.edgeWeight += edgeWeightFor(x, y);
            } else {
                stats.set(key, {
                    count: 1,
                    centerWeight: centerWeightFor(x, y),
                    edgeWeight: edgeWeightFor(x, y),
                });
            }
        }
    }

    const colorStats = [...stats.entries()]
        .sort(([left], [right]) => left - right)
        .map(([key, stat]) => ({ hex: keyToHex(key), ...stat }));
    const printableColors = new Set(stats.keys());
    let lostColorCount = 0;
    for (const color of sourceColors) {
        if (!printableColors.has(color)) lostColorCount++;
    }
    const changedPixelCount = reassignedPixelCount + unsupportedPixelCount;

    return {
        width,
        height,
        data: output,
        changeMask,
        colorStats,
        diagnostics: {
            sourceOpaquePixelCount,
            printableOpaquePixelCount,
            reassignedPixelCount,
            unsupportedPixelCount,
            changedPixelCount,
            affectedFraction:
                sourceOpaquePixelCount > 0 ? changedPixelCount / sourceOpaquePixelCount : 0,
            sourceColorCount: sourceColors.size,
            printableColorCount: printableColors.size,
            lostColorCount,
            omittedPixelCount: omitAtRiskPixels ? reassignedPixelCount : 0,
            omitAtRiskPixels,
            effectiveDiameterPixels,
            lineWidthMm,
            pixelSizeMm,
        },
        fingerprint: stableFingerprint(
            output,
            width,
            height,
            pixelSizeMm,
            lineWidthMm,
            omitAtRiskPixels
        ),
    };
}
