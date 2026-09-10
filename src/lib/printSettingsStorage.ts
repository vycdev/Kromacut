/**
 * Persistence helpers for 3D print settings (layer height, pixel size, etc.).
 */

export const PRINT_SETTINGS_STORAGE_KEY = 'kromacut:3d-print-settings';

export const DEFAULT_PRINT_SETTINGS = {
    layerHeight: 0.12,
    slicerFirstLayerHeight: 0.2,
    pixelSize: 0.1,
    smoothMeshing: false,
} as const;

export type PrintSettings = {
    layerHeight: number;
    slicerFirstLayerHeight: number;
    pixelSize: number;
    smoothMeshing: boolean;
};

export const arePrintSettingsDefault = (settings: PrintSettings): boolean =>
    settings.layerHeight === DEFAULT_PRINT_SETTINGS.layerHeight &&
    settings.slicerFirstLayerHeight === DEFAULT_PRINT_SETTINGS.slicerFirstLayerHeight &&
    settings.pixelSize === DEFAULT_PRINT_SETTINGS.pixelSize &&
    settings.smoothMeshing === DEFAULT_PRINT_SETTINGS.smoothMeshing;

export const clampNumber = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

export const loadPrintSettingsFromStorage = (): PrintSettings | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(PRINT_SETTINGS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<PrintSettings>;
        const layerHeight =
            typeof parsed.layerHeight === 'number' && isFinite(parsed.layerHeight)
                ? clampNumber(parsed.layerHeight, 0.01, 10)
                : DEFAULT_PRINT_SETTINGS.layerHeight;
        const slicerFirstLayerHeight =
            typeof parsed.slicerFirstLayerHeight === 'number' &&
            isFinite(parsed.slicerFirstLayerHeight)
                ? clampNumber(parsed.slicerFirstLayerHeight, 0, 10)
                : DEFAULT_PRINT_SETTINGS.slicerFirstLayerHeight;
        const pixelSize =
            typeof parsed.pixelSize === 'number' && isFinite(parsed.pixelSize)
                ? clampNumber(parsed.pixelSize, 0.01, 10)
                : DEFAULT_PRINT_SETTINGS.pixelSize;
        const smoothMeshing =
            typeof parsed.smoothMeshing === 'boolean'
                ? parsed.smoothMeshing
                : DEFAULT_PRINT_SETTINGS.smoothMeshing;
        return { layerHeight, slicerFirstLayerHeight, pixelSize, smoothMeshing };
    } catch {
        return null;
    }
};

export const savePrintSettingsToStorage = (settings: PrintSettings) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(PRINT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // Ignore storage failures (e.g., private mode, quota exceeded).
    }
};
