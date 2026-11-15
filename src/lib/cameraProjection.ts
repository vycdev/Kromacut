import * as THREE from 'three';

/**
 * Height of the world-space slice that fills the view at `target`. Orthographic cameras ignore
 * distance, so OrbitControls zooms them through `zoom` instead of moving the camera.
 */
export function visibleViewHeight(
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    target: THREE.Vector3
): number {
    if (camera instanceof THREE.OrthographicCamera) {
        return (camera.top - camera.bottom) / camera.zoom;
    }
    const distance = camera.position.distanceTo(target);
    return 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
}

/**
 * Sizes `ortho` to frame `target` like the perspective camera does, from the same position and
 * direction. Any orthographic zoom is discarded so the new frustum alone sets the view.
 */
export function matchOrthographicToPerspective(
    ortho: THREE.OrthographicCamera,
    perspective: THREE.PerspectiveCamera,
    target: THREE.Vector3,
    aspect: number
): void {
    const viewH = visibleViewHeight(perspective, target);
    const viewW = viewH * aspect;
    ortho.left = -viewW / 2;
    ortho.right = viewW / 2;
    ortho.top = viewH / 2;
    ortho.bottom = -viewH / 2;
    ortho.near = perspective.near;
    ortho.far = perspective.far;
    ortho.zoom = 1;
    ortho.position.copy(perspective.position);
    ortho.quaternion.copy(perspective.quaternion);
    ortho.updateProjectionMatrix();
}

/** Creates an orthographic camera that frames `target` like the perspective camera does. */
export function orthographicFromPerspective(
    perspective: THREE.PerspectiveCamera,
    target: THREE.Vector3,
    aspect: number
): THREE.OrthographicCamera {
    const ortho = new THREE.OrthographicCamera();
    matchOrthographicToPerspective(ortho, perspective, target, aspect);
    return ortho;
}

/**
 * Moves the perspective camera so `target` appears at the same size as in the orthographic view,
 * keeping the orthographic view direction. This carries zooming done in orthographic mode back
 * into the perspective view.
 */
export function syncPerspectiveFromOrthographic(
    perspective: THREE.PerspectiveCamera,
    ortho: THREE.OrthographicCamera,
    target: THREE.Vector3,
    aspect: number
): void {
    const viewH = visibleViewHeight(ortho, target);
    const distance = viewH / (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2));

    const offset = ortho.position.clone().sub(target);
    const orthoDistance = offset.length();
    if (orthoDistance > 0) {
        offset.divideScalar(orthoDistance);
    } else {
        // The camera sits on the target; back away along its viewing axis instead.
        ortho.getWorldDirection(offset).negate();
    }

    perspective.position.copy(target).addScaledVector(offset, distance);
    perspective.quaternion.copy(ortho.quaternion);
    // Scale the near plane with the distance so depth precision holds after zooming out, and the
    // near plane never reaches the target after zooming in.
    perspective.near = orthoDistance > 0 ? ortho.near * (distance / orthoDistance) : ortho.near;
    // Keep the same depth range beyond the target so moving back does not clip the model, and
    // moving closer shrinks the far plane again instead of accumulating depth across switches.
    perspective.far = distance + Math.max(0, ortho.far - orthoDistance);
    perspective.aspect = aspect;
    perspective.updateProjectionMatrix();
}

/** Direction from the model toward an auto-framed camera: above, in front, slightly right. */
const FRAMING_DIRECTION = new THREE.Vector3(0.9, 0.8, 1).normalize();
/** Extra distance around the model's bounding sphere so it does not touch the view edges. */
const FRAMING_PADDING = 1.35;

/** Near plane used for a model with the given bounding-sphere radius. */
function framingNearPlane(radius: number): number {
    return Math.max(0.01, radius * 0.01);
}

/**
 * Points the perspective camera at the center of `model` from a fixed viewing angle, far enough
 * away that the whole bounding sphere fits the vertical field of view. Writes the orbit center to
 * `target`. Orthographic views are framed by converting this camera with
 * `matchOrthographicToPerspective`, so both projections frame a model identically.
 */
export function framePerspectiveCamera(
    camera: THREE.PerspectiveCamera,
    model: THREE.Box3,
    target: THREE.Vector3
): void {
    const sphere = model.getBoundingSphere(new THREE.Sphere());
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const distance = (FRAMING_PADDING * sphere.radius) / Math.sin(halfFov);

    target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(FRAMING_DIRECTION, distance);
    camera.lookAt(target);
    camera.near = framingNearPlane(sphere.radius);
    camera.far = sphere.radius * 20;
    camera.updateProjectionMatrix();
}

/**
 * Region the camera must stay out of: the model's bounding box plus a margin of twice the framing
 * near plane. The constraint also reduces an enlarged near plane as the camera approaches it.
 */
export function cameraKeepOutBounds(model: THREE.Box3): THREE.Box3 {
    const radius = model.getBoundingSphere(new THREE.Sphere()).radius;
    return model.clone().expandByScalar(2 * framingNearPlane(radius));
}

/** Distance along `direction` (unit length) from `point`, inside `bounds`, to the box surface. */
function distanceToExit(point: THREE.Vector3, direction: THREE.Vector3, bounds: THREE.Box3) {
    let distance = Infinity;
    for (const axis of ['x', 'y', 'z'] as const) {
        const step = direction[axis];
        if (step > 0) {
            distance = Math.min(distance, (bounds.max[axis] - point[axis]) / step);
        } else if (step < 0) {
            distance = Math.min(distance, (bounds.min[axis] - point[axis]) / step);
        }
    }
    return Math.max(0, distance);
}

/** Unit direction from `target` toward the camera, or backwards along its view axis. */
function directionFromTarget(
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    target: THREE.Vector3
): THREE.Vector3 {
    const direction = camera.position.clone().sub(target);
    const length = direction.length();
    if (length > 0) return direction.divideScalar(length);
    camera.updateMatrixWorld();
    return camera.getWorldDirection(direction).negate();
}

/**
 * Keeps either camera outside `model` plus its framing margin, where front-facing materials
 * otherwise leave an empty or clipped view. An orthographic camera's zoom is also capped where
 * the matching perspective camera (see `syncPerspectiveFromOrthographic`) would reach the box.
 * The near plane shrinks when necessary for close-ups, including after projection switching has
 * enlarged it. Pass the original model bounds, without the keep-out margin.
 *
 * Returns whether the camera changed.
 */
export function keepCameraOutsideBounds(
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    target: THREE.Vector3,
    model: THREE.Box3,
    perspectiveFov: number
): boolean {
    if (model.isEmpty()) return false;
    const bounds = cameraKeepOutBounds(model);
    const direction = directionFromTarget(camera, target);
    let changed = false;

    // Orthographic zoom does not move the camera. Panning can put its actual position inside
    // the model even when its matching perspective position is already safely outside.
    if (bounds.containsPoint(camera.position)) {
        const exit = distanceToExit(camera.position, direction, bounds);
        if (exit > 0) {
            camera.position.addScaledVector(direction, exit);
            changed = true;
        }
    }

    if (camera instanceof THREE.OrthographicCamera) {
        const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(perspectiveFov) / 2);
        const distance = visibleViewHeight(camera, target) / (2 * tanHalfFov);
        const position = target.clone().addScaledVector(direction, distance);
        if (bounds.containsPoint(position)) {
            const exit = distanceToExit(position, direction, bounds);
            if (exit > 0) {
                camera.zoom = (camera.top - camera.bottom) / (2 * (distance + exit) * tanHalfFov);
                changed = true;
            }
        }
    }

    // Projection switching scales the near plane with orthographic zoom. Use actual model
    // clearance, rather than distance to the panned target, to keep nearby surfaces visible.
    const near = Math.min(camera.near, model.distanceToPoint(camera.position) / 2);
    if (near !== camera.near) {
        camera.near = near;
        changed = true;
    }
    if (changed) camera.updateProjectionMatrix();
    return changed;
}
