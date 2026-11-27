export const STAR_PROMPT_STORAGE_KEY = 'kromacut:github-star-prompt-shown';
export const REPOSITORY_URL = 'https://github.com/vycdev/Kromacut';

/**
 * Claim the one-time GitHub star prompt. Returns true only the first time, and only when the
 * claim could be stored, so a browser that blocks storage is never asked on every export.
 */
export function claimStarPrompt(): boolean {
    try {
        // Reading `localStorage` itself throws where the browser blocks storage.
        const storage = globalThis.localStorage;
        if (storage.getItem(STAR_PROMPT_STORAGE_KEY) !== null) return false;
        storage.setItem(STAR_PROMPT_STORAGE_KEY, 'true');
        return true;
    } catch {
        return false;
    }
}
