import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

import type { Filament } from '../src/types/index.ts';
import { buildPaletteProofSnapshot } from './helpers/paletteProofFixture.ts';

type AppearanceProfileModule = typeof import('../src/lib/appearanceProfile.ts');
type PaletteProofModule = typeof import('../src/lib/paletteProof.ts');
type ProfileManagerModule = typeof import('../src/lib/profileManager.ts');

let appearanceProfileModule: Promise<AppearanceProfileModule> | null = null;
let paletteProofModule: Promise<PaletteProofModule> | null = null;
let profileManagerModule: Promise<ProfileManagerModule> | null = null;

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

const loadAppearanceProfile = () =>
    (appearanceProfileModule ??= loadViteModule<AppearanceProfileModule>(
        '/src/lib/appearanceProfile.ts'
    ));
const loadPaletteProof = () =>
    (paletteProofModule ??= loadViteModule<PaletteProofModule>('/src/lib/paletteProof.ts'));
const loadProfileManager = () =>
    (profileManagerModule ??= loadViteModule<ProfileManagerModule>('/src/lib/profileManager.ts'));

const filaments: Filament[] = [
    { id: 'filament-0', color: '#000000', td: 0.1 },
    { id: 'filament-1', color: '#ff0000', td: 0.2 },
    { id: 'filament-2', color: '#ffffff', td: 0.4 },
    { id: 'filament-3', color: '#00ffff', td: 0.3 },
];

test('proof records freeze only reachable prefixes and the active process fingerprint', async () => {
    const { buildPaletteProofRecord, fingerprintAppearanceFilaments } =
        await loadAppearanceProfile();
    const { buildPaletteProofSpec } = await loadPaletteProof();
    const snapshot = buildPaletteProofSnapshot(7, 8);
    const proof = buildPaletteProofSpec(snapshot);
    const record = buildPaletteProofRecord(filaments, snapshot, proof, '2026-07-17T20:00:00.000Z');

    assert.equal(record.id, proof.id);
    assert.equal(record.snapshotFingerprint, snapshot.fingerprint);
    assert.equal(
        record.process.filamentProfileFingerprint,
        fingerprintAppearanceFilaments(filaments)
    );
    assert.equal(record.process.layerHeight, snapshot.settings.layerHeight);
    assert.equal(
        record.prefixes.length,
        new Set(proof.cells.map((cell) => cell.canonicalStackKey)).size
    );
    assert.equal(
        record.stack.length,
        Math.max(...record.prefixes.map((prefix) => prefix.prefixIndex)) + 1
    );
    assert.ok(record.prefixes.every((prefix) => prefix.prefixIndex < record.stack.length));
    assert.ok(record.prefixes.every((prefix) => prefix.basePredictedColor));
    assert.ok(record.process.unknownFields.includes('slicerToolpathFingerprint'));
});

test('tall proof records keep one shared stack instead of duplicating every prefix', async () => {
    const { buildPaletteProofRecord } = await loadAppearanceProfile();
    const { buildPaletteProofSpec } = await loadPaletteProof();
    const original = buildPaletteProofSnapshot(500, 1);
    const top = original.palette[499];
    const snapshot = {
        ...original,
        targetMappings: [
            {
                ...original.targetMappings[0],
                paletteIndex: top.index,
                paletteEntryId: top.id,
                canonicalStackKey: top.canonicalStackKey,
                projectedHeight: top.height,
                predictedColor: top.predictedColor,
                predictedLab: top.predictedLab,
            },
        ],
    };
    const proof = buildPaletteProofSpec(snapshot, { targetCount: 1 });
    const record = buildPaletteProofRecord(filaments, snapshot, proof, '2026-07-17T20:00:00.000Z');

    assert.equal(record.stack.length, 500);
    assert.ok(record.prefixes.every((prefix) => !('stack' in prefix)));
    assert.ok(JSON.stringify(record).length < 100_000);
});

test('target-column judgments preserve equal choices, none, and completion state', async () => {
    const {
        buildPaletteProofRecord,
        completePaletteProofEvaluation,
        createEmptyAppearanceProfile,
        deletePaletteProof,
        getPaletteProofEvaluationState,
        reopenPaletteProofEvaluation,
        setPaletteTargetResponse,
        upsertPaletteProofRecord,
    } = await loadAppearanceProfile();
    const { buildPaletteProofSpec } = await loadPaletteProof();
    const snapshot = buildPaletteProofSnapshot(6, 3);
    const proof = buildPaletteProofSpec(snapshot, { targetCount: 3 });
    const record = buildPaletteProofRecord(filaments, snapshot, proof, '2026-07-17T20:00:00.000Z');
    let appearance = upsertPaletteProofRecord(createEmptyAppearanceProfile(), record);

    appearance = setPaletteTargetResponse(
        appearance,
        proof.id,
        0,
        { response: 'closest', closestCellIds: proof.columns[0].cellIds.slice(0, 2).reverse() },
        '2026-07-17T20:01:00.000Z'
    );
    appearance = setPaletteTargetResponse(
        appearance,
        proof.id,
        1,
        { response: 'none' },
        '2026-07-17T20:02:00.000Z'
    );
    appearance = setPaletteTargetResponse(
        appearance,
        proof.id,
        2,
        { response: 'closest', closestCellIds: [proof.columns[2].cellIds[0]] },
        '2026-07-17T20:03:00.000Z'
    );

    const draft = getPaletteProofEvaluationState(appearance, proof.id);
    assert.equal(draft.answeredColumns, 3);
    assert.equal(draft.complete, false);
    assert.deepEqual(draft.judgments[0].closestCellIds, proof.columns[0].cellIds.slice(0, 2));
    assert.equal(draft.judgments[1].response, 'none');

    appearance = completePaletteProofEvaluation(appearance, proof.id, '2026-07-17T20:04:00.000Z');
    assert.equal(getPaletteProofEvaluationState(appearance, proof.id).complete, true);
    assert.throws(
        () => setPaletteTargetResponse(appearance, proof.id, 0, { response: 'none' }),
        /Reopen/
    );
    appearance = reopenPaletteProofEvaluation(appearance, proof.id, '2026-07-17T20:05:00.000Z');
    assert.equal(getPaletteProofEvaluationState(appearance, proof.id).complete, false);

    appearance = deletePaletteProof(appearance, proof.id);
    assert.equal(appearance.proofs.length, 0);
    assert.equal(appearance.viewingSessions.length, 0);
    assert.equal(appearance.targetJudgments.length, 0);
});

test('completed proofs and their evidence can be deleted', async () => {
    const {
        buildPaletteProofRecord,
        completePaletteProofEvaluation,
        createEmptyAppearanceProfile,
        deletePaletteProof,
        setPaletteTargetResponse,
        upsertPaletteProofRecord,
    } = await loadAppearanceProfile();
    const { buildPaletteProofSpec } = await loadPaletteProof();
    const snapshot = buildPaletteProofSnapshot(6, 1);
    const proof = buildPaletteProofSpec(snapshot, { targetCount: 1 });
    let appearance = upsertPaletteProofRecord(
        createEmptyAppearanceProfile(),
        buildPaletteProofRecord(filaments, snapshot, proof, '2026-07-17T20:00:00.000Z')
    );
    appearance = setPaletteTargetResponse(
        appearance,
        proof.id,
        0,
        { response: 'none' },
        '2026-07-17T20:01:00.000Z'
    );
    appearance = completePaletteProofEvaluation(appearance, proof.id, '2026-07-17T20:02:00.000Z');

    appearance = deletePaletteProof(appearance, proof.id);

    assert.equal(appearance.proofs.length, 0);
    assert.equal(appearance.viewingSessions.length, 0);
    assert.equal(appearance.targetJudgments.length, 0);
});

test('appearance import sanitation preserves valid records and drops tampered colors', async () => {
    const {
        buildPaletteProofRecord,
        createEmptyAppearanceProfile,
        sanitizeAppearanceProfile,
        upsertPaletteProofRecord,
    } = await loadAppearanceProfile();
    const { buildPaletteProofSpec, calculatePaletteProofFootprint } = await loadPaletteProof();
    const snapshot = buildPaletteProofSnapshot(6, 3);
    const proof = buildPaletteProofSpec(snapshot, { targetCount: 3 });
    const record = buildPaletteProofRecord(filaments, snapshot, proof, '2026-07-17T20:00:00.000Z');
    const appearance = upsertPaletteProofRecord(createEmptyAppearanceProfile(), record);

    assert.deepEqual(sanitizeAppearanceProfile(structuredClone(appearance)), appearance);

    const storedGapAppearance = structuredClone(appearance);
    const storedGapLayout = storedGapAppearance.proofs[0].proof.layout;
    storedGapLayout.gapMm = 1;
    storedGapLayout.reinforcementLayers = 2;
    storedGapLayout.reinforcementClearanceMm = 0.15;
    Object.assign(
        storedGapLayout,
        calculatePaletteProofFootprint(
            storedGapLayout.columnCount,
            storedGapLayout.rowCount,
            'target-rows',
            1
        )
    );
    assert.deepEqual(
        sanitizeAppearanceProfile(structuredClone(storedGapAppearance)),
        storedGapAppearance
    );

    const legacyLandscape = structuredClone(appearance);
    const legacyLayout = legacyLandscape.proofs[0].proof.layout;
    delete legacyLayout.matrixOrientation;
    Object.assign(
        legacyLayout,
        calculatePaletteProofFootprint(
            legacyLayout.columnCount,
            legacyLayout.rowCount,
            'target-columns'
        )
    );
    const sanitizedLegacy = sanitizeAppearanceProfile(legacyLandscape);
    assert.ok(sanitizedLegacy);
    assert.equal(sanitizedLegacy!.proofs.length, 1);
    assert.equal(sanitizedLegacy!.proofs[0].proof.layout.matrixOrientation, undefined);

    const tampered = structuredClone(appearance);
    tampered.proofs[0].proof.columns[0].targetColor.hex = '#ffffff';
    const sanitized = sanitizeAppearanceProfile(tampered);
    assert.ok(sanitized);
    assert.equal(sanitized!.proofs.length, 0);
});

test('profile v3 export and import preserve appearance evidence', async () => {
    const { buildPaletteProofRecord, createEmptyAppearanceProfile, upsertPaletteProofRecord } =
        await loadAppearanceProfile();
    const { buildPaletteProofSpec } = await loadPaletteProof();
    const { CURRENT_PROFILE_VERSION, exportProfileBlob, importProfiles, parseProfileFile } =
        await loadProfileManager();
    const snapshot = buildPaletteProofSnapshot(6, 3);
    const proof = buildPaletteProofSpec(snapshot, {
        targetCount: 3,
        targetColorMode: 'fitted',
        targetSetMappingIds: snapshot.targetMappings.map((target) => target.id),
    });
    const appearance = upsertPaletteProofRecord(
        createEmptyAppearanceProfile(),
        buildPaletteProofRecord(filaments, snapshot, proof, '2026-07-17T20:00:00.000Z')
    );
    const profile = {
        id: 'appearance-profile',
        name: 'Appearance Profile',
        version: CURRENT_PROFILE_VERSION,
        filaments,
        appearance,
        createdAt: 1,
        updatedAt: 1,
    };

    const exported = await exportProfileBlob(profile).text();
    const parsed = parseProfileFile(exported);
    assert.ok(parsed);
    const imported = importProfiles([], parsed!);

    assert.equal(imported.imported[0].version, 3);
    assert.deepEqual(imported.imported[0].appearance, appearance);
    assert.equal(imported.imported[0].appearance?.proofs[0].proof.targetColorMode, 'fitted');
    assert.deepEqual(
        imported.imported[0].appearance?.proofs[0].proof.targetSetMappingIds,
        snapshot.targetMappings.map((target) => target.id)
    );
});
