import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
    clearPreviewWireframeOverlay,
    rebuildPreviewWireframeOverlay,
    syncPreviewWireframeOverlayVisibility,
} from '../src/lib/previewWireframe.ts';

function createLayerMesh(color: number) {
    return new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color })
    );
}

function createIsolatedTriangleGeometry(triangleCount: number) {
    const positions = new Float32Array(triangleCount * 9);
    for (let triangle = 0; triangle < triangleCount; triangle++) {
        const offset = triangle * 9;
        const x = triangle * 2;
        positions[offset] = x;
        positions[offset + 3] = x + 1;
        positions[offset + 6] = x;
        positions[offset + 7] = 1;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
}

test('wireframe overlay uses thin unlit layer-colored lines outside the export group', async () => {
    const modelGroup = new THREE.Group();
    const redLayer = createLayerMesh(0xff0000);
    const darkLayer = createLayerMesh(0x080808);
    const purpleLayer = createLayerMesh(0x391182);
    darkLayer.position.set(0, 0, 1);
    purpleLayer.position.set(0, 0, 2);
    modelGroup.add(redLayer, darkLayer, purpleLayer);

    const overlay = new THREE.Group();
    assert.equal(await rebuildPreviewWireframeOverlay(modelGroup, overlay), 'overlay');
    assert.equal(modelGroup.children.length, 3);
    assert.equal(overlay.children.length, 3);

    const lines = overlay.children as THREE.LineSegments[];
    for (const line of lines) {
        assert.equal(line.isLineSegments, true);
        assert.ok(line.geometry.getAttribute('position').count > 0);
        const material = line.material as THREE.LineBasicMaterial;
        assert.equal(material.isLineBasicMaterial, true);
        assert.equal(material.linewidth, 1);
        assert.equal(material.toneMapped, false);
        assert.equal(material.depthTest, false);
        assert.equal(material.depthWrite, false);
    }
    assert.equal((lines[0].material as THREE.LineBasicMaterial).color.getHex(), 0xff0000);
    assert.equal((lines[1].material as THREE.LineBasicMaterial).color.getHex(), 0x080808);
    assert.equal((lines[2].material as THREE.LineBasicMaterial).color.getHex(), 0x391182);
    assert.equal(lines[1].matrix.elements[14], 1);

    darkLayer.visible = false;
    syncPreviewWireframeOverlayVisibility(overlay);
    assert.equal(lines[0].visible, true);
    assert.equal(lines[1].visible, false);

    clearPreviewWireframeOverlay(overlay);
    assert.equal(overlay.children.length, 0);
});

test('wireframe overlay welds split vertices before matching feature edges', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const modelGroup = new THREE.Group();
    modelGroup.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x2266aa })));
    const overlay = new THREE.Group();

    assert.equal(await rebuildPreviewWireframeOverlay(modelGroup, overlay), 'overlay');
    const actual = (overlay.children[0] as THREE.LineSegments).geometry.getAttribute('position').count;
    const expectedGeometry = new THREE.EdgesGeometry(geometry, 15);
    const expected = expectedGeometry.getAttribute('position').count;
    assert.equal(actual, expected);

    expectedGeometry.dispose();
    clearPreviewWireframeOverlay(overlay);
    geometry.dispose();
});

test('wireframe overlay orders lines by physical layer height', async () => {
    const higherLayer = createLayerMesh(0xff0000);
    higherLayer.userData.baseZ = 0.4;
    const lowerLayer = createLayerMesh(0x0000ff);
    lowerLayer.userData.baseZ = 0.2;
    const modelGroup = new THREE.Group();
    modelGroup.add(higherLayer, lowerLayer);
    const overlay = new THREE.Group();

    assert.equal(await rebuildPreviewWireframeOverlay(modelGroup, overlay), 'overlay');
    const lines = overlay.children as THREE.LineSegments[];
    assert.equal((lines[0].material as THREE.LineBasicMaterial).color.getHex(), 0x0000ff);
    assert.equal((lines[1].material as THREE.LineBasicMaterial).color.getHex(), 0xff0000);
    assert.deepEqual(
        lines.map((line) => line.renderOrder),
        [2000, 2001]
    );

    clearPreviewWireframeOverlay(overlay);
});

test('wireframe overlay yields through large geometry instead of using dense material wireframes', async () => {
    const geometry = createIsolatedTriangleGeometry(50_001);
    const modelGroup = new THREE.Group();
    modelGroup.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x2266aa })));
    const overlay = new THREE.Group();
    let yieldCount = 0;

    assert.equal(
        await rebuildPreviewWireframeOverlay(modelGroup, overlay, {
            yieldIntervalMs: 0,
            onYield: async () => {
                yieldCount++;
            },
        }),
        'overlay'
    );
    assert.ok(yieldCount > 0);
    assert.equal(overlay.children.length, 1);

    clearPreviewWireframeOverlay(overlay);
    geometry.dispose();
});

test('wireframe overlay drops stale work without adding lines', async () => {
    const geometry = createIsolatedTriangleGeometry(600);
    const modelGroup = new THREE.Group();
    modelGroup.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x2266aa })));
    const overlay = new THREE.Group();
    let current = true;

    assert.equal(
        await rebuildPreviewWireframeOverlay(modelGroup, overlay, {
            yieldIntervalMs: 0,
            isCurrent: () => current,
            onYield: async () => {
                current = false;
            },
        }),
        'cancelled'
    );
    assert.equal(overlay.children.length, 0);

    geometry.dispose();
});

test('stale wireframe work cannot clear a newer overlay build', async () => {
    const staleGeometry = createIsolatedTriangleGeometry(600);
    const staleModel = new THREE.Group();
    staleModel.add(
        new THREE.Mesh(staleGeometry, new THREE.MeshStandardMaterial({ color: 0xff0000 }))
    );
    const currentModel = new THREE.Group();
    currentModel.add(createLayerMesh(0x00ff00));
    const overlay = new THREE.Group();
    let staleCurrent = true;
    let releaseStaleYield: () => void = () => {};
    let reportStaleYield: () => void = () => {};
    const staleYielded = new Promise<void>((resolve) => {
        reportStaleYield = () => resolve();
    });
    const staleYieldGate = new Promise<void>((resolve) => {
        releaseStaleYield = () => resolve();
    });

    const staleBuild = rebuildPreviewWireframeOverlay(staleModel, overlay, {
        yieldIntervalMs: 0,
        isCurrent: () => staleCurrent,
        onYield: async () => {
            reportStaleYield();
            await staleYieldGate;
        },
    });
    await staleYielded;

    staleCurrent = false;
    assert.equal(await rebuildPreviewWireframeOverlay(currentModel, overlay), 'overlay');
    releaseStaleYield();
    assert.equal(await staleBuild, 'cancelled');
    assert.equal(overlay.children.length, 1);
    assert.equal(
        ((overlay.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial).color.getHex(),
        0x00ff00
    );

    clearPreviewWireframeOverlay(overlay);
    staleGeometry.dispose();
});
