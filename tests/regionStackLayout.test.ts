import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import JSZip from 'jszip';
import { createFlatPaintMesher } from '../src/lib/flatPaintMeshing.ts';
import { FLAT_PAINT_CARRIER_HEX, type FlatPaintLayout } from '../src/lib/flatPaint.ts';
import type { RegionStack, RegionStackPlan, SmoothMeshingStrength } from '../src/types/index.ts';
import { loadViteModule } from './helpers/viteModule.ts';

const { buildRegionStackLayout, regionStackLabels } = await loadViteModule<
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
