import { createCenterEdgeWeight } from './regionWeighting.ts';

/** Image-space detail warnings; neither value means the pixel must be removed. */
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
    eligibleSpeckPixelCount: number;
    retainedRiskPixelCount: number;
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

/**
 * Keep large pixel buffers directly accessible to Kromacut while excluding
 * them from generic object enumeration. React's development performance
 * instrumentation recursively inspects changed props; enumerating a
 * megapixel typed array there can block the UI and allocate gigabytes.
 */
export function concealPrintableFeatureBuffers<
    T extends { data: Uint8ClampedArray; changeMask?: Uint8Array },
>(value: T): T {
    for (const key of ['data', 'changeMask'] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor?.enumerable) {
            Object.defineProperty(value, key, { ...descriptor, enumerable: false });
        }
    }
    return value;
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

const COMPONENT_ENCLOSED = 1;
const COMPONENT_HAS_CORE = 2;
const COMPONENT_HAS_ROBUST_NEIGHBOR = 4;
const COMPONENT_COMPACT = 8;
const COMPONENT_ELIGIBLE_SPECK = 16;

/** Packed columns avoid allocating an object for every speck in a noisy image. */
interface ColorComponents {
    count: number;
    colors: Uint32Array;
    flags: Uint8Array;
    surrounding: Int32Array;
}

function regionsDiffer(data: Uint8ClampedArray, first: number, second: number): boolean {
    const firstOpaque = data[first * 4 + 3] !== 0;
    const secondOpaque = data[second * 4 + 3] !== 0;
    return firstOpaque !== secondOpaque || (firstOpaque && !sameRgb(data, first, second));
}

/**
 * Find cores against actual pixel edges, including positions between pixel centers.
 * The half-pixel lattice contains each edge's endpoints and midpoint, so its EDT
 * measures exact distance to the raster boundary at every sampled position. This
 * preserves even-width and diagonal regions that a rounded pixel-center inset loses.
 * Only the row pass is retained; column results update component flags directly.
 */
function markComponentCores(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    componentIds: Int32Array,
    components: ColorComponents,
    effectiveDiameterPixels: number
): void {
    if (components.count === 0) return;
    if (effectiveDiameterPixels <= 1) {
        for (let id = 0; id < components.count; id++) {
            components.flags[id] |= COMPONENT_HAS_CORE;
        }
        return;
    }

    const gridWidth = width * 2 + 1;
    const gridHeight = height * 2 + 1;
    const maximumLineLength = Math.max(gridWidth, gridHeight);
    const values = new Float64Array(maximumLineLength);
    const transformed = new Float64Array(maximumLineLength);
    const locations = new Int32Array(maximumLineLength);
    const intersections = new Float64Array(maximumLineLength + 1);
    const rowPass = new Float32Array(gridWidth * gridHeight);

    for (let y = 0; y < gridHeight; y++) {
        values.fill(DISTANCE_INFINITY, 0, gridWidth);
        if (y === 0 || y === gridHeight - 1) {
            values.fill(0, 0, gridWidth);
        } else {
            values[0] = 0;
            values[gridWidth - 1] = 0;
            const sourceY = Math.floor(y / 2);
            if (y % 2 === 0) {
                // Horizontal boundary segments, including their endpoints.
                const above = (sourceY - 1) * width;
                const below = sourceY * width;
                for (let x = 0; x < width; x++) {
                    if (!regionsDiffer(data, above + x, below + x)) continue;
                    values[x * 2] = 0;
                    values[x * 2 + 1] = 0;
                    values[x * 2 + 2] = 0;
                }
                // Endpoints of vertical segments arriving from either row.
                for (let x = 1; x < width; x++) {
                    if (
                        regionsDiffer(data, above + x - 1, above + x) ||
                        regionsDiffer(data, below + x - 1, below + x)
                    ) {
                        values[x * 2] = 0;
                    }
                }
            } else {
                const sourceRow = sourceY * width;
                for (let x = 1; x < width; x++) {
                    if (regionsDiffer(data, sourceRow + x - 1, sourceRow + x)) {
                        values[x * 2] = 0;
                    }
                }
            }
        }
        distanceTransformLine(values, transformed, locations, intersections, gridWidth);
        const row = y * gridWidth;
        for (let x = 0; x < gridWidth; x++) rowPass[row + x] = transformed[x];
    }

    // One lattice unit is half a pixel, so the radius in lattice units equals
    // the requested line diameter in pixels. No integer inset rounding applies.
    const requiredDistanceSquared = effectiveDiameterPixels * effectiveDiameterPixels;
    for (let x = 1; x < gridWidth - 1; x++) {
        for (let y = 0; y < gridHeight; y++) values[y] = rowPass[y * gridWidth + x];
        distanceTransformLine(values, transformed, locations, intersections, gridHeight);
        const sourceX = Math.floor(x / 2);
        for (let y = 1; y < gridHeight - 1; y++) {
            if (transformed[y] + 1e-9 < requiredDistanceSquared) continue;
            const componentId = componentIds[Math.floor(y / 2) * width + sourceX];
            if (componentId >= 0) components.flags[componentId] |= COMPONENT_HAS_CORE;
        }
    }
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
    const metadata = `${width}:${height}:${pixelSizeMm}:${lineWidthMm}:${omitAtRiskPixels ? 1 : 0}:v3`;
    for (let index = 0; index < metadata.length; index++) update(metadata.charCodeAt(index));
    return `printable-v1-${hash.toString(16).padStart(8, '0')}`;
}

/**
 * Flag thin image-space regions and optionally remove only tiny isolated colors.
 * RGB boundaries are not physical extrusion boundaries: stacked layers and variable-width
 * slicer paths can preserve detail that has no full-width core in this image. Warnings
 * therefore never imply removal. Whole 8-connected components with a core are preserved;
 * long thin paths, junctions, transparency-adjacent detail and image-edge detail also remain.
 * Cleanup is limited to colors whose every component is smaller than the selected line width
 * in every direction and enclosed by one robust original neighbor component. Replacements
 * use original categorical colors and never alter alpha or cascade into other replacements.
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
    const pixelCount = width * height;
    const componentIds = new Int32Array(pixelCount);
    componentIds.fill(-1);
    const components: ColorComponents = {
        count: 0,
        colors: new Uint32Array(pixelCount),
        flags: new Uint8Array(pixelCount),
        surrounding: new Int32Array(pixelCount),
    };
    components.surrounding.fill(-1);
    const queue = new Int32Array(pixelCount);
    const sourceColors = new Set<number>();
    let sourceOpaquePixelCount = 0;
    const diameterSquared = effectiveDiameterPixels * effectiveDiameterPixels;

    for (let start = 0; start < pixelCount; start++) {
        if (data[start * 4 + 3] === 0 || componentIds[start] >= 0) continue;
        const startX = start % width;
        const startY = Math.floor(start / width);
        const componentId = components.count++;
        const color = rgbKey(data, start);
        components.colors[componentId] = color;
        sourceColors.add(color);
        let minX = startX;
        let maxX = startX;
        let minY = startY;
        let maxY = startY;
        let enclosed = true;
        let queueHead = 0;
        let queueTail = 1;
        queue[0] = start;
        componentIds[start] = componentId;

        while (queueHead < queueTail) {
            const pixel = queue[queueHead++];
            const x = pixel % width;
            const y = Math.floor(pixel / width);
            sourceOpaquePixelCount++;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
                enclosed = false;
            }

            // Corner-touching pixels belong together, especially diagonal linework.
            for (let dy = -1; dy <= 1; dy++) {
                const neighborY = y + dy;
                if (neighborY < 0 || neighborY >= height) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const neighborX = x + dx;
                    if (neighborX < 0 || neighborX >= width) continue;
                    const neighbor = neighborY * width + neighborX;
                    if (data[neighbor * 4 + 3] === 0) {
                        enclosed = false;
                    } else if (componentIds[neighbor] < 0 && sameRgb(data, pixel, neighbor)) {
                        componentIds[neighbor] = componentId;
                        queue[queueTail++] = neighbor;
                    }
                }
            }
        }
        const spanX = maxX - minX + 1;
        const spanY = maxY - minY + 1;
        components.flags[componentId] =
            (enclosed ? COMPONENT_ENCLOSED : 0) |
            (spanX * spanX + spanY * spanY + 1e-9 < diameterSquared ? COMPONENT_COMPACT : 0);
    }

    markComponentCores(data, width, height, componentIds, components, effectiveDiameterPixels);

    // Examine original neighbors only. A replacement must not make another color
    // eligible, and separate neighbors of the same RGB are still ambiguous.
    for (let pixel = 0; pixel < pixelCount; pixel++) {
        const componentId = componentIds[pixel];
        if (componentId < 0 || (components.flags[componentId] & COMPONENT_HAS_CORE) !== 0) continue;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        for (let dy = -1; dy <= 1; dy++) {
            const neighborY = y + dy;
            if (neighborY < 0 || neighborY >= height) continue;
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const neighborX = x + dx;
                if (neighborX < 0 || neighborX >= width) continue;
                const neighborId = componentIds[neighborY * width + neighborX];
                if (neighborId < 0 || neighborId === componentId) continue;
                if ((components.flags[neighborId] & COMPONENT_HAS_CORE) !== 0) {
                    components.flags[componentId] |= COMPONENT_HAS_ROBUST_NEIGHBOR;
                }
                if (components.surrounding[componentId] === -1) {
                    components.surrounding[componentId] = neighborId;
                } else if (components.surrounding[componentId] !== neighborId) {
                    components.surrounding[componentId] = -2;
                }
            }
        }
    }

    const protectedColors = new Set<number>();
    for (let id = 0; id < components.count; id++) {
        const flags = components.flags[id];
        const surrounding = components.surrounding[id];
        const eligibleSpeck =
            (flags & COMPONENT_HAS_CORE) === 0 &&
            (flags & COMPONENT_ENCLOSED) !== 0 &&
            (flags & COMPONENT_COMPACT) !== 0 &&
            surrounding >= 0 &&
            (components.flags[surrounding] & COMPONENT_HAS_CORE) !== 0;
        if (eligibleSpeck) components.flags[id] |= COMPONENT_ELIGIBLE_SPECK;
        // This setting omits tiny isolated colors, not selected fragments of a
        // color that also forms useful larger regions elsewhere in the image.
        if (!eligibleSpeck) protectedColors.add(components.colors[id]);
    }

    const output = new Uint8ClampedArray(data);
    const changeMask = new Uint8Array(pixelCount);
    let reassignedPixelCount = 0;
    let unsupportedPixelCount = 0;
    let eligibleSpeckPixelCount = 0;
    let omittedPixelCount = 0;

    for (let pixel = 0; pixel < pixelCount; pixel++) {
        const offset = pixel * 4;
        if (data[offset + 3] === 0) continue;
        const componentId = componentIds[pixel];
        const flags = components.flags[componentId];
        if ((flags & COMPONENT_HAS_CORE) !== 0) continue;
        if ((flags & COMPONENT_HAS_ROBUST_NEIGHBOR) !== 0) {
            changeMask[pixel] = PRINTABLE_FEATURE_NEIGHBOR_TAKEOVER;
            reassignedPixelCount++;
        } else {
            changeMask[pixel] = PRINTABLE_FEATURE_NO_SUPPORT;
            unsupportedPixelCount++;
        }
        if (
            (flags & COMPONENT_ELIGIBLE_SPECK) === 0 ||
            protectedColors.has(components.colors[componentId])
        )
            continue;
        eligibleSpeckPixelCount++;
        if (omitAtRiskPixels) {
            const replacement = components.colors[components.surrounding[componentId]];
            output[offset] = (replacement >>> 16) & 0xff;
            output[offset + 1] = (replacement >>> 8) & 0xff;
            output[offset + 2] = replacement & 0xff;
            omittedPixelCount++;
        }
    }

    const spatialWeightFor = createCenterEdgeWeight(width, height);
    const spatialWeights = { center: 0, edge: 0 };
    const stats = new Map<number, Omit<PrintableFeatureColorStat, 'hex'>>();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixel = y * width + x;
            if (output[pixel * 4 + 3] === 0) continue;
            const key = rgbKey(output, pixel);
            spatialWeightFor(x, y, spatialWeights);
            const existing = stats.get(key);
            if (existing) {
                existing.count++;
                existing.centerWeight += spatialWeights.center;
                existing.edgeWeight += spatialWeights.edge;
            } else {
                stats.set(key, {
                    count: 1,
                    centerWeight: spatialWeights.center,
                    edgeWeight: spatialWeights.edge,
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
            printableOpaquePixelCount: sourceOpaquePixelCount,
            reassignedPixelCount,
            unsupportedPixelCount,
            changedPixelCount,
            affectedFraction:
                sourceOpaquePixelCount > 0 ? changedPixelCount / sourceOpaquePixelCount : 0,
            sourceColorCount: sourceColors.size,
            printableColorCount: printableColors.size,
            lostColorCount,
            omittedPixelCount,
            eligibleSpeckPixelCount,
            retainedRiskPixelCount: changedPixelCount - omittedPixelCount,
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
