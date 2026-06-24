import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

import { autoPaintGoldenScenarios } from './autoPaintGoldenFixtures.ts';

type AutoPaintModule = typeof import('../src/lib/autoPaint.ts');
type AutoPaintResult = ReturnType<AutoPaintModule['generateAutoLayers']>;
type Sample = { value: number; weight: number };

const LAYER_HEIGHT = 0.08;
const FIRST_LAYER_HEIGHT = 0.16;
const COMPRESSED_MAX_HEIGHT = 1.2;

/**
 * Realized-quality floors for the printable (max-height-capped) stack, measured
 * in CIEDE2000 against the raw image colors through the shared optimizer mapper.
 *
 * Unlike the exact-match goldens, these are deliberately loose guards: they let
 * orderings be re-tuned, but fail if the objective ever regresses visible print
 * quality. Catastrophic-mismatch fixtures (e.g. B&W) are excluded because no
 * ordering can satisfy a meaningful budget there.
 */
const QUALITY_BUDGETS: Record<string, { meanMax: number; p95Max: number; coverage6Min: number }> = {
    'GH#27 / large-jpeg / enhanced=true / repeats=true': { meanMax: 11, p95Max: 22, coverage6Min: 0.35 },
    'Current 8 Colors / logo-png / enhanced=true / repeats=true': { meanMax: 12, p95Max: 20, coverage6Min: 0.15 },
    'Current 8 Colors / large-jpeg / enhanced=true / repeats=true': { meanMax: 15, p95Max: 23, coverage6Min: 0.08 },
};

let autoPaintModule: Promise<AutoPaintModule> | null = null;

async function loadAutoPaintModule(): Promise<AutoPaintModule> {
    autoPaintModule ??= (async () => {
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
    })();
    return autoPaintModule;
}

function cumulativeHeights(sliceHeights: number[], colorOrder: number[]): number[] {
    let total = 0;
    return colorOrder.map((index, position) => {
        total += position === 0 ? Math.max(sliceHeights[index], FIRST_LAYER_HEIGHT) : sliceHeights[index];
        return total;
    });
}

function realizedQuality(autoPaint: AutoPaintModule, result: AutoPaintResult, imageSwatches: Array<{ hex: string; count?: number }>) {
    const slices = autoPaint.autoPaintToSliceHeights(result, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
    const heights = cumulativeHeights(slices.colorSliceHeights, slices.colorOrder);
    const palette = slices.virtualSwatches.map((swatch, index) => {
        const rgb = autoPaint.hexToRgb(swatch.hex);
        return { height: heights[index], lab: autoPaint.rgbToLab(rgb), rgb };
    });
    const targets = imageSwatches.map((swatch) => {
        const lab = autoPaint.rgbToLab(autoPaint.hexToRgb(swatch.hex));
        return { L: lab.L, a: lab.a, b: lab.b, weight: swatch.count ?? 1 };
    });

    const samples: Sample[] = autoPaint
        .mapTargetsToPrintablePalette(palette, targets)
        .map((entry) => ({ value: autoPaint.deltaE2000Lab(entry.mappedLab, entry.target), weight: entry.target.weight }));

    const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
    const mean = samples.reduce((sum, sample) => sum + sample.value * sample.weight, 0) / totalWeight;
    const p95 = autoPaint.weightedErrorPercentile(samples, 0.95);
    const coverage6 = samples.filter((s) => s.value <= 6).reduce((sum, s) => sum + s.weight, 0) / totalWeight;
    return { mean, p95, coverage6 };
}

test('printable auto-paint stacks meet realized ΔE00 quality budgets', async (t) => {
    const autoPaint = await loadAutoPaintModule();
    const scenarios = autoPaintGoldenScenarios();

    for (const [name, budget] of Object.entries(QUALITY_BUDGETS)) {
        const scenario = scenarios.find((candidate) => candidate.name === name);
        assert.ok(scenario, `quality-budget scenario "${name}" not found in fixtures`);

        await t.test(name, () => {
            const result = autoPaint.generateAutoLayers(
                scenario.filaments,
                scenario.imageSwatches,
                LAYER_HEIGHT,
                FIRST_LAYER_HEIGHT,
                COMPRESSED_MAX_HEIGHT,
                scenario.enhancedColorMatch,
                scenario.allowRepeatedSwaps,
                { algorithm: 'auto', seed: scenario.seed }
            );
            const { mean, p95, coverage6 } = realizedQuality(autoPaint, result, scenario.imageSwatches);

            assert.ok(mean <= budget.meanMax, `mean ΔE00 ${mean.toFixed(2)} exceeds budget ${budget.meanMax}`);
            assert.ok(p95 <= budget.p95Max, `p95 ΔE00 ${p95.toFixed(2)} exceeds budget ${budget.p95Max}`);
            assert.ok(
                coverage6 >= budget.coverage6Min,
                `coverage@ΔE00≤6 ${(coverage6 * 100).toFixed(1)}% below floor ${(budget.coverage6Min * 100).toFixed(1)}%`
            );
        });
    }
});
