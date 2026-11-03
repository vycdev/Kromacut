import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
    orthographicFromPerspective,
    syncPerspectiveFromOrthographic,
    visibleViewHeight,
} from '../src/lib/cameraProjection.ts';

const ASPECT = 16 / 9;

function createPerspective(position: THREE.Vector3, target: THREE.Vector3) {
    const camera = new THREE.PerspectiveCamera(45, ASPECT, 0.1, 1000);
    camera.position.copy(position);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    return camera;
}

function assertClose(actual: number, expected: number, message?: string) {
    assert.ok(
        Math.abs(actual - expected) < 1e-9,
        `${message ?? 'value'}: expected ${expected}, received ${actual}`
    );
}

function assertVectorClose(actual: THREE.Vector3, expected: THREE.Vector3, message: string) {
    assertClose(actual.x, expected.x, `${message} x`);
    assertClose(actual.y, expected.y, `${message} y`);
    assertClose(actual.z, expected.z, `${message} z`);
}

test('orthographic view frames the target at the perspective view height', () => {
    const target = new THREE.Vector3(0.2, 0.1, -0.3);
    const perspective = createPerspective(new THREE.Vector3(1, 1.5, 2), target);

    const ortho = orthographicFromPerspective(perspective, target, ASPECT);

    assertClose(visibleViewHeight(ortho, target), visibleViewHeight(perspective, target));
    assertClose((ortho.right - ortho.left) / (ortho.top - ortho.bottom), ASPECT, 'aspect');
    assert.equal(ortho.zoom, 1);
    assertVectorClose(ortho.position, perspective.position, 'position');
    assert.ok(ortho.quaternion.equals(perspective.quaternion));
});

test('switching back to perspective keeps zoom changes made in orthographic mode', () => {
    const target = new THREE.Vector3(0.2, 0.1, -0.3);
    const startPosition = new THREE.Vector3(1, 1.5, 2);
    const perspective = createPerspective(startPosition, target);
    const startDistance = startPosition.distanceTo(target);
    const startViewHeight = visibleViewHeight(perspective, target);

    const ortho = orthographicFromPerspective(perspective, target, ASPECT);
    // OrbitControls zooms orthographic cameras by changing `zoom`, not by moving them.
    ortho.zoom = 0.25;
    ortho.updateProjectionMatrix();

    syncPerspectiveFromOrthographic(perspective, ortho, target, ASPECT);

    assertClose(visibleViewHeight(perspective, target), startViewHeight * 4, 'view height');
    assertClose(perspective.position.distanceTo(target), startDistance * 4, 'distance');
    const expectedDirection = startPosition.clone().sub(target).normalize();
    const direction = perspective.position.clone().sub(target).normalize();
    assertVectorClose(direction, expectedDirection, 'view direction');
    assert.ok(perspective.quaternion.equals(ortho.quaternion));
    assertClose(perspective.aspect, ASPECT, 'aspect');

    const nextOrtho = orthographicFromPerspective(perspective, target, ASPECT);
    assertClose(
        visibleViewHeight(nextOrtho, target),
        visibleViewHeight(ortho, target),
        'round-trip view height'
    );
});

test('switching back after zooming in moves the perspective camera closer', () => {
    const target = new THREE.Vector3();
    const perspective = createPerspective(new THREE.Vector3(0, 0.9, 1.8), target);
    const startDistance = perspective.position.distanceTo(target);

    const ortho = orthographicFromPerspective(perspective, target, ASPECT);
    ortho.zoom = 3;
    ortho.updateProjectionMatrix();
    syncPerspectiveFromOrthographic(perspective, ortho, target, ASPECT);

    const distance = perspective.position.distanceTo(target);
    assertClose(distance, startDistance / 3, 'distance');
    assertClose(perspective.far - distance, ortho.far - startDistance, 'depth beyond target');
});

test('repeated zoom-out and zoom-in switches do not accumulate far-plane depth', () => {
    const target = new THREE.Vector3();
    const perspective = createPerspective(new THREE.Vector3(0, 0.9, 1.8), target);
    const startDistance = perspective.position.distanceTo(target);
    const startDepthBeyondTarget = perspective.far - startDistance;

    for (let cycle = 0; cycle < 4; cycle++) {
        for (const zoom of [0.25, 4]) {
            const ortho = orthographicFromPerspective(perspective, target, ASPECT);
            ortho.zoom = zoom;
            ortho.updateProjectionMatrix();
            syncPerspectiveFromOrthographic(perspective, ortho, target, ASPECT);
        }
    }

    const distance = perspective.position.distanceTo(target);
    assertClose(distance, startDistance, 'distance');
    assert.ok(
        Math.abs(perspective.far - distance - startDepthBeyondTarget) < 1e-6,
        `depth beyond target drifted to ${perspective.far - distance}`
    );
});

test('moving the perspective camera back extends the far plane past the target', () => {
    const target = new THREE.Vector3();
    const perspective = createPerspective(new THREE.Vector3(0, 0, 2), target);
    perspective.far = 5;
    perspective.updateProjectionMatrix();

    const ortho = orthographicFromPerspective(perspective, target, ASPECT);
    ortho.zoom = 0.1;
    ortho.updateProjectionMatrix();
    syncPerspectiveFromOrthographic(perspective, ortho, target, ASPECT);

    const distance = perspective.position.distanceTo(target);
    assertClose(distance, 20, 'distance');
    // The depth kept beyond the target matches the orthographic view (5 - 2 = 3).
    assertClose(perspective.far - distance, 3, 'depth beyond target');
});

test('switching back without zooming restores the original perspective camera', () => {
    const target = new THREE.Vector3(0.5, 0, 0);
    const startPosition = new THREE.Vector3(-1, 2, 3);
    const perspective = createPerspective(startPosition, target);

    const ortho = orthographicFromPerspective(perspective, target, ASPECT);
    syncPerspectiveFromOrthographic(perspective, ortho, target, ASPECT);

    assertVectorClose(perspective.position, startPosition, 'position');
    assertClose(perspective.far, 1000, 'far plane');
});

test('a camera on the target backs away along its viewing axis', () => {
    const target = new THREE.Vector3(0, 0, 0);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    ortho.lookAt(new THREE.Vector3(0, 0, -1));
    ortho.updateMatrixWorld();
    const perspective = new THREE.PerspectiveCamera(45, ASPECT, 0.1, 100);

    syncPerspectiveFromOrthographic(perspective, ortho, target, ASPECT);

    const expectedDistance = 2 / (2 * Math.tan(THREE.MathUtils.degToRad(45) / 2));
    assertVectorClose(perspective.position, new THREE.Vector3(0, 0, expectedDistance), 'position');
    assert.ok(Number.isFinite(perspective.far));
});
