import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

import {
    centerWeightAt,
    edgeWeightAt,
    generateCenterWeightedMapSimple,
    generateEdgeWeightedMapSimple,
} from '../src/lib/regionWeighting.ts';

type AutoPaintModule = typeof import('../src/lib/autoPaint.ts');
let autoPaintModule: Promise<AutoPaintModule> | null = null;

async function loadAutoPaintModule(): Promise<AutoPaintModule> {
    autoPaintModule ??= loadViteModule<AutoPaintModule>('/src/lib/autoPaint.ts');
    return autoPaintModule;
}

async function loadViteModule<T>(modulePath: string): Promise<T> {
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
        return (await server.ssrLoadModule(modulePath)) as T;
    } finally {
        await server.close();
    }
}

test('scalar region weights match the existing center and edge maps', () => {
    for (const [width, height] of [
        [1, 1],
        [4, 4],
        [5, 3],
        [16, 9],
    ]) {
        const center = generateCenterWeightedMapSimple(width, height);
        const edge = generateEdgeWeightedMapSimple(width, height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                assert.ok(Math.abs(center[index] - centerWeightAt(x, y, width, height)) < 1e-6);
                assert.ok(Math.abs(edge[index] - edgeWeightAt(x, y, width, height)) < 1e-6);
            }
        }
    }
});

test('center and edge weights favor opposite image regions', () => {
    const width = 9;
    const height = 9;
    const center = centerWeightAt(4, 4, width, height);
    const corner = centerWeightAt(0, 0, width, height);
    const edgeCenter = edgeWeightAt(4, 4, width, height);
    const edgeCorner = edgeWeightAt(0, 0, width, height);

    assert.ok(center > corner, 'center mode should favor the center');
    assert.ok(edgeCorner > edgeCenter, 'edge mode should favor the border');
});

test('spatial color totals prioritize a center disc or an edge border as selected', async () => {
    const { clusterImageColors, deltaELab, hexToRgb, rgbToLab } = await loadAutoPaintModule();
    const width = 25;
    const height = 25;
    let redCenter = 0;
    let blueCenter = 0;
    let redEdge = 0;
    let blueEdge = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const isRedCenterDisc = Math.hypot(x - width / 2, y - height / 2) <= 9;
            const centerWeight = centerWeightAt(x, y, width, height);
            const edgeWeight = edgeWeightAt(x, y, width, height);
            if (isRedCenterDisc) {
                redCenter += centerWeight;
                redEdge += edgeWeight;
            } else {
                blueCenter += centerWeight;
                blueEdge += edgeWeight;
            }
        }
    }

    const redLab = rgbToLab(hexToRgb('#ff0000'));
    const blueLab = rgbToLab(hexToRgb('#0000ff'));
    const weightFor = (clusters: ReturnType<typeof clusterImageColors>, lab: typeof redLab) =>
        clusters.reduce((best, cluster) =>
            deltaELab(cluster, lab) < deltaELab(best, lab) ? cluster : best
        ).weight;

    const centerClusters = clusterImageColors(
        [
            { hex: '#ff0000', count: redCenter },
            { hex: '#0000ff', count: blueCenter },
        ],
        2,
        0.1
    );
    const edgeClusters = clusterImageColors(
        [
            { hex: '#ff0000', count: redEdge },
            { hex: '#0000ff', count: blueEdge },
        ],
        2,
        0.1
    );

    assert.ok(
        weightFor(centerClusters, redLab) > weightFor(centerClusters, blueLab),
        'center mode should rank the red center disc above the blue border'
    );
    assert.ok(
        weightFor(edgeClusters, blueLab) > weightFor(edgeClusters, redLab),
        'edge mode should rank the blue border above the red center disc'
    );
});

test('the auto-paint worker path does not create an image-sized region map', () => {
    const autoPaintSource = readFileSync(resolve('src', 'lib', 'autoPaint.ts'), 'utf8');
    const workerSource = readFileSync(resolve('src', 'workers', 'autoPaint.worker.ts'), 'utf8');

    assert.doesNotMatch(autoPaintSource, /generate(?:Center|Edge)WeightedMapSimple/);
    assert.doesNotMatch(autoPaintSource, /regionWeights/);
    assert.doesNotMatch(workerSource, /regionWeightingMode|imageDimensions/);
});
