import assert from 'node:assert/strict';
import test from 'node:test';
import { generateGreedyMesh, generateSmoothMesh, type MeshData } from '../src/lib/meshing.ts';
import { inspectMeshIntegrity } from './meshDiagnostics.ts';

// Re-applied during the develop rebase: the multi-head / per-colour-group build
// path passes skipBottomCap (stacked sub-meshes) and skipRepair (independent
// colour groups). These guard that wiring against future mesher refactors.

const noYield = { yieldIntervalMs: Infinity, onYield: async () => undefined };

function maskFromRows(rows: string[]): { activePixels: Uint8Array; width: number; height: number } {
    const width = rows[0].length;
    const height = rows.length;
    const activePixels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (rows[y][x] === '#') activePixels[y * width + x] = 1;
        }
    }
    return { activePixels, width, height };
}

// Count triangles whose geometric normal points downward (-Z) — i.e. bottom-cap faces.
function countDownwardFacingTriangles(mesh: MeshData): number {
    const { positions, indices } = mesh;
    let count = 0;
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3;
        const b = indices[i + 1] * 3;
        const c = indices[i + 2] * 3;
        const abx = positions[b] - positions[a];
        const aby = positions[b + 1] - positions[a + 1];
        const acx = positions[c] - positions[a];
        const acy = positions[c + 1] - positions[a + 1];
        const nz = abx * acy - aby * acx; // z-component of (B-A) x (C-A)
        if (nz < -1e-6) count++;
    }
    return count;
}

const meshers = [
    { name: 'greedy', generate: generateGreedyMesh },
    { name: 'smooth', generate: generateSmoothMesh },
];

for (const { name, generate } of meshers) {
    test(`${name}: skipBottomCap omits the downward-facing bottom cap`, async () => {
        const mask = maskFromRows(['###', '###', '###']);

        const withCap = await generate(mask.activePixels, mask.width, mask.height, 1, 0, 1, 1, {
            ...noYield,
        });
        const withoutCap = await generate(mask.activePixels, mask.width, mask.height, 1, 0, 1, 1, {
            ...noYield,
            skipBottomCap: true,
        });

        assert.ok(
            countDownwardFacingTriangles(withCap) > 0,
            'default build should emit bottom-cap (downward) faces'
        );
        assert.equal(
            countDownwardFacingTriangles(withoutCap),
            0,
            'skipBottomCap should emit no downward-facing faces'
        );
        assert.ok(
            withoutCap.indices.length < withCap.indices.length,
            'skipBottomCap should produce fewer triangles'
        );
    });
}

test('smooth: combinedMask prevents smoothing at shared internal edges between colour groups', async () => {
    // Two adjacent colour groups in a 2×2 grid: group A = left column, group B = right column.
    // The shared edge (x=1) is internal to the layer. With combinedMask, it should not be
    // treated as an exterior boundary by group A's mesher — so those vertices stay at x=1.
    // Without combinedMask each group smooths the shared edge inward independently, which
    // would create a visible gap.
    const maskA = maskFromRows(['#.', '#.']); // left column
    const combined = maskFromRows(['##', '##']); // full 2×2 grid

    const withoutCombined = await generateSmoothMesh(
        maskA.activePixels, maskA.width, maskA.height, 1, 0, 1, 1,
        { ...noYield }
    );
    const withCombined = await generateSmoothMesh(
        maskA.activePixels, maskA.width, maskA.height, 1, 0, 1, 1,
        { ...noYield, combinedMask: combined.activePixels }
    );

    const maxX = (mesh: MeshData) => {
        let m = -Infinity;
        for (let i = 0; i < mesh.positions.length; i += 3) m = Math.max(m, mesh.positions[i]);
        return m;
    };

    assert.ok(
        maxX(withoutCombined) < 1.0,
        'without combinedMask, the right edge of group A is treated as exterior and smoothed inward'
    );
    assert.equal(
        maxX(withCombined),
        1.0,
        'with combinedMask, the shared right edge of group A is interior and stays unsmoothed at x=1'
    );
});

test('smooth: combinedMask only suppresses smoothing at shared edges, not the true exterior', async () => {
    // Group A = left column of a 2×2 grid. Even with combinedMask, the left exterior edge
    // (x=0) and the top/bottom exterior edges should still be smoothed inward.
    const maskA = maskFromRows(['#.', '#.']);
    const combined = maskFromRows(['##', '##']);

    const withCombined = await generateSmoothMesh(
        maskA.activePixels, maskA.width, maskA.height, 1, 0, 1, 1,
        { ...noYield, combinedMask: combined.activePixels }
    );
    const noSmooth = await generateGreedyMesh(
        maskA.activePixels, maskA.width, maskA.height, 1, 0, 1, 1,
        { ...noYield }
    );

    const minX = (mesh: MeshData) => {
        let m = Infinity;
        for (let i = 0; i < mesh.positions.length; i += 3) m = Math.min(m, mesh.positions[i]);
        return m;
    };

    assert.ok(
        minX(withCombined) > minX(noSmooth),
        'combinedMask still allows the true exterior (left edge) to be smoothed inward'
    );
});

test('smooth: adjacent colour groups place shared exterior vertices identically (no peeling)', async () => {
    // Group A = left column, group B = right column of a 2×2 layer. The grid vertices
    // where the seam meets the exterior — (1,0) and (1,2) — are used by both meshes.
    // Each group's mesher must smooth them to the exact same position, otherwise the
    // colours visibly peel apart at the seam. This requires the smoothing graph to be
    // built from the combined solid, not just each group's own outline.
    const maskA = maskFromRows(['#.', '#.']);
    const maskB = maskFromRows(['.#', '.#']);
    const combined = maskFromRows(['##', '##']);

    const meshA = await generateSmoothMesh(maskA.activePixels, 2, 2, 1, 0, 1, 1, {
        ...noYield,
        skipRepair: true,
        combinedMask: combined.activePixels,
    });
    const meshB = await generateSmoothMesh(maskB.activePixels, 2, 2, 1, 0, 1, 1, {
        ...noYield,
        skipRepair: true,
        combinedMask: combined.activePixels,
    });

    const vertexSet = (mesh: MeshData) => {
        const set = new Set<string>();
        for (let i = 0; i < mesh.positions.length; i += 3) {
            set.add(
                `${mesh.positions[i]},${mesh.positions[i + 1]},${mesh.positions[i + 2]}`
            );
        }
        return set;
    };

    // Every vertex of A near the seam plane (x = 1) must exist bitwise-identically in B.
    const bVertices = vertexSet(meshB);
    let seamVertices = 0;
    for (let i = 0; i < meshA.positions.length; i += 3) {
        const x = meshA.positions[i];
        if (Math.abs(x - 1) > 0.4) continue;
        seamVertices++;
        const key = `${x},${meshA.positions[i + 1]},${meshA.positions[i + 2]}`;
        assert.ok(
            bVertices.has(key),
            `seam vertex ${key} from group A has no identical counterpart in group B`
        );
    }
    assert.ok(seamVertices > 0, 'expected group A to have vertices near the seam');
});

function assertClosedIndexedSurface(mesh: MeshData) {
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
        assert.equal(edge.count, 2, `indexed edge ${key} must have two faces`);
        assert.equal(edge.direction, 0, `indexed edge ${key} must have opposite winding`);
    }
    for (const [vertex, link] of links) {
        const pending = [link.keys().next().value!];
        const seen = new Set<number>();
        while (pending.length) {
            const neighbor = pending.pop()!;
            if (seen.has(neighbor)) continue;
            seen.add(neighbor);
            const adjacent = link.get(neighbor)!;
            assert.equal(adjacent.length, 2, `vertex ${vertex} link degree`);
            pending.push(...adjacent);
        }
        assert.equal(seen.size, link.size, `vertex ${vertex} must have one surface fan`);
    }
    const report = inspectMeshIntegrity(mesh);
    assert.equal(report.degenerateTriangleCount, 0);
    assert.equal(report.duplicateTriangleCount, 0);
    assert.ok(report.signedVolume > 0);
}

for (const strength of ['none', 'minimal', 'medium', 'aggressive'] as const) {
    test(`skipRepair: ${strength} preserves indexed fans at diagonal colour contacts`, async () => {
        for (const rows of [
            ['AB', 'BA'], ['BA', 'AB'], ['A.A', '.A.', 'A.A'],
            // Diagonal quadrants can reconnect elsewhere in the same component.
            ['AAA', 'A.A', 'AA.'],
        ]) {
            const width = rows[0].length, height = rows.length;
            const mask = Uint8Array.from(rows.join(''), (cell) => Number(cell === 'A'));
            const combined = Uint8Array.from(rows.join(''), (cell) => Number(cell !== '.'));
            for (const combinedMask of [undefined, combined]) {
                const mesh = await generateSmoothMesh(mask, width, height, 1, 0, 1, 1, {
                    ...noYield, strength, skipRepair: true, combinedMask,
                });
                assertClosedIndexedSurface(mesh);
                if (strength === 'none') {
                    const count = mask.reduce((sum, cell) => sum + cell, 0);
                    assert.ok(Math.abs(inspectMeshIntegrity(mesh).signedVolume - count) < 1e-6);
                }
            }
        }
    });
}

for (const strength of ['minimal', 'medium', 'aggressive'] as const) {
    test(`smooth: ${strength} shares cap and wall subdivisions at seam junctions`, async () => {
        for (const rows of [
            ['AB', 'AB', 'A.'],
            ['AAA', 'BB.'],
            ['AAB', 'ACB', 'ACC'],
        ]) {
            const width = rows[0].length;
            const height = rows.length;
            const combined = Uint8Array.from(rows.join(''), (color) => Number(color !== '.'));
            const meshes = new Map<string, MeshData>();
            for (const color of new Set(rows.join('').replaceAll('.', ''))) {
                const mask = Uint8Array.from(rows.join(''), (cell) => Number(cell === color));
                const mesh = await generateSmoothMesh(mask, width, height, 1, 0, 1, 1, {
                    ...noYield, strength, skipRepair: true, combinedMask: combined,
                });
                assert.ok(inspectMeshIntegrity(mesh).isValid, `${color} must remain closed and oriented`);
                meshes.set(color, mesh);
            }
            const key = (mesh: MeshData, i: number) =>
                Array.from(mesh.positions.slice(i * 3, i * 3 + 3)).join(',');
            for (const [color, mesh] of meshes) {
                const others = [...meshes].filter(([other]) => other !== color);
                for (let i = 0; i < mesh.positions.length / 3; i++) {
                    const [x, y] = mesh.positions.slice(i * 3, i * 3 + 2);
                    const gx = Math.round(x), gy = Math.round(y);
                    const touchingColors = new Set<string>();
                    for (const dy of [-1, 0]) for (const dx of [-1, 0]) {
                        const cell = rows[gy + dy]?.[gx + dx];
                        if (cell && cell !== '.') touchingColors.add(cell);
                    }
                    for (const [other, otherMesh] of others) {
                        if (!touchingColors.has(other)) continue;
                        const vertices = new Set(Array.from(
                            { length: otherMesh.positions.length / 3 }, (_, j) => key(otherMesh, j)
                        ));
                        assert.ok(vertices.has(key(mesh, i)), `${rows}: ${color}/${other} seam vertex ${key(mesh, i)}`);
                    }
                }
            }
        }
    });
}
