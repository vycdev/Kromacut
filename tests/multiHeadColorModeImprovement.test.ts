import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadViteModule } from './helpers/viteModule.ts';
import { readPngFixture, testAssetsRoot } from './imageFixtures.ts';
import type { PrinterLayer } from '../src/lib/multiHeadAnalysis.ts';
import type { Filament } from '../src/types/index.ts';

// Measures whether the 'color' grouping mode actually reproduces a real image
// better than the default 'luminance' mode, rather than only checking that the
// output is structurally valid (see multiHeadAnalysisColorFirst.test.ts).

const autoPaint =
    await loadViteModule<typeof import('../src/lib/autoPaint.ts')>('/src/lib/autoPaint.ts');
const { expandZonesToPrinterLayers, buildColorStack, luminanceToHeight, findLayerIdxAtHeight } =
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
const filaments = profile.filaments.map((f) => ({ id: f.id, color: f.color, td: f.td }));
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
                  filaments
              )
            : null;
    const printed = new Set<string>();
    let weighted = 0;
    for (const c of colors) {
        const rgb = autoPaint.hexToRgb(c.hex);
        const height = luminanceToHeight(
            autoPaint.getLuminance(rgb) / 255,
            result.transitionZones,
            result.totalHeight,
            FIRST_LAYER_HEIGHT
        );
        const layerIdx = findLayerIdxAtHeight(layers, height);
        const printedHex =
            perColor?.get(c.hex)?.[layerIdx] ?? autoPaint.rgbToHex(baseStack[layerIdx]);
        const printedRgb = autoPaint.hexToRgb(printedHex);
        printed.add(printedHex);
        weighted +=
            deltaE2000([rgb.r, rgb.g, rgb.b], [printedRgb.r, printedRgb.g, printedRgb.b]) * c.count;
    }
    return { meanDeltaE: weighted / totalCount, distinctColors: printed.size };
}

const baseline = measure({ patchedLayers: [], colorLayerFilaments: new Map() });
const byHeads = HEAD_COUNTS.map((heads) => {
    const run = (mode: 'luminance' | 'color') =>
        measure(
            runMultiHeadLayerAnalysisColorFirst(
                filaments,
                result,
                colors,
                LAYER_HEIGHT,
                FIRST_LAYER_HEIGHT,
                heads,
                'balanced',
                mode
            )
        );
    return { heads, luminance: run('luminance'), color: run('color') };
});

for (const { heads, luminance, color } of byHeads) {
    test(`rocco: color grouping beats luminance grouping at ${heads} heads`, () => {
        assert.ok(
            color.meanDeltaE < luminance.meanDeltaE,
            `mean ΔE2000 color ${color.meanDeltaE.toFixed(2)} should be below luminance ${luminance.meanDeltaE.toFixed(2)}`
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
}

test('rocco: color grouping lowers mean ΔE2000 by at least 1 on average across head counts', () => {
    const gain =
        byHeads.reduce((sum, r) => sum + (r.luminance.meanDeltaE - r.color.meanDeltaE), 0) /
        byHeads.length;
    assert.ok(gain >= 1, `average ΔE2000 improvement was only ${gain.toFixed(2)}`);
});
