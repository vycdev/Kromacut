import assert from 'node:assert/strict';
import test from 'node:test';
import { nextBestColor } from '../src/lib/nextBestColor.ts';
import type { Filament } from '../src/types/index.ts';

function filament(id: string, color: string, td: number): Filament {
    return { id, color, td };
}

const BLACK = filament('black', '#000000', 1.0);
const WHITE = filament('white', '#ffffff', 2.0);
const RED = filament('red', '#ff0000', 1.5);
const BLUE = filament('blue', '#0000ff', 2.5);

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('returns null candidate for empty filaments', () => {
    const r = nextBestColor([], [{ hex: '#808080', count: 100 }]);
    assert.equal(r.candidate, null);
    assert.equal(r.baselineAvgDeltaE, 0);
});

test('returns null candidate for empty swatches', () => {
    const r = nextBestColor([BLACK, WHITE], []);
    assert.equal(r.candidate, null);
});

test('returns null candidate when all swatches are already covered', () => {
    // Swatch exactly matches an existing filament — ΔE < 3, so it is skipped.
    const r = nextBestColor([BLACK], [{ hex: '#000000', count: 100 }]);
    assert.equal(r.candidate, null);
});

test('returns null candidate when image palette exactly matches the filament set', () => {
    // Every image swatch is one of the existing filaments — nothing to add.
    const r = nextBestColor(
        [BLACK, WHITE, RED],
        [
            { hex: '#000000', count: 300 },
            { hex: '#ffffff', count: 300 },
            { hex: '#ff0000', count: 300 },
        ]
    );
    assert.equal(r.candidate, null);
});

// ---------------------------------------------------------------------------
// Basic ranking
// ---------------------------------------------------------------------------

test('identifies the most impactful missing color', () => {
    // Black filament only. Image has black (covered) and white (uncovered).
    // White is the only viable candidate.
    const r = nextBestColor(
        [BLACK],
        [
            { hex: '#000000', count: 100 },
            { hex: '#ffffff', count: 100 },
        ]
    );
    assert.ok(r.candidate !== null, 'expected a candidate');
    assert.equal(r.candidate.hex, '#ffffff');
});

test('blend-aware: far candidate wins when its segment covers the common color territory', () => {
    // With only BLACK and an achromatic image, a lighter-grey candidate creates
    // a segment toward BLACK that passes through #888888's Lab position — so
    // adding it captures the common mid-grey pixels via blending while also
    // reaching toward the rare near-white. Under linear-light blending the
    // extrapolated light grey wins over picking #888888 directly.
    const r = nextBestColor(
        [BLACK],
        [
            { hex: '#888888', count: 1000 }, // common mid-grey
            { hex: '#eeeeee', count: 1 }, // rare near-white
        ]
    );
    assert.ok(r.candidate !== null);
    assert.equal(r.candidate.hex, '#c9c9c9');
    // The winner's blend segment must capture the common mid-grey pixels.
    assert.ok(r.candidate.pixelsCaptured >= 1000);
});

test('pixel count weighting: common color beats rare one when blend segments diverge', () => {
    // BLACK + WHITE already cover the L-axis via blending.
    // Two chromatic candidates in opposite hue directions: their C↔filament
    // segments do not pass near each other, so pixel count dominates.
    // Four covered greys anchor p75 below both chromatic candidates.
    const r = nextBestColor(
        [BLACK, WHITE],
        [
            { hex: '#606060', count: 1 }, // grey — on L-axis blend, covered
            { hex: '#808080', count: 1 }, // grey — covered
            { hex: '#a0a0a0', count: 1 }, // grey — covered
            { hex: '#c0c0c0', count: 1 }, // grey — covered
            { hex: '#ff6666', count: 1000 }, // desaturated red — common
            { hex: '#00ffff', count: 1 }, // cyan — opposite hue, rare
        ]
    );
    assert.ok(r.candidate !== null);
    assert.equal(r.candidate.hex, '#ff6666');
});

// ---------------------------------------------------------------------------
// Underserved-color weighting (p90 = 2×, p100 = 3×)
// ---------------------------------------------------------------------------

test('p100 weighting tips ranking: rare maximally-underserved color beats common moderate one', () => {
    // BLACK + WHITE cover the L-axis.  Two chromatic candidates in opposite hue
    // directions so their C↔filament blend segments don't reach each other:
    //   #ff8888 (desaturated red) count=5  — moderate distance (~49 ΔE), high raw gain
    //   #0000ff (blue)            count=1  — maximum distance (~134 ΔE), p100 → 3× weight
    //
    // Without weighting blue's raw gain (134) < red's (247), red would win.
    // With 3× p100 weight blue's weighted gain (402) > red's (255), blue wins.
    const r = nextBestColor(
        [BLACK, WHITE],
        [
            { hex: '#606060', count: 1 }, // grey — covered by L-axis blend
            { hex: '#808080', count: 1 }, // grey — covered
            { hex: '#a0a0a0', count: 1 }, // grey — covered
            { hex: '#c0c0c0', count: 1 }, // grey — covered
            { hex: '#ff8888', count: 5 }, // desaturated red — moderate distance
            { hex: '#0000ff', count: 1 }, // blue — maximum distance (p100)
        ]
    );
    assert.ok(r.candidate !== null);
    assert.equal(r.candidate.hex, '#0000ff');
});

test('improvementPct stays ≤ 100 when p100 weighting selects the winner', () => {
    // weightedGain drives ranking but improvementPct is computed from rawGain
    // so it stays a meaningful percentage of the unweighted baseline error.
    const r = nextBestColor(
        [BLACK, WHITE],
        [
            { hex: '#606060', count: 1 },
            { hex: '#808080', count: 1 },
            { hex: '#a0a0a0', count: 1 },
            { hex: '#c0c0c0', count: 1 },
            { hex: '#ff8888', count: 5 },
            { hex: '#0000ff', count: 1 },
        ]
    );
    assert.ok(r.candidate !== null);
    assert.ok(
        r.candidate.improvementPct <= 100,
        `expected ≤ 100, got ${r.candidate.improvementPct}`
    );
});

// ---------------------------------------------------------------------------
// Improvement percentage
// ---------------------------------------------------------------------------

test('improvementPct is > 0 and ≤ 100', () => {
    const r = nextBestColor(
        [BLACK],
        [
            { hex: '#000000', count: 50 },
            { hex: '#ffffff', count: 50 },
        ]
    );
    assert.ok(r.candidate !== null);
    assert.ok(r.candidate.improvementPct > 0, `expected > 0, got ${r.candidate.improvementPct}`);
    assert.ok(
        r.candidate.improvementPct <= 100,
        `expected ≤ 100, got ${r.candidate.improvementPct}`
    );
});

// ---------------------------------------------------------------------------
// Isolation score
// ---------------------------------------------------------------------------

test('isolationScore is in [0, 1]', () => {
    const r = nextBestColor(
        [BLACK],
        [
            { hex: '#000000', count: 50 },
            { hex: '#ffffff', count: 50 },
        ]
    );
    assert.ok(r.candidate !== null);
    assert.ok(
        r.candidate.isolationScore >= 0 && r.candidate.isolationScore <= 1,
        `expected 0–1, got ${r.candidate.isolationScore}`
    );
});

test('single viable candidate always gets isolationScore 1.0', () => {
    // Only one candidate passes the coverage threshold, so it is the most isolated by definition.
    const r = nextBestColor(
        [BLACK],
        [
            { hex: '#000000', count: 10 }, // covered — skipped
            { hex: '#ffffff', count: 90 }, // sole viable candidate
        ]
    );
    assert.ok(r.candidate !== null);
    assert.ok(
        Math.abs(r.candidate.isolationScore - 1.0) < 1e-9,
        `expected 1.0, got ${r.candidate.isolationScore}`
    );
});

test('blend-aware: both candidates produce a candidate with valid isolation score', () => {
    // BLACK filament only.
    // #444444 (dark grey) — close to BLACK, very common → its C↔BLACK segment covers mid-tones
    // #ffffff (white)     — far from BLACK, rare        → its C↔BLACK segment covers more Lab space
    // The blend-aware metric naturally weighs segment length; winner depends on pixel counts.
    const r = nextBestColor(
        [BLACK],
        [
            { hex: '#000000', count: 1 }, // covered
            { hex: '#444444', count: 500 }, // common, moderate isolation
            { hex: '#ffffff', count: 1 }, // rare, maximum isolation
        ]
    );
    assert.ok(r.candidate !== null);
    assert.ok(typeof r.candidate.isolationScore === 'number');
    assert.ok(r.candidate.isolationScore > 0);
});

test('adding exact best candidate as a second filament gives near-zero further improvement', () => {
    const swatches = [
        { hex: '#000000', count: 50 },
        { hex: '#aaaaaa', count: 50 },
    ];
    const first = nextBestColor([BLACK], swatches);
    assert.ok(first.candidate !== null);
    // Now add the winner as a filament and re-run.
    const newFilament = filament('new', first.candidate.hex, first.candidate.td);
    const second = nextBestColor([BLACK, newFilament], swatches);
    // Candidate should be null or have negligible improvement.
    if (second.candidate !== null) {
        assert.ok(
            second.candidate.improvementPct < first.candidate.improvementPct,
            'second best should improve less than the first'
        );
    }
});

// ---------------------------------------------------------------------------
// pixelsCaptured
// ---------------------------------------------------------------------------

test('pixelsCaptured is > 0 for a valid candidate', () => {
    const r = nextBestColor(
        [BLACK],
        [
            { hex: '#000000', count: 100 },
            { hex: '#cccccc', count: 80 },
        ]
    );
    assert.ok(r.candidate !== null);
    assert.ok(r.candidate.pixelsCaptured > 0);
});

test('pixelsCaptured does not exceed totalPixels', () => {
    const swatches = [
        { hex: '#333333', count: 40 },
        { hex: '#999999', count: 60 },
    ];
    const r = nextBestColor([BLACK], swatches);
    assert.ok(r.candidate !== null);
    assert.ok(r.candidate.pixelsCaptured <= r.totalPixels);
});

// ---------------------------------------------------------------------------
// TD recommendation
// ---------------------------------------------------------------------------

test('recommended TD comes from the nearest existing filament', () => {
    // RED (td=1.5) and BLUE (td=2.5). Orange #ff4400 is not on the RED↔BLUE blend
    // line (which passes through purple/magenta) and is much closer to RED than BLUE
    // in Lab space, so the suggested candidate should inherit RED's td.
    const r = nextBestColor(
        [RED, BLUE],
        [
            { hex: '#ff0000', count: 10 }, // covered — on RED
            { hex: '#0000ff', count: 10 }, // covered — on BLUE
            { hex: '#ff4400', count: 100 }, // uncovered orange, nearest filament is RED
        ]
    );
    assert.ok(r.candidate !== null);
    assert.equal(r.candidate.td, RED.td);
});

test('light candidate gets WHITE td when WHITE is nearest', () => {
    // RED (td=1.5) and BLUE (td=2.5). Sky blue #00aaff is not on the RED↔BLUE blend
    // line and is closer to BLUE than RED in Lab space.
    const r = nextBestColor(
        [RED, BLUE],
        [
            { hex: '#ff0000', count: 10 }, // covered — on RED
            { hex: '#0000ff', count: 10 }, // covered — on BLUE
            { hex: '#00aaff', count: 200 }, // uncovered sky-blue, nearest filament is BLUE
        ]
    );
    assert.ok(r.candidate !== null);
    assert.equal(r.candidate.td, BLUE.td);
});

// ---------------------------------------------------------------------------
// totalPixels and baselineAvgDeltaE
// ---------------------------------------------------------------------------

test('totalPixels equals sum of swatch counts', () => {
    const swatches = [
        { hex: '#ff0000', count: 30 },
        { hex: '#00ff00', count: 70 },
    ];
    const r = nextBestColor([RED], swatches);
    assert.equal(r.totalPixels, 100);
});

test('baselineAvgDeltaE is 0 when all swatches exactly match filaments', () => {
    // Single swatch that exactly matches the filament — ΔE ≈ 0.
    const r = nextBestColor([RED], [{ hex: '#ff0000', count: 50 }]);
    assert.ok(r.baselineAvgDeltaE < 1, `expected near 0, got ${r.baselineAvgDeltaE}`);
});

// ---------------------------------------------------------------------------
// Hiding-distance semantics + linear-light blending
// ---------------------------------------------------------------------------

test('blendRgb composites in linear light like blendSrgbChannel', async () => {
    const { blendRgb } = await import('../src/lib/nextBestColor.ts');
    // 50% transmission of white background through a black layer: the
    // linear-light midpoint re-encodes to ~188 sRGB, not the gamma midpoint 128.
    const halfTransmissionThickness = Math.log10(2); // t = 10^(-th/td) = 0.5 at td=1
    const blended = blendRgb(
        { r: 255, g: 255, b: 255 },
        { r: 0, g: 0, b: 0 },
        1,
        halfTransmissionThickness
    );
    assert.ok(Math.abs(blended.r - 188) < 1.5, `expected ~188, got ${blended.r}`);
    assert.ok(Math.abs(blended.g - blended.r) < 1e-9 && Math.abs(blended.b - blended.r) < 1e-9);
});

test('blendRgb applies per-channel hiding distances independently', async () => {
    const { blendRgb } = await import('../src/lib/nextBestColor.ts');
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    const thickness = Math.log10(2);
    // A uniform triple must match the scalar path exactly.
    const scalar = blendRgb(white, black, 1, thickness);
    const uniform = blendRgb(white, black, [1, 1, 1], thickness);
    assert.deepEqual(uniform, scalar);
    // Asymmetric HDs: the channel with the smaller HD hides the background
    // faster, so it must come out darker than the more transmissive channel.
    const asymmetric = blendRgb(white, black, [0.2, 1, 1], thickness);
    assert.ok(
        asymmetric.r < asymmetric.g - 10,
        `expected r (HD 0.2) to hide faster than g (HD 1): got r=${asymmetric.r}, g=${asymmetric.g}`
    );
    assert.ok(Math.abs(asymmetric.g - asymmetric.b) < 1e-9);
});

test('blendRgb treats zero or invalid hiding distances as immediately opaque', async () => {
    const { blendRgb } = await import('../src/lib/nextBestColor.ts');
    const background = { r: 255, g: 255, b: 255 };
    const filament = { r: 20, g: 80, b: 140 };

    assert.deepEqual(blendRgb(background, filament, 0, 0.2), filament);
    assert.deepEqual(blendRgb(background, filament, [0.2, 0, 0.2], 0.2), filament);
});

test('measured calibration channels change the blend-aware baseline', () => {
    // A calibrated teal whose measured channels ([0.35, 0.12, 0.12]) invert the
    // color-derived heuristic (~[0.068, 0.354, 0.373]): red hides slowest, not
    // fastest. The swatch #32b8c4 sits exactly on the measured teal-over-white
    // blend curve, so the calibrated model reaches it (error → 0 under the
    // coverage floor) while the derived model reports a real residual.
    const measured: [number, number, number] = [0.35, 0.12, 0.12];
    const calibratedTeal: Filament = {
        id: 'teal',
        color: '#00b8c4',
        td: 0.35,
        calibration: {
            opacityLayers: 5,
            layerHeight: 0.08,
            firstLayerHeight: 0.16,
            td: measured,
            tdSingleValue: 0.35,
            jnd: 2,
            baseColor: '#000000',
            confidence: 0.8,
            basis: 'frontlit',
            calibrationDate: '2026-07-02T00:00:00.000Z',
        },
    };
    const uncalibratedTeal = filament('teal', '#00b8c4', 0.35);
    const white = filament('white', '#ffffff', 0.51);
    const swatches = [
        { hex: '#00b8c4', count: 100 }, // covered — on the teal filament
        { hex: '#ffffff', count: 100 }, // covered — on the white filament
        { hex: '#32b8c4', count: 100 }, // on the measured teal-over-white curve
    ];
    const calibrated = nextBestColor([calibratedTeal, white], swatches);
    const derived = nextBestColor([uncalibratedTeal, white], swatches);
    assert.ok(
        calibrated.baselineAvgDeltaE < derived.baselineAvgDeltaE,
        `measured channel HDs must feed the blend curves: ` +
            `calibrated ${calibrated.baselineAvgDeltaE} vs derived ${derived.baselineAvgDeltaE}`
    );
});

test('recommended hiding distance is borrowed on the stored (frontlit) scale', () => {
    // Calibrated-profile-like HD values (~0.3–0.6 mm). The suggestion must come
    // back on the same scale so the added filament simulates correctly.
    const filaments: Filament[] = [
        { id: 'black', color: '#000000', td: 0.05 },
        { id: 'white', color: '#ffffff', td: 0.51 },
        { id: 'red', color: '#d83400', td: 0.56 },
    ];
    const r = nextBestColor(filaments, [
        { hex: '#000000', count: 100 },
        { hex: '#00b8c4', count: 400 },
    ]);
    assert.ok(r.candidate !== null, 'expected a candidate');
    const tds = filaments.map((f) => f.td);
    assert.ok(
        tds.includes(r.candidate!.td),
        `candidate td ${r.candidate!.td} must be borrowed from an existing filament`
    );
    assert.ok(r.candidate!.td <= 2, 'td must be on the hiding-distance scale');
});
