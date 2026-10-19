import assert from 'node:assert/strict';
import test from 'node:test';
import { quantizeHeightMap } from '../src/lib/heightDithering.ts';
import { loadViteModule } from './helpers/viteModule.ts';
import { generateGreedyMesh, generateSmoothMesh } from '../src/lib/meshing.ts';
import { inspectMeshIntegrity } from './meshDiagnostics.ts';

type AutoPaint = typeof import('../src/lib/autoPaint.ts');
let autoPaint: Promise<AutoPaint> | undefined;
const loadAutoPaint = () => (autoPaint ??= loadViteModule<AutoPaint>('/src/lib/autoPaint.ts'));
const options = {
    layerHeight: 0.08,
    slicerFirstLayerHeight: 0.16,
    minModelH: 0.16,
    maxModelH: 0.4,
    heightDithering: true,
    ditherLineWidth: 0.2,
    pixelSize: 0.2,
};
const palette = [20, 60, 90].map((L, index) => ({
    height: 0.16 + index * 0.08,
    predictedLab: [L, 0, 0] as const,
}));
const mapping = {
    targetColor: { rgb: [70, 70, 70] as const },
    targetLab: [30, 0, 0] as readonly [number, number, number],
    paletteIndex: 0,
    projectedHeight: 0.16,
};
const key = 0x464646;

test('dithering recovers fractional heights without changing ordinary final-stack mappings', async () => {
    const { createFinalStackTargetHeightCache } = await loadAutoPaint();
    const before = JSON.stringify({ palette, mapping });
    assert.equal(createFinalStackTargetHeightCache([mapping], 0.16, 0.32).get(key), 0.16);
    const dithered = createFinalStackTargetHeightCache([mapping], 0.16, 0.32, {
        palette,
        layerHeight: 0.08,
    });
    assert.ok(Math.abs(dithered.get(key)! - 0.18) < 1e-9);
    const lowerNeighbor = createFinalStackTargetHeightCache(
        [{ ...mapping, targetLab: [40, 0, 0], paletteIndex: 1, projectedHeight: 0.24 }],
        0.16,
        0.32,
        { palette, layerHeight: 0.08 }
    );
    assert.ok(Math.abs(lowerNeighbor.get(key)! - 0.2) < 1e-9);
    assert.equal(JSON.stringify({ palette, mapping }), before, 'never mutate the final stack');
});

test('dither targets preserve exact matches, calibration anchors and legacy snapshots', async () => {
    const { createFinalStackTargetHeightCache } = await loadAutoPaint();
    const cache = (target: typeof mapping, entries = palette) =>
        createFinalStackTargetHeightCache([target], 0.16, 0.32, {
            palette: entries,
            layerHeight: 0.08,
        }).get(key);
    assert.equal(cache({ ...mapping, targetLab: [20, 0, 0] }), 0.16);
    const anchored = palette.map((entry, index) => ({
        ...entry,
        ...(index === 0 ? { exactAnchorTargetLab: mapping.targetLab } : {}),
    }));
    assert.equal(cache(mapping, anchored), 0.16);
    assert.equal(
        createFinalStackTargetHeightCache(
            [{ targetColor: mapping.targetColor, projectedHeight: 0.24 }],
            0.16,
            0.32,
            { palette, layerHeight: 0.08 }
        ).get(key),
        0.24
    );
});

test('dither interpolation cannot jump gaps, expose foundation prefixes or leave the selected neighborhood', async () => {
    const { createFinalStackTargetHeightCache } = await loadAutoPaint();
    const cache = (entries: typeof palette, maximum = 0.4) =>
        createFinalStackTargetHeightCache([mapping], 0.16, maximum, {
            palette: entries,
            layerHeight: 0.08,
        }).get(key);
    assert.equal(cache(palette.map((p, i) => ({ ...p, surfaceEligible: i !== 1 }))), 0.16);
    assert.equal(cache(palette.map((p, i) => ({ ...p, height: p.height + (i ? 0.08 : 0) }))), 0.16);
    assert.equal(cache(palette, 0.16), 0.16);
    // A remote perfect color must not replace the layer chosen by hybrid reranking.
    const remote = [20, 10, 30].map((L, i) => ({
        ...palette[i],
        predictedLab: [L, 0, 0] as const,
    }));
    assert.equal(cache(remote), 0.16);
    assert.equal(cache(palette.map((p) => ({ ...p, predictedLab: [20, 0, 0] as const }))), 0.16);
});

test('fractional targets generate deterministic neighboring-layer patterns with the requested block size', () => {
    const width = 64,
        height = 48;
    for (const blockSize of [1, 2, 3]) {
        const original = new Float32Array(width * height).fill(0.18);
        const plain = original.slice();
        quantizeHeightMap(plain, width, height, { ...options, heightDithering: false });
        assert.deepEqual([...new Set(plain)], [Math.fround(0.16)]);
        const dithered = original.slice();
        const settings = { ...options, ditherLineWidth: blockSize * options.pixelSize };
        quantizeHeightMap(dithered, width, height, settings);
        const repeat = original.slice();
        quantizeHeightMap(repeat, width, height, settings);
        assert.deepEqual(dithered, repeat);
        assert.deepEqual([...new Set(dithered)].sort(), [Math.fround(0.16), Math.fround(0.24)]);
        const average = dithered.reduce((sum, h) => sum + h, 0) / dithered.length;
        assert.ok(
            Math.abs(average - 0.18) < 0.003,
            `average ${average} should preserve the fractional tone`
        );
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
                const blockStart =
                    Math.floor(y / blockSize) * blockSize * width +
                    Math.floor(x / blockSize) * blockSize;
                assert.equal(dithered[y * width + x], dithered[blockStart]);
            }
    }
});

test('dithering preserves transparency, protected boundaries and exact heights inside mixed blocks', () => {
    const width = 64,
        height = 48;
    const input = new Float32Array(width * height).fill(0.18);
    for (let y = 0; y < height; y++) {
        input[y * width + 5] = 0;
        input[y * width + 20] = 0.16; // Same rounded height as its fractional neighbor.
        for (let x = 40; x < width; x++) input[y * width + x] = 0.29;
    }
    for (const blockSize of [1, 2]) {
        const output = input.slice();
        quantizeHeightMap(output, width, height, {
            ...options,
            ditherLineWidth: blockSize * options.pixelSize,
        });
        for (let y = 0; y < height; y++) {
            assert.equal(output[y * width + 5], 0);
            assert.equal(output[y * width + 20], Math.fround(0.16));
            assert.equal(output[y * width + 39], Math.fround(0.16));
            assert.equal(output[y * width + 40], Math.fround(0.32));
        }
        assert.ok(
            output.every((h, i) =>
                input[i] === 0 ? h === 0 : h >= Math.fround(0.16) && h <= Math.fround(0.32)
            )
        );
    }
});

test('real Auto-paint final-stack mappings retain fractional input through the height dither pipeline', async () => {
    const { generateAutoLayers, createFinalStackTargetHeightCache } = await loadAutoPaint();
    const result = generateAutoLayers(
        [
            { id: 'black', color: '#000000', td: 0.016 },
            { id: 'white', color: '#ffffff', td: 0.6 },
        ],
        [0, 32, 64, 96, 128, 160, 192, 224].map((v) => ({
            hex: '#' + v.toString(16).padStart(2, '0').repeat(3),
            count: 1,
        })),
        0.08,
        0.16,
        1,
        true,
        false,
        { algorithm: 'fast', seed: 42 }
    );
    const stack = result.finalStack;
    const minimum = stack.palette.find((p) => p.surfaceEligible !== false)!.height;
    const original = createFinalStackTargetHeightCache(
        stack.targetMappings,
        minimum,
        stack.totalHeight
    );
    const fractional = createFinalStackTargetHeightCache(
        stack.targetMappings,
        minimum,
        stack.totalHeight,
        {
            palette: stack.palette,
            layerHeight: 0.08,
        }
    );
    assert.ok([...fractional].some(([k, h]) => Math.abs(h - original.get(k)!) > 1e-6));
    const h = [...fractional.values()].find(
        (h) => Math.abs((h - 0.16) / 0.08 - Math.round((h - 0.16) / 0.08)) > 0.01
    )!;
    assert.ok(h > 0);
    const heightMap = new Float32Array(64 * 48).fill(h);
    quantizeHeightMap(heightMap, 64, 48, {
        ...options,
        minModelH: minimum,
        maxModelH: stack.totalHeight,
    });
    assert.equal(
        new Set(heightMap).size,
        2,
        'the shared cache must not feed only snapped heights to diffusion'
    );
});

test('dithered layer masks remain manifold with greedy and smooth meshing', async () => {
    const width = 32,
        height = 24;
    for (const lineWidth of [0.2, 0.4]) {
        const heights = new Float32Array(width * height).fill(0.18);
        quantizeHeightMap(heights, width, height, { ...options, ditherLineWidth: lineWidth });
        for (const level of [0.16, 0.24]) {
            const mask = Uint8Array.from(heights, (h) => (h >= level - 1e-6 ? 1 : 0));
            for (const generate of [generateGreedyMesh, generateSmoothMesh]) {
                const mesh = await generate(mask, width, height, 0.08, level - 0.08, 0.2, 1, {
                    yieldIntervalMs: Infinity,
                    onYield: async () => undefined,
                });
                const integrity = inspectMeshIntegrity(mesh);
                assert.equal(integrity.isValid, true, JSON.stringify(integrity));
            }
        }
    }
});

test('non-default first layers and fine layer heights stay on grid, bounded, and exact where anchored', () => {
    const settings = {
        ...options,
        layerHeight: 0.04,
        slicerFirstLayerHeight: 0.1,
        minModelH: 0.62,
        maxModelH: 3.7,
    };
    const width = 32,
        height = 24;
    const input = new Float32Array(width * height).fill(3.675);
    for (let y = 0; y < height; y++) input[y * width + 9] = 3.66;
    for (const lineWidth of [0.2, 0.4]) {
        const result = input.slice();
        quantizeHeightMap(result, width, height, { ...settings, ditherLineWidth: lineWidth });
        assert.equal(new Set(result).size, 2);
        for (const h of result) {
            const layer = (h - settings.slicerFirstLayerHeight) / settings.layerHeight;
            assert.ok(Math.abs(layer - Math.round(layer)) < 1e-5);
            assert.ok(h >= Math.fround(settings.minModelH) && h <= Math.fround(settings.maxModelH));
        }
        for (let y = 0; y < height; y++) assert.equal(result[y * width + 9], Math.fround(3.66));
    }
});
