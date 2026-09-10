import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
    applyPreviewRenderMode,
    createPreviewMaterialBaselines,
    TRANSPARENT_PREVIEW_OPACITY,
} from '../src/lib/previewRenderMode.ts';
import { applyPreviewColorMode } from '../src/lib/previewColorMode.ts';

function createPreviewRoot() {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const normal = new THREE.MeshStandardMaterial({ color: 0x2266aa });
    const carrier = new THREE.MeshStandardMaterial({
        color: 0xeeddcc,
        transparent: true,
        opacity: 0.3,
    });
    const normalMesh = new THREE.Mesh(geometry, normal);
    const carrierMesh = new THREE.Mesh(geometry.clone(), carrier);
    carrierMesh.position.z = 1;
    normalMesh.userData.baseZ = 0.2;
    carrierMesh.userData.baseZ = 0.4;
    root.add(normalMesh, carrierMesh);
    return { root, normal, carrier, normalMesh, carrierMesh };
}

test('preview render modes preserve material colors, geometry, visibility, and shaded baselines', () => {
    const { root, normal, carrier, normalMesh, carrierMesh } = createPreviewRoot();
    const normalColor = normal.color.getHex();
    const carrierColor = carrier.color.getHex();
    const normalGeometry = normalMesh.geometry;
    const carrierGeometry = carrierMesh.geometry;
    const baselines = createPreviewMaterialBaselines();

    assert.equal(applyPreviewRenderMode(root, 'transparent', baselines), true);
    for (const material of [normal, carrier]) {
        assert.equal(material.transparent, true);
        assert.equal(material.opacity, TRANSPARENT_PREVIEW_OPACITY);
        assert.equal(material.depthWrite, false);
        assert.equal(material.depthTest, false);
        assert.equal(material.colorWrite, true);
        assert.equal(material.side, THREE.DoubleSide);
        assert.equal(material.wireframe, false);
    }
    assert.ok(normalMesh.renderOrder < carrierMesh.renderOrder);

    assert.equal(applyPreviewRenderMode(root, 'wireframe', baselines), true);
    for (const material of [normal, carrier]) {
        assert.equal(material.transparent, false);
        assert.equal(material.opacity, 1);
        assert.equal(material.depthWrite, false);
        assert.equal(material.depthTest, false);
        assert.equal(material.colorWrite, false);
        assert.equal(material.side, THREE.DoubleSide);
        assert.equal(material.wireframe, false);
    }

    assert.equal(applyPreviewRenderMode(root, 'shaded', baselines), true);
    assert.equal(normal.transparent, false);
    assert.equal(normal.opacity, 1);
    assert.equal(normal.depthWrite, true);
    assert.equal(normal.depthTest, true);
    assert.equal(normal.colorWrite, true);
    assert.equal(normal.side, THREE.FrontSide);
    assert.equal(normal.wireframe, false);
    assert.equal(carrier.transparent, true);
    assert.equal(carrier.opacity, 0.3);
    assert.equal(carrier.depthWrite, true);
    assert.equal(carrier.depthTest, true);
    assert.equal(carrier.colorWrite, true);
    assert.equal(carrier.side, THREE.FrontSide);
    assert.equal(carrier.wireframe, false);
    assert.equal(normal.color.getHex(), normalColor);
    assert.equal(carrier.color.getHex(), carrierColor);
    assert.equal(normalMesh.geometry, normalGeometry);
    assert.equal(carrierMesh.geometry, carrierGeometry);
    assert.equal(normalMesh.visible, true);
    assert.equal(carrierMesh.visible, true);
    assert.equal(normalMesh.renderOrder, 0);
    assert.equal(carrierMesh.renderOrder, 0);
    assert.equal(applyPreviewRenderMode(root, 'shaded', baselines), false);
});

test('color-accurate mode uses unlit, non-tone-mapped colors and restores the shaded material', () => {
    const { root, normal, normalMesh } = createPreviewRoot();
    const baselines = createPreviewMaterialBaselines();

    assert.equal(applyPreviewRenderMode(root, 'color-accurate', baselines), true);
    const accurate = normalMesh.material;
    assert.ok(accurate instanceof THREE.MeshBasicMaterial);
    assert.notEqual(accurate, normal);
    assert.equal(accurate.toneMapped, false);
    assert.equal(accurate.color.getHexString(), '2266aa');
    assert.equal(normal.color.getHexString(), '2266aa');
    assert.equal(normalMesh.renderOrder, 0);

    assert.equal(applyPreviewRenderMode(root, 'color-accurate', baselines), false);
    assert.equal(applyPreviewRenderMode(root, 'shaded', baselines), true);
    assert.equal(normalMesh.material, normal);
    assert.equal(normal.color.getHexString(), '2266aa');
});

test('color source changes made in color-accurate mode carry back to shaded mode', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: '#3050c0' });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.userData.kromacutPreviewVirtualHex = '#3050c0';
    mesh.userData.kromacutPreviewFilamentHex = '#ff8800';
    root.add(mesh);
    const baselines = createPreviewMaterialBaselines();

    applyPreviewRenderMode(root, 'color-accurate', baselines);
    applyPreviewColorMode(root, 'physical');
    assert.equal(
        (mesh.material as unknown as THREE.MeshBasicMaterial).color.getHexString(),
        'ff8800'
    );
    assert.equal(material.color.getHexString(), '3050c0');

    applyPreviewRenderMode(root, 'shaded', baselines);
    assert.equal(mesh.material, material);
    assert.equal(material.color.getHexString(), 'ff8800');
});

test('inspection modes tolerate a transient mesh without a material', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    (mesh as unknown as { material: THREE.Material | undefined }).material = undefined;
    const root = new THREE.Group().add(mesh);
    const baselines = createPreviewMaterialBaselines();

    assert.doesNotThrow(() => applyPreviewRenderMode(root, 'color-accurate', baselines));
    assert.doesNotThrow(() => applyPreviewRenderMode(root, 'shaded', baselines));
});

test('inspection ordering remains unique for meshes at the same physical height', () => {
    const root = new THREE.Group();
    const meshes = [0.2, 0.4, 0.4].map((baseZ, index) => {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshBasicMaterial({ color: 0x2266aa + index })
        );
        mesh.userData.baseZ = baseZ;
        root.add(mesh);
        return mesh;
    });
    const baselines = createPreviewMaterialBaselines();

    applyPreviewRenderMode(root, 'transparent', baselines);
    assert.deepEqual(
        meshes.map((mesh) => mesh.renderOrder),
        [1000, 1001, 1002]
    );

    applyPreviewRenderMode(root, 'shaded', baselines);
    assert.deepEqual(
        meshes.map((mesh) => mesh.renderOrder),
        [0, 0, 0]
    );
});
