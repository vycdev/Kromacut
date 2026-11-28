import { expect, type Page } from '@playwright/test';

/**
 * Waits until clicks reach the page again after a dnd-kit drag. When a drag ends, dnd-kit keeps a
 * capture-phase click listener on the document that stops propagation, and removes it 50 ms later
 * on a timer, so a click sent right after `mouse.up()` can be lost. This dispatches a
 * non-bubbling probe click on a throwaway element outside the app root until it gets through.
 */
export async function waitForClicksAfterDrag(page: Page) {
    await expect
        .poll(
            () =>
                page.evaluate(() => {
                    const probe = document.createElement('div');
                    let reached = false;
                    probe.addEventListener('click', () => {
                        reached = true;
                    });
                    document.body.append(probe);
                    probe.dispatchEvent(new MouseEvent('click'));
                    probe.remove();
                    return reached;
                }),
            { intervals: [10] }
        )
        .toBe(true);
}
