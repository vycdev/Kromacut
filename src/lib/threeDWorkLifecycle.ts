export type CancelDeferredWork = () => void;

/**
 * Defers expensive first-mount work until the browser has painted two frames.
 * The returned cancellation function remains valid between the two frames.
 */
export function scheduleAfterTwoAnimationFrames(
    callback: () => void,
    requestFrame: (callback: FrameRequestCallback) => number = window.requestAnimationFrame.bind(
        window
    ),
    cancelFrame: (handle: number) => void = window.cancelAnimationFrame.bind(window)
): CancelDeferredWork {
    let cancelled = false;
    let pendingFrame: number | null = null;

    pendingFrame = requestFrame(() => {
        pendingFrame = null;
        if (cancelled) return;

        pendingFrame = requestFrame(() => {
            pendingFrame = null;
            if (!cancelled) callback();
        });
    });

    return () => {
        cancelled = true;
        if (pendingFrame !== null) {
            cancelFrame(pendingFrame);
            pendingFrame = null;
        }
    };
}

export function shouldRunThreeDBackgroundWork(active: boolean, ready: boolean): boolean {
    return active && ready;
}

export function shouldRetainCompletedThreeDWork(
    active: boolean,
    completedKey: string | null,
    currentKey: string | null
): boolean {
    return !active && completedKey !== null && completedKey === currentKey;
}
