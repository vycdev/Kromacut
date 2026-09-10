import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyPreviewColorMode } from '../src/lib/previewColorMode.ts';

function createTaggedMesh(virtualHex: string, filamentHex: string) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: virtualHex });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.kromacutPreviewVirtualHex = virtualHex;
    mesh.userData.kromacutPreviewFilamentHex = filamentHex;
    return { mesh, material, geometry };
}

test('physical mode swaps tagged mesh colors to the filament hex, and back to simulated', () => {
    const { mesh, material } = createTaggedMesh('#3050c0', '#ff8800');

    assert.equal(applyPreviewColorMode(new THREE.Group().add(mesh), 'physical'), true);
    assert.equal(material.color.getHexString(), 'ff8800');

    assert.equal(applyPreviewColorMode(mesh, 'simulated'), true);
    assert.equal(material.color.getHexString(), '3050c0');
});

test('applying the already-active mode is a no-op and reports no change', () => {
    const { mesh, material } = createTaggedMesh('#3050c0', '#ff8800');

    assert.equal(applyPreviewColorMode(mesh, 'simulated'), false);
    assert.equal(material.color.getHexString(), '3050c0');

    applyPreviewColorMode(mesh, 'physical');
    assert.equal(applyPreviewColorMode(mesh, 'physical'), false);
});

test('untagged meshes (manual mode) are left untouched', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: '#123456' });
    const mesh = new THREE.Mesh(geometry, material);

    assert.equal(applyPreviewColorMode(mesh, 'physical'), false);
    assert.equal(material.color.getHexString(), '123456');
});

test('flat paint carrier layers with identical virtual and filament hex are stable across modes', () => {
    const { mesh, material } = createTaggedMesh('#ffffff', '#ffffff');

    assert.equal(applyPreviewColorMode(mesh, 'physical'), false);
    assert.equal(applyPreviewColorMode(mesh, 'simulated'), false);
    assert.equal(material.color.getHexString(), 'ffffff');
});

test('preserves geometry, visibility, and non-color material state', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
        color: '#3050c0',
        transparent: true,
        opacity: 0.3,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.kromacutPreviewVirtualHex = '#3050c0';
    mesh.userData.kromacutPreviewFilamentHex = '#ff8800';

    applyPreviewColorMode(mesh, 'physical');

    assert.equal(mesh.geometry, geometry);
    assert.equal(mesh.visible, true);
    assert.equal(material.transparent, true);
    assert.equal(material.opacity, 0.3);
});

test('only meshes with both preview hex tags are affected in a mixed tree', () => {
    const tagged = createTaggedMesh('#3050c0', '#ff8800');
    const untagged = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: '#00ff00' })
    );
    const root = new THREE.Group();
    root.add(tagged.mesh, untagged);

    assert.equal(applyPreviewColorMode(root, 'physical'), true);
    assert.equal(tagged.material.color.getHexString(), 'ff8800');
    assert.equal(
        (untagged.material as THREE.MeshStandardMaterial).color.getHexString(),
        '00ff00'
    );
});
