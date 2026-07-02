import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';
import JSZip from 'jszip';

type GeneratorModule = typeof import('../src/lib/generateCalibrationPrint.ts');

let generatorModule: Promise<GeneratorModule> | null = null;

async function loadViteModule<T>(modulePath: string): Promise<T> {
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
        return (await server.ssrLoadModule(modulePath)) as T;
    } finally {
        await server.close();
    }
}

const loadGenerator = () =>
    (generatorModule ??= loadViteModule<GeneratorModule>('/src/lib/generateCalibrationPrint.ts'));

const baseOptions = {
    layerHeight: 0.08,
    firstLayerHeight: 0.2,
    maxLayers: 10,
    baseLayers: 5,
    patchSize: 12,
    gap: 1.5,
};

test('generateCalibrationStl writes one box per base/wedge/reference patch', async () => {
    const { generateCalibrationStl } = await loadGenerator();
    const blob = generateCalibrationStl(baseOptions);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    // Base slab + orientation tab + (maxLayers wedge patches) + 1 rail, each a
    // rounded prism (some corners squared), so per-box triangle counts vary. Every
    // prism contributes caps + walls in multiples of 4; check structural integrity.
    const triangleCount = view.getUint32(80, true);
    assert.ok(triangleCount > (2 + baseOptions.maxLayers + 1) * 12, 'non-trivial mesh');
    assert.equal(triangleCount % 4, 0, 'prisms contribute triangles in multiples of 4');
    assert.equal(buffer.byteLength, 84 + triangleCount * 50);
});

test('generateCalibration3mf builds slots in profile order and colors the parts', async () => {
    const { generateCalibration3mf } = await loadGenerator();
    // Profile order matches the user's machine: white in slot 1, black in slot 2.
    const profileFilaments = [
        { id: 'w', color: '#ffffff', name: 'White' },
        { id: 'k', color: '#000000', name: 'Black' },
        { id: 'a', color: '#ff0000', name: 'Red' },
        { id: 'b', color: '#00aa55', name: 'Green' },
    ];
    // Calibrate red + green over a black base (white is uncalibrated but still a slot).
    const tiles = [
        { filamentId: 'a', color: '#ff0000', baseFilamentId: 'k', baseColor: '#000000', name: 'Red' },
        { filamentId: 'b', color: '#00aa55', baseFilamentId: 'k', baseColor: '#000000', name: 'Green' },
    ];
    const blob = await generateCalibration3mf(tiles, baseOptions, profileFilaments);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    const model = await zip.file('3D/3dmodel.model')?.async('string');
    assert.ok(model, 'model XML present');
    assert.ok(zip.file('[Content_Types].xml'), 'content types present');
    assert.ok(zip.file('_rels/.rels'), 'relationships present');

    // One material per profile filament (no invented phantom base).
    const baseCount = (model!.match(/<base /g) ?? []).length;
    assert.equal(baseCount, profileFilaments.length);

    // Each filament tile = base object + color object + grouping object.
    const objectCount = (model!.match(/<object /g) ?? []).length;
    assert.equal(objectCount, tiles.length * 3);

    // One arrangeable build item per filament (so auto-arrange / print-by-color
    // work), each grouping its base + color as two components.
    const itemCount = (model!.match(/<item /g) ?? []).length;
    assert.equal(itemCount, tiles.length);
    const componentCount = (model!.match(/<component /g) ?? []).length;
    assert.equal(componentCount, tiles.length * 2);

    // Embedded slicer project provides the colors (extruder assignment + filament
    // list), which is what actually colors the parts in Bambu/Orca/Creality.
    const modelSettings = await zip.file('Metadata/model_settings.config')?.async('string');
    assert.ok(modelSettings, 'model_settings.config present');
    const partCount = (modelSettings!.match(/<part /g) ?? []).length;
    assert.equal(partCount, tiles.length * 2); // base + color part per filament
    assert.ok(modelSettings!.includes('key="extruder" value="2"'));
    // No assemble block — tiles must remain independent, arrangeable objects.
    assert.ok(!modelSettings!.includes('<assemble'));

    const projectRaw = await zip.file('Metadata/project_settings.config')?.async('string');
    assert.ok(projectRaw, 'project_settings.config present');
    const project = JSON.parse(projectRaw!);
    // Slots follow profile order, so slot 1 is white (not the base) — keeping the
    // black base off the machine's reserved slot 1.
    assert.deepEqual(project.filament_colour, ['#FFFFFF', '#000000', '#FF0000', '#00AA55']);
    assert.equal(project.filament_colour[0], '#FFFFFF');
    assert.equal(project.filament_type.length, profileFilaments.length);
});
