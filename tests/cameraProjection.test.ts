import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
    cameraKeepOutBounds,
    framePerspectiveCamera,
    keepCameraOutsideBounds,
    matchOrthographicToPerspective,
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

test('the near plane scales with the distance carried over from orthographic zoom', () => {
    const target = new THREE.Vector3();
    const perspective = createPerspective(new THREE.Vector3(0, 0, 2), target);
    perspective.near = 0.01;
    perspective.updateProjectionMatrix();

    const zoomedOut = orthographicFromPerspective(perspective, target, ASPECT);
    zoomedOut.zoom = 0.01;
    zoomedOut.updateProjectionMatrix();
    syncPerspectiveFromOrthographic(perspective, zoomedOut, target, ASPECT);

    assertClose(perspective.position.distanceTo(target), 200, 'zoomed-out distance');
    assertClose(perspective.near, 1, 'zoomed-out near plane');

    const zoomedIn = orthographicFromPerspective(perspective, target, ASPECT);
    zoomedIn.zoom = 1000;
    zoomedIn.updateProjectionMatrix();
    syncPerspectiveFromOrthographic(perspective, zoomedIn, target, ASPECT);

    const distance = perspective.position.distanceTo(target);
    assertClose(distance, 0.2, 'zoomed-in distance');
    assertClose(perspective.near, 0.001, 'zoomed-in near plane');
    assert.ok(perspective.near < distance, 'near plane stays in front of the target');
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

// A 140 x 140 x 3 mm flat print: its bounding sphere (radius ~99 mm) is far larger than its height.
function createSlab() {
    return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(140, 140, 3));
}

function assertOnBoundsSurface(point: THREE.Vector3, bounds: THREE.Box3, message: string) {
    assert.ok(
        bounds.clone().expandByScalar(1e-9).containsPoint(point),
        `${message}: ${point.toArray()} is outside the bounds`
    );
    assert.ok(
        !bounds.clone().expandByScalar(-1e-9).containsPoint(point),
        `${message}: ${point.toArray()} is inside the bounds`
    );
}

test('framing fits the model bounding sphere in the perspective view', () => {
    const model = createSlab();
    const sphere = model.getBoundingSphere(new THREE.Sphere());
    const camera = new THREE.PerspectiveCamera(45, ASPECT, 0.1, 1000);
    const target = new THREE.Vector3();

    framePerspectiveCamera(camera, model, target);

    assertVectorClose(target, sphere.center, 'target');
    const distance = camera.position.distanceTo(target);
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    assertClose(distance * Math.sin(halfFov), 1.35 * sphere.radius, 'padded sphere fit');
    const viewDirection = camera.getWorldDirection(new THREE.Vector3());
    const towardTarget = target.clone().sub(camera.position).normalize();
    assertVectorClose(viewDirection, towardTarget, 'looks at target');
    assertClose(camera.near, sphere.radius * 0.01, 'near plane');
    assertClose(camera.far, sphere.radius * 20, 'far plane');
    assert.ok(camera.far > distance + sphere.radius, 'far plane includes the whole model');
});

test('framing a tiny model keeps a minimum near plane', () => {
    const model = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(0.1, 0.1, 0.1));
    const camera = new THREE.PerspectiveCamera(45, ASPECT, 0.1, 1000);

    framePerspectiveCamera(camera, model, new THREE.Vector3());

    assertClose(camera.near, 0.01, 'near plane');
});

test('framing in orthographic mode matches framing in perspective mode', () => {
    const model = createSlab();
    const perspective = new THREE.PerspectiveCamera(45, ASPECT, 0.1, 1000);
    const target = new THREE.Vector3();
    // A zoomed orthographic camera left over from viewing a previous model.
    const ortho = new THREE.OrthographicCamera(-4, 4, 2, -2, 0.5, 30);
    ortho.zoom = 3;
    ortho.updateProjectionMatrix();

    framePerspectiveCamera(perspective, model, target);
    matchOrthographicToPerspective(ortho, perspective, target, ASPECT);

    assert.equal(ortho.zoom, 1);
    assertClose(
        visibleViewHeight(ortho, target),
        visibleViewHeight(perspective, target),
        'view height'
    );
    assertClose((ortho.right - ortho.left) / (ortho.top - ortho.bottom), ASPECT, 'aspect');
    assertVectorClose(ortho.position, perspective.position, 'position');
    assert.ok(ortho.quaternion.equals(perspective.quaternion));
    assertClose(ortho.near, perspective.near, 'near plane');
    assertClose(ortho.far, perspective.far, 'far plane');

    // Switching back without zooming leaves the perspective framing unchanged.
    const framedPosition = perspective.position.clone();
    syncPerspectiveFromOrthographic(perspective, ortho, target, ASPECT);
    assertVectorClose(perspective.position, framedPosition, 'perspective position');
});

test('the keep-out region adds a margin of twice the framing near plane', () => {
    const model = createSlab();
    const camera = new THREE.PerspectiveCamera(45, ASPECT, 0.1, 1000);
    framePerspectiveCamera(camera, model, new THREE.Vector3());

    const bounds = cameraKeepOutBounds(model);

    const margin = 2 * camera.near;
    assertVectorClose(bounds.min, model.min.clone().subScalar(margin), 'min');
    assertVectorClose(bounds.max, model.max.clone().addScalar(margin), 'max');
});

test('a perspective camera moved into the model returns to its surface', () => {
    const model = createSlab();
    const bounds = cameraKeepOutBounds(model);
    const target = new THREE.Vector3(70, 70, 1.5);
    const camera = createPerspective(new THREE.Vector3(72, 69, 2), target);
    const direction = camera.position.clone().sub(target).normalize();

    assert.equal(keepCameraOutsideBounds(camera, target, bounds, camera.fov), true);

    assertOnBoundsSurface(camera.position, bounds, 'camera');
    const nextDirection = camera.position.clone().sub(target).normalize();
    assertVectorClose(nextDirection, direction, 'view direction');
});

test('a perspective camera can still inspect a flat model up close', () => {
    const model = createSlab();
    const bounds = cameraKeepOutBounds(model);
    const target = new THREE.Vector3(70, 70, 1.5);
    // 10 mm above the top surface: far closer than the ~99 mm bounding-sphere radius.
    const position = new THREE.Vector3(70, 65, 13);
    const camera = createPerspective(position, target);

    assert.equal(keepCameraOutsideBounds(camera, target, bounds, camera.fov), false);

    assertVectorClose(camera.position, position, 'position');
});

test('a camera panned into the model leaves it on the side away from the target', () => {
    const model = createSlab();
    const bounds = cameraKeepOutBounds(model);
    // Panning moves the orbit target with the camera, so the target can end up outside the model.
    const target = new THREE.Vector3(-20, 70, 1.5);
    const camera = createPerspective(new THREE.Vector3(5, 70, 1.5), target);

    assert.equal(keepCameraOutsideBounds(camera, target, bounds, camera.fov), true);

    assertVectorClose(camera.position, new THREE.Vector3(bounds.max.x, 70, 1.5), 'position');
});

test('a perspective camera on its target backs out along its viewing axis', () => {
    const model = createSlab();
    const bounds = cameraKeepOutBounds(model);
    const target = new THREE.Vector3(70, 70, 1.5);
    const camera = new THREE.PerspectiveCamera(45, ASPECT, 0.1, 1000);
    camera.position.copy(target);
    camera.lookAt(new THREE.Vector3(70, 70, 0));

    assert.equal(keepCameraOutsideBounds(camera, target, bounds, camera.fov), true);

    assertVectorClose(camera.position, new THREE.Vector3(70, 70, bounds.max.z), 'position');
});

test('orthographic zoom stops where the perspective camera would reach the model', () => {
    const model = createSlab();
    const bounds = cameraKeepOutBounds(model);
    const target = new THREE.Vector3(70, 70, 1.5);
    const perspective = createPerspective(new THREE.Vector3(70, 20, 60), target);
    const ortho = orthographicFromPerspective(perspective, target, ASPECT);

    assert.equal(keepCameraOutsideBounds(ortho, target, bounds, perspective.fov), false);
    assert.equal(ortho.zoom, 1);

    ortho.zoom = 1000;
    ortho.updateProjectionMatrix();
    assert.equal(keepCameraOutsideBounds(ortho, target, bounds, perspective.fov), true);

    assert.ok(ortho.zoom > 1 && ortho.zoom < 1000, `zoom capped at ${ortho.zoom}`);
    syncPerspectiveFromOrthographic(perspective, ortho, target, ASPECT);
    assertOnBoundsSurface(perspective.position, bounds, 'perspective camera');
});

test('switching back after zooming far into the model keeps the camera outside it', () => {
    const model = createSlab();
    const bounds = cameraKeepOutBounds(model);
    const target = new THREE.Vector3(70, 70, 1.5);
    const startPosition = new THREE.Vector3(70, 20, 60);
    const direction = startPosition.clone().sub(target).normalize();
    const perspective = createPerspective(startPosition, target);

    const ortho = orthographicFromPerspective(perspective, target, ASPECT);
    ortho.zoom = 1000;
    ortho.updateProjectionMatrix();
    syncPerspectiveFromOrthographic(perspective, ortho, target, ASPECT);
    assert.ok(bounds.containsPoint(perspective.position), 'unconstrained switch enters the model');

    assert.equal(keepCameraOutsideBounds(perspective, target, bounds, perspective.fov), true);

    assertOnBoundsSurface(perspective.position, bounds, 'perspective camera');
    const nextDirection = perspective.position.clone().sub(target).normalize();
    assertVectorClose(nextDirection, direction, 'view direction');
    assert.ok(
        perspective.near < perspective.position.distanceTo(target),
        'near plane stays in front of the target'
    );
});

test('an empty keep-out region leaves the camera unchanged', () => {
    const target = new THREE.Vector3();
    const position = new THREE.Vector3(0, 0, 0.5);
    const camera = createPerspective(position, target);

    assert.equal(keepCameraOutsideBounds(camera, target, new THREE.Box3(), camera.fov), false);

    assertVectorClose(camera.position, position, 'position');
});
