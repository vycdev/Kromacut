import assert from 'node:assert/strict';
import test from 'node:test';
import { loadViteModule } from './helpers/viteModule.ts';
import type { AppearanceRankModelV1 } from '../src/types/appearance.ts';
import type { ThreeDControlsStateShape } from '../src/types/index.ts';

const { hexToRgb, rgbToLab, rgbToHex, generateAutoLayers } =
    await loadViteModule<typeof import('../src/lib/autoPaint.ts')>('/src/lib/autoPaint.ts');
const {
    buildColorRuns,
    computeColorOptimalAssignments,
    runMultiHeadLayerAnalysisColorFirst,
    APPEARANCE_SHORTLIST_SIZE,
} = await loadViteModule<typeof import('../src/lib/multiHeadAnalysisColorFirst.ts')>(
    '/src/lib/multiHeadAnalysisColorFirst.ts'
);
const { createIdentityAppearanceRankModel, resolveAppearanceRankModel, appearanceLabToRgb } =
    await loadViteModule<typeof import('../src/lib/appearanceModel.ts')>(
        '/src/lib/appearanceModel.ts'
    );
const { createPriorEffectiveOpticsModel, predictEffectiveAutoPaintColor } = await loadViteModule<
    typeof import('../src/lib/effectiveOptics.ts')
>('/src/lib/effectiveOptics.ts');
const { deltaE2000Lab } = await loadViteModule<typeof import('../src/lib/colorDifference.ts')>(
    '/src/lib/colorDifference.ts'
);
const { multiHeadPredictedGain, multiHeadBuildSnapshot, getMultiHeadRoutingPlan } =
    await loadViteModule<typeof import('../src/lib/multiHeadBuild.ts')>(
        '/src/lib/multiHeadBuild.ts'
    );
const { buildPerColorLayerColors } = await loadViteModule<
    typeof import('../src/lib/patchedLayersToPlan.ts')
>('/src/lib/patchedLayersToPlan.ts');

const filaments = [
    { id: 'base', color: '#101010', td: 0.4 },
    { id: 'grey', color: '#777777', td: 0.7 },
    { id: 'white', color: '#ffffff', td: 1.2 },
];
const optics = createPriorEffectiveOpticsModel(filaments);
const sequence = [0, 1, 1, 2, 2, 1, 1];
const layers = sequence.map((fi, i) => ({
    filamentIdx: fi,
    filamentId: filaments[fi].id,
    filamentColor: filaments[fi].color,
    filamentRgb: hexToRgb(filaments[fi].color),
    td: filaments[fi].td,
    startZ: i * 0.25,
    thickness: 0.25,
}));
const runs = buildColorRuns(layers).slice(1, 3);
const windowFilaments = [1, 2].map((fi) => ({
    filamentIdx: fi,
    filamentId: filaments[fi].id,
    rgb: hexToRgb(filaments[fi].color),
    td: filaments[fi].td,
}));

function recipe(entry: number[], surface: number) {
    return layers.slice(0, surface + 1).map((layer, i) => {
        const slot = runs.findIndex((run) => i >= run.startLayerIdx && i <= run.endLayerIdx);
        const fi = slot < 0 ? layer.filamentIdx : windowFilaments[entry[slot]].filamentIdx;
        return {
            filamentId: filaments[fi].id,
            filamentColor: filaments[fi].color,
            thickness: layer.thickness,
        };
    });
}

/** Independent oracle: shared effective predictor + appearance resolver + canonical preview RGB. */
function prediction(entry: number[], surface: number, model: AppearanceRankModelV1) {
    const prefix = recipe(entry, surface);
    const [r, g, b] = predictEffectiveAutoPaintColor(optics, prefix)!;
    const resolved = resolveAppearanceRankModel(rgbToLab({ r, g, b }), model, prefix);
    const corrected =
        model.applied || resolved.exactAnchor || resolved.empiricalMatch || resolved.localMatch
            ? appearanceLabToRgb(resolved.lab)
            : [r, g, b];
    return rgbToLab(hexToRgb(rgbToHex({ r: corrected[0], g: corrected[1], b: corrected[2] })));
}

test('run search reranks proof anchors even without a global appearance fit', () => {
    const targetRgb = hexToRgb('#fa50a0');
    const lab = rgbToLab(targetRgb);
    const model: AppearanceRankModelV1 = {
        ...createIdentityAppearanceRankModel(),
        effectiveOptics: optics,
        exactAnchors: [
            {
                id: 'anchor',
                proofId: 'proof',
                source: 'palette-proof',
                sourceStackKey: 'recipe',
                targetLab: [lab.L, lab.a, lab.b],
                suffixLayers: recipe([1, 1], 6),
                maxSubstrateTransmission: 0.05,
            },
        ],
    };
    const pixel = { targetRgb, layerIdx: 6, count: 1, actualErr: 100 };
    const cheap = computeColorOptimalAssignments(
        runs,
        4,
        layers,
        layers[0].filamentRgb,
        windowFilaments,
        [pixel],
        65536,
        [0, 1],
        optics
    );
    const full = () =>
        computeColorOptimalAssignments(
            runs,
            4,
            layers,
            layers[0].filamentRgb,
            windowFilaments,
            [pixel],
            65536,
            [0, 1],
            optics,
            model
        );
    assert.notDeepEqual(
        cheap.assignments[0],
        [1, 1],
        'fixture must expose the fitted-optics mismatch'
    );
    assert.deepEqual(full().assignments[0], [1, 1]);
    assert.deepEqual(full(), full(), 'full reranking is deterministic');
});

test('full reconciliation minimizes weighted member CIEDE2000 on physical prefixes and suffixes', () => {
    const model = {
        ...createIdentityAppearanceRankModel(),
        effectiveOptics: optics,
        applied: true,
        deltaL: 9,
    };
    for (const surface of [1, 2, 4, 6]) {
        for (const heavy of [0, 1]) {
            const members = ['#262c31', '#b6a88a'].map((hex, i) => ({
                lab: rgbToLab(hexToRgb(hex)),
                count: i === heavy ? 90 : 1,
            }));
            // Deliberately unrelated centroid: the full score must use the original members.
            const pixel = {
                targetRgb: hexToRgb('#ff0000'),
                layerIdx: surface,
                count: 91,
                targets: members,
                actualErr: 100,
            };
            const result = computeColorOptimalAssignments(
                runs,
                4,
                layers,
                layers[0].filamentRgb,
                windowFilaments,
                [pixel],
                65536,
                [0, 1],
                optics,
                model
            );
            const error = (entry: number[]) =>
                members.reduce(
                    (sum, m) =>
                        sum + deltaE2000Lab(m.lab, prediction(entry, surface, model)) * m.count,
                    0
                );
            const candidates = [
                [0, 0],
                [1, 0],
                [0, 1],
                [1, 1],
            ];
            assert.equal(
                error(result.assignments[0]!),
                Math.min(...candidates.map(error)),
                `surface ${surface}, heavy ${heavy}`
            );
        }
    }
});

test('full-model predictions remain bounded when the broad search grows', () => {
    let anchorReads = 0;
    const model = {
        ...createIdentityAppearanceRankModel(),
        effectiveOptics: optics,
        get exactAnchors() {
            anchorReads++;
            return [];
        },
    };
    // 2^10 broad orders but just one occupied surface and a 32-entry shortlist.
    const longLayers = Array.from({ length: 11 }, (_, i) => layers[i === 0 ? 0 : i % 2 ? 1 : 3]);
    const longRuns = longLayers.slice(1).map((layer, i) => ({
        filamentIdx: layer.filamentIdx,
        startLayerIdx: i + 1,
        endLayerIdx: i + 1,
    }));
    const current = longRuns.map((run) => (run.filamentIdx === 1 ? 0 : 1));
    computeColorOptimalAssignments(
        longRuns,
        10,
        longLayers,
        longLayers[0].filamentRgb,
        windowFilaments,
        [{ targetRgb: hexToRgb('#999999'), layerIdx: 10, count: 1, actualErr: 100 }],
        65536,
        current,
        optics,
        model
    );
    assert.ok(anchorReads > 0);
    assert.ok(
        anchorReads <= 4 * (APPEARANCE_SHORTLIST_SIZE + 1),
        `${anchorReads} reads exceeds the bounded shortlist`
    );
});

test('full reconciliation retains the current path on ties, including zero-weight targets', () => {
    const model = { ...createIdentityAppearanceRankModel(), effectiveOptics: optics };
    const current = [0, 1];
    const predicted = prediction(current, 1, model);
    // Only slot zero can affect this surface; slot one must survive the tie.
    for (const count of [0, 10]) {
        const pixel = {
            targetRgb: hexToRgb('#333333'),
            layerIdx: 1,
            count,
            actualErr: 100,
            targets: [{ lab: predicted, count }],
        };
        // For zero usage, retain a finite target matching the same current prefix.
        const prefix = recipe(current, 1);
        const [r, g, b] = predictEffectiveAutoPaintColor(optics, prefix)!;
        pixel.targetRgb = hexToRgb(rgbToHex({ r, g, b }));
        const run = () =>
            computeColorOptimalAssignments(
                runs,
                4,
                layers,
                layers[0].filamentRgb,
                windowFilaments,
                [pixel],
                3,
                current,
                optics,
                model
            );
        assert.deepEqual(run().assignments[0], current);
        assert.deepEqual(run(), run());
    }
});

test('seeded corrected stacks preserve weighted error, foundation, and routing across multiple windows', (t) => {
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'group', () => {});
    t.mock.method(console, 'groupEnd', () => {});
    let seed = 113;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    const color = () =>
        '#' +
        Math.floor(random() * 0x1000000)
            .toString(16)
            .padStart(6, '0');
    let multipleWindows = 0;
    let accepted = 0;
    for (let fixture = 0; fixture < 20; fixture++) {
        const profile = Array.from({ length: 6 }, (_, i) => ({
            id: `f${i}`,
            color: color(),
            td: 0.2 + random() * 0.8,
        }));
        const swatches = Array.from({ length: 14 }, (_, i) => ({
            hex: color(),
            count: i % 6 === 0 ? 0 : random() * 100,
        }));
        const appearance = {
            ...createIdentityAppearanceRankModel(),
            applied: true,
            deltaL: (random() - 0.5) * 20,
            effectiveOptics: createPriorEffectiveOpticsModel(profile),
        };
        const original = generateAutoLayers(
            profile,
            swatches,
            0.2,
            0.3,
            undefined,
            false,
            false,
            undefined,
            appearance
        );
        for (const heads of [2, 3, 4])
            for (const mode of ['luminance', 'color'] as const) {
                const result = runMultiHeadLayerAnalysisColorFirst(
                    profile,
                    original,
                    swatches,
                    0.2,
                    0.3,
                    heads,
                    'balanced',
                    mode
                );
                if (!result.windows.length) continue;
                if (result.windows.length > 1) multipleWindows++;
                const colors = buildPerColorLayerColors(
                    result.patchedLayers,
                    result.colorLayerFilaments,
                    profile,
                    original.finalStack.appearanceModel.effectiveOptics,
                    original.finalStack.appearanceModel
                );
                const gain = multiHeadPredictedGain(
                    original.finalStack,
                    result.patchedLayers,
                    colors
                );
                assert.ok(
                    gain >= -1e-8,
                    `fixture ${fixture}, ${heads} heads, ${mode}: gain ${gain}`
                );
                assert.equal(
                    result.colorLayerFilaments.size,
                    swatches.length,
                    'zero-weight colors still need printable paths'
                );
                for (const path of result.colorLayerFilaments.values()) {
                    for (
                        let i = 0;
                        i < result.patchedLayers.length && result.patchedLayers[i].isFoundation;
                        i++
                    ) {
                        assert.equal(path[i], result.patchedLayers[i].filamentIdx);
                    }
                }
                const built = multiHeadBuildSnapshot(
                    {
                        multiHeadMode: true,
                        multiHeadCount: heads,
                        paintMode: 'autopaint',
                        filaments: profile,
                        autoPaintResult: original,
                        layerHeight: 0.2,
                        slicerFirstLayerHeight: 0.3,
                    } as ThreeDControlsStateShape,
                    result
                );
                if (built.multiHeadMode) {
                    assert.ok(
                        getMultiHeadRoutingPlan(built),
                        'accepted routes must use scheduled physical heads'
                    );
                    accepted++;
                }
            }
    }
    assert.ok(multipleWindows > 0, 'exercise reconciliation across different physical contexts');
    assert.ok(accepted > 0, 'exercise the accepted build path');
});
