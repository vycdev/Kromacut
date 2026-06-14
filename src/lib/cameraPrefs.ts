const KEY = 'kromacut:3d-camera-mode';

export function loadCameraMode(): boolean {
    try {
        return localStorage.getItem(KEY) === 'orthographic';
    } catch {
        return false;
    }
}

export function saveCameraMode(isOrtho: boolean): void {
    try {
        localStorage.setItem(KEY, isOrtho ? 'orthographic' : 'perspective');
    } catch {
        // ignore
    }
}
