import { ShapeUtils, Vector2 } from 'three';

export interface MeshData {
    positions: Float32Array;
    indices: number[];
    metrics?: MeshMetrics;
}

export interface MeshMetrics {
    mesher: 'greedy' | 'smooth';
    elapsedMs: number;
    activePixelCount?: number;
    vertexCount: number;
    triangleCount: number;
}

export interface MeshProgress {
    phase:
        | 'component-scan'
        | 'boundary-trace'
        | 'smoothing'
        | 'topology'
        | 'rectangles'
        | 'caps'
        | 'walls';
    label: string;
    progress: number;
}

interface MeshYieldOptions {
    yieldIntervalMs?: number;
    onYield?: () => Promise<void>;
    onProgress?: (progress: MeshProgress) => void;
    /**
     * Skip the downward-facing bottom cap. Used by the multi-head / per-colour-group
     * meshing path when stacking sub-meshes on top of a lower layer so interior faces
     * don't z-fight the layer beneath.
     */
    skipBottomCap?: boolean;
    /**
     * Skip the binary corner-contact repair pass. Used when a layer is split into
     * multiple colour groups so adjacent groups aren't independently "repaired" into
     * overlapping geometry.
     */
    skipRepair?: boolean;
    /**
     * Union of all colour-group masks on this layer. When provided, boundary smoothing
     * runs on this combined solid instead of the group's own mask: internal seams
     * between adjacent groups are never smoothed, and vertices on the true exterior
     * are moved identically by every group's mesher. Without this, each group smooths
     * its own outline independently and adjacent colours peel apart at shared edges.
     */
    combinedMask?: PixelMask;
}

interface GridMeshOptions extends MeshYieldOptions {
    mesher: 'greedy' | 'smooth';
    smoothBoundary: boolean;
    combinedMask?: PixelMask;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

type PixelMask = Uint8Array | Uint8ClampedArray | boolean[];

const SMOOTH_VERTEX_MAX_MOVE = 0.49;
const SMOOTH_BOUNDARY_ITERATIONS = 10;
const SMOOTH_BOUNDARY_STRENGTH = 0.75;
const THREE_MF_COORD_SCALE = 100_000;

function progressInUnitSpan(index: number, count: number, start: number, span: number) {
    const fraction = (Math.max(0, Math.floor(index)) + 1) / Math.max(1, count);
    return Math.max(0, Math.min(1, start + Math.max(0, span) * fraction));
}

function repairBinaryCornerContacts(activePixels: PixelMask, width: number, height: number) {
    let repaired: Uint8Array | null = null;
    const get = (index: number) => ((repaired ? repaired[index] : activePixels[index]) ? 1 : 0);
    const set = (index: number) => {
        if (!repaired) {
            repaired = new Uint8Array(activePixels.length);
            for (let i = 0; i < activePixels.length; i++) {
                repaired[i] = activePixels[i] ? 1 : 0;
            }
        }

        if (!repaired[index]) {
            repaired[index] = 1;
            return true;
        }

        return false;
    };

    let changed = true;
    let pass = 0;
    const maxPasses = 8;

    while (changed && pass < maxPasses) {
        changed = false;
        pass++;

        for (let y = 0; y < height - 1; y++) {
            const row = y * width;
            const nextRow = row + width;

            for (let x = 0; x < width - 1; x++) {
                const topLeftIndex = row + x;
                const topRightIndex = topLeftIndex + 1;
                const bottomLeftIndex = nextRow + x;
                const bottomRightIndex = bottomLeftIndex + 1;
                const topLeft = get(topLeftIndex);
                const topRight = get(topRightIndex);
                const bottomLeft = get(bottomLeftIndex);
                const bottomRight = get(bottomRightIndex);

                if (topLeft && bottomRight && !topRight && !bottomLeft) {
                    changed = set(topRightIndex) || changed;
                }

                if (topRight && bottomLeft && !topLeft && !bottomRight) {
                    changed = set(topLeftIndex) || changed;
                }
            }
        }
    }

    return repaired ?? activePixels;
}

function countActivePixels(activePixels: PixelMask) {
    let activePixelCount = 0;

    for (let i = 0; i < activePixels.length; i++) {
        if (activePixels[i]) activePixelCount++;
    }

    return activePixelCount;
}

function meshLabel(mesher: 'greedy' | 'smooth', label: string) {
    return mesher === 'smooth' ? label.replace('mesh', 'smooth mesh') : label;
}

function triangleArea2(a: Vector2, b: Vector2, c: Vector2) {
    return (
        (b.x - a.x) * (c.y - a.y) -
        (b.y - a.y) * (c.x - a.x)
    );
}

function pointInsideTriangle(
    point: Vector2,
    a: Vector2,
    b: Vector2,
    c: Vector2,
    areaEpsilon: number
) {
    return (
        triangleArea2(a, b, point) >= -areaEpsilon &&
        triangleArea2(b, c, point) >= -areaEpsilon &&
        triangleArea2(c, a, point) >= -areaEpsilon
    );
}

function triangulateBoundaryByEarClipping(
    points: Vector2[],
    roundedPoints: Vector2[],
    areaEpsilon: number
) {
    const remaining = points.map((_, index) => index);
    const faces: Array<[number, number, number]> = [];

    while (remaining.length > 3) {
        let clippedEar = false;

        for (let offset = 0; offset < remaining.length; offset++) {
            const previous = remaining[(offset - 1 + remaining.length) % remaining.length];
            const current = remaining[offset];
            const next = remaining[(offset + 1) % remaining.length];
            const a = points[previous];
            const b = points[current];
            const c = points[next];
            if (
                triangleArea2(a, b, c) <= areaEpsilon ||
                triangleArea2(
                    roundedPoints[previous],
                    roundedPoints[current],
                    roundedPoints[next]
                ) <= Number.EPSILON
            ) {
                continue;
            }

            let containsBoundaryVertex = false;
            for (const candidate of remaining) {
                if (candidate === previous || candidate === current || candidate === next) continue;
                if (pointInsideTriangle(points[candidate], a, b, c, areaEpsilon)) {
                    containsBoundaryVertex = true;
                    break;
                }
            }
            if (containsBoundaryVertex) continue;

            if (remaining.length === 4) {
                const finalTriangle = remaining.filter((_, index) => index !== offset);
                if (
                    triangleArea2(
                        points[finalTriangle[0]],
                        points[finalTriangle[1]],
                        points[finalTriangle[2]]
                    ) <= areaEpsilon ||
                    triangleArea2(
                        roundedPoints[finalTriangle[0]],
                        roundedPoints[finalTriangle[1]],
                        roundedPoints[finalTriangle[2]]
                    ) <= Number.EPSILON
                ) {
                    continue;
                }
            }

            faces.push([previous, current, next]);
            remaining.splice(offset, 1);
            clippedEar = true;
            break;
        }

        if (!clippedEar) return null;
    }

    if (
        remaining.length !== 3 ||
        triangleArea2(points[remaining[0]], points[remaining[1]], points[remaining[2]]) <=
            areaEpsilon ||
        triangleArea2(
            roundedPoints[remaining[0]],
            roundedPoints[remaining[1]],
            roundedPoints[remaining[2]]
        ) <= Number.EPSILON
    ) {
        return null;
    }

    faces.push([remaining[0], remaining[1], remaining[2]]);
    return faces;
}

/**
 * Earcut may omit collinear boundary vertices. Restore those vertices so cap
 * edges still pair exactly with wall edges, then validate both mesh and slicer precision.
 */
function triangulateBoundaryPreservingVertices(
    points: Vector2[],
    roundedPoints: Vector2[],
    areaEpsilon: number
) {
    const fastFaces = ShapeUtils.triangulateShape(roundedPoints, []).map(
        ([a, b, c]) => [a, b, c] as [number, number, number]
    );
    const boundaryEdgeKeys = new Set<string>();
    const edgeKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    for (let index = 0; index < points.length; index++) {
        boundaryEdgeKeys.add(edgeKey(index, (index + 1) % points.length));
    }
    const triangulateFallback = () =>
        triangulateBoundaryByEarClipping(points, roundedPoints, areaEpsilon);

    const findBoundaryChain = (start: number, end: number) => {
        const a = roundedPoints[start];
        const b = roundedPoints[end];
        const segmentX = b.x - a.x;
        const segmentY = b.y - a.y;
        const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
        // roundedPoints are exact integer coordinate units, so genuinely
        // collinear chains have area exactly 0 and integer projections.
        const collinearEpsilon = 0.5;

        const collect = (step: 1 | -1) => {
            const chain = [start];
            let cursor = start;
            for (let guard = 0; guard < points.length; guard++) {
                cursor = (cursor + step + points.length) % points.length;
                chain.push(cursor);
                if (cursor === end) break;
            }
            if (chain[chain.length - 1] !== end || chain.length <= 2) return null;

            let previousProjection = -Infinity;
            for (const vertex of chain) {
                const point = roundedPoints[vertex];
                if (Math.abs(triangleArea2(a, point, b)) > collinearEpsilon) return null;
                const projection =
                    (point.x - a.x) * segmentX + (point.y - a.y) * segmentY;
                if (
                    projection < previousProjection - collinearEpsilon ||
                    projection < -collinearEpsilon ||
                    projection > segmentLengthSquared + collinearEpsilon
                ) {
                    return null;
                }
                previousProjection = projection;
            }
            return chain;
        };

        return collect(1) ?? collect(-1);
    };

    const edgeUses = new Map<string, { count: number; start: number; end: number }>();
    for (const face of fastFaces) {
        for (let offset = 0; offset < 3; offset++) {
            const start = face[offset];
            const end = face[(offset + 1) % 3];
            const key = edgeKey(start, end);
            const use = edgeUses.get(key);
            if (use) use.count++;
            else edgeUses.set(key, { count: 1, start, end });
        }
    }

    const faces = fastFaces.slice();
    for (const use of edgeUses.values()) {
        if (use.count !== 1) continue;
        if (boundaryEdgeKeys.has(edgeKey(use.start, use.end))) continue;
        const chain = findBoundaryChain(use.start, use.end);
        if (!chain) continue;

        let targetFaceIndex = -1;
        let targetEdgeOffset = -1;
        let directedChain = chain;
        for (let faceIndex = 0; faceIndex < faces.length && targetFaceIndex < 0; faceIndex++) {
            const face = faces[faceIndex];
            for (let offset = 0; offset < 3; offset++) {
                const start = face[offset];
                const end = face[(offset + 1) % 3];
                if (start === use.start && end === use.end) {
                    targetFaceIndex = faceIndex;
                    targetEdgeOffset = offset;
                    break;
                }
                if (start === use.end && end === use.start) {
                    targetFaceIndex = faceIndex;
                    targetEdgeOffset = offset;
                    directedChain = chain.slice().reverse();
                    break;
                }
            }
        }
        if (targetFaceIndex < 0) {
            return triangulateFallback();
        }

        const targetFace = faces[targetFaceIndex];
        const opposite = targetFace[(targetEdgeOffset + 2) % 3];
        const replacements: Array<[number, number, number]> = [];
        for (let index = 0; index + 1 < directedChain.length; index++) {
            replacements.push([directedChain[index], directedChain[index + 1], opposite]);
        }
        faces.splice(targetFaceIndex, 1, ...replacements);
    }

    const finalEdgeCounts = new Map<string, number>();
    for (const [a, b, c] of faces) {
        if (
            triangleArea2(points[a], points[b], points[c]) <= areaEpsilon ||
            triangleArea2(roundedPoints[a], roundedPoints[b], roundedPoints[c]) <= Number.EPSILON
        ) {
            return triangulateFallback();
        }
        for (const [start, end] of [
            [a, b],
            [b, c],
            [c, a],
        ]) {
            const key = edgeKey(start, end);
            finalEdgeCounts.set(key, (finalEdgeCounts.get(key) ?? 0) + 1);
        }
    }
    for (const [key, count] of finalEdgeCounts) {
        if (count !== (boundaryEdgeKeys.has(key) ? 1 : 2)) {
            return triangulateFallback();
        }
    }
    for (const key of boundaryEdgeKeys) {
        if (finalEdgeCounts.get(key) !== 1) {
            return triangulateFallback();
        }
    }

    return faces;
}

/**
 * Smooth meshing uses the same welded topology as greedy meshing, then moves only
 * shared boundary grid vertices inward at corners. This avoids tracing whole-mask
 * contours; each welded rectangle cap is triangulated independently below.
 */
function createGridVertexMapper(
    meshingPixels: PixelMask,
    width: number,
    height: number,
    smoothBoundary: boolean,
    combinedMask?: PixelMask
) {
    if (!smoothBoundary) {
        return (x: number, y: number): [number, number] => [x, y];
    }

    const stride = width + 1;
    // Build the smoothing graph from the union of all colour groups on the layer
    // (falling back to this group's own pixels for single-group layers). Every group
    // is a subset of the combined mask, so all groups derive the identical boundary
    // graph and therefore identical smoothed positions — vertices shared between
    // adjacent groups stay welded instead of each group smoothing them differently.
    // Seam vertices interior to the combined solid never enter the graph and map to
    // their original grid position in every group.
    const solidPixels = combinedMask ?? meshingPixels;
    const getCell = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < width && y < height && solidPixels[y * width + x] ? 1 : 0;

    const boundaryNeighbors = new Map<number, Set<number>>();
    const addBoundaryEdge = (ax: number, ay: number, bx: number, by: number) => {
        const a = ay * stride + ax;
        const b = by * stride + bx;
        let neighborsA = boundaryNeighbors.get(a);
        if (!neighborsA) {
            neighborsA = new Set();
            boundaryNeighbors.set(a, neighborsA);
        }
        let neighborsB = boundaryNeighbors.get(b);
        if (!neighborsB) {
            neighborsB = new Set();
            boundaryNeighbors.set(b, neighborsB);
        }

        neighborsA.add(b);
        neighborsB.add(a);
    };

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!getCell(x, y)) continue;

            if (!getCell(x, y - 1)) addBoundaryEdge(x, y, x + 1, y);
            if (!getCell(x + 1, y)) addBoundaryEdge(x + 1, y, x + 1, y + 1);
            if (!getCell(x, y + 1)) addBoundaryEdge(x + 1, y + 1, x, y + 1);
            if (!getCell(x - 1, y)) addBoundaryEdge(x, y + 1, x, y);
        }
    }

    const clampToBounds = ([x, y]: [number, number]): [number, number] => [
        Math.max(0, Math.min(width, x)),
        Math.max(0, Math.min(height, y)),
    ];

    const clampMove = (
        originX: number,
        originY: number,
        [targetX, targetY]: [number, number]
    ): [number, number] => {
        const dx = targetX - originX;
        const dy = targetY - originY;
        const distance = Math.hypot(dx, dy);

        if (distance <= SMOOTH_VERTEX_MAX_MOVE || distance <= 1e-8) {
            return clampToBounds([targetX, targetY]);
        }

        const scale = SMOOTH_VERTEX_MAX_MOVE / distance;
        return clampToBounds([originX + dx * scale, originY + dy * scale]);
    };

    const positions = new Map<number, [number, number]>();
    const origins = new Map<number, [number, number]>();

    for (const key of boundaryNeighbors.keys()) {
        const x = key % stride;
        const y = Math.floor(key / stride);
        origins.set(key, [x, y]);
        positions.set(key, [x, y]);
    }

    for (let iteration = 0; iteration < SMOOTH_BOUNDARY_ITERATIONS; iteration++) {
        const nextPositions = new Map<number, [number, number]>();

        for (const [key, neighbors] of boundaryNeighbors) {
            const origin = origins.get(key)!;
            const current = positions.get(key)!;

            if (neighbors.size < 2) {
                nextPositions.set(key, current);
                continue;
            }

            let averageX = 0;
            let averageY = 0;
            for (const neighbor of neighbors) {
                const neighborPosition = positions.get(neighbor)!;
                averageX += neighborPosition[0];
                averageY += neighborPosition[1];
            }
            averageX /= neighbors.size;
            averageY /= neighbors.size;

            const candidate = clampMove(origin[0], origin[1], [
                current[0] + (averageX - current[0]) * SMOOTH_BOUNDARY_STRENGTH,
                current[1] + (averageY - current[1]) * SMOOTH_BOUNDARY_STRENGTH,
            ]);

            nextPositions.set(key, candidate);
        }

        positions.clear();
        for (const [key, position] of nextPositions) {
            positions.set(key, position);
        }
    }

    return (x: number, y: number): [number, number] => {
        const key = y * stride + x;
        return positions.get(key) ?? [x, y];
    };
}

async function generateGridMesh(
    activePixels: PixelMask,
    width: number,
    height: number,
    thickness: number,
    zOffset: number,
    pixelSize: number,
    heightScale: number,
    options: GridMeshOptions
): Promise<MeshData> {
    const startedAt = performance.now();
    const skipBottomCap = options.skipBottomCap ?? false;
    const meshingPixels = options.skipRepair
        ? activePixels
        : repairBinaryCornerContacts(activePixels, width, height);
    const positions: number[] = [];
    const indices: number[] = [];
    let vertCount = 0;
    const activePixelCount = countActivePixels(activePixels);
    const yieldIntervalMs = options.yieldIntervalMs ?? 8;
    const yieldControl =
        options.onYield ??
        (() =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() => resolve());
            }));
    let lastYield = performance.now();
    let lastReportedProgress = 0;
    const reportProgress = (progress: MeshProgress) => {
        const nextProgress = Math.max(
            lastReportedProgress,
            Math.max(0, Math.min(1, progress.progress))
        );
        lastReportedProgress = nextProgress;
        options.onProgress?.({
            ...progress,
            progress: nextProgress,
        });
    };
    const maybeYield = async () => {
        const now = performance.now();
        if (now - lastYield >= yieldIntervalMs) {
            await yieldControl();
            lastYield = performance.now();
        }
    };

    // Vertex welding maps: key = y * (width + 1) + x
    const topMap = new Map<number, number>();
    const bottomMap = new Map<number, number>();
    const stride = width + 1;

    const scaledThickness = thickness * heightScale;
    const scaledZOffset = zOffset * heightScale;
    const zBottom = scaledZOffset;
    const zTop = scaledZOffset + scaledThickness;
    const getGridVertexXY = createGridVertexMapper(
        meshingPixels,
        width,
        height,
        options.smoothBoundary,
        options.combinedMask
    );

    const getOrAddVertex = (x: number, y: number, isTop: boolean): number => {
        const key = y * stride + x;
        const map = isTop ? topMap : bottomMap;
        let idx = map.get(key);
        if (idx !== undefined) return idx;

        const [mappedX, mappedY] = getGridVertexXY(x, y);
        idx = vertCount++;
        map.set(key, idx);
        positions.push(mappedX * pixelSize, mappedY * pixelSize, isTop ? zTop : zBottom);
        return idx;
    };

    const addQuadCCW = (v0: number, v1: number, v2: number, v3: number) => {
        indices.push(v0, v1, v2);
        indices.push(v0, v2, v3);
    };
    const rectangles: Rect[] = [];
    const visited = new Uint8Array(width * height);
    reportProgress({
        phase: 'rectangles',
        label: meshLabel(options.mesher, 'Finding mesh rectangles'),
        progress: 0,
    });

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (meshingPixels[idx] && !visited[idx]) {
                let w = 1;
                while (
                    x + w < width &&
                    meshingPixels[y * width + (x + w)] &&
                    !visited[y * width + (x + w)]
                ) {
                    w++;
                }

                let h = 1;
                let canExpand = true;
                while (y + h < height && canExpand) {
                    for (let k = 0; k < w; k++) {
                        const nextIdx = (y + h) * width + (x + k);
                        if (!meshingPixels[nextIdx] || visited[nextIdx]) {
                            canExpand = false;
                            break;
                        }
                    }
                    if (canExpand) h++;
                }

                for (let dy = 0; dy < h; dy++) {
                    const rowOff = (y + dy) * width;
                    for (let dx = 0; dx < w; dx++) {
                        visited[rowOff + x + dx] = 1;
                    }
                }

                rectangles.push({ x, y, w, h });
            }
        }
        reportProgress({
            phase: 'rectangles',
            label: meshLabel(options.mesher, 'Finding mesh rectangles'),
            progress: progressInUnitSpan(y, height, 0, 0.28),
        });
        await maybeYield();
    }

    const verticesAtY = new Map<number, Set<number>>();
    const verticesAtX = new Map<number, Set<number>>();

    for (const rect of rectangles) {
        const { x, y, w, h } = rect;

        for (const yCoord of [y, y + h]) {
            if (!verticesAtY.has(yCoord)) verticesAtY.set(yCoord, new Set());
            verticesAtY.get(yCoord)!.add(x);
            verticesAtY.get(yCoord)!.add(x + w);
        }

        for (const xCoord of [x, x + w]) {
            if (!verticesAtX.has(xCoord)) verticesAtX.set(xCoord, new Set());
            verticesAtX.get(xCoord)!.add(y);
            verticesAtX.get(xCoord)!.add(y + h);
        }

        await maybeYield();
    }

    reportProgress({
        phase: 'caps',
        label: meshLabel(options.mesher, 'Building mesh caps'),
        progress: 0.42,
    });

    const sortedVerticesAtY = new Map<number, number[]>();
    for (const [y, set] of verticesAtY) {
        sortedVerticesAtY.set(
            y,
            Array.from(set).sort((a, b) => a - b)
        );
        await maybeYield();
    }
    const sortedVerticesAtX = new Map<number, number[]>();
    for (const [x, set] of verticesAtX) {
        sortedVerticesAtX.set(
            x,
            Array.from(set).sort((a, b) => a - b)
        );
        await maybeYield();
    }

    const lowerBound = (arr: number[], target: number) => {
        let lo = 0;
        let hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] < target) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    };

    const upperBound = (arr: number[], target: number) => {
        let lo = 0;
        let hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] <= target) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    };

    for (const rect of rectangles) {
        const { x, y, w, h } = rect;

        const topLine = sortedVerticesAtY.get(y)!;
        const rightLine = sortedVerticesAtX.get(x + w)!;
        const bottomLine = sortedVerticesAtY.get(y + h)!;
        const leftLine = sortedVerticesAtX.get(x)!;

        const topLo = lowerBound(topLine, x);
        const topHi = upperBound(topLine, x + w);
        const rightLo = lowerBound(rightLine, y);
        const rightHi = upperBound(rightLine, y + h);
        const bottomLo = lowerBound(bottomLine, x);
        const bottomHi = upperBound(bottomLine, x + w);
        const leftLo = lowerBound(leftLine, y);
        const leftHi = upperBound(leftLine, y + h);

        const boundary: Array<[number, number]> = [];

        for (let i = topLo; i < topHi - 1; i++) {
            boundary.push([topLine[i], y]);
        }
        for (let i = rightLo; i < rightHi - 1; i++) {
            boundary.push([x + w, rightLine[i]]);
        }
        for (let i = bottomHi - 1; i > bottomLo; i--) {
            boundary.push([bottomLine[i], y + h]);
        }
        for (let i = leftHi - 1; i > leftLo; i--) {
            boundary.push([x, leftLine[i]]);
        }

        if (boundary.length < 3) continue;

        const topLoop: number[] = new Array(boundary.length);
        const bottomLoop: number[] = new Array(boundary.length);

        for (let i = 0; i < boundary.length; i++) {
            const [vx, vy] = boundary[i];
            topLoop[i] = getOrAddVertex(vx, vy, true);
            bottomLoop[i] = getOrAddVertex(vx, vy, false);
        }

        const facePoints = boundary.map(([vx, vy]) => {
            if (!options.smoothBoundary) return new Vector2(vx, vy);

            const [mappedX, mappedY] = getGridVertexXY(vx, vy);
            return new Vector2(
                Math.fround(mappedX * pixelSize),
                Math.fround(mappedY * pixelSize)
            );
        });
        // Cap points in integer 3MF coordinate units — the exact grid the
        // exporter serializes and welds on. Degeneracy checks on these
        // integers agree with the exporter bit-for-bit, so every cap face the
        // mesher accepts survives export. (Checking quantized-back floats
        // against an epsilon lets through faces whose integer area is exactly
        // zero; the exporter then drops them, leaving holes that slicers
        // report as non-manifold edges.)
        const roundedFacePoints = options.smoothBoundary
            ? facePoints.map(
                  (point) =>
                      new Vector2(
                          Math.round(point.x * THREE_MF_COORD_SCALE),
                          Math.round(point.y * THREE_MF_COORD_SCALE)
                      )
              )
            : facePoints;
        const capAreaEpsilon = Math.max(Number.EPSILON, 1e-8 * pixelSize * pixelSize);
        const faces = options.smoothBoundary
            ? triangulateBoundaryPreservingVertices(
                  facePoints,
                  roundedFacePoints,
                  capAreaEpsilon
              )
            : ShapeUtils.triangulateShape(facePoints, []);
        if (!faces) {
            throw new Error('Unable to triangulate a smoothed cap without breaking topology');
        }

        for (const [a, b, c] of faces) {
            indices.push(topLoop[a], topLoop[b], topLoop[c]);
            if (!skipBottomCap) {
                indices.push(bottomLoop[a], bottomLoop[c], bottomLoop[b]);
            }
        }

        await maybeYield();
    }

    reportProgress({
        phase: 'walls',
        label: meshLabel(options.mesher, 'Collecting mesh walls'),
        progress: 0.62,
    });

    const northWalls = new Map<number, number[]>();
    const southWalls = new Map<number, number[]>();
    const westWalls = new Map<number, number[]>();
    const eastWalls = new Map<number, number[]>();

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!meshingPixels[y * width + x]) continue;

            if (y === 0 || !meshingPixels[(y - 1) * width + x]) {
                if (!northWalls.has(y)) northWalls.set(y, []);
                northWalls.get(y)!.push(x);
            }

            if (y === height - 1 || !meshingPixels[(y + 1) * width + x]) {
                const wallY = y + 1;
                if (!southWalls.has(wallY)) southWalls.set(wallY, []);
                southWalls.get(wallY)!.push(x);
            }

            if (x === 0 || !meshingPixels[y * width + (x - 1)]) {
                if (!westWalls.has(x)) westWalls.set(x, []);
                westWalls.get(x)!.push(y);
            }

            if (x === width - 1 || !meshingPixels[y * width + (x + 1)]) {
                const wallX = x + 1;
                if (!eastWalls.has(wallX)) eastWalls.set(wallX, []);
                eastWalls.get(wallX)!.push(y);
            }
        }

        await maybeYield();
    }

    reportProgress({
        phase: 'walls',
        label: meshLabel(options.mesher, 'Building mesh walls'),
        progress: 0.8,
    });

    const mergeAndEmitHorizontalWalls = (
        wallMap: Map<number, number[]>,
        yCoord: number,
        isSouth: boolean
    ) => {
        const xCoords = wallMap.get(yCoord);
        if (!xCoords || xCoords.length === 0) return;

        xCoords.sort((a, b) => a - b);

        const requiredVertices = verticesAtY.get(yCoord) || new Set<number>();

        let runStart = xCoords[0];
        let runEnd = runStart + 1;

        for (let i = 1; i <= xCoords.length; i++) {
            const nextX = i < xCoords.length ? xCoords[i] : -1;
            const isContiguous = nextX === runEnd;
            const mustSplit = requiredVertices.has(runEnd) && isContiguous;

            if (!isContiguous || mustSplit || i === xCoords.length) {
                const wTL = getOrAddVertex(runStart, yCoord, true);
                const wTR = getOrAddVertex(runEnd, yCoord, true);
                const wBR = getOrAddVertex(runEnd, yCoord, false);
                const wBL = getOrAddVertex(runStart, yCoord, false);

                if (isSouth) {
                    addQuadCCW(wBL, wTL, wTR, wBR);
                } else {
                    addQuadCCW(wBR, wTR, wTL, wBL);
                }

                if (mustSplit && isContiguous) {
                    runStart = runEnd;
                    runEnd = runStart + 1;
                } else if (i < xCoords.length) {
                    runStart = nextX;
                    runEnd = runStart + 1;
                }
            } else {
                runEnd = nextX + 1;
            }
        }
    };

    const mergeAndEmitVerticalWalls = (
        wallMap: Map<number, number[]>,
        xCoord: number,
        isEast: boolean
    ) => {
        const yCoords = wallMap.get(xCoord);
        if (!yCoords || yCoords.length === 0) return;

        yCoords.sort((a, b) => a - b);

        const requiredVertices = verticesAtX.get(xCoord) || new Set<number>();

        let runStart = yCoords[0];
        let runEnd = runStart + 1;

        for (let i = 1; i <= yCoords.length; i++) {
            const nextY = i < yCoords.length ? yCoords[i] : -1;
            const isContiguous = nextY === runEnd;
            const mustSplit = requiredVertices.has(runEnd) && isContiguous;

            if (!isContiguous || mustSplit || i === yCoords.length) {
                const wTL = getOrAddVertex(xCoord, runStart, true);
                const wTR = getOrAddVertex(xCoord, runEnd, true);
                const wBR = getOrAddVertex(xCoord, runEnd, false);
                const wBL = getOrAddVertex(xCoord, runStart, false);

                if (isEast) {
                    addQuadCCW(wBR, wTR, wTL, wBL);
                } else {
                    addQuadCCW(wBL, wTL, wTR, wBR);
                }

                if (mustSplit && isContiguous) {
                    runStart = runEnd;
                    runEnd = runStart + 1;
                } else if (i < yCoords.length) {
                    runStart = nextY;
                    runEnd = runStart + 1;
                }
            } else {
                runEnd = nextY + 1;
            }
        }
    };

    for (const [y] of northWalls) {
        mergeAndEmitHorizontalWalls(northWalls, y, false);
        await maybeYield();
    }
    for (const [y] of southWalls) {
        mergeAndEmitHorizontalWalls(southWalls, y, true);
        await maybeYield();
    }
    for (const [x] of westWalls) {
        mergeAndEmitVerticalWalls(westWalls, x, false);
        await maybeYield();
    }
    for (const [x] of eastWalls) {
        mergeAndEmitVerticalWalls(eastWalls, x, true);
        await maybeYield();
    }

    reportProgress({
        phase: 'walls',
        label: options.mesher === 'smooth' ? 'Smooth mesh geometry complete' : 'Mesh geometry complete',
        progress: 1,
    });

    const outputPositions = new Float32Array(positions);

    return {
        positions: outputPositions,
        indices,
        metrics: {
            mesher: options.mesher,
            elapsedMs: performance.now() - startedAt,
            activePixelCount,
            vertexCount: outputPositions.length / 3,
            triangleCount: indices.length / 3,
        },
    };
}

/**
 * Generates a fast smoothed mesh by reusing the greedy mesher's welded topology
 * and applying deterministic boundary-chain vertex smoothing.
 */
export async function generateSmoothMesh(
    activePixels: PixelMask,
    width: number,
    height: number,
    thickness: number,
    zOffset: number,
    pixelSize: number,
    heightScale: number,
    options?: MeshYieldOptions
): Promise<MeshData> {
    return generateGridMesh(activePixels, width, height, thickness, zOffset, pixelSize, heightScale, {
        ...options,
        mesher: 'smooth',
        smoothBoundary: true,
    });
}

/**
 * Generates an optimized 3D mesh for a layer of voxel-like pixels using Maximal Rectangle Greedy Meshing.
 * This approach minimizes the triangle count by merging active regions into large rectangles.
 *
 * T-Junction Prevention: Walls are generated in a separate global pass to ensure all wall
 * vertices align properly, preventing non-manifold edges that cause slicer artifacts.
 *
 * Coordinate system: X+ right, Y+ down (image coords), Z+ up
 * All faces use CCW winding when viewed from outside (right-hand rule for outward normals)
 *
 * @param activePixels Row-major array where >0 indicates presence of a pixel
 * @param width Width of the pixel grid
 * @param height Height of the pixel grid
 * @param thickness Thickness of the layer (Z height)
 * @param zOffset Base Z height of the layer
 * @param pixelSize XY scaling factor (usually mm per pixel)
 * @param heightScale Z scaling factor
 */
export async function generateGreedyMesh(
    activePixels: PixelMask,
    width: number,
    height: number,
    thickness: number,
    zOffset: number,
    pixelSize: number,
    heightScale: number,
    options?: MeshYieldOptions
): Promise<MeshData> {
    return generateGridMesh(activePixels, width, height, thickness, zOffset, pixelSize, heightScale, {
        ...options,
        mesher: 'greedy',
        smoothBoundary: false,
    });
}
