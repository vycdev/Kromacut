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

test('Stack Matrix backing defaults to the lightest selected filament', async () => {
    const [matrix] = await modules;
    assert.equal(
        matrix.lightestStackMatrixFilamentId([
            { id: 'dark', color: '#101010' },
            { id: 'light', color: '#F0F0F0' },
            { id: 'middle', color: '#808080' },
        ]),
        'light'
    );
    assert.equal(matrix.lightestStackMatrixFilamentId([]), '');
});

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

test('maximum Stack Matrix planning stays bounded for eight filaments and six layers', async () => {
    const [matrix] = await modules;
    const expandedFilaments = [
        ...filaments,
        { id: 'blue', color: '#2050df', td: 0.65, name: 'Blue' },
        { id: 'yellow', color: '#f2cf24', td: 0.7, name: 'Yellow' },
        { id: 'green', color: '#20b050', td: 0.75, name: 'Green' },
        { id: 'cyan', color: '#20cfe0', td: 0.9, name: 'Cyan' },
        { id: 'magenta', color: '#d020b0', td: 0.85, name: 'Magenta' },
    ];
    const startedAt = performance.now();
    const record = matrix.buildStackMatrixCalibration(
        expandedFilaments,
        { ...options(2_025), stackLayerCount: 6 },
        '2026-08-07T10:00:00.000Z'
    );

    assert.equal(record.totalCombinationCount, 262_144);
    assert.equal(record.samples.length, 2_025);
    assert.ok(performance.now() - startedAt < 15_000);
    for (let filamentIndex = 0; filamentIndex < expandedFilaments.length; filamentIndex++) {
        assert.ok(
            record.samples.some((sample) => sample.stack.every((value) => value === filamentIndex))
        );
    }
});

test('Stack Matrix normalizes a zero or undersized first layer before geometry and metadata', async () => {
    const [matrix, , profile] = await modules;
    for (const firstLayerHeight of [0, 0.04]) {
        const record = matrix.buildStackMatrixCalibration(
            filaments,
            { ...options(8), firstLayerHeight },
            '2026-08-07T10:00:00.000Z'
        );
        assert.equal(record.process.firstLayerHeight, 0.08);
        assert.equal(record.foundationLayerThicknesses[0], 0.08);
        const appearance = profile.upsertStackMatrixCalibration(
            profile.createEmptyAppearanceProfile(),
            record
        );
        assert.equal(
            profile.sanitizeAppearanceProfile(structuredClone(appearance))?.stackMatrices?.[0]
                .process.firstLayerHeight,
            0.08
        );
    }

    const legacy = matrix.buildStackMatrixCalibration(
        filaments,
        options(8),
        '2026-08-07T10:00:00.000Z'
    );
    legacy.process.firstLayerHeight = 0;
    const legacyAppearance = profile.upsertStackMatrixCalibration(
        profile.createEmptyAppearanceProfile(),
        legacy
    );
    assert.equal(
        profile.sanitizeAppearanceProfile(structuredClone(legacyAppearance))?.stackMatrices?.[0]
            .process.firstLayerHeight,
        0.08
    );
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

test('photo sampling keeps every inset inside its own cell under strong perspective', async () => {
    const [matrix, , , , alignment] = await modules;
    const record = matrix.buildStackMatrixCalibration(
        filaments.slice(0, 2),
        options(8),
        '2026-08-07T10:00:00.000Z'
    );
    const width = 640;
    const height = 520;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) {
        pixels[offset] = 251;
        pixels[offset + 1] = 19;
        pixels[offset + 2] = 233;
        pixels[offset + 3] = 255;
    }
    const corners = [
        { x: 80, y: 55 },
        { x: 570, y: 150 },
        { x: 440, y: 465 },
        { x: 145, y: 390 },
    ];
    const project = alignment.createProjectiveMapper(corners);
    const pitchU = 1 / (record.grid.columns + 1);
    const pitchV = 1 / (record.grid.rows + 1);
    const expected = record.samples.map(
        (_, index) => [30 + index * 17, 45 + index * 11, 60 + index * 7] as [number, number, number]
    );
    for (const [index, sample] of record.samples.entries()) {
        for (let sampleY = 0; sampleY < 9; sampleY++) {
            for (let sampleX = 0; sampleX < 9; sampleX++) {
                const offsetU = (sampleX / 8 - 0.5) * 2 * 0.16 * pitchU;
                const offsetV = (sampleY / 8 - 0.5) * 2 * 0.16 * pitchV;
                const point = project(
                    (sample.column + 1) * pitchU + offsetU,
                    (sample.row + 1) * pitchV + offsetV
                );
                const x = Math.round(point.x);
                const y = Math.round(point.y);
                const pixelOffset = (y * width + x) * 4;
                pixels[pixelOffset] = expected[index][0];
                pixels[pixelOffset + 1] = expected[index][1];
                pixels[pixelOffset + 2] = expected[index][2];
            }
        }
    }

    assert.deepEqual(
        matrix.sampleStackMatrixPhoto(pixels, width, height, corners, record, false),
        expected
    );
});

test('Stack Matrix photo rotation preserves pixels and swaps image dimensions', async () => {
    const [, , , , alignment] = await modules;
    const pixels = new Uint8ClampedArray([
        1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255,
    ]);
    const channelValues = (rotated: Uint8ClampedArray) => {
        const values: number[] = [];
        for (let offset = 0; offset < rotated.length; offset += 4) {
            values.push(rotated[offset]);
        }
        return values;
    };

    const clockwise = alignment.rotateStackMatrixPhotoPixels(pixels, 2, 3, 'clockwise');
    assert.equal(clockwise.width, 3);
    assert.equal(clockwise.height, 2);
    assert.deepEqual(channelValues(clockwise.pixels), [5, 3, 1, 6, 4, 2]);

    const counterclockwise = alignment.rotateStackMatrixPhotoPixels(
        pixels,
        2,
        3,
        'counterclockwise'
    );
    assert.equal(counterclockwise.width, 3);
    assert.equal(counterclockwise.height, 2);
    assert.deepEqual(channelValues(counterclockwise.pixels), [2, 4, 6, 1, 3, 5]);
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

test('constrained corner dragging smoothly catches up without path-dependent validity', async () => {
    const [, , , , alignment] = await modules;
    let corners = [
        { x: 50, y: 50 },
        { x: 450, y: 50 },
        { x: 450, y: 450 },
        { x: 50, y: 450 },
    ];
    const invalidTarget = { x: 150, y: 300 };
    const constrained = alignment.constrainStackMatrixCornerMove(corners, 1, invalidTarget, 8, 8);
    corners = corners.map((corner, index) => (index === 1 ? constrained : corner));

    const validTarget = { x: 410, y: 85 };
    const validCandidate = corners.map((corner, index) => (index === 1 ? validTarget : corner));
    assert.equal(alignment.isStackMatrixCornerLayoutValid(validCandidate, 8, 8), true);

    let reachedTarget = false;
    for (let frame = 0; frame < 100; frame++) {
        const before = corners[1];
        const nextCorner = alignment.approachStackMatrixCornerMove(
            corners,
            1,
            validTarget,
            8,
            8,
            12
        );
        const handleDistance = Math.hypot(nextCorner.x - before.x, nextCorner.y - before.y);
        assert.ok(handleDistance <= 12 + 1e-6);
        corners = corners.map((corner, index) => (index === 1 ? nextCorner : corner));
        assert.equal(alignment.isStackMatrixCornerLayoutValid(corners, 8, 8), true);
        if (nextCorner.x === validTarget.x && nextCorner.y === validTarget.y) {
            reachedTarget = true;
            break;
        }
    }

    assert.equal(reachedTarget, true);
    assert.deepEqual(corners[1], validTarget);
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

test('Stack Matrix 3MF keeps every mesh object manifold and embeds its immutable plan', async () => {
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
    const components = model!.match(/<component /g) ?? [];
    assert.ok(components.length > filaments.length);
    assert.ok(components.length <= 1 + filaments.length * 8);
    assert.equal((model!.match(/<item /g) ?? []).length, 1);
    assert.deepEqual(JSON.parse(metadata!).samples, record.samples);

    const meshObjects = [
        ...model!.matchAll(/<object\b[^>]*>([\s\S]*?<mesh>[\s\S]*?<\/mesh>)[\s\S]*?<\/object>/g),
    ];
    assert.equal(meshObjects.length, components.length);
    for (const object of meshObjects) {
        const vertices = [
            ...object[1].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g),
        ].map(
            (match) =>
                `${Number(match[1]).toFixed(6)},${Number(match[2]).toFixed(6)},${Number(match[3]).toFixed(6)}`
        );
        const triangles = [
            ...object[1].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g),
        ].map((match) => [Number(match[1]), Number(match[2]), Number(match[3])]);
        const coordinateTriangles = new Set<string>();
        const edgeUses = new Map<string, number>();
        for (const triangle of triangles) {
            const coordinates = triangle.map((index) => vertices[index]);
            const triangleKey = [...coordinates].sort().join('|');
            assert.equal(coordinateTriangles.has(triangleKey), false);
            coordinateTriangles.add(triangleKey);
            for (const [left, right] of [
                [coordinates[0], coordinates[1]],
                [coordinates[1], coordinates[2]],
                [coordinates[2], coordinates[0]],
            ]) {
                const edgeKey = left < right ? `${left}|${right}` : `${right}|${left}`;
                edgeUses.set(edgeKey, (edgeUses.get(edgeKey) ?? 0) + 1);
            }
        }
        assert.ok(triangles.length > 0);
        assert.ok([...edgeUses.values()].every((count) => count === 2));
    }
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
    assert.equal(fitted.empiricalLuts.length, 1);
    assert.equal(fitted.empiricalLuts[0].samples.length, completed.samples.length);
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

test('Stack Matrix LUT uses an exact photographed recipe before the optical simulation', async () => {
    const [matrix, , profile, model] = await modules;
    const planned = matrix.buildStackMatrixCalibration(
        filaments,
        options(8),
        '2026-08-07T10:00:00.000Z'
    );
    const measuredColors = planned.samples.map(
        (_, index) => [30 + index, 150 + index, 45 + index] as [number, number, number]
    );
    const completed = matrix.completeStackMatrixCalibration(
        planned,
        measuredColors,
        'matrix.jpg',
        false,
        '2026-08-07T11:00:00.000Z'
    );
    const fitted = model.fitAppearanceRankModel(
        profile.upsertStackMatrixCalibration(profile.createEmptyAppearanceProfile(), completed),
        {
            filamentProfileFingerprint: profile.fingerprintAppearanceFilaments(filaments),
            layerHeight: 0.08,
            firstLayerHeight: 0.2,
            transitionOpacity: 0.9,
            filaments,
        }
    );
    const lut = fitted.empiricalLuts[0];
    const sample = lut.samples.find((candidate) => new Set(candidate.recipeFilamentIds).size > 1)!;
    const prefix = sample.recipeFilamentIds.map((filamentId) => ({
        filamentId,
        filamentColor: filaments.find((filament) => filament.id === filamentId)!.color,
        thickness: 0.08,
    }));

    const resolved = model.resolveAppearanceRankModel({ L: 60, a: 0, b: 0 }, fitted, prefix);

    assert.equal(resolved.empiricalMatch?.kind, 'exact');
    assert.deepEqual(resolved.empiricalMatch?.sampleIds, [sample.id]);
    assert.deepEqual(resolved.lab, {
        L: sample.measuredLab[0],
        a: sample.measuredLab[1],
        b: sample.measuredLab[2],
    });
    assert.equal(resolved.exactAnchor?.id, sample.exactAnchorId);
});

test('Stack Matrix LUT interpolates nearby photographed recipes and falls back outside coverage', async () => {
    const [matrix, , profile, model] = await modules;
    const exhaustive = matrix.buildStackMatrixCalibration(
        filaments,
        options(64),
        '2026-08-07T09:00:00.000Z'
    );
    const planned = matrix.buildStackMatrixCalibration(
        filaments,
        options(8),
        '2026-08-07T10:00:00.000Z'
    );
    const completed = matrix.completeStackMatrixCalibration(
        planned,
        planned.samples.map(
            (_, index) => [25 + index * 2, 145 + index * 3, 35 + index] as [number, number, number]
        ),
        'matrix.jpg',
        false,
        '2026-08-07T11:00:00.000Z'
    );
    const fitted = model.fitAppearanceRankModel(
        profile.upsertStackMatrixCalibration(profile.createEmptyAppearanceProfile(), completed),
        {
            filamentProfileFingerprint: profile.fingerprintAppearanceFilaments(filaments),
            layerHeight: 0.08,
            firstLayerHeight: 0.2,
            transitionOpacity: 0.9,
            filaments,
        }
    );
    const lut = fitted.empiricalLuts[0];
    const measuredRecipeKeys = new Set(
        lut.samples.map((sample) => sample.recipeFilamentIds.join())
    );
    const weights = [1, Math.sqrt(2), 2];
    const distance = (left: readonly string[], right: readonly string[]) =>
        left.reduce(
            (sum, filamentId, index) => sum + (filamentId === right[index] ? 0 : weights[index]),
            0
        ) / weights.reduce((sum, weight) => sum + weight, 0);
    const missing = exhaustive.samples
        .map((sample) => sample.stack.map((index) => filaments[index].id))
        .find(
            (recipe) =>
                !measuredRecipeKeys.has(recipe.join()) &&
                lut.samples.filter((sample) => distance(recipe, sample.recipeFilamentIds) <= 0.6)
                    .length >= 2
        )!;
    assert.ok(missing, 'the sparse matrix should leave an interpolatable recipe unmeasured');
    const prefix = missing.map((filamentId) => ({
        filamentId,
        filamentColor: filaments.find((filament) => filament.id === filamentId)!.color,
        thickness: 0.08,
    }));
    const nearbyBase = lut.samples[0].predictedLab;

    const interpolated = model.resolveAppearanceRankModel(
        { L: nearbyBase[0], a: nearbyBase[1], b: nearbyBase[2] },
        fitted,
        prefix
    );
    const outside = model.resolveAppearanceRankModel({ L: 100, a: 200, b: 200 }, fitted, prefix);

    assert.equal(interpolated.empiricalMatch?.kind, 'interpolated');
    assert.ok((interpolated.empiricalMatch?.sampleIds.length ?? 0) >= 2);
    assert.notDeepEqual(interpolated.lab, {
        L: nearbyBase[0],
        a: nearbyBase[1],
        b: nearbyBase[2],
    });
    assert.equal(outside.empiricalMatch, undefined);
    assert.deepEqual(outside.lab, { L: 100, a: 200, b: 200 });
});

test('Stack Matrix subset evidence applies to its full owner profile and legacy subset plans', async () => {
    const [matrix, , profile, model] = await modules;
    const subset = filaments.slice(0, 2);
    const fullFingerprint = profile.fingerprintAppearanceFilaments(filaments);
    for (const ownerProfileFingerprint of [fullFingerprint, undefined]) {
        const planned = matrix.buildStackMatrixCalibration(
            subset,
            { ...options(8), ownerProfileFingerprint },
            '2026-08-07T10:00:00.000Z'
        );
        const completed = matrix.completeStackMatrixCalibration(
            planned,
            planned.samples.map((sample) => [...sample.predictedColor.rgb]),
            'matrix.jpg',
            false,
            '2026-08-07T11:00:00.000Z',
            {
                alignmentConfidence: 0.9,
                alignmentMethod: 'detected',
                alignmentVerified: true,
            }
        );
        const appearance = profile.upsertStackMatrixCalibration(
            profile.createEmptyAppearanceProfile(),
            completed
        );
        const fitted = model.fitAppearanceRankModel(appearance, {
            filamentProfileFingerprint: fullFingerprint,
            layerHeight: 0.08,
            firstLayerHeight: 0.2,
            transitionOpacity: 0.9,
            filaments,
        });
        assert.equal(fitted.exactAnchors.length, completed.samples.length);
        assert.equal(fitted.empiricalLuts[0].samples.length, completed.samples.length);
    }
});

test('Stack Matrix anchors ignore alignments explicitly saved as unverified', async () => {
    const [matrix, , profile, model] = await modules;
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
        '2026-08-07T11:00:00.000Z',
        {
            alignmentConfidence: 0.2,
            alignmentMethod: 'detected',
            alignmentVerified: false,
        }
    );
    const fitted = model.fitAppearanceRankModel(
        profile.upsertStackMatrixCalibration(profile.createEmptyAppearanceProfile(), completed),
        {
            filamentProfileFingerprint: profile.fingerprintAppearanceFilaments(filaments),
            layerHeight: 0.08,
            firstLayerHeight: 0.2,
            transitionOpacity: 0.9,
            filaments,
        }
    );

    assert.equal(fitted.exactAnchors.length, 0);
    assert.equal(fitted.empiricalLuts.length, 0);
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

test('Stack Matrix retention never evicts completed evidence when a new plan is added', async () => {
    const [matrix, , profile] = await modules;
    let appearance = profile.createEmptyAppearanceProfile();
    for (let index = 0; index < 4; index++) {
        const planned = matrix.buildStackMatrixCalibration(
            filaments,
            options(8),
            `2026-08-0${index + 1}T10:00:00.000Z`
        );
        appearance = profile.upsertStackMatrixCalibration(
            appearance,
            matrix.completeStackMatrixCalibration(
                planned,
                planned.samples.map((sample) => [...sample.predictedColor.rgb]),
                `matrix-${index}.jpg`,
                false,
                `2026-08-0${index + 1}T11:00:00.000Z`
            )
        );
    }
    appearance = profile.upsertStackMatrixCalibration(
        appearance,
        matrix.buildStackMatrixCalibration(filaments, options(8), '2026-08-07T10:00:00.000Z')
    );

    assert.equal(appearance.stackMatrices?.length, 5);
    assert.equal(
        appearance.stackMatrices?.filter((record) => record.status === 'complete').length,
        4
    );
    assert.equal(
        appearance.stackMatrices?.filter((record) => record.status === 'planned').length,
        1
    );
    assert.equal(
        profile
            .sanitizeAppearanceProfile(structuredClone(appearance))
            ?.stackMatrices?.filter((record) => record.status === 'complete').length,
        4
    );
});

test('Stack Matrix completion preserves reviewed alignment evidence through sanitation', async () => {
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
        '2026-08-07T11:00:00.000Z',
        {
            alignmentConfidence: 0.63,
            alignmentMethod: 'manual',
            alignmentVerified: true,
        }
    );
    const appearance = profile.upsertStackMatrixCalibration(
        profile.createEmptyAppearanceProfile(),
        completed
    );
    const sanitized = profile.sanitizeAppearanceProfile(structuredClone(appearance));

    assert.equal(sanitized?.stackMatrices?.[0].alignmentConfidence, 0.63);
    assert.equal(sanitized?.stackMatrices?.[0].alignmentMethod, 'manual');
    assert.equal(sanitized?.stackMatrices?.[0].alignmentVerified, true);
});
