import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { buildNozzleVoxelMesh, buildNozzleVoxelMeshAsync, type NozzleLayerRecord } from '../src/lib/voxelMesh.ts';
import { assertClosedIndexedSurface } from './helpers/meshAssertions.ts';

test('voxel mesh preserves closed shells for every 2x2x2 occupancy', () => {
    for (let occupancy = 1; occupancy < 256; occupancy++) {
        const layers: NozzleLayerRecord[] = [0, 1].map((z) => ({
            mask: Uint8Array.from({ length: 4 }, (_, i) => (occupancy >> (z * 4 + i)) & 1),
            baseZ: z,
            topZ: z + 1,
        }));
        const count = layers.reduce((total, layer) => total + layer.mask.reduce((a, b) => a + b, 0), 0);
        const mesh = buildNozzleVoxelMesh(layers, 2, 2, 1);
        assertClosedIndexedSurface(mesh, { volume: count, label: `occupancy ${occupancy.toString(2)}` });

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
        assertClosedIndexedSurface(buildNozzleVoxelMesh(layers, 1, 1, 1), { volume: 2, label: 'Z gap' });
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
    assertClosedIndexedSurface(mesh, { volume: 144, label: 'async checkerboard' });
});
