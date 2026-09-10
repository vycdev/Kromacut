import type { AutoPaintProfile } from './profileManager';

/**
 * Keep in-memory profile state behind the same persistence boundary as the stored profiles.
 * The callback makes the ordering explicit and keeps failure paths regression-testable without
 * mounting the profile hook.
 */
export function persistProfilesBeforeCommit(
    profiles: AutoPaintProfile[],
    persist: (profiles: AutoPaintProfile[]) => boolean,
    commit: (persistedProfiles: AutoPaintProfile[]) => void
): boolean {
    if (!persist(profiles)) return false;
    commit(profiles);
    return true;
}
