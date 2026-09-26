import assert from 'node:assert/strict';
import test from 'node:test';

import type { Filament } from '../src/types/index.ts';
import { buildPaletteProofSnapshot } from './helpers/paletteProofFixture.ts';
import { loadViteModule } from './helpers/viteModule.ts';
import { adaptiveStackMatrixFixture } from './helpers/adaptiveStackMatrixFixture.ts';

type AppearanceProfileModule = typeof import('../src/lib/appearanceProfile.ts');
type PaletteProofModule = typeof import('../src/lib/paletteProof.ts');
type ProfileManagerModule = typeof import('../src/lib/profileManager.ts');

let appearanceProfileModule: Promise<AppearanceProfileModule> | null = null;
let paletteProofModule: Promise<PaletteProofModule> | null = null;
let profileManagerModule: Promise<ProfileManagerModule> | null = null;

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

test('adaptive Matrix records preserve useful depth, opaque padding, and planning metadata', async () => {
    const { createEmptyAppearanceProfile, sanitizeAppearanceProfile } =
        await loadAppearanceProfile();
    const record = adaptiveStackMatrixFixture();
    const appearance = { ...createEmptyAppearanceProfile(), stackMatrices: [record] };
    assert.deepEqual(sanitizeAppearanceProfile(structuredClone(appearance)), appearance);

    const tallest = structuredClone(record);
    tallest.stackLayerCount = 64;
    tallest.planning!.maximumRecipeThickness = 2.56;
    tallest.totalCombinationCount = Number.MAX_SAFE_INTEGER;
    tallest.planning!.totalCombinationCountCapped = true;
    for (const sample of tallest.samples) {
        sample.stack.unshift(...Array.from({ length: 44 }, () => 0));
        sample.backingPaddingLayerCount! += 44;
    }
    tallest.cornerStacks = tallest.cornerStacks.map((stack) =>
        Array.from({ length: 64 }, () => stack[0])
    );
    assert.deepEqual(
        sanitizeAppearanceProfile({ ...appearance, stackMatrices: [tallest] })?.stackMatrices,
        [tallest]
    );
    const shallowest = structuredClone(record);
    shallowest.stackLayerCount = 1;
    shallowest.planning!.maximumRecipeThickness = 0.04;
    shallowest.totalCombinationCount = 3;
    for (const sample of shallowest.samples) {
        sample.stack = sample.stack.slice(-1);
        sample.recipeLayerCount = 1;
        sample.backingPaddingLayerCount = 0;
    }
    shallowest.cornerStacks = shallowest.cornerStacks.map((stack) => stack.slice(-1));
    assert.deepEqual(
        sanitizeAppearanceProfile({ ...appearance, stackMatrices: [shallowest] })?.stackMatrices,
        [shallowest]
    );
});

test('adaptive Matrix import rejects inconsistent padding and invalid planner contracts', async () => {
    const { createEmptyAppearanceProfile, sanitizeAppearanceProfile } =
        await loadAppearanceProfile();
    const mutations: Array<(record: ReturnType<typeof adaptiveStackMatrixFixture>) => void> = [
        (record) => {
            delete record.planning;
        },
        (record) => {
            delete record.samples[0].recipeLayerCount;
        },
        (record) => {
            delete record.samples[0].selectionReason;
        },
        (record) => {
            record.samples[0].backingPaddingLayerCount = 17;
        },
        (record) => {
            record.samples[0].stack[0] = 1;
        },
        (record) => {
            record.planning!.maximumRecipeThickness = 0.4;
        },
        (record) => {
            record.planning!.maximumRecipeThickness = 0.84;
        },
        (record) => {
            record.planning!.estimatedSwapCycles = 101;
        },
        (record) => {
            record.planning!.referenceSampleCount = 0;
        },
        (record) => {
            record.planning!.unmeasuredSampleCount = -1;
        },
        (record) => {
            record.planning!.unmeasuredSampleCount = record.samples.length + 1;
        },
        (record) => {
            record.planning!.totalCombinationCountCapped = true;
        },
        (record) => {
            record.totalCombinationCount = Number.MAX_SAFE_INTEGER;
        },
        (record) => {
            record.stackLayerCount = 65;
        },
        (record) => {
            record.selection = 'hd-gamut';
        },
        (record) => {
            record.schemaVersion = 1;
        },
    ];
    for (const mutate of mutations) {
        const record = adaptiveStackMatrixFixture();
        mutate(record);
        assert.deepEqual(
            sanitizeAppearanceProfile({
                ...createEmptyAppearanceProfile(),
                stackMatrices: [record],
            })?.stackMatrices,
            []
        );
    }
});

test('legacy Matrix imports and evidence fingerprints keep their original metadata shape', async () => {
    const {
        createEmptyAppearanceProfile,
        sanitizeAppearanceProfile,
        fingerprintCompletedAppearanceEvidence,
    } = await loadAppearanceProfile();
    const record = adaptiveStackMatrixFixture();
    record.schemaVersion = 1;
    record.selection = 'exhaustive';
    record.stackLayerCount = 3;
    record.totalCombinationCount = 27;
    delete record.planning;
    record.cornerStacks = record.cornerStacks.map((stack) => stack.slice(-3));
    record.samples = record.samples.map((sample) => {
        const legacy = { ...sample, stack: sample.stack.slice(-3) };
        delete legacy.recipeLayerCount;
        delete legacy.backingPaddingLayerCount;
        delete legacy.selectionReason;
        return legacy;
    });
    const appearance = { ...createEmptyAppearanceProfile(), stackMatrices: [record] };
    const sanitized = sanitizeAppearanceProfile(structuredClone(appearance));
    assert.deepEqual(sanitized, appearance);
    assert.equal(
        fingerprintCompletedAppearanceEvidence(sanitized),
        fingerprintCompletedAppearanceEvidence(appearance)
    );
    const invalid = structuredClone(appearance);
    invalid.stackMatrices[0].selection = 'adaptive-gamut';
    assert.deepEqual(sanitizeAppearanceProfile(invalid)?.stackMatrices, []);
});

test('completed adaptive Matrix evidence fingerprints distinguish physical recipe boundaries', async () => {
    const { createEmptyAppearanceProfile, fingerprintCompletedAppearanceEvidence } =
        await loadAppearanceProfile();
    const appearance = {
        ...createEmptyAppearanceProfile(),
        stackMatrices: [adaptiveStackMatrixFixture()],
    };
    const changed = structuredClone(appearance);
    changed.stackMatrices[0].samples[0].backingPaddingLayerCount = 17;
    changed.stackMatrices[0].samples[0].recipeLayerCount = 3;
    assert.notEqual(
        fingerprintCompletedAppearanceEvidence(appearance),
        fingerprintCompletedAppearanceEvidence(changed)
    );
});

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

test('completed evidence fingerprint changes when the stored physical proof stack changes', async () => {
    const {
        buildPaletteProofRecord,
        completePaletteProofEvaluation,
        createEmptyAppearanceProfile,
        fingerprintCompletedAppearanceEvidence,
        setPaletteTargetResponse,
        upsertPaletteProofRecord,
    } = await loadAppearanceProfile();
    const { buildPaletteProofSpec } = await loadPaletteProof();
    const snapshot = buildPaletteProofSnapshot(6, 1);
    const proof = buildPaletteProofSpec(snapshot, { targetCount: 1, candidateCount: 3 });
    let appearance = upsertPaletteProofRecord(
        createEmptyAppearanceProfile(),
        buildPaletteProofRecord(filaments, snapshot, proof, '2026-07-17T20:00:00.000Z')
    );
    appearance = setPaletteTargetResponse(
        appearance,
        proof.id,
        0,
        { response: 'closest', closestCellIds: [proof.columns[0].cellIds[0]] },
        '2026-07-17T20:01:00.000Z'
    );
    appearance = completePaletteProofEvaluation(appearance, proof.id, '2026-07-17T20:02:00.000Z');
    const changedStack = structuredClone(appearance);
    changedStack.proofs[0].stack[0].thickness += 0.01;

    assert.notEqual(
        fingerprintCompletedAppearanceEvidence(appearance),
        fingerprintCompletedAppearanceEvidence(changedStack)
    );
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
        {
            response: 'closest',
            closestCellIds: proof.columns[0].cellIds.slice(0, 2).reverse(),
            matchQuality: 'exact',
        },
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
    assert.equal(draft.judgments[0].matchQuality, 'exact');
    assert.equal(draft.judgments[1].response, 'none');
    assert.equal(draft.judgments[1].matchQuality, undefined);
    assert.equal(draft.judgments[2].matchQuality, 'best-available');

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
        setPaletteTargetResponse,
        upsertPaletteProofRecord,
    } = await loadAppearanceProfile();
    const { buildPaletteProofSpec, calculatePaletteProofFootprint } = await loadPaletteProof();
    const snapshot = buildPaletteProofSnapshot(6, 3);
    const proof = buildPaletteProofSpec(snapshot, { targetCount: 3 });
    const record = buildPaletteProofRecord(filaments, snapshot, proof, '2026-07-17T20:00:00.000Z');
    const appearance = upsertPaletteProofRecord(createEmptyAppearanceProfile(), record);

    assert.deepEqual(sanitizeAppearanceProfile(structuredClone(appearance)), appearance);

    const legacyQuality = structuredClone(
        setPaletteTargetResponse(
            appearance,
            proof.id,
            0,
            { response: 'closest', closestCellIds: [proof.columns[0].cellIds[0]] },
            '2026-07-17T20:01:00.000Z'
        )
    );
    delete legacyQuality.targetJudgments[0].matchQuality;
    assert.equal(
        sanitizeAppearanceProfile(legacyQuality)?.targetJudgments[0].matchQuality,
        'best-available'
    );

    const duplicateClosest = structuredClone(legacyQuality);
    duplicateClosest.targetJudgments[0].closestCellIds = [
        proof.columns[0].cellIds[0],
        proof.columns[0].cellIds[0],
    ];
    assert.equal(sanitizeAppearanceProfile(duplicateClosest)?.targetJudgments.length, 0);

    const oversizedClosest = structuredClone(legacyQuality);
    oversizedClosest.targetJudgments[0].closestCellIds = Array.from(
        { length: 10_000 },
        () => proof.columns[0].cellIds[0]
    );
    assert.equal(sanitizeAppearanceProfile(oversizedClosest)?.targetJudgments.length, 0);

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

    const overlappingReinforcement = structuredClone(appearance);
    const overlappingLayout = overlappingReinforcement.proofs[0].proof.layout;
    overlappingLayout.reinforcementLayers = 2;
    overlappingLayout.reinforcementClearanceMm = 0.15;
    const sanitizedOverlapping = sanitizeAppearanceProfile(overlappingReinforcement);
    assert.ok(sanitizedOverlapping);
    assert.equal(sanitizedOverlapping.proofs.length, 0);

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
