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

test('default target-row footprint is a touching 44 x 68 mm matrix', async () => {
    const { calculatePaletteProofFootprint } = await loadPaletteProofModule();
    assert.deepEqual(calculatePaletteProofFootprint(8, 5), { widthMm: 44, heightMm: 68 });
    assert.deepEqual(calculatePaletteProofFootprint(8, 5, 'target-rows', 0), {
        widthMm: 44,
        heightMm: 68,
    });
    assert.deepEqual(calculatePaletteProofFootprint(0, 5), { widthMm: 0, heightMm: 0 });
});

test('requested target and candidate counts resize the proof matrix', async () => {
    const { buildPaletteProofSpec } = await loadPaletteProofModule();
    const spec = buildPaletteProofSpec(buildPaletteProofSnapshot(6, 8), {
        targetCount: 3,
        candidateCount: 2,
    });

    assert.equal(spec.layout.columnCount, 3);
    assert.equal(spec.layout.rowCount, 2);
    assert.equal(spec.layout.widthMm, 20);
    assert.equal(spec.layout.heightMm, 28);
    assert.equal(spec.cells.length, 6);
});

test('new proofs pack sorted touching candidates', async () => {
    const { buildPaletteProofSpec, validatePaletteProofSpec } = await loadPaletteProofModule();
    const snapshot = buildPaletteProofSnapshot(8, 8);
    const touching = buildPaletteProofSpec(snapshot);

    assert.equal(touching.layout.gapMm, 0);
    assert.equal(touching.layout.widthMm, 44);
    assert.equal(touching.layout.heightMm, 68);
    assert.equal(touching.layout.reinforcementLayers, 0);
    assert.equal(touching.layout.reinforcementClearanceMm, 0);
    for (const column of touching.columns) {
        const prefixIndices = column.cellIds.map(
            (cellId) => touching.cells.find((cell) => cell.id === cellId)!.prefixIndex
        );
        assert.deepEqual(
            prefixIndices,
            [...prefixIndices].sort((left, right) => left - right)
        );
    }
    assert.deepEqual(validatePaletteProofSpec(snapshot, touching), []);
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

test('prioritized targets stay first while automatic selection fills the remaining slots', async () => {
    const { buildPaletteProofSpec, selectPaletteProofTargets } =
        await loadPaletteProofModule();
    const snapshot = buildPaletteProofSnapshot(8, 12);
    const prioritizedTargetMappingIds = ['target-11', 'target-6'];
    const selected = selectPaletteProofTargets(
        snapshot,
        5,
        undefined,
        prioritizedTargetMappingIds
    );

    assert.deepEqual(
        selected.slice(0, prioritizedTargetMappingIds.length).map((target) => target.id),
        prioritizedTargetMappingIds
    );
    assert.equal(selected.length, 5);
    assert.equal(new Set(selected.map((target) => target.id)).size, 5);

    const spec = buildPaletteProofSpec(snapshot, {
        targetCount: 5,
        prioritizedTargetMappingIds,
    });
    assert.deepEqual(
        spec.columns
            .slice(0, prioritizedTargetMappingIds.length)
            .map((column) => column.targetMappingId),
        prioritizedTargetMappingIds
    );
});

test('prioritized targets reject invalid or conflicting target sets', async () => {
    const { buildPaletteProofSpec } = await loadPaletteProofModule();
    const snapshot = buildPaletteProofSnapshot(8, 12);

    assert.throws(
        () =>
            buildPaletteProofSpec(snapshot, {
                targetCount: 1,
                prioritizedTargetMappingIds: ['target-1', 'target-2'],
            }),
        /exceed the requested target count/
    );
    assert.throws(
        () =>
            buildPaletteProofSpec(snapshot, {
                prioritizedTargetMappingIds: ['not-a-current-target'],
            }),
        /not in the current result/
    );
    assert.throws(
        () =>
            buildPaletteProofSpec(snapshot, {
                targetMappingIds: ['target-1'],
                prioritizedTargetMappingIds: ['target-2'],
            }),
        /cannot combine an exact target set/
    );
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

test('candidate selection honors bounded proof row counts', async () => {
    const { enumerateFinalStackPrefixes, selectPrefixCandidates } = await loadPaletteProofModule();
    const snapshot = buildPaletteProofSnapshot(6);
    const prefixes = enumerateFinalStackPrefixes(snapshot);

    assert.equal(
        selectPrefixCandidates(snapshot.targetMappings[2], prefixes, undefined, 2).length,
        2
    );
    assert.equal(
        selectPrefixCandidates(snapshot.targetMappings[2], prefixes, undefined, 99).length,
        5
    );
    assert.equal(
        selectPrefixCandidates(snapshot.targetMappings[2], prefixes, undefined, 1).length,
        2
    );
});

test('next-proof selection keeps one anchor and spends rows on untested prefixes', async () => {
    const { buildPaletteProofSpec } = await loadPaletteProofModule();
    const snapshot = buildPaletteProofSnapshot(8, 1);
    const first = buildPaletteProofSpec(snapshot, { targetCount: 1, candidateCount: 5 });
    const targetId = first.columns[0].targetMappingId;
    const testedStackKeys = new Set(first.cells.map((cell) => cell.canonicalStackKey));
    const anchorStackKey = first.cells[0].canonicalStackKey;
    const next = buildPaletteProofSpec(snapshot, {
        targetCount: 1,
        candidateCount: 5,
        selectionHistory: {
            targetPriorityById: new Map([[targetId, 1]]),
            candidateHistoryByTargetId: new Map([[targetId, { testedStackKeys, anchorStackKey }]]),
        },
    });

    assert.notEqual(next.id, first.id);
    assert.equal(next.cells[0].candidateRole, 'previous-best');
    assert.equal(next.cells[0].canonicalStackKey, anchorStackKey);
    assert.ok(next.cells.some((cell) => !testedStackKeys.has(cell.canonicalStackKey)));
});

test('next-proof target selection rotates to targets not covered by the first proof', async () => {
    const { buildPaletteProofSpec } = await loadPaletteProofModule();
    const snapshot = buildPaletteProofSnapshot(8, 12);
    const first = buildPaletteProofSpec(snapshot, { targetCount: 4 });
    const firstTargetIds = new Set(first.columns.map((column) => column.targetMappingId));
    const targetPriorityById = new Map(
        snapshot.targetMappings.map((target) => [target.id, firstTargetIds.has(target.id) ? 1 : 0])
    );
    const next = buildPaletteProofSpec(snapshot, {
        targetCount: 4,
        selectionHistory: {
            targetPriorityById,
            candidateHistoryByTargetId: new Map(),
        },
    });

    assert.ok(next.columns.some((column) => !firstTargetIds.has(column.targetMappingId)));
});

test('continuation keeps the requested target set and order', async () => {
    const { buildPaletteProofSpec } = await loadPaletteProofModule();
    const snapshot = buildPaletteProofSnapshot(8, 12);
    const targetMappingIds = [
        snapshot.targetMappings[7].id,
        snapshot.targetMappings[2].id,
        snapshot.targetMappings[10].id,
    ];
    const continuation = buildPaletteProofSpec(snapshot, {
        candidateCount: 5,
        targetMappingIds,
        selectionHistory: {
            targetPriorityById: new Map(),
            candidateHistoryByTargetId: new Map(),
        },
    });

    assert.deepEqual(
        continuation.columns.map((column) => column.targetMappingId),
        targetMappingIds
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
    assert.equal(spec.layout.widthMm, 44);
    assert.equal(spec.layout.heightMm, 68);
    assert.equal(spec.layout.matrixOrientation, 'target-rows');
    assert.equal(spec.layout.cornerRadiusMm, 1.2);
    assert.equal(spec.layout.reinforcementLayers, 0);
    assert.equal(spec.layout.reinforcementClearanceMm, 0);
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
