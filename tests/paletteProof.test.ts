import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

import { buildPaletteProofSnapshot } from './helpers/paletteProofFixture.ts';

type PaletteProofModule = typeof import('../src/lib/paletteProof.ts');

let paletteProofModule: Promise<PaletteProofModule> | null = null;

async function loadPaletteProofModule(): Promise<PaletteProofModule> {
    paletteProofModule ??= loadViteModule<PaletteProofModule>('/src/lib/paletteProof.ts');
    return paletteProofModule;
}

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

test('default target-column footprint is 75 x 48 mm', async () => {
    const { calculatePaletteProofFootprint } = await loadPaletteProofModule();
    assert.deepEqual(calculatePaletteProofFootprint(8, 5), { widthMm: 75, heightMm: 48 });
    assert.deepEqual(calculatePaletteProofFootprint(0, 5), { widthMm: 0, heightMm: 0 });
});

test('final stack exposes exactly one non-empty prefix per physical layer', async () => {
    const { enumerateFinalStackPrefixes } = await loadPaletteProofModule();
    const snapshot = buildPaletteProofSnapshot(7);
    const prefixes = enumerateFinalStackPrefixes(snapshot);

    assert.equal(prefixes.length, 7);
    assert.deepEqual(
        prefixes.map((prefix) => prefix.canonicalStackKey),
        snapshot.layers.map((layer) => layer.canonicalStackKey)
    );
});

test('target selection is deterministic and retains the dominant target', async () => {
    const { selectPaletteProofTargets } = await loadPaletteProofModule();
    const snapshot = buildPaletteProofSnapshot(8, 12);
    const first = selectPaletteProofTargets(snapshot, 8);
    const second = selectPaletteProofTargets(snapshot, 8);

    assert.deepEqual(first, second);
    assert.equal(first.length, 8);
    assert.ok(first.some((target) => target.id === 'target-1'));
});

test('candidate selection keeps unique neighbors and deterministic boundary fallbacks', async () => {
    const { enumerateFinalStackPrefixes, selectPrefixCandidates } = await loadPaletteProofModule();
    const snapshot = buildPaletteProofSnapshot(6);
    const prefixes = enumerateFinalStackPrefixes(snapshot);
    const boundaryTarget = { ...snapshot.targetMappings[0], paletteIndex: 0 };
    const candidates = selectPrefixCandidates(boundaryTarget, prefixes);

    assert.equal(candidates.length, 5);
    assert.equal(
        new Set(candidates.map((candidate) => candidate.prefix.canonicalStackKey)).size,
        5
    );
    assert.equal(candidates[0].role, 'incumbent');
    assert.ok(candidates.some((candidate) => candidate.role === 'upper-neighbor'));
    assert.ok(
        candidates.some(
            (candidate) =>
                candidate.role === 'fallback' && candidate.replacesRole === 'lower-neighbor'
        )
    );
});

test('evidence roles use only versioned prefixes with finite scores', async () => {
    const { enumerateFinalStackPrefixes, selectPrefixCandidates } = await loadPaletteProofModule();
    const snapshot = buildPaletteProofSnapshot(6);
    const prefixes = enumerateFinalStackPrefixes(snapshot);
    const boundaryTarget = { ...snapshot.targetMappings[0], paletteIndex: 0 };
    const candidates = selectPrefixCandidates(boundaryTarget, prefixes, {
        version: 'appearance-evidence-v1',
        uncertaintyByStackKey: { [prefixes[4].canonicalStackKey]: 0.8 },
        discriminatorByStackKey: { [prefixes[5].canonicalStackKey]: 0.7 },
    });

    assert.equal(
        candidates.find((candidate) => candidate.role === 'uncertain')?.prefix.canonicalStackKey,
        prefixes[4].canonicalStackKey
    );
    assert.equal(
        candidates.find((candidate) => candidate.role === 'discriminator')?.prefix
            .canonicalStackKey,
        prefixes[5].canonicalStackKey
    );
});

test('short stacks reduce rows and disable comparisons with fewer than two prefixes', async () => {
    const { buildPaletteProofSpec } = await loadPaletteProofModule();
    const threeLayerSpec = buildPaletteProofSpec(buildPaletteProofSnapshot(3, 2));
    const oneLayerSpec = buildPaletteProofSpec(buildPaletteProofSnapshot(1, 2));

    assert.equal(threeLayerSpec.layout.rowCount, 3);
    assert.equal(threeLayerSpec.cells.length, 6);
    assert.equal(threeLayerSpec.comparisonEnabled, true);
    assert.equal(oneLayerSpec.layout.rowCount, 1);
    assert.equal(oneLayerSpec.comparisonEnabled, false);
});

test('proof spec keeps targets on screen and validates only physical stack prefixes', async () => {
    const { buildPaletteProofSpec, validatePaletteProofSpec } = await loadPaletteProofModule();
    const snapshot = buildPaletteProofSnapshot(6, 8);
    const spec = buildPaletteProofSpec(snapshot);

    assert.equal(spec.layout.columnCount, 8);
    assert.equal(spec.layout.rowCount, 5);
    assert.equal(spec.layout.widthMm, 75);
    assert.equal(spec.layout.heightMm, 48);
    assert.equal(spec.layout.cornerRadiusMm, 1.2);
    assert.equal(spec.targetPalette.length, 8);
    assert.equal(spec.cells.length, 40);
    assert.deepEqual(validatePaletteProofSpec(snapshot, spec), []);
    assert.equal(
        spec.physicalPatches.filter((patch) => patch.id === 'foundation-reference').length,
        1
    );

    const staleSpec = structuredClone(spec);
    staleSpec.snapshotFingerprint = 'stale-final-stack';
    assert.ok(
        validatePaletteProofSpec(snapshot, staleSpec).includes(
            'snapshot fingerprint does not match'
        )
    );

    const foreignSpec = structuredClone(spec);
    foreignSpec.cells[0].canonicalStackKey = 'not-a-prefix';
    assert.ok(
        validatePaletteProofSpec(snapshot, foreignSpec).some((error) =>
            error.includes('references a non-prefix stack')
        )
    );
});
