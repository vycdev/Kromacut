import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import * as THREE from 'three';
import JSZip from 'jszip';
import { createServer } from 'vite';
import {
    buildFlatPaintLayout,
    heightMapToFlatPaintLayerCounts,
    heightMapToLayerCounts,
    FLAT_PAINT_CARRIER_GROUP,
    FLAT_PAINT_CARRIER_HEX,
    type FlatPaintLayout,
    type FlatPaintPart,
} from '../src/lib/flatPaint.ts';
import { generateGreedyMesh, type MeshData } from '../src/lib/meshing.ts';
import { exportObjectToStlBlob } from '../src/lib/exportStl.ts';
import { inspectMeshIntegrity, type MeshIntegrityReport } from './meshDiagnostics.ts';

type Export3mfModule = typeof import('../src/lib/export3mf.ts');

let export3mfModule: Promise<Export3mfModule> | null = null;

async function loadExport3mfModule(): Promise<Export3mfModule> {
    export3mfModule ??= loadViteModule<Export3mfModule>('/src/lib/export3mf.ts');

    return export3mfModule;
}

async function loadViteModule<T>(modulePath: string): Promise<T> {
    const server = await createServer({
        appType: 'custom',
        cacheDir: 'dist/.vite-test-cache',
        configFile: false,
        logLevel: 'error',
        optimizeDeps: {
            noDiscovery: true,
        },
        resolve: {
            alias: {
                '@': resolve(process.cwd(), 'src'),
            },
        },
        root: process.cwd(),
        server: {
            hmr: false,
            middlewareMode: true,
        },
    });

    try {
        return (await server.ssrLoadModule(modulePath)) as T;
    } finally {
        await server.close();
    }
}

const noYieldOptions = {
    yieldIntervalMs: Infinity,
    onYield: async () => undefined,
};

class NodeFileReader {
    error: Error | null = null;
    onerror: ((event: { target: NodeFileReader }) => void) | null = null;
    onload: ((event: { target: NodeFileReader }) => void) | null = null;
    result: ArrayBuffer | null = null;

    readAsArrayBuffer(blob: Blob) {
        void blob
            .arrayBuffer()
            .then((buffer) => {
                this.result = buffer;
                this.onload?.({ target: this });
            })
            .catch((error: unknown) => {
                this.error = error instanceof Error ? error : new Error(String(error));
                this.onerror?.({ target: this });
            });
    }
}

function installFileReaderPolyfill() {
    if (typeof globalThis.FileReader === 'undefined') {
        globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;
    }
}

function reportForMessage(report: MeshIntegrityReport) {
    return JSON.stringify(
        {
            vertexCount: report.vertexCount,
            triangleCount: report.triangleCount,
            boundaryEdgeCount: report.boundaryEdgeCount,
            nonManifoldEdgeCount: report.nonManifoldEdgeCount,
            inconsistentWindingEdgeCount: report.inconsistentWindingEdgeCount,
            signedVolume: report.signedVolume,
            bounds: report.bounds,
        },
        null,
        2
    );
}

function assertHealthyMesh(label: string, mesh: MeshData) {
    const report = inspectMeshIntegrity(mesh);

    assert.ok(report.vertexCount > 0, `${label} should contain vertices`);
    assert.ok(report.triangleCount > 0, `${label} should contain triangles`);
    assert.equal(report.isValid, true, `${label} integrity failed:\n${reportForMessage(report)}`);

    return report;
}

/**
 * Shared fixture: 3×2 oriented layer-count grid with one transparent pixel.
 *
 *   counts = [1, 2, 3,
 *             3, 0, 2]
 *
 * Stack: 3 layers at 0.1mm under a 0.2mm carrier. Layers 0 and 1 use the
 * same physical filament (#000000) so reversed columns must merge them.
 */
const FIXTURE = {
    width: 3,
    height: 2,
    layerCount: 3,
    layerHeight: 0.1,
    carrierThickness: 0.2,
    layerCounts: Uint16Array.from([1, 2, 3, 3, 0, 2]),
    layerVirtualHexes: ['#101010', '#808080', '#F0F0F0'],
    layerFilamentHexes: ['#000000', '#000000', '#FFFFFF'],
};

function buildFixtureLayout(): FlatPaintLayout {
    return buildFlatPaintLayout({ ...FIXTURE });
}

function partsCoveringPixel(layout: FlatPaintLayout, pixelIndex: number) {
    return layout.parts
        .filter((part) => part.mask[pixelIndex] === 1)
        .sort((a, b) => a.baseZ - b.baseZ);
}

test('heightMapToLayerCounts matches the layer mask activation rule', () => {
    const cumulativeHeights = [0.2, 0.3, 0.4];
    const heightMap = Float32Array.from([0.2, 0.3, 0.4, 0.4, 0, 0.3]);

    const counts = heightMapToLayerCounts(heightMap, cumulativeHeights);

    assert.deepEqual(Array.from(counts), [1, 2, 3, 3, 0, 2]);
});

test('heightMapToLayerCounts tolerates float noise near layer boundaries', () => {
    const cumulativeHeights = [0.2, 0.3, 0.4];
    const heightMap = Float32Array.from([0.3999, 0.2995, 0.35, 0.05]);

    const counts = heightMapToLayerCounts(heightMap, cumulativeHeights);

    // 0.3999 + eps reaches 0.4; 0.2995 + eps reaches 0.3; 0.35 stays at 2
    // layers; tiny positive heights still get the mandatory first layer.
    assert.deepEqual(Array.from(counts), [3, 2, 2, 1]);
});

test('heightMapToFlatPaintLayerCounts lets the carrier absorb the thick first layer', () => {
    const normalCumulativeHeights = [0.2, 0.32, 0.44];
    const heightMap = Float32Array.from([0.2, 0.31, 0.32, 0.44, 0]);

    const counts = heightMapToFlatPaintLayerCounts(heightMap, normalCumulativeHeights, 0.12);

    // The first colored Flat Paint layer is a regular 0.12mm image slab behind
    // the 0.20mm carrier, so thresholds shift down by 0.08mm.
    assert.deepEqual(Array.from(counts), [1, 1, 2, 3, 0]);
});

test('Flat Paint layout tiles every opaque pixel column without gaps or overlaps', () => {
    const layout = buildFixtureLayout();

    assert.equal(layout.totalHeight, FIXTURE.carrierThickness + 3 * FIXTURE.layerHeight);
    assert.equal(layout.classCount, 3);

    for (let pixel = 0; pixel < FIXTURE.width * FIXTURE.height; pixel++) {
        const covering = partsCoveringPixel(layout, pixel);

        if (FIXTURE.layerCounts[pixel] === 0) {
            assert.equal(covering.length, 0, `transparent pixel ${pixel} should have no parts`);
            continue;
        }

        assert.ok(covering.length > 0, `pixel ${pixel} should be covered`);
        assert.equal(covering[0].baseZ, 0, `pixel ${pixel} column should start at the plate`);

        let z = 0;
        for (const part of covering) {
            assert.ok(
                Math.abs(part.baseZ - z) < 1e-9,
                `pixel ${pixel} has a gap/overlap at ${z} (part ${part.kind} starts at ${part.baseZ})`
            );
            z = part.topZ;
        }
        assert.ok(
            Math.abs(z - layout.totalHeight) < 1e-9,
            `pixel ${pixel} column should reach the slab top (got ${z})`
        );
    }
});

test('Flat Paint layout reverses columns: visible blend at the plate, foundation behind', () => {
    const layout = buildFixtureLayout();

    const expectColumn = (
        pixel: number,
        expected: Array<Pick<FlatPaintPart, 'kind' | 'previewHex' | 'filamentHex'> & {
            baseZ: number;
            topZ: number;
        }>
    ) => {
        const covering = partsCoveringPixel(layout, pixel).map((part) => ({
            kind: part.kind,
            previewHex: part.previewHex,
            filamentHex: part.filamentHex,
            baseZ: Number(part.baseZ.toFixed(6)),
            topZ: Number(part.topZ.toFixed(6)),
        }));
        assert.deepEqual(covering, expected, `pixel ${pixel} column mismatch`);
    };

    // Class 1 (single dark layer): face shows the layer-0 blend, backing fills.
    expectColumn(0, [
        {
            kind: 'carrier',
            previewHex: FLAT_PAINT_CARRIER_HEX,
            filamentHex: FLAT_PAINT_CARRIER_HEX,
            baseZ: 0,
            topZ: 0.2,
        },
        { kind: 'face', previewHex: '#101010', filamentHex: '#000000', baseZ: 0.2, topZ: 0.3 },
        { kind: 'backing', previewHex: '#000000', filamentHex: '#000000', baseZ: 0.3, topZ: 0.5 },
    ]);

    // Class 2: face = layer-1 blend, then reversed layer 0, then backing.
    expectColumn(1, [
        {
            kind: 'carrier',
            previewHex: FLAT_PAINT_CARRIER_HEX,
            filamentHex: FLAT_PAINT_CARRIER_HEX,
            baseZ: 0,
            topZ: 0.2,
        },
        { kind: 'face', previewHex: '#808080', filamentHex: '#000000', baseZ: 0.2, topZ: 0.3 },
        { kind: 'zone', previewHex: '#000000', filamentHex: '#000000', baseZ: 0.3, topZ: 0.4 },
        { kind: 'backing', previewHex: '#000000', filamentHex: '#000000', baseZ: 0.4, topZ: 0.5 },
    ]);

    // Class 3 (full column): face = layer-2 blend; reversed layers 1 and 0
    // share a filament so they must merge into ONE zone box; no backing.
    expectColumn(2, [
        {
            kind: 'carrier',
            previewHex: FLAT_PAINT_CARRIER_HEX,
            filamentHex: FLAT_PAINT_CARRIER_HEX,
            baseZ: 0,
            topZ: 0.2,
        },
        { kind: 'face', previewHex: '#F0F0F0', filamentHex: '#FFFFFF', baseZ: 0.2, topZ: 0.3 },
        { kind: 'zone', previewHex: '#000000', filamentHex: '#000000', baseZ: 0.3, topZ: 0.5 },
    ]);
});

test('Flat Paint layout trims trailing stack layers no pixel reaches', () => {
    // The auto-paint stack can overshoot: here it declares 4 layers but the
    // tallest column only uses 2. The slab must stop at carrier + 2 layers
    // instead of padding backing up to the phantom layers.
    const layout = buildFlatPaintLayout({
        width: 2,
        height: 1,
        layerCount: 4,
        layerHeight: 0.1,
        carrierThickness: 0.2,
        layerCounts: Uint16Array.from([1, 2]),
        layerVirtualHexes: ['#101010', '#808080', '#C0C0C0', '#F0F0F0'],
        layerFilamentHexes: ['#000000', '#FFFFFF', '#FFFFFF', '#FFFFFF'],
    });

    assert.equal(layout.totalHeight, 0.2 + 2 * 0.1);

    const backings = layout.parts.filter((part) => part.kind === 'backing');
    assert.equal(backings.length, 1, 'only the short column should get backing');
    assert.equal(backings[0].classIndex, 1);
    assert.equal(Number(backings[0].topZ.toFixed(6)), 0.4);

    for (const part of layout.parts) {
        assert.ok(
            part.topZ <= layout.totalHeight + 1e-9,
            `${part.kind} part should not exceed the trimmed slab top`
        );
    }
});

test('Flat Paint carrier consumes the first layer while image slabs stay regular height', () => {
    const layout = buildFlatPaintLayout({
        width: 1,
        height: 1,
        layerCount: 2,
        layerHeight: 0.12,
        carrierThickness: 0.2,
        layerCounts: Uint16Array.from([1]),
        layerVirtualHexes: ['#222222', '#EEEEEE'],
        layerFilamentHexes: ['#000000', '#FFFFFF'],
    });

    const carrier = layout.parts.find((part) => part.kind === 'carrier');
    const face = layout.parts.find((part) => part.kind === 'face');

    assert.equal(Number(carrier?.baseZ.toFixed(6)), 0);
    assert.equal(Number(carrier?.topZ.toFixed(6)), 0.2);
    assert.equal(Number(face?.baseZ.toFixed(6)), 0.2);
    assert.equal(Number(face?.topZ.toFixed(6)), 0.32);
    assert.equal(Number(layout.totalHeight.toFixed(6)), 0.32);
});

test('Flat Paint layout groups parts by physical filament for export', () => {
    const layout = buildFixtureLayout();

    const groups = new Set(layout.parts.map((part) => part.exportGroup));
    assert.deepEqual(
        Array.from(groups).sort(),
        [
            FLAT_PAINT_CARRIER_GROUP,
            'flat-paint:filament:#000000',
            'flat-paint:filament:#FFFFFF',
        ].sort()
    );

    for (const part of layout.parts) {
        if (part.kind === 'carrier') continue;
        assert.equal(
            part.exportGroup,
            `flat-paint:filament:${part.filamentHex}`,
            'non-carrier parts should group by their physical filament'
        );
    }
});

test('Flat Paint part masks produce manifold greedy meshes', async () => {
    const layout = buildFixtureLayout();

    for (const [index, part] of layout.parts.entries()) {
        const mesh = await generateGreedyMesh(
            part.mask,
            FIXTURE.width,
            FIXTURE.height,
            part.topZ - part.baseZ,
            part.baseZ,
            0.1,
            1,
            noYieldOptions
        );
        assertHealthyMesh(`Flat Paint part ${index} (${part.kind})`, mesh);
    }
});

async function buildFixturePartMeshes() {
    const layout = buildFixtureLayout();
    const pixelSize = 0.1;
    const root = new THREE.Group();

    for (const part of layout.parts) {
        const meshData = await generateGreedyMesh(
            part.mask,
            FIXTURE.width,
            FIXTURE.height,
            part.topZ - part.baseZ,
            part.baseZ,
            pixelSize,
            1,
            noYieldOptions
        );
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
        geometry.setIndex(meshData.indices);
        geometry.userData.kromacutExportGeometry = {
            positions: meshData.positions,
            indices: meshData.indices,
            activePixels: part.mask,
            width: FIXTURE.width,
            height: FIXTURE.height,
            pixelSize,
            topZ: part.topZ,
            compactHeightfield: true,
        };

        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({ color: Number.parseInt(part.previewHex.slice(1), 16) })
        );
        mesh.userData.kromacutExportGroup = part.exportGroup;
        mesh.userData.kromacutFilamentHex = part.filamentHex;
        mesh.userData.kromacutMaterialKey = part.exportGroup;
        mesh.userData.kromacutPartName = part.partName;
        root.add(mesh);
    }

    return { layout, root };
}

test('Flat Paint parts compact into a manifold uniform-height STL slab', async () => {
    const { layout, root } = await buildFixturePartMeshes();

    const blob = await exportObjectToStlBlob(root);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const triangleCount = view.getUint32(80, true);

    const positions = new Float32Array(triangleCount * 9);
    const indices: number[] = new Array(triangleCount * 3);
    let offset = 84;
    let positionOffset = 0;
    for (let triangle = 0; triangle < triangleCount; triangle++) {
        offset += 12;
        for (let vertex = 0; vertex < 3; vertex++) {
            const vertexIndex = triangle * 3 + vertex;
            positions[positionOffset++] = view.getFloat32(offset, true);
            positions[positionOffset++] = view.getFloat32(offset + 4, true);
            positions[positionOffset++] = view.getFloat32(offset + 8, true);
            indices[vertexIndex] = vertexIndex;
            offset += 12;
        }
        offset += 2;
    }
    assert.equal(offset, buffer.byteLength, 'STL parser should consume the whole binary file');

    const report = assertHealthyMesh('Flat Paint compact STL slab', { positions, indices });

    assert.ok(report.bounds, 'compact STL slab should have bounds');
    assert.ok(
        Math.abs(report.bounds!.maxZ - layout.totalHeight) < 1e-5,
        `slab should be uniformly ${layout.totalHeight}mm tall (got ${report.bounds!.maxZ})`
    );
    assert.equal(report.bounds!.minZ, 0, 'slab should start at the plate');
});

function getAttribute(source: string, name: string) {
    const match = new RegExp(`${name}="([^"]*)"`).exec(source);
    return match?.[1] ?? '';
}

interface ParsedExportObject {
    id: string;
    name: string;
    materialIndex: number;
    triangleCount: number;
    badEdgeCount: number;
}

function parse3mfMeshObjects(modelXml: string): ParsedExportObject[] {
    const objects: ParsedExportObject[] = [];
    const objectPattern = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;

    for (const match of modelXml.matchAll(objectPattern)) {
        const body = match[2];
        if (!body.includes('<mesh>')) continue;

        const edges = new Map<string, number>();
        const addEdge = (a: number, b: number) => {
            const key = a < b ? `${a}|${b}` : `${b}|${a}`;
            edges.set(key, (edges.get(key) ?? 0) + 1);
        };

        let triangleCount = 0;
        const trianglePattern = /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)" \/>/g;
        for (const triangleMatch of body.matchAll(trianglePattern)) {
            const a = Number(triangleMatch[1]);
            const b = Number(triangleMatch[2]);
            const c = Number(triangleMatch[3]);
            addEdge(a, b);
            addEdge(b, c);
            addEdge(c, a);
            triangleCount++;
        }

        let badEdgeCount = 0;
        for (const count of edges.values()) {
            if (count !== 2) badEdgeCount++;
        }

        objects.push({
            id: getAttribute(match[1], 'id'),
            name: getAttribute(match[1], 'name'),
            materialIndex: Number(getAttribute(match[1], 'pindex')),
            triangleCount,
            badEdgeCount,
        });
    }

    return objects;
}

test('3MF export merges Flat Paint parts into one object per filament', async () => {
    installFileReaderPolyfill();
    const { exportObjectTo3MFBlob } = await loadExport3mfModule();
    const { layout, root } = await buildFixturePartMeshes();

    const blob = await exportObjectTo3MFBlob(root);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const modelFile = zip.file('3D/3dmodel.model');
    const settingsFile = zip.file('Metadata/model_settings.config');
    const projectFile = zip.file('Metadata/project_settings.config');
    assert.ok(modelFile && settingsFile && projectFile, '3MF archive should contain model files');

    const modelXml = await modelFile.async('string');
    const modelSettingsXml = await settingsFile.async('string');
    const projectSettings = JSON.parse(await projectFile.async('string')) as {
        filament_colour: string[];
    };

    const objects = parse3mfMeshObjects(modelXml);
    const distinctGroups = new Set(layout.parts.map((part) => part.exportGroup));

    assert.equal(
        objects.length,
        distinctGroups.size,
        '3MF should contain exactly one object per Flat Paint filament group'
    );

    // Group order follows part build order: carrier first, then filaments.
    assert.deepEqual(
        objects.map((object) => object.name),
        [
            'Flat Paint transparent carrier (use clear filament)',
            'Flat Paint filament (#000000)',
            'Flat Paint filament (#FFFFFF)',
        ]
    );

    // Base materials hold physical filament colors. The clear carrier has its
    // own material slot so slicers do not merge it with a real white filament.
    const baseMaterials = Array.from(
        modelXml.matchAll(/<base name="([0-9A-F]{6})"/g),
        (m) => m[1]
    );
    assert.deepEqual(baseMaterials, ['D8FFF8', '000000', 'FFFFFF']);
    assert.deepEqual(
        objects.map((object) => object.materialIndex),
        [0, 1, 2],
        'objects should reference their filament material'
    );
    assert.deepEqual(projectSettings.filament_colour, ['#D8FFF8', '#000000', '#FFFFFF']);

    // Slicer metadata: one part entry per object with matching extruders.
    const partExtruders = Array.from(
        modelSettingsXml.matchAll(
            /<part\b[^>]*id="(\d+)"[^>]*>[\s\S]*?<metadata key="extruder" value="(\d+)"/g
        ),
        (m) => [m[1], Number(m[2])] as const
    );
    assert.deepEqual(
        partExtruders.map(([, extruder]) => extruder),
        [1, 2, 3],
        'extruders should map to filament materials (1-based)'
    );
    assert.deepEqual(
        partExtruders.map(([id]) => id),
        objects.map((object) => object.id),
        'slicer metadata should describe every exported object'
    );

    // Every merged object keeps its member shells closed (all edges used twice).
    for (const object of objects) {
        assert.ok(object.triangleCount > 0, `${object.name} should contain triangles`);
        assert.equal(
            object.badEdgeCount,
            0,
            `${object.name} should consist of closed shells (bad edges found)`
        );
    }
});
