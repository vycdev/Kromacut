export const STAR_PROMPT_STORAGE_KEY = 'kromacut:github-star-prompt-shown';
export const REPOSITORY_URL = 'https://github.com/vycdev/Kromacut';

/**
 * Claim the one-time GitHub star prompt. Returns true only the first time, and only when the
 * claim could be stored, so a browser that blocks storage is never asked on every export.
 */
export function claimStarPrompt(): boolean {
    if (typeof globalThis.localStorage === 'undefined') return false;

    try {
        if (globalThis.localStorage.getItem(STAR_PROMPT_STORAGE_KEY) !== null) return false;
        globalThis.localStorage.setItem(STAR_PROMPT_STORAGE_KEY, 'true');
        return globalThis.localStorage.getItem(STAR_PROMPT_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}
