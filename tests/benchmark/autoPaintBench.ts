import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { createServer } from 'vite';

import { autoPaintGoldenScenarios } from '../autoPaintGoldenFixtures.ts';

type AutoPaintModule = typeof import('../../src/lib/autoPaint.ts');
type Algorithm = 'auto' | 'exhaustive' | 'simulated-annealing' | 'genetic';
type Lab = { L: number; a: number; b: number };

const LAYER_HEIGHT = 0.08;
const FIRST_LAYER_HEIGHT = 0.16;
const COMPRESSED_MAX_HEIGHT = 1.2;
const SEEDS = [0x4b524f4d, 0x4b524f4e, 0x4b524f4f];

async function loadAutoPaintModule(): Promise<AutoPaintModule> {
    const server = await createServer({
        appType: 'custom', cacheDir: 'dist/.vite-test-cache', configFile: false, logLevel: 'error',
        optimizeDeps: { noDiscovery: true }, resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
        root: process.cwd(), server: { hmr: false, middlewareMode: true },
    });
    try { return (await server.ssrLoadModule('/src/lib/autoPaint.ts')) as AutoPaintModule; }
    finally { await server.close(); }
}

function ciede2000(left: Lab, right: Lab) {
    const c1 = Math.hypot(left.a, left.b);
    const c2 = Math.hypot(right.a, right.b);
    const averageC = (c1 + c2) / 2;
    const g = 0.5 * (1 - Math.sqrt(averageC ** 7 / (averageC ** 7 + 25 ** 7)));
    const a1 = (1 + g) * left.a;
    const a2 = (1 + g) * right.a;
    const c1p = Math.hypot(a1, left.b);
    const c2p = Math.hypot(a2, right.b);
    const h = (a: number, b: number) => (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
    const h1 = h(a1, left.b), h2 = h(a2, right.b);
    const deltaL = right.L - left.L, deltaC = c2p - c1p;
    const deltaHAngle = c1p * c2p === 0 ? 0 : Math.abs(h2 - h1) <= 180 ? h2 - h1 : h2 <= h1 ? h2 - h1 + 360 : h2 - h1 - 360;
    const deltaH = 2 * Math.sqrt(c1p * c2p) * Math.sin((deltaHAngle / 2) * Math.PI / 180);
    const meanL = (left.L + right.L) / 2, meanC = (c1p + c2p) / 2;
    const meanH = c1p * c2p === 0 ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
    const t = 1 - 0.17 * Math.cos((meanH - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * meanH * Math.PI / 180) + 0.32 * Math.cos((3 * meanH + 6) * Math.PI / 180) - 0.2 * Math.cos((4 * meanH - 63) * Math.PI / 180);
    const sl = 1 + 0.015 * (meanL - 50) ** 2 / Math.sqrt(20 + (meanL - 50) ** 2);
    const sc = 1 + 0.045 * meanC;
    const sh = 1 + 0.015 * meanC * t;
    const rt = -2 * Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)) * Math.sin((60 * Math.exp(-(((meanH - 275) / 25) ** 2))) * Math.PI / 180);
    return Math.sqrt((deltaL / sl) ** 2 + (deltaC / sc) ** 2 + (deltaH / sh) ** 2 + rt * (deltaC / sc) * (deltaH / sh));
}

function weightedSummary(samples: Array<{ value: number; weight: number }>) {
    const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
    const weightedMean = samples.reduce((sum, sample) => sum + sample.value * sample.weight, 0) / totalWeight;
    const ordered = [...samples].sort((a, b) => a.value - b.value);
    let cumulative = 0;
    const p95 = ordered.find((sample) => (cumulative += sample.weight) >= totalWeight * 0.95)?.value ?? 0;
    return { weightedMean, p95, totalWeight };
}

function cumulativeHeights(sliceHeights: number[], colorOrder: number[]) {
    let total = 0;
    return colorOrder.map((index, position) => {
        total += position === 0 ? Math.max(sliceHeights[index], FIRST_LAYER_HEIGHT) : sliceHeights[index];
        return total;
    });
}

function projectHeight(target: Lab, nodes: Array<{ lab: Lab; min: number; max: number }>, cumulative: number[]) {
    let bestDistance = Infinity, height = cumulative[0] ?? 0;
    for (const node of nodes) {
        const distance = Math.hypot(target.L - node.lab.L, target.a - node.lab.a, target.b - node.lab.b);
        if (distance < bestDistance) { bestDistance = distance; height = (node.min + node.max) / 2; }
    }
    for (let index = 0; index < nodes.length - 1; index++) {
        const from = nodes[index], to = nodes[index + 1];
        const dL = to.lab.L - from.lab.L, da = to.lab.a - from.lab.a, db = to.lab.b - from.lab.b;
        const lengthSq = dL * dL + da * da + db * db;
        if (lengthSq < 0.01) continue;
        const t = Math.max(0, Math.min(1, ((target.L - from.lab.L) * dL + (target.a - from.lab.a) * da + (target.b - from.lab.b) * db) / lengthSq));
        const distance = Math.hypot(target.L - (from.lab.L + t * dL), target.a - (from.lab.a + t * da), target.b - (from.lab.b + t * db));
        if (distance < bestDistance) { bestDistance = distance; height = from.max + t * (to.min - from.max); }
    }
    return Math.max(cumulative[0] ?? 0, Math.min(cumulative.at(-1) ?? 0, height));
}

const autoPaint = await loadAutoPaintModule();
const output: unknown[] = [];

for (const scenario of autoPaintGoldenScenarios().filter(
    (scenario) => scenario.enhancedColorMatch && scenario.allowRepeatedSwaps
)) {
    const profileSize = scenario.filaments.length;
    const algorithms: Algorithm[] = profileSize <= 6
        ? ['auto', 'exhaustive', 'simulated-annealing', 'genetic']
        : ['auto', 'simulated-annealing', 'genetic'];
    for (const algorithm of algorithms) {
        const seeds = algorithm === 'simulated-annealing' || algorithm === 'genetic' ? SEEDS : [SEEDS[0]];
        for (const seed of seeds) {
            const start = performance.now();
            const result = autoPaint.generateAutoLayers(scenario.filaments, scenario.imageSwatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, undefined, scenario.enhancedColorMatch, scenario.allowRepeatedSwaps, { algorithm, seed });
            const elapsedMs = performance.now() - start;
            const slices = autoPaint.autoPaintToSliceHeights(result, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
            const palette = slices.virtualSwatches.map((swatch) => autoPaint.rgbToLab(autoPaint.hexToRgb(swatch.hex)));
            const targets = scenario.imageSwatches.map((swatch) => ({ lab: autoPaint.rgbToLab(autoPaint.hexToRgb(swatch.hex)), weight: swatch.count }));
            const errors76 = targets.map((target) => ({ weight: target.weight, value: Math.min(...palette.map((entry) => autoPaint.deltaELab(target.lab, entry))) }));
            const errors2000 = targets.map((target) => ({ weight: target.weight, value: Math.min(...palette.map((entry) => ciede2000(target.lab, entry))) }));
            const coverage = (limit: number) => errors76.filter((sample) => sample.value <= limit).reduce((sum, sample) => sum + sample.weight, 0) / errors76.reduce((sum, sample) => sum + sample.weight, 0);
            const heights = cumulativeHeights(slices.colorSliceHeights, slices.colorOrder);
            const nodes = palette.map((lab, index) => ({ lab, min: heights[index], max: heights[index] }));
            const realized = targets.map((target) => {
                const height = projectHeight(target.lab, nodes, heights);
                const slice = Math.min(heights.length - 1, heights.findIndex((value) => value >= height));
                return { weight: target.weight, value: autoPaint.deltaELab(target.lab, palette[Math.max(0, slice)]) };
            });
            const compressed = autoPaint.generateAutoLayers(scenario.filaments, scenario.imageSwatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, COMPRESSED_MAX_HEIGHT, scenario.enhancedColorMatch, scenario.allowRepeatedSwaps, { algorithm, seed });
            const used = new Set(errors76.map((_, targetIndex) => palette.reduce((best, entry, index) => autoPaint.deltaELab(targets[targetIndex].lab, entry) < autoPaint.deltaELab(targets[targetIndex].lab, palette[best]) ? index : best, 0)));
            output.push({ scenario: scenario.name, algorithm, seed, colorError: { cie76: weightedSummary(errors76), ciede2000: weightedSummary(errors2000), coverageAt2_3: coverage(2.3), coverageAt5: coverage(5) }, realizedError: weightedSummary(realized), structure: { totalHeight: result.totalHeight, layerCount: slices.colorSliceHeights.length, sequenceLength: result.filamentOrder.length, wastedLayerFraction: slices.colorSliceHeights.length ? (slices.colorSliceHeights.length - used.size) / slices.colorSliceHeights.length : 0, compressedMaxHeight: COMPRESSED_MAX_HEIGHT, compressionRatio: compressed.compressionRatio }, cost: { wallTimeMs: elapsedMs, iterations: result.optimizerMetadata?.iterations ?? 0 } });
        }
    }
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results: output }, null, 2));
