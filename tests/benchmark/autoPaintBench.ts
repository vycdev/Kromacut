import { performance } from 'node:perf_hooks';

import { autoPaintGoldenScenarios } from '../autoPaintGoldenFixtures.ts';
import { loadViteModule } from '../helpers/viteModule.ts';

type AutoPaintModule = typeof import('../../src/lib/autoPaint.ts');
type Algorithm = 'fast' | 'balanced' | 'thorough' | 'deep' | 'exact';
type Lab = { L: number; a: number; b: number };
type WeightedLab = Lab & { weight: number };
type Sample = { value: number; weight: number };
type AutoPaintResult = ReturnType<AutoPaintModule['generateAutoLayers']>;

const LAYER_HEIGHT = 0.08;
const FIRST_LAYER_HEIGHT = 0.16;
const COMPRESSED_MAX_HEIGHT = 1.2;
const SEEDS = [0x4b524f4d, 0x4b524f4e, 0x4b524f4f];

function weightedSummary(samples: Sample[]) {
    const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
    const weightedMean = totalWeight > 0
        ? samples.reduce((sum, sample) => sum + sample.value * sample.weight, 0) / totalWeight
        : 0;
    const ordered = [...samples].sort((a, b) => a.value - b.value);
    let cumulative = 0;
    const p95 = ordered.find((sample) => (cumulative += sample.weight) >= totalWeight * 0.95)?.value ?? 0;
    return { weightedMean, p95 };
}

function coverage(samples: Sample[], limit: number) {
    const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
    if (totalWeight <= 0) return 0;
    return samples
        .filter((sample) => sample.value <= limit)
        .reduce((sum, sample) => sum + sample.weight, 0) / totalWeight;
}

function cumulativeHeights(sliceHeights: number[], colorOrder: number[]) {
    let total = 0;
    return colorOrder.map((index, position) => {
        total += position === 0 ? Math.max(sliceHeights[index], FIRST_LAYER_HEIGHT) : sliceHeights[index];
        return total;
    });
}

const autoPaint = await loadViteModule<AutoPaintModule>('/src/lib/autoPaint.ts');

// Build the printed palette exactly as the preview renders it: the per-layer
// virtual blend colors stacked at their cumulative print heights.
function realizedPalette(result: AutoPaintResult) {
    const slices = autoPaint.autoPaintToSliceHeights(result, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const heights = cumulativeHeights(slices.colorSliceHeights, slices.colorOrder);
    return slices.virtualSwatches.map((swatch, index) => {
        const rgb = autoPaint.hexToRgb(swatch.hex);
        return { height: heights[index], lab: autoPaint.rgbToLab(rgb), rgb };
    });
}

// Realized error of the printed stack, measured through the SAME canonical
// mapper the optimizer scores with (no separately-implemented projection).
function realizedError(result: AutoPaintResult, targets: WeightedLab[]) {
    const palette = realizedPalette(result);
    if (palette.length === 0) return { weightedMean: 0, p95: 0, coverageAt3: 0, coverageAt6: 0 };
    const mapped = autoPaint.mapTargetsToPrintablePalette(palette, targets);
    const samples: Sample[] = mapped.map((entry) => ({
        value: autoPaint.deltaE2000Lab(entry.mappedLab, entry.target),
        weight: entry.target.weight,
    }));
    return {
        ...weightedSummary(samples),
        coverageAt3: coverage(samples, 3),
        coverageAt6: coverage(samples, 6),
    };
}

const output: unknown[] = [];

for (const scenario of autoPaintGoldenScenarios().filter(
    (scenario) => scenario.enhancedColorMatch && scenario.allowRepeatedSwaps
)) {
    const algorithms: Algorithm[] = ['fast', 'balanced', 'thorough', 'deep', 'exact'];
    // Measure against the raw image colors (ground truth), not the optimizer's
    // clustered targets, so the benchmark is an independent yardstick.
    const targets: WeightedLab[] = scenario.imageSwatches.map((swatch) => {
        const lab = autoPaint.rgbToLab(autoPaint.hexToRgb(swatch.hex));
        return { L: lab.L, a: lab.a, b: lab.b, weight: swatch.count ?? 1 };
    });
    // Theoretical floor: best match of each target to any palette color.
    const paletteFloor = (result: AutoPaintResult): Sample[] => {
        const palette = realizedPalette(result);
        return targets.map((target) => ({
            value: palette.length
                ? Math.min(...palette.map((entry) => autoPaint.deltaE2000Lab(target, entry.lab)))
                : 0,
            weight: target.weight,
        }));
    };
    for (const algorithm of algorithms) {
        const seeds = algorithm === 'balanced' ? SEEDS : [SEEDS[0]];
        for (const seed of seeds) {
            const start = performance.now();
            const result = autoPaint.generateAutoLayers(scenario.filaments, scenario.imageSwatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, undefined, scenario.enhancedColorMatch, scenario.allowRepeatedSwaps, { algorithm, seed });
            const elapsedMs = performance.now() - start;
            const compressed = autoPaint.generateAutoLayers(scenario.filaments, scenario.imageSwatches, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, COMPRESSED_MAX_HEIGHT, scenario.enhancedColorMatch, scenario.allowRepeatedSwaps, { algorithm, seed });
            const slices = autoPaint.autoPaintToSliceHeights(result, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
            const compressedSlices = autoPaint.autoPaintToSliceHeights(compressed, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
            output.push({
                scenario: scenario.name,
                algorithm,
                seed,
                paletteFloorCiede2000: weightedSummary(paletteFloor(result)),
                realized: {
                    uncompressed: realizedError(result, targets),
                    compressed: realizedError(compressed, targets),
                },
                structure: {
                    totalHeight: result.totalHeight,
                    layerCount: slices.colorSliceHeights.length,
                    sequenceLength: result.filamentOrder.length,
                    compressedMaxHeight: COMPRESSED_MAX_HEIGHT,
                    compressedLayerCount: compressedSlices.colorSliceHeights.length,
                    compressionRatio: compressed.compressionRatio,
                },
                cost: { wallTimeMs: elapsedMs, iterations: result.optimizerMetadata?.iterations ?? 0 },
            });
        }
    }
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results: output }, null, 2));
