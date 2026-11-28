import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import JSZip from 'jszip';
import { createFlatPaintMesher, createFlatPaintSolidMesher } from '../src/lib/flatPaintMeshing.ts';
import {
    FLAT_PAINT_CARRIER_HEX,
    layoutFilamentColumns,
    type FlatPaintLayout,
} from '../src/lib/flatPaint.ts';
import type { RegionStack, RegionStackPlan, SmoothMeshingStrength } from '../src/types/index.ts';
import { loadViteModule } from './helpers/viteModule.ts';

const { buildRegionStackLayout, regionStackLabels, regionStackClasses } = await loadViteModule<
    typeof import('../src/lib/regionStacks.ts')
>('/src/lib/regionStacks.ts');

const noYieldOptions = { yieldIntervalMs: Infinity, onYield: async () => undefined };
const LAYER_HEIGHT = 0.1;
const FIRST_LAYER_HEIGHT = 0.2;
const CARRIER = 0.2;
const FOUNDATION = '#111111';

function region(
    targetHex: string,
    predictedHex: string,
    ...runs: Array<[string, number]>
): RegionStack {
    return {
        targetHex,
        usageWeight: 1,
        runs: runs.map(([filamentColor, layerCount]) => ({
            filamentId: filamentColor,
            filamentColor,
            layerCount,
        })),
        layerCount: runs.reduce((sum, [, count]) => sum + count, 0),
        predictedHex,
        deltaE: 0,
        shared: false,
    };
}

/**
 * Three regions with unrelated stacks of different heights. The red region
 * repeats the foundation above red; the white region ends in the same red
 * filament the red region does, so 3MF groups must merge across regions.
 */
const PLAN: Pick<RegionStackPlan, 'stacks' | 'layerHeight' | 'firstLayerHeight'> = {
    layerHeight: LAYER_HEIGHT,
    firstLayerHeight: FIRST_LAYER_HEIGHT,
    stacks: [
        region('#C02020', '#C42222', [FOUNDATION, 2], ['#D01C1C', 3]),
        region('#2040C0', '#1C3CC1', [FOUNDATION, 2], ['#1C3CD0', 1]),
        region(
            '#F0F0F0',
            '#EDEDED',
            [FOUNDATION, 2],
            ['#F4F4F4', 3],
            ['#D01C1C', 1],
            ['#F4F4F4', 2]
        ),
    ],
};

/**
 * 4×3 labels (0 = transparent):
 *   1 1 2 0
 *   1 3 2 2
 *   3 3 3 2
 */
const WIDTH = 4;
const HEIGHT = 3;
const LABELS = Uint16Array.from([1, 1, 2, 0, 1, 3, 2, 2, 3, 3, 3, 2]);

function stackHexes(index: number): string[] {
    return PLAN.stacks[index].runs.flatMap((run) =>
        Array.from({ length: run.layerCount }, () => run.filamentColor)
    );
}

function layout(orientation: 'relief' | 'face-up' | 'face-down'): FlatPaintLayout {
    return buildRegionStackLayout({
        plan: PLAN,
        labels: LABELS,
        orientation,
        carrierThickness: CARRIER,
    });
}

function filamentAt(result: FlatPaintLayout, pixel: number, z: number) {
    const covering = result.parts.filter(
        (part) => part.mask[pixel] === 1 && part.baseZ < z && z < part.topZ
    );
    assert.ok(covering.length <= 1, `pixel ${pixel} has overlapping parts at z=${z}`);
    return covering[0];
}

test('region labels match exact targets, fall back to the nearest one, and skip transparency', () => {
    // A 3×1 crop of a 4×1 image: red, a near-blue, transparent.
    const data = Uint8ClampedArray.from([
        0, 0, 0, 255, 0xc0, 0x20, 0x20, 255, 0x24, 0x44, 0xb8, 255, 9, 9, 9, 0,
    ]);
    const labels = regionStackLabels({
        plan: PLAN,
        data,
        imageWidth: 4,
        minX: 1,
        minY: 0,
        width: 3,
        height: 1,
    });
    assert.deepEqual([...labels], [1, 2, 0]);
});

test('two filaments with the same color stay separate 3MF objects', () => {
    const sameColor = (id: string, layerCount: number) => ({
        filamentId: id,
        filamentColor: '#EEEEEE',
        layerCount,
    });
    const plan = {
        layerHeight: LAYER_HEIGHT,
        firstLayerHeight: FIRST_LAYER_HEIGHT,
        stacks: [
            {
                ...region('#E0E0E0', '#E0E0E0', [FOUNDATION, 2]),
                runs: [
                    { filamentId: 'base', filamentColor: FOUNDATION, layerCount: 2 },
                    sameColor('white-thin', 2),
                ],
            },
            {
                ...region('#F0F0F0', '#F0F0F0', [FOUNDATION, 2]),
                runs: [
                    { filamentId: 'base', filamentColor: FOUNDATION, layerCount: 2 },
                    sameColor('white-dense', 1),
                    sameColor('white-thin', 1),
                ],
            },
        ],
    };
    const labels = Uint16Array.from([1, 2]);
    for (const orientation of ['relief', 'face-up', 'face-down'] as const) {
        const result = buildRegionStackLayout({
            plan,
            labels,
            orientation,
            carrierThickness: CARRIER,
        });
        const groups = new Set(
            result.parts
                .filter((part) => part.filamentHex === '#EEEEEE')
                .map((part) => part.exportGroup)
        );
        assert.equal(groups.size, 2, `${orientation}: one object per white filament`);
        // A run change between same-colored filaments still splits the column.
        const second = result.parts.filter(
            (part) => part.mask[1] === 1 && part.filamentHex === '#EEEEEE'
        );
        assert.equal(second.length, 2, `${orientation}: dense and thin layers stay separate parts`);
        const names = new Set(
            result.parts
                .filter((part) => part.filamentHex === '#EEEEEE')
                .map((part) => part.partName)
        );
        assert.equal(names.size, 2, `${orientation}: same-color filaments get distinct part names`);
    }
});

test('same-named same-color filaments fall back to IDs and export valid XML names', async () => {
    const { exportObjectTo3MFBlob } =
        await loadViteModule<typeof import('../src/lib/export3mf.ts')>('/src/lib/export3mf.ts');
    const white = (id: string, layerCount: number) => ({
        filamentId: id,
        filamentColor: '#EEEEEE',
        layerCount,
        filamentName: 'White & Pearl',
    });
    const base = { filamentId: 'base', filamentColor: FOUNDATION, layerCount: 2 };
    const plan = {
        layerHeight: LAYER_HEIGHT,
        firstLayerHeight: FIRST_LAYER_HEIGHT,
        stacks: [
            { ...region('#E0E0E0', '#E0E0E0', [FOUNDATION, 2]), runs: [base, white('a', 2)] },
            { ...region('#F0F0F0', '#F0F0F0', [FOUNDATION, 2]), runs: [base, white('b', 1)] },
        ],
    };
    const result = buildRegionStackLayout({
        plan,
        labels: Uint16Array.from([1, 2]),
        orientation: 'relief',
        carrierThickness: CARRIER,
    });
    const names = [...new Set(result.parts.map((part) => part.partName))].sort();
    assert.deepEqual(names, [
        'Filament (#111111)',
        'Filament (#EEEEEE, a)',
        'Filament (#EEEEEE, b)',
    ]);

    // A profile name with XML metacharacters must not break the model file.
    const unique = {
        ...plan,
        stacks: [
            plan.stacks[0],
            { ...plan.stacks[1], runs: [base, { ...white('b', 1), filamentName: 'Pearl <2>' }] },
        ],
    };
    const named = buildRegionStackLayout({
        plan: unique,
        labels: Uint16Array.from([1, 2]),
        orientation: 'relief',
        carrierThickness: CARRIER,
    });
    const meshMask = await createFlatPaintMesher(
        Uint16Array.from([1, 2]),
        2,
        1,
        0.4,
        'none',
        noYieldOptions
    );
    const root = new THREE.Group();
    for (const part of named.parts) {
        const mesh = await meshMask(part.mask, noYieldOptions);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
        geometry.setIndex(mesh.indices);
        const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
        object.userData.kromacutExportGroup = part.exportGroup;
        object.userData.kromacutFilamentHex = part.filamentHex;
        object.userData.kromacutMaterialKey = part.exportGroup;
        object.userData.kromacutPartName = part.partName;
        root.add(object);
    }
    const zip = await JSZip.loadAsync(await (await exportObjectTo3MFBlob(root)).arrayBuffer());
    const xml = await zip.file('3D/3dmodel.model')!.async('string');
    assert.ok(xml.includes('name="Filament (#EEEEEE, White &amp; Pearl)"'));
    assert.ok(xml.includes('name="Filament (#EEEEEE, Pearl &lt;2&gt;)"'));
    assert.ok(!/name="[^"]*[<&](?!amp;|lt;|gt;|quot;|apos;)/.test(xml), 'object names are escaped');

    // Profile names are user data: control characters must not reach either XML file.
    for (const object of root.children) {
        object.userData.kromacutPartName = `${object.userData.kromacutPartName}\u0001`;
    }
    const controlZip = await JSZip.loadAsync(
        await (await exportObjectTo3MFBlob(root)).arrayBuffer()
    );
    for (const file of ['3D/3dmodel.model', 'Metadata/model_settings.config']) {
        const text = await controlZip.file(file)!.async('string');
        assert.ok(!text.includes('\u0001'), `${file} has no XML-forbidden characters`);
    }
});

test('part names fall back to IDs when any tag in a color would collide', () => {
    const white = (id: string, name: string) => ({
        filamentId: id,
        filamentColor: '#EEEEEE',
        layerCount: 1,
        filamentName: name,
    });
    const base = { filamentId: 'base', filamentColor: FOUNDATION, layerCount: 2 };
    // Filament c is named "a", the ID another same-colored filament would fall back to.
    const plan = {
        layerHeight: LAYER_HEIGHT,
        firstLayerHeight: FIRST_LAYER_HEIGHT,
        stacks: ['a', 'b', 'c'].map((id, i) => ({
            ...region(`#E${i}E${i}E${i}`, '#EEEEEE', [FOUNDATION, 2]),
            runs: [base, white(id, ['Pearl', 'Pearl', 'a'][i])],
        })),
    };
    const result = buildRegionStackLayout({
        plan,
        labels: Uint16Array.from([1, 2, 3]),
        orientation: 'relief',
        carrierThickness: CARRIER,
    });
    const names = new Set(
        result.parts.filter((part) => part.filamentHex === '#EEEEEE').map((part) => part.partName)
    );
    assert.equal(names.size, 3);

    // Names that differ only by XML-forbidden characters export identically, so use IDs.
    const control = {
        ...plan,
        stacks: plan.stacks.slice(0, 2).map((entry, i) => ({
            ...entry,
            runs: [base, white(['a', 'b'][i], `Pearl${String.fromCharCode(1 + i)}`)],
        })),
    };
    const controlNames = buildRegionStackLayout({
        plan: control,
        labels: Uint16Array.from([1, 2]),
        orientation: 'relief',
        carrierThickness: CARRIER,
    })
        .parts.filter((part) => part.filamentHex === '#EEEEEE')
        .map((part) => part.partName);
    assert.deepEqual([...new Set(controlNames)].sort(), [
        'Filament (#EEEEEE, a)',
        'Filament (#EEEEEE, b)',
    ]);
});

test('targets with identical stacks share one class, label, and set of parts', () => {
    const shared = region('#808080', '#7F7F7F', [FOUNDATION, 2], ['#F4F4F4', 2]);
    const plan = {
        layerHeight: LAYER_HEIGHT,
        firstLayerHeight: FIRST_LAYER_HEIGHT,
        stacks: [shared, { ...shared, targetHex: '#828282' }, PLAN.stacks[1]],
    };
    assert.deepEqual(regionStackClasses(plan).classOf, [0, 0, 1]);

    // Filament IDs are imported text: one run of "rx1/g" is not two runs of r and g.
    const run = (filamentId: string, layerCount: number) => ({
        filamentId,
        filamentColor: '#808080',
        layerCount,
    });
    const tricky = {
        stacks: [
            { ...shared, runs: [run('r', 1), run('g', 1)] },
            { ...shared, runs: [run('rx1/g', 1)] },
        ],
    };
    assert.deepEqual(regionStackClasses(tricky).classOf, [0, 1]);
    const data = Uint8ClampedArray.from([
        0x80, 0x80, 0x80, 255, 0x82, 0x82, 0x82, 255, 0x20, 0x40, 0xc0, 255,
    ]);
    const labels = regionStackLabels({
        plan,
        data,
        imageWidth: 3,
        minX: 0,
        minY: 0,
        width: 3,
        height: 1,
    });
    assert.deepEqual([...labels], [1, 1, 2]);
    const result = buildRegionStackLayout({
        plan,
        labels,
        orientation: 'relief',
        carrierThickness: CARRIER,
    });
    assert.equal(result.classCount, 2);
});

test('relief keeps each region on the plate at its own height', () => {
    const result = layout('relief');
    const level = (j: number) => (j === 0 ? 0 : FIRST_LAYER_HEIGHT + (j - 1) * LAYER_HEIGHT);
    assert.equal(result.carrierThickness, 0);
    assert.ok(Math.abs(result.totalHeight - level(8)) < 1e-9);
    assert.ok(result.parts.every((part) => part.exportGroup.startsWith('region-stacks:filament:')));

    for (let pixel = 0; pixel < LABELS.length; pixel++) {
        const label = LABELS[pixel];
        const top = label ? stackHexes(label - 1).length : 0;
        for (let j = 0; j < 8; j++) {
            const part = filamentAt(result, pixel, (level(j) + level(j + 1)) / 2);
            if (j >= top) {
                assert.equal(part, undefined, `pixel ${pixel} should end below level ${j}`);
                continue;
            }
            assert.equal(part?.filamentHex, stackHexes(label - 1)[j], `pixel ${pixel} level ${j}`);
            if (j === top - 1) {
                assert.equal(part.kind, 'face');
                assert.equal(part.previewHex, PLAN.stacks[label - 1].predictedHex);
            }
        }
    }
});

for (const orientation of ['face-up', 'face-down'] as const) {
    test(`${orientation} Flat Paint pads region stacks into one uniform slab`, () => {
        const result = layout(orientation);
        const faceDown = orientation === 'face-down';
        const level = (j: number) =>
            faceDown
                ? CARRIER + j * LAYER_HEIGHT
                : j === 0
                  ? 0
                  : FIRST_LAYER_HEIGHT + (j - 1) * LAYER_HEIGHT;
        const tallest = 8;
        assert.ok(Math.abs(result.totalHeight - level(tallest)) < 1e-9);

        for (let pixel = 0; pixel < LABELS.length; pixel++) {
            const label = LABELS[pixel];
            if (!label) {
                assert.ok(result.parts.every((part) => part.mask[pixel] === 0));
                continue;
            }
            const hexes = stackHexes(label - 1);
            const k = hexes.length;
            if (faceDown) {
                assert.equal(
                    filamentAt(result, pixel, CARRIER / 2)?.filamentHex,
                    FLAT_PAINT_CARRIER_HEX
                );
            }
            for (let j = 0; j < tallest; j++) {
                const part = filamentAt(result, pixel, (level(j) + level(j + 1)) / 2);
                // Face-down reverses the stack behind the carrier; face-up lifts it to the top.
                const expected = faceDown
                    ? j < k
                        ? hexes[k - 1 - j]
                        : FOUNDATION
                    : j < tallest - k
                      ? FOUNDATION
                      : hexes[j - (tallest - k)];
                assert.equal(part?.filamentHex, expected, `pixel ${pixel} level ${j}`);
                const faceLevel = faceDown ? 0 : tallest - 1;
                if (j === faceLevel) {
                    assert.equal(part.kind, 'face');
                    assert.equal(part.previewHex, PLAN.stacks[label - 1].predictedHex);
                }
            }
        }
    });
}

function parseObjects(modelXml: string) {
    return Array.from(modelXml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g))
        .filter((match) => match[2].includes('<mesh>'))
        .map((match) => {
            const edges = new Map<string, number>();
            for (const triangle of match[2].matchAll(
                /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)" \/>/g
            )) {
                const [a, b, c] = [1, 2, 3].map((i) => Number(triangle[i]));
                for (const [p, q] of [
                    [a, b],
                    [b, c],
                    [c, a],
                ]) {
                    const key = p < q ? `${p}|${q}` : `${q}|${p}`;
                    edges.set(key, (edges.get(key) ?? 0) + 1);
                }
            }
            return {
                name: /name="([^"]*)"/.exec(match[1])?.[1],
                triangles: [...match[2].matchAll(/<triangle /g)].length,
                badEdges: [...edges.values()].filter((count) => count !== 2).length,
            };
        });
}

if (typeof globalThis.FileReader === 'undefined') {
    globalThis.FileReader = class {
        result: ArrayBuffer | null = null;
        onload: ((event: { target: unknown }) => void) | null = null;
        onerror: ((event: { target: unknown }) => void) | null = null;
        readAsArrayBuffer(blob: Blob) {
            void blob.arrayBuffer().then((buffer) => {
                this.result = buffer;
                this.onload?.({ target: this });
            });
        }
    } as unknown as typeof FileReader;
}

for (const orientation of ['relief', 'face-up', 'face-down'] as const) {
    for (const strength of ['none', 'medium'] as SmoothMeshingStrength[]) {
        test(`${orientation} region stacks export closed shells, one 3MF object per filament (${strength})`, async () => {
            const { exportObjectTo3MFBlob } =
                await loadViteModule<typeof import('../src/lib/export3mf.ts')>(
                    '/src/lib/export3mf.ts'
                );
            const result = layout(orientation);
            const meshMask = await createFlatPaintMesher(
                LABELS,
                WIDTH,
                HEIGHT,
                0.4,
                strength,
                noYieldOptions
            );
            const root = new THREE.Group();
            for (const part of result.parts) {
                const mesh = await meshMask(part.mask, noYieldOptions);
                for (let i = 2; i < mesh.positions.length; i += 3) {
                    mesh.positions[i] = part.baseZ + mesh.positions[i] * (part.topZ - part.baseZ);
                }
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
                geometry.setIndex(mesh.indices);
                const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
                object.userData.kromacutExportGroup = part.exportGroup;
                object.userData.kromacutFilamentHex = part.filamentHex;
                object.userData.kromacutMaterialKey = part.exportGroup;
                object.userData.kromacutPartName = part.partName;
                root.add(object);
            }

            const zip = await JSZip.loadAsync(
                await (await exportObjectTo3MFBlob(root)).arrayBuffer()
            );
            const objects = parseObjects(await zip.file('3D/3dmodel.model')!.async('string'));
            const groups = new Set(result.parts.map((part) => part.exportGroup));
            assert.equal(objects.length, groups.size, 'one object per physical filament');
            // Foundation, red, blue, white, plus the clear carrier face-down.
            assert.equal(groups.size, orientation === 'face-down' ? 5 : 4);
            for (const object of objects) {
                assert.ok(object.triangles > 0, `${object.name} should have geometry`);
                assert.equal(object.badEdges, 0, `${object.name} should be closed shells`);
            }
        });
    }
}

/** Vertical wall length per object whose back side is the same object at that height. */
function sameFilamentSeamLength(modelXml: string) {
    return Array.from(modelXml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g))
        .filter((match) => match[2].includes('<mesh>'))
        .map((match) => {
            const vertices = Array.from(
                match[2].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)" \/>/g),
                (vertex) => ({ xy: `${vertex[1]},${vertex[2]}`, z: Number(vertex[3]) })
            );
            const walls = new Map<string, Array<[number, number]>>();
            const list: Array<{ back: string; z0: number; z1: number }> = [];
            for (const triangle of match[2].matchAll(
                /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)" \/>/g
            )) {
                const points = [1, 2, 3].map((i) => vertices[Number(triangle[i])]);
                const z0 = Math.min(...points.map((point) => point.z));
                const z1 = Math.max(...points.map((point) => point.z));
                if (z0 === z1) continue;
                for (let e = 0; e < 3; e++) {
                    const a = points[e];
                    const b = points[(e + 1) % 3];
                    if (a.z !== z0 || b.z !== z0 || a.xy === b.xy) continue;
                    const key = `${a.xy}>${b.xy}`;
                    walls.set(key, [...(walls.get(key) ?? []), [z0, z1]]);
                    list.push({ back: `${b.xy}>${a.xy}`, z0, z1 });
                }
            }
            let seam = 0;
            for (const wall of list) {
                for (const [z0, z1] of walls.get(wall.back) ?? []) {
                    seam += Math.max(0, Math.min(z1, wall.z1) - Math.max(z0, wall.z0));
                }
            }
            return { name: /name="([^"]*)"/.exec(match[1])?.[1], seam };
        });
}

for (const orientation of ['relief', 'face-up', 'face-down'] as const) {
    test(`${orientation} export columns keep every pixel's filament at every height`, () => {
        const result = layout(orientation);
        const columns = layoutFilamentColumns(result.parts, WIDTH * HEIGHT);
        const groupsAt = (pixel: number, z: number) =>
            result.parts
                .filter((part) => part.mask[pixel] && part.baseZ < z && z < part.topZ)
                .map((part) => part.exportGroup)
                .sort();
        for (let band = 0; band + 1 < columns.heights.length; band++) {
            const z = (columns.heights[band] + columns.heights[band + 1]) / 2;
            for (let pixel = 0; pixel < LABELS.length; pixel++) {
                const profile = columns.profiles[pixel];
                const printed = columns.filaments
                    .filter((filament) => {
                        const runs = profile < 0 ? [] : filament.runs[profile];
                        for (let i = 0; i < runs.length; i += 2) {
                            if (runs[i] <= band && band < runs[i + 1]) return true;
                        }
                        return false;
                    })
                    .map((filament) => filament.exportGroup)
                    .sort();
                assert.deepEqual(printed, groupsAt(pixel, z), `pixel ${pixel} at z=${z}`);
            }
        }
        // Transparent pixels print nothing.
        assert.equal(columns.profiles[3], -1);
        // Runs of one filament touch only across another filament.
        for (const filament of columns.filaments) {
            for (const runs of filament.runs) {
                for (let i = 2; i < runs.length; i += 2) assert.ok(runs[i] > runs[i - 1]);
            }
        }
        // Groups keep their order, which numbers the slicer filaments.
        assert.deepEqual(
            columns.filaments.map((filament) => filament.exportGroup),
            [...new Set(result.parts.map((part) => part.exportGroup))]
        );
    });

    test(`${orientation} region stack export has no walls between same-filament regions`, async () => {
        const { exportObjectTo3MFBlob, KROMACUT_BUILD_EXPORT_MESHES } =
            await loadViteModule<typeof import('../src/lib/export3mf.ts')>('/src/lib/export3mf.ts');
        const result = layout(orientation);
        const meshMask = await createFlatPaintMesher(
            LABELS,
            WIDTH,
            HEIGHT,
            0.4,
            'medium',
            noYieldOptions
        );
        const toMeshes = async (parts: FlatPaintLayout['parts']) => {
            const meshes: THREE.Mesh[] = [];
            for (const part of parts) {
                const mesh = await meshMask(part.mask, noYieldOptions);
                for (let i = 2; i < mesh.positions.length; i += 3) {
                    mesh.positions[i] = part.baseZ + mesh.positions[i] * (part.topZ - part.baseZ);
                }
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
                geometry.setIndex(mesh.indices);
                const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
                object.userData.kromacutExportGroup = part.exportGroup;
                object.userData.kromacutFilamentHex = part.filamentHex;
                object.userData.kromacutMaterialKey = part.exportGroup;
                object.userData.kromacutPartName = part.partName;
                meshes.push(object);
            }
            return meshes;
        };
        const meshSolid = await createFlatPaintSolidMesher(
            LABELS,
            WIDTH,
            HEIGHT,
            0.4,
            'medium',
            noYieldOptions
        );
        const toSolids = async () => {
            const columns = layoutFilamentColumns(result.parts, WIDTH * HEIGHT);
            const meshes: THREE.Mesh[] = [];
            for (const filament of columns.filaments) {
                const mesh = await meshSolid(
                    { levels: columns.heights, profiles: columns.profiles, runs: filament.runs },
                    noYieldOptions
                );
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
                geometry.setIndex(mesh.indices);
                geometry.userData.kromacutExportGeometry = {
                    positions: mesh.positions,
                    indices: mesh.indices,
                };
                const object = new THREE.Mesh(geometry);
                object.userData.kromacutExportGroup = filament.exportGroup;
                object.userData.kromacutFilamentHex = filament.filamentHex;
                object.userData.kromacutMaterialKey = filament.exportGroup;
                object.userData.kromacutPartName = filament.partName;
                object.userData.kromacutPreserveVertexIndices = true;
                meshes.push(object);
            }
            return meshes;
        };
        const exportXml = async (root: THREE.Object3D) => {
            const zip = await JSZip.loadAsync(
                await (await exportObjectTo3MFBlob(root)).arrayBuffer()
            );
            return zip.file('3D/3dmodel.model')!.async('string');
        };

        // The per-class preview parts touch inside one filament object.
        const preview = new THREE.Group();
        preview.add(...(await toMeshes(result.parts)));
        const previewXml = await exportXml(preview);
        assert.ok(
            sameFilamentSeamLength(previewXml).some((object) => object.seam > 0),
            'fixture should have same-filament seams in the per-class parts'
        );

        // The model's export builder replaces them with one solid per filament.
        const root = new THREE.Group();
        root.position.set(3, -2, 0);
        root.add(...(await toMeshes(result.parts)));
        root.userData[KROMACUT_BUILD_EXPORT_MESHES] = toSolids;
        const xml = await exportXml(root);
        const objects = parseObjects(xml);
        assert.deepEqual(
            objects.map((object) => object.name),
            parseObjects(previewXml).map((object) => object.name),
            'same objects in the same filament order'
        );
        for (const object of objects) {
            assert.ok(object.triangles > 0, `${object.name} should have geometry`);
            assert.equal(object.badEdges, 0, `${object.name} should be closed shells`);
        }
        for (const object of sameFilamentSeamLength(xml)) {
            assert.equal(object.seam, 0, `${object.name} should have no internal walls`);
        }
        // No cap of an object lies on another of its caps: nothing stacks inside a filament.
        for (const match of xml.matchAll(/<object\b[^>]*>([\s\S]*?)<\/object>/g)) {
            const vertices = Array.from(
                match[1].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)" \/>/g),
                (vertex) => vertex.slice(1, 4).join(',')
            );
            const faces = new Set<string>();
            for (const triangle of match[1].matchAll(
                /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)" \/>/g
            )) {
                const face = [1, 2, 3]
                    .map((i) => vertices[Number(triangle[i])])
                    .sort()
                    .join('|');
                assert.ok(!faces.has(face), 'no coincident triangles in one object');
                faces.add(face);
            }
        }
        // Export geometry is placed like the model it replaces.
        const minX = Math.min(
            ...Array.from(xml.matchAll(/<vertex x="([^"]+)"/g), (match) => Number(match[1]))
        );
        assert.equal(minX, 3, 'root transform applies to export meshes');
    });
}

for (const strength of ['none', 'medium'] as const) {
    test(`${strength} solids joining different labels diagonally export manifold`, async () => {
        const { exportObjectTo3MFBlob } =
            await loadViteModule<typeof import('../src/lib/export3mf.ts')>('/src/lib/export3mf.ts');
        // Four labels; the diagonal pair 1 and 4 share a filament above the
        // foundation, so its solid touches itself only at the center.
        const labels = Uint16Array.from([1, 2, 3, 4]);
        const plan = {
            layerHeight: LAYER_HEIGHT,
            firstLayerHeight: FIRST_LAYER_HEIGHT,
            stacks: [
                region('#D01C1C', '#D01C1C', [FOUNDATION, 2], ['#D01C1C', 2]),
                region('#1C3CD0', '#1C3CD0', [FOUNDATION, 2], ['#1C3CD0', 2]),
                region('#1CD03C', '#1CD03C', [FOUNDATION, 2], ['#1CD03C', 2]),
                region('#C02020', '#C02020', [FOUNDATION, 2], ['#D01C1C', 2]),
            ],
        };
        const columns = layoutFilamentColumns(
            buildRegionStackLayout({
                plan,
                labels,
                orientation: 'relief',
                carrierThickness: CARRIER,
            }).parts,
            4
        );
        const red = columns.filaments.find((filament) => filament.filamentHex === '#D01C1C')!;
        assert.deepEqual(
            [...columns.profiles].map((profile) => red.runs[profile].length > 0),
            [true, false, false, true],
            'fixture should print red on the diagonal pair'
        );
        const meshSolid = await createFlatPaintSolidMesher(
            labels,
            2,
            2,
            0.4,
            strength,
            noYieldOptions
        );
        const exportXml = async (preserveVertexIndices: boolean) => {
            const root = new THREE.Group();
            for (const filament of columns.filaments) {
                const mesh = await meshSolid(
                    { levels: columns.heights, profiles: columns.profiles, runs: filament.runs },
                    noYieldOptions
                );
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
                geometry.setIndex(mesh.indices);
                geometry.userData.kromacutExportGeometry = {
                    positions: mesh.positions,
                    indices: mesh.indices,
                };
                const object = new THREE.Mesh(geometry);
                object.userData.kromacutExportGroup = filament.exportGroup;
                object.userData.kromacutFilamentHex = filament.filamentHex;
                object.userData.kromacutPartName = filament.partName;
                object.userData.kromacutPreserveVertexIndices = preserveVertexIndices;
                root.add(object);
            }
            const zip = await JSZip.loadAsync(
                await (await exportObjectTo3MFBlob(root)).arrayBuffer()
            );
            return zip.file('3D/3dmodel.model')!.async('string');
        };

        // Each side of the contact keeps its own vertex through the export.
        const objects = parseObjects(await exportXml(true));
        assert.equal(objects.length, 4);
        for (const object of objects) {
            assert.ok(object.triangles > 0, `${object.name} should have geometry`);
            assert.equal(object.badEdges, 0, `${object.name} should be a manifold closed shell`);
        }
        // Re-welding by coordinate pinches the solid into four walls on one edge.
        assert.ok(
            parseObjects(await exportXml(false)).some((object) => object.badEdges > 0),
            'coordinate welding should pinch the diagonal solid'
        );
    });
}
