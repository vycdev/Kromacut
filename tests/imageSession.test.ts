import test from 'node:test';
import assert from 'node:assert/strict';

import {
    IMAGE_SESSION_VERSION,
    MAX_RECOVERED_HISTORY,
    parseImageSessionRecord,
    parseStoredImageEntry,
    planImageSessionSnapshot,
    resolveImageSession,
    STARTER_IMAGE_ID,
} from '../src/lib/imageSession.ts';

const STARTER = '/assets/logo.png';
const png = (bytes = 8) => ({ kind: 'edit', blob: new Blob([new Uint8Array(bytes)]) });

test('nothing is recovered for a cleared image or the untouched starter image', () => {
    assert.equal(planImageSessionSnapshot(null, ['blob:a'], [], STARTER), null);
    assert.equal(planImageSessionSnapshot(STARTER, [], [], STARTER), null);
    // Undoing back to the starter image counts as starting over.
    assert.equal(planImageSessionSnapshot(STARTER, ['blob:a'], ['blob:b'], STARTER), null);
});

test('the recovered history keeps the steps nearest the current image', () => {
    const past = Array.from({ length: MAX_RECOVERED_HISTORY + 5 }, (_, i) => `blob:p${i}`);
    const future = Array.from({ length: MAX_RECOVERED_HISTORY + 2 }, (_, i) => `blob:f${i}`);
    const plan = planImageSessionSnapshot('blob:now', past, future, STARTER)!;
    assert.equal(plan.current, 'blob:now');
    assert.deepEqual(plan.past, past.slice(-MAX_RECOVERED_HISTORY));
    // Redo pops the last entry, so the end of the list is the next redo.
    assert.deepEqual(plan.future, future.slice(-MAX_RECOVERED_HISTORY));
    assert.deepEqual(planImageSessionSnapshot('blob:now', [STARTER], [], STARTER), {
        current: 'blob:now',
        past: [STARTER],
        future: [],
    });
});

test('malformed session records are rejected', () => {
    const valid = { version: IMAGE_SESSION_VERSION, current: 'a', past: [], future: ['b'] };
    assert.deepEqual(parseImageSessionRecord(valid), { ...valid, savedAt: 0 });
    for (const record of [
        null,
        'text',
        { ...valid, version: 99 },
        { ...valid, current: '' },
        { ...valid, current: 7 },
        { ...valid, past: 'a' },
        { ...valid, future: [1] },
    ]) {
        assert.equal(parseImageSessionRecord(record), null, JSON.stringify(record));
    }
});

test('a partial record drops missing history steps but needs its current image', () => {
    const record = parseImageSessionRecord({
        version: IMAGE_SESSION_VERSION,
        current: 'now',
        past: [STARTER_IMAGE_ID, 'gone', 'before'],
        future: ['empty', 'next'],
        savedAt: 1,
    })!;
    const entries = new Map<string, unknown>([
        ['now', png()],
        ['before', { kind: 'import', blob: new Blob([new Uint8Array(4)]) }],
        ['empty', png(0)],
        ['next', png()],
    ]);
    const session = resolveImageSession(record, entries)!;
    assert.equal(session.current.id, 'now');
    assert.deepEqual(
        session.past.map((entry) => [entry.id, entry.entry?.kind ?? null]),
        [
            [STARTER_IMAGE_ID, null],
            ['before', 'import'],
        ]
    );
    assert.deepEqual(
        session.future.map((entry) => entry.id),
        ['next']
    );

    assert.equal(resolveImageSession(record, new Map([['before', png()]])), null);
    assert.equal(
        resolveImageSession(record, new Map([['now', { kind: 'edit', blob: 'not a blob' }]])),
        null
    );
    // A record cannot point its current image at the starter.
    assert.equal(resolveImageSession({ ...record, current: STARTER_IMAGE_ID }, entries), null);
});

test('snapshots stored as bytes come back as the same file or blob', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]).buffer;
    const file = parseStoredImageEntry({
        kind: 'import',
        bytes,
        type: 'image/png',
        name: 'photo.png',
        lastModified: 42,
    })!;
    assert.equal(file.kind, 'import');
    assert.ok(file.blob instanceof File);
    assert.equal((file.blob as File).name, 'photo.png');
    assert.equal((file.blob as File).lastModified, 42);
    assert.equal(file.blob.type, 'image/png');
    assert.deepEqual(new Uint8Array(await file.blob.arrayBuffer()), new Uint8Array(bytes));

    const edit = parseStoredImageEntry({ kind: 'edit', bytes, type: 'image/png' })!;
    assert.ok(!(edit.blob instanceof File));
    assert.equal(edit.blob.size, 4);
    assert.equal(parseStoredImageEntry({ kind: 'edit', bytes: new ArrayBuffer(0) }), null);
});
