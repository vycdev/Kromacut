import * as THREE from 'three';

const HEIGHT_EPSILON = 1e-6;
interface ClippedGeometry {
    original: THREE.BufferAttribute;
    preview?: THREE.BufferAttribute;
    min: number;
    max: number;
}
const clippedGeometries = new WeakMap<THREE.BufferGeometry, ClippedGeometry>();

/** Physical boundaries, including the thicker first layer and the exact model top. */
export function previewLayerHeights(total: number, layerHeight: number, firstLayerHeight: number) {
    if (total <= 0 || layerHeight <= 0) return [0];
    const heights = [0];
    const first = Math.max(layerHeight, firstLayerHeight);
    for (let i = 0; first + i * layerHeight < total - HEIGHT_EPSILON; i++) {
        heights.push(first + i * layerHeight);
    }
    heights.push(total);
    return heights;
}

/** Wireframe edges must be built from the full slab, even while it is cut. */
export function previewSourcePosition(geometry: THREE.BufferGeometry) {
    return clippedGeometries.get(geometry)?.original ?? geometry.getAttribute('position');
}

function clipSlabGeometry(geometry: THREE.BufferGeometry, min: number, max: number) {
    let state = clippedGeometries.get(geometry);
    if (!state) {
        const position = geometry.getAttribute('position');
        if (!(position instanceof THREE.BufferAttribute)) return;
        const original = new THREE.BufferAttribute(
            position.array,
            position.itemSize,
            position.normalized
        );
        state = { original, min: -Infinity, max: Infinity };
        clippedGeometries.set(geometry, state);
    }
    if (state.min === min && state.max === max) return;
    state.min = min;
    state.max = max;
    // Detach the render array from export positions once, retaining the same
    // BufferAttribute/GPU buffer when cutting and restoring the preview.
    if (!state.preview) {
        state.preview = geometry.getAttribute('position') as THREE.BufferAttribute;
        state.preview.array = state.original.array.slice();
    }
    if (min === -Infinity && max === Infinity) {
        state.preview.copyArray(state.original.array);
    } else {
        // Flat Paint is an extrusion: moving both caps to the cut boundaries
        // preserves a closed solid without changing the source for export.
        for (let i = 0; i < state.original.count; i++) {
            state.preview.setZ(i, Math.max(min, Math.min(max, state.original.getZ(i))));
        }
    }
    state.preview.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
}

/** Keep scene-only wireframe edges at the same cut as their source slab. */
export function syncPreviewGeometryRange(
    source: THREE.BufferGeometry,
    target: THREE.BufferGeometry
) {
    const range = clippedGeometries.get(source);
    clipSlabGeometry(target, range?.min ?? -Infinity, range?.max ?? Infinity);
}

export function applyPreviewLayerRange(root: THREE.Object3D, low: number, high: number) {
    const min = Math.min(low, high);
    const max = Math.max(low, high);
    root.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || child.userData.baseZ === undefined) return;
        const base = Number(child.userData.baseZ);
        const top = Number(child.userData.topZ ?? base);
        child.visible = Math.min(top, max) - Math.max(base, min) > HEIGHT_EPSILON;
        const scale = child.userData.kromacutFlatPaintHeightScale;
        if (typeof scale !== 'number') return;
        const cutBottom = min > base + HEIGHT_EPSILON;
        const cutTop = max < top - HEIGHT_EPSILON;
        clipSlabGeometry(
            child.geometry,
            cutBottom ? min * scale : -Infinity,
            cutTop ? max * scale : Infinity
        );
    });
}
