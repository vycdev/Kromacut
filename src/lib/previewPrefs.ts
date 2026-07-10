import type { PreviewRenderMode } from '../types';

export const PREVIEW_RENDER_MODE_STORAGE_KEY = 'kromacut:3d-preview-mode';

export function isPreviewRenderMode(value: unknown): value is PreviewRenderMode {
    return value === 'shaded' || value === 'transparent' || value === 'wireframe';
}

export function loadPreviewRenderMode(): PreviewRenderMode {
    try {
        const stored = localStorage.getItem(PREVIEW_RENDER_MODE_STORAGE_KEY);
        return isPreviewRenderMode(stored) ? stored : 'shaded';
    } catch {
        return 'shaded';
    }
}

export function savePreviewRenderMode(mode: PreviewRenderMode): void {
    try {
        localStorage.setItem(PREVIEW_RENDER_MODE_STORAGE_KEY, mode);
    } catch {
        // The in-memory preview state remains usable when storage is unavailable.
    }
}
