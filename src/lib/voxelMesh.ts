/**
 * 3D voxel mesher for multi-head 3MF export.
 *
 * Produces a single manifold solid per nozzle from per-layer pixel-occupancy
 * masks.  Every exposed face is emitted as exactly one unit quad (one pixel ×
 * one layer) with no run-length merging.  Merging multi-pixel quads creates
 * T-junctions wherever a cap terminates at the interior of a wall edge, so we
 * keep faces small and let the global vertex-dedup map weld them.
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
 * Build a manifold voxel mesh for one nozzle.
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
    // Snap to 1 µm (0.001 mm) to deduplicate adjacent-layer shared vertices.
    const SNAP = 1e3;
    const vmap = new Map<string, number>();

    const addV = (x: number, y: number, z: number): number => {
        const key = `${Math.round(x * SNAP)},${Math.round(y * SNAP)},${Math.round(z * SNAP)}`;
        let i = vmap.get(key);
        if (i === undefined) {
            i = pos.length / 3;
            vmap.set(key, i);
            pos.push(x, y, z);
        }
        return i;
    };

    // Emit quad A→B→C→D as two CCW triangles (A,B,C) and (A,C,D).
    const quad = (
        ax: number, ay: number, az: number,
        bx: number, by: number, bz: number,
        cx: number, cy: number, cz: number,
        dx: number, dy: number, dz: number,
    ) => {
        const a = addV(ax, ay, az), b = addV(bx, by, bz);
        const c = addV(cx, cy, cz), d = addV(dx, dy, dz);
        idx.push(a, b, c, a, c, d);
    };

    const numLayers = layers.length;
    const EPS = 1e-9;

    for (let li = 0; li < numLayers; li++) {
        const layer = layers[li];
        if (!layer) continue;

        const { mask, baseZ: z0, topZ: z1 } = layer;
        const prev = li > 0 ? layers[li - 1] : null;
        const next = li < numLayers - 1 ? layers[li + 1] : null;

        // Z-continuity: whether the adjacent layer abuts this one without a gap.
        const prevAdj = prev !== null && Math.abs(prev.topZ - z0) < EPS;
        const nextAdj = next !== null && Math.abs(z1 - next.baseZ) < EPS;

        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const mi = r * width + c;
                if (!mask[mi]) continue;

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

    return { positions: new Float32Array(pos), indices: idx };
}
