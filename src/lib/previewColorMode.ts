import * as THREE from 'three';
import type { PreviewColorMode } from '../types';

type ColorMaterial = THREE.Material & { color: THREE.Color };

function isColorMaterial(material: THREE.Material): material is ColorMaterial {
    return 'color' in material && (material as ColorMaterial).color instanceof THREE.Color;
}

/**
 * Auto-paint layer meshes are tagged at build time with both the color they
 * were built with (simulated, blended appearance) and the physical filament
 * color actually stacked at that layer. This swaps each mesh's material color
 * between the two without touching geometry, so switching modes is instant and
 * never triggers a rebuild. Meshes without both tags (manual mode, and Flat
 * Paint's transparent carrier layer) keep their built-in color regardless of
 * mode. Uses dedicated `kromacutPreview*` keys, distinct from the
 * `kromacutFilamentHex`/`kromacutExportGroup` keys export3mf.ts reads, so this
 * preview-only toggle can never influence STL/3MF export content.
 */
export function applyPreviewColorMode(root: THREE.Object3D, mode: PreviewColorMode): boolean {
    let changed = false;

    root.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        const virtualHex = mesh.userData.kromacutPreviewVirtualHex;
        const filamentHex = mesh.userData.kromacutPreviewFilamentHex;
        if (typeof virtualHex !== 'string' || typeof filamentHex !== 'string') return;

        const targetHex = mode === 'physical' ? filamentHex : virtualHex;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
            if (!isColorMaterial(material)) continue;
            const target = new THREE.Color(targetHex);
            if (material.color.equals(target)) continue;
            material.color.copy(target);
            changed = true;
        }
    });

    return changed;
}
