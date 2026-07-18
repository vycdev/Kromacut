import * as THREE from 'three';

import type { FinalPrintableStackSnapshot } from '../types/appearance';
import { CALIBRATION_CORNER_SEGMENTS, roundedRectOutline } from './calibrationGeometry';
import type { PaletteProofCell, PaletteProofSpec } from './paletteProof';
import { validatePaletteProofSpec } from './paletteProof';

export interface PaletteProofCellBounds {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

export interface PaletteProofGeometryResult {
    object: THREE.Group;
    usedLayerCount: number;
    reinforcementLayerCount: number;
    activeCellIdsByLayer: readonly (readonly string[])[];
}

interface IndexedMeshData {
    positions: number[];
    indices: number[];
}

type Point2 = readonly [number, number];

function appendPolygonPrism(
    target: IndexedMeshData,
    inputContour: readonly Point2[],
    z0: number,
    z1: number,
    inputHoles: readonly (readonly Point2[])[] = []
): void {
    if (inputContour.length < 3 || z1 <= z0) return;

    const outerVectors = inputContour.map(([x, y]) => new THREE.Vector2(x, y));
    const contour = THREE.ShapeUtils.isClockWise(outerVectors)
        ? [...inputContour].reverse()
        : [...inputContour];
    const holes = inputHoles.map((inputHole) => {
        const vectors = inputHole.map(([x, y]) => new THREE.Vector2(x, y));
        return THREE.ShapeUtils.isClockWise(vectors) ? [...inputHole] : [...inputHole].reverse();
    });
    const rings = [contour, ...holes];
    const flattened = rings.flat();
    const triangles = THREE.ShapeUtils.triangulateShape(
        contour.map(([x, y]) => new THREE.Vector2(x, y)),
        holes.map((hole) => hole.map(([x, y]) => new THREE.Vector2(x, y)))
    );
    const vertexOffset = target.positions.length / 3;

    for (const [x, y] of flattened) target.positions.push(x, y, z0);
    for (const [x, y] of flattened) target.positions.push(x, y, z1);

    const topOffset = vertexOffset + flattened.length;
    for (const triangle of triangles) {
        const a = triangle[0];
        let b = triangle[1];
        let c = triangle[2];
        const [ax, ay] = flattened[a];
        const [bx, by] = flattened[b];
        const [cx, cy] = flattened[c];
        if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0) {
            [b, c] = [c, b];
        }

        target.indices.push(topOffset + a, topOffset + b, topOffset + c);
        target.indices.push(vertexOffset + a, vertexOffset + c, vertexOffset + b);
    }

    let ringOffset = 0;
    for (const ring of rings) {
        for (let index = 0; index < ring.length; index++) {
            const next = (index + 1) % ring.length;
            const bottomA = vertexOffset + ringOffset + index;
            const bottomB = vertexOffset + ringOffset + next;
            const topA = topOffset + ringOffset + index;
            const topB = topOffset + ringOffset + next;
            target.indices.push(bottomA, bottomB, topB, bottomA, topB, topA);
        }
        ringOffset += ring.length;
    }
}

function appendRoundedBox(
    target: IndexedMeshData,
    bounds: PaletteProofCellBounds,
    z0: number,
    z1: number,
    radius: number
) {
    const resolvedRadius = Math.min(
        radius,
        (bounds.x1 - bounds.x0) / 2 - 0.01,
        (bounds.y1 - bounds.y0) / 2 - 0.01
    );
    appendPolygonPrism(
        target,
        roundedRectOutline(
            bounds.x0,
            bounds.y0,
            bounds.x1,
            bounds.y1,
            resolvedRadius,
            CALIBRATION_CORNER_SEGMENTS,
            { bl: true, br: true, tr: true, tl: true }
        ),
        z0,
        z1
    );
}

function createBufferGeometry(data: IndexedMeshData): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

export function paletteProofCellBounds(
    spec: PaletteProofSpec,
    row: number,
    column: number
): PaletteProofCellBounds {
    if (
        row < 0 ||
        row >= spec.layout.rowCount ||
        column < 0 ||
        column >= spec.layout.columnCount
    ) {
        throw new Error(`Palette Proof cell ${row},${column} is outside the matrix`);
    }

    const pitch = spec.layout.patchSizeMm + spec.layout.gapMm;
    const left = -spec.layout.widthMm / 2 + spec.layout.marginMm;
    const bottom = -spec.layout.heightMm / 2 + spec.layout.marginMm;
    const targetRows = spec.layout.matrixOrientation === 'target-rows';
    const x0 = left + (targetRows ? row : column) * pitch;
    const y0 =
        bottom +
        (targetRows
            ? spec.layout.columnCount - 1 - column
            : spec.layout.rowCount - 1 - row) *
            pitch;
    return {
        x0,
        y0,
        x1: x0 + spec.layout.patchSizeMm,
        y1: y0 + spec.layout.patchSizeMm,
    };
}

function foundationContour(spec: PaletteProofSpec): Point2[] {
    const x0 = -spec.layout.widthMm / 2;
    const y0 = -spec.layout.heightMm / 2;
    const x1 = spec.layout.widthMm / 2;
    const y1 = spec.layout.heightMm / 2;
    const notch = spec.layout.notchSizeMm;
    const radius = spec.layout.cornerRadiusMm;
    const contour = roundedRectOutline(
        x0,
        y0,
        x1,
        y1,
        radius,
        CALIBRATION_CORNER_SEGMENTS,
        { bl: true, br: true, tr: true, tl: false }
    );
    const sharpTopLeft = contour.findIndex(([x, y]) => x === x0 && y === y1);
    if (sharpTopLeft < 0) throw new Error('Could not place Palette Proof orientation notch');
    contour.splice(
        sharpTopLeft,
        1,
        [x0 + notch, y1],
        [x0 + notch, y1 - notch],
        [x0, y1 - notch]
    );
    return contour;
}

function reinforcementHoles(spec: PaletteProofSpec): Point2[][] {
    const clearance = spec.layout.reinforcementClearanceMm ?? 0;
    const holes: Point2[][] = [];
    for (let row = 0; row < spec.layout.rowCount; row++) {
        for (let column = 0; column < spec.layout.columnCount; column++) {
            const bounds = paletteProofCellBounds(spec, row, column);
            holes.push(
                roundedRectOutline(
                    bounds.x0 - clearance,
                    bounds.y0 - clearance,
                    bounds.x1 + clearance,
                    bounds.y1 + clearance,
                    spec.layout.cornerRadiusMm + clearance,
                    CALIBRATION_CORNER_SEGMENTS,
                    { bl: true, br: true, tr: true, tl: true }
                )
            );
        }
    }
    return holes;
}

function createLayerMesh(
    snapshot: FinalPrintableStackSnapshot,
    layerIndex: number,
    data: IndexedMeshData,
    activeCells: readonly PaletteProofCell[]
): THREE.Mesh {
    const layer = snapshot.layers[layerIndex];
    const material = new THREE.MeshStandardMaterial({ color: layer.filamentColor });
    const mesh = new THREE.Mesh(createBufferGeometry(data), material);
    mesh.name = `Palette Proof Layer ${layerIndex + 1}`;
    mesh.userData.kromacutExportGroup = `palette-proof-layer-${layerIndex + 1}`;
    mesh.userData.kromacutFilamentHex = layer.filamentColor;
    mesh.userData.kromacutMaterialKey = `filament:${layer.filamentId}`;
    mesh.userData.kromacutPartName = mesh.name;
    mesh.userData.paletteProofLayerIndex = layerIndex;
    mesh.userData.paletteProofCellIds = activeCells.map((cell) => cell.id);
    return mesh;
}

export function buildPaletteProofGeometry(
    snapshot: FinalPrintableStackSnapshot,
    spec: PaletteProofSpec
): PaletteProofGeometryResult {
    const validationErrors = validatePaletteProofSpec(snapshot, spec);
    if (validationErrors.length > 0) {
        throw new Error(`Invalid Palette Proof specification: ${validationErrors.join('; ')}`);
    }
    if (!spec.comparisonEnabled || spec.cells.length === 0) {
        throw new Error('Palette Proof requires at least two printable stack prefixes');
    }

    const maxPrefixIndex = Math.max(...spec.cells.map((cell) => cell.prefixIndex));
    if (maxPrefixIndex >= snapshot.layers.length) {
        throw new Error('Palette Proof references a layer outside the final stack');
    }

    const object = new THREE.Group();
    object.name = `Palette Proof ${spec.id}`;
    object.userData.paletteProofId = spec.id;
    object.userData.paletteProofSnapshotFingerprint = snapshot.fingerprint;
    const activeCellIdsByLayer: string[][] = [];
    const reinforcementLayerCount = spec.layout.reinforcementLayers ?? 0;

    for (let layerIndex = 0; layerIndex <= maxPrefixIndex; layerIndex++) {
        const layer = snapshot.layers[layerIndex];
        const data: IndexedMeshData = { positions: [], indices: [] };
        const activeCells =
            layerIndex === 0
                ? []
                : spec.cells.filter((cell) => cell.prefixIndex >= layerIndex);

        if (layerIndex === 0) {
            appendPolygonPrism(data, foundationContour(spec), layer.startHeight, layer.endHeight);
        } else {
            if (layerIndex <= reinforcementLayerCount) {
                appendPolygonPrism(
                    data,
                    foundationContour(spec),
                    layer.startHeight,
                    layer.endHeight,
                    reinforcementHoles(spec)
                );
            }
            for (const cell of activeCells) {
                appendRoundedBox(
                    data,
                    paletteProofCellBounds(spec, cell.row, cell.column),
                    layer.startHeight,
                    layer.endHeight,
                    spec.layout.cornerRadiusMm
                );
            }
        }

        if (data.indices.length === 0) {
            throw new Error(`Palette Proof layer ${layerIndex + 1} has no printable geometry`);
        }
        object.add(createLayerMesh(snapshot, layerIndex, data, activeCells));
        activeCellIdsByLayer.push(activeCells.map((cell) => cell.id));
    }

    return {
        object,
        usedLayerCount: maxPrefixIndex + 1,
        reinforcementLayerCount,
        activeCellIdsByLayer,
    };
}

export function disposePaletteProofGeometry(object: THREE.Object3D): void {
    object.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material.dispose();
    });
}
