import assert from 'node:assert/strict';
import test from 'node:test';

import type { StackMatrixCalibrationV1 } from '../src/lib/appearanceProfile.ts';
import {
    applyStackMatrixPanelOwnerUpdate,
    createStackMatrixPanelOwnerStates,
    reconcileStackMatrixPanelOwnerStates,
    stackMatrixPanelOwnerState,
} from '../src/lib/stackMatrixPanelState.ts';

test('Stack Matrix panel isolates and restores session records by profile owner', () => {
    const localMatrixA = { id: 'local-matrix-a' } as StackMatrixCalibrationV1;
    const lateMatrixA = { id: 'late-matrix-a' } as StackMatrixCalibrationV1;
    const olderMatrixB = { id: 'older-matrix-b' } as StackMatrixCalibrationV1;
    const newestMatrixB = { id: 'newest-matrix-b' } as StackMatrixCalibrationV1;
    const initialStates = createStackMatrixPanelOwnerStates('profile-a', []);
    const statesA = applyStackMatrixPanelOwnerUpdate(
        initialStates,
        'profile-a',
        'profile-a',
        [],
        (current) => ({
            ...current,
            localRecord: localMatrixA,
            activeRecordId: localMatrixA.id,
            creatingNew: false,
        })
    );

    const statesB = reconcileStackMatrixPanelOwnerStates(statesA, 'profile-b', [
        olderMatrixB,
        newestMatrixB,
    ]);
    const stateB = stackMatrixPanelOwnerState(statesB, 'profile-b', [
        olderMatrixB,
        newestMatrixB,
    ]);
    assert.equal(stateB.profileId, 'profile-b');
    assert.equal(stateB.localRecord, null);
    assert.equal(stateB.activeRecordId, newestMatrixB.id);
    assert.equal(stateB.creatingNew, false);

    let lateUpdateApplied = false;
    const afterLateProfileAResult = applyStackMatrixPanelOwnerUpdate(
        statesB,
        'profile-a',
        'profile-b',
        [olderMatrixB, newestMatrixB],
        (current) => {
            lateUpdateApplied = true;
            return { ...current, localRecord: lateMatrixA };
        }
    );
    assert.equal(lateUpdateApplied, false);
    assert.equal(
        stackMatrixPanelOwnerState(afterLateProfileAResult, 'profile-b', [
            olderMatrixB,
            newestMatrixB,
        ]).activeRecordId,
        newestMatrixB.id
    );

    const restoredA = stackMatrixPanelOwnerState(afterLateProfileAResult, 'profile-a', []);
    assert.equal(restoredA.localRecord, localMatrixA);
    assert.equal(restoredA.activeRecordId, localMatrixA.id);
    assert.equal(restoredA.creatingNew, false);

    const emptyProfile = stackMatrixPanelOwnerState(
        afterLateProfileAResult,
        'profile-without-matrices',
        []
    );
    assert.equal(emptyProfile.activeRecordId, null);
    assert.equal(emptyProfile.creatingNew, true);
});
