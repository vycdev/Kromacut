import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadViteModule } from './helpers/viteModule.ts';
import { readPngFixture, testAssetsRoot } from './imageFixtures.ts';
import type { PrinterLayer } from '../src/lib/multiHeadAnalysis.ts';
import type { Filament } from '../src/types/index.ts';
import { buildMultiHeadSchedule } from '../src/lib/multiHeadSchedule.ts';

// Measure both grouping modes on the final printable grid with calibrated
// filaments. The optimizer minimizes CIE76; a lower CIEDE2000 error at every
// head count is not guaranteed by that objective or by color grouping.

const autoPaint =
    await loadViteModule<typeof import('../src/lib/autoPaint.ts')>('/src/lib/autoPaint.ts');
const { expandZonesToPrinterLayers, buildColorStack, buildPixelData } =
    await loadViteModule<typeof import('../src/lib/multiHeadAnalysis.ts')>(
        '/src/lib/multiHeadAnalysis.ts'
    );
const { runMultiHeadLayerAnalysisColorFirst } = await loadViteModule<
    typeof import('../src/lib/multiHeadAnalysisColorFirst.ts')
>('/src/lib/multiHeadAnalysisColorFirst.ts');
const { buildPerColorLayerColors } = await loadViteModule<
    typeof import('../src/lib/patchedLayersToPlan.ts')
>('/src/lib/patchedLayersToPlan.ts');
const { deltaE2000 } = await loadViteModule<typeof import('../src/lib/colorDifference.ts')>(
    '/src/lib/colorDifference.ts'
);

const LAYER_HEIGHT = 0.12;
const FIRST_LAYER_HEIGHT = 0.2;
const PALETTE_SIZE = 64;
const HEAD_COUNTS = [2, 3, 4];

/**
 * Deterministic palette: 5-bit-per-channel buckets from every 4th pixel, each
 * bucket averaged, keeping the most frequent PALETTE_SIZE with pixel counts.
 */
function paletteFromImage(path: string): Array<{ hex: string; count: number }> {
    const img = readPngFixture(path);
    const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
    for (let i = 0; i < img.width * img.height; i += 4) {
        const o = i * 4;
        if (img.rgba[o + 3] < 128) continue;
        const [r, g, b] = [img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]];
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        const entry = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
        entry.r += r;
        entry.g += g;
        entry.b += b;
        entry.n++;
        buckets.set(key, entry);
    }
    const channel = (v: number) => Math.round(v).toString(16).padStart(2, '0');
    return [...buckets.values()]
        .sort((a, b) => b.n - a.n)
        .slice(0, PALETTE_SIZE)
        .map((e) => ({
            hex: `#${channel(e.r / e.n)}${channel(e.g / e.n)}${channel(e.b / e.n)}`,
            count: e.n,
        }));
}

const colors = paletteFromImage(`${testAssetsRoot}/rocco__source.png`);
const profile = JSON.parse(
    readFileSync(`${testAssetsRoot}/filament-profiles/8_Colors_Calibrated_Frontlit.kfil`, 'utf8')
) as { filaments: Filament[] };
const filaments = profile.filaments;
const result = autoPaint.generateAutoLayers(filaments, colors, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
const layers = expandZonesToPrinterLayers(result, filaments, LAYER_HEIGHT, FIRST_LAYER_HEIGHT);
const totalCount = colors.reduce((sum, c) => sum + c.count, 0);

/**
 * Pixel-weighted mean CIEDE2000 between each image color and the color printed
 * where that color sits on the height map, plus the number of distinct printed
 * colors. A result with no patched layers prints the plain single-head stack.
 */
function measure(patched: {
    patchedLayers: PrinterLayer[];
    colorLayerFilaments: Map<string, number[]>;
}) {
    const baseStack = buildColorStack(layers);
    const perColor =
        patched.patchedLayers.length > 0
            ? buildPerColorLayerColors(
                  patched.patchedLayers,
                  patched.colorLayerFilaments,
                  filaments,
                  result.finalStack.appearanceModel.effectiveOptics
              )
            : null;
    const printed = new Set<string>();
    let weighted = 0;
    let weightedSearchError = 0;
    const pixels = buildPixelData(colors, layers, baseStack, result.finalStack);
    for (let i = 0; i < colors.length; i++) {
        const c = colors[i];
        const { targetRgb: rgb, layerIdx } = pixels[i];
        const printedHex =
            perColor?.get(c.hex)?.[layerIdx] ?? autoPaint.rgbToHex(baseStack[layerIdx]);
        const printedRgb = autoPaint.hexToRgb(printedHex);
        printed.add(printedHex);
        weighted +=
            deltaE2000([rgb.r, rgb.g, rgb.b], [printedRgb.r, printedRgb.g, printedRgb.b]) * c.count;
        weightedSearchError += autoPaint.deltaE(rgb, printedRgb) * c.count;
    }
    return {
        meanDeltaE: weighted / totalCount,
        meanSearchError: weightedSearchError / totalCount,
        distinctColors: printed.size,
    };
}

const baseline = measure({ patchedLayers: [], colorLayerFilaments: new Map() });
const byHeads = HEAD_COUNTS.map((heads) => {
    const run = (mode: 'luminance' | 'color') => {
        const analysis = runMultiHeadLayerAnalysisColorFirst(
            filaments,
            result,
            colors,
            LAYER_HEIGHT,
            FIRST_LAYER_HEIGHT,
            heads,
            'balanced',
            mode
        );
        const schedule = buildMultiHeadSchedule({
            ...analysis, multiHeadWindows: analysis.windows, filaments,
        });
        test(`rocco: ${mode}, ${heads} heads covers every printed layer with a loaded filament`, () => {
            assert.ok(schedule?.length, 'fixture must produce routed analysis');
            const pixels = buildPixelData(colors, layers, buildColorStack(layers), result.finalStack);
            for (let p = 0; p < colors.length; p++) {
                const path = analysis.colorLayerFilaments.get(colors[p].hex)!;
                for (let l = 0; l <= pixels[p].layerIdx; l++) {
                    const event = schedule.findLast((event) => event.startLayer <= l + 1)!;
                    assert.ok(event.nozzles.some((head) => head.filamentId === filaments[path[l]].id),
                        `${colors[p].hex}, layer ${l}: filament ${filaments[path[l]].id} is unloaded`);
                }
            }
        });
        return {
            ...measure(analysis),
            swapCount: schedule?.reduce((sum, event) => sum + event.swapCount, 0) ?? 0,
        };
    };
    return { heads, luminance: run('luminance'), color: run('color') };
});

for (const { heads, luminance, color } of byHeads) {
    test(`rocco: pruning requirements does not increase total swaps at ${heads} heads`, () => {
        // Recorded from merged develop (3ede317), in both grouping modes.
        const previousSwaps = { 2: 6, 3: 5, 4: 4 }[heads]!;
        assert.ok(luminance.swapCount <= previousSwaps);
        assert.ok(color.swapCount <= previousSwaps);
    });

    test(`rocco: color grouping improves the search objective at ${heads} heads`, () => {
        assert.ok(
            color.meanSearchError < luminance.meanSearchError,
            `mean CIE76 color ${color.meanSearchError.toFixed(2)} should be below luminance ${luminance.meanSearchError.toFixed(2)}`
        );
        assert.ok(
            color.distinctColors > luminance.distinctColors,
            `distinct printed colors color ${color.distinctColors} should exceed luminance ${luminance.distinctColors}`
        );
    });

    test(`rocco: color grouping is no worse than single-head printing at ${heads} heads`, () => {
        assert.ok(color.meanDeltaE <= baseline.meanDeltaE);
        assert.ok(color.distinctColors >= baseline.distinctColors);
    });

    test(`rocco: layer-based grouping is no worse than single-head printing at ${heads} heads`, () => {
        // Per-color colors must be rendered with the optics the analysis scores;
        // otherwise adding heads can measure worse than one head.
        assert.ok(
            luminance.meanSearchError <= baseline.meanSearchError,
            `mean CIE76 ${luminance.meanSearchError.toFixed(2)} should not exceed single-head ${baseline.meanSearchError.toFixed(2)}`
        );
    });
}

test('rocco: color grouping lowers mean ΔE2000 on average across head counts', (t) => {
    t.diagnostic(JSON.stringify({ baseline, byHeads }));
    const gain =
        byHeads.reduce((sum, r) => sum + (r.luminance.meanDeltaE - r.color.meanDeltaE), 0) /
        byHeads.length;
    assert.ok(gain > 0, `expected a positive average ΔE2000 improvement, got ${gain.toFixed(2)}`);
});
