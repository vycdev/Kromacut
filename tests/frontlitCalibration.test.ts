import assert from 'node:assert/strict';
import test from 'node:test';

import { loadViteModule } from './helpers/viteModule.ts';

type CalibrationModule = typeof import('../src/lib/calibration.ts');
type ColorDifferenceModule = typeof import('../src/lib/colorDifference.ts');
type ColorSpaceModule = typeof import('../src/lib/colorSpace.ts');

let calibrationModule: Promise<CalibrationModule> | null = null;
let colorDifferenceModule: Promise<ColorDifferenceModule> | null = null;
let colorSpaceModule: Promise<ColorSpaceModule> | null = null;

const loadCalibration = () =>
    (calibrationModule ??= loadViteModule<CalibrationModule>('/src/lib/calibration.ts'));
const loadColorDifference = () =>
    (colorDifferenceModule ??= loadViteModule<ColorDifferenceModule>(
        '/src/lib/colorDifference.ts'
    ));
const loadColorSpace = () =>
    (colorSpaceModule ??= loadViteModule<ColorSpaceModule>('/src/lib/colorSpace.ts'));

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace(/^#/, '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Simulate the physical opacity read for a filament that perfectly follows a
 * single-TD Beer-Lambert model: the smallest integer layer count whose over-black
 * blend is within `jnd` of the opaque filament color. Mirrors what a user would
 * report off the printed wedge.
 */
async function simulateOpacityRead(
    filamentColor: string,
    tdTrue: number,
    layerHeight: number,
    jnd: number,
    maxLayers = 200,
    baseColor = '#000000'
): Promise<number> {
    const { blendSrgbChannel } = await loadColorSpace();
    const { deltaE2000 } = await loadColorDifference();
    const rgb = hexToRgb(filamentColor);
    const base = hexToRgb(baseColor);

    for (let layers = 1; layers <= maxLayers; layers++) {
        const t = Math.pow(10, -(layers * layerHeight) / tdTrue);
        const blended: [number, number, number] = [
            blendSrgbChannel(base[0], rgb[0], t),
            blendSrgbChannel(base[1], rgb[1], t),
            blendSrgbChannel(base[2], rgb[2], t),
        ];
        if (deltaE2000(blended, rgb) <= jnd) return layers;
    }
    return maxLayers;
}

async function simulateOpacityReadWithTds(
    filamentColor: string,
    tdTrue: [number, number, number],
    layerHeight: number,
    jnd: number,
    maxLayers = 200,
    baseColor = '#000000'
): Promise<number> {
    const { blendSrgbChannel } = await loadColorSpace();
    const { deltaE2000 } = await loadColorDifference();
    const rgb = hexToRgb(filamentColor);
    const base = hexToRgb(baseColor);

    for (let layers = 1; layers <= maxLayers; layers++) {
        const thickness = layers * layerHeight;
        const blended: [number, number, number] = [
            blendSrgbChannel(base[0], rgb[0], Math.pow(10, -thickness / tdTrue[0])),
            blendSrgbChannel(base[1], rgb[1], Math.pow(10, -thickness / tdTrue[1])),
            blendSrgbChannel(base[2], rgb[2], Math.pow(10, -thickness / tdTrue[2])),
        ];
        if (deltaE2000(blended, rgb) <= jnd) return layers;
    }
    return maxLayers;
}

test('solveOpacityTransmission tolerates more background for darker (lower-contrast) colors', async () => {
    const { solveOpacityTransmission, OPACITY_JND } = await loadCalibration();

    const tWhite = solveOpacityTransmission('#ffffff', OPACITY_JND);
    const tDarkGray = solveOpacityTransmission('#282828', OPACITY_JND);

    assert.ok(tWhite !== undefined && tDarkGray !== undefined);
    // A bright color reaches the JND with only a sliver of background; a dark,
    // low-contrast color stays within the JND even with much more black showing.
    assert.ok(tWhite! < tDarkGray!, `expected T*(white)=${tWhite} < T*(darkgray)=${tDarkGray}`);
    assert.ok(tWhite! > 0 && tWhite! < 1);
    assert.ok(tDarkGray! > 0 && tDarkGray! < 1);
});

test('solveOpacityTransmission returns undefined for colors that cannot beat the black base', async () => {
    const { solveOpacityTransmission } = await loadCalibration();
    assert.equal(solveOpacityTransmission('#000000'), undefined);
    assert.equal(solveOpacityTransmission('#020202'), undefined);
});

test('computeFrontlitCalibration recovers the true TD from a synthetic read (round-trip)', async () => {
    const { computeFrontlitCalibration, OPACITY_JND } = await loadCalibration();
    const layerHeight = 0.04;

    const cases: Array<{ color: string; tdTrue: number }> = [
        { color: '#ffd400', tdTrue: 0.5 },
        { color: '#c08040', tdTrue: 0.35 },
        { color: '#3050c0', tdTrue: 0.28 },
        { color: '#a0a0a0', tdTrue: 0.45 },
    ];

    for (const { color, tdTrue } of cases) {
        const opacityLayers = await simulateOpacityRead(color, tdTrue, layerHeight, OPACITY_JND);
        const result = computeFrontlitCalibration({
            filamentColor: color,
            opacityLayers,
            layerHeight,
            firstLayerHeight: 0.2,
        });

        assert.ok(result.ok, `expected ${color} to calibrate`);
        if (!result.ok) return;

        const recovered = result.calibration.tdSingleValue;
        const relError = Math.abs(recovered - tdTrue) / tdTrue;
        // Integer-layer quantization is the only error source; keep well inside it.
        assert.ok(
            relError < 0.2,
            `${color}: recovered TD ${recovered.toFixed(3)} vs true ${tdTrue} (relErr ${(relError * 100).toFixed(1)}%, read ${opacityLayers} layers)`
        );
    }
});

test('computeFrontlitCalibration: more layers to opacity means a larger TD for the same color', async () => {
    const { computeFrontlitCalibration } = await loadCalibration();
    const base = {
        filamentColor: '#3050c0',
        layerHeight: 0.04,
        firstLayerHeight: 0.2,
    };

    const few = computeFrontlitCalibration({ ...base, opacityLayers: 4 });
    const many = computeFrontlitCalibration({ ...base, opacityLayers: 12 });

    assert.ok(few.ok && many.ok);
    if (!few.ok || !many.ok) return;
    assert.ok(
        many.calibration.tdSingleValue > few.calibration.tdSingleValue,
        `expected TD(12 layers) > TD(4 layers)`
    );
});

test('deriveChannelTds anchors the brightest channel and shortens absorptive ones', async () => {
    const { deriveChannelTds } = await loadCalibration();
    const tdSingle = 0.4;

    const red = deriveChannelTds('#ff0000', tdSingle);
    // Red channel governs opacity for a red filament: anchored to the single TD.
    assert.ok(Math.abs(red[0] - tdSingle) < 1e-6, `red anchor ${red[0]} != ${tdSingle}`);
    assert.ok(red[0] > red[1], 'red TD should exceed green TD');
    assert.ok(red[0] > red[2], 'red TD should exceed blue TD');

    // A neutral gray gives three equal channel TDs at the single value.
    const gray = deriveChannelTds('#808080', tdSingle);
    assert.ok(Math.abs(gray[0] - gray[1]) < 1e-6 && Math.abs(gray[1] - gray[2]) < 1e-6);
    assert.ok(Math.abs(gray[0] - tdSingle) < 1e-6);
});

test('a lighter base lets a near-black filament calibrate (round-trip over white)', async () => {
    const { computeFrontlitCalibration, solveOpacityTransmission, OPACITY_JND } =
        await loadCalibration();

    // Black over a black base has no contrast; over white it does.
    assert.equal(solveOpacityTransmission('#000000', OPACITY_JND, '#000000'), undefined);
    const tWhite = solveOpacityTransmission('#000000', OPACITY_JND, '#ffffff');
    assert.ok(tWhite !== undefined && tWhite > 0 && tWhite < 1);

    // Round-trip a dark filament over a white base.
    const color = '#101418';
    const tdTrue = 0.25;
    const layerHeight = 0.04;
    const opacityLayers = await simulateOpacityRead(
        color,
        tdTrue,
        layerHeight,
        OPACITY_JND,
        200,
        '#ffffff'
    );
    const result = computeFrontlitCalibration({
        filamentColor: color,
        opacityLayers,
        layerHeight,
        firstLayerHeight: 0.2,
        baseColor: '#ffffff',
    });
    assert.ok(result.ok, 'dark filament calibrates over a white base');
    if (!result.ok) return;
    assert.equal(result.calibration.baseColor, '#ffffff');
    assert.equal(result.calibration.basis, 'frontlit');
    const relErr = Math.abs(result.calibration.tdSingleValue - tdTrue) / tdTrue;
    assert.ok(relErr < 0.2, `recovered ${result.calibration.tdSingleValue} vs ${tdTrue}`);
});

test('multi-base calibration refines constrained selectivity and stores reads', async () => {
    const {
        computeFrontlitCalibration,
        deriveChannelTds,
        OPACITY_JND,
        predictOpacityLayersForTds,
    } = await loadCalibration();
    const layerHeight = 0.04;
    const color = '#ffd43b';
    const trueTd = deriveChannelTds(color, 0.55, 0.9);
    const bases = ['#000000', '#2030ff', '#7a0030'];
    const reads = await Promise.all(
        bases.map(async (baseColor) => ({
            baseColor,
            opacityLayers: await simulateOpacityReadWithTds(
                color,
                trueTd,
                layerHeight,
                OPACITY_JND,
                120,
                baseColor
            ),
        }))
    );

    const result = computeFrontlitCalibration({
        filamentColor: color,
        layerHeight,
        firstLayerHeight: 0.2,
        reads,
        maxLayers: 120,
    });

    assert.ok(result.ok, 'multi-base calibration should fit');
    if (!result.ok) return;
    assert.equal(result.calibration.channelSource, 'constrained');
    assert.equal(result.calibration.fitModelVersion, 'selectivity-v1');
    assert.ok(result.calibration.fitDiagnostics);
    assert.ok(
        result.calibration.fitDiagnostics!.selectivityRange[0] <= 0.9 &&
            result.calibration.fitDiagnostics!.selectivityRange[1] >= 0.9,
        `feasible range ${result.calibration.fitDiagnostics!.selectivityRange.join('–')}`
    );
    assert.equal(
        result.calibration.fitDiagnostics!.selectivityStrength,
        0.5,
        'quantized reads that the quick prior already explains must not force extra selectivity'
    );
    assert.equal(result.calibration.reads?.length, reads.length);
    assert.equal(result.calibration.baseColor, reads[0].baseColor);

    for (const read of reads) {
        const predicted = predictOpacityLayersForTds(
            color,
            result.calibration.td,
            layerHeight,
            OPACITY_JND,
            read.baseColor,
            120
        );
        assert.ok(predicted !== undefined);
        assert.ok(
            Math.abs(predicted! - read.opacityLayers) <= 1,
            `base ${read.baseColor}: predicted ${predicted}, observed ${read.opacityLayers}`
        );
    }
});

test('a second informative base moves selectivity away from the quick prior without free RGB fitting', async () => {
    const {
        computeFrontlitCalibration,
        deriveChannelTds,
        OPACITY_JND,
        predictOpacityLayersForTds,
    } = await loadCalibration();
    const color = '#d83400';
    const layerHeight = 0.04;
    const trueStrength = 0.85;
    const trueTd = deriveChannelTds(color, 0.5, trueStrength);
    const reads = ['#000000', '#ffffff'].map((baseColor) => ({
        baseColor,
        opacityLayers: predictOpacityLayersForTds(
            color,
            trueTd,
            layerHeight,
            OPACITY_JND,
            baseColor,
            240
        )!,
    }));

    const result = computeFrontlitCalibration({
        filamentColor: color,
        layerHeight,
        firstLayerHeight: 0.2,
        reads,
        maxLayers: 240,
    });
    assert.ok(result.ok);
    if (!result.ok) return;
    const fit = result.calibration.fitDiagnostics!;
    assert.ok(fit.selectivityStrength > fit.quickSelectivityStrength + 0.2);
    assert.ok(
        fit.selectivityRange[0] <= trueStrength && fit.selectivityRange[1] >= trueStrength,
        `expected ${trueStrength} inside ${fit.selectivityRange.join('–')}`
    );
    assert.ok(fit.selectivityStrength <= trueStrength);
});

test('session JND fit does not claim certainty when constrained wedge reads remain ambiguous', async () => {
    const { computeFrontlitCalibrationSession, deriveChannelTds } = await loadCalibration();
    const layerHeight = 0.035;
    const trueJnd = 1.1;
    const cases: Array<{
        color: string;
        td: [number, number, number];
        bases: string[];
    }> = [
        {
            color: '#ffd43b',
            td: deriveChannelTds('#ffd43b', 0.55, 0.9),
            bases: ['#000000', '#2030ff', '#7a0030'],
        },
        {
            color: '#2f7cff',
            td: deriveChannelTds('#2f7cff', 0.62, 1.05),
            bases: ['#000000', '#ffea00', '#7a2000'],
        },
        {
            color: '#f5f5f5',
            td: deriveChannelTds('#f5f5f5', 0.5, 0.65),
            bases: ['#000000', '#003060', '#602000'],
        },
    ];

    const filaments = await Promise.all(
        cases.map(async ({ color, td, bases }) => ({
            filamentColor: color,
            layerHeight,
            firstLayerHeight: 0.2,
            maxLayers: 140,
            reads: await Promise.all(
                bases.map(async (baseColor) => ({
                    baseColor,
                    opacityLayers: await simulateOpacityReadWithTds(
                        color,
                        td,
                        layerHeight,
                        trueJnd,
                        140,
                        baseColor
                    ),
                }))
            ),
        }))
    );

    const session = computeFrontlitCalibrationSession({ filaments, maxLayers: 140 });
    assert.equal(session.jndSource, 'default');
    assert.ok(session.results.every((result) => result.ok));
});

test('unsupported orange-over-white uses the conservative quick curve instead of a red legacy fit', async () => {
    const {
        channelHdsForSubstrate,
        frontlitCalibrationDiagnostics,
        frontlitOpticsSourceForSubstrate,
    } = await loadCalibration();
    const { blendSrgbChannel } = await loadColorSpace();
    const filament = {
        id: 'orange',
        color: '#d83400',
        td: 0.3947626,
        calibration: {
            opacityLayers: 6,
            layerHeight: 0.08,
            firstLayerHeight: 0.4,
            td: [0.3947626, 0.1105588, 0.0696702] as [number, number, number],
            tdSingleValue: 0.3947626,
            jnd: 2,
            baseColor: '#000000',
            confidence: 0.9,
            basis: 'frontlit' as const,
            calibrationDate: '2026-08-30T00:00:00.000Z',
            reads: [
                { baseColor: '#000000', opacityLayers: 6, mergeLayers: 5 },
                { baseColor: '#f7d000', opacityLayers: 3, mergeLayers: 2 },
            ],
            channelSource: 'measured' as const,
            jndSource: 'default' as const,
            filamentColor: '#d83400',
        },
    };

    const whiteTd = channelHdsForSubstrate(filament, '#ffffff');
    const yellowTd = channelHdsForSubstrate(filament, '#f7d000');
    assert.equal(frontlitOpticsSourceForSubstrate(filament, '#ffffff'), 'wedge-quick');
    assert.equal(frontlitOpticsSourceForSubstrate(filament, '#f7d000'), 'wedge-constrained');
    assert.ok(whiteTd[1] > 0.2, `unsupported white-base green HD was ${whiteTd[1]}`);
    assert.ok(yellowTd[1] < whiteTd[1], 'measured yellow-base refinement should remain local');

    const foreground = hexToRgb(filament.color);
    const background = hexToRgb('#ffffff');
    const thickness = 0.24;
    const predicted = foreground.map((channel, index) =>
        blendSrgbChannel(background[index], channel, Math.pow(10, -thickness / whiteTd[index]))
    );
    assert.ok(
        predicted[1] >= 90,
        `orange-over-white incorrectly collapsed toward red: ${predicted}`
    );
    assert.ok(predicted[2] >= 30, `unsupported fit removed the blue contribution: ${predicted}`);

    const diagnostics = frontlitCalibrationDiagnostics(filament);
    assert.equal(diagnostics.active, true);
    assert.equal(diagnostics.storedChannelSource, 'measured');
    assert.equal(diagnostics.channelSource, 'constrained');
    assert.equal(diagnostics.reads.length, 2);
    assert.notDeepEqual(diagnostics.quickTd, diagnostics.resolvedTd);
    assert.ok(diagnostics.reads.every((read) => read.predictedOpacityLayers !== null));
});

test('merge reads validate the constrained curve and lower confidence without adding fit freedom', async () => {
    const { computeFrontlitCalibration } = await loadCalibration();
    const common = {
        filamentColor: '#d83400',
        layerHeight: 0.08,
        firstLayerHeight: 0.4,
        maxLayers: 24,
    };
    const opacityOnly = computeFrontlitCalibration({
        ...common,
        reads: [
            { baseColor: '#000000', opacityLayers: 6 },
            { baseColor: '#f7d000', opacityLayers: 3 },
        ],
    });
    const contradicted = computeFrontlitCalibration({
        ...common,
        reads: [
            { baseColor: '#000000', opacityLayers: 6, mergeLayers: 20 },
            { baseColor: '#f7d000', opacityLayers: 3, mergeLayers: 20 },
        ],
    });
    assert.ok(opacityOnly.ok && contradicted.ok);
    if (!opacityOnly.ok || !contradicted.ok) return;
    assert.deepEqual(contradicted.calibration.td, opacityOnly.calibration.td);
    assert.equal(contradicted.calibration.fitDiagnostics?.mergeReadCount, 2);
    assert.ok((contradicted.calibration.fitDiagnostics?.mergeRmsLayers ?? 0) > 1);
    assert.ok(contradicted.calibration.confidence < opacityOnly.calibration.confidence);
    assert.match(contradicted.calibration.notes ?? '', /transition misses/i);

    const quickPlain = computeFrontlitCalibration({ ...common, opacityLayers: 6 });
    const quickContradicted = computeFrontlitCalibration({
        ...common,
        reads: [{ baseColor: '#000000', opacityLayers: 6, mergeLayers: 20 }],
    });
    assert.ok(quickPlain.ok && quickContradicted.ok);
    if (!quickPlain.ok || !quickContradicted.ok) return;
    assert.ok(quickContradicted.calibration.confidence < quickPlain.calibration.confidence);
});

test('session JND fit falls back when the synthetic JND is outside the accepted band', async () => {
    const { computeFrontlitCalibrationSession, OPACITY_JND } = await loadCalibration();
    // These reads come from a synthetic session generated with a JND above the
    // accepted [1, 3] band. Do not record a session-fit JND for that case.
    const session = computeFrontlitCalibrationSession({
        filaments: [
            {
                filamentColor: '#ffd43b',
                layerHeight: 0.035,
                firstLayerHeight: 0.2,
                maxLayers: 140,
                reads: [
                    { baseColor: '#000000', opacityLayers: 8 },
                    { baseColor: '#2030ff', opacityLayers: 8 },
                ],
            },
            {
                filamentColor: '#2f7cff',
                layerHeight: 0.035,
                firstLayerHeight: 0.2,
                maxLayers: 140,
                reads: [
                    { baseColor: '#000000', opacityLayers: 6 },
                    { baseColor: '#ffea00', opacityLayers: 8 },
                ],
            },
        ],
        maxLayers: 140,
    });
    assert.equal(session.jndSource, 'default');
    assert.equal(session.jnd, OPACITY_JND);
});

test('session JND fit falls back to the default for too little multi-base data', async () => {
    const { computeFrontlitCalibrationSession, OPACITY_JND } = await loadCalibration();
    const session = computeFrontlitCalibrationSession({
        filaments: [
            {
                filamentColor: '#ffd43b',
                layerHeight: 0.04,
                firstLayerHeight: 0.2,
                reads: [
                    { baseColor: '#000000', opacityLayers: 8 },
                    { baseColor: '#2030ff', opacityLayers: 5 },
                ],
            },
        ],
        maxLayers: 40,
    });

    assert.equal(session.jndSource, 'default');
    assert.equal(session.jnd, OPACITY_JND);
});

test('sanitizeFrontlitCalibration accepts only the new frontlit calibration shape', async () => {
    const { computeFrontlitCalibration, sanitizeFrontlitCalibration } = await loadCalibration();
    const result = computeFrontlitCalibration({
        filamentColor: '#ffffff',
        opacityLayers: 6,
        layerHeight: 0.08,
        firstLayerHeight: 0.2,
    });
    assert.ok(result.ok);
    if (!result.ok) return;

    const sanitized = sanitizeFrontlitCalibration(result.calibration);
    assert.ok(sanitized);
    assert.equal(sanitized.basis, 'frontlit');
    assert.equal(sanitized.channelSource, 'heuristic');
    assert.deepEqual(sanitized.td, result.calibration.td);
    assert.equal(sanitized.tdSingleValue, result.calibration.tdSingleValue);
    assert.equal(
        sanitizeFrontlitCalibration({
            measurements: [],
            whiteReference: [255, 255, 255],
            td: [2, 3, 4],
            tdSingleValue: 3,
            confidence: 0.9,
            calibrationDate: '2025-01-01T00:00:00.000Z',
        }),
        undefined
    );
    assert.equal(
        sanitizeFrontlitCalibration({
            ...result.calibration,
            basis: 'black-frontlit',
        }),
        undefined
    );
    assert.equal(
        sanitizeFrontlitCalibration({
            ...result.calibration,
            reads: [{ baseColor: '#000000', opacityLayers: 5, mergeLayers: 0 }],
        }),
        undefined
    );
    assert.equal(
        sanitizeFrontlitCalibration({
            ...result.calibration,
            td: [1e308, 1e308, 1e308],
            tdSingleValue: 1e308,
        }),
        undefined
    );
});

test('computeFrontlitCalibration rejects invalid reads and uncalibratable colors', async () => {
    const { computeFrontlitCalibration } = await loadCalibration();

    const badLayers = computeFrontlitCalibration({
        filamentColor: '#3050c0',
        opacityLayers: 0,
        layerHeight: 0.04,
        firstLayerHeight: 0.2,
    });
    assert.equal(badLayers.ok, false);

    const blackFilament = computeFrontlitCalibration({
        filamentColor: '#000000',
        opacityLayers: 5,
        layerHeight: 0.04,
        firstLayerHeight: 0.2,
    });
    assert.equal(blackFilament.ok, false);
});
