import assert from 'node:assert/strict';
import test from 'node:test';

import { isCurrentAutoPaintWorkerResponse } from '../src/hooks/useAutoPaintWorker.ts';
import {
    APPEARANCE_RENDERER_VERSION,
    createEmptyAppearanceProfile,
    fingerprintCompletedAppearanceEvidence,
    type AppearanceProfileV1,
    type AppearanceViewingSession,
    type PaletteProofRecord,
    type PaletteTargetJudgment,
} from '../src/lib/appearanceProfile.ts';

test('auto-paint worker ignores progress and result messages from stale requests', () => {
    assert.equal(isCurrentAutoPaintWorkerResponse(7, 7), true);
    assert.equal(isCurrentAutoPaintWorkerResponse(6, 7), false);
    assert.equal(isCurrentAutoPaintWorkerResponse(8, 7), false);
});

test('draft proof edits do not invalidate Auto-paint until the evaluation is completed', () => {
    const empty = createEmptyAppearanceProfile();
    const proof = {
        id: 'proof-1',
        proof: { cells: [] },
        prefixes: [],
        process: {},
    } as unknown as PaletteProofRecord;
    const session: AppearanceViewingSession = {
        id: 'session-1',
        proofId: proof.id,
        reuseScope: 'session-only',
        status: 'draft',
        colorContract: {
            space: 'srgb',
            encoding: 'uint8',
            whitePoint: 'D65',
            rendererVersion: APPEARANCE_RENDERER_VERSION,
        },
        createdAt: '2026-07-18T12:00:00.000Z',
        updatedAt: '2026-07-18T12:01:00.000Z',
    };
    const judgment = {
        id: 'judgment-1',
        proofId: proof.id,
        viewingSessionId: session.id,
    } as unknown as PaletteTargetJudgment;
    const draft: AppearanceProfileV1 = {
        ...empty,
        proofs: [proof],
        viewingSessions: [session],
        targetJudgments: [judgment],
    };

    const emptyKey = fingerprintCompletedAppearanceEvidence(empty);
    assert.equal(fingerprintCompletedAppearanceEvidence(draft), emptyKey);
    assert.equal(
        fingerprintCompletedAppearanceEvidence({
            ...draft,
            targetJudgments: [{ ...judgment, updatedAt: '2026-07-18T12:02:00.000Z' }],
        }),
        emptyKey
    );

    const completed: AppearanceProfileV1 = {
        ...draft,
        viewingSessions: [
            {
                ...session,
                status: 'complete',
                updatedAt: '2026-07-18T12:03:00.000Z',
                completedAt: '2026-07-18T12:03:00.000Z',
            },
        ],
    };
    assert.notEqual(fingerprintCompletedAppearanceEvidence(completed), emptyKey);
    assert.equal(
        fingerprintCompletedAppearanceEvidence({
            ...completed,
            viewingSessions: [
                {
                    ...completed.viewingSessions[0],
                    status: 'draft',
                    completedAt: undefined,
                },
            ],
        }),
        emptyKey
    );
});
