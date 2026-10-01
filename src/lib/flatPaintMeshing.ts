import { Vector2 } from 'three';
import type { SmoothMeshingStrength } from '../types/index.ts';
import {
    createBoundaryVertexMapperAsync,
    generateGreedyMesh,
    triangulateBoundaryPreservingVertices,
    type MeshData,
    type MeshYieldOptions,
} from './meshing.ts';

type Point = { key: string; x: number; y: number };
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
 * One XY tessellation for every class and the carrier. The same class footprint
 * is reused at every Z level, so color interfaces and the carrier meet exactly.
 * None delegates to the existing Flat Paint mesher unchanged.
 */
export async function createFlatPaintMesher(
    layerCounts: Uint16Array | Uint8Array,
    width: number,
    height: number,
    pixelSize: number,
    strength: SmoothMeshingStrength,
    options: MeshYieldOptions = {}
): Promise<(mask: Uint8Array, options?: MeshYieldOptions) => Promise<MeshData>> {
    if (strength === 'none') {
        return (mask, meshOptions) =>
            generateGreedyMesh(mask, width, height, 1, 0, pixelSize, 1, meshOptions);
    }

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
    for (let y = 0; y < height; y++) {
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
    const mapVertex = await createBoundaryVertexMapperAsync(
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

    const vertex = (x: number, y: number): Point => {
        const [mx, my] = mapVertex(x, y);
        return { key: `v${y * stride + x}`, x: mx, y: my };
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
            x: center.x + (neighbor.x - center.x) * 0.1,
            y: center.y + (neighbor.y - center.y) * 0.1,
        };
    };
    const cellPolygon = (x: number, y: number): Point[] => {
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
                polygon.push(vertex(vx, vy));
            } else if (owner === y * width + x) {
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
                label: 'Building smooth mesh caps',
                progress: lastCapProgress,
            });
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
                    for (let dx = 0; dx < w; dx++) polygon.push(vertex(x + dx, y));
                    for (let dy = 0; dy < h; dy++) polygon.push(vertex(x + w, y + dy));
                    for (let dx = w; dx > 0; dx--) polygon.push(vertex(x + dx, y + h));
                    for (let dy = h; dy > 0; dy--) polygon.push(vertex(x, y + dy));
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
                    if (!emitPolygon(cellPolygon(x, y))) {
                        throw new Error(
                            'Unable to triangulate a smoothed cap without breaking topology'
                        );
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
            label: 'Smooth mesh geometry complete',
            progress: 1,
        });
        return {
            positions: new Float32Array(positions),
            indices,
            metrics: {
                mesher: 'smooth',
                elapsedMs: performance.now() - startedAt,
                activePixelCount,
                vertexCount: positions.length / 3,
                triangleCount: indices.length / 3,
            },
        };
    };
}
