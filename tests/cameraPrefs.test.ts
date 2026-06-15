import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage mock for Node.js
const store: Record<string, string> = {};
const mockLocalStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage });

const { loadCameraMode, saveCameraMode } = await import('../src/lib/cameraPrefs.ts');

test('loadCameraMode returns false when no preference is stored', () => {
    mockLocalStorage.clear();
    assert.equal(loadCameraMode(), false);
});

test('loadCameraMode returns true after saving orthographic', () => {
    saveCameraMode(true);
    assert.equal(loadCameraMode(), true);
});

test('loadCameraMode returns false after saving perspective', () => {
    saveCameraMode(false);
    assert.equal(loadCameraMode(), false);
});

test('saveCameraMode writes orthographic string for true', () => {
    saveCameraMode(true);
    assert.equal(mockLocalStorage.getItem('kromacut:3d-camera-mode'), 'orthographic');
});

test('saveCameraMode writes perspective string for false', () => {
    saveCameraMode(false);
    assert.equal(mockLocalStorage.getItem('kromacut:3d-camera-mode'), 'perspective');
});
