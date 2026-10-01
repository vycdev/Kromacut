import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopFileInbox, type DesktopOpenedFile } from '../src/lib/desktopFileInbox.ts';

const file = (name: string): DesktopOpenedFile => ({
    name,
    kind: 'profile',
    content: '{}',
    error: null,
});
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test('desktop inbox retains startup files across unsubscribe/remount and serializes warm opens', async () => {
    const pending = [file('startup.kfil')];
    let signal = () => {};
    let listeners = 0;
    const inbox = createDesktopFileInbox({
        listen: async (callback) => {
            signal = callback;
            listeners++;
        },
        take: async () => pending.shift() ?? null,
    });
    const unsubscribe = inbox.subscribe(() => {});
    unsubscribe();
    await flush();
    assert.equal(inbox.getSnapshot()?.name, 'startup.kfil');
    inbox.subscribe(() => {});
    assert.equal(listeners, 1);
    pending.push(file('next.kapp'), file('third.kfil'));
    signal();
    await flush();
    assert.equal(inbox.getSnapshot()?.name, 'startup.kfil');
    const id = inbox.getSnapshot()!.id;
    inbox.finish(id);
    await flush();
    assert.equal(inbox.getSnapshot()?.name, 'next.kapp');
    inbox.finish(id); // A late dialog callback must not dismiss the following document.
    assert.equal(inbox.getSnapshot()?.name, 'next.kapp');
    inbox.finish(inbox.getSnapshot()!.id);
    await flush();
    assert.equal(inbox.getSnapshot()?.name, 'third.kfil');
    inbox.finish(inbox.getSnapshot()!.id);
    await flush();
    assert.equal(inbox.getSnapshot(), null);
});

test('desktop inbox does not lose an event arriving during an empty startup read', async () => {
    let signal = () => {};
    let complete: (value: DesktopOpenedFile | null) => void = () => {};
    let reads = 0;
    const inbox = createDesktopFileInbox({
        listen: async (callback) => {
            signal = callback;
        },
        take: async () => {
            reads++;
            if (reads === 1)
                return new Promise((resolve) => {
                    complete = resolve;
                });
            return file('arrived-during-read.kfil');
        },
    });
    inbox.subscribe(() => {});
    await flush();
    signal();
    complete(null);
    await flush();
    assert.equal(reads, 2);
    assert.equal(inbox.getSnapshot()?.name, 'arrived-during-read.kfil');
});

test('a bad file can be dismissed without losing later files; IPC failure does not loop', async () => {
    const pending: DesktopOpenedFile[] = [
        { ...file('unreadable.kfil'), content: null, error: 'denied' },
        file('valid.kfil'),
    ];
    let signal = () => {};
    let fail = false;
    let reads = 0;
    const inbox = createDesktopFileInbox({
        listen: async (callback) => {
            signal = callback;
        },
        take: async () => {
            reads++;
            if (fail) throw new Error('IPC unavailable');
            return pending.shift() ?? null;
        },
    });
    inbox.subscribe(() => {});
    await flush();
    assert.equal(inbox.getSnapshot()?.error, 'denied');
    inbox.finish(inbox.getSnapshot()!.id);
    await flush();
    assert.equal(inbox.getSnapshot()?.name, 'valid.kfil');
    fail = true;
    inbox.finish(inbox.getSnapshot()!.id);
    await flush();
    assert.match(inbox.getSnapshot()!.error!, /IPC unavailable/);
    const count = reads;
    inbox.finish(inbox.getSnapshot()!.id);
    await flush();
    assert.equal(reads, count);
    fail = false;
    pending.push(file('retry.kfil'));
    signal();
    await flush();
    assert.equal(inbox.getSnapshot()?.name, 'retry.kfil');
});
