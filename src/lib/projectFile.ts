import JSZip from 'jszip';
import type { CustomPalette, ThreeDControlsStateShape } from '../types/index.ts';
import { toHex6 } from './colorUtils.ts';
import { normalizeDisabledColors, normalizeColorNames } from './paletteManager.ts';
import { repairDuplicateFilamentIds, sanitizeProfileFilament } from './profileManager.ts';
import {
    DEFAULT_PRINT_SETTINGS,
    normalizeSmoothMeshingStrength,
    type PrintSettings,
} from './printSettingsStorage.ts';
import SLIDER_DEFS from './sliderDefs.ts';

export const PROJECT_MAX_BYTES = 128 * 1024 * 1024;
const MANIFEST_MAX_BYTES = 2 * 1024 * 1024;
const FORMAT = 'kromacut-project';
const VERSION = 1;
const CURRENT_IMAGE = 'image.png';

const NUMERIC_3D_SETTINGS = {
    autoPaintMaxHeight: [0.01, 1000],
    calibrationLayerHeight: [0.01, 10],
    separationMaxDeltaE: [1, 100],
    ditherLineWidth: [0.001, 10],
    optimizerSeed: [0, 0xffffffff],
    multiHeadCount: [2, 8],
} as const;
const TOGGLE_3D_SETTINGS = [
    'enhancedColorMatch',
    'preserveSeparation',
    'failOnSeparationError',
    'heightDithering',
    'omitAtRiskPixels',
    'flatPaint',
    'flatPaintFaceUp',
    'multiHeadMode',
] as const;
const CHOICE_3D_SETTINGS = {
    paintMode: ['manual', 'autopaint'],
    optimizerAlgorithm: ['fast', 'balanced', 'thorough', 'deep', 'exact'],
    regionWeightingMode: ['uniform', 'center', 'edge'],
    multiHeadSearchDepth: ['fast', 'balanced', 'thorough'],
    multiHeadColorMode: ['luminance', 'color'],
    maxRepeatedSwaps: [0, 2, 4, 6, 8, 12],
    transitionOpacity: [0.8, 0.9, 0.95],
} as const;
type Working3D = Partial<
    Pick<
        ThreeDControlsStateShape,
        | keyof typeof NUMERIC_3D_SETTINGS
        | (typeof TOGGLE_3D_SETTINGS)[number]
        | keyof typeof CHOICE_3D_SETTINGS
        | 'filaments'
    >
>;

export interface ProjectState {
    name: string;
    appVersion: string;
    adjustments: Record<string, number>;
    quantize: {
        algorithm: string;
        weight: number;
        finalColors: number;
        paletteId: string;
        palette?: CustomPalette;
    };
    print: PrintSettings;
    working3D: Working3D;
}

export interface ProjectFile {
    state: ProjectState;
    image: Blob;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function text(value: unknown, fallback: string) {
    return typeof value === 'string' ? value.slice(0, 256) : fallback;
}

function bounded(value: unknown, min: number, max: number, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
        ? value
        : fallback;
}

function paletteFrom(value: unknown): CustomPalette | undefined {
    if (value === undefined) return undefined;
    const palette = asRecord(value);
    if (!Array.isArray(palette.colors) || !palette.colors.length || palette.colors.length > 4096) {
        throw new Error('invalid');
    }
    const colors = palette.colors.map((color: unknown) =>
        typeof color === 'string' ? toHex6(color) : null
    );
    if (!colors.every((color): color is string => !!color)) throw new Error('invalid');
    return {
        id: text(palette.id, ''),
        name: text(palette.name, 'Project palette'),
        version: bounded(palette.version, 1, 100, 2),
        createdAt: bounded(palette.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
        updatedAt: bounded(palette.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
        colors,
        disabledColors: normalizeDisabledColors(colors, palette.disabledColors),
        colorNames: normalizeColorNames(colors, palette.colorNames),
    };
}

/** Read supported fields independently, with defaults for fields introduced later. */
export function readProjectState(value: unknown): ProjectState {
    const state = asRecord(value);
    const preferences = asRecord(state.quantize);
    const print = asRecord(state.print ?? state.threeD);
    const input = asRecord(state.working3D ?? state.threeD);
    const rawAdjustments = asRecord(state.adjustments);
    const adjustments = Object.fromEntries(
        SLIDER_DEFS.map(({ key, min, max, default: initial }) => [
            key,
            bounded(rawAdjustments[key], min, max, initial),
        ])
    );
    const working3D: Working3D = {};
    for (const [key, [min, max]] of Object.entries(NUMERIC_3D_SETTINGS)) {
        const number = bounded(input[key], min, max, NaN);
        if (Number.isFinite(number)) {
            Object.assign(working3D, {
                [key]:
                    key === 'optimizerSeed' || key === 'multiHeadCount'
                        ? Math.round(number)
                        : number,
            });
        }
    }
    for (const key of TOGGLE_3D_SETTINGS) {
        if (typeof input[key] === 'boolean') working3D[key] = input[key];
    }
    for (const [key, choices] of Object.entries(CHOICE_3D_SETTINGS)) {
        if ((choices as readonly unknown[]).includes(input[key])) {
            Object.assign(working3D, { [key]: input[key] });
        }
    }
    if (Array.isArray(input.filaments)) {
        working3D.filaments = repairDuplicateFilamentIds(
            input.filaments.slice(0, 256).flatMap((value) => {
                const filament = sanitizeProfileFilament(value);
                if (!filament) return [];
                const hex = toHex6(filament.color);
                return hex ? [{ ...filament, color: hex }] : [];
            })
        );
    }

    const algorithm = text(preferences.algorithm, 'kmeans');
    // Earlier local builds stored full palette snapshots in the selected-palette array.
    const legacyPalette = Array.isArray(preferences.palettes) ? preferences.palettes[0] : undefined;
    const palette = paletteFrom(preferences.palette ?? legacyPalette);
    return {
        name: text(state.name, 'Kromacut'),
        appVersion: text(state.appVersion, ''),
        adjustments,
        quantize: {
            algorithm: ['none', 'posterize', 'median-cut', 'kmeans', 'wu', 'octree'].includes(
                algorithm
            )
                ? algorithm
                : 'kmeans',
            weight: Math.round(bounded(preferences.weight, 2, 256, 128)),
            finalColors: Math.round(bounded(preferences.finalColors, 1, 256, 16)),
            paletteId: text(preferences.paletteId, palette?.id || 'auto'),
            ...(palette ? { palette } : {}),
        },
        print: {
            layerHeight: bounded(print.layerHeight, 0.01, 10, DEFAULT_PRINT_SETTINGS.layerHeight),
            slicerFirstLayerHeight: bounded(
                print.slicerFirstLayerHeight,
                0,
                10,
                DEFAULT_PRINT_SETTINGS.slicerFirstLayerHeight
            ),
            pixelSize: bounded(print.pixelSize, 0.01, 10, DEFAULT_PRINT_SETTINGS.pixelSize),
            smoothMeshingStrength: normalizeSmoothMeshingStrength(print.smoothMeshingStrength),
        },
        working3D,
    };
}

// JSZip publishes internalStream on ZipObject, but its TypeScript interface omits it.
interface ZipEntryStream {
    on(event: 'data', listener: (bytes: Uint8Array) => void): ZipEntryStream;
    on(event: 'error', listener: (error: Error) => void): ZipEntryStream;
    on(event: 'end', listener: () => void): ZipEntryStream;
    pause(): void;
    resume(): void;
}

function readBoundedEntry(entry: JSZip.JSZipObject | null, limit: number): Promise<Blob> {
    if (!entry) return Promise.reject(new Error('invalid'));
    // Limit expanded reads through JSZip's public streaming API.
    return new Promise((resolve, reject) => {
        const stream = (
            entry as JSZip.JSZipObject & { internalStream(type: 'uint8array'): ZipEntryStream }
        ).internalStream('uint8array');
        const chunks: BlobPart[] = [];
        let size = 0;
        stream.on('data', (chunk) => {
            size += chunk.byteLength;
            if (size > limit) {
                stream.pause();
                chunks.length = 0;
                reject(new Error('tooLarge'));
            } else chunks.push(new Uint8Array(chunk));
        });
        stream.on('error', reject);
        stream.on('end', () => resolve(new Blob(chunks)));
        stream.resume();
    });
}

export async function inspectProjectImage(image: Blob) {
    const header = new Uint8Array(await image.slice(0, 24).arrayBuffer());
    if (
        header.length !== 24 ||
        ![137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82].every(
            (byte, index) => header[index] === byte
        )
    ) {
        throw new Error('invalid');
    }
    const view = new DataView(header.buffer);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (!width || !height || width > 32768 || height > 32768 || width * height > 16_777_216) {
        throw new Error('tooLarge');
    }
}

export async function encodeProject({ state, image }: ProjectFile): Promise<Blob> {
    if (image.size > PROJECT_MAX_BYTES) throw new Error('tooLarge');
    await inspectProjectImage(image);
    const manifest = JSON.stringify({
        format: FORMAT,
        version: VERSION,
        state: readProjectState(state),
    });
    if (new Blob([manifest]).size > MANIFEST_MAX_BYTES) throw new Error('tooLarge');
    const archive = new JSZip();
    archive.file('project.json', manifest);
    archive.file(CURRENT_IMAGE, await image.arrayBuffer());
    const file = await archive.generateAsync({
        type: 'blob',
        compression: 'STORE',
        mimeType: 'application/zip',
    });
    if (file.size > PROJECT_MAX_BYTES) throw new Error('tooLarge');
    return file;
}

export async function decodeProject(file: Blob): Promise<ProjectFile> {
    if (file.size > PROJECT_MAX_BYTES) throw new Error('tooLarge');
    const archive = await JSZip.loadAsync(await file.arrayBuffer());
    if (Object.keys(archive.files).length > 204) throw new Error('tooLarge');
    const raw = await readBoundedEntry(archive.file('project.json'), MANIFEST_MAX_BYTES);
    const manifest = asRecord(JSON.parse(await raw.text()));
    if (
        manifest.format !== FORMAT ||
        !manifest.state ||
        typeof manifest.state !== 'object' ||
        Array.isArray(manifest.state)
    )
        throw new Error('invalid');
    if (manifest.version !== VERSION) throw new Error('version');
    let entry = archive.file(CURRENT_IMAGE);
    if (!entry) {
        const index = asRecord(manifest.history).current;
        if (typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < 200) {
            entry = archive.file(`images/${index}.png`);
        }
    }
    const image = await readBoundedEntry(entry, PROJECT_MAX_BYTES);
    await inspectProjectImage(image);
    return {
        state: readProjectState(manifest.state),
        image: new Blob([image], { type: 'image/png' }),
    };
}
