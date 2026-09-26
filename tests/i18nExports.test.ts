import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import JSZip from 'jszip';
import { buildPaletteProofSnapshot } from './helpers/paletteProofFixture.ts';
import { withViteTestServer } from './helpers/viteModule.ts';

test('translated proof instructions leave 3MF geometry, materials, and calibration metadata unchanged', async () => {
    await withViteTestServer(async (server) => {
        const { buildPaletteProofSpec } = (await server.ssrLoadModule(
            '/src/lib/paletteProof.ts'
        )) as typeof import('../src/lib/paletteProof.ts');
        const { exportPaletteProof3MF } = (await server.ssrLoadModule(
            '/src/lib/paletteProofExport.ts'
        )) as typeof import('../src/lib/paletteProofExport.ts');
        const { i18n } = (await server.ssrLoadModule(
            '/src/lib/i18n.ts'
        )) as typeof import('../src/lib/i18n.ts');
        const snapshot = buildPaletteProofSnapshot(6, 4);
        const spec = buildPaletteProofSpec(snapshot);
        const originalSnapshot = JSON.stringify(snapshot);
        const originalSpec = JSON.stringify(spec);
        const english = await JSZip.loadAsync(
            await (await exportPaletteProof3MF(snapshot, spec)).arrayBuffer()
        );
        for (const namespace of ['common', 'workspace', 'printing', 'calibration', 'messages']) {
            i18n.addResourceBundle(
                'ro',
                namespace,
                JSON.parse(readFileSync(`src/locales/ro/${namespace}.json`, 'utf8'))
            );
        }
        await i18n.changeLanguage('ro');
        try {
            const romanian = await JSZip.loadAsync(
                await (await exportPaletteProof3MF(snapshot, spec)).arrayBuffer()
            );
            assert.deepEqual(Object.keys(romanian.files), Object.keys(english.files));
            for (const filename of Object.keys(english.files)) {
                if (
                    english.files[filename].dir ||
                    filename === 'Metadata/palette-proof-instructions.txt'
                )
                    continue;
                if (filename.endsWith('.model')) {
                    // The exporter generates fresh object UUIDs for every export,
                    // even without a language change. Ignore only those attributes.
                    const stableModel = (xml: string) =>
                        xml.replace(/p:UUID="[0-9a-f-]{36}"/g, 'p:UUID="generated"');
                    assert.equal(
                        stableModel(await romanian.file(filename)!.async('string')),
                        stableModel(await english.file(filename)!.async('string')),
                        filename
                    );
                } else {
                    assert.deepEqual(
                        await romanian.file(filename)!.async('uint8array'),
                        await english.file(filename)!.async('uint8array'),
                        filename
                    );
                }
            }
            const instructions = await romanian
                .file('Metadata/palette-proof-instructions.txt')!
                .async('string');
            assert.ok(instructions.startsWith(i18n.t('messages:instructions.proofTitle')));
            assert.ok(instructions.includes(i18n.t('messages:instructions.orientationMarker')));
            assert.ok(instructions.includes(i18n.t('messages:instructions.spacingTouching')));
            assert.ok(instructions.includes(i18n.t('messages:instructions.physicalSequence')));
            assert.doesNotMatch(
                instructions,
                /Slicer setup:|Start with |foundation margin|matrix cell |\{\{/
            );
            assert.equal(JSON.stringify(snapshot), originalSnapshot);
            assert.equal(JSON.stringify(spec), originalSpec);
        } finally {
            await i18n.changeLanguage('en');
        }
    });
});
