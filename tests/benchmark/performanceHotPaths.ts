import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import {
    createCenterEdgeWeight,
    createCenterWeight,
    createEdgeWeight,
} from '../../src/lib/regionWeighting.ts';
import { reconcileColorOrder } from '../../src/lib/colorOrder.ts';
import { hexLuminance } from '../../src/lib/colorUtils.ts';

type AutoPaintModule = typeof import('../../src/lib/autoPaint.ts');

async function loadAutoPaintModule(): Promise<AutoPaintModule> {
    const server = await createServer({
        appType: 'custom',
        cacheDir: 'dist/.vite-test-cache',
        configFile: false,
        logLevel: 'error',
        optimizeDeps: { noDiscovery: true },
        resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
        root: process.cwd(),
        server: { hmr: false, middlewareMode: true },
    });
    try {
        return (await server.ssrLoadModule('/src/lib/autoPaint.ts')) as AutoPaintModule;
    } finally {
        await server.close();
    }
}

const autoPaint = await loadAutoPaintModule();

const palette = Array.from({ length: 160 }, (_, index) => {
    const phase = index / 17;
    return {
        height: 0.16 + index * 0.08,
        lab: {
            L: 20 + index * 0.42,
            a: Math.sin(phase) * 42,
            b: Math.cos(phase * 0.83) * 38,
        },
        rgb: { r: index % 256, g: (index * 3) % 256, b: (index * 7) % 256 },
    };
});
const targets = Array.from({ length: 128 }, (_, index) => ({
    L: 18 + ((index * 37) % 72),
    a: -45 + ((index * 53) % 90),
    b: -42 + ((index * 29) % 84),
    weight: 1 + (index % 11),
}));

// Warm V8 before measuring the mapping loop.
autoPaint.mapTargetsToPrintablePalette(palette, targets);
let mappingChecksum = 0;
const mappingIterations = 30;
const mappingStartedAt = performance.now();
for (let iteration = 0; iteration < mappingIterations; iteration++) {
    const mapped = autoPaint.mapTargetsToPrintablePalette(palette, targets);
    for (const entry of mapped) {
        mappingChecksum += entry.paletteIndex + entry.projectedHeight;
    }
}
const mappingElapsedMs = performance.now() - mappingStartedAt;

autoPaint.mapTargetsWithSeparation(palette, targets, 25);
let separationChecksum = 0;
const separationIterations = 30;
const separationStartedAt = performance.now();
for (let iteration = 0; iteration < separationIterations; iteration++) {
    const separated = autoPaint.mapTargetsWithSeparation(palette, targets, 25);
    separationChecksum +=
        separated.report.assignedDistinctColorCount * 1_000 +
        separated.report.unacceptableColorCount * 10 +
        separated.report.maximumDeltaE;
    for (const entry of separated.mappedTargets) {
        separationChecksum += entry.paletteIndex + entry.projectedHeight;
    }
}
const separationElapsedMs = performance.now() - separationStartedAt;

const filaments = [
    { id: 'black', color: '#101010', td: 0.32 },
    { id: 'blue', color: '#1458c0', td: 0.34 },
    { id: 'red', color: '#c52b28', td: 0.3 },
    { id: 'yellow', color: '#f3c51e', td: 0.28 },
    { id: 'white', color: '#f4f1e8', td: 0.42 },
    { id: 'green', color: '#258247', td: 0.36 },
];
const imageSwatches = targets.slice(0, 32).map((target, index) => ({
    hex: autoPaint.rgbToHex({
        r: (index * 47 + 23) % 256,
        g: (index * 83 + 61) % 256,
        b: (index * 31 + 107) % 256,
    }),
    count: target.weight,
}));
const exactStartedAt = performance.now();
const exactResult = autoPaint.generateAutoLayers(
    filaments,
    imageSwatches,
    0.08,
    0.16,
    undefined,
    true,
    false,
    {
        algorithm: 'exact',
        cachingEnabled: false,
        maxExtraRepeats: 0,
        seed: 0x4b524f4d,
    }
);
const exactElapsedMs = performance.now() - exactStartedAt;

const spatialWidth = 1024;
const spatialHeight = 768;
const centerWeight = createCenterWeight(spatialWidth, spatialHeight);
const edgeWeight = createEdgeWeight(spatialWidth, spatialHeight);
let separateSpatialChecksum = 0;
const separateSpatialStartedAt = performance.now();
for (let y = 0; y < spatialHeight; y++) {
    for (let x = 0; x < spatialWidth; x++) {
        separateSpatialChecksum += centerWeight(x, y) + edgeWeight(x, y);
    }
}
const separateSpatialElapsedMs = performance.now() - separateSpatialStartedAt;

const centerEdgeWeight = createCenterEdgeWeight(spatialWidth, spatialHeight);
const spatialOut = { center: 0, edge: 0 };
let combinedSpatialChecksum = 0;
const combinedSpatialStartedAt = performance.now();
for (let y = 0; y < spatialHeight; y++) {
    for (let x = 0; x < spatialWidth; x++) {
        centerEdgeWeight(x, y, spatialOut);
        combinedSpatialChecksum += spatialOut.center + spatialOut.edge;
    }
}
const combinedSpatialElapsedMs = performance.now() - combinedSpatialStartedAt;

const orderSize = 4096;
const orderSwatches = Array.from({ length: orderSize }, (_, index) => ({
    hex: `#${index.toString(16).padStart(6, '0')}`,
    a: 255,
}));
const previousOrder = Array.from({ length: orderSize }, (_, index) => orderSize - index - 1);
const legacyOrderStartedAt = performance.now();
const legacyOrder: number[] = [];
for (const previousIndex of previousOrder) {
    const swatch = orderSwatches[previousIndex];
    const index = orderSwatches.findIndex(
        (candidate) => candidate.hex === swatch.hex && candidate.a === swatch.a
    );
    if (index !== -1 && !legacyOrder.includes(index)) legacyOrder.push(index);
}
const legacyRemaining: number[] = [];
for (let index = 0; index < orderSwatches.length; index++) {
    if (!legacyOrder.includes(index)) legacyRemaining.push(index);
}
legacyRemaining.sort(
    (left, right) => hexLuminance(orderSwatches[left].hex) - hexLuminance(orderSwatches[right].hex)
);
legacyOrder.push(...legacyRemaining);
const legacyOrderElapsedMs = performance.now() - legacyOrderStartedAt;

const indexedOrderStartedAt = performance.now();
const indexedOrder = reconcileColorOrder(orderSwatches, orderSwatches, previousOrder);
const indexedOrderElapsedMs = performance.now() - indexedOrderStartedAt;

console.log(
    JSON.stringify(
        {
            mapping: {
                paletteColors: palette.length,
                targets: targets.length,
                iterations: mappingIterations,
                elapsedMs: mappingElapsedMs,
                checksum: mappingChecksum,
            },
            separationMapping: {
                paletteColors: palette.length,
                targets: targets.length,
                iterations: separationIterations,
                elapsedMs: separationElapsedMs,
                checksum: separationChecksum,
            },
            exact: {
                filaments: filaments.length,
                iterations: exactResult.optimizerMetadata?.iterations,
                elapsedMs: exactElapsedMs,
                score: exactResult.optimizerMetadata?.score,
                order: exactResult.filamentOrder,
                layerCount: exactResult.finalStack.layers.length,
                finalStackFingerprint: exactResult.finalStack.fingerprint,
            },
            spatialWeights: {
                pixels: spatialWidth * spatialHeight,
                separateElapsedMs: separateSpatialElapsedMs,
                combinedElapsedMs: combinedSpatialElapsedMs,
                separateChecksum: separateSpatialChecksum,
                combinedChecksum: combinedSpatialChecksum,
            },
            colorOrder: {
                colors: orderSize,
                legacyElapsedMs: legacyOrderElapsedMs,
                indexedElapsedMs: indexedOrderElapsedMs,
                legacyChecksum: legacyOrder.reduce(
                    (checksum, index, position) => checksum + index * (position + 1),
                    0
                ),
                indexedChecksum: indexedOrder.reduce(
                    (checksum, index, position) => checksum + index * (position + 1),
                    0
                ),
            },
        },
        null,
        2
    )
);
