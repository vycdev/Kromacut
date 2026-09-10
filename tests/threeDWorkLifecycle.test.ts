import assert from 'node:assert/strict';
import test from 'node:test';

import {
    scheduleAfterTwoAnimationFrames,
    shouldApplyInitialProfileFilaments,
    shouldRetainCompletedThreeDWork,
    shouldRunThreeDBackgroundWork,
} from '../src/lib/threeDWorkLifecycle.ts';

function createFrameHarness() {
    let nextId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    const cancelled: number[] = [];

    return {
        request(callback: FrameRequestCallback) {
            const id = nextId++;
            callbacks.set(id, callback);
            return id;
        },
        cancel(id: number) {
            cancelled.push(id);
            callbacks.delete(id);
        },
        run(id: number) {
            const callback = callbacks.get(id);
            callbacks.delete(id);
            callback?.(0);
        },
        pendingIds() {
            return [...callbacks.keys()];
        },
        cancelled,
    };
}

test('deferred 3D mount can be cancelled before its first frame', () => {
    const frames = createFrameHarness();
    let mounted = false;
    const cancel = scheduleAfterTwoAnimationFrames(
        () => {
            mounted = true;
        },
        frames.request,
        frames.cancel
    );

    const [firstFrame] = frames.pendingIds();
    cancel();
    frames.run(firstFrame);

    assert.equal(mounted, false);
    assert.deepEqual(frames.pendingIds(), []);
    assert.deepEqual(frames.cancelled, [firstFrame]);
});

test('deferred 3D mount can be cancelled between its two frames', () => {
    const frames = createFrameHarness();
    let mounted = false;
    const cancel = scheduleAfterTwoAnimationFrames(
        () => {
            mounted = true;
        },
        frames.request,
        frames.cancel
    );

    const [firstFrame] = frames.pendingIds();
    frames.run(firstFrame);
    const [secondFrame] = frames.pendingIds();
    cancel();
    frames.run(secondFrame);

    assert.equal(mounted, false);
    assert.deepEqual(frames.pendingIds(), []);
    assert.deepEqual(frames.cancelled, [secondFrame]);
});

test('deferred 3D mount runs after two frames when it remains active', () => {
    const frames = createFrameHarness();
    let mountCount = 0;
    scheduleAfterTwoAnimationFrames(
        () => {
            mountCount += 1;
        },
        frames.request,
        frames.cancel
    );

    frames.run(frames.pendingIds()[0]);
    assert.equal(mountCount, 0);
    frames.run(frames.pendingIds()[0]);

    assert.equal(mountCount, 1);
    assert.deepEqual(frames.pendingIds(), []);
});

test('3D background work requires both an active tab and ready inputs', () => {
    assert.equal(shouldRunThreeDBackgroundWork(true, true), true);
    assert.equal(shouldRunThreeDBackgroundWork(false, true), false);
    assert.equal(shouldRunThreeDBackgroundWork(true, false), false);
    assert.equal(shouldRunThreeDBackgroundWork(false, false), false);
});

test('hidden 3D work retains only a completed result for the same inputs', () => {
    assert.equal(shouldRetainCompletedThreeDWork(false, 'same', 'same'), true);
    assert.equal(shouldRetainCompletedThreeDWork(false, 'old', 'new'), false);
    assert.equal(shouldRetainCompletedThreeDWork(false, null, null), false);
    assert.equal(shouldRetainCompletedThreeDWork(true, 'same', 'same'), false);
});

test('remembered working filaments take precedence over the last selected profile', () => {
    assert.equal(shouldApplyInitialProfileFilaments(true, 8), false);
    assert.equal(shouldApplyInitialProfileFilaments(true, 0), false);
});

test('the last selected profile initializes a fresh Auto-paint workspace', () => {
    assert.equal(shouldApplyInitialProfileFilaments(false, 8), true);
    assert.equal(shouldApplyInitialProfileFilaments(false, 0), false);
});
