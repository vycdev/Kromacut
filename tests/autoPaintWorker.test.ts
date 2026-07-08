import assert from 'node:assert/strict';
import test from 'node:test';

import { isCurrentAutoPaintWorkerResponse } from '../src/hooks/useAutoPaintWorker.ts';

test('auto-paint worker ignores progress and result messages from stale requests', () => {
    assert.equal(isCurrentAutoPaintWorkerResponse(7, 7), true);
    assert.equal(isCurrentAutoPaintWorkerResponse(6, 7), false);
    assert.equal(isCurrentAutoPaintWorkerResponse(8, 7), false);
});
