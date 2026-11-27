import assert from 'node:assert/strict';
import test from 'node:test';
import { loadViteModule } from './helpers/viteModule.ts';
import type { Filament, RegionStack } from '../src/types/index.ts';

// autoPaint.ts reaches an extensionless-import graph, so load through Vite.
const { generateAutoLayers, hexToRgb, rgbToLab } =
    await loadViteModule<typeof import('../src/lib/autoPaint.ts')>('/src/lib/autoPaint.ts');
const { deltaE2000Lab } = await loadViteModule<typeof import('../src/lib/colorDifference.ts')>(
    '/src/lib/colorDifference.ts'
);
const {
    planRegionStacks,
    regionStackLayerSets,
    estimateRegionStackToolChanges,
    RegionLayerUsage,
    MAX_REGION_STACK_TARGETS,
    REGION_STACK_MASK_BUDGET,
} = await loadViteModule<typeof import('../src/lib/regionStacks.ts')>('/src/lib/regionStacks.ts');

const LAYER_HEIGHT = 0.12;
const FIRST_LAYER_HEIGHT = 0.2;

const BLACK: Filament = { id: 'black', color: '#111111', td: 0.6 };
const WHITE: Filament = { id: 'white', color: '#F4F4F4', td: 1.2 };
const RED: Filament = { id: 'red', color: '#D01C1C', td: 0.9 };
const BLUE: Filament = { id: 'blue', color: '#1C3CD0', td: 0.9 };
const YELLOW: Filament = { id: 'yellow', color: '#F0D020', td: 1.4 };
const FILAMENTS = [BLACK, WHITE, RED, BLUE, YELLOW];

// Saturated colors that no single shared order can serve well at once.
const SWATCHES = [
    { hex: '#C8241E', count: 400 },
    { hex: '#2440C0', count: 400 },
    { hex: '#E8CC30', count: 300 },
    { hex: '#EDEDED', count: 200 },
    { hex: '#1A1A1A', count: 200 },
    { hex: '#7A3A8A', count: 100 },
];

function autoPaint(filaments = FILAMENTS, maxHeight = 3) {
    return generateAutoLayers(filaments, SWATCHES, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, maxHeight);
}

function stack(...runs: Array<[string, number]>): Pick<RegionStack, 'runs' | 'layerCount'> {
    return {
        runs: runs.map(([filamentId, layerCount]) => ({
            filamentId,
            filamentColor: '#000000',
            layerCount,
        })),
        layerCount: runs.reduce((sum, [, count]) => sum + count, 0),
    };
}

test('layer sets line stacks up at the plate or at the face', () => {
    const stacks = [stack(['f', 2], ['a', 1]), stack(['f', 1], ['b', 3])];
    const bottom = regionStackLayerSets(stacks, 'bottom', 'f').map((set) => [...set].sort());
    assert.deepEqual(bottom, [['f'], ['b', 'f'], ['a', 'b'], ['b']]);
    // Top-aligned: the shorter stack sits on one layer of foundation backing.
    const top = regionStackLayerSets(stacks, 'top', 'f').map((set) => [...set].sort());
    assert.deepEqual(top, [['f'], ['b', 'f'], ['b', 'f'], ['a', 'b']]);
});

test('tool-change estimate counts extra filaments per layer and disjoint layer changes', () => {
    const sets = [new Set(['f']), new Set(['a', 'b']), new Set(['b']), new Set(['c'])];
    // Layer 1: one extra filament, layer 1 → 0 disjoint (+1), layer 3 disjoint from 2 (+1).
    assert.equal(estimateRegionStackToolChanges(sets), 3);
});

test('incremental layer usage matches a full recount for both alignments', () => {
    let seed = 11;
    const random = (n: number) => {
        seed = (seed * 1103515245 + 12345) % 2 ** 31;
        return seed % n;
    };
    const ids = ['f', 'a', 'b', 'c'];
    const randomLayers = () => [
        'f',
        ...Array.from({ length: random(7) }, () => ids[random(ids.length)]),
    ];
    const full = (regions: string[][], alignment: 'bottom' | 'top', cap: number) => {
        const sets = regionStackLayerSets(
            regions.map((layers) => stack(...layers.map((id): [string, number] => [id, 1]))),
            alignment,
            'f'
        );
        return {
            overflow: sets.reduce((sum, set) => sum + Math.max(0, set.size - cap), 0),
            slots: sets.reduce((sum, set) => sum + set.size, 0),
        };
    };
    for (const alignment of ['bottom', 'top'] as const) {
        for (let round = 0; round < 200; round++) {
            const regions = Array.from({ length: 1 + random(5) }, randomLayers);
            const cap = 1 + random(3);
            const usage = new RegionLayerUsage(
                regions.map((layers) => [...layers]),
                alignment,
                'f',
                cap
            );
            const before = full(regions, alignment, cap);
            assert.deepEqual({ overflow: usage.overflow, slots: usage.slots }, before);
            const t = random(regions.length);
            const next = randomLayers();
            const trial = regions.map((layers, i) => (i === t ? next : layers));
            const after = full(trial, alignment, cap);
            assert.deepEqual(usage.trial(t, next), after);
            usage.apply(t, next);
            assert.deepEqual({ overflow: usage.overflow, slots: usage.slots }, after);
        }
    }
});

test('shared-sequence prefixes keep the colors Auto-paint published', () => {
    const result = autoPaint();
    const plan = planRegionStacks({ result, filaments: FILAMENTS, alignment: 'bottom' });
    assert.ok(plan);
    const mappings = result.finalStack.targetMappings;
    const total = mappings.reduce((sum, mapping) => sum + mapping.usageWeight, 0);
    const expected =
        mappings.reduce((sum, mapping) => {
            const target = {
                L: mapping.targetLab[0],
                a: mapping.targetLab[1],
                b: mapping.targetLab[2],
            };
            return (
                sum +
                mapping.usageWeight *
                    deltaE2000Lab(target, rgbToLab(hexToRgb(mapping.predictedColor.hex)))
            );
        }, 0) / total;
    assert.ok(
        Math.abs(plan.sharedDeltaE - expected) < 1e-9,
        `shared ΔE ${plan.sharedDeltaE} should match Auto-paint ${expected}`
    );
    // A target that stays on its shared prefix shows the published color.
    for (const [i, entry] of plan.stacks.entries()) {
        if (entry.shared) assert.equal(entry.predictedHex, mappings[i].predictedColor.hex);
    }
});

test('colors Auto-paint drops for zero weight still get their own stack', () => {
    const result = autoPaint();
    const extra = '#E05AB0';
    assert.ok(
        !result.finalStack.targetMappings.some(
            (m) => m.targetColor.hex.toLowerCase() === extra.toLowerCase()
        )
    );
    const plan = planRegionStacks({
        result,
        filaments: FILAMENTS,
        alignment: 'bottom',
        imageSwatches: [...SWATCHES, { hex: extra }],
    });
    assert.ok(plan);
    const entry = plan.stacks.find(
        (stack) => stack.targetHex.toLowerCase() === extra.toLowerCase()
    );
    assert.ok(entry, 'the dropped color is planned');
    assert.equal(entry.usageWeight, 0);
    assert.equal(plan.stacks.length, result.finalStack.targetMappings.length + 1);
});

test('large images plan fewer colors so masks stay within the memory budget', () => {
    const result = autoPaint();
    const targets = result.finalStack.targetMappings.length;
    const fits = Math.floor(REGION_STACK_MASK_BUDGET / targets);
    const options = { result, filaments: FILAMENTS, alignment: 'bottom' as const };
    assert.ok(planRegionStacks({ ...options, pixelCount: fits }));
    assert.equal(planRegionStacks({ ...options, pixelCount: fits + targets }), null);
});

test('long shared prefixes are cut to the top layers that still decide their color', () => {
    // The 8 translucent filaments of a real profile, on thin layers: every
    // run lets light through, but a few runs deep the color stops changing.
    const translucent: Filament[] = [
        ['#ffffff', 0.376],
        ['#000000', 0.05],
        ['#ff7eb4', 0.335],
        ['#f7d000', 0.334],
        ['#d83400', 0.456],
        ['#6300c5', 0.328],
        ['#00b8c4', 0.298],
        ['#04bb00', 0.259],
    ].map(([color, td], i) => ({ id: `t${i}`, color: color as string, td: td as number }));
    const swatches = [
        '#fe2638',
        '#fc1980',
        '#ea1086',
        '#5b1791',
        '#301284',
        '#0068b8',
        '#009bcd',
        '#03ab97',
        '#49b448',
        '#bccd36',
        '#ddd03a',
        '#ff6a1d',
    ].map((hex) => ({ hex, count: 100 }));
    const result = generateAutoLayers(translucent, swatches, 0.08, 0.12, 3, true, true, {
        algorithm: 'fast',
        maxExtraRepeats: 4,
    });
    const plan = planRegionStacks({ result, filaments: translucent, alignment: 'top' });
    assert.ok(plan);
    assert.ok(
        plan.layerCount < result.finalStack.layers.length * 0.6,
        `slab ${plan.layerCount} layers vs shared ${result.finalStack.layers.length}`
    );
    assert.ok(plan.deltaE <= plan.sharedDeltaE + 1e-9);
    plan.stacks.forEach((entry, i) => {
        const mapping = result.finalStack.targetMappings[i];
        const shared = deltaE2000Lab(
            { L: mapping.targetLab[0], a: mapping.targetLab[1], b: mapping.targetLab[2] },
            rgbToLab(hexToRgb(mapping.predictedColor.hex))
        );
        assert.ok(entry.deltaE <= shared + 0.1 + 1e-9, `${entry.targetHex} got worse`);
        // A color may only get (invisibly) worse if it still looks like its old color.
        if (entry.deltaE > shared + 1e-9) {
            const shift = deltaE2000Lab(
                rgbToLab(hexToRgb(entry.predictedHex)),
                rgbToLab(hexToRgb(mapping.predictedColor.hex))
            );
            assert.ok(shift <= 0.5 + 1e-9, `${entry.targetHex} moved ${shift.toFixed(2)} ΔE`);
        }
    });
});

test('Preserve color separation keeps separated colors apart with their own stacks', () => {
    const limit = 15;
    const swatches = [
        ...SWATCHES,
        { hex: '#A0A0A0', count: 300 },
        { hex: '#B7B7B7', count: 300 },
        { hex: '#8C8C8C', count: 200 },
        { hex: '#C8241F', count: 10 },
    ];
    const result = generateAutoLayers(
        FILAMENTS,
        swatches,
        LAYER_HEIGHT,
        FIRST_LAYER_HEIGHT,
        3,
        true,
        false,
        {
            algorithm: 'fast',
            preserveSeparation: true,
            separationMaxDeltaE: limit,
        }
    );
    assert.equal(result.finalStack.settings.separationMaxDeltaE, limit);
    for (const alignment of ['bottom', 'top'] as const) {
        const plan = planRegionStacks({
            result,
            filaments: FILAMENTS,
            alignment,
            maxFilamentsPerLayer: FILAMENTS.length,
        });
        assert.ok(plan);
        const lab = (hex: string) => rgbToLab(hexToRgb(hex));
        const kept = result.finalStack.targetMappings
            .map((mapping, i) => ({ mapping, entry: plan.stacks[i] }))
            .filter(({ mapping }) => mapping.preservedWithinThreshold !== false);
        assert.ok(kept.length > 2);
        for (const { entry } of kept) assert.ok(entry.deltaE <= limit + 1e-9, entry.targetHex);
        for (const a of kept) {
            for (const b of kept) {
                if (a === b) continue;
                const before = deltaE2000Lab(
                    lab(a.mapping.predictedColor.hex),
                    lab(b.mapping.predictedColor.hex)
                );
                const after = deltaE2000Lab(lab(a.entry.predictedHex), lab(b.entry.predictedHex));
                assert.ok(
                    after >= Math.min(before, 3) - 1e-9,
                    `${alignment}: ${a.entry.targetHex}/${b.entry.targetHex} moved from ${before.toFixed(2)} to ${after.toFixed(2)} apart`
                );
            }
        }
    }
});

test('palettes above the target limit fall back to the shared sequence', () => {
    const many = Array.from({ length: MAX_REGION_STACK_TARGETS + 1 }, (_, i) => {
        const value = (i * 37) % 256;
        const hex = value.toString(16).padStart(2, '0');
        return { hex: `#${hex}${(255 - value).toString(16).padStart(2, '0')}${hex}`, count: 1 };
    });
    const result = generateAutoLayers(FILAMENTS, many, LAYER_HEIGHT, FIRST_LAYER_HEIGHT, 3);
    assert.ok(result.finalStack.targetMappings.length > MAX_REGION_STACK_TARGETS);
    assert.equal(planRegionStacks({ result, filaments: FILAMENTS, alignment: 'bottom' }), null);
});

test('every stack starts on the shared foundation and stays on the layer grid', () => {
    const result = autoPaint();
    const maxLayers =
        1 +
        Math.floor(
            (result.finalStack.settings.printableMaxHeight - FIRST_LAYER_HEIGHT) / LAYER_HEIGHT +
                1e-6
        );
    const plan = planRegionStacks({ result, filaments: FILAMENTS, alignment: 'bottom' });
    assert.ok(plan);
    assert.equal(plan.stacks.length, result.finalStack.targetMappings.length);
    for (const entry of plan.stacks) {
        assert.equal(entry.runs[0].filamentId, plan.foundationFilamentId);
        assert.equal(
            entry.layerCount,
            entry.runs.reduce((sum, run) => sum + run.layerCount, 0)
        );
        assert.ok(entry.layerCount <= Math.max(maxLayers, result.finalStack.layers.length));
        for (let i = 1; i < entry.runs.length; i++) {
            assert.notEqual(entry.runs[i].filamentId, entry.runs[i - 1].filamentId);
            assert.ok(entry.runs[i].layerCount >= 1);
        }
    }
});

test('per-region stacks beat the shared sequence when its order forces a compromise', () => {
    const result = autoPaint();
    const plan = planRegionStacks({
        result,
        filaments: FILAMENTS,
        alignment: 'bottom',
        maxFilamentsPerLayer: FILAMENTS.length,
    });
    assert.ok(plan);
    for (const entry of plan.stacks) assert.ok(Number.isFinite(entry.deltaE));
    assert.ok(
        plan.deltaE < plan.sharedDeltaE - 1,
        `per-region ΔE ${plan.deltaE} should clearly beat shared ${plan.sharedDeltaE}`
    );
    assert.ok(plan.stacks.some((entry) => !entry.shared));
});

test('no target is predicted worse than its shared prefix', () => {
    const result = autoPaint();
    const plan = planRegionStacks({
        result,
        filaments: FILAMENTS,
        alignment: 'bottom',
        maxFilamentsPerLayer: FILAMENTS.length,
    });
    assert.ok(plan);
    plan.stacks.forEach((entry, i) => {
        const mapping = result.finalStack.targetMappings[i];
        const shared = deltaE2000Lab(
            { L: mapping.targetLab[0], a: mapping.targetLab[1], b: mapping.targetLab[2] },
            rgbToLab(hexToRgb(mapping.predictedColor.hex))
        );
        // A region leaves its shared prefix only for a strictly better color.
        assert.ok(
            // An invisible tolerance lets a shorter stack stand in for its shared prefix.
            entry.deltaE <= shared + 0.1 + 1e-9,
            `${entry.targetHex}: ${entry.deltaE} vs shared ${shared}`
        );
    });
});

for (const alignment of ['bottom', 'top'] as const) {
    test(`${alignment}-aligned plans respect the per-layer filament cap`, () => {
        const result = autoPaint();
        for (const cap of [2, 3]) {
            const plan = planRegionStacks({
                result,
                filaments: FILAMENTS,
                alignment,
                maxFilamentsPerLayer: cap,
            });
            assert.ok(plan);
            const sets = regionStackLayerSets(plan.stacks, alignment, plan.foundationFilamentId);
            const peak = Math.max(...sets.map((set) => set.size));
            assert.equal(plan.peakFilamentsPerLayer, peak);
            assert.equal(plan.layerCount, sets.length);
            assert.equal(plan.toolChangeEstimate, estimateRegionStackToolChanges(sets));
            // Shared prefixes put one filament on every relief layer. Flat Paint
            // never needs more filaments per layer than its shared layout does.
            const sharedStacks = result.finalStack.targetMappings.map((mapping) => {
                const count = Math.max(
                    1,
                    result.finalStack.layers.filter(
                        (layer) => layer.endHeight <= mapping.projectedHeight + 1e-6
                    ).length
                );
                return stack(
                    ...result.finalStack.layers
                        .slice(0, count)
                        .map((layer): [string, number] => [layer.filamentId, 1])
                );
            });
            const sharedPeak = Math.max(
                ...regionStackLayerSets(sharedStacks, alignment, plan.foundationFilamentId).map(
                    (set) => set.size
                )
            );
            if (alignment === 'bottom') assert.equal(sharedPeak, 1);
            assert.ok(peak <= Math.max(cap, sharedPeak), `cap ${cap}: peak ${peak}`);
        }
    });
}

test('a tighter cap never lowers the error', () => {
    const result = autoPaint();
    const errors = [1, 2, 3, FILAMENTS.length].map(
        (cap) =>
            planRegionStacks({
                result,
                filaments: FILAMENTS,
                alignment: 'bottom',
                maxFilamentsPerLayer: cap,
            })!.deltaE
    );
    for (let i = 1; i < errors.length; i++)
        assert.ok(errors[i] <= errors[i - 1] + 1e-9, errors.join(', '));
});

test('a cap of one filament per layer falls back to the shared sequence in relief', () => {
    const result = autoPaint();
    const plan = planRegionStacks({
        result,
        filaments: FILAMENTS,
        alignment: 'bottom',
        maxFilamentsPerLayer: 1,
    });
    assert.ok(plan);
    assert.equal(plan.peakFilamentsPerLayer, 1);
    assert.ok(plan.deltaE <= plan.sharedDeltaE + 1e-9);
});

test('planning is deterministic', () => {
    const result = autoPaint();
    const options = {
        result,
        filaments: FILAMENTS,
        alignment: 'top' as const,
        maxFilamentsPerLayer: 3,
    };
    assert.deepEqual(planRegionStacks(options), planRegionStacks(options));
});
