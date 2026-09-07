import * as THREE from 'three';

const FALLBACK_WIREFRAME_COLOR = 0xffffff;
const FEATURE_EDGE_THRESHOLD_DEGREES = 15;
const FEATURE_EDGE_THRESHOLD_DOT = Math.cos(
    THREE.MathUtils.DEG2RAD * FEATURE_EDGE_THRESHOLD_DEGREES
);
// Match THREE.EdgesGeometry so split face vertices share one logical edge.
const VERTEX_WELD_PRECISION = 10_000;
const DEFAULT_YIELD_INTERVAL_MS = 8;
const WIRE_SOURCE_MESH_KEY = 'kromacutPreviewSourceMesh';

export type PreviewWireframeStyle = 'overlay' | 'empty' | 'cancelled';

export interface PreviewWireframeBuildOptions {
    /** Stops stale work after a mode change, rebuild, or unmount. */
    isCurrent?: () => boolean;
    /** Gives the browser a frame between long feature-edge scans. */
    onYield?: () => Promise<void>;
    /** Lets the caller render completed layers progressively. */
    onLayerBuilt?: () => void;
    yieldIntervalMs?: number;
}

interface PendingEdge {
    index0: number;
    index1: number;
    normalX: number;
    normalY: number;
    normalZ: number;
}

interface OrderedMesh {
    mesh: THREE.Mesh;
    baseZ: number;
    traversalIndex: number;
}

type ColorMaterial = THREE.Material & { color: THREE.Color };

function isColorMaterial(material: THREE.Material): material is ColorMaterial {
    return 'color' in material && material.color instanceof THREE.Color;
}

function wireframeColorForMesh(mesh: THREE.Mesh): THREE.Color {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    return isColorMaterial(material)
        ? material.color.clone()
        : new THREE.Color(FALLBACK_WIREFRAME_COLOR);
}

function collectMeshes(modelGroup: THREE.Object3D): THREE.Mesh[] {
    const meshes: OrderedMesh[] = [];
    modelGroup.traverse((child) => {
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

    return meshes.map(({ mesh }) => mesh);
}

function appendSegment(
    vertices: number[],
    position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    index0: number,
    index1: number
): void {
    vertices.push(
        position.getX(index0),
        position.getY(index0),
        position.getZ(index0),
        position.getX(index1),
        position.getY(index1),
        position.getZ(index1)
    );
}

function isBuildCurrent(options: PreviewWireframeBuildOptions): boolean {
    return options.isCurrent?.() ?? true;
}

/**
 * Builds Three-style hard and boundary edges, yielding inside the scan so
 * large preview models remain interactive.
 */
async function createFeatureEdgeGeometry(
    geometry: THREE.BufferGeometry,
    options: PreviewWireframeBuildOptions
): Promise<THREE.BufferGeometry | 'cancelled' | null> {
    const position = geometry.getAttribute('position');
    if (!position || position.itemSize < 3) return null;

    const index = geometry.getIndex();
    const indexCount = index ? index.count : position.count;
    const edgeKeyStride = position.count + 1;
    const edgeData = new Map<number, PendingEdge>();
    const canonicalIdByPosition = new Map<string, number>();
    const canonicalVertexIds = new Int32Array(position.count);
    canonicalVertexIds.fill(-1);
    const vertices: number[] = [];
    const yieldIntervalMs = options.yieldIntervalMs ?? DEFAULT_YIELD_INTERVAL_MS;
    let lastYieldAt = performance.now();
    let nextCanonicalId = 0;

    const canonicalVertexId = (sourceIndex: number) => {
        const cachedId = canonicalVertexIds[sourceIndex];
        if (cachedId >= 0) return cachedId;

        const x = Math.round(position.getX(sourceIndex) * VERTEX_WELD_PRECISION);
        const y = Math.round(position.getY(sourceIndex) * VERTEX_WELD_PRECISION);
        const z = Math.round(position.getZ(sourceIndex) * VERTEX_WELD_PRECISION);
        const positionKey = `${x},${y},${z}`;
        const existingId = canonicalIdByPosition.get(positionKey);
        const canonicalId = existingId ?? nextCanonicalId++;
        if (existingId === undefined) canonicalIdByPosition.set(positionKey, canonicalId);
        canonicalVertexIds[sourceIndex] = canonicalId;
        return canonicalId;
    };

    const registerEdge = (
        edgeStart: number,
        edgeEnd: number,
        normalX: number,
        normalY: number,
        normalZ: number
    ) => {
        const canonicalStart = canonicalVertexId(edgeStart);
        const canonicalEnd = canonicalVertexId(edgeEnd);
        if (canonicalStart === canonicalEnd) return;

        const edgeKey = canonicalStart * edgeKeyStride + canonicalEnd;
        const reverseKey = canonicalEnd * edgeKeyStride + canonicalStart;
        const sibling = edgeData.get(reverseKey);

        if (sibling) {
            const normalDot =
                normalX * sibling.normalX +
                normalY * sibling.normalY +
                normalZ * sibling.normalZ;
            if (normalDot <= FEATURE_EDGE_THRESHOLD_DOT) {
                appendSegment(vertices, position, edgeStart, edgeEnd);
            }
            edgeData.delete(reverseKey);
        } else if (!edgeData.has(edgeKey)) {
            edgeData.set(edgeKey, {
                index0: edgeStart,
                index1: edgeEnd,
                normalX,
                normalY,
                normalZ,
            });
        }
    };

    const yieldIfNeeded = async () => {
        if (performance.now() - lastYieldAt < yieldIntervalMs) return true;
        await options.onYield?.();
        lastYieldAt = performance.now();
        return isBuildCurrent(options);
    };

    for (let triangleOffset = 0; triangleOffset + 2 < indexCount; triangleOffset += 3) {
        if (!isBuildCurrent(options)) return 'cancelled';

        const index0 = index ? index.getX(triangleOffset) : triangleOffset;
        const index1 = index ? index.getX(triangleOffset + 1) : triangleOffset + 1;
        const index2 = index ? index.getX(triangleOffset + 2) : triangleOffset + 2;
        const ax = position.getX(index0);
        const ay = position.getY(index0);
        const az = position.getZ(index0);
        const bx = position.getX(index1);
        const by = position.getY(index1);
        const bz = position.getZ(index1);
        const cx = position.getX(index2);
        const cy = position.getY(index2);
        const cz = position.getZ(index2);
        const abx = bx - ax;
        const aby = by - ay;
        const abz = bz - az;
        const acx = cx - ax;
        const acy = cy - ay;
        const acz = cz - az;
        let normalX = aby * acz - abz * acy;
        let normalY = abz * acx - abx * acz;
        let normalZ = abx * acy - aby * acx;
        const normalLength = Math.hypot(normalX, normalY, normalZ);

        if (normalLength > Number.EPSILON) {
            normalX /= normalLength;
            normalY /= normalLength;
            normalZ /= normalLength;
            registerEdge(index0, index1, normalX, normalY, normalZ);
            registerEdge(index1, index2, normalX, normalY, normalZ);
            registerEdge(index2, index0, normalX, normalY, normalZ);
        }

        if ((triangleOffset / 3 + 1) % 512 === 0 && !(await yieldIfNeeded())) {
            return 'cancelled';
        }
    }

    let pendingCount = 0;
    for (const edge of edgeData.values()) {
        appendSegment(vertices, position, edge.index0, edge.index1);

        pendingCount++;
        if (pendingCount % 512 === 0 && !(await yieldIfNeeded())) return 'cancelled';
    }

    if (!isBuildCurrent(options)) return 'cancelled';
    if (vertices.length === 0) return null;

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return edgeGeometry;
}

export function clearPreviewWireframeOverlay(overlay: THREE.Group): void {
    for (const child of overlay.children) {
        if (!(child as THREE.LineSegments).isLineSegments) continue;

        const lines = child as THREE.LineSegments;
        lines.geometry.dispose();
        const materials = Array.isArray(lines.material) ? lines.material : [lines.material];
        for (const material of materials) material.dispose();
    }
    overlay.clear();
}

function clearOwnedWireframeLines(
    overlay: THREE.Group,
    linesBuiltByThisRun: THREE.LineSegments[]
): void {
    for (const lines of linesBuiltByThisRun) {
        if (lines.parent !== overlay) continue;
        overlay.remove(lines);
        lines.geometry.dispose();
        const materials = Array.isArray(lines.material) ? lines.material : [lines.material];
        for (const material of materials) material.dispose();
    }
}

/**
 * Builds thin, unlit, per-layer feature edges in a scene-only overlay. The
 * source meshes retain their real layer colors and are never changed for export.
 */
export async function rebuildPreviewWireframeOverlay(
    modelGroup: THREE.Object3D,
    overlay: THREE.Group,
    options: PreviewWireframeBuildOptions = {}
): Promise<PreviewWireframeStyle> {
    clearPreviewWireframeOverlay(overlay);
    const meshes = collectMeshes(modelGroup);
    modelGroup.updateMatrixWorld(true);
    const linesBuiltByThisRun: THREE.LineSegments[] = [];
    let layerIndex = 0;

    for (const mesh of meshes) {
        if (!isBuildCurrent(options)) {
            clearOwnedWireframeLines(overlay, linesBuiltByThisRun);
            return 'cancelled';
        }

        const geometry = await createFeatureEdgeGeometry(mesh.geometry, options);
        if (geometry === 'cancelled' || !isBuildCurrent(options)) {
            if (geometry instanceof THREE.BufferGeometry) geometry.dispose();
            clearOwnedWireframeLines(overlay, linesBuiltByThisRun);
            return 'cancelled';
        }
        if (!geometry) continue;

        const material = new THREE.LineBasicMaterial({
            color: wireframeColorForMesh(mesh),
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false,
            linewidth: 1,
            toneMapped: false,
        });
        const lines = new THREE.LineSegments(geometry, material);
        lines.matrixAutoUpdate = false;
        lines.matrix.copy(mesh.matrixWorld);
        lines.matrixWorldNeedsUpdate = true;
        lines.visible = mesh.visible;
        lines.renderOrder = 2000 + layerIndex++;
        lines.userData[WIRE_SOURCE_MESH_KEY] = mesh;
        overlay.add(lines);
        linesBuiltByThisRun.push(lines);
        options.onLayerBuilt?.();
    }

    return layerIndex > 0 ? 'overlay' : 'empty';
}

export function syncPreviewWireframeOverlayVisibility(overlay: THREE.Group): void {
    for (const child of overlay.children) {
        const sourceMesh = child.userData[WIRE_SOURCE_MESH_KEY] as THREE.Mesh | undefined;
        if (sourceMesh?.isMesh) child.visible = sourceMesh.visible;
    }
}
