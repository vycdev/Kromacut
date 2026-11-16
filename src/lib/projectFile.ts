import JSZip from 'jszip';
import type {
    CustomPalette,
    ThreeDControlsStateShape,
    PreviewColorMode,
    PreviewRenderMode,
} from '../types/index.ts';
import { sanitizeProfileFilament } from './profileManager.ts';
import { SLIDER_DEFS } from '../components/sliderDefs.ts';

export interface RecommendationSession {
    checkedBrands: string[];
    material: string;
    chosen: Record<string, string>;
}
export interface NozzleSession {
    scenarios: { nozzle: number; line: number; width: number }[];
    linked: boolean;
    patchEnabled: boolean;
    mode: 'appearance' | 'risk' | 'original' | 'patched';
}
export interface ProjectState {
    name: string;
    adjustments: Record<string, number>;
    quantize: { algorithm: string; weight: number; finalColors: number; palettes: CustomPalette[] };
    threeD: ThreeDControlsStateShape;
    recommendations: RecommendationSession | null;
    nozzle: NozzleSession | null;
    view: {
        mode: '2d' | '3d';
        isOrtho: boolean;
        renderMode: PreviewRenderMode;
        colorMode: PreviewColorMode;
        checkerboard: boolean;
    };
}
export interface ProjectHistory {
    current: number;
    past: number[];
    future: number[];
}
export interface ProjectArchive {
    state: ProjectState;
    history: ProjectHistory;
    images: Uint8Array[];
}
const MAX_FILE = 256 * 1024 * 1024,
    MAX_EXPANDED = 512 * 1024 * 1024,
    MAX_IMAGES = 200;
function fail(message = 'invalid'): never {
    throw new Error(message);
}
function record(v: unknown): Record<string, unknown> {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail();
    return v as Record<string, unknown>;
}
function text(v: unknown, max = 256): string {
    if (typeof v !== 'string' || v.length > max) return fail();
    return v;
}
function num(v: unknown, min: number, max: number): number {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return fail();
    return v;
}
function bool(v: unknown): boolean {
    if (typeof v !== 'boolean') return fail();
    return v;
}
function choice<const T extends string>(v: unknown, values: readonly T[]): T {
    if (!values.includes(v as T)) return fail();
    return v as T;
}
function list(v: unknown, max = 4096): unknown[] {
    if (!Array.isArray(v) || v.length > max) return fail();
    return v;
}
function hex(v: unknown): string {
    const s = text(v, 7);
    if (!/^#[0-9a-f]{6}$/i.test(s)) return fail();
    return s;
}
function integer(v: unknown, min: number, max: number): number {
    const n = num(v, min, max);
    if (!Number.isInteger(n)) return fail();
    return n;
}
function strings(v: unknown, max = 256) {
    return list(v, max).map((x) => text(x));
}

/** Explicit schema: project data cannot inject storage keys or executable content. */
export function validateProjectState(value: unknown): ProjectState {
    const v = record(value),
        q = record(v.quantize),
        view = record(v.view),
        raw3d = record(v.threeD);
    const adjustments: Record<string, number> = {};
    const rawAdjustments = record(v.adjustments);
    for (const def of SLIDER_DEFS)
        adjustments[def.key] = num(rawAdjustments[def.key], def.min, def.max);
    const threeD: ThreeDControlsStateShape = {
        layerHeight: num(raw3d.layerHeight, 0.01, 10),
        slicerFirstLayerHeight: num(raw3d.slicerFirstLayerHeight, 0, 10),
        pixelSize: num(raw3d.pixelSize, 0.01, 10),
        smoothMeshingStrength: choice(raw3d.smoothMeshingStrength ?? 'none', [
            'none',
            'minimal',
            'medium',
            'aggressive',
        ]),
        colorSliceHeights: list(raw3d.colorSliceHeights, 16384).map((x) => num(x, 0, 10)),
        colorOrder: list(raw3d.colorOrder, 16384).map((x) => integer(x, 0, 16383)),
        filteredSwatches: list(raw3d.filteredSwatches, 16384).map((x) => {
            const s = record(x);
            return {
                hex: hex(s.hex),
                a: num(s.a, 0, 255),
                ...(s.count === undefined ? {} : { count: num(s.count, 0, 1e9) }),
            };
        }),
        filaments: list(raw3d.filaments, 256).map((x) => {
            const f = sanitizeProfileFilament(x);
            if (!f) return fail();
            hex(f.color);
            text(f.id);
            num(f.td, 0.000001, 1000);
            return f;
        }),
        paintMode: choice(raw3d.paintMode, ['manual', 'autopaint']),
    };
    if (new Set(threeD.filaments.map((f) => f.id)).size !== threeD.filaments.length) fail();
    const count = threeD.filteredSwatches.length;
    if (
        threeD.colorSliceHeights.length !== count ||
        threeD.colorOrder.length !== count ||
        new Set(threeD.colorOrder).size !== count ||
        threeD.colorOrder.some((i) => i >= count)
    )
        fail();
    const numbers = {
        calibrationLayerHeight: [0.01, 10],
        autoPaintMaxHeight: [0.01, 1000],
        separationMaxDeltaE: [1, 100],
        ditherLineWidth: [0.001, 10],
        optimizerSeed: [0, 4294967295],
    } as const;
    for (const [key, bounds] of Object.entries(numbers))
        if (raw3d[key] !== undefined)
            Object.assign(threeD, { [key]: num(raw3d[key], bounds[0], bounds[1]) });
    for (const key of [
        'enhancedColorMatch',
        'preserveSeparation',
        'failOnSeparationError',
        'heightDithering',
        'omitAtRiskPixels',
        'flatPaint',
        'flatPaintFaceUp',
    ] as const)
        if (raw3d[key] !== undefined) threeD[key] = bool(raw3d[key]);
    if (raw3d.maxRepeatedSwaps !== undefined) {
        const n = integer(raw3d.maxRepeatedSwaps, 0, 12);
        if (![0, 2, 4, 6, 8, 12].includes(n)) fail();
        threeD.maxRepeatedSwaps = n as ThreeDControlsStateShape['maxRepeatedSwaps'];
    }
    if (raw3d.transitionOpacity !== undefined) {
        const n = num(raw3d.transitionOpacity, 0.8, 0.95);
        if (![0.8, 0.9, 0.95].includes(n)) fail();
        threeD.transitionOpacity = n as ThreeDControlsStateShape['transitionOpacity'];
    }
    if (raw3d.optimizerAlgorithm !== undefined)
        threeD.optimizerAlgorithm = choice(raw3d.optimizerAlgorithm, [
            'fast',
            'balanced',
            'thorough',
            'deep',
            'exact',
        ]);
    if (raw3d.regionWeightingMode !== undefined)
        threeD.regionWeightingMode = choice(raw3d.regionWeightingMode, [
            'uniform',
            'center',
            'edge',
        ]);
    if (raw3d.multiHeadMode !== undefined) threeD.multiHeadMode = bool(raw3d.multiHeadMode);
    if (raw3d.multiHeadCount !== undefined)
        threeD.multiHeadCount = integer(raw3d.multiHeadCount, 2, 256);
    if (raw3d.multiHeadSearchDepth !== undefined)
        threeD.multiHeadSearchDepth = choice(raw3d.multiHeadSearchDepth, [
            'fast',
            'balanced',
            'thorough',
        ]);
    if (raw3d.multiHeadColorMode !== undefined)
        threeD.multiHeadColorMode = choice(raw3d.multiHeadColorMode, ['luminance', 'color']);
    const palettes = list(q.palettes, 256).map((x) => {
        const p = record(x),
            colors = list(p.colors, 4096).map(hex);
        if (!colors.length) fail();
        return {
            id: text(p.id),
            name: text(p.name),
            version: integer(p.version, 1, 100),
            colors,
            disabledColors: list(p.disabledColors ?? []).map((n) =>
                integer(n, 0, colors.length - 1)
            ),
            ...(p.colorNames === undefined ? {} : { colorNames: strings(p.colorNames, 4096) }),
            createdAt: num(p.createdAt, 0, 1e15),
            updatedAt: num(p.updatedAt, 0, 1e15),
        };
    });
    let recommendations: RecommendationSession | null = null;
    if (v.recommendations !== null) {
        const r = record(v.recommendations),
            chosen = record(r.chosen);
        if (Object.keys(chosen).length > 1024) fail();
        recommendations = {
            checkedBrands: strings(r.checkedBrands),
            material: text(r.material),
            chosen: Object.fromEntries(
                Object.entries(chosen).map(([k, val]) => [hex(k), text(val)])
            ),
        };
    }
    let nozzle: NozzleSession | null = null;
    if (v.nozzle !== null) {
        const n = record(v.nozzle),
            scenarios = list(n.scenarios, 2).map((x) => {
                const s = record(x);
                return {
                    nozzle: num(s.nozzle, 0.2, 1.2),
                    line: num(s.line, 0.05, 3),
                    width: num(s.width, 1, 2000),
                };
            });
        if (
            scenarios.length !== 2 ||
            scenarios.some((s) => ![0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.2].includes(s.nozzle))
        )
            fail();
        nozzle = {
            scenarios,
            linked: bool(n.linked),
            patchEnabled: bool(n.patchEnabled),
            mode: choice(n.mode, ['appearance', 'risk', 'original', 'patched']),
        };
        if (!nozzle.patchEnabled && nozzle.mode === 'patched') fail();
    }
    return {
        name: text(v.name),
        adjustments,
        threeD,
        recommendations,
        nozzle,
        quantize: {
            algorithm: choice(q.algorithm, [
                'none',
                'posterize',
                'median-cut',
                'kmeans',
                'wu',
                'octree',
            ]),
            weight: integer(q.weight, 2, 256),
            finalColors: integer(q.finalColors, 2, 256),
            palettes,
        },
        view: {
            mode: choice(view.mode, ['2d', '3d']),
            isOrtho: bool(view.isOrtho),
            renderMode: choice(view.renderMode, [
                'color-accurate',
                'shaded',
                'transparent',
                'wireframe',
            ]),
            colorMode: choice(view.colorMode, ['simulated', 'physical']),
            checkerboard: bool(view.checkerboard),
        },
    };
}
function validateHistory(value: unknown, count: number): ProjectHistory {
    const h = record(value);
    return {
        current: integer(h.current, 0, count - 1),
        past: list(h.past, MAX_IMAGES).map((x) => integer(x, 0, count - 1)),
        future: list(h.future, MAX_IMAGES).map((x) => integer(x, 0, count - 1)),
    };
}
export function inspectProjectPng(bytes: Uint8Array) {
    if (
        bytes.length < 33 ||
        [137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => bytes[i] !== v) ||
        String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
    )
        fail();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        width = view.getUint32(16),
        height = view.getUint32(20);
    if (!width || !height || width > 32768 || height > 32768 || width * height > 25_000_000)
        fail('tooLarge');
    return { width, height };
}
export async function encodeProject(project: ProjectArchive): Promise<Uint8Array> {
    if (!project.images.length || project.images.length > MAX_IMAGES) fail('tooLarge');
    const state = validateProjectState(project.state),
        history = validateHistory(project.history, project.images.length);
    const zip = new JSZip();
    let size = 0;
    project.images.forEach((bytes, i) => {
        inspectProjectPng(bytes);
        size += bytes.length;
        if (size > MAX_EXPANDED) fail('tooLarge');
        zip.file(`images/${i}.png`, bytes);
    });
    const manifest = JSON.stringify({
        format: 'kromacut-project',
        version: 1,
        state,
        history,
        imageCount: project.images.length,
    });
    if (new TextEncoder().encode(manifest).length > 2 * 1024 * 1024) fail('tooLarge');
    zip.file('project.json', manifest);
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
    if (bytes.length > MAX_FILE) fail('tooLarge');
    return bytes;
}
export async function decodeProject(bytes: Uint8Array): Promise<ProjectArchive> {
    if (bytes.length > MAX_FILE) fail('tooLarge');
    const zip = await JSZip.loadAsync(bytes);
    let size = 0;
    for (const entry of Object.values(zip.files)) {
        const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })._data
            ?.uncompressedSize;
        if (entry.dir) continue;
        if (typeof declared !== 'number' || !Number.isSafeInteger(declared) || declared < 0) fail();
        size += declared;
        if (size > MAX_EXPANDED || (entry.name === 'project.json' && declared > 2 * 1024 * 1024))
            fail('tooLarge');
    }
    const entry = zip.file('project.json');
    if (!entry) fail();
    const manifest = record(JSON.parse(await entry.async('string')));
    if (manifest.format !== 'kromacut-project') fail();
    if (manifest.version !== 1) fail('version');
    const count = integer(manifest.imageCount, 1, MAX_IMAGES),
        state = validateProjectState(manifest.state),
        history = validateHistory(manifest.history, count);
    const images: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
        const image = zip.file(`images/${i}.png`);
        if (!image) fail();
        const data = await image.async('uint8array');
        inspectProjectPng(data);
        images.push(data);
    }
    return { state, history, images };
}
