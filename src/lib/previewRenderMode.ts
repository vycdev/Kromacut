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

type ColorMaterial = THREE.Material & { color: THREE.Color };
type MeshMaterial = THREE.Material | THREE.Material[];

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
    material: MeshMaterial;
    colorAccurateMaterial?: MeshMaterial;
}

export interface PreviewMaterialBaselines {
    materials: WeakMap<THREE.Material, PreviewMaterialBaseline>;
    meshes: WeakMap<THREE.Mesh, PreviewMeshBaseline>;
}

function isPreviewMaterial(
    material: THREE.Material | null | undefined
): material is PreviewMaterial {
    return !!material && 'wireframe' in material && 'colorWrite' in material;
}

function isColorMaterial(material: THREE.Material | null | undefined): material is ColorMaterial {
    return (
        !!material &&
        'color' in material &&
        (material as ColorMaterial).color instanceof THREE.Color
    );
}

function createColorAccurateMaterial(material: THREE.Material): THREE.Material {
    if (!isColorMaterial(material)) return material;

    const source = material as ColorMaterial & {
        map?: THREE.Texture | null;
        vertexColors?: boolean;
    };
    const accurate = new THREE.MeshBasicMaterial({
        color: source.color,
        map: source.map ?? null,
        vertexColors: source.vertexColors ?? false,
        transparent: material.transparent,
        opacity: material.opacity,
        depthWrite: material.depthWrite,
        depthTest: material.depthTest,
        colorWrite: material.colorWrite,
        side: material.side,
        alphaTest: material.alphaTest,
        blending: material.blending,
        blendSrc: material.blendSrc,
        blendDst: material.blendDst,
        blendEquation: material.blendEquation,
        premultipliedAlpha: material.premultipliedAlpha,
        dithering: material.dithering,
        toneMapped: false,
    });
    accurate.name = material.name;
    accurate.visible = material.visible;
    accurate.userData = { ...material.userData, kromacutColorAccurate: true };
    return accurate;
}

function mapMeshMaterial(
    material: MeshMaterial,
    transform: (entry: THREE.Material) => THREE.Material
): MeshMaterial {
    return Array.isArray(material) ? material.map(transform) : transform(material);
}

function materialsMatch(left: MeshMaterial, right: MeshMaterial): boolean {
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    if (!Array.isArray(left) || !Array.isArray(right)) return left === right;
    return (
        left.length === right.length && left.every((material, index) => material === right[index])
    );
}

function syncMaterialColors(source: MeshMaterial, target: MeshMaterial): boolean {
    const sourceMaterials = Array.isArray(source) ? source : [source];
    const targetMaterials = Array.isArray(target) ? target : [target];
    let changed = false;

    for (let index = 0; index < Math.min(sourceMaterials.length, targetMaterials.length); index++) {
        const sourceMaterial = sourceMaterials[index];
        const targetMaterial = targetMaterials[index];
        if (!isColorMaterial(sourceMaterial) || !isColorMaterial(targetMaterial)) continue;
        if (targetMaterial.color.equals(sourceMaterial.color)) continue;
        targetMaterial.color.copy(sourceMaterial.color);
        changed = true;
    }

    return changed;
}

function applyColorAccurateMeshMaterial(
    mesh: THREE.Mesh,
    baseline: PreviewMeshBaseline,
    enabled: boolean
): boolean {
    if (enabled) {
        baseline.colorAccurateMaterial ??= mapMeshMaterial(
            baseline.material,
            createColorAccurateMaterial
        );

        if (materialsMatch(mesh.material, baseline.colorAccurateMaterial)) return false;
        syncMaterialColors(baseline.material, baseline.colorAccurateMaterial);
        mesh.material = baseline.colorAccurateMaterial;
        return true;
    }

    if (
        !baseline.colorAccurateMaterial ||
        !materialsMatch(mesh.material, baseline.colorAccurateMaterial)
    ) {
        return false;
    }

    syncMaterialColors(baseline.colorAccurateMaterial, baseline.material);
    mesh.material = baseline.material;
    return true;
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
        case 'color-accurate':
        case 'shaded':
            return baseline;
    }
}

function applyRenderState(material: PreviewMaterial, next: PreviewMaterialBaseline): boolean {
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
        baseline = { renderOrder: mesh.renderOrder, material: mesh.material };
        baselines.meshes.set(mesh, baseline);
    }

    const nextRenderOrder =
        mode === 'transparent' || mode === 'wireframe'
            ? 1000 + inspectionOrder
            : baseline.renderOrder;
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
        let meshBaseline = baselines.meshes.get(mesh);
        if (!meshBaseline) {
            meshBaseline = { renderOrder: mesh.renderOrder, material: mesh.material };
            baselines.meshes.set(mesh, meshBaseline);
        }

        // Inspection modes mutate the original material. Restore its captured
        // state before the first accurate clone takes its own baseline.
        if (mode === 'color-accurate' && !meshBaseline.colorAccurateMaterial) {
            const originals = Array.isArray(meshBaseline.material)
                ? meshBaseline.material
                : [meshBaseline.material];
            for (const material of originals) {
                if (!isPreviewMaterial(material)) continue;
                const baseline = baselines.materials.get(material);
                if (baseline) changed = applyRenderState(material, baseline) || changed;
            }
        }

        changed =
            applyColorAccurateMeshMaterial(mesh, meshBaseline, mode === 'color-accurate') ||
            changed;
        changed = applyMeshRenderOrder(mesh, mode, baselines, inspectionOrder) || changed;

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
            if (!isPreviewMaterial(material)) continue;

            let baseline = baselines.materials.get(material);
            if (!baseline) {
                baseline = readBaseline(material);
                baselines.materials.set(material, baseline);
            }

            changed = applyRenderState(material, renderStateForMode(mode, baseline)) || changed;
        }
    }

    return changed;
}
