import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';
import JSZip from 'jszip';

type MatrixModule = typeof import('../src/lib/stackMatrixCalibration.ts');
type ExportModule = typeof import('../src/lib/stackMatrixExport.ts');
type ProfileModule = typeof import('../src/lib/appearanceProfile.ts');
type ModelModule = typeof import('../src/lib/appearanceModel.ts');
type AlignmentModule = typeof import('../src/lib/stackMatrixPhotoAlignment.ts');

async function loadModules(): Promise<
    [MatrixModule, ExportModule, ProfileModule, ModelModule, AlignmentModule]
> {
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
        return [
            (await server.ssrLoadModule('/src/lib/stackMatrixCalibration.ts')) as MatrixModule,
            (await server.ssrLoadModule('/src/lib/stackMatrixExport.ts')) as ExportModule,
            (await server.ssrLoadModule('/src/lib/appearanceProfile.ts')) as ProfileModule,
            (await server.ssrLoadModule('/src/lib/appearanceModel.ts')) as ModelModule,
            (await server.ssrLoadModule(
                '/src/lib/stackMatrixPhotoAlignment.ts'
            )) as AlignmentModule,
        ];
    } finally {
        await server.close();
    }
}

const modules = loadModules();

const filaments = [
    { id: 'black', color: '#101010', td: 0.45, name: 'Black' },
    { id: 'red', color: '#ef3038', td: 0.8, name: 'Red' },
    { id: 'white', color: '#f4f2ea', td: 1.2, name: 'White' },
];

function options(maximumSamples: number) {
    return {
        layerHeight: 0.08,
        firstLayerHeight: 0.2,
        stackLayerCount: 3,
        maximumSamples,
        backingFilamentId: 'black',
    };
}

test('Stack Matrix enumerates every recipe when it fits and builds a printable foundation', async () => {
    const [matrix] = await modules;
    const record = matrix.buildStackMatrixCalibration(
        filaments,
        options(64),
        '2026-08-07T10:00:00.000Z'
    );

    assert.equal(record.totalCombinationCount, 27);
    assert.equal(record.samples.length, 27);
    assert.equal(record.selection, 'exhaustive');
    assert.equal(new Set(record.samples.map((sample) => sample.stack.join(','))).size, 27);
    assert.deepEqual(record.samples[0].stack, [0, 0, 0]);
    assert.deepEqual(record.samples.at(-1)?.stack, [2, 2, 2]);
    assert.equal(record.foundationLayerThicknesses[0], 0.2);
    assert.ok(record.foundationLayerThicknesses.slice(1).every((height) => height === 0.08));
    assert.ok(record.foundationLayerThicknesses.reduce((sum, height) => sum + height, 0) >= 0.6);
    assert.equal(record.grid.patchSize, 5);
    assert.equal(record.grid.gap, 0);
});

test('HD-gamut selection is deterministic and retains every pure-filament recipe', async () => {
    const [matrix] = await modules;
    const first = matrix.buildStackMatrixCalibration(
        filaments,
        options(8),
        '2026-08-07T10:00:00.000Z'
    );
    const second = matrix.buildStackMatrixCalibration(
        filaments,
        options(8),
        '2026-08-07T10:00:00.000Z'
    );

    assert.equal(first.selection, 'hd-gamut');
    assert.equal(first.samples.length, 8);
    assert.deepEqual(
        first.samples.map((sample) => sample.stack),
        second.samples.map((sample) => sample.stack)
    );
    for (const filamentIndex of [0, 1, 2]) {
        assert.ok(
            first.samples.some((sample) => sample.stack.every((value) => value === filamentIndex))
        );
    }
});

test('Stack Matrix supports a 45 by 45 board capacity', async () => {
    const [matrix] = await modules;
    const expandedFilaments = [
        ...filaments,
        { id: 'blue', color: '#2050df', td: 0.65, name: 'Blue' },
        { id: 'yellow', color: '#f2cf24', td: 0.7, name: 'Yellow' },
    ];
    const record = matrix.buildStackMatrixCalibration(
        expandedFilaments,
        {
            ...options(2_025),
            stackLayerCount: 5,
        },
        '2026-08-07T10:00:00.000Z'
    );

    assert.equal(record.samples.length, 2_025);
    assert.equal(record.grid.rows, 45);
    assert.equal(record.grid.columns, 45);
    assert.deepEqual(matrix.stackMatrixPhysicalSize(record), { width: 235, height: 235 });
});

test('photo sampling reads perspective-addressed cells and completes the persisted LUT', async () => {
    const [matrix] = await modules;
    const record = matrix.buildStackMatrixCalibration(
        filaments.slice(0, 2),
        options(64),
        '2026-08-07T10:00:00.000Z'
    );
    const width = 500;
    const height = 500;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
    const corners = [
        { x: 50, y: 50 },
        { x: 450, y: 50 },
        { x: 450, y: 450 },
        { x: 50, y: 450 },
    ];
    const expected = record.samples.map(
        (_, index) => [40 + index * 5, 80 + index * 4, 120 + index * 3] as [number, number, number]
    );
    for (const [index, sample] of record.samples.entries()) {
        const x = Math.round(50 + 400 * ((sample.column + 1) / (record.grid.columns + 1)));
        const y = Math.round(50 + 400 * ((sample.row + 1) / (record.grid.rows + 1)));
        for (let py = y - 24; py <= y + 24; py++) {
            for (let px = x - 24; px <= x + 24; px++) {
                const offset = (py * width + px) * 4;
                pixels[offset] = expected[index][0];
                pixels[offset + 1] = expected[index][1];
                pixels[offset + 2] = expected[index][2];
            }
        }
    }

    const sampled = matrix.sampleStackMatrixPhoto(pixels, width, height, corners, record, false);
    assert.deepEqual(sampled, expected);
    const completed = matrix.completeStackMatrixCalibration(
        record,
        sampled,
        'matrix.jpg',
        false,
        '2026-08-07T11:00:00.000Z'
    );
    assert.equal(completed.status, 'complete');
    assert.equal(
        completed.samples.every((sample) => Boolean(sample.measuredColor)),
        true
    );
});

test('photo alignment expands marker centers into the exact board template', async () => {
    const [, , , , alignment] = await modules;
    const corners = [
        { x: 50, y: 40 },
        { x: 350, y: 60 },
        { x: 330, y: 260 },
        { x: 70, y: 280 },
    ];
    const project = alignment.createProjectiveMapper(corners);
    assert.deepEqual(project(0, 0), corners[0]);
    assert.deepEqual(project(1, 0), corners[1]);
    assert.deepEqual(project(1, 1), corners[2]);
    assert.deepEqual(project(0, 1), corners[3]);

    const rows = 6;
    const columns = 8;
    const lines = alignment.stackMatrixTemplateLines(corners, rows, columns);
    assert.equal(lines.length, columns + 3 + rows + 3);
    assert.equal(lines.filter((line) => line.outer).length, 4);
    const outer = alignment.stackMatrixOuterCorners(corners, rows, columns);
    assert.ok(outer[0].x < corners[0].x);
    assert.ok(outer[0].y < corners[0].y);
    assert.ok(outer[2].x > corners[2].x);
    assert.ok(outer[2].y > corners[2].y);
});

test('photo alignment constrains dragged corners before the projected grid can diverge', async () => {
    const [, , , , alignment] = await modules;
    const corners = [
        { x: 50, y: 50 },
        { x: 450, y: 50 },
        { x: 450, y: 450 },
        { x: 50, y: 450 },
    ];
    assert.equal(alignment.isStackMatrixCornerLayoutValid(corners, 8, 8), true);

    const safeTarget = { x: 410, y: 85 };
    assert.deepEqual(
        alignment.constrainStackMatrixCornerMove(corners, 1, safeTarget, 8, 8),
        safeTarget
    );

    const crossingTarget = { x: 150, y: 300 };
    const constrained = alignment.constrainStackMatrixCornerMove(corners, 1, crossingTarget, 8, 8);
    assert.notDeepEqual(constrained, crossingTarget);
    const constrainedCorners = corners.map((corner, index) => (index === 1 ? constrained : corner));
    assert.equal(alignment.isStackMatrixCornerLayoutValid(constrainedCorners, 8, 8), true);
    assert.ok(
        Number.isFinite(alignment.stackMatrixTemplateLines(constrainedCorners, 8, 8)[0].start.x)
    );
});

test('photo alignment auto-detects a contrasting matrix board and falls back safely', async () => {
    const [, , , , alignment] = await modules;
    const width = 320;
    const height = 260;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < pixels.length; index += 4) {
        pixels[index] = 232;
        pixels[index + 1] = 230;
        pixels[index + 2] = 226;
        pixels[index + 3] = 255;
    }
    for (let y = 35; y < 225; y++) {
        for (let x = 50; x < 270; x++) {
            const offset = (y * width + x) * 4;
            pixels[offset] = 36;
            pixels[offset + 1] = 43;
            pixels[offset + 2] = 52;
        }
    }

    const estimate = alignment.estimateStackMatrixMarkerCenters(pixels, width, height, 8, 8);
    assert.equal(estimate.method, 'detected');
    assert.ok(estimate.confidence > 0.5);
    assert.ok(Math.abs(estimate.outerCorners[0].x - 50) < 6);
    assert.ok(Math.abs(estimate.outerCorners[0].y - 35) < 6);
    assert.ok(Math.abs(estimate.outerCorners[2].x - 270) < 6);
    assert.ok(Math.abs(estimate.outerCorners[2].y - 225) < 6);
    assert.ok(estimate.corners[0].x > estimate.outerCorners[0].x);
    assert.ok(estimate.corners[0].y > estimate.outerCorners[0].y);

    const uniform = new Uint8ClampedArray(width * height * 4).fill(255);
    const fallback = alignment.estimateStackMatrixMarkerCenters(uniform, width, height, 8, 8);
    assert.equal(fallback.method, 'fallback');
    assert.equal(fallback.corners.length, 4);
});

test('photo alignment rectifies the full board around its marker centers', async () => {
    const [, , , , alignment] = await modules;
    const width = 240;
    const height = 180;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            pixels[offset] = x;
            pixels[offset + 1] = y;
            pixels[offset + 2] = 80;
            pixels[offset + 3] = 255;
        }
    }
    const rows = 6;
    const columns = 8;
    const corners = [
        { x: 30, y: 30 },
        { x: 210, y: 30 },
        { x: 210, y: 150 },
        { x: 30, y: 150 },
    ];
    const rectified = alignment.rectifyStackMatrixPhoto(
        pixels,
        width,
        height,
        corners,
        rows,
        columns,
        200
    );
    assert.equal(rectified.width, 200);
    assert.equal(rectified.height, 160);
    const center = (Math.floor(rectified.height / 2) * rectified.width + 100) * 4;
    assert.ok(Math.abs(rectified.pixels[center] - 120) <= 2);
    assert.ok(Math.abs(rectified.pixels[center + 1] - 90) <= 2);
    assert.equal(rectified.pixels[center + 2], 80);
    assert.equal(rectified.pixels[center + 3], 255);
});

test('Stack Matrix 3MF keeps one material part per filament and embeds its immutable plan', async () => {
    const [matrix, exporter] = await modules;
    const record = matrix.buildStackMatrixCalibration(
        filaments,
        options(8),
        '2026-08-07T10:00:00.000Z'
    );
    const blob = await exporter.generateStackMatrix3mf(record);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const model = await zip.file('3D/3dmodel.model')?.async('string');
    const metadata = await zip.file('Metadata/kromacut-stack-matrix.json')?.async('string');

    assert.ok(model);
    assert.ok(metadata);
    assert.equal((model!.match(/<base /g) ?? []).length, filaments.length);
    assert.equal((model!.match(/<component /g) ?? []).length, filaments.length);
    assert.equal((model!.match(/<item /g) ?? []).length, 1);
    assert.deepEqual(JSON.parse(metadata!).samples, record.samples);
});

test('completed Stack Matrix samples become measured anchors without global fit observations', async () => {
    const [matrix, , profile, model] = await modules;
    const planned = matrix.buildStackMatrixCalibration(
        filaments,
        options(8),
        '2026-08-07T10:00:00.000Z'
    );
    const colors = planned.samples.map(
        (sample, index) =>
            [
                sample.predictedColor.rgb[0],
                Math.min(255, sample.predictedColor.rgb[1] + index + 1),
                sample.predictedColor.rgb[2],
            ] as [number, number, number]
    );
    const completed = matrix.completeStackMatrixCalibration(
        planned,
        colors,
        'matrix.jpg',
        false,
        '2026-08-07T11:00:00.000Z'
    );
    const appearance = profile.upsertStackMatrixCalibration(
        profile.createEmptyAppearanceProfile(),
        completed
    );
    const fitted = model.fitAppearanceRankModel(appearance, {
        filamentProfileFingerprint: profile.fingerprintAppearanceFilaments(filaments),
        layerHeight: 0.08,
        firstLayerHeight: 0.2,
        transitionOpacity: 0.9,
        filaments,
    });

    assert.equal(fitted.observationCount, 0);
    assert.equal(fitted.applied, false);
    assert.equal(fitted.exactAnchors.length, completed.samples.length);
    assert.ok(fitted.exactAnchors.every((anchor) => anchor.source === 'stack-matrix'));
    const anchor = fitted.exactAnchors[0];
    const resolved = model.resolveAppearanceRankModel(
        { L: 50, a: 0, b: 0 },
        fitted,
        anchor.suffixLayers
    );
    assert.equal(resolved.exactAnchor?.id, anchor.id);
    assert.deepEqual([resolved.lab.L, resolved.lab.a, resolved.lab.b], [...anchor.targetLab]);
});

test('Stack Matrix profile sanitation preserves bounded evidence and drops invalid recipes', async () => {
    const [matrix, , profile] = await modules;
    const planned = matrix.buildStackMatrixCalibration(
        filaments,
        options(8),
        '2026-08-07T10:00:00.000Z'
    );
    const completed = matrix.completeStackMatrixCalibration(
        planned,
        planned.samples.map((sample) => [...sample.predictedColor.rgb]),
        'matrix.jpg',
        false,
        '2026-08-07T11:00:00.000Z'
    );
    const appearance = profile.upsertStackMatrixCalibration(
        profile.createEmptyAppearanceProfile(),
        completed
    );
    const sanitized = profile.sanitizeAppearanceProfile(JSON.parse(JSON.stringify(appearance)));
    assert.deepEqual(sanitized?.stackMatrices, [completed]);

    const tampered = JSON.parse(JSON.stringify(appearance));
    tampered.stackMatrices[0].samples[0].stack[0] = 99;
    assert.deepEqual(profile.sanitizeAppearanceProfile(tampered)?.stackMatrices, []);
});
