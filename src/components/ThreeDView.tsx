import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import * as THREE from 'three';
import * as SliderPrimitive from '@radix-ui/react-slider';
import useThreeScene from '../hooks/useThreeScene';
import {
    generateGreedyMesh,
    generateSmoothMesh,
    type MeshData,
    type MeshMetrics,
    type MeshProgress,
} from '../lib/meshing';
import { LAYER_ACTIVATION_EPSILON } from '../lib/layerActivation';
import { normalizeHexColor as normalizeHexColorValue } from '../lib/colorUtils';
import { buildFlatPaintLayout, heightMapToFlatPaintLayerCounts } from '../lib/flatPaint';
import {
    clampProgress,
    layeredBuildScanProgress,
    progressInSpan,
} from '../lib/progress';
import { Layers } from 'lucide-react';
import ProgressOverlay from './ProgressOverlay';

interface ThreeDViewProps {
    imageSrc?: string | null;
    baseSliceHeight: number; // mm
    layerHeight: number; // mm (granularity)
    slicerFirstLayerHeight?: number; // mm
    colorSliceHeights: number[]; // per color height increments (mm)
    colorOrder: number[]; // ordering (indices into swatches)
    swatches: { hex: string; a: number }[]; // filtered (non-transparent) swatches in original order
    filamentSwatches?: { hex: string; a: number }[]; // physical filament colors for preview/export overlays
    pixelSize?: number; // mm per pixel horizontally (X & Z). Default 0.01 => 100px = 1mm
    heightScale?: number; // vertical exaggeration (1 = real scale)
    stepped?: boolean; // if true, flatten each cell to a uniform height (square plateaus instead of spikes)
    pixelColumns?: boolean; // if true, final build uses one plateau per image pixel (rectangular towers)
    rebuildSignal?: number;
    // Auto-paint mode props
    autoPaintEnabled?: boolean;
    autoPaintTotalHeight?: number; // Total model height when auto-paint is enabled
    autoPaintFilamentOrder?: string[]; // Filament IDs in order (for cache invalidation)
    enhancedColorMatch?: boolean; // Use color-distance mapping instead of luminance
    heightDithering?: boolean; // Floyd-Steinberg error diffusion on height map
    ditherLineWidth?: number; // Minimum dot size in mm for dithering
    smoothMeshing?: boolean; // Smooth connected boundaries using welded grid topology
    isOrtho?: boolean;
    flatPaint?: boolean; // Build a flat face-down slab (Flat Paint style, auto-paint only)
}

// Convert hex color to RGB tuple
function hexToRGB(hex: string): [number, number, number] {
    const h = hex.replace(/^#/, '');
    const r = parseInt(h.slice(0, 2), 16) || 0;
    const g = parseInt(h.slice(2, 4), 16) || 0;
    const b = parseInt(h.slice(4, 6), 16) || 0;
    return [r, g, b];
}

// Calculate perceived luminance (0-1 range)
function getLuminance(r: number, g: number, b: number): number {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Nearest-color match with small cache to avoid exact equality issues
function buildNearestSwatchFinder(swatches: { hex: string; a: number }[]) {
    const rgb = swatches.map((s) => hexToRGB(s.hex));
    const cache = new Map<number, number>(); // key = (r<<16)|(g<<8)|b -> swatch index
    return (r: number, g: number, b: number) => {
        const key = ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
        const cached = cache.get(key);
        if (cached !== undefined) return cached;
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < rgb.length; i++) {
            const [sr, sg, sb] = rgb[i];
            const dr = sr - r;
            const dg = sg - g;
            const db = sb - b;
            const d = dr * dr + dg * dg + db * db;
            if (d < bestD) {
                bestD = d;
                best = i;
                if (d === 0) break; // exact match
            }
        }
        cache.set(key, best);
        return best;
    };
}

interface KromacutExportLayerData {
    activePixels: Uint8Array;
    width: number;
    height: number;
    pixelSize: number;
    topZ: number;
    compactHeightfield?: boolean;
}

interface LayerPreviewSegment {
    color: string;
    startHeight: number;
    endHeight: number;
    transitionLayer: number;
    isBase: boolean;
}

const LAYER_PREVIEW_THUMB_SIZE_PX = 14;

function heightToPercent(height: number, maxHeight: number) {
    if (maxHeight <= 0) return 0;
    return Math.max(0, Math.min(100, (height / maxHeight) * 100));
}

function signedPx(value: number) {
    const rounded = Math.abs(Number(value.toFixed(4)));
    return value < 0 ? ` - ${rounded}px` : ` + ${rounded}px`;
}

function sliderCenterPercentCss(percent: number) {
    const clamped = Math.max(0, Math.min(100, percent));
    const thumbOffset = (0.5 - clamped / 100) * LAYER_PREVIEW_THUMB_SIZE_PX;
    return `calc(${Number(clamped.toFixed(4))}%${signedPx(thumbOffset)})`;
}

function sliderRightInsetPercentCss(percent: number) {
    const clamped = Math.max(0, Math.min(100, percent));
    const thumbOffset = (clamped / 100 - 0.5) * LAYER_PREVIEW_THUMB_SIZE_PX;
    return `calc(${Number((100 - clamped).toFixed(4))}%${signedPx(thumbOffset)})`;
}

function sliderSpanPercentCss(startPercent: number, endPercent: number) {
    const span = Math.max(0, endPercent - startPercent);
    return `calc(${Number(span.toFixed(4))}% - ${Number(
        ((span / 100) * LAYER_PREVIEW_THUMB_SIZE_PX).toFixed(4)
    )}px)`;
}

function normalizeHexColor(hex: string | undefined) {
    return normalizeHexColorValue(hex, '#3b82f6');
}

function layerNumberForTransition(
    height: number,
    layerHeight: number,
    slicerFirstLayerHeight: number
) {
    if (height <= 0 || layerHeight <= 0) return 1;
    const effFirst = Math.max(0, slicerFirstLayerHeight || 0);
    const delta = Math.max(0, height - effFirst);
    return 2 + Math.round(delta / layerHeight);
}

function getBuildOverlayStep(progress: number, layerCount: number, autoPaintEnabled: boolean) {
    const stepCount = Math.max(1, Math.floor(layerCount) + 1);
    const clampedProgress = clampProgress(progress);
    const rawStepProgress = clampedProgress * stepCount;
    const stepIndex =
        progress >= 1
            ? stepCount
            : Math.max(1, Math.min(stepCount, Math.floor(rawStepProgress) + 1));
    const stepProgress =
        progress >= 1 ? 1 : clampProgress(rawStepProgress - (stepIndex - 1));

    if (stepCount === 1) {
        return {
            stepLabel: 'Preparing mesh inputs',
            stepIndex,
            stepCount,
            stepProgress,
        };
    }

    if (stepIndex === 1) {
        return {
            stepLabel: autoPaintEnabled
                ? 'Mapping image colors to printable heights'
                : 'Reading image color layers',
            stepIndex,
            stepCount,
            stepProgress,
        };
    }

    return {
        stepLabel: `Building color layer ${stepIndex - 1} of ${stepCount - 1}`,
        stepIndex,
        stepCount,
        stepProgress,
    };
}

function createFlatShadedGeometry(
    positions: Float32Array,
    indices: number[],
    exportLayer?: KromacutExportLayerData
) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.userData.kromacutExportGeometry = { positions, indices, ...exportLayer };
    return geom;
}

function remapMeshZRange(mesh: MeshData, baseZ: number, topZ: number, heightScale: number): MeshData {
    const positions = new Float32Array(mesh.positions.length);
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let i = 2; i < mesh.positions.length; i += 3) {
        minZ = Math.min(minZ, mesh.positions[i]);
        maxZ = Math.max(maxZ, mesh.positions[i]);
    }

    const sourceSpan = maxZ - minZ || 1;
    const targetBase = baseZ * heightScale;
    const targetSpan = (topZ - baseZ) * heightScale;

    for (let i = 0; i < mesh.positions.length; i += 3) {
        positions[i] = mesh.positions[i];
        positions[i + 1] = mesh.positions[i + 1];
        positions[i + 2] = targetBase + ((mesh.positions[i + 2] - minZ) / sourceSpan) * targetSpan;
    }

    return {
        positions,
        indices: mesh.indices,
        metrics: mesh.metrics,
    };
}

interface E2EBuildMetrics {
    status: 'building' | 'complete';
    startedAt?: number;
    completedAt?: number;
    elapsedMs?: number;
    imageWidth?: number;
    imageHeight?: number;
    cropWidth?: number;
    cropHeight?: number;
    meshCount?: number;
    visibleMeshCount?: number;
    vertexCount?: number;
    triangleCount?: number;
    layerMetrics?: E2ELayerBuildMetrics[];
    dimensions?: {
        width: number;
        height: number;
        depth: number;
    };
    settings?: {
        pixelSize: number;
        layerHeight: number;
        slicerFirstLayerHeight: number;
        smoothMeshing: boolean;
        autoPaintEnabled: boolean;
        enhancedColorMatch: boolean;
        heightDithering: boolean;
        flatPaint?: boolean;
    };
}

type BuildOverlayStep = ReturnType<typeof getBuildOverlayStep>;

interface E2ELayerBuildMetrics {
    layerIndex: number;
    swatchIndex: number;
    activePixelCount: number;
    vertexCount: number;
    triangleCount: number;
    metrics?: MeshMetrics;
}

declare global {
    interface Window {
        __KROMACUT_E2E?: {
            lastBuild?: E2EBuildMetrics;
            buildHistory?: E2EBuildMetrics[];
        };
    }
}

function updateE2EBuild(metrics: E2EBuildMetrics) {
    if (typeof window === 'undefined' || !window.__KROMACUT_E2E) return;
    const next = { ...(window.__KROMACUT_E2E.lastBuild ?? {}), ...metrics };
    window.__KROMACUT_E2E.lastBuild = next;
    if (metrics.status === 'complete') {
        window.__KROMACUT_E2E.buildHistory = [
            ...(window.__KROMACUT_E2E.buildHistory ?? []),
            next,
        ];
    }
}

function clearLastMeshRef() {
    if (typeof window === 'undefined') return;
    (window as unknown as { __KROMACUT_LAST_MESH?: THREE.Object3D }).__KROMACUT_LAST_MESH =
        undefined;
}

function collectMeshStats(root: THREE.Object3D) {
    let meshCount = 0;
    let visibleMeshCount = 0;
    let vertexCount = 0;
    let triangleCount = 0;

    root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;

        meshCount++;
        if (child.visible) visibleMeshCount++;

        const geometry = child.geometry;
        const position = geometry.getAttribute('position');
        const index = geometry.getIndex();
        vertexCount += position?.count ?? 0;
        triangleCount += index ? index.count / 3 : (position?.count ?? 0) / 3;
    });

    return { meshCount, visibleMeshCount, vertexCount, triangleCount };
}

export default function ThreeDView({
    imageSrc,
    baseSliceHeight,
    layerHeight,
    slicerFirstLayerHeight = 0,
    colorSliceHeights,
    colorOrder,
    swatches,
    filamentSwatches,
    pixelSize = 0.01,
    heightScale = 1,
    stepped = false,
    pixelColumns = true,
    rebuildSignal = 0,
    autoPaintEnabled = false,
    autoPaintTotalHeight,
    autoPaintFilamentOrder,
    enhancedColorMatch = false,
    heightDithering = false,
    ditherLineWidth = 0.42,
    smoothMeshing = false,
    isOrtho = false,
    flatPaint = false,
}: ThreeDViewProps) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [isBuilding, setIsBuilding] = useState(false);
    const [activeBuildSmoothMeshing, setActiveBuildSmoothMeshing] = useState(smoothMeshing);
    const [buildProgress, setBuildProgress] = useState(0);
    const [buildOverlayStep, setBuildOverlayStep] = useState<BuildOverlayStep | null>(null);
    const [modelDimensions, setModelDimensions] = useState<{
        width: number;
        height: number;
        depth: number;
    } | null>(null);
    const [previewMinHeight, setPreviewMinHeight] = useState(0);
    const [previewHeight, setPreviewHeight] = useState<number | null>(null);
    const [maxModelHeight, setMaxModelHeight] = useState(0);
    const [hoveredSegment, setHoveredSegment] = useState<{
        segment: LayerPreviewSegment;
        xPercent: number;
    } | null>(null);
    const previewTrackRef = useRef<HTMLDivElement | null>(null);
    const { cameraRef, controlsRef, modelGroupRef, materialRef, requestRender, switchCamera } = useThreeScene(
        mountRef,
        setIsBuilding
    );
    useEffect(() => {
        switchCamera(isOrtho);
    }, [isOrtho, switchCamera]);

    const progressRef = useRef(0);
    const progressLastUpdateRef = useRef(0);
    const buildOverlayLastUpdateRef = useRef(0);
    const pushProgress = (value: number) => {
        const nextValue = clampProgress(value);
        progressRef.current = nextValue;
        const now = performance.now();
        if (nextValue <= 0 || nextValue >= 1 || now - progressLastUpdateRef.current > 60) {
            progressLastUpdateRef.current = now;
            setBuildProgress(nextValue);
        }
    };
    const pushBuildOverlayStep = (value: BuildOverlayStep) => {
        const now = performance.now();
        const stepProgress = clampProgress(value.stepProgress ?? 0);

        if (stepProgress <= 0 || stepProgress >= 1 || now - buildOverlayLastUpdateRef.current > 60) {
            buildOverlayLastUpdateRef.current = now;
            setBuildOverlayStep({
                ...value,
                stepProgress,
            });
        }
    };

    useEffect(() => {
        if (controlsRef.current) {
            controlsRef.current.enabled = !isBuilding;
        }
    }, [controlsRef, isBuilding]);

    // Update mesh visibility based on preview height slider
    useEffect(() => {
        const modelGroup = modelGroupRef.current;
        if (!modelGroup || previewHeight === null) return;

        const minHeight = Math.min(previewMinHeight, previewHeight);
        const maxHeight = Math.max(previewMinHeight, previewHeight);
        modelGroup.traverse((child) => {
            if (child instanceof THREE.Mesh && child.userData.baseZ !== undefined) {
                const baseZ = child.userData.baseZ as number;
                const topZ = (child.userData.topZ as number | undefined) ?? baseZ;
                child.visible = topZ > minHeight && baseZ < maxHeight;
            }
        });

        requestRender();
    }, [previewHeight, previewMinHeight, modelGroupRef, requestRender]);

    const snapPreviewHeight = (value: number): number => {
        const bounded = Math.max(0, Math.min(maxModelHeight, value));
        if (layerHeight <= 0) return bounded;

        const first = Math.max(0, slicerFirstLayerHeight || 0);
        if (first <= 0) {
            return Math.max(
                0,
                Math.min(maxModelHeight, Math.round(bounded / layerHeight) * layerHeight)
            );
        }

        if (bounded <= first / 2) return 0;
        if (bounded <= first + layerHeight / 2) return first;

        const delta = Math.max(0, bounded - first);
        const snapped = first + Math.round(delta / layerHeight) * layerHeight;
        return Math.max(0, Math.min(maxModelHeight, snapped));
    };

    const layerPreviewSegments = useMemo<LayerPreviewSegment[]>(() => {
        if (maxModelHeight <= 0 || colorOrder.length === 0) return [];
        // Flat Paint: printed layers contain several filaments side by side, so a
        // single global swap sequence does not exist — show a plain track.
        if (flatPaint) return [];

        const segments: LayerPreviewSegment[] = [];
        let running = 0;

        colorOrder.forEach((swatchIndex, layerPosition) => {
            const thickness =
                layerPosition === 0
                    ? Math.max(colorSliceHeights[swatchIndex] || 0, slicerFirstLayerHeight)
                    : colorSliceHeights[swatchIndex] || 0;
            if (thickness <= 0.0001) return;

            const startHeight = running;
            running += thickness;
            const endHeight = running;
            const clampedStart = Math.max(0, Math.min(maxModelHeight, startHeight));
            const clampedEnd = Math.max(0, Math.min(maxModelHeight, endHeight));
            if (clampedEnd <= clampedStart + 0.0001) return;

            const filamentSwatch = filamentSwatches?.[swatchIndex] ?? swatches[swatchIndex];
            const color = normalizeHexColor(filamentSwatch?.hex);
            const previous = segments[segments.length - 1];

            if (previous && previous.color === color) {
                previous.endHeight = clampedEnd;
                return;
            }

            segments.push({
                color,
                startHeight: clampedStart,
                endHeight: clampedEnd,
                transitionLayer: layerNumberForTransition(
                    clampedStart,
                    layerHeight,
                    slicerFirstLayerHeight
                ),
                isBase: segments.length === 0 && clampedStart <= 0,
            });
        });

        return segments;
    }, [
        maxModelHeight,
        colorOrder,
        colorSliceHeights,
        slicerFirstLayerHeight,
        filamentSwatches,
        swatches,
        layerHeight,
        flatPaint,
    ]);

    const updateHoveredSegment = (
        segment: LayerPreviewSegment,
        event: PointerEvent<HTMLDivElement>
    ) => {
        const rect = previewTrackRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0) {
            setHoveredSegment({ segment, xPercent: 50 });
            return;
        }
        const xPercent = Math.max(
            2,
            Math.min(98, ((event.clientX - rect.left) / rect.width) * 100)
        );
        setHoveredSegment({ segment, xPercent });
    };

    const handlePreviewRangeChange = (value: number[]) => {
        const low = snapPreviewHeight(value[0] ?? 0);
        const high = snapPreviewHeight(value[1] ?? maxModelHeight);
        setPreviewMinHeight(Math.min(low, high));
        setPreviewHeight(Math.max(low, high));
    };

    // 2. Rebuild mesh geometry only when the parent sends an explicit build signal.
    const buildTokenRef = useRef(0);
    const debounceTimerRef = useRef<number | null>(null);
    const lastParamsKeyRef = useRef<string | null>(null);
    const lastRebuildRef = useRef<number>(rebuildSignal);
    const lastImageSrcRef = useRef<string | null | undefined>(imageSrc);

    useEffect(() => {
        return () => {
            if (debounceTimerRef.current !== null) {
                window.clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const modelGroup = modelGroupRef.current;
        if (!modelGroup) return;

        const imageChanged = imageSrc !== lastImageSrcRef.current;
        lastImageSrcRef.current = imageSrc;

        if (!imageSrc) {
            buildTokenRef.current++;
            if (debounceTimerRef.current !== null) {
                window.clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            modelGroup.clear();
            clearLastMeshRef();
            setIsBuilding(false);
            setModelDimensions(null);
            setMaxModelHeight(0);
            setPreviewMinHeight(0);
            setPreviewHeight(null);
            requestRender();
            return;
        }

        if (imageChanged) {
            buildTokenRef.current++;
            lastParamsKeyRef.current = null;
            if (debounceTimerRef.current !== null) {
                window.clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            modelGroup.clear();
            clearLastMeshRef();
            setIsBuilding(false);
            setModelDimensions(null);
            setMaxModelHeight(0);
            setPreviewMinHeight(0);
            setPreviewHeight(null);
            requestRender();
        }

        const rebuildRequested = rebuildSignal !== lastRebuildRef.current;
        if (!rebuildRequested) return;

        lastParamsKeyRef.current = null;
        lastRebuildRef.current = rebuildSignal;

        // Don't build if there are no layers configured
        if (!colorOrder || colorOrder.length === 0 || !swatches || swatches.length === 0) {
            buildTokenRef.current++;
            if (debounceTimerRef.current !== null) {
                window.clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            modelGroup.clear();
            clearLastMeshRef();
            setIsBuilding(false);
            return;
        }

        const buildSmoothMeshing = smoothMeshing && !flatPaint;

        // Stable key of inputs to avoid duplicate builds when references unchanged
        const paramsKey = JSON.stringify({
            imageSrc,
            baseSliceHeight,
            layerHeight,
            slicerFirstLayerHeight,
            colorSliceHeights,
            colorOrder,
            swatches: swatches.map((s) => s.hex),
            // Filament colors shape Flat Paint geometry (zone merging + export groups)
            filamentSwatches: filamentSwatches?.map((s) => s.hex),
            pixelSize,
            heightScale,
            stepped,
            pixelColumns,
            autoPaintEnabled,
            autoPaintTotalHeight,
            autoPaintFilamentOrder, // Include filament order to detect optimizer changes
            enhancedColorMatch,
            heightDithering,
            ditherLineWidth,
            smoothMeshing,
            flatPaint,
        });
        if (paramsKey === lastParamsKeyRef.current) return; // nothing changed logically
        lastParamsKeyRef.current = paramsKey;

        // Debounce rapid changes (e.g., dragging slider)
        if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
        const token = ++buildTokenRef.current;
        setActiveBuildSmoothMeshing(buildSmoothMeshing);
        debounceTimerRef.current = window.setTimeout(() => {
            debounceTimerRef.current = null;
            const buildStartedAt = performance.now();
            // mark that a build is in progress for the overlay
            setIsBuilding(true);
            pushProgress(0);
            setBuildOverlayStep(null);
            updateE2EBuild({
                status: 'building',
                startedAt: buildStartedAt,
                settings: {
                    pixelSize,
                    layerHeight,
                    slicerFirstLayerHeight,
                    smoothMeshing: buildSmoothMeshing,
                    autoPaintEnabled,
                    enhancedColorMatch,
                    heightDithering,
                    flatPaint,
                },
            });

            const requestIdle = (fn: () => void) => {
                const ric = (
                    window as unknown as {
                        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
                    }
                ).requestIdleCallback;
                if (typeof ric === 'function') ric(fn, { timeout: 300 });
                else setTimeout(fn, 0);
            };

            // Shared image load (do once for preview + final)
            const loadImage = () =>
                new Promise<HTMLImageElement | null>((res) => {
                    const i = new Image();
                    i.crossOrigin = 'anonymous';
                    i.onload = () => res(i);
                    i.onerror = () => res(null);
                    i.src = imageSrc;
                });

            // Build multi-mesh geometry (one object per color layer)
            const buildPixelGeometry = async (
                img: HTMLImageElement,
                bbox: { minX: number; minY: number; boxW: number; boxH: number }
            ) => {
                const nearestSwatchIndex = buildNearestSwatchFinder(swatches);
                if (token !== buildTokenRef.current) return;
                const fullW = img.naturalWidth;
                const fullH = img.naturalHeight;
                const { minX, minY, boxW, boxH } = bbox;

                const canvas = document.createElement('canvas');
                canvas.width = fullW;
                canvas.height = fullH;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.drawImage(img, 0, 0, fullW, fullH);
                const { data } = ctx.getImageData(0, 0, fullW, fullH);

                // Clear current model
                modelGroup.clear();
                clearLastMeshRef();

                const YIELD_MS = 12;
                let lastYield = performance.now();
                const meshBuildMetrics: E2ELayerBuildMetrics[] = [];
                const buildStepCount = Math.max(1, colorOrder.length + 1);
                const pushScanDetail = (label: string, progress: number) => {
                    pushBuildOverlayStep({
                        stepLabel: label,
                        stepIndex: 1,
                        stepCount: buildStepCount,
                        stepProgress: progress,
                    });
                };
                const pushLayerDetail = (
                    buildLayerIndex: number,
                    label: string,
                    progress: number
                ) => {
                    const stepProgress = clampProgress(progress);
                    pushBuildOverlayStep({
                        stepLabel: `Layer ${buildLayerIndex + 1} of ${colorOrder.length}: ${label}`,
                        stepIndex: Math.min(buildStepCount, buildLayerIndex + 2),
                        stepCount: buildStepCount,
                        stepProgress,
                    });
                    pushProgress(
                        progressInSpan(
                            (buildLayerIndex + 1) / buildStepCount,
                            1 / buildStepCount,
                            stepProgress
                        )
                    );
                };
                const meshProgressReporter = (buildLayerIndex: number) => (progress: MeshProgress) => {
                    pushLayerDetail(
                        buildLayerIndex,
                        progress.label,
                        progressInSpan(0.35, 0.55, progress.progress)
                    );
                };

                if (autoPaintEnabled && autoPaintTotalHeight && autoPaintTotalHeight > 0) {
                    // === AUTO-PAINT MODE ===

                    // Build layers from the colorSliceHeights
                    const cumulativeHeights: number[] = [];
                    let running = 0;
                    colorOrder.forEach((fi, pos) => {
                        const h = colorSliceHeights[fi] || 0;
                        const eff = pos === 0 ? Math.max(h, slicerFirstLayerHeight) : h;
                        running += eff;
                        cumulativeHeights[pos] = running;
                    });

                    // Precompute pixel height map (same size as image crop)
                    // This avoids recomputing per-layer
                    const pixelHeightMap = new Float32Array(boxW * boxH);

                    if (enhancedColorMatch) {
                        // === ENHANCED: Polyline projection in Lab color space ===
                        // The virtual swatches trace a path (polyline) through
                        // CIE-Lab space, parameterized by height.  For each image
                        // pixel we find the nearest point on this polyline via
                        // segment projection, yielding a continuous height that
                        // varies smoothly even among similar colors.
                        //
                        // Flat zones (consecutive identical-color swatches from
                        // the same filament) are collapsed into single nodes with
                        // a height *range*.  Within these ranges we fall back to
                        // luminance-based sub-detail, preserving surface texture
                        // without affecting color accuracy (the printed color is
                        // constant across the flat zone).

                        // Inline sRGB -> Lab conversion helper
                        const toLab = (
                            sr: number,
                            sg: number,
                            sb: number
                        ): { L: number; a: number; b: number } => {
                            let rr = sr / 255,
                                gg = sg / 255,
                                bb = sb / 255;
                            rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
                            gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
                            bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;
                            rr *= 100;
                            gg *= 100;
                            bb *= 100;
                            let x = rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375;
                            let y = rr * 0.2126729 + gg * 0.7151522 + bb * 0.072175;
                            let z = rr * 0.0193339 + gg * 0.119192 + bb * 0.9503041;
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
                        };

                        // Pre-compute Lab + cumulative height for every virtual swatch
                        const swatchEntries: Array<{
                            lab: { L: number; a: number; b: number };
                            height: number;
                        }> = [];
                        for (let si = 0; si < swatches.length; si++) {
                            const rgb = hexToRGB(swatches[si].hex);
                            swatchEntries.push({
                                lab: toLab(rgb[0], rgb[1], rgb[2]),
                                height: cumulativeHeights[si] || 0,
                            });
                        }

                        // --- Collapse consecutive same-color runs into polyline nodes ---
                        // Only truly identical colors collapse (DeltaE < 0.5).
                        // Each node keeps its height range so flat zones can use
                        // luminance for sub-detail.
                        const polyNodes: Array<{
                            lab: { L: number; a: number; b: number };
                            minHeight: number;
                            maxHeight: number;
                        }> = [];
                        const COLLAPSE_DE_SQ = 0.25; // 0.5^2 -- very conservative
                        if (swatchEntries.length > 0) {
                            let runStart = 0;
                            for (let si = 1; si <= swatchEntries.length; si++) {
                                let split = si === swatchEntries.length;
                                if (!split) {
                                    const ref = swatchEntries[runStart].lab;
                                    const cur = swatchEntries[si].lab;
                                    const deSq =
                                        (cur.L - ref.L) ** 2 +
                                        (cur.a - ref.a) ** 2 +
                                        (cur.b - ref.b) ** 2;
                                    split = deSq >= COLLAPSE_DE_SQ;
                                }
                                if (split) {
                                    // Average Lab over the run
                                    let sL = 0,
                                        sa = 0,
                                        sb = 0;
                                    const cnt = si - runStart;
                                    for (let j = runStart; j < si; j++) {
                                        sL += swatchEntries[j].lab.L;
                                        sa += swatchEntries[j].lab.a;
                                        sb += swatchEntries[j].lab.b;
                                    }
                                    polyNodes.push({
                                        lab: { L: sL / cnt, a: sa / cnt, b: sb / cnt },
                                        minHeight: swatchEntries[runStart].height,
                                        maxHeight: swatchEntries[si - 1].height,
                                    });
                                    runStart = si;
                                }
                            }
                        }

                        // --- Pre-compute transition segments between consecutive nodes ---
                        // A segment connects the END of one flat zone to the START of
                        // the next, tracing the color-blend path through Lab space.
                        const polySegs: Array<{
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
                        for (let ni = 0; ni < polyNodes.length - 1; ni++) {
                            const A = polyNodes[ni],
                                B = polyNodes[ni + 1];
                            const dL = B.lab.L - A.lab.L;
                            const da = B.lab.a - A.lab.a;
                            const db = B.lab.b - A.lab.b;
                            polySegs.push({
                                aL: A.lab.L,
                                aa: A.lab.a,
                                ab: A.lab.b,
                                dL,
                                da,
                                db,
                                lenSq: dL * dL + da * da + db * db,
                                hStart: A.maxHeight, // transition begins at end of A
                                hEnd: B.minHeight, // transition ends at start of B
                            });
                        }

                        // Pre-scan image luminance range for flat-zone sub-detail
                        let imgMinLum = 1,
                            imgMaxLum = 0;
                        for (let py = minY; py < minY + boxH; py++) {
                            for (let px = minX; px < minX + boxW; px++) {
                                const idx = (py * fullW + px) * 4;
                                if (data[idx + 3] === 0) continue;
                                const lum = getLuminance(data[idx], data[idx + 1], data[idx + 2]);
                                if (lum < imgMinLum) imgMinLum = lum;
                                if (lum > imgMaxLum) imgMaxLum = lum;
                            }
                        }
                        if (imgMaxLum <= imgMinLum) imgMaxLum = imgMinLum + 0.001;
                        const imgLumRange = imgMaxLum - imgMinLum;

                        const maxModelH = cumulativeHeights[cumulativeHeights.length - 1] || 1;
                        const minModelH = cumulativeHeights[0] || 0;

                        // --- Pass 1: Compute continuous (un-snapped) heights ---
                        // We deliberately do NOT snap to the layer grid here.
                        // The RGB cache is still valid because it stores the ideal
                        // continuous height; dithering happens spatially in Pass 2.
                        const colorHeightCache = new Map<number, number>();

                        for (let py = minY; py < minY + boxH; py++) {
                            for (let px = minX; px < minX + boxW; px++) {
                                const idx = (py * fullW + px) * 4;
                                const a = data[idx + 3];
                                const mapIdx = (py - minY) * boxW + (px - minX);
                                if (a === 0) {
                                    pixelHeightMap[mapIdx] = 0;
                                    continue;
                                }

                                const pr = data[idx],
                                    pg = data[idx + 1],
                                    pb = data[idx + 2];
                                const cacheKey =
                                    ((pr & 0xff) << 16) | ((pg & 0xff) << 8) | (pb & 0xff);
                                const cached = colorHeightCache.get(cacheKey);
                                if (cached !== undefined) {
                                    pixelHeightMap[mapIdx] = cached;
                                    continue;
                                }

                                const pLab = toLab(pr, pg, pb);

                                let bestDist = Infinity;
                                let targetHeight = 0;

                                // --- Match against flat-zone nodes ---
                                for (let ni = 0; ni < polyNodes.length; ni++) {
                                    const nd = polyNodes[ni];
                                    const dist = Math.sqrt(
                                        (pLab.L - nd.lab.L) ** 2 +
                                            (pLab.a - nd.lab.a) ** 2 +
                                            (pLab.b - nd.lab.b) ** 2
                                    );
                                    if (dist < bestDist) {
                                        bestDist = dist;
                                        const range = nd.maxHeight - nd.minHeight;
                                        if (range > 1e-6) {
                                            const lum = getLuminance(pr, pg, pb);
                                            const lumT = (lum - imgMinLum) / imgLumRange;
                                            targetHeight = nd.minHeight + lumT * range;
                                        } else {
                                            targetHeight = (nd.minHeight + nd.maxHeight) * 0.5;
                                        }
                                    }
                                }

                                // --- Match against transition segments ---
                                for (let si = 0; si < polySegs.length; si++) {
                                    const seg = polySegs[si];
                                    if (seg.lenSq < 0.01) continue;

                                    const pL = pLab.L - seg.aL;
                                    const pa = pLab.a - seg.aa;
                                    const pba = pLab.b - seg.ab;
                                    let t = (pL * seg.dL + pa * seg.da + pba * seg.db) / seg.lenSq;
                                    t = Math.max(0, Math.min(1, t));

                                    const projL = seg.aL + t * seg.dL;
                                    const proja = seg.aa + t * seg.da;
                                    const projb = seg.ab + t * seg.db;
                                    const dist = Math.sqrt(
                                        (pLab.L - projL) ** 2 +
                                            (pLab.a - proja) ** 2 +
                                            (pLab.b - projb) ** 2
                                    );

                                    if (dist < bestDist) {
                                        bestDist = dist;
                                        targetHeight = seg.hStart + t * (seg.hEnd - seg.hStart);
                                    }
                                }

                                // Clamp to model bounds (continuous, no grid snap)
                                targetHeight = Math.max(
                                    minModelH,
                                    Math.min(maxModelH, targetHeight)
                                );

                                pixelHeightMap[mapIdx] = targetHeight;
                                colorHeightCache.set(cacheKey, targetHeight);
                            }
                            pushScanDetail(
                                'Mapping image colors to printable heights',
                                (py - minY + 1) / boxH
                            );
                            pushProgress(
                                layeredBuildScanProgress(py - minY, boxH, colorOrder.length)
                            );
                        }

                        // --- Pass 2: Quantize heights (with optional dithering) ---
                        // The continuous height map has sub-layer precision, but
                        // the 3D model must use discrete layer heights.  When
                        // heightDithering is ON, block-aware Floyd-Steinberg error
                        // diffusion produces dots sized to the printer's line width
                        // so the dither pattern is actually printable.  Edges
                        // between different quantized heights are protected from
                        // dithering to avoid staircase artifacts that expose wrong
                        // colors.  When OFF, simple rounding is used.
                        if (layerHeight > 0 && heightDithering) {
                            // --- Step 2a: Snap everything to the grid first ---
                            const snappedMap = new Float32Array(boxW * boxH);
                            for (let mi = 0; mi < boxW * boxH; mi++) {
                                const h = pixelHeightMap[mi];
                                if (h <= 0) {
                                    snappedMap[mi] = 0;
                                    continue;
                                }
                                const delta = Math.max(0, h - slicerFirstLayerHeight);
                                let s =
                                    slicerFirstLayerHeight +
                                    Math.round(delta / layerHeight) * layerHeight;
                                s = Math.max(slicerFirstLayerHeight, Math.min(maxModelH, s));
                                snappedMap[mi] = s;
                            }

                            // --- Step 2b: Identify edge pixels ---
                            // A pixel is on an edge if any of its 4-connected
                            // neighbors has a different snapped height.  Dithering
                            // these would create jagged staircases that expose the
                            // wrong filament color, so we leave them at their
                            // nearest-round height.
                            const isEdge = new Uint8Array(boxW * boxH);
                            for (let y = 0; y < boxH; y++) {
                                for (let x = 0; x < boxW; x++) {
                                    const mi = y * boxW + x;
                                    const sh = snappedMap[mi];
                                    if (sh <= 0) continue;
                                    if (
                                        (x > 0 &&
                                            snappedMap[mi - 1] > 0 &&
                                            snappedMap[mi - 1] !== sh) ||
                                        (x < boxW - 1 &&
                                            snappedMap[mi + 1] > 0 &&
                                            snappedMap[mi + 1] !== sh) ||
                                        (y > 0 &&
                                            snappedMap[mi - boxW] > 0 &&
                                            snappedMap[mi - boxW] !== sh) ||
                                        (y < boxH - 1 &&
                                            snappedMap[mi + boxW] > 0 &&
                                            snappedMap[mi + boxW] !== sh)
                                    ) {
                                        isEdge[mi] = 1;
                                    }
                                }
                            }

                            // --- Step 2c: Block-aware Floyd-Steinberg ---
                            // The block size ensures dither dots are at least as
                            // wide as the printer's line width (in pixels).
                            const blockSize = Math.max(1, Math.round(ditherLineWidth / pixelSize));
                            const bW = Math.ceil(boxW / blockSize);
                            const bH = Math.ceil(boxH / blockSize);

                            // Compute average continuous height per block
                            const blockAvg = new Float64Array(bW * bH);
                            const blockCnt = new Uint32Array(bW * bH);
                            const blockHasEdge = new Uint8Array(bW * bH);
                            for (let y = 0; y < boxH; y++) {
                                for (let x = 0; x < boxW; x++) {
                                    const mi = y * boxW + x;
                                    const h = pixelHeightMap[mi]; // still continuous
                                    if (h <= 0) continue;
                                    const bx = Math.floor(x / blockSize);
                                    const by = Math.floor(y / blockSize);
                                    const bi = by * bW + bx;
                                    blockAvg[bi] += h;
                                    blockCnt[bi]++;
                                    if (isEdge[mi]) blockHasEdge[bi] = 1;
                                }
                            }
                            for (let bi = 0; bi < bW * bH; bi++) {
                                if (blockCnt[bi] > 0) blockAvg[bi] /= blockCnt[bi];
                            }

                            // Dither at block level
                            const errBuf = new Float64Array(bW * bH);
                            const blockSnapped = new Float32Array(bW * bH);

                            for (let by = 0; by < bH; by++) {
                                const ltr = by % 2 === 0;
                                for (let bxi = 0; bxi < bW; bxi++) {
                                    const bx = ltr ? bxi : bW - 1 - bxi;
                                    const bi = by * bW + bx;
                                    if (blockCnt[bi] === 0) continue;

                                    let snapped: number;
                                    if (blockHasEdge[bi]) {
                                        // Edge block: no dithering, use simple snap
                                        const delta = Math.max(
                                            0,
                                            blockAvg[bi] - slicerFirstLayerHeight
                                        );
                                        snapped =
                                            slicerFirstLayerHeight +
                                            Math.round(delta / layerHeight) * layerHeight;
                                    } else {
                                        const adjusted = blockAvg[bi] + errBuf[bi];
                                        const delta = Math.max(
                                            0,
                                            adjusted - slicerFirstLayerHeight
                                        );
                                        snapped =
                                            slicerFirstLayerHeight +
                                            Math.round(delta / layerHeight) * layerHeight;
                                    }
                                    snapped = Math.max(
                                        slicerFirstLayerHeight,
                                        Math.min(maxModelH, snapped)
                                    );
                                    blockSnapped[bi] = snapped;

                                    if (!blockHasEdge[bi]) {
                                        const err = blockAvg[bi] + errBuf[bi] - snapped;
                                        const xFwd = ltr ? bx + 1 : bx - 1;
                                        const xDiagFwd = ltr ? bx + 1 : bx - 1;
                                        const xDiagBack = ltr ? bx - 1 : bx + 1;

                                        if (xFwd >= 0 && xFwd < bW)
                                            errBuf[by * bW + xFwd] += err * (7 / 16);
                                        if (by + 1 < bH) {
                                            if (xDiagBack >= 0 && xDiagBack < bW)
                                                errBuf[(by + 1) * bW + xDiagBack] += err * (3 / 16);
                                            errBuf[(by + 1) * bW + bx] += err * (5 / 16);
                                            if (xDiagFwd >= 0 && xDiagFwd < bW)
                                                errBuf[(by + 1) * bW + xDiagFwd] += err * (1 / 16);
                                        }
                                    }
                                }
                            }

                            // Write block-level results back to pixel map
                            for (let y = 0; y < boxH; y++) {
                                for (let x = 0; x < boxW; x++) {
                                    const mi = y * boxW + x;
                                    if (pixelHeightMap[mi] <= 0) continue;
                                    const bx = Math.floor(x / blockSize);
                                    const by = Math.floor(y / blockSize);
                                    const bi = by * bW + bx;
                                    if (blockHasEdge[bi]) {
                                        // Edge blocks: use per-pixel snap
                                        pixelHeightMap[mi] = snappedMap[mi];
                                    } else {
                                        pixelHeightMap[mi] = blockSnapped[bi];
                                    }
                                }
                            }
                        } else if (layerHeight > 0) {
                            // Simple grid snap without error diffusion
                            for (let mi = 0; mi < boxW * boxH; mi++) {
                                const h = pixelHeightMap[mi];
                                if (h <= 0) continue;
                                const delta = Math.max(0, h - slicerFirstLayerHeight);
                                let snapped =
                                    slicerFirstLayerHeight +
                                    Math.round(delta / layerHeight) * layerHeight;
                                snapped = Math.max(
                                    slicerFirstLayerHeight,
                                    Math.min(maxModelH, snapped)
                                );
                                pixelHeightMap[mi] = snapped;
                            }
                        }
                    } else {
                        // === STANDARD: Luminance-based mapping ===
                        // First, find the luminance range of the image
                        let minLum = 1,
                            maxLum = 0;
                        for (let py = minY; py < minY + boxH; py++) {
                            for (let px = minX; px < minX + boxW; px++) {
                                const idx = (py * fullW + px) * 4;
                                const a = data[idx + 3];
                                if (a > 0) {
                                    const lum = getLuminance(
                                        data[idx],
                                        data[idx + 1],
                                        data[idx + 2]
                                    );
                                    minLum = Math.min(minLum, lum);
                                    maxLum = Math.max(maxLum, lum);
                                }
                            }
                        }
                        if (maxLum <= minLum) maxLum = minLum + 0.001;

                        for (let py = minY; py < minY + boxH; py++) {
                            for (let px = minX; px < minX + boxW; px++) {
                                const idx = (py * fullW + px) * 4;
                                const a = data[idx + 3];
                                const mapIdx = (py - minY) * boxW + (px - minX);
                                if (a === 0) {
                                    pixelHeightMap[mapIdx] = 0;
                                    continue;
                                }

                                const lum = getLuminance(data[idx], data[idx + 1], data[idx + 2]);
                                const normalizedLum = (lum - minLum) / (maxLum - minLum);

                                const firstLayerH = Math.max(
                                    slicerFirstLayerHeight,
                                    colorSliceHeights[colorOrder[0]] || slicerFirstLayerHeight
                                );
                                let pixelHeight =
                                    firstLayerH +
                                    normalizedLum * (autoPaintTotalHeight - firstLayerH);

                                // Snap to layer height grid
                                if (layerHeight > 0) {
                                    const delta = Math.max(0, pixelHeight - slicerFirstLayerHeight);
                                    pixelHeight =
                                        slicerFirstLayerHeight +
                                        Math.round(delta / layerHeight) * layerHeight;
                                    pixelHeight = Math.max(slicerFirstLayerHeight, pixelHeight);
                                }

                                pixelHeightMap[mapIdx] = pixelHeight;
                            }
                            pushScanDetail(
                                'Mapping image luminance to printable heights',
                                (py - minY + 1) / boxH
                            );
                            pushProgress(
                                layeredBuildScanProgress(py - minY, boxH, colorOrder.length)
                            );
                        }
                    }

                    if (flatPaint) {
                        // === FLAT_PAINT: uniform face-down slab ===
                        // Reverse each pixel column so the visible blend layer
                        // touches the plate (mirrored in X so the artwork reads
                        // correctly once the finished print is flipped over),
                        // backfill behind the columns with the foundation
                        // filament, and add a transparent carrier first layer.
                        const orientedCounts = new Uint16Array(boxW * boxH);
                        {
                            const rawCounts = heightMapToFlatPaintLayerCounts(
                                pixelHeightMap,
                                cumulativeHeights,
                                layerHeight
                            );
                            for (let y = 0; y < boxH; y++) {
                                const srcRow = y * boxW;
                                const dstRow = (boxH - 1 - y) * boxW;
                                for (let x = 0; x < boxW; x++) {
                                    orientedCounts[dstRow + (boxW - 1 - x)] =
                                        rawCounts[srcRow + x];
                                }
                            }
                        }

                        const layout = buildFlatPaintLayout({
                            layerCounts: orientedCounts,
                            width: boxW,
                            height: boxH,
                            layerCount: colorOrder.length,
                            layerHeight,
                            carrierThickness: Math.max(slicerFirstLayerHeight, layerHeight),
                            layerVirtualHexes: colorOrder.map(
                                (swatchIdx) => swatches[swatchIdx]?.hex ?? '#888888'
                            ),
                            layerFilamentHexes: colorOrder.map(
                                (swatchIdx) =>
                                    (filamentSwatches?.[swatchIdx] ?? swatches[swatchIdx])?.hex ??
                                    '#888888'
                            ),
                        });

                        const partCount = Math.max(1, layout.parts.length);
                        const scanSpanEnd = 1 / (colorOrder.length + 1);
                        const pushPartDetail = (
                            partIndex: number,
                            label: string,
                            progress: number
                        ) => {
                            const stepProgress = clampProgress(progress);
                            pushBuildOverlayStep({
                                stepLabel: `Flat Paint part ${partIndex + 1} of ${partCount}: ${label}`,
                                stepIndex: Math.min(partCount + 1, partIndex + 2),
                                stepCount: partCount + 1,
                                stepProgress,
                            });
                            pushProgress(
                                progressInSpan(
                                    scanSpanEnd,
                                    1 - scanSpanEnd,
                                    (partIndex + stepProgress) / partCount
                                )
                            );
                        };

                        const flatMeshCache = new WeakMap<Uint8Array, Promise<MeshData>>();
                        const partIdxForProgress = (part: (typeof layout.parts)[number]) =>
                            layout.parts.indexOf(part);
                        const getFlatMaskMesh = (part: (typeof layout.parts)[number]) => {
                            const cached = flatMeshCache.get(part.mask);
                            if (cached) return cached;

                            const promise = generateGreedyMesh(
                                part.mask,
                                boxW,
                                boxH,
                                1,
                                0,
                                pixelSize,
                                1,
                                {
                                    yieldIntervalMs: 8,
                                    onProgress: (progress: MeshProgress) => {
                                        pushPartDetail(
                                            partIdxForProgress(part),
                                            progress.label,
                                            progressInSpan(0, 0.9, progress.progress)
                                        );
                                    },
                                }
                            );
                            flatMeshCache.set(part.mask, promise);
                            return promise;
                        };

                        for (let partIdx = 0; partIdx < layout.parts.length; partIdx++) {
                            const part = layout.parts[partIdx];
                            if (token !== buildTokenRef.current) return;
                            if (part.activeCount === 0) continue;

                            // Flat Paint always uses the greedy mesher: smoothed
                            // boundaries would open gaps between side-by-side
                            // color regions inside the slab.
                            const generatedMesh = remapMeshZRange(
                                await getFlatMaskMesh(part),
                                part.baseZ,
                                part.topZ,
                                heightScale
                            );
                            meshBuildMetrics.push({
                                layerIndex: partIdx,
                                swatchIndex: part.classIndex,
                                activePixelCount: part.activeCount,
                                vertexCount: generatedMesh.positions.length / 3,
                                triangleCount: generatedMesh.indices.length / 3,
                                metrics: generatedMesh.metrics,
                            });

                            const geom = createFlatShadedGeometry(
                                generatedMesh.positions,
                                generatedMesh.indices,
                                {
                                    activePixels: part.mask,
                                    width: boxW,
                                    height: boxH,
                                    pixelSize,
                                    topZ: part.topZ * heightScale,
                                    compactHeightfield: true,
                                }
                            );
                            const isCarrier = part.kind === 'carrier';
                            const mat = new THREE.MeshStandardMaterial({
                                color: part.previewHex,
                                side: THREE.FrontSide,
                                metalness: 0,
                                roughness: isCarrier ? 0.3 : 0.7,
                                flatShading: true,
                                transparent: isCarrier,
                                opacity: isCarrier ? 0.3 : 1,
                            });

                            const mesh = new THREE.Mesh(geom, mat);
                            // Store slab Z range for the preview slider
                            mesh.userData.baseZ = part.baseZ;
                            mesh.userData.topZ = part.topZ;
                            // Export metadata: one 3MF object per physical filament
                            mesh.userData.kromacutExportGroup = part.exportGroup;
                            mesh.userData.kromacutFilamentHex = part.filamentHex;
                            mesh.userData.kromacutMaterialKey = part.exportGroup;
                            mesh.userData.kromacutPartName = part.partName;
                            modelGroup.add(mesh);
                            pushPartDetail(partIdx, 'Part mesh complete', 1);

                            if (performance.now() - lastYield > YIELD_MS) {
                                await new Promise((r) => requestAnimationFrame(r));
                                if (token !== buildTokenRef.current) return;
                                lastYield = performance.now();
                            }
                        }
                    } else {
                        // Build each layer once; smooth meshing does not run overhang repair passes.
                        const layerBuildOrder = Array.from(
                            { length: colorOrder.length },
                            (_, layerIndex) => layerIndex
                        );
                        const builtLayerMeshes: Array<THREE.Mesh | undefined> = new Array(
                            colorOrder.length
                        );

                        for (
                            let buildLayerIndex = 0;
                            buildLayerIndex < layerBuildOrder.length;
                            buildLayerIndex++
                        ) {
                            const i = layerBuildOrder[buildLayerIndex];
                            if (token !== buildTokenRef.current) return;

                            const swatchIdx = colorOrder[i];
                            if (!swatches[swatchIdx]) continue;
                            const colorHex = swatches[swatchIdx].hex;
                            const thickness =
                                i === 0
                                    ? Math.max(
                                          colorSliceHeights[swatchIdx] || 0,
                                          slicerFirstLayerHeight
                                      )
                                    : colorSliceHeights[swatchIdx] || 0;
                            if (thickness <= 0.0001) continue;

                            const topZ = i === 0 ? cumulativeHeights[0] : cumulativeHeights[i];
                            const baseZ = i === 0 ? 0 : cumulativeHeights[i - 1];

                            // Identify active pixels for this layer using precomputed height map
                            const activePixels = new Uint8Array(boxW * boxH);
                            let activeCount = 0;

                            for (let y = 0; y < boxH; y++) {
                                for (let x = 0; x < boxW; x++) {
                                    const mapIdx = y * boxW + x;
                                    const pixelHeight = pixelHeightMap[mapIdx];

                                    if (
                                        pixelHeight > 0 &&
                                        pixelHeight >= topZ - LAYER_ACTIVATION_EPSILON
                                    ) {
                                        activePixels[(boxH - 1 - y) * boxW + x] = 1;
                                        activeCount++;
                                    }
                                }

                                pushLayerDetail(
                                    buildLayerIndex,
                                    'Selecting active pixels',
                                    progressInSpan(0, 0.35, (y + 1) / boxH)
                                );

                                if (performance.now() - lastYield > YIELD_MS) {
                                    await new Promise((r) => requestAnimationFrame(r));
                                    if (token !== buildTokenRef.current) return;
                                    lastYield = performance.now();
                                }
                            }

                            if (activeCount === 0) continue;

                            // Generate mesh for this layer
                            const generatedMesh = await (
                                buildSmoothMeshing ? generateSmoothMesh : generateGreedyMesh
                            )(activePixels, boxW, boxH, thickness, baseZ, pixelSize, heightScale, {
                                yieldIntervalMs: 8,
                                onProgress: meshProgressReporter(buildLayerIndex),
                            });
                            meshBuildMetrics.push({
                                layerIndex: i,
                                swatchIndex: swatchIdx,
                                activePixelCount: activeCount,
                                vertexCount: generatedMesh.positions.length / 3,
                                triangleCount: generatedMesh.indices.length / 3,
                                metrics: generatedMesh.metrics,
                            });

                            const geom = createFlatShadedGeometry(
                                generatedMesh.positions,
                                generatedMesh.indices,
                                {
                                    activePixels,
                                    width: boxW,
                                    height: boxH,
                                    pixelSize,
                                    topZ: (baseZ + thickness) * heightScale,
                                    compactHeightfield: !buildSmoothMeshing,
                                }
                            );
                            pushLayerDetail(buildLayerIndex, 'Preparing preview geometry', 0.96);
                            const mat = new THREE.MeshStandardMaterial({
                                color: colorHex,
                                side: THREE.FrontSide,
                                metalness: 0,
                                roughness: 0.7,
                                flatShading: true,
                            });

                            const mesh = new THREE.Mesh(geom, mat);
                            // Store layer Z range for preview slider
                            mesh.userData.baseZ = baseZ;
                            mesh.userData.topZ = topZ;
                            builtLayerMeshes[i] = mesh;
                            pushLayerDetail(buildLayerIndex, 'Layer mesh complete', 1);

                            if (performance.now() - lastYield > YIELD_MS) {
                                await new Promise((r) => requestAnimationFrame(r));
                                if (token !== buildTokenRef.current) return;
                                lastYield = performance.now();
                            }
                        }

                        for (const mesh of builtLayerMeshes) {
                            if (mesh) {
                                modelGroup.add(mesh);
                            }
                        }
                    }
                } else {
                    // === STANDARD MODE ===
                    // Prepare layers
                    const cumulativeHeights: number[] = [];
                    let running = 0;
                    colorOrder.forEach((fi, pos) => {
                        const h = colorSliceHeights[fi] || 0;
                        const eff = pos === 0 ? Math.max(h, slicerFirstLayerHeight) : h;
                        running += eff;
                        cumulativeHeights[pos] = running;
                    });

                    const layerIndexBySwatch = new Int32Array(swatches.length);
                    layerIndexBySwatch.fill(-1);
                    colorOrder.forEach((swatchIdx, pos) => {
                        if (swatchIdx >= 0 && swatchIdx < layerIndexBySwatch.length) {
                            layerIndexBySwatch[swatchIdx] = pos;
                        }
                    });

                    // Precompute each pixel's swatch layer position once.
                    // This avoids re-running nearest-color matching for every layer.
                    const pixelLayerPos = new Int16Array(boxW * boxH);
                    pixelLayerPos.fill(-1);

                    for (let y = 0; y < boxH; y++) {
                        const py = minY + y;
                        const rowOffset = py * fullW;
                        const flippedRowOffset = (boxH - 1 - y) * boxW;

                        for (let x = 0; x < boxW; x++) {
                            const px = minX + x;
                            const idx = (rowOffset + px) * 4;
                            const a = data[idx + 3];
                            if (a === 0) continue;

                            const sIdx = nearestSwatchIndex(
                                data[idx],
                                data[idx + 1],
                                data[idx + 2]
                            );
                            if (sIdx === -1) continue;

                            const layerPos = layerIndexBySwatch[sIdx];
                            pixelLayerPos[flippedRowOffset + x] = layerPos;
                        }

                        pushScanDetail('Reading image color layers', (y + 1) / boxH);
                        pushProgress(layeredBuildScanProgress(y, boxH, colorOrder.length));
                        if (performance.now() - lastYield > YIELD_MS) {
                            await new Promise((r) => requestAnimationFrame(r));
                            if (token !== buildTokenRef.current) return;
                            lastYield = performance.now();
                        }
                    }

                    // Build each layer once; smooth meshing does not run overhang repair passes.
                    const layerBuildOrder = Array.from(
                        { length: colorOrder.length },
                        (_, layerIndex) => layerIndex
                    );
                    const builtLayerMeshes: Array<THREE.Mesh | undefined> = new Array(
                        colorOrder.length
                    );

                    for (
                        let buildLayerIndex = 0;
                        buildLayerIndex < layerBuildOrder.length;
                        buildLayerIndex++
                    ) {
                        const i = layerBuildOrder[buildLayerIndex];
                        if (token !== buildTokenRef.current) return;

                        const swatchIdx = colorOrder[i];
                        if (!swatches[swatchIdx]) continue;
                        const colorHex = swatches[swatchIdx].hex;
                        const thickness =
                            i === 0
                                ? Math.max(
                                      colorSliceHeights[swatchIdx] || 0,
                                      slicerFirstLayerHeight
                                  )
                                : colorSliceHeights[swatchIdx] || 0;
                        if (thickness <= 0.0001) continue; // Skip empty layers

                        const baseZ = i === 0 ? 0 : cumulativeHeights[i - 1];
                        const topZ = baseZ + thickness * heightScale;

                        // Identify active pixels for this layer
                        // Pixel is active if its color index maps to a layer >= i
                        const activePixels = new Uint8Array(boxW * boxH);
                        let activeCount = 0;

                        for (let y = 0; y < boxH; y++) {
                            const rowOffset = y * boxW;
                            for (let x = 0; x < boxW; x++) {
                                const mapIdx = rowOffset + x;
                                if (pixelLayerPos[mapIdx] >= i) {
                                    activePixels[mapIdx] = 1;
                                    activeCount++;
                                }
                            }
                            pushLayerDetail(
                                buildLayerIndex,
                                'Selecting active pixels',
                                progressInSpan(0, 0.35, (y + 1) / boxH)
                            );
                            if (performance.now() - lastYield > YIELD_MS) {
                                await new Promise((r) => requestAnimationFrame(r));
                                if (token !== buildTokenRef.current) return;
                                lastYield = performance.now();
                            }
                        }

                        if (activeCount === 0) continue;

                        // Generate Optimized Greedy Mesh
                        const generatedMesh = await (
                            buildSmoothMeshing ? generateSmoothMesh : generateGreedyMesh
                        )(activePixels, boxW, boxH, thickness, baseZ, pixelSize, heightScale, {
                            yieldIntervalMs: 8,
                            onProgress: meshProgressReporter(buildLayerIndex),
                        });
                        meshBuildMetrics.push({
                            layerIndex: i,
                            swatchIndex: swatchIdx,
                            activePixelCount: activeCount,
                            vertexCount: generatedMesh.positions.length / 3,
                            triangleCount: generatedMesh.indices.length / 3,
                            metrics: generatedMesh.metrics,
                        });

                        const geom = createFlatShadedGeometry(
                            generatedMesh.positions,
                            generatedMesh.indices,
                            {
                                activePixels,
                                width: boxW,
                                height: boxH,
                                pixelSize,
                                topZ: (baseZ + thickness) * heightScale,
                                compactHeightfield: !buildSmoothMeshing,
                            }
                        );
                        pushLayerDetail(buildLayerIndex, 'Preparing preview geometry', 0.96);
                        const mat = new THREE.MeshStandardMaterial({
                            color: colorHex,
                            side: THREE.FrontSide,
                            metalness: 0,
                            roughness: 0.7,
                            flatShading: true,
                        });

                        // Note: generateGreedyMesh returns world-space coordinates (scaled by pixelSize/heightScale)
                        // so we do not need to apply scale/position to the mesh itself.
                        const mesh = new THREE.Mesh(geom, mat);
                        // Store layer Z range for preview slider
                        mesh.userData.baseZ = baseZ;
                        mesh.userData.topZ = topZ;
                        builtLayerMeshes[i] = mesh;
                        pushLayerDetail(buildLayerIndex, 'Layer mesh complete', 1);

                        if (performance.now() - lastYield > YIELD_MS) {
                            await new Promise((r) => requestAnimationFrame(r));
                            if (token !== buildTokenRef.current) return;
                            lastYield = performance.now();
                        }
                    }

                    for (const mesh of builtLayerMeshes) {
                        if (mesh) {
                            modelGroup.add(mesh);
                        }
                    }
                }

                if (token !== buildTokenRef.current) return;

                try {
                    (
                        window as unknown as { __KROMACUT_LAST_MESH?: THREE.Object3D }
                    ).__KROMACUT_LAST_MESH = modelGroup;
                } catch {
                    /* ignore */
                }

                // Calculate dimensions
                const box = new THREE.Box3().setFromObject(modelGroup);
                const maxDepth = box.max.z - box.min.z;
                const finalW = boxW;
                const finalH = boxH;
                const nextModelDimensions = {
                    width: finalW * pixelSize,
                    height: finalH * pixelSize,
                    depth: maxDepth,
                };
                setModelDimensions(nextModelDimensions);
                // Set max height for layer preview slider
                setMaxModelHeight(box.max.z);
                setPreviewMinHeight(0);
                setPreviewHeight(box.max.z); // Start at full height
                setHoveredSegment(null);
                updateE2EBuild({
                    status: 'complete',
                    startedAt: buildStartedAt,
                    completedAt: performance.now(),
                    elapsedMs: performance.now() - buildStartedAt,
                    imageWidth: fullW,
                    imageHeight: fullH,
                    cropWidth: finalW,
                    cropHeight: finalH,
                    ...collectMeshStats(modelGroup),
                    layerMetrics: meshBuildMetrics,
                    dimensions: nextModelDimensions,
                    settings: {
                        pixelSize,
                        layerHeight,
                        slicerFirstLayerHeight,
                        smoothMeshing: buildSmoothMeshing,
                        autoPaintEnabled,
                        enhancedColorMatch,
                        heightDithering,
                        flatPaint,
                    },
                });

                // Auto-frame
                try {
                    const camera = cameraRef.current;
                    const controls = controlsRef.current;
                    if (camera && controls) {
                        const sphere = new THREE.Sphere();
                        box.getBoundingSphere(sphere);
                        const dir = new THREE.Vector3(0.9, 0.8, 1).normalize();
                        if (camera instanceof THREE.PerspectiveCamera) {
                            const fov = (camera.fov * Math.PI) / 180;
                            const distance = sphere.radius / Math.sin(fov / 2);
                            const camPos = sphere.center
                                .clone()
                                .add(dir.multiplyScalar(distance * 1.35));
                            camera.position.copy(camPos);
                            controls.target.copy(sphere.center);
                            camera.near = Math.max(0.01, sphere.radius * 0.01);
                            camera.far = sphere.radius * 20;
                        } else if (camera instanceof THREE.OrthographicCamera) {
                            const distance = sphere.radius * 2.5;
                            const camPos = sphere.center
                                .clone()
                                .add(dir.multiplyScalar(distance));
                            camera.position.copy(camPos);
                            controls.target.copy(sphere.center);
                            camera.near = 0.01;
                            camera.far = sphere.radius * 20;
                            // Expand frustum to fit the sphere
                            const viewH = sphere.radius * 2.5;
                            const aspect = (camera.right - camera.left) / (camera.top - camera.bottom);
                            camera.top = viewH / 2;
                            camera.bottom = -viewH / 2;
                            camera.left = -(viewH * aspect) / 2;
                            camera.right = (viewH * aspect) / 2;
                        }
                        camera.updateProjectionMatrix();
                        controls.update();
                    }
                } catch {
                    /* ignore */
                }

                requestRender();
                pushProgress(1);
            };

            (async () => {
                const img = await loadImage();
                if (!img || token !== buildTokenRef.current) return;
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                // compute opaque bounding box
                const c = document.createElement('canvas');
                c.width = w;
                c.height = h;
                const cx = c.getContext('2d');
                if (!cx) return;
                cx.drawImage(img, 0, 0, w, h);
                const imgd = cx.getImageData(0, 0, w, h).data;
                let minX = w,
                    minY = h,
                    maxX = 0,
                    maxY = 0;
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const a = imgd[(y * w + x) * 4 + 3];
                        if (a > 0) {
                            if (x < minX) minX = x;
                            if (y < minY) minY = y;
                            if (x > maxX) maxX = x;
                            if (y > maxY) maxY = y;
                        }
                    }
                }
                if (maxX < minX || maxY < minY) {
                    minX = 0;
                    minY = 0;
                    maxX = w - 1;
                    maxY = h - 1;
                }
                const boxW = maxX - minX + 1;
                const boxH = maxY - minY + 1;
                const bbox = { minX, minY, boxW, boxH };

                if (token !== buildTokenRef.current) {
                    setIsBuilding(false);
                    return;
                }

                // Schedule final build
                await new Promise<void>((res) =>
                    requestIdle(async () => {
                        if (token !== buildTokenRef.current) {
                            res();
                            return;
                        }
                        if (pixelColumns) await buildPixelGeometry(img, bbox);
                        res();
                    })
                );
                if (token === buildTokenRef.current) {
                    setIsBuilding(false);
                    pushProgress(1);
                }
            })();
        }, 120);
    }, [
        imageSrc,
        baseSliceHeight,
        layerHeight,
        slicerFirstLayerHeight,
        colorSliceHeights,
        colorOrder,
        swatches,
        filamentSwatches,
        pixelSize,
        heightScale,
        stepped,
        pixelColumns,
        rebuildSignal,
        autoPaintEnabled,
        autoPaintTotalHeight,
        autoPaintFilamentOrder,
        enhancedColorMatch,
        heightDithering,
        ditherLineWidth,
        smoothMeshing,
        flatPaint,
        cameraRef,
        controlsRef,
        materialRef,
        modelGroupRef,
        requestRender,
    ]);

    const currentBuildOverlayStep =
        buildOverlayStep ?? getBuildOverlayStep(buildProgress, colorOrder.length, autoPaintEnabled);
    const previewHeightLabel =
        previewHeight !== null && previewMinHeight > 0.0001
            ? `${previewMinHeight.toFixed(2)} - ${previewHeight.toFixed(2)} mm`
            : `${(previewHeight ?? 0).toFixed(2)} mm`;
    const previewMinPercent = heightToPercent(previewMinHeight, maxModelHeight);
    const previewMaxPercent = heightToPercent(previewHeight ?? maxModelHeight, maxModelHeight);
    const previewSelectionLeft = Math.min(previewMinPercent, previewMaxPercent);
    const previewSelectionRight = Math.max(previewMinPercent, previewMaxPercent);
    const previewSelectionClip = `inset(0 ${sliderRightInsetPercentCss(
        previewSelectionRight
    )} 0 ${sliderCenterPercentCss(previewSelectionLeft)})`;

    return (
        <div className="w-full h-full relative" ref={mountRef}>
            {isBuilding && (
                <ProgressOverlay
                    title={activeBuildSmoothMeshing ? 'Generating smooth mesh' : 'Generating mesh'}
                    stepLabel={currentBuildOverlayStep.stepLabel}
                    stepIndex={currentBuildOverlayStep.stepIndex}
                    stepCount={currentBuildOverlayStep.stepCount}
                    stepProgress={currentBuildOverlayStep.stepProgress}
                    progress={buildProgress}
                />
            )}
            {modelDimensions && (
                <div
                    className="absolute top-2 left-2 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold z-10"
                    aria-hidden
                >
                    Model: {modelDimensions.width.toFixed(1)}×{modelDimensions.height.toFixed(1)}×
                    {modelDimensions.depth.toFixed(1)} mm
                </div>
            )}
            {/* Layer Preview Slider */}
            {!isBuilding && maxModelHeight > 0 && previewHeight !== null && (
                <div className="absolute bottom-2 left-4 right-4 bg-background/90 backdrop-blur-sm border border-border/50 rounded-md px-3 py-1.5 shadow-lg z-10">
                    <div className="flex items-center gap-2.5">
                        <Layers className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <div className="flex-1 space-y-0.5">
                            <div className="flex items-center justify-between text-[11px] leading-none">
                                <span className="text-muted-foreground font-medium">
                                    Layer Preview
                                </span>
                                <span className="text-foreground font-mono font-semibold">
                                    {previewHeightLabel}
                                </span>
                            </div>
                            <div className="relative pt-0.5">
                                {hoveredSegment && (
                                    <div
                                        className="pointer-events-none absolute -top-1.5 z-20 min-w-36 -translate-x-1/2 -translate-y-full rounded-md border border-border/70 bg-popover px-2.5 py-2 text-popover-foreground shadow-lg"
                                        style={{ left: `${hoveredSegment.xPercent}%` }}
                                    >
                                        <div className="text-xs font-semibold leading-tight">
                                            {hoveredSegment.segment.isBase
                                                ? 'Start Layer 1'
                                                : `Swap Layer ${hoveredSegment.segment.transitionLayer}`}
                                        </div>
                                        <div className="mt-1 text-[10px] text-muted-foreground">
                                            Height:{' '}
                                            {hoveredSegment.segment.startHeight.toFixed(2)} mm
                                        </div>
                                        <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] font-semibold">
                                            <span
                                                className="h-2.5 w-2.5 rounded-full border border-border/70 shadow-sm"
                                                style={{
                                                    backgroundColor: hoveredSegment.segment.color,
                                                }}
                                            />
                                            <span>{hoveredSegment.segment.color}</span>
                                        </div>
                                        <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-border/70 bg-popover" />
                                    </div>
                                )}
                                <SliderPrimitive.Root
                                    value={[previewMinHeight, previewHeight]}
                                    onValueChange={handlePreviewRangeChange}
                                    min={0}
                                    max={maxModelHeight}
                                    step={0.01}
                                    minStepsBetweenThumbs={0}
                                    className="relative flex h-4 w-full touch-none select-none items-center"
                                    data-testid="layer-preview-range"
                                >
                                    <SliderPrimitive.Track
                                        ref={previewTrackRef}
                                        className="relative h-1.5 w-full grow rounded-full bg-primary/15"
                                    >
                                        <div className="absolute inset-0 overflow-hidden rounded-full border border-border/40">
                                            {layerPreviewSegments.map((segment, idx) => {
                                                const left = heightToPercent(
                                                    segment.startHeight,
                                                    maxModelHeight
                                                );
                                                const right = heightToPercent(
                                                    segment.endHeight,
                                                    maxModelHeight
                                                );
                                                return (
                                                    <div
                                                        key={`${segment.color}-${idx}-${segment.startHeight}`}
                                                        data-testid="layer-preview-filament-segment"
                                                        className="absolute inset-y-0 cursor-help transition-[filter] hover:brightness-110"
                                                        style={{
                                                            left: sliderCenterPercentCss(left),
                                                            width: sliderSpanPercentCss(left, right),
                                                            backgroundColor: segment.color,
                                                            filter: 'grayscale(1)',
                                                            opacity: 0.45,
                                                        }}
                                                        title={`${
                                                            segment.isBase
                                                                ? 'Start'
                                                                : `Swap at layer ${segment.transitionLayer}`
                                                        }: ${segment.color} (${segment.startHeight.toFixed(
                                                            2
                                                        )} mm)`}
                                                        onPointerEnter={(event) =>
                                                            updateHoveredSegment(segment, event)
                                                        }
                                                        onPointerMove={(event) =>
                                                            updateHoveredSegment(segment, event)
                                                        }
                                                        onPointerLeave={() =>
                                                            setHoveredSegment(null)
                                                        }
                                                    />
                                                );
                                            })}
                                            <div
                                                className="pointer-events-none absolute inset-0"
                                                style={{ clipPath: previewSelectionClip }}
                                            >
                                                {layerPreviewSegments.map((segment, idx) => {
                                                    const left = heightToPercent(
                                                        segment.startHeight,
                                                        maxModelHeight
                                                    );
                                                    const right = heightToPercent(
                                                        segment.endHeight,
                                                        maxModelHeight
                                                    );
                                                    return (
                                                        <div
                                                            key={`visible-${segment.color}-${idx}-${segment.startHeight}`}
                                                            className="absolute inset-y-0"
                                                            style={{
                                                                left: sliderCenterPercentCss(left),
                                                                width: sliderSpanPercentCss(
                                                                    left,
                                                                    right
                                                                ),
                                                                backgroundColor: segment.color,
                                                            }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        {layerPreviewSegments.slice(1).map((segment, idx) => {
                                            const left = heightToPercent(
                                                segment.startHeight,
                                                maxModelHeight
                                            );
                                            return (
                                                <div
                                                    key={`marker-${segment.color}-${idx}-${segment.startHeight}`}
                                                    className="pointer-events-none absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-foreground/30"
                                                    style={{ left: sliderCenterPercentCss(left) }}
                                                >
                                                    <span
                                                        className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background shadow-sm"
                                                        style={{
                                                            backgroundColor: segment.color,
                                                            filter: 'grayscale(1)',
                                                            opacity: 0.55,
                                                        }}
                                                    />
                                                </div>
                                            );
                                        })}
                                        <div
                                            className="pointer-events-none absolute inset-0"
                                            style={{ clipPath: previewSelectionClip }}
                                        >
                                            {layerPreviewSegments.slice(1).map((segment, idx) => {
                                                const left = heightToPercent(
                                                    segment.startHeight,
                                                    maxModelHeight
                                                );
                                                return (
                                                    <div
                                                        key={`visible-marker-${segment.color}-${idx}-${segment.startHeight}`}
                                                        className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-foreground/40"
                                                        style={{
                                                            left: sliderCenterPercentCss(left),
                                                        }}
                                                    >
                                                        <span
                                                            className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background shadow-sm"
                                                            style={{
                                                                backgroundColor: segment.color,
                                                            }}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <SliderPrimitive.Range className="pointer-events-none absolute h-full rounded-full bg-transparent ring-1 ring-primary/70" />
                                    </SliderPrimitive.Track>
                                    <SliderPrimitive.Thumb
                                        aria-label="Preview bottom layer cutoff"
                                        className="block h-3.5 w-3.5 rounded-full border border-primary/70 bg-background shadow transition-colors hover:shadow-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    />
                                    <SliderPrimitive.Thumb
                                        aria-label="Preview top layer cutoff"
                                        className="block h-3.5 w-3.5 rounded-full border border-primary/70 bg-background shadow transition-colors hover:shadow-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    />
                                </SliderPrimitive.Root>
                            </div>
                            <div className="flex justify-between text-[8px] leading-none text-muted-foreground">
                                <span>Base (0)</span>
                                <span>Top ({maxModelHeight.toFixed(2)})</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
