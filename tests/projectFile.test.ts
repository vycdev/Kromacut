import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
    encodeProject,
    decodeProject,
    validateProjectState,
    type ProjectArchive,
} from '../src/lib/projectFile.ts';
import { ADJUSTMENT_DEFAULTS } from '../src/lib/applyAdjustments.ts';
const png = new Uint8Array(
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4l8AAAAASUVORK5CYII=',
        'base64'
    )
);
const fixture = (): ProjectArchive => ({
    state: {
        name: 'Portable session',
        adjustments: { ...ADJUSTMENT_DEFAULTS, contrast: 23 },
        quantize: {
            algorithm: 'median-cut',
            weight: 128,
            finalColors: 3,
            palettes: [
                {
                    id: 'test',
                    name: 'Wine',
                    colors: ['#991122', '#101010'],
                    disabledColors: [1],
                    colorNames: ['Red', 'Black'],
                    version: 1,
                    createdAt: 10,
                    updatedAt: 20,
                },
            ],
        },
        threeD: {
            layerHeight: 0.16,
            slicerFirstLayerHeight: 0.24,
            pixelSize: 0.2,
            smoothMeshingStrength: 'medium',
            colorSliceHeights: [0.72, 0.32],
            colorOrder: [1, 0],
            filteredSwatches: [
                { hex: '#991122', a: 255, count: 10 },
                { hex: '#101010', a: 255, count: 5 },
            ],
            filaments: [
                { id: 'wine', color: '#991122', td: 0.4, name: 'Wine red', brand: 'Creality' },
            ],
            paintMode: 'autopaint',
            multiHeadMode: true,
            multiHeadCount: 4,
            multiHeadSearchDepth: 'thorough',
            multiHeadColorMode: 'color',
            flatPaint: false,
            optimizerAlgorithm: 'balanced',
            heightDithering: true,
            ditherLineWidth: 0.21,
        },
        recommendations: {
            checkedBrands: ['SUNLU', 'ELEGOO'],
            material: 'PLA',
            chosen: { '#991122': 'sunlu-red' },
        },
        nozzle: {
            scenarios: [
                { nozzle: 0.4, line: 0.45, width: 123 },
                { nozzle: 0.2, line: 0.22, width: 80 },
            ],
            linked: false,
            patchEnabled: true,
            mode: 'patched',
        },
        view: {
            mode: '3d',
            isOrtho: true,
            renderMode: 'shaded',
            colorMode: 'physical',
            checkerboard: true,
        },
    },
    history: { current: 1, past: [0], future: [2] },
    images: [png, png, png],
});
test('round trip retains history position, selected palettes, adjustments and editable 3D state', async () => {
    const original = fixture(),
        decoded = await decodeProject(await encodeProject(original));
    assert.deepEqual(decoded, original);
});
test('computed mesh/optimizer data and unknown fields never enter project state', () => {
    const f = fixture();
    Object.assign(f.state.threeD, {
        autoPaintResult: { large: 'computed' },
        printableFeaturePixels: { data: [1, 2, 3] },
    });
    const parsed = validateProjectState(f.state);
    assert.equal(parsed.threeD.autoPaintResult, undefined);
    assert.equal(parsed.threeD.printableFeaturePixels, undefined);
});
test('reject invalid numbers, image references, unsupported versions and corrupt PNG', async () => {
    const f = fixture();
    f.state.threeD.pixelSize = NaN;
    assert.throws(() => validateProjectState(f.state));
    const g = fixture();
    g.history.current = 4;
    await assert.rejects(() => encodeProject(g));
    const zip = await JSZip.loadAsync(await encodeProject(fixture()));
    const manifest = JSON.parse(await zip.file('project.json')!.async('string'));
    manifest.version = 2;
    zip.file('project.json', JSON.stringify(manifest));
    await assert.rejects(
        () => zip.generateAsync({ type: 'uint8array' }).then(decodeProject),
        /version/
    );
    const broken = fixture();
    broken.images[1] = new Uint8Array([1, 2, 3]);
    await assert.rejects(() => encodeProject(broken));
    const invalid = fixture();
    invalid.state.threeD.colorOrder = [0, 0];
    assert.throws(() => validateProjectState(invalid.state));
});
test('project PNG dimensions are bounded before image decoding', async () => {
    const f = fixture();
    f.images = [png.slice(), png.slice(), png.slice()];
    new DataView(f.images[0].buffer).setUint32(16, 100000);
    await assert.rejects(() => encodeProject(f), /tooLarge/);
});
