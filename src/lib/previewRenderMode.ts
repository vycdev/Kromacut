import * as THREE from 'three';
import type { PreviewRenderMode } from '../types';

export const TRANSPARENT_PREVIEW_OPACITY = 0.28;

type PreviewMaterial = THREE.Material & {
    transparent: boolean;
    opacity: number;
    depthWrite: boolean;
    depthTest: boolean;
    colorWrite: boolean;
    side: THREE.Side;
    wireframe: boolean;
};

interface PreviewMaterialBaseline {
    transparent: boolean;
    opacity: number;
    depthWrite: boolean;
    depthTest: boolean;
    colorWrite: boolean;
    side: THREE.Side;
    wireframe: boolean;
}

interface PreviewMeshBaseline {
    renderOrder: number;
}

export interface PreviewMaterialBaselines {
    materials: WeakMap<THREE.Material, PreviewMaterialBaseline>;
    meshes: WeakMap<THREE.Mesh, PreviewMeshBaseline>;
}

function isPreviewMaterial(material: THREE.Material): material is PreviewMaterial {
    return 'wireframe' in material && 'colorWrite' in material;
}

function readBaseline(material: PreviewMaterial): PreviewMaterialBaseline {
    const baseline: PreviewMaterialBaseline = {
        transparent: material.transparent,
        opacity: material.opacity,
        depthWrite: material.depthWrite,
        depthTest: material.depthTest,
        colorWrite: material.colorWrite,
        side: material.side,
        wireframe: material.wireframe,
    };
    return baseline;
}

function renderStateForMode(
    mode: PreviewRenderMode,
    baseline: PreviewMaterialBaseline
): PreviewMaterialBaseline {
    switch (mode) {
        case 'transparent':
            return {
                ...baseline,
                transparent: true,
                opacity: TRANSPARENT_PREVIEW_OPACITY,
                depthWrite: false,
                depthTest: false,
                colorWrite: true,
                side: THREE.DoubleSide,
                wireframe: false,
            };
        case 'wireframe':
            return {
                ...baseline,
                transparent: false,
                opacity: 1,
                depthWrite: false,
                depthTest: false,
                colorWrite: false,
                side: THREE.DoubleSide,
                wireframe: false,
            };
        case 'shaded':
            return baseline;
    }
}

function applyRenderState(
    material: PreviewMaterial,
    next: PreviewMaterialBaseline
): boolean {
    const changed =
        material.transparent !== next.transparent ||
        material.opacity !== next.opacity ||
        material.depthWrite !== next.depthWrite ||
        material.depthTest !== next.depthTest ||
        material.colorWrite !== next.colorWrite ||
        material.side !== next.side ||
        material.wireframe !== next.wireframe;

    if (!changed) return false;

    material.transparent = next.transparent;
    material.opacity = next.opacity;
    material.depthWrite = next.depthWrite;
    material.depthTest = next.depthTest;
    material.colorWrite = next.colorWrite;
    material.side = next.side;
    material.wireframe = next.wireframe;
    material.needsUpdate = true;
    return true;
}

function applyMeshRenderOrder(
    mesh: THREE.Mesh,
    mode: PreviewRenderMode,
    baselines: PreviewMaterialBaselines,
    inspectionOrder: number
): boolean {
    let baseline = baselines.meshes.get(mesh);
    if (!baseline) {
        baseline = { renderOrder: mesh.renderOrder };
        baselines.meshes.set(mesh, baseline);
    }

    const nextRenderOrder = mode === 'shaded' ? baseline.renderOrder : 1000 + inspectionOrder;
    if (mesh.renderOrder === nextRenderOrder) return false;

    mesh.renderOrder = nextRenderOrder;
    return true;
}

export function createPreviewMaterialBaselines(): PreviewMaterialBaselines {
    return {
        materials: new WeakMap(),
        meshes: new WeakMap(),
    };
}

/**
 * Applies an inspection-only rendering style to preview materials. Geometry,
 * visibility, colors, and export metadata are deliberately left untouched.
 */
export function applyPreviewRenderMode(
    root: THREE.Object3D,
    mode: PreviewRenderMode,
    baselines: PreviewMaterialBaselines
): boolean {
    let changed = false;
    const meshes: Array<{ mesh: THREE.Mesh; baseZ: number; traversalIndex: number }> = [];

    root.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;

        const mesh = child as THREE.Mesh;
        meshes.push({
            mesh,
            baseZ: Number(mesh.userData.baseZ),
            traversalIndex: meshes.length,
        });
    });

    meshes.sort((left, right) => {
        const leftHasBaseZ = Number.isFinite(left.baseZ);
        const rightHasBaseZ = Number.isFinite(right.baseZ);
        if (leftHasBaseZ && rightHasBaseZ && left.baseZ !== right.baseZ) {
            return left.baseZ - right.baseZ;
        }
        if (leftHasBaseZ !== rightHasBaseZ) return leftHasBaseZ ? -1 : 1;
        return left.traversalIndex - right.traversalIndex;
    });

    for (let inspectionOrder = 0; inspectionOrder < meshes.length; inspectionOrder++) {
        const { mesh } = meshes[inspectionOrder];
        changed = applyMeshRenderOrder(mesh, mode, baselines, inspectionOrder) || changed;

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
            if (!isPreviewMaterial(material)) continue;

            let baseline = baselines.materials.get(material);
            if (!baseline) {
                baseline = readBaseline(material);
                baselines.materials.set(material, baseline);
            }

            changed =
                applyRenderState(material, renderStateForMode(mode, baseline)) || changed;
        }
    }

    return changed;
}
