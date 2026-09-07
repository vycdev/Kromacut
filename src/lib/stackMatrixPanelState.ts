import type { StackMatrixCalibrationV1 } from './appearanceProfile';

export interface StackMatrixPanelOwnerState {
    profileId: string | null;
    localRecord: StackMatrixCalibrationV1 | null;
    activeRecordId: string | null;
    creatingNew: boolean;
}

// A failed storage write leaves a downloaded plan session-only, so keep each
// profile's local record while ensuring it is never selected by another owner.
export type StackMatrixPanelOwnerStates = ReadonlyMap<string | null, StackMatrixPanelOwnerState>;

export function createStackMatrixPanelOwnerState(
    profileId: string | null,
    records: readonly StackMatrixCalibrationV1[]
): StackMatrixPanelOwnerState {
    return {
        profileId,
        localRecord: null,
        activeRecordId: records.at(-1)?.id ?? null,
        creatingNew: records.length === 0,
    };
}

export function reconcileStackMatrixPanelOwnerState(
    state: StackMatrixPanelOwnerState,
    profileId: string | null,
    records: readonly StackMatrixCalibrationV1[]
): StackMatrixPanelOwnerState {
    if (state.profileId !== profileId) {
        return createStackMatrixPanelOwnerState(profileId, records);
    }

    const activeRecordExists =
        state.localRecord?.id === state.activeRecordId ||
        records.some((record) => record.id === state.activeRecordId);
    const activeRecordId = activeRecordExists ? state.activeRecordId : (records.at(-1)?.id ?? null);
    const creatingNew = activeRecordId === null ? true : state.creatingNew;
    if (activeRecordId === state.activeRecordId && creatingNew === state.creatingNew) {
        return state;
    }
    return { ...state, activeRecordId, creatingNew };
}

export function createStackMatrixPanelOwnerStates(
    profileId: string | null,
    records: readonly StackMatrixCalibrationV1[]
): StackMatrixPanelOwnerStates {
    return new Map([[profileId, createStackMatrixPanelOwnerState(profileId, records)]]);
}

export function stackMatrixPanelOwnerState(
    states: StackMatrixPanelOwnerStates,
    profileId: string | null,
    records: readonly StackMatrixCalibrationV1[]
): StackMatrixPanelOwnerState {
    const stored = states.get(profileId);
    return stored
        ? reconcileStackMatrixPanelOwnerState(stored, profileId, records)
        : createStackMatrixPanelOwnerState(profileId, records);
}

export function reconcileStackMatrixPanelOwnerStates(
    states: StackMatrixPanelOwnerStates,
    profileId: string | null,
    records: readonly StackMatrixCalibrationV1[]
): StackMatrixPanelOwnerStates {
    const stored = states.get(profileId);
    const current = stackMatrixPanelOwnerState(states, profileId, records);
    if (stored === current) return states;
    const next = new Map(states);
    next.set(profileId, current);
    return next;
}

export function applyStackMatrixPanelOwnerUpdate(
    states: StackMatrixPanelOwnerStates,
    expectedProfileId: string | null,
    currentProfileId: string | null,
    currentRecords: readonly StackMatrixCalibrationV1[],
    update: (current: StackMatrixPanelOwnerState) => StackMatrixPanelOwnerState
): StackMatrixPanelOwnerStates {
    const currentStates = reconcileStackMatrixPanelOwnerStates(
        states,
        currentProfileId,
        currentRecords
    );
    if (expectedProfileId !== currentProfileId) return currentStates;
    const current = stackMatrixPanelOwnerState(currentStates, currentProfileId, currentRecords);
    const updated = update(current);
    if (updated === current) return currentStates;
    const next = new Map(currentStates);
    next.set(currentProfileId, updated);
    return next;
}
