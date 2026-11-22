import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import JSZip from 'jszip';
import type { MultiHeadMeshPart } from '../src/lib/multiHeadGeometry.ts';
import { buildMultiHeadSchedule } from '../src/lib/multiHeadSchedule.ts';
import { applyPreviewColorMode } from '../src/lib/previewColorMode.ts';
import type { MeshData } from '../src/lib/meshing.ts';
import { inspectMeshIntegrity } from './meshDiagnostics.ts';
import { multiHeadFixture } from './helpers/multiHeadFixture.ts';
import { withViteTestServer } from './helpers/viteModule.ts';
import { createFlatPaintMesher } from '../src/lib/flatPaintMeshing.ts';

const {
    generateMultiHeadMeshes,
    getMultiHeadRoutingPlan,
    multiHeadBuildSnapshot,
    multiHeadExportOptions,
    resolveNozzleIndex,
} = await withViteTestServer(async (server) => ({
    ...((await server.ssrLoadModule(
        '/src/lib/multiHeadBuild.ts'
    )) as typeof import('../src/lib/multiHeadBuild.ts')),
    ...((await server.ssrLoadModule(
        '/src/lib/multiHeadGeometry.ts'
    )) as typeof import('../src/lib/multiHeadGeometry.ts')),
}));

function inputPixels(colors: string[], rows: string[]) {
    const data = new Uint8ClampedArray(rows.length * rows[0].length * 4);
    for (const [i, value] of [...rows.join('')].entries()) {
        if (value === '.') continue;
        const hex = parseInt(colors[Number(value)].slice(1), 16);
        data.set([hex >> 16, (hex >> 8) & 255, hex & 255, 255], i * 4);
    }
    return data;
}

function sourceMesh(mesh: THREE.Mesh): MeshData {
    return mesh.geometry.userData.kromacutExportGeometry as MeshData;
}

function assertHealthy(mesh: MeshData, context: string) {
    const report = inspectMeshIntegrity(mesh);
    assert.equal(report.isValid, true, `${context}: ${JSON.stringify(report)}`);
}

function trianglesAtPrintPrecision(mesh: MeshData) {
    const vertices = Array.from({ length: mesh.positions.length / 3 }, (_, i) =>
        [0, 1, 2].map((axis) => Math.round(mesh.positions[i * 3 + axis] * 100_000)).join(',')
    );
    return Array.from({ length: mesh.indices.length / 3 }, (_, i) =>
        mesh.indices
            .slice(i * 3, i * 3 + 3)
            .map((index) => vertices[index])
            .sort()
            .join('|')
    ).sort();
}

function topBoundaryEdges(mesh: MeshData) {
    let top = -Infinity;
    for (let i = 2; i < mesh.positions.length; i += 3) top = Math.max(top, mesh.positions[i]);
    const edges = new Map<string, number>();
    for (let i = 0; i < mesh.indices.length; i += 3) {
        const vertices = mesh.indices.slice(i, i + 3);
        if (vertices.some((index) => mesh.positions[index * 3 + 2] !== top)) continue;
        const keys = vertices.map((index) =>
            [0, 1].map((axis) => Math.round(mesh.positions[index * 3 + axis] * 100_000)).join(',')
        );
        for (let edge = 0; edge < 3; edge++) {
            const key = [keys[edge], keys[(edge + 1) % 3]].sort().join('|');
            edges.set(key, (edges.get(key) ?? 0) + 1);
        }
    }
    return new Set([...edges].filter(([, count]) => count === 1).map(([edge]) => edge));
}

function parseObjects(xml: string) {
    return [...xml.matchAll(/<object\b([^>]+)>([\s\S]*?)<\/object>/g)]
        .filter(([, , body]) => body.includes('<mesh>'))
        .map(([, attributes, body]) => ({
            id: attributes.match(/\bid="(\d+)"/)![1],
            color: Number(attributes.match(/\bpindex="(\d+)"/)![1]),
            mesh: {
                positions: Float32Array.from(
                    [...body.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].flatMap(
                        ([, x, y, z]) => [Number(x), Number(y), Number(z)]
                    )
                ),
                indices: [...body.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].flatMap(
                    ([, a, b, c]) => [Number(a), Number(b), Number(c)]
                ),
            },
        }));
}

/** Which closed extrusions own a source pixel's center on a particular layer? */
function coversPixel(mesh: MeshData, x: number, y: number) {
    const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
    for (let i = 0; i < mesh.indices.length; i += 3) {
        const [a, b, c] = mesh.indices.slice(i, i + 3).map((index) => index * 3);
        if (
            mesh.positions[a + 2] !== mesh.positions[b + 2] ||
            mesh.positions[a + 2] !== mesh.positions[c + 2]
        )
            continue;
        const ax = mesh.positions[a],
            ay = mesh.positions[a + 1];
        const bx = mesh.positions[b],
            by = mesh.positions[b + 1];
        const cx = mesh.positions[c],
            cy = mesh.positions[c + 1];
        const winding = Math.sign(cross(bx - ax, by - ay, cx - ax, cy - ay));
        if (winding === 0) continue;
        if (
            winding * cross(bx - ax, by - ay, x - ax, y - ay) >= -1e-9 &&
            winding * cross(cx - bx, cy - by, x - bx, y - by) >= -1e-9 &&
            winding * cross(ax - cx, ay - cy, x - cx, y - cy) >= -1e-9
        )
            return true;
    }
    return false;
}

test('multi-head snapshot routes successful analysis and falls back only for missing or unusable plans', () => {
    const { state, result } = multiHeadFixture();
    const built = multiHeadBuildSnapshot(state, result);
    const plan = getMultiHeadRoutingPlan(built);
    assert.ok(plan);
    assert.equal(built.multiHeadMode, true);
    assert.equal(resolveNozzleIndex(plan, 0, 0), 1, 'pre-window range');
    assert.equal(resolveNozzleIndex(plan, 0, 1), 2, 'window A on head 2');
    assert.equal(resolveNozzleIndex(plan, 1, 1), 1, 'window B on head 1');
    assert.equal(resolveNozzleIndex(plan, 2, 4), 1, 'gap range');
    assert.equal(resolveNozzleIndex(plan, 2, 5), 2, 'later window C on head 2');
    assert.equal(resolveNozzleIndex(plan, 3, 5), 1, 'later window D on head 1');
    assert.equal(resolveNozzleIndex(plan, 0, 7), 1, 'post-window range');
    assert.equal(
        resolveNozzleIndex(plan, 3, 0),
        undefined,
        'no guessed head for an unloaded filament'
    );
    for (const invalid of [
        null,
        { ...result, windows: [] },
        { ...result, nozzleAssignments: [] },
        { ...result, nonWindowedRanges: [] },
    ]) {
        const fallback = multiHeadBuildSnapshot(state, invalid);
        assert.equal(fallback.multiHeadMode, false);
        assert.equal(fallback.autoPaintResult, state.autoPaintResult);
        assert.equal(fallback.autoPaintFilamentSwatches, state.autoPaintFilamentSwatches);
        assert.equal(fallback.patchedSliceData, undefined);
        assert.deepEqual(multiHeadExportOptions(getMultiHeadRoutingPlan(fallback)), {});
    }
    assert.equal(
        multiHeadBuildSnapshot({ ...state, flatPaint: true }, result).multiHeadMode,
        false
    );
});

for (const strength of ['none', 'minimal', 'medium', 'aggressive'] as const) {
    for (const pixelSize of [0.01, 0.4]) {
        test(`multi-head ${strength}, ${pixelSize} mm: preview regions, physical export, heads, pauses, and topology agree`, async () => {
            const { state, result, colors, layers } = multiHeadFixture();
            const built = multiHeadBuildSnapshot(state, result);
            const plan = getMultiHeadRoutingPlan(built)!;
            const rows = ['0101', '1010', '01.1', '10.0'];
            const width = rows[0].length,
                height = rows.length;
            const data = inputPixels(colors, rows);
            const pixelHeights = Float32Array.from([...rows.join('')], (value, i) =>
                value === '.'
                    ? 0
                    : layers[i % 5 === 0 ? 2 : 7].startZ + layers[i % 5 === 0 ? 2 : 7].thickness
            );
            const parts: MultiHeadMeshPart[] = [];
            for await (const part of generateMultiHeadMeshes({
                plan,
                data,
                imageWidth: width,
                minX: 0,
                minY: 0,
                width,
                height,
                pixelHeights,
                pixelSize,
                heightScale: 1,
                strength,
                yieldIntervalMs: Infinity,
                onYield: async () => {},
            }))
                parts.push(part);
            const root = new THREE.Group();
            root.add(...parts.map((part) => part.mesh));
            const schedule = buildMultiHeadSchedule(plan)!;
            const activeEvent = (layer: number) =>
                schedule.findLast((event) => event.startLayer <= layer + 1)!;
            for (const part of parts) {
                assertHealthy(sourceMesh(part.mesh), `preview layer ${part.layerIndex}`);
                const nozzle = part.mesh.userData.nozzleIndex as number;
                assert.equal(
                    part.mesh.userData.kromacutFilamentHex,
                    activeEvent(part.layerIndex).nozzles[nozzle - 1].filamentHex
                );
                assert.equal(
                    (part.mesh.material as THREE.MeshStandardMaterial).color
                        .getHexString()
                        .toUpperCase(),
                    part.mesh.userData.kromacutPreviewVirtualHex.slice(1).toUpperCase()
                );
            }
            await withViteTestServer(async (server) => {
                const { exportObjectTo3MFBlob } = (await server.ssrLoadModule(
                    '/src/lib/export3mf.ts'
                )) as typeof import('../src/lib/export3mf.ts');
                const options = {
                    ...multiHeadExportOptions(plan),
                    layerHeight: built.layerHeight,
                    firstLayerHeight: built.slicerFirstLayerHeight,
                    smoothMeshingStrength: strength,
                    layerFilamentColors: built.autoPaintFilamentSwatches?.map(
                        (swatch) => swatch.hex
                    ),
                };
                const zip = await JSZip.loadAsync(
                    await (await exportObjectTo3MFBlob(root, options)).arrayBuffer()
                );
                const model = await zip.file('3D/3dmodel.model')!.async('string');
                const settings = await zip.file('Metadata/model_settings.config')!.async('string');
                const project = JSON.parse(
                    await zip.file('Metadata/project_settings.config')!.async('string')
                );
                const objects = parseObjects(model);
                assert.equal(
                    objects.length,
                    parts.length,
                    'retain every physical layer/region and its smoothed geometry'
                );
                const materials = [...model.matchAll(/<base name="([0-9A-F]+)"/g)].map(
                    (match) => '#' + match[1]
                );
                const extruders = new Map(
                    [
                        ...settings.matchAll(
                            /<part id="(\d+)"[\s\S]*?<metadata key="extruder" value="(\d+)"/g
                        ),
                    ].map(([, id, head]) => [id, Number(head)])
                );
                assert.equal(project.nozzle_diameter.length, state.multiHeadCount);
                assert.deepEqual(project.filament_map, ['1', '2', '3']);
                assert.equal(project.filament_map_mode, 'Manual');
                const pauses = await zip
                    .file('Metadata/custom_gcode_per_layer.xml')!
                    .async('string');
                const pauseLayers = [
                    ...pauses.matchAll(
                        /<layer top_z="([^"]+)"[^>]*extra="Swap heads \(layer (\d+)\)" gcode="M600"/g
                    ),
                ];
                const expectedSwaps = schedule.filter(
                    (event) => !event.isPrePrint && event.swapCount > 0
                );
                assert.deepEqual(
                    pauseLayers.map((match) => Number(match[2])),
                    expectedSwaps.map((event) => event.startLayer)
                );
                assert.deepEqual(
                    pauseLayers.map((match) => Number(match[1])),
                    expectedSwaps.map((event) =>
                        Number(
                            (
                                built.slicerFirstLayerHeight +
                                (event.startLayer - 1) * built.layerHeight
                            ).toFixed(5)
                        )
                    )
                );
                for (const [i, object] of objects.entries()) {
                    const part = parts[i];
                    assertHealthy(object.mesh, `export layer ${part.layerIndex}`);
                    assert.equal(extruders.get(object.id), part.mesh.userData.nozzleIndex);
                    assert.equal(materials[object.color], part.mesh.userData.kromacutFilamentHex);
                    assert.deepEqual(
                        trianglesAtPrintPrecision(object.mesh),
                        trianglesAtPrintPrecision(sourceMesh(part.mesh)),
                        'export must preserve every preview triangle at print precision'
                    );
                }
                // Check actual occupied cells in both preview and the re-read
                // archive, not just agreement between two metadata fields.
                for (let layer = 0; layer < layers.length; layer++) {
                    for (let y = 0; y < height; y++)
                        for (let x = 0; x < width; x++) {
                            const source = y * width + x;
                            const px = (x + 0.5) * pixelSize,
                                py = (height - y - 0.5) * pixelSize;
                            const expected =
                                data[source * 4 + 3] > 0 &&
                                pixelHeights[source] >=
                                    layers[layer].startZ + layers[layer].thickness - 1e-6;
                            const indices = parts.flatMap((part, i) =>
                                part.layerIndex === layer &&
                                coversPixel(sourceMesh(part.mesh), px, py)
                                    ? [i]
                                    : []
                            );
                            assert.equal(
                                indices.length,
                                expected ? 1 : 0,
                                `pixel (${x},${y}), layer ${layer}`
                            );
                            if (!expected) continue;
                            const hex = colors[Number(rows[y][x])];
                            const filament =
                                state.filaments[result.colorLayerFilaments.get(hex)![layer]];
                            const i = indices[0];
                            assert.equal(
                                parts[i].mesh.userData.kromacutFilamentHex,
                                filament.color
                            );
                            assert.equal(
                                parts[i].mesh.userData.kromacutPreviewVirtualHex,
                                plan.perColorLayerColors.get(hex)![layer]
                            );
                            assert.ok(coversPixel(objects[i].mesh, px, py));
                            assert.equal(materials[objects[i].color], filament.color);
                            assert.equal(
                                activeEvent(layer).nozzles[extruders.get(objects[i].id)! - 1]
                                    .filamentId,
                                filament.id
                            );
                        }
                }
                applyPreviewColorMode(root, 'physical');
                const physicalZip = await JSZip.loadAsync(
                    await (await exportObjectTo3MFBlob(root, options)).arrayBuffer()
                );
                const physicalModel = await physicalZip.file('3D/3dmodel.model')!.async('string');
                const stable = (xml: string) =>
                    xml.replace(/p:UUID="[0-9a-f-]+"/g, 'p:UUID="generated"');
                assert.equal(
                    stable(physicalModel),
                    stable(model),
                    'preview color mode never changes physical export'
                );
            });
        });
    }
}

test('multi-head regions share every internal seam and tile the full layer with all smoothing strengths', async () => {
    const { state, result, colors } = multiHeadFixture();
    const plan = getMultiHeadRoutingPlan(multiHeadBuildSnapshot(state, result))!;
    const rows = ['0101', '1010', '0101', '1010'];
    const labels = new Uint8Array(16);
    for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) labels[(3 - y) * 4 + x] = Number(rows[y][x]) + 1;
    const noYield = { yieldIntervalMs: Infinity, onYield: async () => {} };
    for (const strength of ['none', 'minimal', 'medium', 'aggressive'] as const) {
        const mesher = await createFlatPaintMesher(labels, 4, 4, 0.1, strength, noYield);
        const entireLayer = await mesher(new Uint8Array(16).fill(1), noYield);
        const outside = topBoundaryEdges(entireLayer);
        const uses = new Map<string, number>();
        let volume = 0;
        for await (const part of generateMultiHeadMeshes({
            plan,
            data: inputPixels(colors, rows),
            imageWidth: 4,
            minX: 0,
            minY: 0,
            width: 4,
            height: 4,
            pixelHeights: new Float32Array(16).fill(state.autoPaintResult!.totalHeight),
            pixelSize: 0.1,
            heightScale: 1,
            strength,
            ...noYield,
        })) {
            if (part.layerIndex > 0) {
                part.mesh.geometry.dispose();
                break;
            }
            const mesh = sourceMesh(part.mesh);
            volume += inspectMeshIntegrity(mesh).signedVolume;
            for (const edge of topBoundaryEdges(mesh)) uses.set(edge, (uses.get(edge) ?? 0) + 1);
        }
        const expected =
            inspectMeshIntegrity(entireLayer).signedVolume * state.slicerFirstLayerHeight;
        assert.ok(
            Math.abs(volume - expected) < 1e-7,
            `${strength}: regions must tile the occupied layer`
        );
        for (const [edge, count] of uses)
            assert.equal(count, outside.has(edge) ? 1 : 2, `${strength}: seam ${edge}`);
        for (const edge of outside) assert.equal(uses.get(edge), 1, `${strength}: outside ${edge}`);
    }
});

test('multi-head geometry yields and stops publishing when an image build is invalidated', async () => {
    const { state, result, colors } = multiHeadFixture(0.08);
    const built = multiHeadBuildSnapshot(state, result);
    assert.equal(
        built.slicerFirstLayerHeight,
        0.12,
        'first layer cannot be thinner than a regular layer'
    );
    const plan = getMultiHeadRoutingPlan(built)!;
    let current = true,
        yields = 0,
        published = 0;
    for await (const part of generateMultiHeadMeshes({
        plan,
        data: inputPixels(colors, ['01', '10']),
        imageWidth: 2,
        minX: 0,
        minY: 0,
        width: 2,
        height: 2,
        pixelHeights: new Float32Array(4).fill(built.autoPaintResult!.totalHeight),
        pixelSize: 0.1,
        heightScale: 1,
        strength: 'medium',
        yieldIntervalMs: 0,
        onYield: async () => {
            yields++;
            current = false;
        },
        isCurrent: () => current,
    })) {
        published++;
        part.mesh.geometry.dispose();
    }
    assert.ok(yields > 0);
    assert.equal(published, 0);
});
