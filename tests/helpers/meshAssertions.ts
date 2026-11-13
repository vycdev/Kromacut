import assert from 'node:assert/strict';
import type { MeshData } from '../../src/lib/meshing.ts';
import { inspectMeshIntegrity, type MeshIntegrityReport } from '../meshDiagnostics.ts';

/** The integrity counts and bounds that explain a failed mesh assertion. */
export function reportForMessage(report: MeshIntegrityReport) {
    return JSON.stringify(
        {
            vertexCount: report.vertexCount,
            triangleCount: report.triangleCount,
            invalidPositionCount: report.invalidPositionCount,
            invalidIndexCount: report.invalidIndexCount,
            degenerateTriangleCount: report.degenerateTriangleCount,
            duplicateTriangleCount: report.duplicateTriangleCount,
            boundaryEdgeCount: report.boundaryEdgeCount,
            nonManifoldEdgeCount: report.nonManifoldEdgeCount,
            inconsistentWindingEdgeCount: report.inconsistentWindingEdgeCount,
            signedVolume: report.signedVolume,
            bounds: report.bounds,
        },
        null,
        2
    );
}

/**
 * Counts cap triangles at the mesh's lowest and highest Z that face the wrong
 * way: top caps must wind counter-clockwise seen from above, bottom caps
 * clockwise.
 */
export function inspectCapWinding(mesh: MeshData) {
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let offset = 2; offset < mesh.positions.length; offset += 3) {
        minZ = Math.min(minZ, mesh.positions[offset]);
        maxZ = Math.max(maxZ, mesh.positions[offset]);
    }

    let reversedTopCount = 0;
    let reversedBottomCount = 0;
    for (let offset = 0; offset + 2 < mesh.indices.length; offset += 3) {
        const a = mesh.indices[offset] * 3;
        const b = mesh.indices[offset + 1] * 3;
        const c = mesh.indices[offset + 2] * 3;
        const za = mesh.positions[a + 2];
        const zb = mesh.positions[b + 2];
        const zc = mesh.positions[c + 2];
        const area2 =
            (mesh.positions[b] - mesh.positions[a]) *
                (mesh.positions[c + 1] - mesh.positions[a + 1]) -
            (mesh.positions[b + 1] - mesh.positions[a + 1]) *
                (mesh.positions[c] - mesh.positions[a]);
        const isTop =
            Math.abs(za - maxZ) <= 1e-7 &&
            Math.abs(zb - maxZ) <= 1e-7 &&
            Math.abs(zc - maxZ) <= 1e-7;
        const isBottom =
            Math.abs(za - minZ) <= 1e-7 &&
            Math.abs(zb - minZ) <= 1e-7 &&
            Math.abs(zc - minZ) <= 1e-7;

        if (isTop && area2 < -1e-10) reversedTopCount++;
        if (isBottom && area2 > 1e-10) reversedBottomCount++;
    }

    return { reversedTopCount, reversedBottomCount };
}

/**
 * Asserts that a mesh is non-empty and passes every integrity check: closed,
 * manifold, consistently and outwardly wound, with no invalid, degenerate, or
 * duplicate triangles. With `capWinding`, also asserts that its top and bottom
 * caps face up and down. Returns the integrity report.
 */
export function assertHealthyMesh(
    label: string,
    mesh: MeshData,
    options: { capWinding?: boolean } = {}
): MeshIntegrityReport {
    const report = inspectMeshIntegrity(mesh);

    assert.ok(report.vertexCount > 0, `${label} should contain vertices`);
    assert.ok(report.triangleCount > 0, `${label} should contain triangles`);
    assert.equal(report.isValid, true, `${label} integrity failed:\n${reportForMessage(report)}`);
    if (options.capWinding) {
        assert.deepEqual(inspectCapWinding(mesh), {
            reversedTopCount: 0,
            reversedBottomCount: 0,
        });
    }

    return report;
}

/**
 * Asserts that a mesh's indexed triangles form closed surfaces: every edge has
 * exactly two faces with opposite winding, each vertex has a single triangle
 * fan, and no triangle is degenerate or duplicated. Coordinate welding would
 * hide the difference between independently closed shells that touch at an
 * edge or vertex, so this checks the index topology itself.
 *
 * Also asserts that the enclosed volume equals `volume` when given, and is
 * positive otherwise. `label` prefixes every failure message.
 */
export function assertClosedIndexedSurface(
    mesh: MeshData,
    options: { label?: string; volume?: number } = {}
) {
    const prefix = options.label ? `${options.label}: ` : '';
    const edges = new Map<string, { count: number; direction: number }>();
    const links = new Map<number, Map<number, number[]>>();
    for (let i = 0; i < mesh.indices.length; i += 3) {
        const face = mesh.indices.slice(i, i + 3);
        for (let j = 0; j < 3; j++) {
            const a = face[j],
                b = face[(j + 1) % 3],
                c = face[(j + 2) % 3];
            const key = a < b ? `${a},${b}` : `${b},${a}`;
            const edge = edges.get(key) ?? { count: 0, direction: 0 };
            edge.count++;
            edge.direction += a < b ? 1 : -1;
            edges.set(key, edge);
            let link = links.get(a);
            if (!link) links.set(a, (link = new Map()));
            link.set(b, [...(link.get(b) ?? []), c]);
            link.set(c, [...(link.get(c) ?? []), b]);
        }
    }
    for (const [key, edge] of edges) {
        assert.equal(edge.count, 2, `${prefix}edge ${key} must have two faces`);
        assert.equal(edge.direction, 0, `${prefix}edge ${key} must have opposite winding`);
    }
    for (const [vertex, link] of links) {
        const pending = [link.keys().next().value!];
        const seen = new Set<number>();
        while (pending.length) {
            const neighbor = pending.pop()!;
            if (seen.has(neighbor)) continue;
            seen.add(neighbor);
            const adjacent = link.get(neighbor)!;
            assert.equal(adjacent.length, 2, `${prefix}vertex ${vertex} link degree`);
            pending.push(...adjacent);
        }
        assert.equal(seen.size, link.size, `${prefix}vertex ${vertex} must have one surface fan`);
    }
    const report = inspectMeshIntegrity(mesh);
    assert.equal(report.degenerateTriangleCount, 0, `${prefix}degenerate triangles`);
    assert.equal(report.duplicateTriangleCount, 0, `${prefix}duplicate triangles`);
    if (options.volume === undefined) {
        assert.ok(report.signedVolume > 0, `${prefix}enclosed volume must be positive`);
    } else {
        assert.ok(
            Math.abs(report.signedVolume - options.volume) < 1e-6,
            `${prefix}enclosed volume ${report.signedVolume} must be ${options.volume}`
        );
    }
}
