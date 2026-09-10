import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { CanvasPreviewHandle } from '../components/CanvasPreview';
import type { SwatchEntry } from './useSwatches';
import { clampProgress } from '../lib/progress';
import { saveBlobToFile } from './saveBlobToFile';
import type * as THREE from 'three';

export interface UseAppHandlersParams {
    canvasPreviewRef: RefObject<CanvasPreviewHandle | null>;
    imageSrc?: string | null;
    invalidate: () => void;
    setImage: (url: string, push?: boolean) => void;
    setExportingSTL: (b: boolean) => void;
    setExportProgress: (n: number) => void;
    setExportStep?: (step: ExportProgressStep) => void;
    exportingSTL: boolean;
    exportObjectToStlBlob: (
        object: THREE.Object3D,
        onProgress?: (p: number) => void
    ) => Promise<Blob>;
    exportObjectTo3MFBlob: (
        object: THREE.Object3D,
        onProgress?: (p: number) => void,
        onZipProgress?: (progress: { percent: number; currentFile?: string | null }) => void
    ) => Promise<Blob>;
    applyQuantize: (
        canvasRef: RefObject<CanvasPreviewHandle | null>,
        options?: { overridePalette?: string[]; overrideFinalColors?: number }
    ) => Promise<void>;
    swatches: SwatchEntry[];
}

export interface ExportProgressStep {
    title: string;
    stepLabel: string;
    stepIndex: number;
    stepCount: number;
    stepProgress?: number;
}

const DEFAULT_EXPORT_STEP: ExportProgressStep = {
    title: 'Exporting model',
    stepLabel: 'Preparing export',
    stepIndex: 1,
    stepCount: 1,
};

function createExportProgressReporter(
    setExportProgress: (n: number) => void,
    onSample?: (progress: number) => void
) {
    let lastProgressUpdate = 0;

    return (progress: number) => {
        const clamped = clampProgress(progress);
        const now = performance.now();
        onSample?.(clamped);

        if (clamped >= 1 || now - lastProgressUpdate >= 250) {
            lastProgressUpdate = now;
            setExportProgress(clamped);
        }
    };
}

function nextFrame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForOverlayPaint() {
    await nextFrame();
    await nextFrame();
}

async function keepOverlayVisibleSince(startedAt: number, minMs = 300) {
    const remainingMs = minMs - (performance.now() - startedAt);
    if (remainingMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingMs));
    }
}

function compressionStepLabel(percent: number) {
    const roundedPercent = Math.max(0, Math.min(100, Math.floor(percent)));
    if (roundedPercent <= 0) return 'Starting 3MF package compression';
    if (roundedPercent >= 100) return 'Finalizing compressed 3MF package';
    return 'Compressing 3MF package';
}

function exportFileName(extension: string) {
    const timestamp = new Date().toISOString().slice(0, 10);
    return `kromacut-${timestamp}.${extension}`;
}

export function useAppHandlers(params: UseAppHandlersParams) {
    const {
        canvasPreviewRef,
        imageSrc,
        invalidate,
        setImage,
        setExportingSTL,
        setExportProgress,
        setExportStep,
        exportingSTL,
        exportObjectToStlBlob,
        exportObjectTo3MFBlob,
        applyQuantize,
        swatches,
    } = params;

    const onExportImage = useCallback(async () => {
        if (!canvasPreviewRef.current) return;
        try {
            const blob = await canvasPreviewRef.current.exportImageBlob();
            if (!blob) {
                alert('No image available to download');
                return;
            }
            await saveBlobToFile(blob, {
                defaultFileName: exportFileName('png'),
                extension: 'png',
                filterName: 'PNG image',
            });
        } catch (err) {
            console.warn('Image export failed', err);
            alert('Image export failed. See console for details.');
        }
    }, [canvasPreviewRef]);

    const onExportStl = useCallback(async () => {
        if (exportingSTL) return;
        interface KromacutWindow extends Window {
            __KROMACUT_LAST_MESH?: THREE.Object3D;
        }
        const threeObject = (window as KromacutWindow).__KROMACUT_LAST_MESH;
        if (!threeObject) {
            alert('3D model not ready yet');
            return;
        }
        setExportingSTL(true);
        setExportStep?.({
            title: 'Exporting STL',
            stepLabel: 'Writing STL triangles',
            stepIndex: 1,
            stepCount: 2,
            stepProgress: 0,
        });
        setExportProgress(0);
        const overlayStartedAt = performance.now();
        try {
            await waitForOverlayPaint();
            const blob = await exportObjectToStlBlob(
                threeObject,
                createExportProgressReporter(setExportProgress, (progress) => {
                    setExportStep?.({
                        title: 'Exporting STL',
                        stepLabel: 'Writing STL triangles',
                        stepIndex: 1,
                        stepCount: 2,
                        stepProgress: progress,
                    });
                })
            );
            setExportStep?.({
                title: 'Exporting STL',
                stepLabel: 'Saving STL file',
                stepIndex: 2,
                stepCount: 2,
                stepProgress: 1,
            });
            setExportProgress(1);
            await saveBlobToFile(blob, {
                defaultFileName: exportFileName('stl'),
                extension: 'stl',
                filterName: 'STL model',
            });
        } catch (err) {
            console.warn('STL export failed', err);
            alert('STL export failed. See console for details.');
        } finally {
            await keepOverlayVisibleSince(overlayStartedAt);
            setExportingSTL(false);
            setTimeout(() => {
                setExportProgress(0);
                setExportStep?.(DEFAULT_EXPORT_STEP);
            }, 300);
        }
    }, [exportingSTL, exportObjectToStlBlob, setExportingSTL, setExportProgress, setExportStep]);

    const onExport3MF = useCallback(async () => {
        if (exportingSTL) return;
        interface KromacutWindow extends Window {
            __KROMACUT_LAST_MESH?: THREE.Object3D;
        }
        const threeObject = (window as KromacutWindow).__KROMACUT_LAST_MESH;
        if (!threeObject) {
            alert('3D model not ready yet');
            return;
        }
        setExportingSTL(true);
        setExportStep?.({
            title: 'Exporting 3MF',
            stepLabel: 'Writing 3MF geometry',
            stepIndex: 1,
            stepCount: 3,
            stepProgress: 0,
        });
        setExportProgress(0);
        const overlayStartedAt = performance.now();
        try {
            await waitForOverlayPaint();
            let phase: 'geometry' | 'zip' = 'geometry';
            let lastGeometryStepPercent = -1;
            let lastZipLabelPercent = -1;
            const updateGeometryStep = (progress: number) => {
                const stepPercent = Math.max(0, Math.min(100, Math.floor((progress / 0.8) * 100)));
                if (
                    stepPercent !== 0 &&
                    stepPercent !== 100 &&
                    stepPercent < lastGeometryStepPercent + 5
                ) {
                    return;
                }

                lastGeometryStepPercent = stepPercent;
                setExportStep?.({
                    title: 'Exporting 3MF',
                    stepLabel: 'Writing 3MF geometry',
                    stepIndex: 1,
                    stepCount: 3,
                    stepProgress: stepPercent / 100,
                });
            };
            const updateZipStep = (percent: number) => {
                const roundedPercent = Math.max(0, Math.min(100, Math.floor(percent)));
                if (
                    roundedPercent !== 0 &&
                    roundedPercent !== 100 &&
                    roundedPercent < lastZipLabelPercent + 5
                ) {
                    return;
                }

                lastZipLabelPercent = roundedPercent;
                setExportStep?.({
                    title: 'Exporting 3MF',
                    stepLabel: compressionStepLabel(roundedPercent),
                    stepIndex: 2,
                    stepCount: 3,
                    stepProgress: roundedPercent / 100,
                });
            };
            const progressReporter = createExportProgressReporter(setExportProgress, (progress) => {
                const nextPhase = progress >= 0.8 ? 'zip' : 'geometry';
                if (nextPhase === 'geometry') {
                    updateGeometryStep(progress);
                    return;
                }

                if (phase !== 'zip') {
                    phase = nextPhase;
                    updateZipStep(0);
                }
            });
            const blob = await exportObjectTo3MFBlob(
                threeObject,
                progressReporter,
                (meta) => updateZipStep(meta.percent)
            );
            setExportStep?.({
                title: 'Exporting 3MF',
                stepLabel: 'Saving 3MF file',
                stepIndex: 3,
                stepCount: 3,
                stepProgress: 1,
            });
            setExportProgress(1);
            await saveBlobToFile(blob, {
                defaultFileName: exportFileName('3mf'),
                extension: '3mf',
                filterName: '3MF model',
            });
        } catch (err) {
            console.warn('3MF export failed', err);
            alert('3MF export failed. See console for details.');
        } finally {
            await keepOverlayVisibleSince(overlayStartedAt);
            setExportingSTL(false);
            setTimeout(() => {
                setExportProgress(0);
                setExportStep?.(DEFAULT_EXPORT_STEP);
            }, 300);
        }
    }, [exportingSTL, exportObjectTo3MFBlob, setExportingSTL, setExportProgress, setExportStep]);

    const onSwatchDelete = useCallback(
        async (deleted: SwatchEntry) => {
            // Build override palette from current swatches excluding the deleted one
            const remaining = swatches.filter((s) => !(s.hex === deleted.hex && s.a === deleted.a));
            const palette = remaining.filter((s) => s.a !== 0).map((s) => s.hex);
            // target is number of image colors - 1 (clamped to at least 2)
            const target = Math.max(2, palette.length);
            // applyQuantize with override palette and override final colors
            try {
                await applyQuantize(canvasPreviewRef, {
                    overridePalette: palette,
                    overrideFinalColors: target,
                });
            } catch (err) {
                console.warn('applyQuantize failed for swatch delete', err);
            }
        },
        [swatches, applyQuantize, canvasPreviewRef]
    );

    const onSwatchApply = useCallback(
        async (original: SwatchEntry, newHex: string) => {
            // Perform literal pixel replacement on the full-size image
            if (!canvasPreviewRef.current || !imageSrc) return;
            try {
                const blob = await canvasPreviewRef.current.exportImageBlob();
                if (!blob) return;
                const img = await new Promise<HTMLImageElement | null>((res) => {
                    const i = new Image();
                    i.onload = () => res(i);
                    i.onerror = () => res(null);
                    i.src = URL.createObjectURL(blob);
                });
                if (!img) return;
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                const c = document.createElement('canvas');
                c.width = w;
                c.height = h;
                const ctx = c.getContext('2d');
                if (!ctx) return;
                ctx.drawImage(img, 0, 0, w, h);
                const data = ctx.getImageData(0, 0, w, h);
                const dd = data.data;
                const parseHex = (s: string) => {
                    const raw = s.replace(/^#/, '');
                    const r = Number.parseInt(raw.slice(0, 2), 16);
                    const g = Number.parseInt(raw.slice(2, 4), 16);
                    const b = Number.parseInt(raw.slice(4, 6), 16);
                    const a = raw.length >= 8 ? Number.parseInt(raw.slice(6, 8), 16) : 255;
                    return [
                        Number.isNaN(r) ? 0 : r,
                        Number.isNaN(g) ? 0 : g,
                        Number.isNaN(b) ? 0 : b,
                        Number.isNaN(a) ? 255 : a,
                    ] as [number, number, number, number];
                };
                const [r1, g1, b1] = parseHex(original.hex);
                const [r2, g2, b2, newA] = parseHex(newHex);
                // Apply the new alpha when replacing pixels. If newHex had no alpha, newA === 255.
                if (original.a === 0) {
                    // Replace fully transparent pixels.
                    for (let i = 0; i < dd.length; i += 4) {
                        if (dd[i + 3] === 0) {
                            if (newA === 0) {
                                // canonical transparent representation: black + alpha 0
                                dd[i] = 0;
                                dd[i + 1] = 0;
                                dd[i + 2] = 0;
                                dd[i + 3] = 0;
                            } else {
                                dd[i] = r2;
                                dd[i + 1] = g2;
                                dd[i + 2] = b2;
                                dd[i + 3] = newA;
                            }
                        }
                    }
                } else {
                    // Replace pixels that match the original RGB and original alpha exactly
                    const origA = original.a;
                    for (let i = 0; i < dd.length; i += 4) {
                        if (dd[i + 3] !== origA) continue;
                        if (dd[i] === r1 && dd[i + 1] === g1 && dd[i + 2] === b1) {
                            if (newA === 0) {
                                // set canonical transparent black
                                dd[i] = 0;
                                dd[i + 1] = 0;
                                dd[i + 2] = 0;
                                dd[i + 3] = 0;
                            } else {
                                dd[i] = r2;
                                dd[i + 1] = g2;
                                dd[i + 2] = b2;
                                dd[i + 3] = newA;
                            }
                        }
                    }
                }
                ctx.putImageData(data, 0, 0);
                const outBlob = await new Promise<Blob | null>((res) =>
                    c.toBlob((b) => res(b), 'image/png')
                );
                if (!outBlob) return;
                const url = URL.createObjectURL(outBlob);
                invalidate();
                setImage(url, true);
            } catch (err) {
                console.warn('literal replace failed', err);
            }
        },
        [canvasPreviewRef, imageSrc, invalidate, setImage]
    );

    return {
        onExportImage,
        onExportStl,
        onExport3MF,
        onSwatchDelete,
        onSwatchApply,
    } as const;
}

export default useAppHandlers;
