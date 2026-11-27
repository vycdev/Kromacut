import assert from 'node:assert/strict';
import test from 'node:test';

if (!('localStorage' in globalThis)) {
    const store: Record<string, string> = {};
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => store[key] ?? null,
            setItem: (key: string, value: string) => {
                store[key] = value;
            },
            removeItem: (key: string) => {
                delete store[key];
            },
            clear: () => {
                for (const key of Object.keys(store)) delete store[key];
            },
        },
    });
}

const storage = globalThis.localStorage;
const { STAR_PROMPT_STORAGE_KEY, claimStarPrompt } = await import('../src/lib/starPrompt.ts');

test('the GitHub star prompt can be claimed only once', () => {
    storage.clear();
    assert.equal(claimStarPrompt(), true);
    assert.equal(storage.getItem(STAR_PROMPT_STORAGE_KEY), 'true');
    assert.equal(claimStarPrompt(), false);
});

test('the GitHub star prompt stays hidden when storage cannot remember it', () => {
    storage.clear();
    const setItem = storage.setItem;
    storage.setItem = () => {
        throw new Error('Storage blocked');
    };
    try {
        assert.equal(claimStarPrompt(), false);
    } finally {
        storage.setItem = setItem;
    }
    assert.equal(storage.getItem(STAR_PROMPT_STORAGE_KEY), null);
});
