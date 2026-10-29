import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { buildNozzleVoxelMesh, buildNozzleVoxelMeshAsync, type NozzleLayerRecord } from '../src/lib/voxelMesh.ts';
import type { MeshData } from '../src/lib/meshing.ts';
import { inspectMeshIntegrity } from './meshDiagnostics.ts';

// Coordinate welding would hide the distinction between independently closed
// shells that touch at an edge or vertex. Check the actual indexed topology,
// including each vertex's triangle fan, as well as the occupied volume.
function assertClosedVoxelSurface(mesh: MeshData, volume: number, label: string) {
    const edges = new Map<string, { count: number; direction: number }>();
    const links = new Map<number, Map<number, number[]>>();
    for (let i = 0; i < mesh.indices.length; i += 3) {
        const face = mesh.indices.slice(i, i + 3);
        for (let j = 0; j < 3; j++) {
            const a = face[j], b = face[(j + 1) % 3], c = face[(j + 2) % 3];
            const key = a < b ? `${a},${b}` : `${b},${a}`;
            const edge = edges.get(key) ?? { count: 0, direction: 0 };
            edge.count++;
            edge.direction += a < b ? 1 : -1;
            edges.set(key, edge);
            let link = links.get(a);
            if (!link) links.set(a, link = new Map());
            link.set(b, [...(link.get(b) ?? []), c]);
            link.set(c, [...(link.get(c) ?? []), b]);
        }
    }
    for (const [key, edge] of edges) {
        assert.equal(edge.count, 2, `${label}: edge ${key} must have two faces`);
        assert.equal(edge.direction, 0, `${label}: edge ${key} winding`);
    }
    for (const [vertex, link] of links) {
        const pending = [link.keys().next().value!];
        const seen = new Set<number>();
        while (pending.length) {
            const neighbor = pending.pop()!;
            if (seen.has(neighbor)) continue;
            seen.add(neighbor);
            const adjacent = link.get(neighbor)!;
            assert.equal(adjacent.length, 2, `${label}: vertex ${vertex} link degree`);
            pending.push(...adjacent);
        }
        assert.equal(seen.size, link.size, `${label}: vertex ${vertex} must have one fan`);
    }
    const report = inspectMeshIntegrity(mesh);
    assert.equal(report.degenerateTriangleCount, 0, label);
    assert.equal(report.duplicateTriangleCount, 0, label);
    assert.ok(Math.abs(report.signedVolume - volume) < 1e-6, `${label}: occupied volume`);
}

test('voxel mesh preserves closed shells for every 2x2x2 occupancy', () => {
    for (let occupancy = 1; occupancy < 256; occupancy++) {
        const layers: NozzleLayerRecord[] = [0, 1].map((z) => ({
            mask: Uint8Array.from({ length: 4 }, (_, i) => (occupancy >> (z * 4 + i)) & 1),
            baseZ: z,
            topZ: z + 1,
        }));
        const count = layers.reduce((total, layer) => total + layer.mask.reduce((a, b) => a + b, 0), 0);
        const mesh = buildNozzleVoxelMesh(layers, 2, 2, 1);
        assertClosedVoxelSurface(mesh, count, `occupancy ${occupancy.toString(2)}`);

        // Surface area must equal the exposed voxel faces, with internal faces removed.
        let expectedArea = count * 6;
        for (let z = 0; z < 2; z++) {
            for (let y = 0; y < 2; y++) {
                for (let x = 0; x < 2; x++) {
                    const i = y * 2 + x;
                    if (!layers[z].mask[i]) continue;
                    if (x === 0 && layers[z].mask[i + 1]) expectedArea -= 2;
                    if (y === 0 && layers[z].mask[i + 2]) expectedArea -= 2;
                    if (z === 0 && layers[1].mask[i]) expectedArea -= 2;
                }
            }
        }
        let area = 0;
        const vertex = (i: number) => new Vector3().fromArray(mesh.positions, i * 3);
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const [a, b, c] = mesh.indices.slice(i, i + 3).map(vertex);
            area += b.sub(a).cross(c.sub(a)).length() / 2;
        }
        assert.equal(area, expectedArea, `occupancy ${occupancy}: exposed surface area`);
    }
});

test('voxel mesh caps missing layers and physical Z gaps independently', () => {
    for (const layers of [
        [{ mask: new Uint8Array([1]), baseZ: 0, topZ: 1 }, null,
            { mask: new Uint8Array([1]), baseZ: 2, topZ: 3 }],
        [{ mask: new Uint8Array([1]), baseZ: 0, topZ: 1 },
            { mask: new Uint8Array([1]), baseZ: 1.0001, topZ: 2.0001 }],
    ]) {
        assertClosedVoxelSurface(buildNozzleVoxelMesh(layers, 1, 1, 1), 2, 'Z gap');
    }
});

test('async voxel reconstruction yields during face generation, pairing, and triangulation', async () => {
    const layers = [0, 1].map((z) => ({
        mask: Uint8Array.from({ length: 144 }, (_, i) => Number((i % 12 + Math.floor(i / 12) + z) % 2 === 0)),
        baseZ: z,
        topZ: z + 1,
    }));
    let progress = 0;
    const yieldedAt: number[] = [];
    const mesh = await buildNozzleVoxelMeshAsync(layers, 12, 12, 1, {
        yieldIntervalMs: 0,
        onProgress: (value) => {
            assert.ok(value >= progress && value <= 1, 'voxel progress must be monotonic');
            progress = value;
        },
        onYield: async () => {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            yieldedAt.push(progress);
        },
    });
    for (const [start, end] of [[0, 0.6], [0.6, 0.8], [0.8, 1]]) {
        assert.ok(yieldedAt.some((value) => value >= start && value < end),
            `must yield during voxel phase ${start}-${end}`);
    }
    assert.equal(progress, 1);
    assert.deepEqual(mesh, buildNozzleVoxelMesh(layers, 12, 12, 1), 'chunking must preserve geometry');
    assertClosedVoxelSurface(mesh, 144, 'async checkerboard');
});
