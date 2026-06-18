import JSZip from 'jszip';
import * as THREE from 'three';
import { MINIMAL_PROJECT_SETTINGS, KROMACUT_CONFIG } from './slicerDefaults';
import { clampProgress, exportMeshProgress, exportZipProgress, progressInSpan } from './progress';
import { normalizeHexColor } from './colorUtils';

export interface Export3MFOptions {
    layerHeight?: number;
    firstLayerHeight?: number;
    layerFilamentColors?: string[]; // Optional per-layer filament colors (hex) for export
    onProgress?: (progress: number) => void;
    onZipProgress?: (progress: { percent: number; currentFile?: string | null }) => void;
}

type TriangleIndexChunk = {
    data: Uint32Array;
    length: number;
};

type ExportGeometrySource = {
    positions: ArrayLike<number>;
    indices?: ArrayLike<number>;
    itemSize?: number;
};

/**
 * Meshes tagged with the same `userData.kromacutExportGroup` key are merged
 * into a single 3MF object (used by Flat Paint to export one object per
 * physical filament). Untagged meshes keep the one-object-per-mesh behavior.
 */
interface ExportMeshGroup {
    meshes: THREE.Mesh[];
    overrideHex?: string;
    materialKey?: string;
    partName?: string;
}

function getKromacutExportGeometry(geometry: THREE.BufferGeometry): ExportGeometrySource | null {
    const source = geometry.userData?.kromacutExportGeometry as ExportGeometrySource | undefined;
    if (!source?.positions || !source.indices) return null;
    return {
        positions: source.positions,
        indices: source.indices,
        itemSize: source.itemSize ?? 3,
    };
}

function readMeshUserDataString(mesh: THREE.Mesh, key: string): string | undefined {
    const value = (mesh.userData as Record<string, unknown> | undefined)?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0,
            v = c == 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export async function exportObjectTo3MFBlob(
    root: THREE.Object3D,
    options?: Export3MFOptions
): Promise<Blob> {
    const zip = new JSZip();

    // [Content_Types].xml
    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Default Extension="config" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;
    zip.file('[Content_Types].xml', contentTypes);

    // _rels/.rels
    const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
 <Relationship Target="/Metadata/model_settings.config" Id="rel1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
    zip.folder('_rels')?.file('.rels', rels);

    // Collect generated meshes. Preview range controls may hide layers in the scene,
    // but exports must still include every generated physical layer.
    const meshes: THREE.Mesh[] = [];
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            if (m.geometry) {
                meshes.push(m);
            }
        }
    });

    if (meshes.length === 0) throw new Error('No meshes to export');

    // Group meshes into exported objects (see ExportMeshGroup).
    const groups: ExportMeshGroup[] = [];
    const groupByKey = new Map<string, ExportMeshGroup>();

    meshes.forEach((mesh, meshIndex) => {
        const groupKey = readMeshUserDataString(mesh, 'kromacutExportGroup');
        const meshHex = readMeshUserDataString(mesh, 'kromacutFilamentHex');
        const materialKey = readMeshUserDataString(mesh, 'kromacutMaterialKey');
        const meshName = readMeshUserDataString(mesh, 'kromacutPartName');

        if (groupKey) {
            if (!meshHex) {
                throw new Error(`Export group "${groupKey}" is missing kromacutFilamentHex`);
            }
            let group = groupByKey.get(groupKey);
            if (!group) {
                group = {
                    meshes: [],
                    overrideHex: meshHex,
                    materialKey: materialKey ?? groupKey,
                    partName: meshName,
                };
                groupByKey.set(groupKey, group);
                groups.push(group);
            }
            group.meshes.push(mesh);
            if (meshHex !== group.overrideHex) {
                throw new Error(`Export group "${groupKey}" contains multiple filament colors`);
            }
            group.materialKey ??= materialKey ?? groupKey;
            group.partName ??= meshName;
        } else {
            // Untagged meshes keep positional filament color mapping by mesh index.
            groups.push({
                meshes: [mesh],
                overrideHex: meshHex ?? options?.layerFilamentColors?.[meshIndex],
                partName: meshName,
            });
        }
    });

    // Collect materials (colors)
    // We map hex string -> index in basematerials
    const colorMap = new Map<string, number>();
    const colors: string[] = [];

    const normalizeHex = (hex?: string): string | null => {
        const normalized = normalizeHexColor(hex, '');
        return normalized ? normalized.slice(1) : null;
    };

    const getMaterialIndex = (
        material: THREE.Material | THREE.Material[],
        overrideHex?: string,
        materialKey?: string
    ): number => {
        const mat = Array.isArray(material) ? material[0] : material;
        let hex = normalizeHex(overrideHex) || 'FFFFFF';
        if (!overrideHex && 'color' in mat && (mat as THREE.MeshStandardMaterial).color) {
            hex = (mat as THREE.MeshStandardMaterial).color.getHexString().toUpperCase();
        }
        const mapKey = materialKey ? `${materialKey}:${hex}` : hex;
        if (!colorMap.has(mapKey)) {
            colorMap.set(mapKey, colors.length);
            colors.push(hex);
        }
        return colorMap.get(mapKey)!;
    };

    // Pre-calculate all materials so we can write the header correctly
    for (const group of groups) {
        getMaterialIndex(group.meshes[0].material, group.overrideHex, group.materialKey);
    }

    // Prepare Project Settings (Minimal)
    const projectSettings = { ...MINIMAL_PROJECT_SETTINGS };

    // Apply user options
    if (options?.layerHeight) {
        projectSettings.layer_height = options.layerHeight.toString();
    }
    if (options?.firstLayerHeight) {
        projectSettings.initial_layer_print_height = options.firstLayerHeight.toString();
    }

    // Apply Colors/Filaments
    // Ensure we have at least one color if none found (fallback to white)
    const exportColors = colors.length > 0 ? colors : ['FFFFFF'];

    // Helper to expand arrays to match color count
    const expand = (val: string, count: number) => Array(count).fill(val);

    projectSettings.filament_colour = exportColors.map((c) => '#' + c);

    projectSettings.filament_type = expand('PLA', exportColors.length);

    projectSettings.filament_settings_id = expand(
        'Generic PLA @Kromacut 0.4 nozzle',
        exportColors.length
    );

    projectSettings.filament_vendor = expand('Generic', exportColors.length);

    // Build object resources using a chunked writer to avoid OOM with massive arrays
    const xmlParts: string[] = [];
    let currentChunkParts: string[] = [];
    let currentChunkLength = 0;
    const XML_CHUNK_SIZE = 8 * 1024 * 1024;

    const flushXmlChunk = () => {
        if (currentChunkLength === 0) return;
        xmlParts.push(currentChunkParts.join(''));
        currentChunkParts = [];
        currentChunkLength = 0;
    };

    const write = (str: string) => {
        currentChunkParts.push(str);
        currentChunkLength += str.length;
        if (currentChunkLength >= XML_CHUNK_SIZE) {
            flushXmlChunk();
        }
    };

    // IDs: 1 = BaseMaterials, 2..N = Objects
    const baseMatId = 1;
    let nextId = 2;

    const COORD_SCALE = 100000;
    const toCoordUnits = (n: number) => Math.round(n * COORD_SCALE);
    const formatCoord = (units: number) => (units / COORD_SCALE).toString();

    // Vector helper
    const v = new THREE.Vector3();

    // Store IDs of generated mesh objects to group them later
    const componentIds: number[] = [];
    // Store metadata for model_settings.config
    const componentMeta: { id: number; name: string; colorIdx: number }[] = [];

    // Header and BaseMaterials
    let header = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="Application">Kromacut_Print</metadata>
`;
    if (options?.layerHeight !== undefined) {
        header += ` <metadata name="slic3rpe:layer_height">${options.layerHeight}</metadata>
`;
    }
    if (options?.firstLayerHeight !== undefined) {
        header += ` <metadata name="slic3rpe:first_layer_height">${options.firstLayerHeight}</metadata>
`;
    }
    header += ` <resources>
`;

    // Write Base Materials if we have any
    if (colors.length > 0) {
        header += `  <basematerials id="${baseMatId}">
`;
        for (const hex of colors) {
            header += `   <base name="${hex}" displaycolor="#${hex}FF" />
`;
        }
        header += `  </basematerials>
`;
    }

    write(header);

    // Yield every N vertices/triangles to allow GC and UI updates
    const YIELD_EVERY = 100000;
    let opsSinceYield = 0;

    // Progress tracking
    const onProgress = options?.onProgress;
    const reportProgress = (value: number) => {
        onProgress?.(clampProgress(value));
    };
    const totalGroups = groups.length;
    // Mesh generation is the first 80%; zip generation owns the final 20%.
    const reportMeshProgress = (groupIdx: number, meshFrac: number) => {
        if (!onProgress) return;
        reportProgress(exportMeshProgress(groupIdx, totalGroups, meshFrac));
    };

    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const overrideHex = group.overrideHex;
        const matIdx = getMaterialIndex(group.meshes[0].material, overrideHex, group.materialKey);
        const objectId = nextId++;
        componentIds.push(objectId);

        let hex = normalizeHex(overrideHex) || 'FFFFFF';
        const firstMaterial = group.meshes[0].material;
        const firstMat = Array.isArray(firstMaterial) ? firstMaterial[0] : firstMaterial;
        if (!overrideHex && 'color' in firstMat && (firstMat as THREE.MeshStandardMaterial).color) {
            hex = (firstMat as THREE.MeshStandardMaterial).color.getHexString().toUpperCase();
        }
        const objectName = group.partName ?? `Layer ${i + 1} (#${hex})`;
        // Use 1-based index for color/extruder
        componentMeta.push({
            id: objectId,
            name: objectName,
            colorIdx: matIdx + 1,
        });

        const writeMeshGroupObject = async (
            groupMeshes: THREE.Mesh[],
            meshObjectId: number,
            meshName: string,
            progressStart: number,
            progressSpan: number
        ) => {
            write(`<object id="${meshObjectId}" p:UUID="${generateUUID()}" pid="${baseMatId}" pindex="${matIdx}" type="model" name="${meshName}">
`);
            write(` <mesh>
`);
            const phaseProgress = (value: number) =>
                progressInSpan(progressStart, progressSpan, value);
            const COLLECT_START = phaseProgress(0);
            const COLLECT_END = phaseProgress(0.42);
            const VERTEX_WRITE_END = phaseProgress(0.68);
            const TRIANGLE_WRITE_END = phaseProgress(1);

            // Shared output buffers for the whole object. Vertex welding is
            // reset per member mesh so each member stays an independent
            // closed shell inside the exported object.
            const exportVertexCoords: number[] = [];
            const triangleChunks: TriangleIndexChunk[] = [];
            const TRIANGLE_CHUNK_INDICES = 300000;
            let currentTriangleChunk = new Uint32Array(TRIANGLE_CHUNK_INDICES);
            let currentTriangleChunkLength = 0;
            let exportTriangleCount = 0;

            const flushTriangleChunk = () => {
                if (currentTriangleChunkLength === 0) return;
                triangleChunks.push({
                    data: currentTriangleChunk,
                    length: currentTriangleChunkLength,
                });
                currentTriangleChunk = new Uint32Array(TRIANGLE_CHUNK_INDICES);
                currentTriangleChunkLength = 0;
            };

            const pushExportTriangle = (v1: number, v2: number, v3: number) => {
                if (currentTriangleChunkLength + 3 > currentTriangleChunk.length) {
                    flushTriangleChunk();
                }

                currentTriangleChunk[currentTriangleChunkLength++] = v1;
                currentTriangleChunk[currentTriangleChunkLength++] = v2;
                currentTriangleChunk[currentTriangleChunkLength++] = v3;
                exportTriangleCount++;
            };

            const addExportTriangleByIndex = (v1: number, v2: number, v3: number) => {
                if (v1 < 0 || v2 < 0 || v3 < 0 || v1 === v2 || v2 === v3 || v1 === v3) {
                    return;
                }

                const p1 = v1 * 3;
                const p2 = v2 * 3;
                const p3 = v3 * 3;
                const abx = exportVertexCoords[p2] - exportVertexCoords[p1];
                const aby = exportVertexCoords[p2 + 1] - exportVertexCoords[p1 + 1];
                const abz = exportVertexCoords[p2 + 2] - exportVertexCoords[p1 + 2];
                const acx = exportVertexCoords[p3] - exportVertexCoords[p1];
                const acy = exportVertexCoords[p3 + 1] - exportVertexCoords[p1 + 1];
                const acz = exportVertexCoords[p3 + 2] - exportVertexCoords[p1 + 2];
                const crossX = aby * acz - abz * acy;
                const crossY = abz * acx - abx * acz;
                const crossZ = abx * acy - aby * acx;

                if (crossX === 0 && crossY === 0 && crossZ === 0) {
                    return;
                }

                pushExportTriangle(v1, v2, v3);
            };

            const memberCount = groupMeshes.length;
            const collectSpan = COLLECT_END - COLLECT_START;

            for (let memberIdx = 0; memberIdx < memberCount; memberIdx++) {
                const mesh = groupMeshes[memberIdx];
                const geom = mesh.geometry;
                const pos = geom.getAttribute('position');
                const index = geom.getIndex();
                const source = getKromacutExportGeometry(geom);
                const memberCollectStart =
                    COLLECT_START + (collectSpan * memberIdx) / memberCount;
                const memberCollectSpan = collectSpan / memberCount;
                const reportCollect = (fraction: number) => {
                    reportMeshProgress(
                        i,
                        progressInSpan(memberCollectStart, memberCollectSpan, fraction)
                    );
                };

                // Per-member vertex welding map (see note above).
                const exportVertexMap = new Map<string, number>();

                const addCoordVertex = (coordX: number, coordY: number, coordZ: number) => {
                    const key = `${coordX},${coordY},${coordZ}`;
                    let exportIndex = exportVertexMap.get(key);

                    if (exportIndex === undefined) {
                        exportIndex = exportVertexCoords.length / 3;
                        exportVertexMap.set(key, exportIndex);
                        exportVertexCoords.push(coordX, coordY, coordZ);
                    }

                    return exportIndex;
                };

                if (source?.indices) {
                    const positions = source.positions;
                    const indices = source.indices;
                    const itemSize = source.itemSize ?? 3;
                    const matrixElements = mesh.matrixWorld.elements;
                    const sourceVertexCount = Math.floor(positions.length / itemSize);
                    const sourceTriangleCount = Math.floor(indices.length / 3);
                    const sourceToExportVertex = new Int32Array(sourceVertexCount);
                    sourceToExportVertex.fill(-1);

                    const getSourceExportVertex = (sourceIndex: number) => {
                        if (
                            !Number.isInteger(sourceIndex) ||
                            sourceIndex < 0 ||
                            sourceIndex >= sourceVertexCount
                        ) {
                            return -1;
                        }

                        const cached = sourceToExportVertex[sourceIndex];
                        if (cached !== -1) {
                            return cached >= 0 ? cached : -1;
                        }

                        const sourceOffset = sourceIndex * itemSize;
                        const x = positions[sourceOffset];
                        const y = positions[sourceOffset + 1];
                        const z = positions[sourceOffset + 2];

                        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
                            sourceToExportVertex[sourceIndex] = -2;
                            return -1;
                        }

                        const transformedX =
                            matrixElements[0] * x +
                            matrixElements[4] * y +
                            matrixElements[8] * z +
                            matrixElements[12];
                        const transformedY =
                            matrixElements[1] * x +
                            matrixElements[5] * y +
                            matrixElements[9] * z +
                            matrixElements[13];
                        const transformedZ =
                            matrixElements[2] * x +
                            matrixElements[6] * y +
                            matrixElements[10] * z +
                            matrixElements[14];

                        const exportIndex = addCoordVertex(
                            toCoordUnits(transformedX),
                            toCoordUnits(transformedY),
                            toCoordUnits(transformedZ)
                        );

                        sourceToExportVertex[sourceIndex] = exportIndex;
                        return exportIndex;
                    };

                    for (let j = 0; j < sourceTriangleCount; j++) {
                        addExportTriangleByIndex(
                            getSourceExportVertex(indices[j * 3]),
                            getSourceExportVertex(indices[j * 3 + 1]),
                            getSourceExportVertex(indices[j * 3 + 2])
                        );

                        opsSinceYield++;
                        if (opsSinceYield > YIELD_EVERY) {
                            opsSinceYield = 0;
                            reportCollect(
                                sourceTriangleCount > 0 ? (j + 1) / sourceTriangleCount : 1
                            );
                            await new Promise((resolve) => setTimeout(resolve, 0));
                        }
                    }
                } else {
                    const getExportVertex = (vertexIndex: number) => {
                        v.fromBufferAttribute(pos, vertexIndex).applyMatrix4(mesh.matrixWorld);
                        return addCoordVertex(toCoordUnits(v.x), toCoordUnits(v.y), toCoordUnits(v.z));
                    };

                    const addAttributeTriangle = (a: number, b: number, c: number) => {
                        addExportTriangleByIndex(
                            getExportVertex(a),
                            getExportVertex(b),
                            getExportVertex(c)
                        );
                    };

                    if (index) {
                        const elementCount = index.count;
                        for (let j = 0; j < elementCount; j += 3) {
                            addAttributeTriangle(
                                index.getX(j),
                                index.getX(j + 1),
                                index.getX(j + 2)
                            );
                            opsSinceYield++;
                            if (opsSinceYield > YIELD_EVERY) {
                                opsSinceYield = 0;
                                reportCollect((j + 3) / elementCount);
                                await new Promise((resolve) => setTimeout(resolve, 0));
                            }
                        }
                    } else {
                        const elementCount = pos.count;
                        for (let j = 0; j < elementCount; j += 3) {
                            addAttributeTriangle(j, j + 1, j + 2);
                            opsSinceYield++;
                            if (opsSinceYield > YIELD_EVERY) {
                                opsSinceYield = 0;
                                reportCollect((j + 3) / elementCount);
                                await new Promise((resolve) => setTimeout(resolve, 0));
                            }
                        }
                    }
                }

                exportVertexMap.clear();
            }

            flushTriangleChunk();
            reportMeshProgress(i, COLLECT_END);

            write(`  <vertices>
`);

            const exportVertexCount = exportVertexCoords.length / 3;
            for (let j = 0; j < exportVertexCoords.length; j += 3) {
                const vertexIndex = j / 3;
                write(`   <vertex x="${formatCoord(exportVertexCoords[j])}" y="${formatCoord(exportVertexCoords[j + 1])}" z="${formatCoord(exportVertexCoords[j + 2])}" />
`);

                opsSinceYield++;
                if (opsSinceYield > YIELD_EVERY) {
                    opsSinceYield = 0;
                    reportMeshProgress(
                        i,
                        progressInSpan(
                            COLLECT_END,
                            VERTEX_WRITE_END - COLLECT_END,
                            exportVertexCount > 0 ? (vertexIndex + 1) / exportVertexCount : 1
                        )
                    );
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
            reportMeshProgress(i, VERTEX_WRITE_END);
            write(`  </vertices>
`);
            write(`  <triangles>
`);

            let trianglesWritten = 0;
            for (const chunk of triangleChunks) {
                for (let j = 0; j < chunk.length; j += 3) {
                    write(`   <triangle v1="${chunk.data[j]}" v2="${chunk.data[j + 1]}" v3="${chunk.data[j + 2]}" />
`);
                    trianglesWritten++;
                    opsSinceYield++;
                    if (opsSinceYield > YIELD_EVERY) {
                        opsSinceYield = 0;
                        reportMeshProgress(
                            i,
                            progressInSpan(
                                VERTEX_WRITE_END,
                                TRIANGLE_WRITE_END - VERTEX_WRITE_END,
                                exportTriangleCount > 0 ? trianglesWritten / exportTriangleCount : 1
                            )
                        );
                        await new Promise((resolve) => setTimeout(resolve, 0));
                    }
                }
            }
            reportMeshProgress(i, TRIANGLE_WRITE_END);

            write(`  </triangles>
`);
            write(` </mesh>
`);
            write(`</object>
`);
            exportVertexCoords.length = 0;
            triangleChunks.length = 0;
            currentTriangleChunk = new Uint32Array(0);
        };

        await writeMeshGroupObject(group.meshes, objectId, objectName, 0, 1);
    }

    // Assembly Object
    const assemblyId = nextId++;
    const assemblyUuid = generateUUID();
    write(`<object id="${assemblyId}" p:UUID="${assemblyUuid}" type="model" name="Kromacut Model">
`);
    write(` <components>
`);
    for (const id of componentIds) {
        const compUuid = generateUUID();
        write(`  <component objectid="${id}" p:UUID="${compUuid}" />
`);
    }
    write(` </components>
`);
    write(`</object>
`);

    write(` </resources>
`);
    write(` <build p:UUID="${generateUUID()}">
`);
    write(`<item objectid="${assemblyId}" p:UUID="${generateUUID()}" />
`);
    write(` </build>
`);
    write(`</model>`);

    flushXmlChunk();

    const finalBlob = new Blob(xmlParts, { type: 'text/xml' });

    zip.folder('3D')?.file('3dmodel.model', finalBlob);

    // Generate Metadata/model_settings.config
    // This is required for Bambu Studio / Orca Slicer / Creality Print to correctly identify
    // the multipart object structure and assign names/settings, avoiding the "profile selection" prompt
    // and enabling correct color assignment visualization.
    let modelSettings = `<?xml version="1.0" encoding="UTF-8"?>
<config>
 <object id="${assemblyId}">
  <metadata key="name" value="Kromacut Model"/>
  <metadata key="extruder" value="1"/>
`;
    for (const comp of componentMeta) {
        const safeName = comp.name
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        modelSettings += `  <part id="${comp.id}" subtype="normal_part">
   <metadata key="name" value="${safeName}"/>
   <metadata key="extruder" value="${comp.colorIdx}"/>
  </part>
`;
    }
    modelSettings += ` </object>
 <plate>
  <metadata key="plater_id" value="1"/>
  <metadata key="plater_name" value=""/>
  <metadata key="locked" value="false"/>
  <model_instance>
   <metadata key="object_id" value="${assemblyId}"/>
   <metadata key="instance_id" value="0"/>
  </model_instance>
 </plate>
 <assemble>
  <assemble_item object_id="${assemblyId}" instance_id="0" transform="1 0 0 0 1 0 0 0 1 110 110 0" offset="0 0 0" />
 </assemble>
</config>`;

    zip.folder('Metadata')?.file('model_settings.config', modelSettings);

    zip.folder('Metadata')?.file('kromacut.config', KROMACUT_CONFIG);
    zip.folder('Metadata')?.file(
        'project_settings.config',
        JSON.stringify(projectSettings, null, 4)
    );

    reportProgress(exportZipProgress(0));

    const blob = await zip.generateAsync(
        {
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 1,
            },
        },
        onProgress
            ? (meta) => {
                  options?.onZipProgress?.({
                      percent: meta.percent,
                      currentFile: meta.currentFile ?? null,
                  });
                  // zip progress goes from 80% to 100%
                  reportProgress(exportZipProgress(meta.percent / 100));
              }
            : undefined
    );
    reportProgress(exportZipProgress(1));
    return blob;
}
