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

/** Creates an orthographic camera that frames `target` like the perspective camera does. */
export function orthographicFromPerspective(
    perspective: THREE.PerspectiveCamera,
    target: THREE.Vector3,
    aspect: number
): THREE.OrthographicCamera {
    const viewH = visibleViewHeight(perspective, target);
    const viewW = viewH * aspect;
    const ortho = new THREE.OrthographicCamera(
        -viewW / 2,
        viewW / 2,
        viewH / 2,
        -viewH / 2,
        perspective.near,
        perspective.far
    );
    ortho.position.copy(perspective.position);
    ortho.quaternion.copy(perspective.quaternion);
    ortho.updateProjectionMatrix();
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
