import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadViteModule } from './helpers/viteModule.ts';
import {
    measurementSummary,
    persistOptimizerEvidence,
    sha256,
} from './helpers/optimizerEvidence.ts';
import { imageSwatches } from './helpers/calibratedSwatches.ts';

test('full optimizer evidence survives a failed golden assertion and refuses replacement', async () => {
    const auto =
        await loadViteModule<typeof import('../src/lib/autoPaint.ts')>('/src/lib/autoPaint.ts');
    const directory = mkdtempSync(join(tmpdir(), 'kromacut-evidence-'));
    try {
        const fixture = join(directory, 'case.json');
        writeFileSync(fixture, '{"settings":"original"}');
        const filaments = [
            { id: 'black', color: '#000000', td: 0.1 },
            { id: 'white', color: '#ffffff', td: 0.1 },
        ];
        const swatches = [{ hex: '#444444', count: 10 }];
        const result = auto.generateAutoLayers(filaments, swatches, 0.08, 0.4, 2, true, false, {
            algorithm: 'exact',
            cachingEnabled: false,
        });
        const options = {
            output: join(directory, 'full.json'),
            fixture,
            profile: fixture,
            sourceImage: fixture,
            configuration: { layerHeight: 0.08 },
            variant: 'test',
            filaments,
            swatches,
            result,
            timing: { appearanceFitMs: 1, optimizationMs: 2 },
        };
        assert.throws(() => {
            persistOptimizerEvidence(options);
            assert.equal(result.finalStack.fingerprint, 'deliberately-stale-golden');
        }, /deliberately-stale-golden/);
        const text = readFileSync(options.output, 'utf8');
        const saved = JSON.parse(text);
        assert.deepEqual(saved.result, JSON.parse(JSON.stringify(result)));
        assert.deepEqual(saved.swatches, swatches);
        assert.deepEqual(saved.configuration, options.configuration);
        assert.equal(saved.resultSha256, sha256(JSON.stringify(saved.result)));
        assert.equal(saved.inputs.fixture.sha256, sha256(readFileSync(fixture)));
        assert.throws(() => persistOptimizerEvidence(options), /EEXIST/);
        assert.equal(readFileSync(options.output, 'utf8'), text);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test('cats reconstruction retains all opaque pixel weights in canonical swatch order', () => {
    const swatches = imageSwatches(
        'tests/assets/performance/8-colors-frontlit-2026-08-26/cats/source.png'
    );
    assert.equal(swatches.length, 128);
    assert.equal(
        swatches.reduce((sum, s) => sum + s.count, 0),
        576 * 576
    );
    // Explicit input checksum keeps fixture reconstruction changes visible.
    assert.equal(
        sha256(JSON.stringify(swatches)),
        'dcf074c26e02243d6b16f2e51146af64921182ef0b518f277c960ce406a99174'
    );
});

test('cats captured observations and artifact hashes remain immutable', () => {
    const root = 'tests/assets/performance/8-colors-frontlit-2026-08-26';
    const fixture = JSON.parse(readFileSync(`${root}/cats/case.json`, 'utf8'));
    assert.equal(
        sha256(JSON.stringify({ observedResult: fixture.observedResult, sha256: fixture.sha256 })),
        'ce6e311c32641475752d0f0f3c16de26badd05b80dfc2eed238353901a094c85'
    );
    assert.equal(sha256(readFileSync(`${root}/profile.kfil`)), fixture.sha256.profile);
    assert.equal(sha256(readFileSync(`${root}/cats/source.png`)), fixture.sha256.sourceImage);
});

test('runtime summaries retain individual samples, median and full spread', () => {
    assert.deepEqual(measurementSummary([5, 1, 3]), {
        values: [5, 1, 3],
        median: 3,
        minimum: 1,
        maximum: 5,
        spread: 4,
    });
    assert.equal(measurementSummary([4, 2]).median, 3);
});
