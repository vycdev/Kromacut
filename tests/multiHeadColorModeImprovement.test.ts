import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadViteModule } from './helpers/viteModule.ts';
import { readPngFixture, testAssetsRoot } from './imageFixtures.ts';
import type { PrinterLayer } from '../src/lib/multiHeadAnalysis.ts';
import type { ThreeDControlsStateShape } from '../src/types/index.ts';

// Real Palette Proof and Matrix evidence, both grouping modes, original surfaces.

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
const { multiHeadBuildSnapshot, getMultiHeadRoutingPlan, MIN_MULTI_HEAD_PREDICTED_GAIN } =
    await loadViteModule<typeof import('../src/lib/multiHeadBuild.ts')>('/src/lib/multiHeadBuild.ts');

const LAYER_HEIGHT = 0.08;
const FIRST_LAYER_HEIGHT = 0.4;
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
const { fitAppearanceRankModel } = await loadViteModule<typeof import('../src/lib/appearanceModel.ts')>('/src/lib/appearanceModel.ts');
const { fingerprintAppearanceFilaments } = await loadViteModule<typeof import('../src/lib/appearanceProfile.ts')>('/src/lib/appearanceProfile.ts');
const { parseProfileFile, importProfiles } = await loadViteModule<typeof import('../src/lib/profileManager.ts')>('/src/lib/profileManager.ts');
const parsed = parseProfileFile(readFileSync(`${testAssetsRoot}/performance/8-colors-frontlit-2026-08-26/profile.kfil`, 'utf8'));
assert.ok(parsed);
const profile = importProfiles([], parsed).imported[0];
const filaments = profile.filaments;
const appearance = fitAppearanceRankModel(profile.appearance, {
    filamentProfileFingerprint: fingerprintAppearanceFilaments(filaments),
    layerHeight: LAYER_HEIGHT, firstLayerHeight: FIRST_LAYER_HEIGHT, transitionOpacity: 0.9, filaments,
});
assert.equal(profile.appearance?.proofs.length, 26);
assert.equal(profile.appearance?.stackMatrices?.length, 1);
const result = autoPaint.generateAutoLayers(filaments, colors, LAYER_HEIGHT, FIRST_LAYER_HEIGHT,
    undefined, false, false, undefined, appearance);
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
                  result.finalStack.appearanceModel.effectiveOptics, result.finalStack.appearanceModel
              )
            : null;
    const printed = new Set<string>();
    let weighted = 0;
    const pixels = buildPixelData(colors, layers, baseStack, result.finalStack);
    for (let i = 0; i < colors.length; i++) {
        const c = colors[i];
        const { targetRgb: rgb, layerIdx } = pixels[i];
        const printedHex =
            perColor?.get(c.hex)?.[layerIdx] ?? result.finalStack.layers[layerIdx].predictedColor.hex;
        const printedRgb = autoPaint.hexToRgb(printedHex);
        printed.add(printedHex);
        weighted +=
            deltaE2000([rgb.r, rgb.g, rgb.b], [printedRgb.r, printedRgb.g, printedRgb.b]) * c.count;
    }
    return {
        meanDeltaE: weighted / totalCount,
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
        const original = layers.map((layer) => layer.filamentIdx);
        for (const path of analysis.colorLayerFilaments.values()) {
            for (let i = 0; i < layers.length && layers[i].isFoundation; i++) {
                assert.equal(path[i], original[i], 'required opaque foundation stays fixed');
            }
        }
        const built = multiHeadBuildSnapshot({
            multiHeadMode: true, multiHeadCount: heads, paintMode: 'autopaint',
            autoPaintResult: result, filaments, layerHeight: LAYER_HEIGHT,
            slicerFirstLayerHeight: FIRST_LAYER_HEIGHT,
        } as ThreeDControlsStateShape, analysis);
        if (built.multiHeadMode) assert.ok(getMultiHeadRoutingPlan(built), 'improving paths must use the physical head schedule');
        return { ...measure(analysis), fallback: !built.multiHeadMode };
    };
    return { heads, luminance: run('luminance'), color: run('color') };
});

for (const { heads, luminance, color } of byHeads) {
    test(`rocco: calibrated gains clear the unchanged build gate at ${heads} heads`, () => {
        assert.equal(MIN_MULTI_HEAD_PREDICTED_GAIN, 0.25);
        assert.equal(color.fallback, false, 'color-based gain should clear the gate');
        assert.equal(luminance.fallback, heads === 2, 'keep the small two-head layer-based gain as a safe fallback');
        if (heads >= 3) {
            assert.ok(baseline.meanDeltaE - luminance.meanDeltaE > 1);
            assert.ok(baseline.meanDeltaE - color.meanDeltaE > 1.5);
        }
    });
    test(`rocco: color grouping is no worse than single-head printing at ${heads} heads`, () => {
        assert.ok(color.meanDeltaE <= baseline.meanDeltaE);
        assert.ok(color.distinctColors >= baseline.distinctColors);
    });

    test(`rocco: layer-based grouping is no worse than single-head printing at ${heads} heads`, () => {
        assert.ok(
            luminance.meanDeltaE <= baseline.meanDeltaE,
            `mean CIEDE2000 ${luminance.meanDeltaE.toFixed(2)} should not exceed single-head ${baseline.meanDeltaE.toFixed(2)}`
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
