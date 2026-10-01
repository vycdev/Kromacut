import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createFlatPaintMesher } from '../src/lib/flatPaintMeshing.ts';
import type { MeshData } from '../src/lib/meshing.ts';
import { inspectMeshIntegrity } from './meshDiagnostics.ts';
import { logoFixturePath, maskFromPngAlpha } from './imageFixtures.ts';
import { flatPaintPrecisionFixture } from './flatPaintPrecisionFixture.ts';

const noYield = { yieldIntervalMs: Infinity, onYield: async () => undefined };
const strengths = ['minimal', 'medium', 'aggressive'] as const;
const fixtures = [
    ['112222', '111222', '111122', '111112'],
    ['000110', '001120', '011230', '112330', '123330', '000000'],
    ['1212', '2121', '1212', '2121'],
    ['1020', '0102', '3020', '0302'],
    ['11111', '12221', '12021', '13331', '11111'],
    ['1122', '1322', '3334', '3344'],
];

function masksFor(counts: Uint16Array) {
    return [...new Set(counts)]
        .filter((n) => n > 0)
        .map((n) => Uint8Array.from(counts, (label) => (label === n ? 1 : 0)));
}

function wallEdges(mesh: MeshData) {
    const edges = new Map<string, number>();
    for (let i = 0; i < mesh.indices.length; i += 3) {
        const ids = mesh.indices.slice(i, i + 3);
        const top = ids.filter((id) => mesh.positions[id * 3 + 2] === 1);
        const bottom = ids.filter((id) => mesh.positions[id * 3 + 2] === 0);
        if (top.length !== 2 || bottom.length !== 1) continue;
        const keys = top
            .map((id) => `${mesh.positions[id * 3]},${mesh.positions[id * 3 + 1]}`)
            .sort();
        const key = keys.join('|');
        edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    return edges;
}

function assertHealthyAtBothPrecisions(mesh: MeshData) {
    for (const positions of [
        mesh.positions,
        Float32Array.from(mesh.positions, (n) => Math.round(n * 100_000) / 100_000),
    ]) {
        const report = inspectMeshIntegrity({ positions, indices: mesh.indices });
        assert.equal(report.isValid, true, JSON.stringify(report));
    }
}

async function checkTiling(
    counts: Uint16Array,
    width: number,
    height: number,
    strength: 'none' | (typeof strengths)[number],
    pixelSize = 0.1
) {
    const meshMask = await createFlatPaintMesher(
        counts,
        width,
        height,
        pixelSize,
        strength,
        noYield
    );
    const opaque = await meshMask(
        Uint8Array.from(counts, (n) => (n ? 1 : 0)),
        noYield
    );
    const opaqueReport = inspectMeshIntegrity(opaque);
    assertHealthyAtBothPrecisions(opaque);
    const edges = new Map<string, number>();
    let volume = 0;
    for (const mask of masksFor(counts)) {
        const mesh = await meshMask(mask, noYield);
        const report = inspectMeshIntegrity(mesh);
        assertHealthyAtBothPrecisions(mesh);
        assert.equal(
            report.isValid,
            true,
            JSON.stringify({ strength, counts: [...counts], report })
        );
        volume += report.signedVolume;
        for (const [key, count] of wallEdges(mesh)) edges.set(key, (edges.get(key) ?? 0) + count);
        const again = await meshMask(mask, noYield);
        assert.deepEqual(again.positions, mesh.positions, 'deterministic shared coordinates');
        assert.deepEqual(again.indices, mesh.indices);
    }
    assert.ok(
        Math.abs(volume - opaqueReport.signedVolume) < 1e-7,
        `class areas must tile the carrier: ${volume} != ${opaqueReport.signedVolume}`
    );
    const outsideEdges = wallEdges(opaque);
    for (const [key, count] of edges) {
        assert.equal(
            count,
            outsideEdges.has(key) ? 1 : 2,
            `unmatched or overlapping interface ${key}`
        );
    }
    for (const key of outsideEdges.keys()) assert.equal(edges.get(key), 1, `carrier edge ${key}`);
    return opaque;
}

test('None tiles diagonal colors without expanding binary masks into neighboring colors', async () => {
    const counts = Uint16Array.from([1, 2, 2, 1]);
    const opaque = await checkTiling(counts, 2, 2, 'none', 1);
    assert.ok(Math.abs(inspectMeshIntegrity(opaque).signedVolume - 4) < 1e-7);
});

test('nearly collinear corner repairs retain closed, disjoint caps at print coordinates', async () => {
    const { counts, width, height, pixelSize } = flatPaintPrecisionFixture();
    // Medium previously threw halfway through this image, leaving just backing
    // parts in the preview. Also cover the unsmoothed path and both other presets.
    for (const strength of ['none', ...strengths] as const) {
        await checkTiling(counts, width, height, strength, pixelSize);
    }
});

test('None keeps staircase grid vertices fixed away from diagonal contacts', async () => {
    const rows = fixtures[0];
    const counts = Uint16Array.from(rows.join(''), Number);
    const mesher = await createFlatPaintMesher(
        counts,
        rows[0].length,
        rows.length,
        1,
        'none',
        noYield
    );
    for (const mask of masksFor(counts)) {
        const mesh = await mesher(mask, noYield);
        assert.ok([...mesh.positions].every(Number.isInteger));
        assert.equal(mesh.metrics?.mesher, 'greedy');
    }
});

test('chunked Flat Paint relaxation preserves the geometry from before the responsiveness fix', async () => {
    const baselines = [
        [
            0,
            [
                '689a241b8f132b5d9c9e14092045173cd8821478a2a5b0e0d630219c8aaddad2',
                '2c253722907fa9d32d620901067d975f83a3fc48b89e6d719e4edba00eaea1bc',
                'b76943a4d2f850acc02fda4e860ca48c03831f185988e842d868ff14ad869a44',
            ],
        ],
        [
            2,
            [
                'f26bfdb2370ed3bc9923d89580939610f0c8f5aa427f48141459ee2b892d766a',
                '6021c4e3a2145687ae0629509b10f4f55e37bc4a22a33e80dd6b989beab854b2',
                '6021c4e3a2145687ae0629509b10f4f55e37bc4a22a33e80dd6b989beab854b2',
            ],
        ],
        [
            4,
            [
                '13fabb36db3c62dae666a2cfd4150fa0a20a8d47dbbf2a1a73b944e50082b83e',
                '275fe3f9dab7905bd4d81e14e76308cc503a7e7f02e77fb754ee592ede1ecd7f',
                'ccb314855ae336a88cff5edb29f181aa91f3d587fc0ace3e4380377e25c18003',
            ],
        ],
        [
            5,
            [
                '8ae53ff815a2b2d579ad756a362c53dd4d904c7380efc6fea577805b203ac978',
                'e43de56afbde8504ec10a6d2bb8a91c1fd81934cf80a76eb0e5c979971e511b4',
                '011eea81e28c94c476320ea8b7a9e08d299e3972fd5300c0293421f366f50ff7',
            ],
        ],
    ] as const;
    for (const [fixture, hashes] of baselines) {
        const rows = fixtures[fixture];
        const counts = Uint16Array.from(rows.join(''), Number);
        for (const [index, strength] of strengths.entries()) {
            const meshMask = await createFlatPaintMesher(
                counts,
                rows[0].length,
                rows.length,
                0.1,
                strength,
                noYield
            );
            const hash = createHash('sha256');
            for (const mask of masksFor(counts)) {
                const mesh = await meshMask(mask, noYield);
                hash.update(Buffer.from(mesh.positions.buffer)).update(
                    JSON.stringify(mesh.indices)
                );
            }
            assert.equal(hash.digest('hex'), hashes[index], `fixture ${fixture}, ${strength}`);
        }
    }
});

test('all Flat Paint strengths keep colors and the carrier joined with closed topology', async (t) => {
    for (const [fixture, rows] of fixtures.entries()) {
        const counts = Uint16Array.from(rows.join(''), Number);
        for (const strength of ['none', ...strengths] as const) {
            for (const pixelSize of [0.01, 0.4]) {
                await t.test(`${fixture}: ${strength}, ${pixelSize} mm`, async () => {
                    await checkTiling(counts, rows[0].length, rows.length, strength, pixelSize);
                });
            }
        }
    }
});

test('seeded color grids preserve shared topology through corner contacts and junctions', async () => {
    let seed = 8703;
    for (let sample = 0; sample < 30; sample++) {
        const counts = Uint16Array.from({ length: 36 }, () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return (seed >>> 16) % 5;
        });
        await checkTiling(counts, 6, 6, strengths[sample % strengths.length]);
    }
});

test('Flat Paint strength presets change internal stair steps while preserving flat Z faces', async () => {
    const rows = fixtures[0];
    const counts = Uint16Array.from(rows.join(''), Number);
    const outputs: Float32Array[] = [];
    for (const strength of ['none', ...strengths] as const) {
        const meshMask = await createFlatPaintMesher(counts, 6, 4, 0.4, strength, noYield);
        const mesh = await meshMask(masksFor(counts)[0], noYield);
        for (let i = 2; i < mesh.positions.length; i += 3) {
            assert.ok(mesh.positions[i] === 0 || mesh.positions[i] === 1, 'slab faces remain flat');
        }
        outputs.push(mesh.positions);
    }
    for (let i = 1; i < outputs.length; i++) assert.notDeepEqual(outputs[i], outputs[i - 1]);
});

test('shared Flat Paint preparation and mesh generation yield to the UI', async () => {
    let yields = 0;
    const options = {
        yieldIntervalMs: 0,
        onYield: async () => {
            yields++;
        },
    };
    const meshMask = await createFlatPaintMesher(
        Uint16Array.from([1, 2, 2, 1]),
        2,
        2,
        0.1,
        'medium',
        options
    );
    assert.ok(yields > 0);
    yields = 0;
    await meshMask(Uint8Array.from([1, 0, 0, 1]), options);
    assert.ok(yields > 0);
});

test('dense Flat Paint boundaries yield during initialization and within relaxation passes', async (t) => {
    const size = 128;
    for (const pattern of ['checkerboard', 'stair steps'] as const) {
        await t.test(pattern, async () => {
            const counts = Uint16Array.from({ length: size * size }, (_, index) => {
                const diagonal = (index % size) + Math.floor(index / size);
                return 1 + ((pattern === 'checkerboard' ? diagonal : Math.floor(diagonal / 3)) % 2);
            });
            let smoothingProgress: number | undefined;
            let initializationYields = 0;
            let firstPassYields = 0;
            let relaxationYields = 0;
            await createFlatPaintMesher(counts, size, size, 0.1, 'medium', {
                yieldIntervalMs: 0,
                onProgress: (progress) => {
                    if (progress.phase === 'smoothing') smoothingProgress = progress.progress;
                },
                onYield: () =>
                    new Promise<void>((resolve) => {
                        // An actual event-loop turn must run while this stage is
                        // in flight, rather than just before or after smoothing.
                        setImmediate(() => {
                            if (smoothingProgress !== undefined && smoothingProgress < 0.1)
                                initializationYields++;
                            if (
                                smoothingProgress !== undefined &&
                                smoothingProgress > 0.1 &&
                                smoothingProgress < 1
                            )
                                relaxationYields++;
                            if (
                                smoothingProgress !== undefined &&
                                smoothingProgress > 0.1 &&
                                smoothingProgress < 0.19
                            )
                                firstPassYields++;
                            resolve();
                        });
                    }),
            });
            assert.ok(initializationYields > 10, 'dense graph initialization must be chunked');
            assert.ok(relaxationYields >= 9, 'every relaxation pass must allow the UI to run');
            if (pattern === 'stair steps') {
                assert.ok(
                    firstPassYields > 10,
                    'a large pass must yield before all its vertices are relaxed'
                );
            }
        });
    }
});

test('large Flat Paint caps yield before a single source row finishes triangulating', async () => {
    const width = 16_384;
    const counts = new Uint16Array(width).fill(1);
    const meshMask = await createFlatPaintMesher(counts, width, 1, 0.01, 'medium', noYield);
    let capProgress = 0;
    let intermediateYields = 0;
    const mesh = await meshMask(new Uint8Array(width).fill(1), {
        yieldIntervalMs: 0,
        onProgress: (progress) => {
            if (progress.phase === 'caps') capProgress = progress.progress;
        },
        onYield: () =>
            new Promise<void>((resolve) => {
                setImmediate(() => {
                    // A yield after the only source row would already report 0.9.
                    if (capProgress > 0 && capProgress < 0.9) intermediateYields++;
                    resolve();
                });
            }),
    });
    assert.ok(
        intermediateYields > 1,
        'large caps must yield repeatedly while triangulation is in flight'
    );
    assertHealthyAtBothPrecisions(mesh);
});

test('subdivided large caps preserve shared class interfaces and the carrier footprint', async () => {
    const width = 1024;
    const height = 16;
    const counts = Uint16Array.from({ length: width * height }, (_, index) => {
        const x = index % width;
        const y = Math.floor(index / width);
        if (x >= 700 && x < 800 && y >= 4 && y < 12) return 0;
        return x < 500 + Math.floor(y / 2) ? 1 : 2;
    });
    for (const strength of strengths) await checkTiling(counts, width, height, strength, 0.01);
});

test('long stair-step color boundaries retain every cap vertex at mesh and slicer precision', async () => {
    const counts = new Uint16Array(32 * 24).fill(1);
    for (let y = 0; y < 24; y++) {
        for (let x = 4 + Math.floor(y / 3); x < 12 + Math.floor(y / 3); x++) counts[y * 32 + x] = 3;
        for (let x = 16 + Math.floor(y / 4); x < 22 + Math.floor(y / 4); x++)
            counts[y * 32 + x] = 8;
    }
    for (const strength of strengths) await checkTiling(counts, 32, 24, strength, 0.4);
});

test('image-derived silhouettes tile smoothly across multiple Flat Paint classes', async () => {
    const raster = maskFromPngAlpha(logoFixturePath, 128);
    const counts = Uint16Array.from(raster.activePixels, (active, index) =>
        active
            ? 1 + (Math.floor(((index % raster.width) + Math.floor(index / raster.width)) / 13) % 3)
            : 0
    );
    for (const strength of strengths)
        await checkTiling(counts, raster.width, raster.height, strength);
});
