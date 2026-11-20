import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { decodeProject, encodeProject, readProjectState } from '../src/lib/projectFile.ts';

const image = new Blob(
    [
        Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ3YAAAAASUVORK5CYII=',
            'base64'
        ),
    ],
    { type: 'image/png' }
);

test('project ZIP round-trips the image, optional settings and custom palette metadata', async () => {
    const state = readProjectState({
        name: 'Poster',
        appVersion: '4.2.0',
        adjustments: { clarity: 20, laterSlider: 80 },
        quantize: {
            paletteId: 'pal-1',
            palette: { id: 'pal-1', name: 'Custom', colors: ['#123', '#456'], disabledColors: [1] },
        },
        print: { layerHeight: 0.18, laterOption: false },
        working3D: { filaments: [{ id: 'f1', color: '#FFC060', td: 0.25 }] },
    });
    const reopened = await decodeProject(await encodeProject({ state, image }));
    assert.deepEqual(reopened.state, state);
    assert.equal(reopened.state.adjustments.exposure, 0);
    assert.equal(reopened.state.adjustments.laterSlider, undefined);
    assert.deepEqual(reopened.state.quantize.palette?.disabledColors, [1]);
    assert.equal(reopened.state.print.layerHeight, 0.18);
    assert.deepEqual(
        new Uint8Array(await reopened.image.arrayBuffer()),
        new Uint8Array(await image.arrayBuffer())
    );
});

test('reads the current image from the earlier project prototype', async () => {
    const archive = new JSZip();
    archive.file('images/1.png', await image.arrayBuffer());
    archive.file(
        'project.json',
        JSON.stringify({
            format: 'kromacut-project',
            version: 1,
            history: { current: 1, past: [0], future: [2] },
            state: { name: 'Prototype', threeD: { layerHeight: 0.24 }, futureField: true },
        })
    );
    const project = await decodeProject(await archive.generateAsync({ type: 'blob' }));
    assert.equal(project.state.name, 'Prototype');
    assert.equal(project.state.print.layerHeight, 0.24);
    assert.equal(project.state.quantize.algorithm, 'kmeans');
});

test('rejects unknown versions, oversized expanded metadata, and oversized image dimensions', async () => {
    const archive = new JSZip();
    archive.file(
        'project.json',
        JSON.stringify({ format: 'kromacut-project', version: 99, state: {} })
    );
    const wrongVersion = await archive.generateAsync({ type: 'blob' });
    await assert.rejects(decodeProject(wrongVersion), { message: 'version' });

    archive.file('project.json', ' '.repeat(2 * 1024 * 1024 + 1));
    const expanded = await archive.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    await assert.rejects(decodeProject(expanded), { message: 'tooLarge' });

    const header = new Uint8Array(await image.arrayBuffer());
    new DataView(header.buffer).setUint32(16, 100000);
    await assert.rejects(
        encodeProject({ state: readProjectState({}), image: new Blob([header]) }),
        { message: 'tooLarge' }
    );
});
