import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { type TestContext } from 'node:test';
import JSZip from 'jszip';
import * as THREE from 'three';
import { createServer } from 'vite';
import { exportObjectToStlBlob } from '../src/lib/exportStl.ts';
import { generateGreedyMesh, generateSmoothMesh, type MeshData } from '../src/lib/meshing.ts';
import {
    largeIssueFixturePath,
    logoFixturePath,
    maskFromJpegLuminance,
    maskFromPngAlpha,
    readPngFixture,
    testAssetsRoot,
    type PngImage,
    type RasterMask,
} from './imageFixtures.ts';
import { inspectMeshIntegrity, type MeshIntegrityReport } from './meshDiagnostics.ts';

type Export3mfModule = typeof import('../src/lib/export3mf.ts');
type Export3MFOptions = Parameters<Export3mfModule['exportObjectTo3MFBlob']>[1];
type MeshGenerator = typeof generateSmoothMesh;
type OptimizerAlgorithm = 'fast' | 'balanced' | 'thorough';

interface AutoPaintSliceData {
    colorSliceHeights: number[];
    colorOrder: number[];
    virtualSwatches: Array<{ hex: string; a: number }>;
    filamentSwatches: Array<{ hex: string; a: number }>;
}

interface AutoPaintModule {
    generateAutoLayers(
        filaments: FilamentProfileFixture['filaments'],
        imageSwatches: Array<{ hex: string; count?: number }>,
        layerHeight: number,
        firstLayerHeight: number,
        maxHeight?: number,
        enhancedColorMatch?: boolean,
        allowRepeatedSwaps?: boolean,
        optimizerOptions?: { algorithm: OptimizerAlgorithm; seed?: number }
    ): unknown;
    autoPaintToSliceHeights(
        result: unknown,
        layerHeight: number,
        firstLayerHeight: number
    ): AutoPaintSliceData;
}

interface ExportedMeshObject {
    id: string;
    name: string;
    materialIndex: number;
    mesh: MeshData;
    vertexCount: number;
    triangleCount: number;
    topology: RawTopologyReport;
}

interface RawTopologyReport {
    boundaryEdgeCount: number;
    overusedEdgeCount: number;
    badEdgeCount: number;
}

interface ExportedResourceObject {
    attributes: string;
    id: string;
    name: string;
    body: string;
}

interface ExportedArchiveXml {
    modelXml: string;
    modelSettingsXml: string;
    projectSettings: Record<string, unknown>;
}

interface FixtureLayerSpec {
    mask: RasterMask;
    thickness: number;
    color: number;
    filamentColor: string;
}

interface GeneratedLayerStack {
    root: THREE.Group;
    generatedLayerCount: number;
    filamentColors: string[];
}

interface FilamentProfileFixture {
    name: string;
    filaments: Array<{
        id: string;
        color: string;
        td: number;
    }>;
}

let export3mfModule: Promise<Export3mfModule> | null = null;
let autoPaintModule: Promise<AutoPaintModule> | null = null;
const filamentProfilesRoot = resolve(testAssetsRoot, 'filament-profiles');

function normalizeFixtureHex(value: string, label: string) {
    assert.match(value, /^#[0-9A-Fa-f]{6}$/, `${label} should be a hex color`);
    return value.toUpperCase();
}

function loadFilamentProfileFixture(
    fileName: string,
    expectedFilamentCount: number
): FilamentProfileFixture {
    const raw = JSON.parse(
        readFileSync(resolve(filamentProfilesRoot, fileName), 'utf8')
    ) as Partial<FilamentProfileFixture> & { version?: number };
    const name = raw.name;
    const filaments = raw.filaments;
    // .kapp fixtures are schema-v1 exports: uncalibrated tds are on the legacy
    // backlit scale and convert to hiding distances (×0.1) like live imports.
    const legacyTdScale = (raw.version ?? 1) < 2 ? 0.1 : 1;

    if (typeof name !== 'string') {
        assert.fail(`${fileName} should include a profile name`);
    }
    if (!Array.isArray(filaments)) {
        assert.fail(`${fileName} should include filaments`);
    }
    assert.equal(
        filaments.length,
        expectedFilamentCount,
        `${fileName} should contain the expected filament count`
    );

    return {
        name,
        filaments: filaments.map((filament, index) => {
            assert.equal(typeof filament.id, 'string', `${fileName} filament ${index} id`);
            assert.equal(typeof filament.td, 'number', `${fileName} filament ${index} TD`);
            assert.ok(filament.td > 0, `${fileName} filament ${index} TD should be positive`);

            return {
                id: filament.id,
                color: normalizeFixtureHex(filament.color, `${fileName} filament ${index}`),
                td: filament.td * legacyTdScale,
            };
        }),
    };
}

const bwProfile = loadFilamentProfileFixture('2_Colors.kapp', 2);
const gh27Profile = loadFilamentProfileFixture('4_Colors.kapp', 4);
const current8Profile = loadFilamentProfileFixture('8_Colors.kapp', 8);
const current8NonmanifoldProfile = loadFilamentProfileFixture('8_Colors_nonmanifold.kapp', 8);
const filamentProfileFixtures = [bwProfile, gh27Profile, current8Profile];
const exportTopologyMeshers: Array<{ name: string; generate: MeshGenerator }> = [
    { name: 'greedy', generate: generateGreedyMesh },
    { name: 'smooth', generate: generateSmoothMesh },
];

function profileColors(profile: FilamentProfileFixture) {
    return profile.filaments.map((filament) => filament.color);
}

function profileMaterialHexes(profile: FilamentProfileFixture) {
    return profileColors(profile).map((color) => color.slice(1));
}

function cycleProfileColors(profile: FilamentProfileFixture, count: number) {
    const colors = profileColors(profile);
    assert.ok(colors.length > 0, `${profile.name} should include at least one color`);

    return Array.from({ length: count }, (_, index) => colors[index % colors.length]);
}

function hexToMaterialColor(hex: string) {
    return Number.parseInt(hex.slice(1), 16);
}

function uniqueMaterialHexes(colors: string[]) {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const color of colors) {
        const hex = normalizeFixtureHex(color, 'layer filament color').slice(1);

        if (!seen.has(hex)) {
            seen.add(hex);
            result.push(hex);
        }
    }

    return result;
}

function pickEvenly<T>(values: T[], count: number) {
    assert.ok(count > 0, 'count should be positive');
    if (count === 1) return [values[0]];

    return Array.from({ length: count }, (_, index) => {
        const sourceIndex = Math.round((index * (values.length - 1)) / (count - 1));
        return values[sourceIndex];
    });
}

class NodeFileReader {
    error: Error | null = null;
    onerror: ((event: { target: NodeFileReader }) => void) | null = null;
    onload: ((event: { target: NodeFileReader }) => void) | null = null;
    result: ArrayBuffer | null = null;

    readAsArrayBuffer(blob: Blob) {
        void blob
            .arrayBuffer()
            .then((buffer) => {
                this.result = buffer;
                this.onload?.({ target: this });
            })
            .catch((error: unknown) => {
                this.error = error instanceof Error ? error : new Error(String(error));
                this.onerror?.({ target: this });
            });
    }
}

function installFileReaderPolyfill() {
    if (typeof globalThis.FileReader === 'undefined') {
        globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;
    }
}

async function loadExport3mfModule(): Promise<Export3mfModule> {
    export3mfModule ??= loadViteModule<Export3mfModule>('/src/lib/export3mf.ts');

    return export3mfModule;
}

async function loadAutoPaintModule(): Promise<AutoPaintModule> {
    autoPaintModule ??= loadViteModule<AutoPaintModule>('/src/lib/autoPaint.ts');

    return autoPaintModule;
}

async function loadViteModule<T>(modulePath: string): Promise<T> {
    const server = await createServer({
        appType: 'custom',
        cacheDir: 'dist/.vite-test-cache',
        configFile: false,
        logLevel: 'error',
        optimizeDeps: {
            noDiscovery: true,
        },
        resolve: {
            alias: {
                '@': resolve(process.cwd(), 'src'),
            },
        },
        root: process.cwd(),
        server: {
            hmr: false,
            middlewareMode: true,
        },
    });

    try {
        return (await server.ssrLoadModule(modulePath)) as T;
    } finally {
        await server.close();
    }
}

function createSharedCubeGeometry() {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
            [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
            3
        )
    );

    geometry.setIndex([
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3,
        0, 4, 3, 4, 7,
    ]);

    return geometry;
}

function createLayerMesh(geometry: THREE.BufferGeometry, color: number) {
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
}

function createMeshDataLayer(mesh: MeshData, color: number) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setIndex(mesh.indices);

    return createLayerMesh(geometry, color);
}

function createCompactExportLayer(
    mesh: MeshData,
    mask: RasterMask,
    pixelSize: number,
    topZ: number,
    color: number,
    compactHeightfield = true
) {
    const layer = createMeshDataLayer(mesh, color);

    layer.geometry.userData.kromacutExportGeometry = {
        positions: mesh.positions,
        indices: mesh.indices,
        activePixels: mask.activePixels,
        width: mask.width,
        height: mask.height,
        pixelSize,
        topZ,
        compactHeightfield,
    };

    return layer;
}

function createRawExportLayer(mesh: MeshData, color: number) {
    const layer = createMeshDataLayer(mesh, color);
    layer.geometry.userData.kromacutExportGeometry = {
        positions: mesh.positions,
        indices: mesh.indices,
    };

    return layer;
}

function createLargeIndexedProgressGeometry() {
    return new THREE.PlaneGeometry(40, 40, 128, 128);
}

function assertMonotonicProgress(samples: number[], label: string) {
    assert.ok(samples.length > 2, `${label} should emit multiple progress samples`);

    for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        assert.ok(Number.isFinite(sample), `${label} sample ${i} should be finite`);
        assert.ok(sample >= 0, `${label} sample ${i} should be >= 0, got ${sample}`);
        assert.ok(sample <= 1, `${label} sample ${i} should be <= 1, got ${sample}`);

        if (i > 0) {
            assert.ok(
                sample >= samples[i - 1],
                `${label} sample ${i} went backwards from ${samples[i - 1]} to ${sample}`
            );
        }
    }

    assert.equal(samples[samples.length - 1], 1, `${label} should finish at 100%`);
}

function maskFromRows(rows: string[]): RasterMask {
    const width = rows[0]?.length ?? 0;
    const height = rows.length;
    const activePixels = new Uint8Array(width * height);
    let activeCount = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (rows[y][x] === '#') {
                activePixels[y * width + x] = 1;
                activeCount++;
            }
        }
    }

    return { activePixels, width, height, activeCount };
}

async function buildLayer(
    mask: RasterMask,
    thickness: number,
    zOffset: number,
    pixelSize: number,
    generate: MeshGenerator
) {
    return await generate(
        mask.activePixels,
        mask.width,
        mask.height,
        thickness,
        zOffset,
        pixelSize,
        1,
        { yieldIntervalMs: Infinity, onYield: async () => undefined }
    );
}

async function buildSmoothLayer(
    mask: RasterMask,
    thickness: number,
    zOffset: number,
    pixelSize: number
) {
    return await buildLayer(mask, thickness, zOffset, pixelSize, generateSmoothMesh);
}

async function buildFixtureLayerStack(
    layerSpecs: FixtureLayerSpec[],
    pixelSize: number,
    generate: MeshGenerator
): Promise<GeneratedLayerStack> {
    const root = new THREE.Group();
    const filamentColors: string[] = [];
    let zOffset = 0;
    let generatedLayerCount = 0;

    for (const spec of layerSpecs) {
        const baseZ = zOffset;
        zOffset += spec.thickness;

        if (spec.thickness <= 0.0001 || spec.mask.activeCount === 0) {
            continue;
        }

        const mesh = await buildLayer(spec.mask, spec.thickness, baseZ, pixelSize, generate);
        root.add(createMeshDataLayer(mesh, spec.color));
        filamentColors.push(spec.filamentColor);
        generatedLayerCount++;
    }

    return { root, generatedLayerCount, filamentColors };
}

function rgbToFixtureHex(r: number, g: number, b: number) {
    return `#${[r, g, b]
        .map((value) => Math.round(value).toString(16).padStart(2, '0'))
        .join('')}`.toUpperCase();
}

function cropPngToOpaqueBounds(image: PngImage, maxSide: number): PngImage {
    let minX = image.width;
    let minY = image.height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            if (image.rgba[(y * image.width + x) * 4 + 3] > 0) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }

    if (maxX < minX || maxY < minY) {
        minX = 0;
        minY = 0;
        maxX = image.width - 1;
        maxY = image.height - 1;
    }

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    const sampleSize = Math.max(1, Math.ceil(Math.max(cropWidth, cropHeight) / maxSide));
    const width = Math.ceil(cropWidth / sampleSize);
    const height = Math.ceil(cropHeight / sampleSize);
    const rgba = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
        const sourceY = Math.min(maxY, minY + y * sampleSize);

        for (let x = 0; x < width; x++) {
            const sourceX = Math.min(maxX, minX + x * sampleSize);
            const sourceOffset = (sourceY * image.width + sourceX) * 4;
            const targetOffset = (y * width + x) * 4;

            rgba[targetOffset] = image.rgba[sourceOffset];
            rgba[targetOffset + 1] = image.rgba[sourceOffset + 1];
            rgba[targetOffset + 2] = image.rgba[sourceOffset + 2];
            rgba[targetOffset + 3] = image.rgba[sourceOffset + 3];
        }
    }

    return { width, height, rgba };
}

function imageSwatchesFromRgba(image: PngImage) {
    const counts = new Map<string, number>();

    for (let i = 0; i < image.rgba.length; i += 4) {
        if (image.rgba[i + 3] === 0) continue;

        const hex = rgbToFixtureHex(image.rgba[i], image.rgba[i + 1], image.rgba[i + 2]);
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }

    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([hex, count]) => ({ hex, count }));
}

function fixtureHexToRgb(hex: string): [number, number, number] {
    const h = hex.replace(/^#/, '');
    return [
        Number.parseInt(h.slice(0, 2), 16) || 0,
        Number.parseInt(h.slice(2, 4), 16) || 0,
        Number.parseInt(h.slice(4, 6), 16) || 0,
    ];
}

function rgbToLabFixture(r: number, g: number, b: number) {
    let rr = r / 255;
    let gg = g / 255;
    let bb = b / 255;

    rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
    gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
    bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

    let x = (rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375) * 100;
    let y = (rr * 0.2126729 + gg * 0.7151522 + bb * 0.072175) * 100;
    let z = (rr * 0.0193339 + gg * 0.119192 + bb * 0.9503041) * 100;

    x /= 95.047;
    y /= 100.0;
    z /= 108.883;

    x = x > 0.008856 ? Math.cbrt(x) : (903.3 * x + 16) / 116;
    y = y > 0.008856 ? Math.cbrt(y) : (903.3 * y + 16) / 116;
    z = z > 0.008856 ? Math.cbrt(z) : (903.3 * z + 16) / 116;

    return {
        L: 116 * y - 16,
        a: 500 * (x - y),
        b: 200 * (y - z),
    };
}

function fixtureLuminance(r: number, g: number, b: number) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function buildCumulativeHeights(
    colorSliceHeights: number[],
    colorOrder: number[],
    firstLayerHeight: number
) {
    const cumulativeHeights: number[] = [];
    let running = 0;

    colorOrder.forEach((swatchIndex, position) => {
        const height = colorSliceHeights[swatchIndex] || 0;
        const effectiveHeight = position === 0 ? Math.max(height, firstLayerHeight) : height;
        running += effectiveHeight;
        cumulativeHeights[position] = running;
    });

    return cumulativeHeights;
}

function buildEnhancedHeightMap(
    image: PngImage,
    swatches: Array<{ hex: string; a: number }>,
    cumulativeHeights: number[],
    layerHeight: number,
    firstLayerHeight: number
) {
    const pixelHeightMap = new Float32Array(image.width * image.height);
    const swatchEntries = swatches.map((swatch, index) => {
        const [r, g, b] = fixtureHexToRgb(swatch.hex);
        return {
            lab: rgbToLabFixture(r, g, b),
            height: cumulativeHeights[index] || 0,
        };
    });
    const polyNodes: Array<{
        lab: { L: number; a: number; b: number };
        minHeight: number;
        maxHeight: number;
    }> = [];
    const collapseDeltaESq = 0.25;

    if (swatchEntries.length > 0) {
        let runStart = 0;

        for (let index = 1; index <= swatchEntries.length; index++) {
            let split = index === swatchEntries.length;

            if (!split) {
                const ref = swatchEntries[runStart].lab;
                const cur = swatchEntries[index].lab;
                const deSq = (cur.L - ref.L) ** 2 + (cur.a - ref.a) ** 2 + (cur.b - ref.b) ** 2;
                split = deSq >= collapseDeltaESq;
            }

            if (split) {
                let sumL = 0;
                let sumA = 0;
                let sumB = 0;
                const count = index - runStart;

                for (let j = runStart; j < index; j++) {
                    sumL += swatchEntries[j].lab.L;
                    sumA += swatchEntries[j].lab.a;
                    sumB += swatchEntries[j].lab.b;
                }

                polyNodes.push({
                    lab: { L: sumL / count, a: sumA / count, b: sumB / count },
                    minHeight: swatchEntries[runStart].height,
                    maxHeight: swatchEntries[index - 1].height,
                });
                runStart = index;
            }
        }
    }

    const polySegments: Array<{
        aL: number;
        aa: number;
        ab: number;
        dL: number;
        da: number;
        db: number;
        lenSq: number;
        hStart: number;
        hEnd: number;
    }> = [];

    for (let index = 0; index < polyNodes.length - 1; index++) {
        const from = polyNodes[index];
        const to = polyNodes[index + 1];
        const dL = to.lab.L - from.lab.L;
        const da = to.lab.a - from.lab.a;
        const db = to.lab.b - from.lab.b;

        polySegments.push({
            aL: from.lab.L,
            aa: from.lab.a,
            ab: from.lab.b,
            dL,
            da,
            db,
            lenSq: dL * dL + da * da + db * db,
            hStart: from.maxHeight,
            hEnd: to.minHeight,
        });
    }

    let minLuminance = 1;
    let maxLuminance = 0;

    for (let index = 0; index < image.rgba.length; index += 4) {
        if (image.rgba[index + 3] === 0) continue;

        const luminance = fixtureLuminance(
            image.rgba[index],
            image.rgba[index + 1],
            image.rgba[index + 2]
        );
        minLuminance = Math.min(minLuminance, luminance);
        maxLuminance = Math.max(maxLuminance, luminance);
    }

    if (maxLuminance <= minLuminance) {
        maxLuminance = minLuminance + 0.001;
    }

    const luminanceRange = maxLuminance - minLuminance;
    const maxModelHeight = cumulativeHeights[cumulativeHeights.length - 1] || 1;
    const minModelHeight = cumulativeHeights[0] || 0;
    const colorHeightCache = new Map<number, number>();

    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            const pixelIndex = y * image.width + x;
            const rgbaIndex = pixelIndex * 4;
            const alpha = image.rgba[rgbaIndex + 3];

            if (alpha === 0) {
                pixelHeightMap[pixelIndex] = 0;
                continue;
            }

            const r = image.rgba[rgbaIndex];
            const g = image.rgba[rgbaIndex + 1];
            const b = image.rgba[rgbaIndex + 2];
            const cacheKey = ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
            const cachedHeight = colorHeightCache.get(cacheKey);

            if (cachedHeight !== undefined) {
                pixelHeightMap[pixelIndex] = cachedHeight;
                continue;
            }

            const pixelLab = rgbToLabFixture(r, g, b);
            let bestDistance = Infinity;
            let targetHeight = 0;

            for (const node of polyNodes) {
                const distance = Math.sqrt(
                    (pixelLab.L - node.lab.L) ** 2 +
                        (pixelLab.a - node.lab.a) ** 2 +
                        (pixelLab.b - node.lab.b) ** 2
                );

                if (distance < bestDistance) {
                    bestDistance = distance;
                    const range = node.maxHeight - node.minHeight;

                    if (range > 1e-6) {
                        const luminance = fixtureLuminance(r, g, b);
                        const lumT = (luminance - minLuminance) / luminanceRange;
                        targetHeight = node.minHeight + lumT * range;
                    } else {
                        targetHeight = (node.minHeight + node.maxHeight) * 0.5;
                    }
                }
            }

            for (const segment of polySegments) {
                if (segment.lenSq < 0.01) continue;

                const pL = pixelLab.L - segment.aL;
                const pa = pixelLab.a - segment.aa;
                const pb = pixelLab.b - segment.ab;
                let t = (pL * segment.dL + pa * segment.da + pb * segment.db) / segment.lenSq;
                t = Math.max(0, Math.min(1, t));

                const projectedL = segment.aL + t * segment.dL;
                const projectedA = segment.aa + t * segment.da;
                const projectedB = segment.ab + t * segment.db;
                const distance = Math.sqrt(
                    (pixelLab.L - projectedL) ** 2 +
                        (pixelLab.a - projectedA) ** 2 +
                        (pixelLab.b - projectedB) ** 2
                );

                if (distance < bestDistance) {
                    bestDistance = distance;
                    targetHeight = segment.hStart + t * (segment.hEnd - segment.hStart);
                }
            }

            targetHeight = Math.max(minModelHeight, Math.min(maxModelHeight, targetHeight));
            pixelHeightMap[pixelIndex] = targetHeight;
            colorHeightCache.set(cacheKey, targetHeight);
        }
    }

    if (layerHeight > 0) {
        for (let index = 0; index < pixelHeightMap.length; index++) {
            const height = pixelHeightMap[index];

            if (height <= 0) continue;

            const delta = Math.max(0, height - firstLayerHeight);
            let snapped = firstLayerHeight + Math.round(delta / layerHeight) * layerHeight;
            snapped = Math.max(firstLayerHeight, Math.min(maxModelHeight, snapped));
            pixelHeightMap[index] = snapped;
        }
    }

    return pixelHeightMap;
}

async function buildAutoPaintLogoRegressionStack(
    profile: FilamentProfileFixture,
    maxSide: number,
    seed: number
) {
    const layerHeight = 0.08;
    const firstLayerHeight = 0.16;
    const pixelSize = 0.1;
    const image = cropPngToOpaqueBounds(readPngFixture(logoFixturePath), maxSide);
    const imageSwatches = imageSwatchesFromRgba(image);
    const { generateAutoLayers, autoPaintToSliceHeights } = await loadAutoPaintModule();
    const autoPaintResult = generateAutoLayers(
        profile.filaments,
        imageSwatches,
        layerHeight,
        firstLayerHeight,
        undefined,
        true,
        true,
        {
            algorithm: 'balanced',
            seed,
        }
    );
    const sliceData = autoPaintToSliceHeights(autoPaintResult, layerHeight, firstLayerHeight);
    const cumulativeHeights = buildCumulativeHeights(
        sliceData.colorSliceHeights,
        sliceData.colorOrder,
        firstLayerHeight
    );
    const pixelHeightMap = buildEnhancedHeightMap(
        image,
        sliceData.virtualSwatches,
        cumulativeHeights,
        layerHeight,
        firstLayerHeight
    );
    const root = new THREE.Group();
    const filamentColors: string[] = [];
    let generatedLayerCount = 0;

    assert.ok(imageSwatches.length > 0, 'auto-paint regression image should contain swatches');
    assert.ok(sliceData.colorOrder.length > 0, 'auto-paint should generate layer slices');

    for (let layer = 0; layer < sliceData.colorOrder.length; layer++) {
        const swatchIndex = sliceData.colorOrder[layer];
        const thickness =
            layer === 0
                ? Math.max(sliceData.colorSliceHeights[swatchIndex] || 0, firstLayerHeight)
                : sliceData.colorSliceHeights[swatchIndex] || 0;

        if (thickness <= 0.0001) continue;

        const topZ = cumulativeHeights[layer];
        const baseZ = layer === 0 ? 0 : cumulativeHeights[layer - 1];
        const activePixels = new Uint8Array(image.width * image.height);
        let activeCount = 0;

        for (let y = 0; y < image.height; y++) {
            for (let x = 0; x < image.width; x++) {
                const mapIndex = y * image.width + x;

                if (pixelHeightMap[mapIndex] > 0 && pixelHeightMap[mapIndex] >= topZ - 0.001) {
                    activePixels[(image.height - 1 - y) * image.width + x] = 1;
                    activeCount++;
                }
            }
        }

        if (activeCount === 0) continue;

        const mask = {
            activePixels,
            width: image.width,
            height: image.height,
            activeCount,
        };
        const mesh = await buildSmoothLayer(mask, thickness, baseZ, pixelSize);
        const filamentColor = normalizeFixtureHex(
            sliceData.filamentSwatches[swatchIndex].hex,
            `auto-paint layer ${layer + 1} filament`
        );

        assertStlLayerIsManifold(mesh, `8-color auto-paint source mesh layer ${layer + 1}`);
        assertExportLayerHasOutwardNormals(
            mesh,
            `8-color auto-paint source mesh layer ${layer + 1}`
        );

        root.add(
            createRawExportLayer(
                mesh,
                hexToMaterialColor(sliceData.virtualSwatches[swatchIndex].hex)
            )
        );
        filamentColors.push(filamentColor);
        generatedLayerCount++;
    }

    return {
        root,
        generatedLayerCount,
        filamentColors,
        imageSwatchCount: imageSwatches.length,
        autoPaintLayerCount: sliceData.colorOrder.length,
    };
}

function reportForMessage(report: MeshIntegrityReport) {
    return JSON.stringify(
        {
            vertexCount: report.vertexCount,
            triangleCount: report.triangleCount,
            invalidPositionCount: report.invalidPositionCount,
            invalidIndexCount: report.invalidIndexCount,
            degenerateTriangleCount: report.degenerateTriangleCount,
            duplicateTriangleCount: report.duplicateTriangleCount,
            boundaryEdgeCount: report.boundaryEdgeCount,
            nonManifoldEdgeCount: report.nonManifoldEdgeCount,
            inconsistentWindingEdgeCount: report.inconsistentWindingEdgeCount,
            signedVolume: report.signedVolume,
            bounds: report.bounds,
        },
        null,
        2
    );
}

function collectVisibleMeshTriangleCounts(root: THREE.Object3D) {
    const triangleCounts: number[] = [];
    root.updateMatrixWorld(true);

    root.traverse((object) => {
        if (!(object as THREE.Mesh).isMesh) {
            return;
        }

        const mesh = object as THREE.Mesh;
        if (!mesh.visible || !mesh.geometry) {
            return;
        }

        const position = mesh.geometry.getAttribute('position');
        const index = mesh.geometry.getIndex();
        const elementCount = index ? index.count : position.count;

        assert.equal(elementCount % 3, 0, 'exported layer geometry should contain whole triangles');
        triangleCounts.push(elementCount / 3);
    });

    return triangleCounts;
}

function parseBinaryStlLayers(buffer: ArrayBuffer, triangleCounts: number[]) {
    const view = new DataView(buffer);
    const totalTriangles = view.getUint32(80, true);
    const expectedTriangles = triangleCounts.reduce((sum, count) => sum + count, 0);

    assert.equal(totalTriangles, expectedTriangles, 'STL triangle count should match layer meshes');

    const layerMeshes: MeshData[] = [];
    let offset = 84;

    for (const triangleCount of triangleCounts) {
        const positions = new Float32Array(triangleCount * 9);
        const indices: number[] = new Array(triangleCount * 3);
        let positionOffset = 0;

        for (let triangle = 0; triangle < triangleCount; triangle++) {
            offset += 12;

            for (let vertex = 0; vertex < 3; vertex++) {
                const vertexIndex = triangle * 3 + vertex;
                positions[positionOffset++] = view.getFloat32(offset, true);
                positions[positionOffset++] = view.getFloat32(offset + 4, true);
                positions[positionOffset++] = view.getFloat32(offset + 8, true);
                indices[vertexIndex] = vertexIndex;
                offset += 12;
            }

            offset += 2;
        }

        layerMeshes.push({ positions, indices });
    }

    assert.equal(offset, buffer.byteLength, 'STL parser should consume the whole binary file');

    return layerMeshes;
}

async function exportStlLayerMeshes(root: THREE.Object3D) {
    const triangleCounts = collectVisibleMeshTriangleCounts(root);
    const blob = await exportObjectToStlBlob(root);

    return parseBinaryStlLayers(await blob.arrayBuffer(), triangleCounts);
}

async function parseSingleBinaryStlMesh(blob: Blob) {
    const buffer = await blob.arrayBuffer();
    const totalTriangles = new DataView(buffer).getUint32(80, true);
    const [mesh] = parseBinaryStlLayers(buffer, [totalTriangles]);
    return { mesh, triangleCount: totalTriangles };
}

function assertRawExportObjectIsManifold(object: ExportedMeshObject, label: string) {
    const topologyMessage = `${label} topology: ${JSON.stringify(object.topology)}`;

    assert.ok(object.vertexCount > 0, `${label} should contain vertices`);
    assert.ok(object.triangleCount > 0, `${label} should contain triangles`);
    assert.equal(object.topology.badEdgeCount, 0, topologyMessage);
    assert.equal(object.topology.boundaryEdgeCount, 0, topologyMessage);
    assert.equal(object.topology.overusedEdgeCount, 0, topologyMessage);
}

function assertStlLayerIsManifold(mesh: MeshData, label: string) {
    const report = inspectMeshIntegrity(mesh, { edgeEpsilon: 1e-5 });

    assert.ok(report.vertexCount > 0, `${label} should contain vertices`);
    assert.ok(report.triangleCount > 0, `${label} should contain triangles`);
    assert.equal(
        report.invalidPositionCount,
        0,
        `${label} invalid positions:\n${reportForMessage(report)}`
    );
    assert.equal(
        report.invalidIndexCount,
        0,
        `${label} invalid indices:\n${reportForMessage(report)}`
    );
    assert.equal(
        report.degenerateTriangleCount,
        0,
        `${label} degenerate triangles:\n${reportForMessage(report)}`
    );
    assert.equal(
        report.boundaryEdgeCount,
        0,
        `${label} boundary edges:\n${reportForMessage(report)}`
    );
    assert.equal(
        report.nonManifoldEdgeCount,
        0,
        `${label} non-manifold edges:\n${reportForMessage(report)}`
    );
    assert.equal(
        report.inconsistentWindingEdgeCount,
        0,
        `${label} inconsistent winding:\n${reportForMessage(report)}`
    );
}

function hasFractionalXY(mesh: MeshData, pixelSize: number) {
    for (let i = 0; i + 2 < mesh.positions.length; i += 3) {
        const x = mesh.positions[i] / pixelSize;
        const y = mesh.positions[i + 1] / pixelSize;

        if (Math.abs(x - Math.round(x)) > 1e-4 || Math.abs(y - Math.round(y)) > 1e-4) {
            return true;
        }
    }

    return false;
}

function assertExportLayerHasOutwardNormals(mesh: MeshData, label: string) {
    const report = inspectMeshIntegrity(mesh, { edgeEpsilon: 1e-5 });

    assert.equal(
        report.inconsistentWindingEdgeCount,
        0,
        `${label} should have consistently wound normals:\n${reportForMessage(report)}`
    );
    assert.equal(
        report.isOutwardFacing,
        true,
        `${label} should have outward-facing normals:\n${reportForMessage(report)}`
    );
    assert.ok(
        report.signedVolume > 0,
        `${label} should have positive signed volume:\n${reportForMessage(report)}`
    );
}

function getAttribute(source: string, name: string) {
    const match = new RegExp(`${name}="([^"]*)"`).exec(source);
    return match?.[1] ?? '';
}

function addEdge(edges: Map<string, number>, a: number, b: number) {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
}

function inspectRawTopology(triangles: Array<[number, number, number]>): RawTopologyReport {
    const edges = new Map<string, number>();

    for (const [a, b, c] of triangles) {
        addEdge(edges, a, b);
        addEdge(edges, b, c);
        addEdge(edges, c, a);
    }

    let boundaryEdgeCount = 0;
    let overusedEdgeCount = 0;
    let badEdgeCount = 0;

    for (const count of edges.values()) {
        if (count !== 2) {
            badEdgeCount++;
        }
        if (count === 1) {
            boundaryEdgeCount++;
        } else if (count > 2) {
            overusedEdgeCount++;
        }
    }

    return {
        boundaryEdgeCount,
        overusedEdgeCount,
        badEdgeCount,
    };
}

function parseResourceObjects(modelXml: string): ExportedResourceObject[] {
    const objects: ExportedResourceObject[] = [];
    const objectPattern = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;

    for (const match of modelXml.matchAll(objectPattern)) {
        objects.push({
            attributes: match[1],
            id: getAttribute(match[1], 'id'),
            name: getAttribute(match[1], 'name'),
            body: match[2],
        });
    }

    return objects;
}

function parseMeshObjects(modelXml: string): ExportedMeshObject[] {
    const objects: ExportedMeshObject[] = [];

    for (const resourceObject of parseResourceObjects(modelXml)) {
        const body = resourceObject.body;

        if (!body.includes('<mesh>')) {
            continue;
        }

        const vertices: number[] = [];
        const vertexPattern = /<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)" \/>/g;
        for (const vertexMatch of body.matchAll(vertexPattern)) {
            vertices.push(Number(vertexMatch[1]), Number(vertexMatch[2]), Number(vertexMatch[3]));
        }

        const triangles: Array<[number, number, number]> = [];
        const indices: number[] = [];
        const trianglePattern = /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)" \/>/g;

        for (const triangleMatch of body.matchAll(trianglePattern)) {
            const triangle = [
                Number(triangleMatch[1]),
                Number(triangleMatch[2]),
                Number(triangleMatch[3]),
            ] as [number, number, number];

            triangles.push(triangle);
            indices.push(...triangle);
        }

        objects.push({
            id: resourceObject.id,
            name: resourceObject.name,
            materialIndex: Number(getAttribute(resourceObject.attributes, 'pindex')),
            mesh: {
                positions: Float32Array.from(vertices),
                indices,
            },
            vertexCount: vertices.length / 3,
            triangleCount: triangles.length,
            topology: inspectRawTopology(triangles),
        });
    }

    return objects;
}

function parseAssemblyComponentIds(assemblyBody: string): string[] {
    return Array.from(assemblyBody.matchAll(/<component\b[^>]*objectid="(\d+)"/g)).map(
        (match) => match[1]
    );
}

function parseBuildItemObjectIds(modelXml: string): string[] {
    return Array.from(modelXml.matchAll(/<item\b[^>]*objectid="(\d+)"/g)).map((match) => match[1]);
}

function parseModelSettingsPartIds(modelSettingsXml: string): string[] {
    return Array.from(modelSettingsXml.matchAll(/<part\b[^>]*id="(\d+)"/g)).map(
        (match) => match[1]
    );
}

function parseModelSettingsPartExtruders(modelSettingsXml: string) {
    const extruders = new Map<string, number>();
    const partPattern =
        /<part\b[^>]*id="(\d+)"[^>]*>[\s\S]*?<metadata key="extruder" value="(\d+)"/g;

    for (const match of modelSettingsXml.matchAll(partPattern)) {
        extruders.set(match[1], Number(match[2]));
    }

    return extruders;
}

function readProjectSettingsStringArray(
    projectSettings: Record<string, unknown>,
    key: string,
    label: string
) {
    const value = projectSettings[key];

    assert.ok(Array.isArray(value), `${label} project setting ${key} should be an array`);
    for (const item of value) {
        assert.equal(typeof item, 'string', `${label} project setting ${key} should be strings`);
    }

    return value as string[];
}

function assertLayerObjectCounts(
    archive: ExportedArchiveXml,
    expectedGeneratedLayers: number,
    label: string
) {
    const resourceObjects = parseResourceObjects(archive.modelXml);
    const meshObjects = parseMeshObjects(archive.modelXml);
    const assemblyObjects = resourceObjects.filter((object) =>
        object.body.includes('<components>')
    );
    const meshObjectIds = meshObjects.map((object) => object.id);

    assert.equal(
        meshObjects.length,
        expectedGeneratedLayers,
        `${label} should export one mesh object per generated layer`
    );
    assert.equal(assemblyObjects.length, 1, `${label} should contain exactly one assembly object`);
    assert.equal(
        resourceObjects.length,
        expectedGeneratedLayers + 1,
        `${label} should contain generated layer objects plus one assembly object`
    );
    assert.deepEqual(
        parseAssemblyComponentIds(assemblyObjects[0].body),
        meshObjectIds,
        `${label} assembly should reference every generated layer object once`
    );
    assert.deepEqual(
        parseBuildItemObjectIds(archive.modelXml),
        [assemblyObjects[0].id],
        `${label} build item should reference the assembly object`
    );
    assert.deepEqual(
        parseModelSettingsPartIds(archive.modelSettingsXml),
        meshObjectIds,
        `${label} slicer metadata should describe every generated layer object once`
    );
}

function assertPhysicalFilamentColorResources(
    archive: ExportedArchiveXml,
    expectedLayerColors: string[],
    label: string
) {
    const expectedMaterialHexes = uniqueMaterialHexes(expectedLayerColors);
    const expectedMaterialColors = expectedMaterialHexes.map((hex) => `#${hex}`);
    const expectedLayerMaterialIndices = expectedLayerColors.map((color) =>
        expectedMaterialHexes.indexOf(normalizeFixtureHex(color, `${label} layer color`).slice(1))
    );
    const meshObjects = parseMeshObjects(archive.modelXml);
    const partExtruders = parseModelSettingsPartExtruders(archive.modelSettingsXml);

    assert.equal(
        meshObjects.length,
        expectedLayerColors.length,
        `${label} should export one mesh object per layer color`
    );
    assert.deepEqual(
        parseBaseMaterialColors(archive.modelXml),
        expectedMaterialHexes,
        `${label} base materials should match physical filament colors exactly`
    );
    assert.deepEqual(
        readProjectSettingsStringArray(archive.projectSettings, 'filament_colour', label).map(
            (color) => normalizeFixtureHex(color, `${label} project filament color`)
        ),
        expectedMaterialColors,
        `${label} project settings should contain exactly the physical filament colors`
    );

    for (const key of ['filament_type', 'filament_settings_id', 'filament_vendor']) {
        assert.equal(
            readProjectSettingsStringArray(archive.projectSettings, key, label).length,
            expectedMaterialHexes.length,
            `${label} project setting ${key} should match the filament color count`
        );
    }

    assert.deepEqual(
        meshObjects.map((object) => object.materialIndex),
        expectedLayerMaterialIndices,
        `${label} mesh objects should reference the expected physical filament material`
    );
    assert.deepEqual(
        meshObjects.map((object) => partExtruders.get(object.id)),
        expectedLayerMaterialIndices.map((index) => index + 1),
        `${label} slicer metadata extruders should match physical filament material order`
    );
}

async function exportArchiveXml(
    root: THREE.Object3D,
    options?: Export3MFOptions
): Promise<ExportedArchiveXml> {
    installFileReaderPolyfill();

    const { exportObjectTo3MFBlob } = await loadExport3mfModule();
    const blob = await exportObjectTo3MFBlob(root, options);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const model = zip.file('3D/3dmodel.model');
    const modelSettings = zip.file('Metadata/model_settings.config');
    const projectSettings = zip.file('Metadata/project_settings.config');

    assert.ok(model, '3MF archive should contain 3D/3dmodel.model');
    assert.ok(modelSettings, '3MF archive should contain Metadata/model_settings.config');
    assert.ok(projectSettings, '3MF archive should contain Metadata/project_settings.config');

    return {
        modelXml: await model.async('string'),
        modelSettingsXml: await modelSettings.async('string'),
        projectSettings: JSON.parse(await projectSettings.async('string')) as Record<
            string,
            unknown
        >,
    };
}

async function exportModelXml(root: THREE.Object3D, options?: Export3MFOptions): Promise<string> {
    return (await exportArchiveXml(root, options)).modelXml;
}

async function exportMeshObjects(
    root: THREE.Object3D,
    options?: Export3MFOptions
): Promise<ExportedMeshObject[]> {
    return parseMeshObjects(await exportModelXml(root, options));
}

function parseBaseMaterialColors(modelXml: string) {
    return Array.from(modelXml.matchAll(/<base\b[^>]*displaycolor="#([0-9A-Fa-f]{6})/g)).map(
        (match) => match[1].toUpperCase()
    );
}

const exportTopologyImageFixtures = [
    {
        name: '1024px logo PNG',
        pixelSize: 0.42,
        masksForLayerCount: (layerCount: number) => {
            const mask = maskFromPngAlpha(logoFixturePath, 56);

            assert.ok(mask.activeCount > 0, 'logo topology mask should contain active pixels');
            assert.ok(
                mask.activeCount < mask.width * mask.height,
                'logo topology mask should not cover the whole image'
            );

            return Array.from({ length: layerCount }, () => mask);
        },
    },
    {
        name: 'large issue JPG',
        pixelSize: 0.36,
        masksForLayerCount: (layerCount: number) => {
            const thresholds = pickEvenly([144, 150, 156, 162, 168, 174, 180, 184], layerCount);

            return thresholds.map((threshold) => {
                const mask = maskFromJpegLuminance(largeIssueFixturePath, 56, threshold);

                assert.ok(
                    mask.activeCount > 0,
                    `JPG topology mask threshold ${threshold} should contain active pixels`
                );
                assert.ok(
                    mask.activeCount < mask.width * mask.height,
                    `JPG topology mask threshold ${threshold} should not cover the whole image`
                );

                return mask;
            });
        },
    },
];

function buildProfileImageLayerSpecs(
    imageFixture: (typeof exportTopologyImageFixtures)[number],
    profile: FilamentProfileFixture
) {
    const filamentColors = profileColors(profile);
    const masks = imageFixture.masksForLayerCount(filamentColors.length);

    assert.equal(
        masks.length,
        filamentColors.length,
        `${imageFixture.name} should generate one mask per profile filament`
    );

    return filamentColors.map((color, layer) => ({
        mask: masks[layer],
        thickness: layer === 0 ? 0.16 : 0.08,
        color: hexToMaterialColor(color),
        filamentColor: color,
    }));
}

test('3MF export keeps generated meshes as separate layer objects', async () => {
    const root = new THREE.Group();
    root.add(createLayerMesh(createSharedCubeGeometry().toNonIndexed(), 0xff0000));
    root.add(createLayerMesh(createSharedCubeGeometry().toNonIndexed(), 0x00ff00));

    const objects = await exportMeshObjects(root);

    assert.deepEqual(
        objects.map((object) => object.name),
        ['Layer 1 (#FF0000)', 'Layer 2 (#00FF00)']
    );
});

test('3MF export streams generated model XML without FileReader', async () => {
    const { exportObjectTo3MFBlob } = await loadExport3mfModule();
    const previousFileReader = globalThis.FileReader;

    class RejectingFileReader {
        error = new DOMException('Generated blobs must not be re-read', 'NotReadableError');
        onerror: ((event: { target: RejectingFileReader }) => void) | null = null;

        readAsArrayBuffer() {
            this.onerror?.({ target: this });
        }
    }

    globalThis.FileReader = RejectingFileReader as unknown as typeof FileReader;
    try {
        const root = new THREE.Group();
        root.add(createLayerMesh(createSharedCubeGeometry(), 0xff0000));

        const blob = await exportObjectTo3MFBlob(root);
        assert.ok(blob.size > 0);
    } finally {
        globalThis.FileReader = previousFileReader;
    }
});

test('3MF export keeps generated model XML chunked for large models', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/export3mf.ts'), 'utf8');

    assert.doesNotMatch(source, /xmlParts\.join\(/);
    assert.match(source, /encodeXmlChunks\(xmlParts\.splice\(0\)\)/);
});

test('exports include preview-hidden layers with their original filament colors', async () => {
    const root = new THREE.Group();
    const first = createLayerMesh(createSharedCubeGeometry(), 0xff0000);
    const hiddenMiddle = createLayerMesh(createSharedCubeGeometry(), 0x00ff00);
    const last = createLayerMesh(createSharedCubeGeometry(), 0x0000ff);
    const filamentColors = ['#111111', '#222222', '#333333'];

    hiddenMiddle.visible = false;
    root.add(first, hiddenMiddle, last);

    const archive = await exportArchiveXml(root, {
        layerFilamentColors: filamentColors,
    });
    const objects = parseMeshObjects(archive.modelXml);

    assert.equal(objects.length, 3, '3MF should include preview-hidden generated layers');
    assert.deepEqual(parseBaseMaterialColors(archive.modelXml), ['111111', '222222', '333333']);
    assert.deepEqual(
        objects.map((object) => object.materialIndex),
        [0, 1, 2],
        '3MF layer colors should keep original layer indices when some layers are hidden'
    );

    const exportedStl = await parseSingleBinaryStlMesh(await exportObjectToStlBlob(root));
    assert.equal(
        exportedStl.triangleCount,
        36,
        'STL should include all generated cube layers, including the hidden preview layer'
    );
});

test('3MF export progress stays monotonic for large indexed meshes', async () => {
    const { exportObjectTo3MFBlob } = await loadExport3mfModule();
    const root = new THREE.Group();
    const progressSamples: number[] = [];

    root.add(createLayerMesh(createLargeIndexedProgressGeometry(), 0x3366ff));

    await exportObjectTo3MFBlob(root, {
        onProgress: (value) => progressSamples.push(value),
    });

    assertMonotonicProgress(progressSamples, '3MF large indexed export progress');
});

test('STL export progress stays monotonic for large indexed meshes', async () => {
    const root = new THREE.Group();
    const progressSamples: number[] = [];

    root.add(createLayerMesh(createLargeIndexedProgressGeometry(), 0x3366ff));

    await exportObjectToStlBlob(root, (value) => progressSamples.push(value));

    assertMonotonicProgress(progressSamples, 'STL large indexed export progress');
});

test('STL export compacts Kromacut layer metadata into a manifold heightfield', async () => {
    const root = new THREE.Group();
    const mask = maskFromRows(['####', '####', '####', '####']);
    const pixelSize = 0.1;
    const firstLayer = await buildLayer(mask, 0.16, 0, pixelSize, generateGreedyMesh);
    const secondLayer = await buildLayer(mask, 0.08, 0.16, pixelSize, generateGreedyMesh);

    root.add(createCompactExportLayer(firstLayer, mask, pixelSize, 0.16, 0x111111));
    root.add(createCompactExportLayer(secondLayer, mask, pixelSize, 0.24, 0xffffff));

    const sourceTriangles = collectVisibleMeshTriangleCounts(root).reduce(
        (sum, count) => sum + count,
        0
    );
    const exported = await parseSingleBinaryStlMesh(await exportObjectToStlBlob(root));

    assert.equal(sourceTriangles, 24);
    assert.equal(exported.triangleCount, 12);
    assertStlLayerIsManifold(exported.mesh, 'compact STL heightfield');
});

test('STL compact heightfield avoids T-junctions in stepped top surfaces', async () => {
    const root = new THREE.Group();
    const lowerMask = maskFromRows(['###', '#..']);
    const upperMask = maskFromRows(['#..', '#..']);
    const pixelSize = 0.1;
    const firstLayer = await buildLayer(lowerMask, 0.16, 0, pixelSize, generateGreedyMesh);
    const secondLayer = await buildLayer(upperMask, 0.08, 0.16, pixelSize, generateGreedyMesh);

    root.add(createCompactExportLayer(firstLayer, lowerMask, pixelSize, 0.16, 0x111111));
    root.add(createCompactExportLayer(secondLayer, upperMask, pixelSize, 0.24, 0xffffff));

    const exported = await parseSingleBinaryStlMesh(await exportObjectToStlBlob(root));

    assertStlLayerIsManifold(exported.mesh, 'stepped compact STL heightfield');
});

test('STL compact heightfield stays manifold for the large JPG 4-color stack', async () => {
    const root = new THREE.Group();
    const pixelSize = 0.1;
    const thresholds = [180, 168, 156, 144];
    const filamentColors = profileColors(gh27Profile);
    let topZ = 0;

    for (let layer = 0; layer < thresholds.length; layer++) {
        const mask = maskFromJpegLuminance(largeIssueFixturePath, 256, thresholds[layer]);
        const thickness = layer === 0 ? 0.16 : 0.08;

        assert.ok(mask.activeCount > 0, `threshold ${thresholds[layer]} should generate pixels`);
        assert.ok(
            mask.activeCount < mask.width * mask.height,
            `threshold ${thresholds[layer]} should not cover the whole fixture`
        );

        topZ += thickness;
        const mesh = await buildLayer(
            mask,
            thickness,
            topZ - thickness,
            pixelSize,
            generateGreedyMesh
        );
        root.add(
            createCompactExportLayer(
                mesh,
                mask,
                pixelSize,
                topZ,
                hexToMaterialColor(filamentColors[layer])
            )
        );
    }

    const exported = await parseSingleBinaryStlMesh(await exportObjectToStlBlob(root));

    assertStlLayerIsManifold(exported.mesh, 'large JPG 4-color compact STL heightfield');
});

test('STL export preserves smooth layer geometry when heightfield compaction is disabled', async () => {
    const root = new THREE.Group();
    const mask = maskFromRows(['#....', '##...', '.##..', '..##.', '...##', '....#']);
    const pixelSize = 0.2;
    const layer = await buildLayer(mask, 0.16, 0, pixelSize, generateSmoothMesh);

    root.add(createCompactExportLayer(layer, mask, pixelSize, 0.16, 0xffffff, false));

    const exported = await parseSingleBinaryStlMesh(await exportObjectToStlBlob(root));

    assert.equal(exported.triangleCount, layer.indices.length / 3);
    assert.equal(hasFractionalXY(exported.mesh, pixelSize), true);
    assertStlLayerIsManifold(exported.mesh, 'raw smooth STL layer');
});

test('3MF export preserves raw edge topology for indexed geometry', async () => {
    const root = new THREE.Group();
    root.add(createLayerMesh(createSharedCubeGeometry(), 0xff0000));

    const [object] = await exportMeshObjects(root);

    assert.equal(object.vertexCount, 8);
    assert.equal(object.triangleCount, 12);
    assert.equal(object.topology.badEdgeCount, 0);
    assert.equal(object.topology.boundaryEdgeCount, 0);
    assert.equal(object.topology.overusedEdgeCount, 0);
});

test('3MF export preserves raw edge topology for non-indexed layer geometry', async () => {
    const root = new THREE.Group();
    root.add(createLayerMesh(createSharedCubeGeometry().toNonIndexed(), 0xff0000));

    const [object] = await exportMeshObjects(root);

    assert.equal(object.triangleCount, 12);
    assert.equal(
        object.topology.badEdgeCount,
        0,
        'non-indexed preview geometry should export with shared 3MF vertex connectivity'
    );
    assert.equal(object.topology.boundaryEdgeCount, 0);
    assert.equal(object.topology.overusedEdgeCount, 0);
});

test('3MF export uses physical filament colors without virtual color explosion', async () => {
    const root = new THREE.Group();
    root.add(createLayerMesh(createSharedCubeGeometry().toNonIndexed(), 0x223344));
    root.add(createLayerMesh(createSharedCubeGeometry().toNonIndexed(), 0x445566));
    root.add(createLayerMesh(createSharedCubeGeometry().toNonIndexed(), 0x667788));
    root.add(createLayerMesh(createSharedCubeGeometry().toNonIndexed(), 0x8899aa));

    const filamentColors = cycleProfileColors(bwProfile, 4);
    const modelXml = await exportModelXml(root, {
        layerFilamentColors: filamentColors,
    });
    const objects = parseMeshObjects(modelXml);

    assert.deepEqual(
        objects.map((object) => object.name),
        filamentColors.map((color, index) => `Layer ${index + 1} (${color})`)
    );
    assert.deepEqual(parseBaseMaterialColors(modelXml), profileMaterialHexes(bwProfile));
    for (const object of objects) {
        assert.equal(object.triangleCount, 12);
        assert.equal(object.topology.badEdgeCount, 0);
        assert.equal(object.topology.boundaryEdgeCount, 0);
        assert.equal(object.topology.overusedEdgeCount, 0);
    }
});

test('3MF export color resources match physical filament count', async (t: TestContext) => {
    await t.test('all 8 profile filaments export as exactly 8 physical colors', async () => {
        const filamentColors = profileColors(current8Profile);
        const root = new THREE.Group();

        for (let layer = 0; layer < filamentColors.length; layer++) {
            root.add(
                createLayerMesh(
                    createSharedCubeGeometry().toNonIndexed(),
                    hexToMaterialColor(filamentColors[(layer + 3) % filamentColors.length])
                )
            );
        }

        const archive = await exportArchiveXml(root, {
            layerFilamentColors: filamentColors,
        });

        assertPhysicalFilamentColorResources(archive, filamentColors, '8-color profile export');
        assert.equal(
            parseBaseMaterialColors(archive.modelXml).length,
            current8Profile.filaments.length
        );
    });

    await t.test('repeated B&W swap layers do not create extra physical colors', async () => {
        const layerCount = 16;
        const filamentColors = cycleProfileColors(bwProfile, layerCount);
        const root = new THREE.Group();

        for (let layer = 0; layer < layerCount; layer++) {
            const previewColor = (0x224466 + layer * 0x10203) & 0xffffff;
            root.add(createLayerMesh(createSharedCubeGeometry().toNonIndexed(), previewColor));
        }

        const archive = await exportArchiveXml(root, {
            layerFilamentColors: filamentColors,
        });

        assertPhysicalFilamentColorResources(archive, filamentColors, 'repeated B&W export');
        assert.equal(parseBaseMaterialColors(archive.modelXml).length, bwProfile.filaments.length);
    });
});

test('3MF export does not collapse meshes by legacy layer tags', async () => {
    const root = new THREE.Group();
    const first = createLayerMesh(createSharedCubeGeometry().toNonIndexed(), 0xff0000);
    const second = createLayerMesh(createSharedCubeGeometry().toNonIndexed(), 0x00ff00);
    first.userData.exportLayerIndex = 0;
    second.userData.exportLayerIndex = 0;
    root.add(first, second);

    const filamentColors = profileColors(bwProfile);
    const objects = await exportMeshObjects(root, {
        layerFilamentColors: filamentColors,
    });

    assert.deepEqual(
        objects.map((object) => object.name),
        filamentColors.map((color, index) => `Layer ${index + 1} (${color})`)
    );
});

test('3MF export keeps smooth stacks to one object per layer', async () => {
    const masks = [
        maskFromRows(['######', '######', '######', '######']),
        maskFromRows(['.#####', '######', '#####.', '.#####']),
        maskFromRows(['..####', '.#####', '#####.', '..###.']),
        maskFromRows(['...###', '..####', '.####.', '...##.']),
    ];
    const thickness = 0.08;
    const pixelSize = 0.4;
    const meshes: MeshData[] = new Array(masks.length);

    for (let layer = 0; layer < masks.length; layer++) {
        meshes[layer] = await buildSmoothLayer(
            masks[layer],
            thickness,
            layer * thickness,
            pixelSize
        );
    }

    const root = new THREE.Group();
    const filamentColors = profileColors(gh27Profile);
    const previewColors = filamentColors.map(hexToMaterialColor);
    for (let layer = 0; layer < meshes.length; layer++) {
        root.add(createMeshDataLayer(meshes[layer], previewColors[layer]));
    }

    const modelXml = await exportModelXml(root, {
        layerFilamentColors: filamentColors,
    });
    const objects = parseMeshObjects(modelXml);

    assert.equal(objects.length, masks.length, 'smooth stack should export one object per layer');
    assert.deepEqual(parseBaseMaterialColors(modelXml), profileMaterialHexes(gh27Profile));

    for (const object of objects) {
        assert.equal(object.topology.badEdgeCount, 0, `${object.name} should be manifold`);
        assert.equal(object.topology.boundaryEdgeCount, 0, `${object.name} should be closed`);
        assert.equal(
            object.topology.overusedEdgeCount,
            0,
            `${object.name} should not overuse edges`
        );
    }
});

test('3MF export keeps image fixture smooth meshes manifold', async () => {
    const profileFixtureColors = profileColors(current8Profile);
    const fixtures = [
        {
            name: '1024px logo',
            mask: maskFromPngAlpha(logoFixturePath, 80),
            color: hexToMaterialColor(profileFixtureColors[6]),
            filamentColor: profileFixtureColors[6],
        },
        {
            name: 'large issue JPG',
            mask: maskFromJpegLuminance(largeIssueFixturePath, 80, 176),
            color: hexToMaterialColor(profileFixtureColors[2]),
            filamentColor: profileFixtureColors[2],
        },
    ];
    const thickness = 0.08;
    const pixelSize = 0.4;
    const root = new THREE.Group();

    for (let layer = 0; layer < fixtures.length; layer++) {
        const fixture = fixtures[layer];
        assert.ok(fixture.mask.activeCount > 0, `${fixture.name} should contain active pixels`);
        assert.ok(
            fixture.mask.activeCount < fixture.mask.width * fixture.mask.height,
            `${fixture.name} should not collapse to a full mask`
        );

        const mesh = await buildSmoothLayer(fixture.mask, thickness, layer * thickness, pixelSize);
        root.add(createMeshDataLayer(mesh, fixture.color));
    }

    const modelXml = await exportModelXml(root, {
        layerFilamentColors: fixtures.map((fixture) => fixture.filamentColor),
    });
    const objects = parseMeshObjects(modelXml);

    assert.equal(objects.length, fixtures.length, 'image fixtures should export one object each');
    assert.deepEqual(
        parseBaseMaterialColors(modelXml),
        fixtures.map((fixture) => fixture.filamentColor.slice(1))
    );

    for (const object of objects) {
        assert.equal(object.topology.badEdgeCount, 0, `${object.name} should be manifold`);
        assert.equal(object.topology.boundaryEdgeCount, 0, `${object.name} should be closed`);
        assert.equal(
            object.topology.overusedEdgeCount,
            0,
            `${object.name} should not overuse edges`
        );
    }
});

test('3MF export keeps the 8-color auto-paint logo regression manifold', async () => {
    const stack = await buildAutoPaintLogoRegressionStack(
        current8NonmanifoldProfile,
        1024,
        1778927544702
    );

    assert.ok(
        stack.generatedLayerCount >= current8NonmanifoldProfile.filaments.length,
        'auto-paint regression should generate a repeated-swap layer stack'
    );
    assert.equal(
        stack.generatedLayerCount,
        stack.filamentColors.length,
        'auto-paint regression should track one physical filament color per mesh'
    );

    const archive = await exportArchiveXml(stack.root, {
        firstLayerHeight: 0.16,
        layerHeight: 0.08,
        layerFilamentColors: stack.filamentColors,
    });
    const objects = parseMeshObjects(archive.modelXml);

    assertLayerObjectCounts(
        archive,
        stack.generatedLayerCount,
        '8-color auto-paint logo regression'
    );
    assertPhysicalFilamentColorResources(
        archive,
        stack.filamentColors,
        '8-color auto-paint logo regression'
    );

    for (const [index, object] of objects.entries()) {
        assertRawExportObjectIsManifold(
            object,
            `8-color auto-paint logo regression 3MF layer ${index + 1}`
        );
        assertExportLayerHasOutwardNormals(
            object.mesh,
            `8-color auto-paint logo regression 3MF layer ${index + 1}`
        );
    }
});

test('3MF export object counts match generated fixture layers', async (t: TestContext) => {
    await t.test('8-color profile logo stack exports every generated layer', async () => {
        const logoMask = maskFromPngAlpha(logoFixturePath, 72);
        assert.ok(logoMask.activeCount > 0, 'logo fixture should contain active pixels');

        const profileFixtureColors = profileColors(current8Profile);
        const layerSpecs: FixtureLayerSpec[] = profileFixtureColors.map((color, layer) => ({
            mask: logoMask,
            thickness: layer === 0 ? 0.16 : 0.08,
            color: hexToMaterialColor(color),
            filamentColor: color,
        }));
        const stack = await buildFixtureLayerStack(layerSpecs, 0.42, generateGreedyMesh);

        assert.equal(stack.generatedLayerCount, current8Profile.filaments.length);

        const archive = await exportArchiveXml(stack.root, {
            firstLayerHeight: 0.16,
            layerHeight: 0.08,
            layerFilamentColors: stack.filamentColors,
        });

        assertLayerObjectCounts(archive, stack.generatedLayerCount, '8-color profile logo stack');
        assert.deepEqual(
            parseBaseMaterialColors(archive.modelXml),
            profileMaterialHexes(current8Profile)
        );
    });

    await t.test(
        'large JPG threshold stack keeps one object per generated smooth layer',
        async () => {
            const thresholds = [96, 112, 128, 144];
            const filamentColors = profileColors(gh27Profile);
            const layerSpecs: FixtureLayerSpec[] = thresholds.map((threshold, layer) => {
                const mask = maskFromJpegLuminance(largeIssueFixturePath, 64, threshold);

                assert.ok(mask.activeCount > 0, `threshold ${threshold} should generate pixels`);
                assert.ok(
                    mask.activeCount < mask.width * mask.height,
                    `threshold ${threshold} should not cover the whole fixture`
                );

                return {
                    mask,
                    thickness: layer === 0 ? 0.12 : 0.08,
                    color: hexToMaterialColor(filamentColors[layer]),
                    filamentColor: filamentColors[layer],
                };
            });
            const stack = await buildFixtureLayerStack(layerSpecs, 0.36, generateSmoothMesh);

            assert.equal(stack.generatedLayerCount, layerSpecs.length);

            const archive = await exportArchiveXml(stack.root, {
                firstLayerHeight: 0.12,
                layerHeight: 0.08,
                layerFilamentColors: stack.filamentColors,
            });

            assertLayerObjectCounts(
                archive,
                stack.generatedLayerCount,
                'large JPG threshold stack'
            );
            assert.deepEqual(
                parseBaseMaterialColors(archive.modelXml),
                profileMaterialHexes(gh27Profile)
            );
        }
    );
});

test('3MF and STL exports stay manifold across image fixtures and filament profiles', async (t: TestContext) => {
    for (const imageFixture of exportTopologyImageFixtures) {
        for (const profile of filamentProfileFixtures) {
            for (const mesher of exportTopologyMeshers) {
                await t.test(
                    `${imageFixture.name} / ${profile.name} / ${mesher.name}`,
                    async () => {
                        const layerSpecs = buildProfileImageLayerSpecs(imageFixture, profile);
                        const stack = await buildFixtureLayerStack(
                            layerSpecs,
                            imageFixture.pixelSize,
                            mesher.generate
                        );

                        assert.equal(
                            stack.generatedLayerCount,
                            profile.filaments.length,
                            `${imageFixture.name} ${profile.name} should generate one layer per filament`
                        );

                        const archive = await exportArchiveXml(stack.root, {
                            firstLayerHeight: 0.16,
                            layerHeight: 0.08,
                            layerFilamentColors: stack.filamentColors,
                        });
                        const objects = parseMeshObjects(archive.modelXml);

                        assertLayerObjectCounts(
                            archive,
                            stack.generatedLayerCount,
                            `${imageFixture.name} ${profile.name} ${mesher.name} 3MF`
                        );
                        assertPhysicalFilamentColorResources(
                            archive,
                            stack.filamentColors,
                            `${imageFixture.name} ${profile.name} ${mesher.name} 3MF`
                        );

                        for (const [index, object] of objects.entries()) {
                            assertRawExportObjectIsManifold(
                                object,
                                `${imageFixture.name} ${profile.name} ${mesher.name} 3MF layer ${
                                    index + 1
                                }`
                            );
                            assertExportLayerHasOutwardNormals(
                                object.mesh,
                                `${imageFixture.name} ${profile.name} ${mesher.name} 3MF layer ${
                                    index + 1
                                }`
                            );
                        }

                        const stlLayerMeshes = await exportStlLayerMeshes(stack.root);
                        assert.equal(
                            stlLayerMeshes.length,
                            stack.generatedLayerCount,
                            `${imageFixture.name} ${profile.name} ${mesher.name} STL should include every generated layer`
                        );

                        for (const [index, mesh] of stlLayerMeshes.entries()) {
                            assertStlLayerIsManifold(
                                mesh,
                                `${imageFixture.name} ${profile.name} ${mesher.name} STL layer ${
                                    index + 1
                                }`
                            );
                            assertExportLayerHasOutwardNormals(
                                mesh,
                                `${imageFixture.name} ${profile.name} ${mesher.name} STL layer ${
                                    index + 1
                                }`
                            );
                        }
                    }
                );
            }
        }
    }
});

test('3MF export keeps many smooth layers bounded to layer count', async () => {
    const layerCount = 16;
    const width = 32;
    const height = 24;
    const thickness = 0.08;
    const pixelSize = 0.35;
    const masks = Array.from({ length: layerCount }, (_, layer) => {
        const activePixels = new Uint8Array(width * height);
        let activeCount = 0;
        const left = Math.floor(layer * 0.45);
        const right = width - 1 - Math.floor(layer * 0.55);
        const top = Math.floor(layer * 0.25);
        const bottom = height - 1 - Math.floor(layer * 0.35);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const diagonalKeepsPixel = x + Math.floor(y / 2) >= left + Math.floor(layer / 3);
                const notchRemovesPixel = x > width - 8 && y < 4 + Math.floor(layer / 2);

                if (
                    x >= left &&
                    x <= right &&
                    y >= top &&
                    y <= bottom &&
                    diagonalKeepsPixel &&
                    !notchRemovesPixel
                ) {
                    activePixels[y * width + x] = 1;
                    activeCount++;
                }
            }
        }

        return { activePixels, width, height, activeCount };
    });

    const meshes: MeshData[] = new Array(masks.length);

    for (let layer = 0; layer < masks.length; layer++) {
        meshes[layer] = await buildSmoothLayer(
            masks[layer],
            thickness,
            layer * thickness,
            pixelSize
        );
    }

    const root = new THREE.Group();
    const filamentColors = cycleProfileColors(bwProfile, layerCount);
    for (let layer = 0; layer < meshes.length; layer++) {
        root.add(createMeshDataLayer(meshes[layer], hexToMaterialColor(filamentColors[layer])));
    }

    const modelXml = await exportModelXml(root, {
        layerFilamentColors: filamentColors,
    });
    const objects = parseMeshObjects(modelXml);

    assert.equal(objects.length, layerCount, 'smooth export should not create support sub-objects');
    assert.ok(objects.length < 100, 'smooth export should stay bounded to the layer count');
    assert.deepEqual(parseBaseMaterialColors(modelXml), profileMaterialHexes(bwProfile));

    for (const object of objects) {
        assert.equal(object.topology.badEdgeCount, 0, `${object.name} should be manifold`);
        assert.equal(object.topology.boundaryEdgeCount, 0, `${object.name} should be closed`);
        assert.equal(
            object.topology.overusedEdgeCount,
            0,
            `${object.name} should not overuse edges`
        );
    }
});
