import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import * as THREE from 'three';

import { buildPaletteProofSnapshot } from './helpers/paletteProofFixture.ts';
import { withViteTestServer } from './helpers/viteModule.ts';

type PaletteProofModule = typeof import('../src/lib/paletteProof.ts');
type PaletteProofGeometryModule = typeof import('../src/lib/paletteProofGeometry.ts');
type PaletteProofExportModule = typeof import('../src/lib/paletteProofExport.ts');

let modulesPromise: Promise<{
    proof: PaletteProofModule;
    geometry: PaletteProofGeometryModule;
    exporter: PaletteProofExportModule;
}> | null = null;

async function loadModules() {
    modulesPromise ??= withViteTestServer(async (server) => {
        const [proof, geometry, exporter] = await Promise.all([
            server.ssrLoadModule('/src/lib/paletteProof.ts') as Promise<PaletteProofModule>,
            server.ssrLoadModule(
                '/src/lib/paletteProofGeometry.ts'
            ) as Promise<PaletteProofGeometryModule>,
            server.ssrLoadModule(
                '/src/lib/paletteProofExport.ts'
            ) as Promise<PaletteProofExportModule>,
        ]);
        return { proof, geometry, exporter };
    });
    return modulesPromise;
}

function assertClosedPositiveMesh(mesh: THREE.Mesh): void {
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    assert.ok(index, `${mesh.name} should be indexed`);
    const edges = new Map<string, number>();
    let signedVolume = 0;

    for (let offset = 0; offset < index.count; offset += 3) {
        const triangle = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
        for (let edge = 0; edge < 3; edge++) {
            const a = triangle[edge];
            const b = triangle[(edge + 1) % 3];
            const key = a < b ? `${a},${b}` : `${b},${a}`;
            edges.set(key, (edges.get(key) ?? 0) + 1);
        }

        const a = new THREE.Vector3().fromBufferAttribute(position, triangle[0]);
        const b = new THREE.Vector3().fromBufferAttribute(position, triangle[1]);
        const c = new THREE.Vector3().fromBufferAttribute(position, triangle[2]);
        signedVolume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    }

    const invalidEdges = [...edges.entries()].filter(([, count]) => count !== 2);
    assert.equal(
        invalidEdges.length,
        0,
        `${mesh.name} must be closed: ${JSON.stringify(invalidEdges.slice(0, 8))}`
    );
    assert.ok(signedVolume > 0, `${mesh.name} must use outward winding`);
}

function countIndexedComponents(mesh: THREE.Mesh): number {
    const index = mesh.geometry.getIndex();
    assert.ok(index);
    const vertices = new Map<number, number[]>();
    const triangles = Array.from({ length: index.count / 3 }, (_, triangle) =>
        [0, 1, 2].map((offset) => index.getX(triangle * 3 + offset))
    );
    for (let triangle = 0; triangle < triangles.length; triangle++) {
        for (const vertex of triangles[triangle]) {
            const linked = vertices.get(vertex) ?? [];
            linked.push(triangle);
            vertices.set(vertex, linked);
        }
    }

    const unseen = new Set(triangles.map((_, index) => index));
    let components = 0;
    while (unseen.size > 0) {
        components++;
        const pending = [unseen.values().next().value as number];
        while (pending.length > 0) {
            const triangle = pending.pop()!;
            if (!unseen.delete(triangle)) continue;
            for (const vertex of triangles[triangle]) {
                for (const neighbor of vertices.get(vertex) ?? []) {
                    if (unseen.has(neighbor)) pending.push(neighbor);
                }
            }
        }
    }
    return components;
}

test('touching proof layers union adjacent candidates into connected regions', async () => {
    const { proof, geometry } = await loadModules();
    const snapshot = buildPaletteProofSnapshot(8, 8);
    const spec = proof.buildPaletteProofSpec(snapshot);
    const result = geometry.buildPaletteProofGeometry(snapshot, spec);

    assert.equal(spec.layout.widthMm, 44);
    assert.equal(spec.layout.heightMm, 68);
    const a1 = geometry.paletteProofCellBounds(spec, 0, 0);
    const b1 = geometry.paletteProofCellBounds(spec, 1, 0);
    const a2 = geometry.paletteProofCellBounds(spec, 0, 1);
    assert.equal(a1.x1, b1.x0);
    assert.equal(a2.y1, a1.y0);
    for (const child of result.object.children) assertClosedPositiveMesh(child as THREE.Mesh);
    assert.equal(
        countIndexedComponents(result.object.children[1] as THREE.Mesh),
        1,
        'the second layer should contain one unioned candidate region'
    );

    geometry.disposePaletteProofGeometry(result.object);
});

test('proof geometry has one notched foundation and closed physical-layer shells', async () => {
    const { proof, geometry } = await loadModules();
    const snapshot = buildPaletteProofSnapshot(8, 8);
    const spec = proof.buildPaletteProofSpec(snapshot);
    const result = geometry.buildPaletteProofGeometry(snapshot, spec);
    const maxPrefixIndex = Math.max(...spec.cells.map((cell) => cell.prefixIndex));

    assert.equal(result.usedLayerCount, maxPrefixIndex + 1);
    assert.equal(result.reinforcementLayerCount, 0);
    assert.equal(result.object.children.length, result.usedLayerCount);
    for (const child of result.object.children) assertClosedPositiveMesh(child as THREE.Mesh);

    const foundation = result.object.children[0] as THREE.Mesh;
    const bounds = foundation.geometry.boundingBox;
    assert.ok(bounds);
    assert.equal(bounds.max.x - bounds.min.x, spec.layout.widthMm);
    assert.equal(bounds.max.y - bounds.min.y, spec.layout.heightMm);
    const topLeftCell = geometry.paletteProofCellBounds(spec, 0, 0);
    assert.equal(topLeftCell.x0, bounds.min.x + spec.layout.notchSizeMm);
    assert.equal(topLeftCell.y1, bounds.max.y - spec.layout.notchSizeMm);
    const nextCandidate = geometry.paletteProofCellBounds(spec, 1, 0);
    const nextTarget = geometry.paletteProofCellBounds(spec, 0, 1);
    assert.equal(nextCandidate.y0, topLeftCell.y0, 'B1 must be directly right of A1');
    assert.ok(nextCandidate.x0 > topLeftCell.x0, 'B1 must be directly right of A1');
    assert.equal(nextTarget.x0, topLeftCell.x0, 'A2 must be directly below A1');
    assert.ok(nextTarget.y0 < topLeftCell.y0, 'A2 must be directly below A1');
    const positions = foundation.geometry.getAttribute('position');
    const hasRemovedTopLeftCorner = Array.from({ length: positions.count }).every(
        (_, index) =>
            positions.getX(index) !== bounds.min.x || positions.getY(index) !== bounds.max.y
    );
    assert.equal(hasRemovedTopLeftCorner, true);
    assert.equal(
        Array.from({ length: positions.count }).some(
            (_, index) =>
                positions.getX(index) === bounds.max.x && positions.getY(index) === bounds.min.y
        ),
        false,
        'foundation outer corners should be rounded'
    );

    const firstRaisedLayer = result.object.children[1] as THREE.Mesh;
    const firstRaisedBounds = firstRaisedLayer.geometry.boundingBox;
    assert.ok(firstRaisedBounds);
    assert.ok(firstRaisedBounds.max.x - firstRaisedBounds.min.x < spec.layout.widthMm);
    assert.ok(firstRaisedBounds.max.y - firstRaisedBounds.min.y < spec.layout.heightMm);

    const foundationCell = spec.cells.find((cell) => cell.prefixIndex === 0);
    assert.ok(foundationCell);
    const foundationCellBounds = geometry.paletteProofCellBounds(
        spec,
        foundationCell.row,
        foundationCell.column
    );
    const raycaster = new THREE.Raycaster(
        new THREE.Vector3(
            (foundationCellBounds.x0 + foundationCellBounds.x1) / 2,
            (foundationCellBounds.y0 + foundationCellBounds.y1) / 2,
            snapshot.layers[1].endHeight + 1
        ),
        new THREE.Vector3(0, 0, -1)
    );
    assert.equal(
        raycaster.intersectObject(firstRaisedLayer).length,
        0,
        'foundation-reference samples must remain at their exact prefix'
    );

    for (let layerIndex = 1; layerIndex < result.usedLayerCount; layerIndex++) {
        assert.deepEqual(
            result.activeCellIdsByLayer[layerIndex],
            spec.cells.filter((cell) => cell.prefixIndex >= layerIndex).map((cell) => cell.id)
        );
    }

    geometry.disposePaletteProofGeometry(result.object);
});

test('proof 3MF embeds its immutable map and frozen print instructions', async () => {
    const { proof, exporter } = await loadModules();
    const snapshot = buildPaletteProofSnapshot(8, 8);
    const spec = proof.buildPaletteProofSpec(snapshot);
    const blob = await exporter.exportPaletteProof3MF(snapshot, spec);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const contentTypes = await zip.file('[Content_Types].xml')?.async('string');
    const model = await zip.file('3D/3dmodel.model')?.async('string');
    const manifestText = await zip.file('Metadata/palette-proof.json')?.async('string');
    const instructions = await zip.file('Metadata/palette-proof-instructions.txt')?.async('string');

    assert.ok(contentTypes);
    assert.ok(model);
    assert.ok(manifestText);
    assert.ok(instructions);
    assert.match(
        contentTypes,
        /<Override PartName="\/Metadata\/palette-proof\.json" ContentType="application\/json"\/>/
    );
    assert.match(
        contentTypes,
        /<Override PartName="\/Metadata\/palette-proof-instructions\.txt" ContentType="text\/plain"\/>/
    );
    const manifest = JSON.parse(manifestText);
    assert.equal(manifest.proof.id, spec.id);
    assert.equal(manifest.finalStack.fingerprint, snapshot.fingerprint);
    assert.match(instructions, /missing corner is the top-left marker/i);
    assert.match(instructions, /Sample spacing: touching \(no gaps\)/);
    assert.doesNotMatch(instructions, /Reinforcement grid/);
    assert.match(instructions, /Physical sequence:/);

    const maxPrefixIndex = Math.max(...spec.cells.map((cell) => cell.prefixIndex));
    const modelObjectCount = model.match(/<object\b[^>]*type="model"/g)?.length ?? 0;
    assert.equal(modelObjectCount, maxPrefixIndex + 2);
});
