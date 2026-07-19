import assert from 'node:assert/strict';
import test from 'node:test';

import {
    groupPaletteProofRecords,
    paletteProofTargetSetKey,
} from '../src/lib/paletteProofGroups.ts';

function record(id: string, exportedAt: string, targetMappingIds: readonly string[]) {
    return {
        id,
        exportedAt,
        proof: {
            columns: targetMappingIds.map((targetMappingId) => ({ targetMappingId })),
        },
    };
}

test('target-set keys ignore target display order', () => {
    assert.equal(
        paletteProofTargetSetKey(record('a', '2026-07-19T10:00:00Z', ['red', 'blue']).proof),
        paletteProofTargetSetKey(record('b', '2026-07-19T10:01:00Z', ['blue', 'red']).proof)
    );
});

test('proofs group by target set and retain chronological round order', () => {
    const groups = groupPaletteProofRecords([
        record('set-1-round-2', '2026-07-19T12:00:00Z', ['red', 'blue']),
        record('set-2-round-1', '2026-07-19T11:00:00Z', ['green', 'white']),
        record('set-1-round-1', '2026-07-19T10:00:00Z', ['blue', 'red']),
    ]);

    assert.equal(groups.length, 2);
    assert.equal(groups[0].number, 1);
    assert.deepEqual(
        groups[0].records.map((entry) => entry.id),
        ['set-1-round-1', 'set-1-round-2']
    );
    assert.equal(groups[1].number, 2);
    assert.deepEqual(
        groups[1].records.map((entry) => entry.id),
        ['set-2-round-1']
    );
});
