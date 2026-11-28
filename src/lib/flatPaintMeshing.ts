import { Vector2 } from 'three';
import type { SmoothMeshingStrength } from '../types/index.ts';
import {
    createBoundaryVertexMapperAsync,
    triangulateBoundaryPreservingVertices,
    type MeshData,
    type MeshYieldOptions,
} from './meshing.ts';

type Point = { key: string; id: number; x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

// Keep each synchronous triangulation bounded, including successful caps.
const MAX_CAP_BOUNDARY_VERTICES = 1024;

function createYield(options: MeshYieldOptions) {
    let lastYield = performance.now();
    return async () => {
        if (performance.now() - lastYield < (options.yieldIntervalMs ?? 8)) return;
        await (
            options.onYield ?? (() => new Promise<void>((r) => requestAnimationFrame(() => r())))
        )();
        lastYield = performance.now();
    };
}

/**
 * The XY tessellation shared by every class, the carrier and the export solids:
 * smoothed grid vertices plus the diamonds that connect repeated diagonal
 * classes. Each pixel's polygon belongs to that pixel alone.
 */
async function createTessellation(
    layerCounts: Uint32Array | Uint16Array | Uint8Array,
    width: number,
    height: number,
    strength: SmoothMeshingStrength,
    options: MeshYieldOptions
) {
    const maybeYield = createYield(options);
    const stride = width + 1;
    const getCell = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < width && y < height ? layerCounts[y * width + x] : 0;
    const neighbors = new Map<number, Set<number>>();
    const addEdge = (a: number, b: number) => {
        if (!neighbors.has(a)) neighbors.set(a, new Set());
        if (!neighbors.has(b)) neighbors.set(b, new Set());
        neighbors.get(a)!.add(b);
        neighbors.get(b)!.add(a);
    };

    // Label transitions include both internal color boundaries and transparency.
    for (let y = 0; strength !== 'none' && y < height; y++) {
        for (let x = 0; x < width; x++) {
            const label = getCell(x, y);
            if (!label) continue;
            const key = y * stride + x;
            if (getCell(x, y - 1) !== label) addEdge(key, key + 1);
            if (getCell(x + 1, y) !== label) addEdge(key + 1, key + stride + 1);
            if (getCell(x, y + 1) !== label) addEdge(key + stride, key + stride + 1);
            if (getCell(x - 1, y) !== label) addEdge(key, key + stride);
        }
        await maybeYield();
    }
    // Pin junctions rather than pulling a three/four-color intersection toward
    // one of its branches. All other chains use the existing strength presets.
    const mapVertex =
        strength === 'none'
            ? (x: number, y: number): [number, number] => [x, y]
            : await createBoundaryVertexMapperAsync(
                  neighbors,
                  width,
                  height,
                  strength,
                  true,
                  options
              );

    // A repeated diagonal class must connect across an edge, not a zero-width
    // contact. Assign a small shared diamond to one incident cell. The other
    // cells trim that same diamond from their corners; no mask is independently
    // expanded, and no whole source pixel is recolored or added.
    const diamondOwners = new Map<number, number>();
    const specialCells = new Uint8Array(width * height);
    for (let y = 1; y < height; y++) {
        for (let x = 1; x < width; x++) {
            const a = getCell(x - 1, y - 1);
            const b = getCell(x, y - 1);
            const c = getCell(x - 1, y);
            const d = getCell(x, y);
            const nw = a > 0 && d > 0 && ((a === d && a !== b && a !== c) || (!b && !c));
            const ne = b > 0 && c > 0 && ((b === c && b !== a && b !== d) || (!a && !d));
            if (!nw && !ne) continue;
            const owner = nw && (!ne || a < b) ? (y - 1) * width + x - 1 : (y - 1) * width + x;
            diamondOwners.set(y * stride + x, owner);
            for (const index of [
                (y - 1) * width + x - 1,
                (y - 1) * width + x,
                y * width + x - 1,
                y * width + x,
            ])
                specialCells[index] = 1;
        }
        await maybeYield();
    }

    const gridPointCount = stride * (height + 1);
    const vertex = (x: number, y: number): Point => {
        const [mx, my] = mapVertex(x, y);
        return { key: `v${y * stride + x}`, id: y * stride + x, x: mx, y: my };
    };
    const directions = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
    ] as const;
    const diamondPoint = (x: number, y: number, direction: number): Point => {
        const center = vertex(x, y);
        const [dx, dy] = directions[direction];
        const neighbor = vertex(x + dx, y + dy);
        return {
            key: `d${y * stride + x}/${direction}`,
            id: gridPointCount + (y * stride + x) * 4 + direction,
            x: center.x + (neighbor.x - center.x) * 0.1,
            y: center.y + (neighbor.y - center.y) * 0.1,
        };
    };
    const cellPolygon = (
        x: number,
        y: number,
        includeOwnedDiamonds = true,
        cornerVertex: (vx: number, vy: number, east: boolean) => Point = vertex
    ): Point[] => {
        const polygon: Point[] = [];
        const corners = [
            [x, y],
            [x + 1, y],
            [x + 1, y + 1],
            [x, y + 1],
        ];
        const incoming = [2, 3, 0, 1];
        const outgoing = [1, 2, 3, 0];
        for (let corner = 0; corner < 4; corner++) {
            const [vx, vy] = corners[corner];
            const owner = diamondOwners.get(vy * stride + vx);
            if (owner === undefined) {
                polygon.push(cornerVertex(vx, vy, vx === x));
            } else if (includeOwnedDiamonds && owner === y * width + x) {
                for (let step = 0; step < 4; step++) {
                    polygon.push(diamondPoint(vx, vy, (incoming[corner] + step) % 4));
                }
            } else {
                polygon.push(diamondPoint(vx, vy, incoming[corner]));
                polygon.push(diamondPoint(vx, vy, outgoing[corner]));
            }
        }
        return polygon;
    };

    return {
        stride,
        /** Point ids: grid vertices, then four diamond points per grid vertex. */
        gridPointCount,
        vertex,
        diamondPoint,
        directions,
        cellPolygon,
        diamondOwners,
        specialCells,
    };
}

/**
 * One XY tessellation for every class and the carrier. The same class footprint
 * is reused at every Z level, so color interfaces and the carrier meet exactly.
 * None keeps grid vertices fixed, but shares corner repairs too: repairing
 * each binary mask independently can expand neighboring colors into each other.
 */
export async function createFlatPaintMesher(
    layerCounts: Uint32Array | Uint16Array | Uint8Array,
    width: number,
    height: number,
    pixelSize: number,
    strength: SmoothMeshingStrength,
    options: MeshYieldOptions = {}
): Promise<(mask: Uint8Array, options?: MeshYieldOptions) => Promise<MeshData>> {
    const { stride, vertex, diamondPoint, directions, cellPolygon, diamondOwners, specialCells } =
        await createTessellation(layerCounts, width, height, strength, options);

    return async (mask, meshOptions = {}) => {
        const startedAt = performance.now();
        const yieldMesh = createYield(meshOptions);
        const positions: number[] = [];
        const indices: number[] = [];
        const vertices = new Map<string, number>();
        const walls = new Map<string, [Point, Point]>();
        const visited = new Uint8Array(width * height);
        let activePixelCount = 0;
        let completedCapCells = 0;
        let lastCapProgress = 0;
        const reportCapsProgress = (progress: number) => {
            lastCapProgress = Math.max(lastCapProgress, progress);
            meshOptions.onProgress?.({
                phase: 'caps',
                label: strength === 'none' ? 'Building mesh caps' : 'Building smooth mesh caps',
                progress: lastCapProgress,
            });
        };
        // A mask that joins different classes can hold two diagonal cells
        // without the other two at a corner the label repair left alone. Each
        // side keeps its own vertex there, so the shell touches itself along a
        // line, as separate class shells did, instead of four walls sharing an
        // edge.
        const cornerVertex = (vx: number, vy: number, east: boolean): Point => {
            const point = vertex(vx, vy);
            if (vx <= 0 || vy <= 0 || vx >= width || vy >= height) return point;
            const nw = mask[(vy - 1) * width + vx - 1];
            const ne = mask[(vy - 1) * width + vx];
            const sw = mask[vy * width + vx - 1];
            const se = mask[vy * width + vx];
            if (nw === ne || nw !== se || ne !== sw) return point;
            return { ...point, key: `${point.key}${east ? 'e' : 'w'}` };
        };
        const getVertex = (point: Point, top: boolean) => {
            const key = `${point.key}/${top ? 1 : 0}`;
            let index = vertices.get(key);
            if (index === undefined) {
                index = positions.length / 3;
                positions.push(point.x * pixelSize, point.y * pixelSize, top ? 1 : 0);
                vertices.set(key, index);
            }
            return index;
        };
        const emitPolygon = (polygon: Point[]) => {
            const points = polygon.map(
                (p) => new Vector2(Math.fround(p.x * pixelSize), Math.fround(p.y * pixelSize))
            );
            const rounded = points.map(
                (p) => new Vector2(Math.round(p.x * 100_000), Math.round(p.y * 100_000))
            );
            const faces = triangulateBoundaryPreservingVertices(
                points,
                rounded,
                Math.max(Number.EPSILON, 1e-8 * pixelSize * pixelSize)
            );
            if (!faces) return false;
            const top = polygon.map((p) => getVertex(p, true));
            const bottom = polygon.map((p) => getVertex(p, false));
            for (const [a, b, c] of faces) {
                indices.push(top[a], top[b], top[c], bottom[a], bottom[c], bottom[b]);
            }
            for (let i = 0; i < polygon.length; i++) {
                const a = polygon[i];
                const b = polygon[(i + 1) % polygon.length];
                const key = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
                // Interior edges cancel between conforming cap polygons.
                if (walls.has(key)) walls.delete(key);
                else walls.set(key, [a, b]);
            }
            return true;
        };
        const emitRectangle = async (rectangle: Rect) => {
            const reportChunks = 2 * (rectangle.w + rectangle.h) > MAX_CAP_BOUNDARY_VERTICES;
            const pending = [rectangle];
            while (pending.length > 0) {
                const { x, y, w, h } = pending.pop()!;
                if (2 * (w + h) <= MAX_CAP_BOUNDARY_VERTICES) {
                    const polygon: Point[] = [];
                    // Every grid edge is split identically across classes,
                    // the carrier, and differently merged rectangles.
                    // Only rectangle corners can be diagonal contacts.
                    for (let dx = 0; dx < w; dx++) polygon.push(cornerVertex(x + dx, y, true));
                    for (let dy = 0; dy < h; dy++) polygon.push(cornerVertex(x + w, y + dy, false));
                    for (let dx = w; dx > 0; dx--) polygon.push(cornerVertex(x + dx, y + h, false));
                    for (let dy = h; dy > 0; dy--) polygon.push(cornerVertex(x, y + dy, true));
                    if (emitPolygon(polygon)) {
                        completedCapCells += w * h;
                        if (reportChunks) {
                            reportCapsProgress((completedCapCells / (width * height)) * 0.9);
                        }
                        await yieldMesh();
                        continue;
                    }
                }
                // Split before large triangulations, and on precision failure.
                // Unit edge IDs stay shared; interior walls cancel exactly.
                // LIFO order emits the left/upper half first, as before.
                if (w >= h && w > 1) {
                    const left = Math.floor(w / 2);
                    pending.push({ x: x + left, y, w: w - left, h }, { x, y, w: left, h });
                } else if (h > 1) {
                    const upper = Math.floor(h / 2);
                    pending.push({ x, y: y + upper, w, h: h - upper }, { x, y, w, h: upper });
                } else {
                    throw new Error(
                        'Unable to triangulate a smoothed cap without breaking topology'
                    );
                }
            }
        };
        reportCapsProgress(0);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Dense rows may contain many small special-cell caps.
                if (x % 128 === 0) await yieldMesh();
                const index = y * width + x;
                if (mask[index]) activePixelCount++;
                if (!mask[index] || visited[index]) continue;
                if (specialCells[index]) {
                    visited[index] = 1;
                    if (!emitPolygon(cellPolygon(x, y, true, cornerVertex))) {
                        // A concave corner repair can defeat ear clipping when
                        // almost-collinear edges round differently in Float32
                        // and 3MF coordinates. Split off the owned diamonds:
                        // the same footprint and boundary vertices are retained,
                        // and the internal edges cancel just like rectangle caps.
                        const pieces = [cellPolygon(x, y, false, cornerVertex)];
                        for (const [vx, vy] of [
                            [x, y],
                            [x + 1, y],
                            [x + 1, y + 1],
                            [x, y + 1],
                        ]) {
                            if (diamondOwners.get(vy * stride + vx) === index) {
                                pieces.push(
                                    directions.map((_, direction) =>
                                        diamondPoint(vx, vy, direction)
                                    )
                                );
                            }
                        }
                        if (!pieces.every(emitPolygon)) {
                            throw new Error(
                                `Unable to triangulate a Flat Paint cap at pixel (${x}, ${y}) without breaking topology`
                            );
                        }
                    }
                    completedCapCells++;
                    continue;
                }
                let w = 1;
                while (
                    x + w < width &&
                    mask[index + w] &&
                    !visited[index + w] &&
                    !specialCells[index + w]
                )
                    w++;
                let h = 1;
                while (y + h < height) {
                    let extend = true;
                    for (let dx = 0; dx < w; dx++) {
                        const next = (y + h) * width + x + dx;
                        if (!mask[next] || visited[next] || specialCells[next]) {
                            extend = false;
                            break;
                        }
                    }
                    if (!extend) break;
                    h++;
                    await yieldMesh();
                }
                for (let dy = 0; dy < h; dy++)
                    visited.fill(1, (y + dy) * width + x, (y + dy) * width + x + w);
                await emitRectangle({ x, y, w, h });
            }
            reportCapsProgress(((y + 1) / height) * 0.9);
            await yieldMesh();
        }
        for (const [a, b] of walls.values()) {
            const ab = getVertex(a, false);
            const bb = getVertex(b, false);
            const at = getVertex(a, true);
            const bt = getVertex(b, true);
            indices.push(ab, bb, bt, ab, bt, at);
            await yieldMesh();
        }
        meshOptions.onProgress?.({
            phase: 'walls',
            label: strength === 'none' ? 'Mesh geometry complete' : 'Smooth mesh geometry complete',
            progress: 1,
        });
        return {
            positions: new Float32Array(positions),
            indices,
            metrics: {
                mesher: strength === 'none' ? 'greedy' : 'smooth',
                elapsedMs: performance.now() - startedAt,
                activePixelCount,
                vertexCount: positions.length / 3,
                triangleCount: indices.length / 3,
            },
        };
    };
}

/** One filament's coverage, for {@link createFlatPaintSolidMesher}. */
export interface SolidColumns {
    /** Z of each level in output units, ascending. */
    levels: readonly number[];
    /** Coverage profile per pixel, or -1 where nothing prints. */
    profiles: Int32Array;
    /**
     * Per profile, the filament's covered levels as flat [start, end) pairs,
     * ascending, with touching ranges merged.
     */
    runs: readonly (readonly number[])[];
}

interface CellEdges {
    /** Edge from `a` to `b` as the `left` pixel's polygon runs it. */
    a: Point[];
    b: Point[];
    left: number[];
    /** The pixel across the edge, or -1. */
    right: number[];
}

const NO_RUNS: readonly number[] = [];

/**
 * Gives each sheet its own vertex copies where a closed surface touches itself
 * along an edge or at a point, so every edge joins exactly two triangles.
 * Input vertices must be unique per position. The four triangles on a pinched
 * edge pair up around each filled wedge, which keeps solids that only touch
 * apart. Where the solid also connects around both ends of such an edge, that
 * leaves both pairs on the same two vertices; those edges pair around the empty
 * wedges instead, which splits the vertex at one end.
 *
 * Triangles are ordered around an edge by their normals, with caps taken as
 * exactly up or down (`capSides`: 1, -1, or 0 for walls). A sliver cap
 * triangle's third vertex can lie on either side of the edge.
 */
async function splitPinchedVertices(
    positions: number[],
    indices: number[],
    capSides: number[],
    maybeYield: () => Promise<void>
): Promise<{ positions: number[]; indices: number[] }> {
    const corners = indices.length;
    const vertexCount = positions.length / 3;
    const next = (h: number) => (h % 3 === 2 ? h - 2 : h + 1);
    const edgeHead = new Map<number, number>();
    const edgeLink = new Int32Array(corners);
    for (let h = 0; h < corners; h++) {
        const u = indices[h];
        const v = indices[next(h)];
        const key = u < v ? u * vertexCount + v : v * vertexCount + u;
        edgeLink[h] = edgeHead.get(key) ?? -1;
        edgeHead.set(key, h);
    }

    // Half-edge h runs from corner h to corner next(h); its mate runs back.
    const mate = new Int32Array(corners).fill(-1);
    const pinches: number[][] = [];
    const radialOrder = (edges: number[]) => {
        const a = Math.min(indices[edges[0]], indices[next(edges[0])]);
        const b = Math.max(indices[edges[0]], indices[next(edges[0])]);
        const d = [0, 1, 2].map((k) => positions[b * 3 + k] - positions[a * 3 + k]);
        const length = Math.hypot(d[0], d[1], d[2]);
        for (let k = 0; k < 3; k++) d[k] /= length;
        const axis = [0, 1, 2].reduce((best, k) => (Math.abs(d[k]) < Math.abs(d[best]) ? k : best));
        const u = [0, 0, 0];
        u[axis] = 1;
        for (let k = 0; k < 3; k++) u[k] -= d[axis] * d[k];
        const uLength = Math.hypot(u[0], u[1], u[2]);
        for (let k = 0; k < 3; k++) u[k] /= uLength;
        const w = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
        // A triangle lies on the side n × e of an edge it runs along e.
        const angle = (h: number) => {
            const from = indices[h] * 3;
            const to = indices[next(h)] * 3;
            const e = [0, 1, 2].map((k) => positions[to + k] - positions[from + k]);
            let n = [0, 0, capSides[Math.floor(h / 3)]];
            if (n[2] === 0) {
                const c = indices[next(next(h))] * 3;
                const f = [0, 1, 2].map((k) => positions[c + k] - positions[from + k]);
                n = [
                    e[1] * f[2] - e[2] * f[1],
                    e[2] * f[0] - e[0] * f[2],
                    e[0] * f[1] - e[1] * f[0],
                ];
            }
            const t = [
                n[1] * e[2] - n[2] * e[1],
                n[2] * e[0] - n[0] * e[2],
                n[0] * e[1] - n[1] * e[0],
            ];
            return Math.atan2(
                t[0] * w[0] + t[1] * w[1] + t[2] * w[2],
                t[0] * u[0] + t[1] * u[1] + t[2] * u[2]
            );
        };
        const sorted = [...edges].sort((p, q) => angle(p) - angle(q));
        // Turning from a triangle running b→a toward the next one crosses
        // filled space: outward normals face the other way.
        const start = sorted.findIndex((h) => indices[h] === b);
        const order = sorted.map((_, k) => sorted[(start + k) % 4]);
        if (order.some((h, k) => (indices[h] === b) !== (k % 2 === 0))) {
            throw new Error('Flat Paint solid has a pinched edge without alternating sheets');
        }
        return order;
    };
    for (const first of edgeHead.values()) {
        const edges: number[] = [];
        for (let h = first; h !== -1; h = edgeLink[h]) edges.push(h);
        if (edges.length === 2 && indices[edges[0]] === indices[next(edges[1])]) {
            mate[edges[0]] = edges[1];
            mate[edges[1]] = edges[0];
        } else if (edges.length === 4) {
            pinches.push(radialOrder(edges));
        } else {
            throw new Error('Flat Paint solid has an edge without two opposite triangles');
        }
    }
    await maybeYield();

    const parent = new Int32Array(corners);
    const find = (h: number) => {
        while (parent[h] !== h) {
            parent[h] = parent[parent[h]];
            h = parent[h];
        }
        return h;
    };
    const union = (p: number, q: number) => {
        const rp = find(p);
        const rq = find(q);
        if (rp !== rq) parent[rp] = rq;
    };
    // 0 pairs around filled wedges, 1 around empty ones.
    const modes = new Uint8Array(pinches.length);
    const pairs = (order: number[], mode: number) =>
        mode === 0
            ? [
                  [order[0], order[1]],
                  [order[2], order[3]],
              ]
            : [
                  [order[1], order[2]],
                  [order[3], order[0]],
              ];
    for (let round = 0; ; round++) {
        pinches.forEach((order, i) => {
            for (const [p, q] of pairs(order, modes[i])) {
                mate[p] = q;
                mate[q] = p;
            }
        });
        for (let h = 0; h < corners; h++) parent[h] = h;
        for (let h = 0; h < corners; h++) {
            const m = mate[h];
            if (m < h) continue;
            union(h, next(m));
            union(next(h), m);
        }
        // Flip one shared edge per vertex sheet a round: each flip splits it.
        const claimed = new Set<number>();
        let flipped = false;
        pinches.forEach((order, i) => {
            // The first triangle of each pair runs the edge the same way.
            const [[p], [q]] = pairs(order, modes[i]);
            const ends = [find(p), find(next(p))];
            const shared = ends[0] === find(q) && ends[1] === find(next(q));
            if (!shared || claimed.has(ends[0]) || claimed.has(ends[1])) return;
            claimed.add(ends[0]);
            claimed.add(ends[1]);
            modes[i] ^= 1;
            flipped = true;
        });
        if (!flipped) break;
        if (round > 64) throw new Error('Unable to separate a pinched Flat Paint solid');
        await maybeYield();
    }

    const copies = new Map<number, number>();
    const splitPositions: number[] = [];
    const splitIndices = new Array<number>(corners);
    for (let h = 0; h < corners; h++) {
        const root = find(h);
        let index = copies.get(root);
        if (index === undefined) {
            index = splitPositions.length / 3;
            const source = indices[h] * 3;
            splitPositions.push(positions[source], positions[source + 1], positions[source + 2]);
            copies.set(root, index);
        }
        splitIndices[h] = index;
    }
    return { positions: splitPositions, indices: splitIndices };
}

/**
 * Meshes one filament as a single stepped solid over the shared XY
 * tessellation. Each pixel column covers some level ranges. Caps sit only where
 * a column's coverage starts or ends and walls only where neighboring columns
 * differ, so no faces lie inside the filament. Each wall is split at every
 * level where another face meets its corners, which avoids T-junctions. Where
 * the solid touches itself along an edge or at a point, each side keeps its own
 * vertices: export these meshes without re-welding them by coordinate.
 */
export async function createFlatPaintSolidMesher(
    layerCounts: Uint32Array | Uint16Array | Uint8Array,
    width: number,
    height: number,
    pixelSize: number,
    strength: SmoothMeshingStrength,
    options: MeshYieldOptions = {}
): Promise<(columns: SolidColumns, options?: MeshYieldOptions) => Promise<MeshData>> {
    const {
        stride,
        gridPointCount,
        vertex,
        directions,
        diamondPoint,
        cellPolygon,
        diamondOwners,
        specialCells,
    } = await createTessellation(layerCounts, width, height, strength, options);
    const gridPoints = new Map<number, Point>();
    const gridPoint = (x: number, y: number) => {
        const id = y * stride + x;
        let point = gridPoints.get(id);
        if (!point) {
            point = vertex(x, y);
            gridPoints.set(id, point);
        }
        return point;
    };
    const pointIdCount = gridPointCount * 5;
    const edgeCache = new WeakMap<Int32Array, CellEdges>();
    const cellEdges = async (profiles: Int32Array, maybeYield: () => Promise<void>) => {
        const cached = edgeCache.get(profiles);
        if (cached) return cached;
        const edges: CellEdges = { a: [], b: [], left: [], right: [] };
        const slots = new Map<number | string, number>();
        const numericKeys = pointIdCount * pointIdCount <= Number.MAX_SAFE_INTEGER;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const cell = y * width + x;
                if (profiles[cell] < 0) continue;
                const polygon = specialCells[cell]
                    ? cellPolygon(x, y)
                    : [
                          gridPoint(x, y),
                          gridPoint(x + 1, y),
                          gridPoint(x + 1, y + 1),
                          gridPoint(x, y + 1),
                      ];
                for (let i = 0; i < polygon.length; i++) {
                    const a = polygon[i];
                    const b = polygon[(i + 1) % polygon.length];
                    const low = Math.min(a.id, b.id);
                    const high = Math.max(a.id, b.id);
                    const key = numericKeys ? low * pointIdCount + high : `${low}|${high}`;
                    const slot = slots.get(key);
                    if (slot === undefined) {
                        slots.set(key, edges.a.length);
                        edges.a.push(a);
                        edges.b.push(b);
                        edges.left.push(cell);
                        edges.right.push(-1);
                    } else {
                        // Conforming polygons run a shared edge in opposite directions.
                        edges.right[slot] = cell;
                    }
                }
            }
            await maybeYield();
        }
        edgeCache.set(profiles, edges);
        return edges;
    };

    return async ({ levels, profiles, runs }, meshOptions = {}) => {
        const startedAt = performance.now();
        const yieldMesh = createYield(meshOptions);
        const edges = await cellEdges(profiles, yieldMesh);
        const levelCount = levels.length;
        const positions: number[] = [];
        const indices: number[] = [];
        const capSides: number[] = [];
        const vertices = new Map<number, number>();
        // Levels with a vertex at each point, for splitting walls.
        const pointLevels = new Map<number, number[]>();
        const getVertex = (point: Point, level: number) => {
            const key = point.id * levelCount + level;
            let index = vertices.get(key);
            if (index === undefined) {
                index = positions.length / 3;
                positions.push(point.x * pixelSize, point.y * pixelSize, levels[level]);
                vertices.set(key, index);
                const used = pointLevels.get(point.id);
                if (used) used.push(level);
                else pointLevels.set(point.id, [level]);
            }
            return index;
        };

        // Caps: one pass per level for bottoms (facing down) and tops.
        const bottoms = Array.from({ length: levelCount }, () => [] as number[]);
        const tops = Array.from({ length: levelCount }, () => [] as number[]);
        let activePixelCount = 0;
        for (let cell = 0; cell < width * height; cell++) {
            const cellRuns = profiles[cell] < 0 ? NO_RUNS : runs[profiles[cell]];
            if (cellRuns.length > 0) activePixelCount++;
            for (let i = 0; i < cellRuns.length; i += 2) {
                bottoms[cellRuns[i]].push(cell);
                tops[cellRuns[i + 1]].push(cell);
            }
        }
        const emitCap = (polygon: Point[], level: number, up: boolean) => {
            const points = polygon.map(
                (p) => new Vector2(Math.fround(p.x * pixelSize), Math.fround(p.y * pixelSize))
            );
            const rounded = points.map(
                (p) => new Vector2(Math.round(p.x * 100_000), Math.round(p.y * 100_000))
            );
            const faces = triangulateBoundaryPreservingVertices(
                points,
                rounded,
                Math.max(Number.EPSILON, 1e-8 * pixelSize * pixelSize)
            );
            if (!faces) return false;
            const ids = polygon.map((p) => getVertex(p, level));
            for (const [a, b, c] of faces) {
                if (up) indices.push(ids[a], ids[b], ids[c]);
                else indices.push(ids[a], ids[c], ids[b]);
                capSides.push(up ? 1 : -1);
            }
            return true;
        };
        const emitRectangle = async (rectangle: Rect, level: number, up: boolean) => {
            const pending = [rectangle];
            while (pending.length > 0) {
                const { x, y, w, h } = pending.pop()!;
                if (2 * (w + h) <= MAX_CAP_BOUNDARY_VERTICES) {
                    // Every grid vertex on the outline, as on neighboring walls.
                    const polygon: Point[] = [];
                    for (let dx = 0; dx < w; dx++) polygon.push(gridPoint(x + dx, y));
                    for (let dy = 0; dy < h; dy++) polygon.push(gridPoint(x + w, y + dy));
                    for (let dx = w; dx > 0; dx--) polygon.push(gridPoint(x + dx, y + h));
                    for (let dy = h; dy > 0; dy--) polygon.push(gridPoint(x, y + dy));
                    if (emitCap(polygon, level, up)) {
                        await yieldMesh();
                        continue;
                    }
                }
                if (w >= h && w > 1) {
                    const left = Math.floor(w / 2);
                    pending.push({ x: x + left, y, w: w - left, h }, { x, y, w: left, h });
                } else if (h > 1) {
                    const upper = Math.floor(h / 2);
                    pending.push({ x, y: y + upper, w, h: h - upper }, { x, y, w, h: upper });
                } else {
                    throw new Error(
                        'Unable to triangulate a smoothed cap without breaking topology'
                    );
                }
            }
        };
        const emitSpecialCell = (x: number, y: number, level: number, up: boolean) => {
            if (emitCap(cellPolygon(x, y), level, up)) return;
            // Same fallback as the slab mesher: split off the owned diamonds.
            const pieces = [cellPolygon(x, y, false)];
            for (const [vx, vy] of [
                [x, y],
                [x + 1, y],
                [x + 1, y + 1],
                [x, y + 1],
            ]) {
                if (diamondOwners.get(vy * stride + vx) === y * width + x) {
                    pieces.push(directions.map((_, direction) => diamondPoint(vx, vy, direction)));
                }
            }
            if (!pieces.every((piece) => emitCap(piece, level, up))) {
                throw new Error(
                    `Unable to triangulate a Flat Paint cap at pixel (${x}, ${y}) without breaking topology`
                );
            }
        };
        const mask = new Uint8Array(width * height);
        const visited = new Uint8Array(width * height);
        for (let level = 0; level < levelCount; level++) {
            for (const [cells, up] of [
                [bottoms[level], false],
                [tops[level], true],
            ] as const) {
                if (cells.length === 0) continue;
                for (const cell of cells) mask[cell] = 1;
                for (const index of cells) {
                    if (visited[index]) continue;
                    const x = index % width;
                    const y = (index - x) / width;
                    if (specialCells[index]) {
                        visited[index] = 1;
                        emitSpecialCell(x, y, level, up);
                        continue;
                    }
                    let w = 1;
                    while (
                        x + w < width &&
                        mask[index + w] &&
                        !visited[index + w] &&
                        !specialCells[index + w]
                    )
                        w++;
                    let h = 1;
                    while (y + h < height) {
                        let extend = true;
                        for (let dx = 0; dx < w; dx++) {
                            const next = (y + h) * width + x + dx;
                            if (!mask[next] || visited[next] || specialCells[next]) {
                                extend = false;
                                break;
                            }
                        }
                        if (!extend) break;
                        h++;
                    }
                    for (let dy = 0; dy < h; dy++)
                        visited.fill(1, (y + dy) * width + x, (y + dy) * width + x + w);
                    await emitRectangle({ x, y, w, h }, level, up);
                }
                for (const cell of cells) {
                    mask[cell] = 0;
                    visited[cell] = 0;
                }
                await yieldMesh();
            }
        }

        // Walls: level ranges where exactly one side of an edge is covered,
        // facing the uncovered side.
        const walls: Array<{ from: Point; to: Point; start: number; end: number }> = [];
        for (let edge = 0; edge < edges.a.length; edge++) {
            const leftProfile = profiles[edges.left[edge]];
            const rightProfile = edges.right[edge] < 0 ? -1 : profiles[edges.right[edge]];
            if (leftProfile === rightProfile) continue;
            const leftRuns = runs[leftProfile];
            const rightRuns = rightProfile < 0 ? NO_RUNS : runs[rightProfile];
            if (leftRuns.length === 0 && rightRuns.length === 0) continue;
            const marks = [...new Set([...leftRuns, ...rightRuns])].sort((p, q) => p - q);
            let i = 0;
            let j = 0;
            let open: { side: number; start: number; end: number } | undefined;
            const close = () => {
                if (!open) return;
                const [from, to] =
                    open.side > 0 ? [edges.a[edge], edges.b[edge]] : [edges.b[edge], edges.a[edge]];
                for (const point of [from, to]) {
                    getVertex(point, open.start);
                    getVertex(point, open.end);
                }
                walls.push({ from, to, start: open.start, end: open.end });
                open = undefined;
            };
            for (let k = 0; k + 1 < marks.length; k++) {
                const start = marks[k];
                while (i < leftRuns.length && leftRuns[i + 1] <= start) i += 2;
                while (j < rightRuns.length && rightRuns[j + 1] <= start) j += 2;
                const inLeft = i < leftRuns.length && leftRuns[i] <= start;
                const inRight = j < rightRuns.length && rightRuns[j] <= start;
                const side = inLeft === inRight ? 0 : inLeft ? 1 : -1;
                if (open && open.side === side) {
                    open.end = marks[k + 1];
                    continue;
                }
                close();
                if (side !== 0) open = { side, start, end: marks[k + 1] };
            }
            close();
            if (edge % 1024 === 0) await yieldMesh();
        }
        for (const used of pointLevels.values()) used.sort((p, q) => p - q);
        const levelsBetween = (point: Point, start: number, end: number) => {
            const used = pointLevels.get(point.id)!;
            let low = 0;
            let high = used.length;
            while (low < high) {
                const mid = (low + high) >> 1;
                if (used[mid] < start) low = mid + 1;
                else high = mid;
            }
            const result: number[] = [];
            for (let k = low; k < used.length && used[k] <= end; k++) result.push(used[k]);
            return result;
        };
        for (let index = 0; index < walls.length; index++) {
            const { from, to, start, end } = walls[index];
            const fromLevels = levelsBetween(from, start, end);
            const toLevels = levelsBetween(to, start, end);
            let i = 0;
            let j = 0;
            while (i + 1 < fromLevels.length || j + 1 < toLevels.length) {
                const a = getVertex(from, fromLevels[i]);
                const b = getVertex(to, toLevels[j]);
                if (
                    i + 1 === fromLevels.length ||
                    (j + 1 < toLevels.length && toLevels[j + 1] <= fromLevels[i + 1])
                ) {
                    indices.push(a, b, getVertex(to, toLevels[++j]));
                } else {
                    indices.push(a, b, getVertex(from, fromLevels[++i]));
                }
                capSides.push(0);
            }
            if (index % 1024 === 0) await yieldMesh();
        }

        const split = await splitPinchedVertices(positions, indices, capSides, yieldMesh);
        return {
            positions: new Float32Array(split.positions),
            indices: split.indices,
            metrics: {
                mesher: strength === 'none' ? 'greedy' : 'smooth',
                elapsedMs: performance.now() - startedAt,
                activePixelCount,
                vertexCount: split.positions.length / 3,
                triangleCount: split.indices.length / 3,
            },
        };
    };
}
