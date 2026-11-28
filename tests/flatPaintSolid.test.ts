import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildStackLayout,
    layoutFilamentColumns,
    type FlatPaintLayout,
    type StackLayoutOrientation,
} from '../src/lib/flatPaint.ts';
import { createFlatPaintMesher, createFlatPaintSolidMesher } from '../src/lib/flatPaintMeshing.ts';
import type { MeshData } from '../src/lib/meshing.ts';
import type { SmoothMeshingStrength } from '../src/types/index.ts';

const noYield = { yieldIntervalMs: Infinity, onYield: async () => undefined };
const PIXEL = 0.4;

function random(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Random labels (0 = transparent) whose class stacks draw from three filaments,
 * so same-filament neighbors, diagonal contacts and stacked contacts abound.
 */
function randomLayout(
    seed: number,
    width: number,
    height: number,
    orientation: StackLayoutOrientation
) {
    const next = random(seed);
    const classCount = 6;
    const labels = new Uint16Array(width * height);
    for (let i = 0; i < labels.length; i++) {
        labels[i] = next() < 0.08 ? 0 : 1 + Math.floor(next() * classCount);
    }
    const filaments = ['#111111', '#F4F4F4', '#D01C1C'];
    const classes = [];
    for (let label = 1; label <= classCount; label++) {
        const mask = Uint8Array.from(labels, (value) => (value === label ? 1 : 0));
        const activeCount = mask.reduce((sum, value) => sum + value, 0);
        if (activeCount === 0) continue;
        const layers = Array.from(
            { length: 1 + Math.floor(next() * 6) },
            () => filaments[Math.floor(next() * filaments.length)]
        );
        classes.push({
            classIndex: label,
            mask,
            activeCount,
            layerFilamentHexes: layers,
            faceHex: layers[layers.length - 1],
        });
    }
    const layout = buildStackLayout({
        classes,
        pixelCount: labels.length,
        layerHeight: 0.08,
        carrierThickness: 0.16,
        orientation,
        firstLayerThickness: 0.16,
        foundationHex: '#111111',
    });
    return { labels, layout };
}

async function solids(
    labels: Uint16Array,
    width: number,
    height: number,
    layout: FlatPaintLayout,
    strength: SmoothMeshingStrength
) {
    const meshSolid = await createFlatPaintSolidMesher(
        labels,
        width,
        height,
        PIXEL,
        strength,
        noYield
    );
    const columns = layoutFilamentColumns(layout.parts, width * height);
    const meshes: Array<{ group: string; mesh: MeshData }> = [];
    for (const filament of columns.filaments) {
        meshes.push({
            group: filament.exportGroup,
            mesh: await meshSolid(
                { levels: columns.heights, profiles: columns.profiles, runs: filament.runs },
                noYield
            ),
        });
    }
    return { columns, meshes };
}

/** Topology of one solid by vertex index, and its faces by position. */
function inspectSolid({ positions, indices }: MeshData) {
    const point = (index: number) => [0, 1, 2].map((k) => positions[index * 3 + k]);
    const key = (index: number) => point(index).join(',');
    const edges = new Map<string, number[]>();
    const faces = new Map<string, number>();
    let degenerate = 0;
    let volume = 0;
    for (let t = 0; t < indices.length; t += 3) {
        const corners = [indices[t], indices[t + 1], indices[t + 2]];
        for (let k = 0; k < 3; k++) {
            const a = corners[k];
            const b = corners[(k + 1) % 3];
            const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
            edges.set(edge, [...(edges.get(edge) ?? []), a < b ? 1 : -1]);
        }
        const [A, B, C] = corners.map(point);
        const ab = [0, 1, 2].map((k) => B[k] - A[k]);
        const ac = [0, 1, 2].map((k) => C[k] - A[k]);
        const cross = [
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
        ];
        if (Math.hypot(...cross) < 1e-12) degenerate++;
        volume += (A[0] * cross[0] + A[1] * cross[1] + A[2] * cross[2]) / 6;
        const face = corners.map(key).sort().join('|');
        faces.set(face, (faces.get(face) ?? 0) + 1);
    }
    const uses = [...edges.values()];

    // A vertex inside another triangle's edge is a T-junction.
    const vertexCount = positions.length / 3;
    let tJunctions = 0;
    for (const edge of edges.keys()) {
        const [a, b] = edge.split('|').map(Number);
        const [A, B] = [point(a), point(b)];
        const d = [0, 1, 2].map((k) => B[k] - A[k]);
        const lengthSquared = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
        for (let v = 0; v < vertexCount; v++) {
            const P = point(v);
            const ap = [0, 1, 2].map((k) => P[k] - A[k]);
            const s = (ap[0] * d[0] + ap[1] * d[1] + ap[2] * d[2]) / lengthSquared;
            if (s <= 1e-6 || s >= 1 - 1e-6) continue;
            const off = [0, 1, 2].map((k) => ap[k] - s * d[k]);
            if (Math.hypot(...off) < 1e-6) tJunctions++;
        }
    }

    // Faces of the same solid on both sides of one surface: opposite walls on
    // one XY segment, or opposite caps over the same point at one height.
    const triangles = Array.from({ length: indices.length / 3 }, (_, t) =>
        [0, 1, 2].map((k) => point(indices[t * 3 + k]))
    );
    let internalWallHeight = 0;
    let internalCaps = 0;
    const walls = new Map<string, Array<{ side: number; z0: number; z1: number }>>();
    const caps: Array<{ z: number; up: boolean; tri: number[][] }> = [];
    for (const tri of triangles) {
        const zs = tri.map((p) => p[2]);
        if (zs[0] === zs[1] && zs[1] === zs[2]) {
            const cross =
                (tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) -
                (tri[1][1] - tri[0][1]) * (tri[2][0] - tri[0][0]);
            caps.push({ z: zs[0], up: cross > 0, tri });
            continue;
        }
        const xy = [...new Set(tri.map((p) => `${p[0]},${p[1]}`))].sort();
        const [from, to] = xy.map((text) => text.split(',').map(Number));
        const normal = [
            (tri[1][1] - tri[0][1]) * (tri[2][2] - tri[0][2]) -
                (tri[1][2] - tri[0][2]) * (tri[2][1] - tri[0][1]),
            (tri[1][2] - tri[0][2]) * (tri[2][0] - tri[0][0]) -
                (tri[1][0] - tri[0][0]) * (tri[2][2] - tri[0][2]),
        ];
        // Which side of its XY segment the wall faces.
        const side = Math.sign(-(to[1] - from[1]) * normal[0] + (to[0] - from[0]) * normal[1]);
        const wall = walls.get(xy.join('>')) ?? [];
        wall.push({ side, z0: Math.min(...zs), z1: Math.max(...zs) });
        walls.set(xy.join('>'), wall);
    }
    for (const list of walls.values()) {
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                if (list[i].side === list[j].side) continue;
                internalWallHeight += Math.max(
                    0,
                    Math.min(list[i].z1, list[j].z1) - Math.max(list[i].z0, list[j].z0)
                );
            }
        }
    }
    const inside = (p: number[], tri: number[][]) => {
        const sign = (a: number[], b: number[]) =>
            (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        const s = [sign(tri[0], tri[1]), sign(tri[1], tri[2]), sign(tri[2], tri[0])];
        return s.every((v) => v > 1e-9) || s.every((v) => v < -1e-9);
    };
    for (const cap of caps) {
        const centroid = [0, 1].map((k) => (cap.tri[0][k] + cap.tri[1][k] + cap.tri[2][k]) / 3);
        if (
            caps.some(
                (other) => other.z === cap.z && other.up !== cap.up && inside(centroid, other.tri)
            )
        )
            internalCaps++;
    }

    return {
        triangles: indices.length / 3,
        openEdges: uses.filter((u) => u.length < 2).length,
        overSharedEdges: uses.filter((u) => u.length > 2).length,
        flippedEdges: uses.filter((u) => u.length === 2 && u[0] === u[1]).length,
        degenerate,
        duplicateTriangles: [...faces.values()].filter((count) => count > 1).length,
        tJunctions,
        internalWallHeight,
        internalCaps,
        volume,
        caps,
    };
}

/** Filament groups printed at a point, by parity of the caps below it. */
function groupsByRay(
    meshes: Array<{ group: string; caps: Array<{ z: number; tri: number[][] }> }>,
    x: number,
    y: number,
    z: number
) {
    const contains = (tri: number[][]) => {
        const sign = (a: number[], b: number[]) =>
            (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
        const s = [sign(tri[0], tri[1]), sign(tri[1], tri[2]), sign(tri[2], tri[0])];
        return s.every((v) => v > 0) || s.every((v) => v < 0);
    };
    return meshes
        .filter(({ caps }) => caps.filter((cap) => cap.z < z && contains(cap.tri)).length % 2 === 1)
        .map(({ group }) => group)
        .sort();
}

for (const orientation of ['relief', 'face-up', 'face-down'] as const) {
    for (const strength of ['none', 'medium'] as const) {
        test(`${orientation} ${strength} stepped solids are closed and only cover their outer surface`, async () => {
            const width = 9;
            const height = 7;
            for (const seed of [1, 2, 3]) {
                const { labels, layout } = randomLayout(seed, width, height, orientation);
                const { columns, meshes } = await solids(labels, width, height, layout, strength);
                const inspected = meshes.map(({ group, mesh }) => ({
                    group,
                    ...inspectSolid(mesh),
                }));
                for (const solid of inspected) {
                    const label = `seed ${seed} ${solid.group}`;
                    assert.ok(solid.triangles > 0, `${label} has geometry`);
                    assert.equal(solid.openEdges, 0, `${label} open edges`);
                    assert.equal(solid.overSharedEdges, 0, `${label} over-shared edges`);
                    assert.equal(solid.flippedEdges, 0, `${label} inverted winding`);
                    assert.equal(solid.degenerate, 0, `${label} degenerate triangles`);
                    assert.equal(solid.duplicateTriangles, 0, `${label} duplicate triangles`);
                    assert.equal(solid.tJunctions, 0, `${label} T-junctions`);
                    assert.equal(solid.internalWallHeight, 0, `${label} walls inside the filament`);
                    assert.equal(solid.internalCaps, 0, `${label} caps inside the filament`);
                    assert.ok(solid.volume > 0, `${label} faces outward`);
                }
                // One solid per filament, in the layout's group order.
                assert.deepEqual(
                    meshes.map(({ group }) => group),
                    [...new Set(layout.parts.map((part) => part.exportGroup))]
                );
                if (strength !== 'none') continue;
                // Every pixel gets the same filaments at every height as the parts.
                for (let band = 0; band + 1 < columns.heights.length; band++) {
                    const z = (columns.heights[band] + columns.heights[band + 1]) / 2;
                    for (let pixel = 0; pixel < labels.length; pixel++) {
                        const x = ((pixel % width) + 0.63) * PIXEL;
                        const y = (Math.floor(pixel / width) + 0.571) * PIXEL;
                        const expected = layout.parts
                            .filter((part) => part.mask[pixel] && part.baseZ < z && z < part.topZ)
                            .map((part) => part.exportGroup)
                            .sort();
                        assert.deepEqual(
                            groupsByRay(inspected, x, y, z),
                            expected,
                            `seed ${seed} pixel ${pixel} at z=${z}`
                        );
                    }
                }
            }
        });
    }
}

/**
 * Smooth blobs of regions with tall stacks of four filaments in long runs,
 * like a quantized photo with Per-region stacks.
 */
function photoLikeLayout(
    orientation: StackLayoutOrientation,
    { width = 48, height = 36, classCount = 8, scale = 1, noise = 0.3 } = {}
) {
    const next = random(11);
    const labels = new Uint16Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const v =
                Math.sin(x / (5 * scale)) +
                Math.cos(y / (4 * scale)) +
                0.6 * Math.sin((x + y) / (3 * scale)) +
                noise * (next() - 0.5);
            labels[y * width + x] =
                1 +
                Math.min(classCount - 1, Math.max(0, Math.floor(((v + 2.6) / 5.2) * classCount)));
        }
    }
    const filaments = ['#111111', '#F4F4F4', '#D01C1C', '#1C3CD0'];
    const classes = [];
    for (let label = 1; label <= classCount; label++) {
        const mask = Uint8Array.from(labels, (value) => (value === label ? 1 : 0));
        const activeCount = mask.reduce((sum, value) => sum + value, 0);
        if (activeCount === 0) continue;
        const layers: string[] = [];
        const count = 8 + Math.floor(next() * 14);
        while (layers.length < count) {
            const filament = filaments[Math.floor(next() * filaments.length)];
            const run = 1 + Math.floor(next() * 4);
            for (let i = 0; i < run && layers.length < count; i++) layers.push(filament);
        }
        classes.push({
            classIndex: label,
            mask,
            activeCount,
            layerFilamentHexes: layers,
            faceHex: layers[layers.length - 1],
        });
    }
    const layout = buildStackLayout({
        classes,
        pixelCount: labels.length,
        layerHeight: 0.08,
        carrierThickness: 0.16,
        orientation,
        firstLayerThickness: 0.16,
        foundationHex: '#111111',
    });
    return { labels, width, height, layout };
}

test('smoothed caps with collinear outlines stay manifold where stacks swap', async () => {
    // At this size, smoothing straightens some outlines into collinear cap
    // vertices. Their sliver triangles sit on pinched edges where neighboring
    // stacks swap filaments at one height.
    const { labels, width, height, layout } = photoLikeLayout('face-down', {
        width: 150,
        height: 125,
        classCount: 16,
        scale: 1.4,
        noise: 0.9,
    });
    const { meshes } = await solids(labels, width, height, layout, 'medium');
    for (const { group, mesh } of meshes) {
        const vertexCount = mesh.positions.length / 3;
        const uses = new Map<number, number>();
        for (let t = 0; t < mesh.indices.length; t++) {
            const a = mesh.indices[t];
            const b = mesh.indices[t % 3 === 2 ? t - 2 : t + 1];
            const key = a < b ? a * vertexCount + b : b * vertexCount + a;
            uses.set(key, (uses.get(key) ?? 0) + (a < b ? 1 : 1000));
        }
        // Each edge is run once in each direction.
        assert.ok(
            [...uses.values()].every((count) => count === 1001),
            `${group} is a closed manifold`
        );
    }
});

for (const orientation of ['relief', 'face-up', 'face-down'] as const) {
    test(`${orientation} stepped solids are smaller than the per-region shells they replace`, async () => {
        const { labels, width, height, layout } = photoLikeLayout(orientation);
        const { meshes } = await solids(labels, width, height, layout, 'medium');
        const meshMask = await createFlatPaintMesher(
            labels,
            width,
            height,
            PIXEL,
            'medium',
            noYield
        );
        let shellTriangles = 0;
        for (const part of layout.parts) {
            shellTriangles += (await meshMask(part.mask, noYield)).indices.length / 3;
        }
        // Slabs cut wherever a filament's pixels change made about twice the
        // shells here; one solid per filament stays well below them.
        const solidTriangles = meshes.reduce((sum, { mesh }) => sum + mesh.indices.length / 3, 0);
        assert.ok(
            solidTriangles < shellTriangles * 0.9,
            `${solidTriangles} solid vs ${shellTriangles} shell triangles`
        );
        for (const { group, mesh } of meshes) {
            const index = new Map<string, number>();
            for (let t = 0; t < mesh.indices.length; t++) {
                const a = mesh.indices[t];
                const b = mesh.indices[t % 3 === 2 ? t - 2 : t + 1];
                const key = a < b ? `${a}|${b}` : `${b}|${a}`;
                index.set(key, (index.get(key) ?? 0) + 1);
            }
            assert.ok(
                [...index.values()].every((count) => count === 2),
                `${group} is a closed manifold`
            );
        }
    });
}

test('a staircase of one filament meshes as one stepped solid', async () => {
    // One row, columns 1..5 layers tall, all the same filament.
    const width = 5;
    const labels = Uint16Array.from([1, 2, 3, 4, 5]);
    const classes = [...labels].map((label, x) => ({
        classIndex: label,
        mask: Uint8Array.from(labels, (_, i) => (i === x ? 1 : 0)),
        activeCount: 1,
        layerFilamentHexes: Array.from({ length: label }, () => '#F4F4F4'),
        faceHex: '#F4F4F4',
    }));
    const layout = buildStackLayout({
        classes,
        pixelCount: width,
        layerHeight: 0.1,
        carrierThickness: 0.2,
        orientation: 'relief',
        firstLayerThickness: 0.1,
        foundationHex: '#111111',
    });
    const { meshes } = await solids(labels, width, 1, layout, 'none');
    assert.equal(meshes.length, 1);
    const solid = inspectSolid(meshes[0].mesh);
    assert.equal(solid.openEdges + solid.overSharedEdges + solid.tJunctions, 0);
    // A bottom of 5 cells, 5 tops, 4 risers, the two ends, and two stepped
    // sides whose strips follow every step: no faces between layers.
    const bottom = 2 * 5;
    const tops = 5 * 2;
    const risers = 4 * 2 + 2 * 2;
    const sides = 2 * (5 + 5 + 4);
    assert.equal(solid.triangles, bottom + tops + risers + sides);
    assert.equal(solid.internalCaps + solid.internalWallHeight, 0);
});

test('a filament touching itself along an edge or a corner keeps a vertex per side', async () => {
    const white = '#F4F4F4';
    const black = '#111111';
    const W = white;
    const B = black;
    const cases = [
        // The diagonal pair 1 and 4 prints white under black, the other pair
        // black under white: white touches itself on the center edge below and
        // above the white layer they share.
        {
            width: 2,
            height: 2,
            stacks: [
                [W, W, B],
                [B, W, W],
                [B, W, W],
                [W, W, B],
            ],
        },
        // The same contact with white all around both of its ends.
        {
            width: 2,
            height: 2,
            stacks: [
                [W, W, W],
                [W, B, W],
                [W, B, W],
                [W, W, W],
            ],
        },
        // Stacks that swap at one height touch along a horizontal edge.
        {
            width: 2,
            height: 1,
            stacks: [
                [W, B],
                [B, W],
            ],
        },
    ];
    for (const { width, height, stacks } of cases) {
        const labels = Uint16Array.from(stacks, (_, i) => i + 1);
        const layout = buildStackLayout({
            classes: stacks.map((layers, i) => ({
                classIndex: i + 1,
                mask: Uint8Array.from(labels, (_, j) => (i === j ? 1 : 0)),
                activeCount: 1,
                layerFilamentHexes: layers,
                faceHex: layers[layers.length - 1],
            })),
            pixelCount: labels.length,
            layerHeight: 0.1,
            carrierThickness: 0.2,
            orientation: 'relief',
            firstLayerThickness: 0.1,
            foundationHex: black,
        });
        await checkSelfContacts(labels, width, height, layout);
    }
});

async function checkSelfContacts(
    labels: Uint16Array,
    width: number,
    height: number,
    layout: FlatPaintLayout
) {
    for (const strength of ['none', 'medium'] as const) {
        const { meshes } = await solids(labels, width, height, layout, strength);
        for (const { group, mesh } of meshes) {
            const solid = inspectSolid(mesh);
            assert.equal(solid.openEdges, 0, `${strength} ${group} open edges`);
            assert.equal(solid.overSharedEdges, 0, `${strength} ${group} over-shared edges`);
            assert.equal(solid.flippedEdges, 0, `${strength} ${group} inverted winding`);
            assert.equal(solid.tJunctions, 0, `${strength} ${group} T-junctions`);
            // Welding by position would pinch the contacts together.
            const positions = new Set(
                Array.from({ length: mesh.positions.length / 3 }, (_, v) =>
                    [0, 1, 2].map((k) => mesh.positions[v * 3 + k]).join(',')
                )
            );
            assert.ok(
                positions.size < mesh.positions.length / 3,
                `${strength} ${group} splits a vertex`
            );
        }
    }
}
