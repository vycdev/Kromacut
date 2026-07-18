import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import * as THREE from 'three';
import { createServer } from 'vite';

import { buildPaletteProofSnapshot } from './helpers/paletteProofFixture.ts';

type PaletteProofModule = typeof import('../src/lib/paletteProof.ts');
type PaletteProofGeometryModule = typeof import('../src/lib/paletteProofGeometry.ts');
type PaletteProofExportModule = typeof import('../src/lib/paletteProofExport.ts');

let modulesPromise: Promise<{
    proof: PaletteProofModule;
    geometry: PaletteProofGeometryModule;
    exporter: PaletteProofExportModule;
}> | null = null;

async function loadModules() {
    modulesPromise ??= (async () => {
        const server = await createServer({
            appType: 'custom',
            cacheDir: 'dist/.vite-test-cache',
            configFile: false,
            logLevel: 'error',
            optimizeDeps: { noDiscovery: true },
            resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
            root: process.cwd(),
            server: { hmr: false, middlewareMode: true },
        });

        try {
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
        } finally {
            await server.close();
        }
    })();
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

    assert.ok([...edges.values()].every((count) => count === 2), `${mesh.name} must be closed`);
    assert.ok(signedVolume > 0, `${mesh.name} must use outward winding`);
}

test('proof geometry has one notched foundation and closed physical-layer shells', async () => {
    const { proof, geometry } = await loadModules();
    const snapshot = buildPaletteProofSnapshot(8, 8);
    const spec = proof.buildPaletteProofSpec(snapshot);
    const result = geometry.buildPaletteProofGeometry(snapshot, spec);
    const maxPrefixIndex = Math.max(...spec.cells.map((cell) => cell.prefixIndex));

    assert.equal(result.usedLayerCount, maxPrefixIndex + 1);
    assert.equal(result.reinforcementLayerCount, 2);
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
    const reinforcedBounds = firstRaisedLayer.geometry.boundingBox;
    assert.ok(reinforcedBounds);
    assert.equal(reinforcedBounds.max.x - reinforcedBounds.min.x, spec.layout.widthMm);
    assert.equal(reinforcedBounds.max.y - reinforcedBounds.min.y, spec.layout.heightMm);
    const firstRaisedPositions = firstRaisedLayer.geometry.getAttribute('position');
    const firstRaisedCell = spec.cells.find((cell) => cell.prefixIndex >= 1);
    assert.ok(firstRaisedCell);
    const firstRaisedBounds = geometry.paletteProofCellBounds(
        spec,
        firstRaisedCell.row,
        firstRaisedCell.column
    );
    assert.equal(
        Array.from({ length: firstRaisedPositions.count }).some(
            (_, index) =>
                firstRaisedPositions.getX(index) === firstRaisedBounds.x0 &&
                firstRaisedPositions.getY(index) === firstRaisedBounds.y0
        ),
        false,
        'candidate patch corners should be rounded'
    );
    assert.ok(
        firstRaisedPositions.count > result.activeCellIdsByLayer[1].length * 8,
        'rounded patches should expose segmented corner vertices'
    );

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
        'reinforcement must leave foundation-reference samples at their exact prefix'
    );

    const layerAfterReinforcement = result.object.children[3] as THREE.Mesh;
    assert.ok(layerAfterReinforcement.geometry.boundingBox);
    assert.ok(
        layerAfterReinforcement.geometry.boundingBox.max.x -
            layerAfterReinforcement.geometry.boundingBox.min.x <
            spec.layout.widthMm,
        'reinforcement should stop after two added grid layers'
    );

    for (let layerIndex = 1; layerIndex < result.usedLayerCount; layerIndex++) {
        assert.deepEqual(
            result.activeCellIdsByLayer[layerIndex],
            spec.cells
                .filter((cell) => cell.prefixIndex >= layerIndex)
                .map((cell) => cell.id)
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
    const model = await zip.file('3D/3dmodel.model')?.async('string');
    const manifestText = await zip.file('Metadata/palette-proof.json')?.async('string');
    const instructions = await zip
        .file('Metadata/palette-proof-instructions.txt')
        ?.async('string');

    assert.ok(model);
    assert.ok(manifestText);
    assert.ok(instructions);
    const manifest = JSON.parse(manifestText);
    assert.equal(manifest.proof.id, spec.id);
    assert.equal(manifest.finalStack.fingerprint, snapshot.fingerprint);
    assert.match(instructions, /missing corner is the top-left marker/i);
    assert.match(instructions, /Reinforcement grid: 2 layer\(s\)/);
    assert.match(instructions, /Physical sequence:/);

    const maxPrefixIndex = Math.max(...spec.cells.map((cell) => cell.prefixIndex));
    const modelObjectCount = model.match(/<object\b[^>]*type="model"/g)?.length ?? 0;
    assert.equal(modelObjectCount, maxPrefixIndex + 2);
});
