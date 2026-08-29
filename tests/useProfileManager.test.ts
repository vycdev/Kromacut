import test from 'node:test';
import assert from 'node:assert/strict';

import type { AutoPaintProfile } from '../src/lib/profileManager.ts';
import { persistProfilesBeforeCommit } from '../src/lib/profilePersistence.ts';

const profiles: AutoPaintProfile[] = [
    {
        id: 'profile-1',
        name: 'Test Profile',
        version: 3,
        filaments: [],
        createdAt: 1,
        updatedAt: 1,
    },
];

test('profile state is not committed when persistence fails', () => {
    const events: string[] = [];

    const committed = persistProfilesBeforeCommit(
        profiles,
        () => {
            events.push('persist');
            return false;
        },
        () => events.push('commit')
    );

    assert.equal(committed, false);
    assert.deepEqual(events, ['persist']);
});

test('profile state is committed only after successful persistence', () => {
    const events: string[] = [];
    let committedProfiles: AutoPaintProfile[] | null = null;

    const committed = persistProfilesBeforeCommit(
        profiles,
        (persistedProfiles) => {
            events.push('persist');
            assert.equal(persistedProfiles, profiles);
            return true;
        },
        (persistedProfiles) => {
            events.push('commit');
            committedProfiles = persistedProfiles;
        }
    );

    assert.equal(committed, true);
    assert.deepEqual(events, ['persist', 'commit']);
    assert.equal(committedProfiles, profiles);
});
