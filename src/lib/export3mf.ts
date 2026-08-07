import JSZip from 'jszip';
import * as THREE from 'three';
import { MINIMAL_PROJECT_SETTINGS, KROMACUT_CONFIG } from './slicerDefaults';
import { clampProgress, exportMeshProgress, exportZipProgress, progressInSpan } from './progress';
import { normalizeHexColor } from './colorUtils';
import { buildNozzleVoxelMesh, type NozzleLayerRecord } from './voxelMesh';

export interface Export3MFOptions {
    layerHeight?: number;
    firstLayerHeight?: number;
    layerFilamentColors?: string[]; // Optional per-layer filament colors (hex) for export
    /**
     * Number of physical nozzles on the target printer (e.g. 3 for a 3-head U1).
     * When set, the 3MF declares exactly N nozzle_diameter entries and part extruder
     * values are clamped to [1, N].  Orca must have a matching N-nozzle printer profile
     * selected (e.g. Snapmaker U1) or it will crash on import.
     * When omitted, falls back to AMS-style: single nozzle_diameter, K filament slots.
     */
    extruderCount?: number;
    /**
     * Printer layers (1-based) where the print must pause so the operator can swap the
     * filament loaded on the heads — i.e. the multi-head "Head Schedule" swap checkpoints.
     * Each becomes a PausePrint marker in Metadata/custom_gcode_per_layer.xml at the
     * layer's print_z, so OrcaSlicer inserts a pause (machine_pause_gcode / M600) at the
     * start of that layer. Without these, Orca treats every head as one fixed filament for
     * the whole print and silently drops the mid-print swaps.
     */
    swapLayers?: { layer: number; color?: string }[];
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

function utf8ByteLength(value: string): number {
    let length = 0;
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code < 0x80) {
            length += 1;
        } else if (code < 0x800) {
            length += 2;
        } else if (
            code >= 0xd800 &&
            code <= 0xdbff &&
            index + 1 < value.length &&
            value.charCodeAt(index + 1) >= 0xdc00 &&
            value.charCodeAt(index + 1) <= 0xdfff
        ) {
            length += 4;
            index++;
        } else {
            // This also matches TextEncoder's replacement behavior for an
            // unpaired UTF-16 surrogate.
            length += 3;
        }
    }
    return length;
}

/**
 * Encodes XML chunks straight into one JSZip-supported byte buffer. This
 * avoids both Blob/FileReader reads in desktop WebViews and Array.join's
 * string-size limit without making temporary copies of every XML chunk.
 */
function encodeXmlChunks(chunks: string[]): Uint8Array {
    const byteLength = chunks.reduce((total, chunk) => total + utf8ByteLength(chunk), 0);
    const output = new Uint8Array(byteLength);
    const encoder = new TextEncoder();
    let offset = 0;

    for (const chunk of chunks) {
        const { read, written } = encoder.encodeInto(chunk, output.subarray(offset));
        if (read !== chunk.length) {
            throw new Error('Could not encode complete 3MF model XML');
        }
        offset += written;
    }

    return output;
}

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

/**
 * Build one manifold THREE.Mesh per nozzle from scene meshes tagged with
 * userData.nozzleIndex.  Each nozzle's per-layer pixel masks are OR-ed and
 * fed to buildNozzleVoxelMesh, which produces a single 2-manifold solid
 * with no coincident faces at layer or color boundaries.
 */
function buildNozzleManifoldMeshes(meshes: THREE.Mesh[]): THREE.Mesh[] {
    type LayerData = {
        baseZ_mm: number;
        topZ_world: number;
        mask: Uint8Array;
        width: number;
        height: number;
        pixelSize: number;
    };

    const nozzleLayerMap = new Map<number, Map<string, LayerData>>();
    const nozzleHex = new Map<number, string>();
    let heightScale = 1;
    let heightScaleComputed = false;

    for (const mesh of meshes) {
        const nozzleIndex = mesh.userData?.nozzleIndex;
        if (typeof nozzleIndex !== 'number') continue;

        const rawGeom = mesh.geometry?.userData?.kromacutExportGeometry as
            Record<string, unknown> | undefined;
        const activePixels = rawGeom?.activePixels as Uint8Array | undefined;
        const width = rawGeom?.width as number | undefined;
        const height = rawGeom?.height as number | undefined;
        const pixelSize = rawGeom?.pixelSize as number | undefined;
        const topZ_world = rawGeom?.topZ as number | undefined;
        if (!activePixels || !width || !height || !pixelSize || topZ_world === undefined) continue;

        const baseZ_mm = (mesh.userData.baseZ as number) ?? 0;
        const topZ_mm = mesh.userData.topZ as number;
        if (!Number.isFinite(topZ_mm) || topZ_mm <= 0) continue;

        if (!heightScaleComputed) {
            heightScale = topZ_world / topZ_mm;
            heightScaleComputed = true;
        }

        if (!nozzleHex.has(nozzleIndex)) {
            const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            let hex = 'FFFFFF';
            if ('color' in mat) {
                hex = (mat as THREE.MeshStandardMaterial).color.getHexString().toUpperCase();
            }
            nozzleHex.set(nozzleIndex, hex);
        }

        let nozzleMap = nozzleLayerMap.get(nozzleIndex);
        if (!nozzleMap) {
            nozzleMap = new Map();
            nozzleLayerMap.set(nozzleIndex, nozzleMap);
        }

        const layerKey = baseZ_mm.toFixed(8);
        let layerData = nozzleMap.get(layerKey);
        if (!layerData) {
            layerData = {
                baseZ_mm,
                topZ_world,
                mask: new Uint8Array(width * height),
                width,
                height,
                pixelSize,
            };
            nozzleMap.set(layerKey, layerData);
        }
        for (let mi = 0; mi < activePixels.length; mi++) {
            if (activePixels[mi]) layerData.mask[mi] = 1;
        }
    }

    if (nozzleLayerMap.size === 0) return [];

    // Build a global sorted layer list so each nozzle's layer records are
    // aligned to the same indices (null where a nozzle is absent), enabling
    // correct Z-adjacency checks for cap insertion in buildNozzleVoxelMesh.
    type GlobalLayer = {
        key: string;
        baseZ_mm: number;
        topZ_world: number;
        baseZ_world: number;
    };
    const globalLayerMap = new Map<string, GlobalLayer>();
    for (const [, nozzleMap] of nozzleLayerMap) {
        for (const [key, data] of nozzleMap) {
            if (!globalLayerMap.has(key)) {
                globalLayerMap.set(key, {
                    key,
                    baseZ_mm: data.baseZ_mm,
                    topZ_world: data.topZ_world,
                    baseZ_world: data.baseZ_mm * heightScale,
                });
            }
        }
    }
    const globalLayers = [...globalLayerMap.values()].sort((a, b) => a.baseZ_mm - b.baseZ_mm);

    const syntheticMeshes: THREE.Mesh[] = [];

    for (const [nozzleIndex, nozzleMap] of nozzleLayerMap) {
        const firstData = nozzleMap.values().next().value as LayerData;
        const { width, height, pixelSize } = firstData;

        const layerRecords: (NozzleLayerRecord | null)[] = globalLayers.map((gl) => {
            const data = nozzleMap.get(gl.key);
            if (!data) return null;
            return { mask: data.mask, baseZ: gl.baseZ_world, topZ: data.topZ_world };
        });

        const { positions, indices } = buildNozzleVoxelMesh(layerRecords, width, height, pixelSize);

        const hex = nozzleHex.get(nozzleIndex) ?? 'FFFFFF';
        const geom = new THREE.BufferGeometry();
        geom.userData.kromacutExportGeometry = { positions, indices, itemSize: 3 };
        const mat = new THREE.MeshStandardMaterial({ color: '#' + hex });
        const syntheticMesh = new THREE.Mesh(geom, mat);
        syntheticMesh.userData.nozzleIndex = nozzleIndex;
        syntheticMeshes.push(syntheticMesh);
    }

    syntheticMeshes.sort(
        (a, b) => (a.userData.nozzleIndex ?? 0) - (b.userData.nozzleIndex ?? 0)
    );
    return syntheticMeshes;
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
 <Default Extension="xml" ContentType="application/xml"/>
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

    // For multi-head mode: replace the fragmented per-layer-per-color mesh list
    // with one manifold voxel solid per nozzle before group building.  This
    // eliminates coincident faces at color- and layer-boundaries that cause
    // non-manifold geometry in slicers.
    if ((options?.extruderCount ?? 0) >= 2) {
        const manifoldMeshes = buildNozzleManifoldMeshes(meshes);
        if (manifoldMeshes.length > 0) {
            meshes.length = 0;
            for (const m of manifoldMeshes) meshes.push(m);
        }
    }

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

    // Pre-calculate all materials so we can write the header correctly.
    // For multi-head mode also collect one representative color per nozzle so
    // Orca's filament panel shows something meaningful (cosmetic only — basematerials
    // drives actual rendering; each nozzle's true color changes at phase boundaries
    // per the Kromacut filament-swap instructions).
    const nozzleRepColor = new Map<number, string>(); // nozzle (1-based) -> RRGGBB
    for (const group of groups) {
        getMaterialIndex(group.meshes[0].material, group.overrideHex, group.materialKey);
        if (options?.extruderCount) {
            const ni = typeof group.meshes[0].userData?.nozzleIndex === 'number'
                ? group.meshes[0].userData.nozzleIndex : null;
            if (ni !== null && !nozzleRepColor.has(ni)) {
                const overrideHex = group.overrideHex;
                const mat = Array.isArray(group.meshes[0].material)
                    ? group.meshes[0].material[0]
                    : group.meshes[0].material;
                let hex = normalizeHex(overrideHex) || 'FFFFFF';
                if (!overrideHex && 'color' in mat && (mat as THREE.MeshStandardMaterial).color) {
                    hex = (mat as THREE.MeshStandardMaterial).color.getHexString().toUpperCase();
                }
                nozzleRepColor.set(ni, hex);
            }
        }
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

    const N = options?.extruderCount ?? 0;
    if (N >= 2) {
        // Multi-head (true multi-nozzle, e.g. Snapmaker U1): exactly N slots.
        // Orca requires nozzle_diameter.length == extruder count in the loaded printer
        // profile — the user must select a matching N-nozzle profile before importing.
        projectSettings.filament_colour = Array.from({ length: N }, (_, k) =>
            '#' + (nozzleRepColor.get(k + 1) ?? 'FFFFFF')
        );
        projectSettings.filament_type = expand('PLA', N);
        projectSettings.filament_settings_id = expand('Generic PLA @Kromacut 0.4 nozzle', N);
        projectSettings.filament_vendor = expand('Generic', N);
        projectSettings.nozzle_diameter = expand('0.4', N);
        // Declare N filaments' diameter. OrcaSlicer derives the *filament count* from
        // filament_diameter.length (PresetBundle::validate_presets / project load), NOT
        // from filament_colour. Our filament presets ("Generic PLA @Kromacut…") don't
        // resolve to a system preset, so any per-filament array we omit defaults to a
        // single element. If filament_diameter is length 1 while filament_colour/
        // filament_map are length N, Orca builds one filament slot but multi-extruder
        // slicing indexes per-filament vector<double>s by filament id 1..N-1 → an
        // out-of-bounds std::vector::operator[] assertion that aborts the slice. Emitting
        // it at length N makes Orca build N slots and expand the other arrays to match.
        (projectSettings as Record<string, unknown>).filament_diameter = expand('1.75', N);
        // Declare every per-*extruder* setting at length N for the same reason.
        //
        // Our printer preset ("Kromacut 0.4 nozzle") also doesn't resolve to a system
        // preset, so Orca builds a self-defined N-extruder printer from these project
        // settings. nozzle_diameter (length N) makes Orca treat it as an N-extruder
        // printer, but every other per-extruder array we omit stays at its length-1
        // default — and both project load (Tab::switch_excluder → extruder_type[k]) and
        // slicing index those by extruder id 1..N-1, hitting a std::vector::operator[]
        // out-of-bounds abort. We emit the full per-extruder key set
        // (PrintConfigDef::m_extruder_option_keys + nozzle_volume_type) at length N.
        // Values are generic 0.4 mm direct-drive defaults — the print itself is governed
        // by the user's selected printer profile; these only need to be present and the
        // right length. Serialization matches Orca's profile JSON: enums as labels, bools
        // as "1"/"0", points as "0x0".
        const perExtruderDefaults: Record<string, string> = {
            // floats / percents
            min_layer_height: '0.08',
            max_layer_height: '0.3',
            extruder_printable_height: projectSettings.printable_height ?? '300',
            nozzle_volume: '0',
            retraction_length: '0.8',
            z_hop: '0.4',
            travel_slope: '3',
            retract_lift_above: '0',
            retract_lift_below: '0',
            retraction_speed: '30',
            deretraction_speed: '30',
            retract_before_wipe: '0%',
            retract_restart_extra: '0',
            retraction_minimum_travel: '1',
            wipe_distance: '1',
            retract_length_toolchange: '2',
            retract_restart_extra_toolchange: '0',
            retraction_distances_when_cut: '18',
            // enums (label form). extruder_type[k] / nozzle_volume_type[k] are what the
            // GUI's switch_excluder() indexes at load time, so these are essential.
            extruder_type: 'Direct Drive',
            default_nozzle_volume_type: 'Standard',
            nozzle_volume_type: 'Standard',
            z_hop_types: 'Auto Lift',
            retract_lift_enforce: 'All Surfaces',
            nozzle_type: 'undefine',
            // ints
            nozzle_flush_dataset: '0',
            // bools
            wipe: '1',
            retract_when_changing_layer: '1',
            long_retractions_when_cut: '0',
            // points / strings
            extruder_offset: '0x0',
            extruder_colour: '#FCE94F',
            default_filament_profile: '',
        };
        for (const [key, value] of Object.entries(perExtruderDefaults)) {
            (projectSettings as Record<string, unknown>)[key] = expand(value, N);
        }
        // Flush matrix between filaments, indexed per nozzle as
        // flush_matrix[old_filament * filamentCount + new_filament] in GCode::set_extruder
        // at every tool change. Orca expects (nozzleCount × filamentCount²) entries; if
        // unset it defaults too small and the first tool change reads out of bounds. A
        // toolchanger never cross-purges between heads, so zeros are correct here.
        (projectSettings as Record<string, unknown>).flush_volumes_matrix = expand('0', N * N * N);
        (projectSettings as Record<string, unknown>).flush_multiplier = expand('1', N);
        // The self-defined printer has no pause G-code, so PausePrint markers (below)
        // would expand to nothing. Provide one so the head-swap pauses actually emit.
        (projectSettings as Record<string, unknown>).machine_pause_gcode = 'M600';
        // Pin each logical filament to its matching physical nozzle/tool.
        //
        // On a toolchanger like the Snapmaker U1, a part's "extruder" value is a
        // *logical* filament index. The physical tool that actually prints it is
        // filament_map[extruder] (see OrcaSlicer get_extruder_index). With the
        // default filament_map_mode ("Auto For Flush") Orca *recomputes* that map on
        // slice to minimise flushing, which scrambles Kromacut's nozzle assignments —
        // the imported part extruders no longer match the heads we chose.
        //
        // We assign extruder k to physical nozzle k, so the map must be the identity
        // [1..N], and the mode must be "Manual" so Orca keeps it instead of
        // re-deriving it (Print.cpp only honours a supplied map when mode >= fmmManual).
        (projectSettings as Record<string, unknown>).filament_map = Array.from(
            { length: N },
            (_, k) => (k + 1).toString()
        );
        (projectSettings as Record<string, unknown>).filament_map_mode = 'Manual';
        // Toolchanger/multi-head printers use relative extrusion (M83). Orca requires a
        // "G92 E0" extruder-position reset at each layer to avoid floating-point drift,
        // and rejects the slice otherwise ("Relative extruder addressing requires
        // resetting the extruder position at each layer ... Add 'G92 E0' to layer_gcode").
        //
        // The validator (Print.cpp validate()) only inspects before_layer_change_gcode
        // and layer_change_gcode — "layer_gcode" is a PrusaSlicer key name that doesn't
        // exist in Orca at all, so the value we used to write here was silently dropped
        // and never satisfied the check. Write the real Orca key instead.
        (projectSettings as Record<string, unknown>).before_layer_change_gcode =
            ';BEFORE_LAYER_CHANGE\n;[layer_z]\nG92 E0\n';
    } else {
        // Single-head / AMS-style fallback: one nozzle_diameter, K colour slots.
        projectSettings.filament_colour = exportColors.map((c) => '#' + c);
        projectSettings.filament_type = expand('PLA', exportColors.length);
        projectSettings.filament_settings_id = expand('Generic PLA @Kromacut 0.4 nozzle', exportColors.length);
        projectSettings.filament_vendor = expand('Generic', exportColors.length);
        // Keep filament_diameter length in step with the colour slots so Orca's
        // filament-count derivation (filament_diameter.length) matches; see the
        // multi-head branch above for why a short array crashes the slicer.
        (projectSettings as Record<string, unknown>).filament_diameter = expand(
            '1.75',
            exportColors.length
        );
    }

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
        // Use nozzle index from userData when present (multi-head: set by ThreeDView
        // from the DP nozzle-assignment result).  Fall back to color-order index for
        // single-head and spatial-variance paths.
        const rawNozzle = typeof group.meshes[0].userData?.nozzleIndex === 'number'
            ? group.meshes[0].userData.nozzleIndex
            : matIdx + 1;
        // In multi-head mode clamp to [1, N] — a part referencing nozzle > N would
        // cause an out-of-bounds vector access in OrcaSlicer.
        const nozzleIdx = N >= 2 ? Math.max(1, Math.min(rawNozzle, N)) : rawNozzle;
        componentMeta.push({
            id: objectId,
            name: objectName,
            colorIdx: nozzleIdx,
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

    // JSZip accepts Uint8Array directly. Encoding into it chunk-by-chunk
    // avoids both the Tauri WebView FileReader failure for Blobs and
    // Array.join's string-size limit for large models.
    const modelXmlBytes = encodeXmlChunks(xmlParts.splice(0));
    zip.folder('3D')?.file('3dmodel.model', modelXmlBytes, { binary: true });

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

    // Manual head-swap pauses (multi-head Head Schedule). Each swap layer becomes a
    // PausePrint (type=1) entry at the layer's print_z; OrcaSlicer inserts a pause
    // (machine_pause_gcode, e.g. M600) at the start of that layer. print_z matches the
    // slicer's layer Z: firstLayerHeight for layer 1, then +layerHeight per layer. The
    // gcode attribute is informational — Orca re-derives the real pause gcode from the
    // type at slice time.
    const swapLayers = (options?.swapLayers ?? []).filter((s) => s.layer >= 2);
    if (swapLayers.length > 0) {
        const lhVal = Number(projectSettings.layer_height) || 0.2;
        const flVal = Number(projectSettings.initial_layer_print_height) || lhVal;
        const layerLines = swapLayers
            .map((s) => {
                const topZ = Number((flVal + (s.layer - 1) * lhVal).toFixed(5));
                const hex = normalizeHex(s.color);
                const color = hex ? '#' + hex : '#888888';
                return `<layer top_z="${topZ}" type="1" extruder="1" color="${color}" extra="Swap heads (layer ${s.layer})" gcode="M600"/>`;
            })
            .join('\n');
        const customGcodeXml = `<?xml version="1.0" encoding="utf-8"?>
<custom_gcodes_per_layer>
<plate>
<plate_info id="1"/>
${layerLines}
<mode value="MultiExtruder"/>
</plate>
</custom_gcodes_per_layer>
`;
        zip.folder('Metadata')?.file('custom_gcode_per_layer.xml', customGcodeXml);
    }

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
