import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import JSZip from 'jszip';
import { applyPreviewLayerRange, previewLayerHeights } from '../src/lib/previewLayerRange.ts';
import {
    rebuildPreviewWireframeOverlay,
    syncPreviewWireframeOverlayVisibility,
} from '../src/lib/previewWireframe.ts';
import { loadViteModule } from './helpers/viteModule.ts';

function slab(base = 0, top = 1.6) {
    const geometry = new THREE.BoxGeometry(1, 1, top - base).translate(0, 0, (top + base) / 2);
    const original = geometry.getAttribute('position').array.slice();
    geometry.userData.kromacutExportGeometry = {
        positions: geometry.getAttribute('position').array,
        indices: geometry.index!.array,
    };
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    Object.assign(mesh.userData, { baseZ: base, topZ: top, kromacutFlatPaintHeightScale: 1 });
    return { mesh, original };
}

function zBounds(geometry: THREE.BufferGeometry) {
    geometry.computeBoundingBox();
    return [geometry.boundingBox!.min.z, geometry.boundingBox!.max.z];
}

test('physical slider boundaries include a thick first layer, exact top, and no float sliver', () => {
    assert.equal(previewLayerHeights(1.6, 0.08, 0.16).length - 1, 19);
    assert.equal(previewLayerHeights(1.68, 0.08, 0.16).length - 1, 20);
    assert.deepEqual(
        previewLayerHeights(0.310000002, 0.08, 0.15).map((h) => Number(h.toFixed(8))),
        [0, 0.15, 0.23, 0.31]
    );
});

test('each layer cutoff trims merged Flat Paint slabs while preserving complete export positions', () => {
    const { mesh, original } = slab();
    for (const height of previewLayerHeights(1.6, 0.08, 0.16).slice(1).reverse()) {
        applyPreviewLayerRange(mesh, 0, height);
        assert.equal(mesh.visible, true);
        assert.ok(Math.abs(zBounds(mesh.geometry)[1] - height) < 1e-6);
        assert.deepEqual(mesh.geometry.userData.kromacutExportGeometry.positions, original);
    }
    applyPreviewLayerRange(mesh, 0.32, 0.48);
    assert.ok(zBounds(mesh.geometry).every((z, i) => Math.abs(z - [0.32, 0.48][i]) < 1e-6));
    applyPreviewLayerRange(mesh, 0.32, 0.32);
    assert.equal(mesh.visible, false);
    applyPreviewLayerRange(mesh, 0, 1.6);
    assert.equal(mesh.visible, true);
    assert.deepEqual(mesh.geometry.getAttribute('position').array, original);
});

test('a cutoff hides face slabs exactly at the boundary and leaves ordinary mesh geometry alone', () => {
    const { mesh, original } = slab(0.72, 0.8);
    applyPreviewLayerRange(mesh, 0, 0.7200000000000001);
    assert.equal(mesh.visible, false);
    delete mesh.userData.kromacutFlatPaintHeightScale;
    const ordinary = slab().mesh;
    delete ordinary.userData.kromacutFlatPaintHeightScale;
    const positions = ordinary.geometry.getAttribute('position');
    applyPreviewLayerRange(ordinary, 0, 0.4);
    assert.equal(ordinary.geometry.getAttribute('position'), positions);
    assert.deepEqual(mesh.geometry.userData.kromacutExportGeometry.positions, original);
});

test('wireframe built during a cut follows both slider handles and restores the full slab', async () => {
    const { mesh } = slab();
    const overlay = new THREE.Group();
    applyPreviewLayerRange(mesh, 0.32, 0.48);
    await rebuildPreviewWireframeOverlay(mesh, overlay);
    const geometry = (overlay.children[0] as THREE.LineSegments).geometry;
    assert.ok(zBounds(geometry).every((z, i) => Math.abs(z - [0.32, 0.48][i]) < 1e-6));
    applyPreviewLayerRange(mesh, 0, 1.6);
    syncPreviewWireframeOverlayVisibility(overlay);
    assert.deepEqual(zBounds(geometry), zBounds(mesh.geometry));
    applyPreviewLayerRange(mesh, 0, 0);
    syncPreviewWireframeOverlayVisibility(overlay);
    assert.equal(overlay.children[0].visible, false);
});

test('3MF includes the complete slab even when the slider cuts or hides it', async () => {
    const { exportObjectTo3MFBlob } =
        await loadViteModule<typeof import('../src/lib/export3mf.ts')>('/src/lib/export3mf.ts');
    const { mesh } = slab();
    const readMesh = async () => {
        const zip = await JSZip.loadAsync(await (await exportObjectTo3MFBlob(mesh)).arrayBuffer());
        const xml = await zip.file('3D/3dmodel.model')!.async('string');
        return xml.match(/<mesh>[\s\S]*?<\/mesh>/g);
    };
    const complete = await readMesh();
    applyPreviewLayerRange(mesh, 0.32, 0.48);
    assert.deepEqual(await readMesh(), complete);
    applyPreviewLayerRange(mesh, 0, 0);
    assert.deepEqual(await readMesh(), complete);
});
