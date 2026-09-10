import JSZip from 'jszip';
import type { StackMatrixCalibrationV1 } from './appearanceProfile';
import { normalizeHexColor } from './colorUtils';
import { MINIMAL_PROJECT_SETTINGS, KROMACUT_CONFIG } from './slicerDefaults';
import { stackMatrixPhysicalSize } from './stackMatrixCalibration';
import { escapeXmlAttribute } from './xml';

interface Mesh {
    vertices: number[];
    triangles: number[];
}

interface MeshPart {
    filamentIndex: number;
    mesh: Mesh;
    name: string;
}

const RECIPE_MESH_GROUP_COUNT = 8;

function emptyMesh(): Mesh {
    return { vertices: [], triangles: [] };
}

function appendBox(
    mesh: Mesh,
    x0: number,
    y0: number,
    z0: number,
    w: number,
    d: number,
    h: number
) {
    const base = mesh.vertices.length / 3;
    const x1 = x0 + w;
    const y1 = y0 + d;
    const z1 = z0 + h;
    mesh.vertices.push(
        x0,
        y0,
        z0,
        x1,
        y0,
        z0,
        x1,
        y1,
        z0,
        x0,
        y1,
        z0,
        x0,
        y0,
        z1,
        x1,
        y0,
        z1,
        x1,
        y1,
        z1,
        x0,
        y1,
        z1
    );
    const faces = [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3,
        0, 4, 3, 4, 7,
    ];
    for (const index of faces) mesh.triangles.push(base + index);
}

function materialColor(hex: string): string {
    return `${normalizeHexColor(hex, '#808080').toUpperCase()}FF`;
}

function uuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = (Math.random() * 16) | 0;
        return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    });
}

function meshXml(mesh: Mesh): string {
    const vertices: string[] = ['<vertices>'];
    for (let index = 0; index < mesh.vertices.length; index += 3) {
        vertices.push(
            `<vertex x="${mesh.vertices[index].toFixed(6)}" y="${mesh.vertices[index + 1].toFixed(6)}" z="${mesh.vertices[index + 2].toFixed(6)}"/>`
        );
    }
    vertices.push('</vertices>');
    const triangles: string[] = ['<triangles>'];
    for (let index = 0; index < mesh.triangles.length; index += 3) {
        triangles.push(
            `<triangle v1="${mesh.triangles[index]}" v2="${mesh.triangles[index + 1]}" v3="${mesh.triangles[index + 2]}"/>`
        );
    }
    triangles.push('</triangles>');
    return `<mesh>${vertices.join('')}${triangles.join('')}</mesh>`;
}

function cellOrigin(
    record: StackMatrixCalibrationV1,
    row: number,
    column: number
): { x: number; y: number } {
    const pitch = record.grid.patchSize + record.grid.gap;
    const size = stackMatrixPhysicalSize(record);
    const physicalRow = record.grid.rows + 1 - row;
    return {
        x: column * pitch - size.width / 2,
        y: physicalRow * pitch - size.height / 2,
    };
}

function appendRecipe(
    meshes: Mesh[][],
    record: StackMatrixCalibrationV1,
    stack: readonly number[],
    row: number,
    column: number,
    foundationHeight: number
) {
    const { x, y } = cellOrigin(record, row, column);
    stack.forEach((filamentIndex, layerIndex) => {
        // Cubes in one parity group are separated by at least one complete voxel in
        // x, y, or z. This keeps every mesh object closed and manifold while the
        // parent assembly can still group all pieces by their physical material.
        const group = ((column & 1) << 2) | ((row & 1) << 1) | (layerIndex & 1);
        appendBox(
            meshes[filamentIndex][group],
            x,
            y,
            foundationHeight + layerIndex * record.process.layerHeight,
            record.grid.patchSize,
            record.grid.patchSize,
            record.process.layerHeight
        );
    });
}

export async function generateStackMatrix3mf(record: StackMatrixCalibrationV1): Promise<Blob> {
    const recipeMeshes = record.filaments.map(() =>
        Array.from({ length: RECIPE_MESH_GROUP_COUNT }, emptyMesh)
    );
    const foundationMesh = emptyMesh();
    const size = stackMatrixPhysicalSize(record);
    const foundationHeight = record.foundationLayerThicknesses.reduce(
        (sum, thickness) => sum + thickness,
        0
    );
    appendBox(
        foundationMesh,
        -size.width / 2,
        -size.height / 2,
        0,
        size.width,
        size.height,
        foundationHeight
    );

    for (const sample of record.samples) {
        appendRecipe(
            recipeMeshes,
            record,
            sample.stack,
            sample.row + 1,
            sample.column + 1,
            foundationHeight
        );
    }
    const markerPositions = [
        [0, 0],
        [0, record.grid.columns + 1],
        [record.grid.rows + 1, record.grid.columns + 1],
        [record.grid.rows + 1, 0],
    ] as const;
    record.cornerStacks.forEach((stack, index) => {
        const [row, column] = markerPositions[index];
        appendRecipe(recipeMeshes, record, stack, row, column, foundationHeight);
    });

    const meshParts: MeshPart[] = [
        {
            filamentIndex: record.backingFilamentIndex,
            mesh: foundationMesh,
            name: `${record.filaments[record.backingFilamentIndex].name} foundation`,
        },
    ];
    recipeMeshes.forEach((groups, filamentIndex) => {
        groups.forEach((mesh, group) => {
            if (mesh.triangles.length === 0) return;
            meshParts.push({
                filamentIndex,
                mesh,
                name: `${record.filaments[filamentIndex].name} matrix group ${group + 1}`,
            });
        });
    });

    const materialId = 1;
    let nextObjectId = 2;
    const partObjectIds: number[] = [];
    const objects: string[] = [];
    const partSettings: string[] = [];
    meshParts.forEach((part) => {
        const objectId = nextObjectId++;
        partObjectIds.push(objectId);
        objects.push(
            `<object id="${objectId}" p:UUID="${uuid()}" type="model" pid="${materialId}" pindex="${part.filamentIndex}" name="${escapeXmlAttribute(part.name)}">${meshXml(part.mesh)}</object>`
        );
        partSettings.push(
            `  <part id="${objectId}" subtype="normal_part">\n` +
                `   <metadata key="name" value="${escapeXmlAttribute(part.name)}"/>\n` +
                `   <metadata key="extruder" value="${part.filamentIndex + 1}"/>\n` +
                `  </part>\n`
        );
    });
    const parentId = nextObjectId++;
    objects.push(
        `<object id="${parentId}" p:UUID="${uuid()}" type="model" name="Kromacut Stack Matrix"><components>` +
            partObjectIds
                .map((objectId) => `<component objectid="${objectId}" p:UUID="${uuid()}"/>`)
                .join('') +
            `</components></object>`
    );
    const materials = record.filaments
        .map(
            (filament) =>
                `<base name="${escapeXmlAttribute(filament.name)}" displaycolor="${materialColor(filament.color)}"/>`
        )
        .join('');
    const model =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">` +
        `<metadata name="BambuStudio:3mfVersion">1</metadata>` +
        `<resources><basematerials id="${materialId}">${materials}</basematerials>${objects.join('')}</resources>` +
        `<build p:UUID="${uuid()}"><item objectid="${parentId}" p:UUID="${uuid()}"/></build>` +
        `</model>`;
    const modelSettings =
        `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n` +
        ` <object id="${parentId}">\n` +
        `  <metadata key="name" value="Kromacut Stack Matrix"/>\n` +
        partSettings.join('') +
        ` </object>\n` +
        ` <plate>\n` +
        `  <metadata key="plater_id" value="1"/>\n` +
        `  <metadata key="locked" value="false"/>\n` +
        `  <model_instance><metadata key="object_id" value="${parentId}"/><metadata key="instance_id" value="0"/></model_instance>\n` +
        ` </plate>\n` +
        `</config>`;
    const filamentCount = record.filaments.length;
    const expand = <T>(value: T): T[] => Array(filamentCount).fill(value);
    const projectSettings = {
        ...MINIMAL_PROJECT_SETTINGS,
        layer_height: String(record.process.layerHeight),
        initial_layer_print_height: String(record.process.firstLayerHeight),
        filament_colour: record.filaments.map((filament) => filament.color),
        filament_type: expand('PLA'),
        filament_settings_id: expand('Generic PLA @Kromacut 0.4 nozzle'),
        filament_vendor: expand('Generic'),
    };

    const zip = new JSZip();
    zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
            `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
            `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
            `<Default Extension="config" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
            `<Default Extension="json" ContentType="application/json"/>` +
            `</Types>`
    );
    zip.file(
        '_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>` +
            `<Relationship Target="/Metadata/model_settings.config" Id="rel1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>` +
            `</Relationships>`
    );
    zip.file('3D/3dmodel.model', model);
    zip.file('Metadata/model_settings.config', modelSettings);
    zip.file('Metadata/project_settings.config', JSON.stringify(projectSettings, null, 4));
    zip.file('Metadata/kromacut-stack-matrix.json', JSON.stringify(record, null, 2));
    zip.file('Metadata/kromacut.config', KROMACUT_CONFIG);
    return zip.generateAsync({ type: 'blob', mimeType: 'model/3mf' });
}
