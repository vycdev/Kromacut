/**
 * 3D voxel mesher for multi-head 3MF export.
 *
 * Produces a closed surface per nozzle from per-layer pixel-occupancy masks.
 * Exposed faces stay unit-sized to avoid T-junctions. Edge/vertex-only contacts
 * retain separate surface fans at identical coordinates; consumers must preserve
 * these indices instead of welding vertices by position.
 *
 * Winding convention matches meshing.ts (THREE.js FrontSide, Z-up):
 *   top caps   → CCW from above (+Z)   bottom caps → CCW from below (-Z)
 *   east walls → CCW from east  (+X)   west walls  → CCW from west  (-X)
 *   south walls→ CCW from south (+Y)   north walls → CCW from north (-Y)
 */

export interface NozzleLayerRecord {
    /** Per-pixel occupancy (width × height Uint8Array, 1 = this nozzle). */
    mask: Uint8Array;
    /** World-space Z of the bottom of this layer (already height-scaled). */
    baseZ: number;
    /** World-space Z of the top of this layer (already height-scaled). */
    topZ: number;
}

/**
 * Build a manifold voxel surface (possibly multiple touching shells) for one nozzle.
 *
 * `layers` must be sorted by ascending baseZ.  Null entries represent global
 * print layers where this nozzle is absent; they are used to determine
 * Z-continuity so correct top/bottom caps are inserted at Z-gaps.
 */
export function buildNozzleVoxelMesh(
    layers: (NozzleLayerRecord | null)[],
    width: number,
    height: number,
    pixelSize: number,
): { positions: Float32Array; indices: number[] } {
    const pos: number[] = [];
    const idx: number[] = [];
    const vmap = new Map<string, number>();
    const corners: number[] = [];
    const parents: number[] = [];
    const faceVoxels: number[] = [];
    const edgeUses = new Map<string, number[]>();
    let voxel = 0;

    const addV = (x: number, y: number, z: number): number => {
        const key = `${x},${y},${z}`;
        let i = vmap.get(key);
        if (i === undefined) {
            i = pos.length / 3;
            vmap.set(key, i);
            pos.push(x, y, z);
        }
        return i;
    };

    const nextCorner = (corner: number) => corner - corner % 4 + (corner + 1) % 4;

    // Keep face-local corners until exposed edges have been paired. A coordinate
    // alone cannot distinguish the two sheets at a diagonal voxel contact.
    const quad = (
        ax: number, ay: number, az: number,
        bx: number, by: number, bz: number,
        cx: number, cy: number, cz: number,
        dx: number, dy: number, dz: number,
    ) => {
        const a = addV(ax, ay, az), b = addV(bx, by, bz);
        const c = addV(cx, cy, cz), d = addV(dx, dy, dz);
        const start = corners.length;
        corners.push(a, b, c, d);
        faceVoxels.push(voxel);
        for (let offset = 0; offset < 4; offset++) {
            const corner = start + offset;
            parents.push(corner);
            const from = corners[corner], to = corners[nextCorner(corner)];
            const key = from < to ? `${from},${to}` : `${to},${from}`;
            const uses = edgeUses.get(key);
            if (uses) uses.push(corner);
            else edgeUses.set(key, [corner]);
        }
    };

    const numLayers = layers.length;
    const EPS = 1e-9;

    for (let li = 0; li < numLayers; li++) {
        const layer = layers[li];
        if (!layer) continue;

        const { mask, baseZ, topZ: z1 } = layer;
        const prev = li > 0 ? layers[li - 1] : null;
        const next = li < numLayers - 1 ? layers[li + 1] : null;

        // Z-continuity: whether the adjacent layer abuts this one without a gap.
        const prevAdj = prev !== null && Math.abs(prev.topZ - baseZ) < EPS;
        const nextAdj = next !== null && Math.abs(z1 - next.baseZ) < EPS;
        // Canonicalize only genuinely abutting planes, without snapping real gaps.
        const z0 = prevAdj ? prev!.topZ : baseZ;

        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const mi = r * width + c;
                if (!mask[mi]) continue;
                voxel = li * width * height + mi;

                const x0 = c * pixelSize,  x1 = (c + 1) * pixelSize;
                const y0 = r * pixelSize,  y1 = (r + 1) * pixelSize;

                // ── TOP CAP (normal +Z) ─────────────────────────────────────
                // Generate when this nozzle does NOT continue into the next
                // Z-adjacent layer at this pixel.
                if (!nextAdj || !next!.mask[mi]) {
                    // CCW from above: (x0,y0)→(x1,y0)→(x1,y1)→(x0,y1)
                    quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1);
                }

                // ── BOTTOM CAP (normal -Z) ──────────────────────────────────
                if (!prevAdj || !prev!.mask[mi]) {
                    // CW from above = CCW from below
                    quad(x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0);
                }

                // ── EAST WALL (normal +X) at x = x1 ────────────────────────
                if (c === width - 1 || !mask[mi + 1]) {
                    // CCW(wBR,wTR,wTL,wBL) = (x1,y1,z0)→(x1,y1,z1)→(x1,y0,z1)→(x1,y0,z0)
                    quad(x1, y1, z0, x1, y1, z1, x1, y0, z1, x1, y0, z0);
                }

                // ── WEST WALL (normal -X) at x = x0 ────────────────────────
                if (c === 0 || !mask[mi - 1]) {
                    // CCW(wBL,wTL,wTR,wBR) = (x0,y0,z0)→(x0,y0,z1)→(x0,y1,z1)→(x0,y1,z0)
                    quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0);
                }

                // ── SOUTH WALL (normal +Y) at y = y1 ───────────────────────
                if (r === height - 1 || !mask[mi + width]) {
                    // CCW(wBL,wTL,wTR,wBR) = (x0,y1,z0)→(x0,y1,z1)→(x1,y1,z1)→(x1,y1,z0)
                    quad(x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0);
                }

                // ── NORTH WALL (normal -Y) at y = y0 ───────────────────────
                if (r === 0 || !mask[mi - width]) {
                    // CCW(wBR,wTR,wTL,wBL) = (x1,y0,z0)→(x1,y0,z1)→(x0,y0,z1)→(x0,y0,z0)
                    quad(x1, y0, z0, x1, y0, z1, x0, y0, z1, x0, y0, z0);
                }
            }
        }
    }

    const find = (corner: number): number => {
        while (parents[corner] !== corner) {
            parents[corner] = parents[parents[corner]];
            corner = parents[corner];
        }
        return corner;
    };
    const join = (a: number, b: number) => { parents[find(a)] = find(b); };
    const output: number[] = [];
    const midpoints = new Map<number, number>();
    const addOutput = (x: number, y: number, z: number) => {
        const index = output.length / 3;
        output.push(x, y, z);
        return index;
    };
    const pair = (a: number, b: number, splitEdge: boolean) => {
        join(a, nextCorner(b));
        join(nextCorner(a), b);
        if (splitEdge) {
            const from = corners[a] * 3, to = corners[nextCorner(a)] * 3;
            const midpoint = addOutput(
                (pos[from] + pos[to]) / 2,
                (pos[from + 1] + pos[to + 1]) / 2,
                (pos[from + 2] + pos[to + 2]) / 2
            );
            midpoints.set(a, midpoint);
            midpoints.set(b, midpoint);
        }
    };
    for (const uses of edgeUses.values()) {
        if (uses.length === 2) {
            pair(uses[0], uses[1], false);
        } else {
            // Four exposed faces mean two diagonal occupied voxels. Pair the two
            // faces of each voxel, never the faces across the empty quadrants.
            // Separate midpoints also distinguish the sheets when their endpoint
            // fans happen to reconnect elsewhere around the vertex.
            for (let i = 0; i < uses.length; i++) {
                for (let j = i + 1; j < uses.length; j++) {
                    if (faceVoxels[Math.floor(uses[i] / 4)] === faceVoxels[Math.floor(uses[j] / 4)]) {
                        pair(uses[i], uses[j], true);
                    }
                }
            }
        }
    }
    const vertexMap = new Map<number, number>();
    const getCorner = (corner: number) => {
        const root = find(corner);
        let vertex = vertexMap.get(root);
        if (vertex === undefined) {
            const offset = corners[root] * 3;
            vertex = addOutput(pos[offset], pos[offset + 1], pos[offset + 2]);
            vertexMap.set(root, vertex);
        }
        return vertex;
    };
    for (let start = 0; start < corners.length; start += 4) {
        const boundary: number[] = [];
        for (let corner = start; corner < start + 4; corner++) {
            boundary.push(getCorner(corner));
            const midpoint = midpoints.get(corner);
            if (midpoint !== undefined) boundary.push(midpoint);
        }
        if (boundary.length === 4) {
            idx.push(boundary[0], boundary[1], boundary[2], boundary[0], boundary[2], boundary[3]);
        } else {
            const a = corners[start] * 3, c = corners[start + 2] * 3;
            const center = addOutput(
                (pos[a] + pos[c]) / 2, (pos[a + 1] + pos[c + 1]) / 2, (pos[a + 2] + pos[c + 2]) / 2
            );
            for (let i = 0; i < boundary.length; i++) {
                idx.push(center, boundary[i], boundary[(i + 1) % boundary.length]);
            }
        }
    }
    return { positions: new Float32Array(output), indices: idx };
}
