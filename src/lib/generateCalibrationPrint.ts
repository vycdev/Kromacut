/**
 * Frontlit calibration print generator.
 *
 * Each filament gets a tile: a base, a wedge of 1..N filament layers across the
 * base, and a continuous opaque reference rail along the edge. The user finds the
 * first wedge patch that looks identical to the rail and reports that layer count
 * (see calibration.ts -> computeFrontlitCalibration). A foot marks the 1-layer end
 * so orientation is unambiguous. The base color is chosen per filament (defaults
 * to the darkest filament; dark filaments use a lighter base for contrast).
 *
 * Two output formats:
 *  - STL: one tile per file, emitted as multiple independently watertight
 *    shells (base slab, orientation foot, each patch, the rail) that touch or
 *    overlap. Slicers union coincident/overlapping closed shells on import, so
 *    the tile prints as one part; this multi-shell contract is deliberate (a
 *    true CSG fusion of the rounded prisms is not worth the complexity and the
 *    output is print-validated). The base/wedge split is by height, so a single
 *    filament change (base -> color, above the base) prints it on any machine.
 *  - 3MF: one or more tiles, each as a base object + a color object, with parts
 *    assigned to real profile-filament slots (no invented base), for AMS printers.
 *
 * No Three.js dependency.
 */

import JSZip from 'jszip';
import { normalizeHexColor } from './colorUtils';
import { MINIMAL_PROJECT_SETTINGS, KROMACUT_CONFIG } from './slicerDefaults';

export interface CalibrationTile {
    filamentId: string;
    /** Filament display color (hex). */
    color: string;
    /** Profile filament id used as this wedge's base. */
    baseFilamentId: string;
    /** Base filament display color (hex), for fallback. */
    baseColor: string;
    /** Human label for instructions / file names. */
    name: string;
}

/** Ordered profile filament, so 3MF slots line up with the user's AMS/machine. */
export interface CalibrationProfileFilament {
    id: string;
    color: string;
    name: string;
}

export interface CalibrationPrintOptions {
    layerHeight: number;
    firstLayerHeight: number;
    /** Wedge runs 1..maxLayers. */
    maxLayers: number;
    /** Black base thickness, in layers. Just enough to be opaque + provide a base. */
    baseLayers: number;
    /** Patch footprint (mm). */
    patchSize: number;
    /** Gap between patches (mm). */
    gap: number;
}

export const DEFAULT_CALIBRATION_PRINT_OPTIONS: CalibrationPrintOptions = {
    layerHeight: 0.08,
    firstLayerHeight: 0.2,
    maxLayers: 12,
    baseLayers: 5,
    patchSize: 10,
    gap: 0.8,
};

/** Which of the four vertical corners are rounded. Omitted corners default to rounded. */
type CornerRounding = { bl?: boolean; br?: boolean; tr?: boolean; tl?: boolean };

interface Box {
    x0: number;
    y0: number;
    z0: number;
    w: number;
    d: number;
    h: number;
    round?: CornerRounding;
}

interface TileGeometry {
    baseBoxes: Box[];
    colorBoxes: Box[];
}

/**
 * Thickness of the base in mm. The first printed layer uses the slicer's first
 * layer height, then the remaining base layers use the regular layer height.
 * This keeps the base top and every wedge/rail top on the slicer's Z grid.
 */
export function calibrationBaseHeight(
    options: Pick<CalibrationPrintOptions, 'baseLayers' | 'layerHeight' | 'firstLayerHeight'>
): number {
    if (!Number.isFinite(options.baseLayers) || options.baseLayers <= 0) return 0;
    const firstLayer = Math.max(options.layerHeight, options.firstLayerHeight);
    return firstLayer + Math.max(0, options.baseLayers - 1) * options.layerHeight;
}

/** Width of the opaque reference rail along the wedge edge (mm). */
const REFERENCE_RAIL_WIDTH = 2;
/** Layers the reference rail adds beyond the tallest patch so it reads as opaque. */
const REFERENCE_MARGIN_LAYERS = 4;

/**
 * Build the box list for one tile at the given X origin. The color wedge sits on
 * top of the black base, so every color layer is a regular layer. A continuous
 * opaque reference rail runs along the back edge and the patches butt directly
 * against it: each printed layer is then a single connected comb (rail spine +
 * the patches reaching that height) instead of many separate islands, which cuts
 * travel — and it puts each patch flush against the rail for easy comparison.
 */
function buildTileGeometry(options: CalibrationPrintOptions, originX = 0): TileGeometry {
    const { layerHeight, maxLayers, patchSize, gap } = options;
    const railLayers = maxLayers + REFERENCE_MARGIN_LAYERS;
    const baseH = calibrationBaseHeight(options);
    const pad = gap;
    const columnWidth = patchSize + gap;
    const wedgeSpan = maxLayers * columnWidth - gap; // first patch left to last patch right
    const railGap = 0; // patches touch the rail so each layer prints as one comb
    const baseWidth = wedgeSpan + 2 * pad;
    const baseDepth = patchSize + railGap + REFERENCE_RAIL_WIDTH + 2 * pad;

    const baseBoxes: Box[] = [
        { x0: originX, y0: 0, z0: 0, w: baseWidth, d: baseDepth, h: baseH },
    ];

    // Orientation foot: extends the front-left of the base forward to mark the
    // 1-layer end. It overlaps into the base (one fused solid, not a separate
    // bump) and only its front corners are rounded, so it reads as part of the
    // base outline and prints more cleanly.
    const tabDepth = pad * 1.5;
    baseBoxes.push({
        x0: originX,
        y0: -tabDepth,
        z0: 0,
        // Reach to the middle of the first inter-patch gap.
        w: pad + patchSize + gap / 2,
        d: tabDepth + CORNER_RADIUS + 0.5, // overlap past the base's rounded corner
        h: baseH,
        round: { tr: false, tl: false }, // square the base-side corners
    });

    const colorBoxes: Box[] = [];
    for (let layers = 1; layers <= maxLayers; layers++) {
        colorBoxes.push({
            x0: originX + pad + (layers - 1) * columnWidth,
            y0: pad,
            z0: baseH,
            w: patchSize,
            d: patchSize,
            h: layers * layerHeight,
            // Square the back corners (toward the rail) for a flush junction.
            round: { tr: false, tl: false },
        });
    }
    // Opaque reference rail along the back edge, spanning the full wedge length.
    colorBoxes.push({
        x0: originX + pad,
        y0: pad + patchSize + railGap,
        z0: baseH,
        w: wedgeSpan,
        d: REFERENCE_RAIL_WIDTH,
        h: railLayers * layerHeight,
        // Square the front corners (toward the patches) to meet them cleanly.
        round: { bl: false, br: false },
    });

    return { baseBoxes, colorBoxes };
}

// ============================================================================
// Binary STL
// ============================================================================

function setF32(view: DataView, offset: number, value: number) {
    view.setFloat32(offset, value, true);
}

function writeTriangle(
    view: DataView,
    offset: number,
    n: [number, number, number],
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
): number {
    setF32(view, offset, n[0]);
    setF32(view, offset + 4, n[1]);
    setF32(view, offset + 8, n[2]);
    setF32(view, offset + 12, a[0]);
    setF32(view, offset + 16, a[1]);
    setF32(view, offset + 20, a[2]);
    setF32(view, offset + 24, b[0]);
    setF32(view, offset + 28, b[1]);
    setF32(view, offset + 32, b[2]);
    setF32(view, offset + 36, c[0]);
    setF32(view, offset + 40, c[1]);
    setF32(view, offset + 44, c[2]);
    view.setUint16(offset + 48, 0, true);
    return offset + 50;
}

const CORNER_RADIUS = 1.2; // mm — rounding applied to the vertical edges of every box.
const CORNER_SEGMENTS = 5;

/** CCW (viewed from +Z) outline of a rounded rectangle; sharp corners emit a single point. */
function roundedRectOutline(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r: number,
    segments: number,
    round: Required<CornerRounding>
): Array<[number, number]> {
    const pts: Array<[number, number]> = [];
    const corner = (
        cx: number,
        cy: number,
        startDeg: number,
        endDeg: number,
        isRound: boolean,
        sharpX: number,
        sharpY: number
    ) => {
        if (!isRound) {
            pts.push([sharpX, sharpY]);
            return;
        }
        for (let i = 0; i <= segments; i++) {
            const a = ((startDeg + (endDeg - startDeg) * (i / segments)) * Math.PI) / 180;
            pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
    };
    corner(x1 - r, y0 + r, 270, 360, round.br, x1, y0); // bottom-right
    corner(x1 - r, y1 - r, 0, 90, round.tr, x1, y1); // top-right
    corner(x0 + r, y1 - r, 90, 180, round.tl, x0, y1); // top-left
    corner(x0 + r, y0 + r, 180, 270, round.bl, x0, y0); // bottom-left
    return pts;
}

function appendSharpBox(mesh: IndexedMesh, box: Box) {
    const base = mesh.vertices.length / 3;
    const { x0, y0, z0, w, d, h } = box;
    const x1 = x0 + w;
    const y1 = y0 + d;
    const z1 = z0 + h;
    const corners = [
        [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
        [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
    ];
    for (const c of corners) mesh.vertices.push(c[0], c[1], c[2]);
    const tris = [
        [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
        [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6],
        [0, 7, 3], [0, 4, 7], [1, 2, 6], [1, 6, 5],
    ];
    for (const [a, b, c] of tris) mesh.triangles.push(base + a, base + b, base + c);
}

/** Append a watertight prism with rounded vertical edges (or a sharp box if too thin). */
function appendPrism(mesh: IndexedMesh, box: Box) {
    const { x0, y0, z0, w, d, h, round } = box;
    const r = Math.min(CORNER_RADIUS, w / 2 - 0.01, d / 2 - 0.01);
    if (r < 0.1) {
        appendSharpBox(mesh, box);
        return;
    }

    const x1 = x0 + w;
    const y1 = y0 + d;
    const z1 = z0 + h;
    const rounding: Required<CornerRounding> = {
        bl: round?.bl ?? true,
        br: round?.br ?? true,
        tr: round?.tr ?? true,
        tl: round?.tl ?? true,
    };
    const outline = roundedRectOutline(x0, y0, x1, y1, r, CORNER_SEGMENTS, rounding);
    const n = outline.length;
    const base = mesh.vertices.length / 3;

    for (const [px, py] of outline) mesh.vertices.push(px, py, z1); // top ring
    for (const [px, py] of outline) mesh.vertices.push(px, py, z0); // bottom ring
    let cx = 0;
    let cy = 0;
    for (const [px, py] of outline) {
        cx += px;
        cy += py;
    }
    cx /= n;
    cy /= n;
    const topCenter = base + 2 * n;
    const bottomCenter = base + 2 * n + 1;
    mesh.vertices.push(cx, cy, z1);
    mesh.vertices.push(cx, cy, z0);

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const top = base + i;
        const topNext = base + j;
        const bottom = base + n + i;
        const bottomNext = base + n + j;
        mesh.triangles.push(topCenter, top, topNext); // top cap (+Z)
        mesh.triangles.push(bottomCenter, bottomNext, bottom); // bottom cap (-Z)
        mesh.triangles.push(top, bottom, topNext); // wall (outward)
        mesh.triangles.push(topNext, bottom, bottomNext);
    }
}

function faceNormal(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
): [number, number, number] {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
}

/** Single-filament calibration tile as a binary STL solid. */
export function generateCalibrationStl(options: CalibrationPrintOptions): Blob {
    const { baseBoxes, colorBoxes } = buildTileGeometry(options);
    const mesh: IndexedMesh = { vertices: [], triangles: [] };
    for (const box of [...baseBoxes, ...colorBoxes]) appendPrism(mesh, box);

    const triCount = mesh.triangles.length / 3;
    const buffer = new ArrayBuffer(80 + 4 + triCount * 50);
    const view = new DataView(buffer);
    const header = 'Kromacut Frontlit Calibration';
    for (let i = 0; i < header.length && i < 80; i++) view.setUint8(i, header.charCodeAt(i));
    view.setUint32(80, triCount, true);

    let offset = 84;
    for (let t = 0; t < mesh.triangles.length; t += 3) {
        const ia = mesh.triangles[t] * 3;
        const ib = mesh.triangles[t + 1] * 3;
        const ic = mesh.triangles[t + 2] * 3;
        const a: [number, number, number] = [
            mesh.vertices[ia],
            mesh.vertices[ia + 1],
            mesh.vertices[ia + 2],
        ];
        const b: [number, number, number] = [
            mesh.vertices[ib],
            mesh.vertices[ib + 1],
            mesh.vertices[ib + 2],
        ];
        const c: [number, number, number] = [
            mesh.vertices[ic],
            mesh.vertices[ic + 1],
            mesh.vertices[ic + 2],
        ];
        offset = writeTriangle(view, offset, faceNormal(a, b, c), a, b, c);
    }

    return new Blob([buffer], { type: 'model/stl' });
}

// ============================================================================
// 3MF (multi-material)
// ============================================================================

interface IndexedMesh {
    vertices: number[]; // flat x,y,z
    triangles: number[]; // flat v1,v2,v3
}

function meshXml(mesh: IndexedMesh): string {
    const verts: string[] = ['<vertices>'];
    for (let i = 0; i < mesh.vertices.length; i += 3) {
        verts.push(
            `<vertex x="${mesh.vertices[i].toFixed(4)}" y="${mesh.vertices[i + 1].toFixed(4)}" z="${mesh.vertices[i + 2].toFixed(4)}"/>`
        );
    }
    verts.push('</vertices>');
    const tris: string[] = ['<triangles>'];
    for (let i = 0; i < mesh.triangles.length; i += 3) {
        tris.push(
            `<triangle v1="${mesh.triangles[i]}" v2="${mesh.triangles[i + 1]}" v3="${mesh.triangles[i + 2]}"/>`
        );
    }
    tris.push('</triangles>');
    return `<mesh>${verts.join('')}${tris.join('')}</mesh>`;
}

function generateUUID(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/** Translate every mesh in XY so the combined layout is centered on the origin. */
function centerMeshesXY(meshes: IndexedMesh[]) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const mesh of meshes) {
        for (let i = 0; i < mesh.vertices.length; i += 3) {
            const x = mesh.vertices[i];
            const y = mesh.vertices[i + 1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (!Number.isFinite(minX)) return;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    for (const mesh of meshes) {
        for (let i = 0; i < mesh.vertices.length; i += 3) {
            mesh.vertices[i] -= cx;
            mesh.vertices[i + 1] -= cy;
        }
    }
}

/**
 * Combined multi-material 3MF for one or more tiles laid out along X.
 *
 * Each filament is its own independently-arrangeable object, with its black base
 * and colored wedge as two grouped parts inside it. Keeping base + color as parts
 * of one object (rather than separate objects) avoids the "objects at multiple
 * heights" merge prompt, while keeping the tiles as separate objects lets the
 * slicer auto-arrange them and print by color. An embedded Bambu/Orca project
 * (`model_settings.config` + `project_settings.config`) assigns the base to
 * extruder 1 and each filament to its own extruder with the matching colour — that
 * is what colours the parts rather than leaving them all white.
 */
export async function generateCalibration3mf(
    tiles: CalibrationTile[],
    options: CalibrationPrintOptions,
    profileFilaments: CalibrationProfileFilament[]
): Promise<Blob> {
    const baseMatId = 1;

    // Slots follow the profile order so they line up with the user's AMS/machine
    // (slot 1 = profile filament 1, etc.) — this keeps the base off slot 1, which
    // slicers reserve for the machine's active filament, and uses real filaments
    // rather than an invented phantom base.
    const slotForId = new Map<string, number>(); // filament id -> 1-based slot
    const slotColors: string[] = [];
    const slotNames: string[] = [];
    const ensureSlot = (id: string, hex: string, name: string): number => {
        let slot = slotForId.get(id);
        if (slot === undefined) {
            slot = slotColors.length + 1; // 1-based
            slotForId.set(id, slot);
            slotColors.push(normalizeHexColor(hex, '#808080'));
            slotNames.push(name);
        }
        return slot;
    };
    for (const f of profileFilaments) ensureSlot(f.id, f.color, f.name);
    // Defensive: register any tile filament missing from the profile list.
    for (const tile of tiles) {
        ensureSlot(tile.baseFilamentId, tile.baseColor, 'Base');
        ensureSlot(tile.filamentId, tile.color, tile.name);
    }

    const baseMaterialsXml = slotColors
        .map((hex, i) => `<base name="${escapeXml(slotNames[i])}" displaycolor="${to3mfColor(hex)}"/>`)
        .join('');

    // Initial Y spacing so the tile objects don't overlap before auto-arrange.
    const rowPitch = options.patchSize + options.gap * 3.5 + 4;

    let nextId = 2; // 1 is the basematerials group
    const objects: string[] = [];
    const buildItems: string[] = [];
    const settingObjects: string[] = [];
    const instances: string[] = [];

    tiles.forEach((tile, index) => {
        const { baseBoxes, colorBoxes } = buildTileGeometry(options, 0);
        const baseMesh: IndexedMesh = { vertices: [], triangles: [] };
        for (const box of baseBoxes) appendPrism(baseMesh, box);
        const colorMesh: IndexedMesh = { vertices: [], triangles: [] };
        for (const box of colorBoxes) appendPrism(colorMesh, box);
        // Center each tile on its own origin so the build-item transform places it.
        centerMeshesXY([baseMesh, colorMesh]);

        const baseSlot = ensureSlot(tile.baseFilamentId, tile.baseColor, 'Base');
        const colorSlot = ensureSlot(tile.filamentId, tile.color, tile.name);
        const baseObjId = nextId++;
        const colorObjId = nextId++;
        const tileObjId = nextId++;

        objects.push(
            `<object id="${baseObjId}" p:UUID="${generateUUID()}" type="model" pid="${baseMatId}" pindex="${baseSlot - 1}" name="Base">${meshXml(baseMesh)}</object>`
        );
        objects.push(
            `<object id="${colorObjId}" p:UUID="${generateUUID()}" type="model" pid="${baseMatId}" pindex="${colorSlot - 1}" name="${escapeXml(tile.name)}">${meshXml(colorMesh)}</object>`
        );
        // Each filament is its own object; its base + color are grouped as parts so
        // there is no "objects at multiple heights" merge prompt, while the tiles
        // stay separate objects the slicer can auto-arrange and sequence.
        objects.push(
            `<object id="${tileObjId}" p:UUID="${generateUUID()}" type="model" name="${escapeXml(tile.name)}"><components>` +
                `<component objectid="${baseObjId}" p:UUID="${generateUUID()}"/>` +
                `<component objectid="${colorObjId}" p:UUID="${generateUUID()}"/>` +
                `</components></object>`
        );

        const ty = (index * rowPitch).toFixed(3);
        buildItems.push(
            `<item objectid="${tileObjId}" p:UUID="${generateUUID()}" transform="1 0 0 0 1 0 0 0 1 0 ${ty} 0"/>`
        );

        settingObjects.push(
            ` <object id="${tileObjId}">\n` +
                `  <metadata key="name" value="${escapeXml(tile.name)}"/>\n` +
                `  <metadata key="extruder" value="${colorSlot}"/>\n` +
                `  <part id="${baseObjId}" subtype="normal_part">\n` +
                `   <metadata key="name" value="Base"/>\n` +
                `   <metadata key="extruder" value="${baseSlot}"/>\n` +
                `  </part>\n` +
                `  <part id="${colorObjId}" subtype="normal_part">\n` +
                `   <metadata key="name" value="${escapeXml(tile.name)}"/>\n` +
                `   <metadata key="extruder" value="${colorSlot}"/>\n` +
                `  </part>\n` +
                ` </object>\n`
        );
        instances.push(
            `  <model_instance>\n` +
                `   <metadata key="object_id" value="${tileObjId}"/>\n` +
                `   <metadata key="instance_id" value="0"/>\n` +
                `  </model_instance>\n`
        );
    });

    const model =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">` +
        `<metadata name="BambuStudio:3mfVersion">1</metadata>` +
        `<resources>` +
        `<basematerials id="${baseMatId}">${baseMaterialsXml}</basematerials>` +
        objects.join('') +
        `</resources>` +
        `<build p:UUID="${generateUUID()}">${buildItems.join('')}</build>` +
        `</model>`;

    // Per-object/part extruder assignment (Bambu/Orca/Creality read this for
    // colors). No <assemble> block: the tiles stay independent, arrangeable objects.
    const modelSettings =
        `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n` +
        settingObjects.join('') +
        ` <plate>\n` +
        `  <metadata key="plater_id" value="1"/>\n` +
        `  <metadata key="plater_name" value=""/>\n` +
        `  <metadata key="locked" value="false"/>\n` +
        instances.join('') +
        ` </plate>\n` +
        `</config>`;

    // Embedded slicer project: defines the filament list + colours the parts use.
    const filamentColours = slotColors;
    const filamentCount = filamentColours.length;
    const expand = <T,>(value: T, count: number): T[] => Array(count).fill(value);
    const projectSettings = {
        ...MINIMAL_PROJECT_SETTINGS,
        layer_height: options.layerHeight.toString(),
        initial_layer_print_height: Math.max(options.layerHeight, options.firstLayerHeight).toString(),
        filament_colour: filamentColours,
        filament_type: expand('PLA', filamentCount),
        filament_settings_id: expand('Generic PLA @Kromacut 0.4 nozzle', filamentCount),
        filament_vendor: expand('Generic', filamentCount),
    };

    const zip = new JSZip();
    zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
            `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
            `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
            `<Default Extension="config" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
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
    zip.file('Metadata/kromacut.config', KROMACUT_CONFIG);

    return zip.generateAsync({ type: 'blob', mimeType: 'model/3mf' });
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function to3mfColor(hex: string): string {
    const normalized = normalizeHexColor(hex, '#808080');
    return `${normalized.toUpperCase()}FF`;
}
