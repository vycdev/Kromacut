import { useCallback } from 'react';
import { translate } from '../lib/i18n';
import type { RefObject } from 'react';
import type { CanvasPreviewHandle } from '../components/CanvasPreview';
import type { SwatchEntry } from './useSwatches';
import { clampProgress } from '../lib/progress';
import { decodeImage } from '../lib/decodeImage';
import { saveBlobToFile } from './saveBlobToFile';
import { openModelInSlicer, type SlicerApp } from '../lib/desktopSlicer';
import type * as THREE from 'three';

export interface UseAppHandlersParams {
    beginEdit: () => (() => boolean) | null;
    canvasPreviewRef: RefObject<CanvasPreviewHandle | null>;
    imageSrc?: string | null;
    invalidate: () => void;
    setImage: (url: string, push?: boolean) => void;
    setExportingSTL: (b: boolean) => void;
    setExportProgress: (n: number) => void;
    setExportStep?: (step: ExportProgressStep) => void;
    exportingSTL: boolean;
    /** A 3D build is starting or running, so the exported mesh may not match its settings. */
    threeDBuildBusy: boolean;
    /** Flat Paint and multi-head models only export correctly as 3MF. */
    stlUnavailable?: boolean;
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
    /** Called after a model export reaches its destination (not when a save is cancelled). */
    onModelExported?: () => void;
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

/** Where a finished 3MF goes: a saved file, or the desktop's default 3MF app. */
interface ThreeMFDestination {
    stepLabel: string;
    /** Resolves to null when the user cancels, such as closing the desktop save dialog. */
    deliver: (blob: Blob, fileName: string) => Promise<string | null>;
    failureMessage: string;
}

function exportFileName(extension: string) {
    const timestamp = new Date().toISOString().slice(0, 10);
    return `kromacut-${timestamp}.${extension}`;
}

export function useAppHandlers(params: UseAppHandlersParams) {
    const {
        beginEdit,
        canvasPreviewRef,
        imageSrc,
        invalidate,
        setImage,
        setExportingSTL,
        setExportProgress,
        setExportStep,
        exportingSTL,
        threeDBuildBusy,
        stlUnavailable = false,
        exportObjectToStlBlob,
        exportObjectTo3MFBlob,
        applyQuantize,
        swatches,
        onModelExported,
    } = params;

    const onExportImage = useCallback(async () => {
        if (!canvasPreviewRef.current) return;
        try {
            const blob = await canvasPreviewRef.current.exportImageBlob();
            if (!blob) {
                alert(translate('messages:files.noImage'));
                return;
            }
            await saveBlobToFile(blob, {
                defaultFileName: exportFileName('png'),
                extension: 'png',
                filterName: 'PNG image',
            });
        } catch (err) {
            console.warn('Image export failed', err);
            alert(translate('messages:files.imageFailed'));
        }
    }, [canvasPreviewRef]);

    const onExportStl = useCallback(async () => {
        if (exportingSTL || stlUnavailable) return;
        interface KromacutWindow extends Window {
            __KROMACUT_LAST_MESH?: THREE.Object3D;
        }
        // A Flat Paint or multi-head mesh can outlive its build snapshot briefly.
        const readStlMesh = () => {
            const mesh = (window as KromacutWindow).__KROMACUT_LAST_MESH;
            return mesh && !mesh.userData.kromacutStlUnavailable ? mesh : undefined;
        };
        const threeObject = readStlMesh();
        if (!threeObject || threeDBuildBusy) {
            alert(translate('messages:files.modelNotReady'));
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
        let exported = false;
        try {
            await waitForOverlayPaint();
            // A build may have replaced the mesh while the overlay painted.
            if (readStlMesh() !== threeObject) {
                alert(translate('messages:files.modelNotReady'));
                return;
            }
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
            const savedPath = await saveBlobToFile(blob, {
                defaultFileName: exportFileName('stl'),
                extension: 'stl',
                filterName: 'STL model',
            });
            exported = savedPath !== null;
        } catch (err) {
            console.warn('STL export failed', err);
            alert(translate('messages:files.stlFailed'));
        } finally {
            await keepOverlayVisibleSince(overlayStartedAt);
            setExportingSTL(false);
            setTimeout(() => {
                setExportProgress(0);
                setExportStep?.(DEFAULT_EXPORT_STEP);
            }, 300);
        }
        if (exported) onModelExported?.();
    }, [
        exportingSTL,
        threeDBuildBusy,
        stlUnavailable,
        exportObjectToStlBlob,
        setExportingSTL,
        setExportProgress,
        setExportStep,
        onModelExported,
    ]);

    const export3MF = useCallback(
        async (destination: ThreeMFDestination) => {
            if (exportingSTL) return;
            interface KromacutWindow extends Window {
                __KROMACUT_LAST_MESH?: THREE.Object3D;
            }
            const threeObject = (window as KromacutWindow).__KROMACUT_LAST_MESH;
            // Also covers exports that start later, such as after a slow slicer check.
            if (!threeObject || threeDBuildBusy) {
                alert(translate('messages:files.modelNotReady'));
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
            let delivering = false;
            let exported = false;
            try {
                await waitForOverlayPaint();
                let phase: 'geometry' | 'zip' = 'geometry';
                let lastGeometryStepPercent = -1;
                let lastZipLabelPercent = -1;
                const updateGeometryStep = (progress: number) => {
                    const stepPercent = Math.max(
                        0,
                        Math.min(100, Math.floor((progress / 0.8) * 100))
                    );
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
                const progressReporter = createExportProgressReporter(
                    setExportProgress,
                    (progress) => {
                        const nextPhase = progress >= 0.8 ? 'zip' : 'geometry';
                        if (nextPhase === 'geometry') {
                            updateGeometryStep(progress);
                            return;
                        }

                        if (phase !== 'zip') {
                            phase = nextPhase;
                            updateZipStep(0);
                        }
                    }
                );
                const blob = await exportObjectTo3MFBlob(threeObject, progressReporter, (meta) =>
                    updateZipStep(meta.percent)
                );
                setExportStep?.({
                    title: 'Exporting 3MF',
                    stepLabel: destination.stepLabel,
                    stepIndex: 3,
                    stepCount: 3,
                    stepProgress: 1,
                });
                setExportProgress(1);
                delivering = true;
                exported = (await destination.deliver(blob, exportFileName('3mf'))) !== null;
            } catch (err) {
                console.warn(
                    delivering ? `${destination.stepLabel} failed` : '3MF export failed',
                    err
                );
                alert(
                    translate(
                        delivering ? destination.failureMessage : 'messages:files.threeMfFailed'
                    )
                );
            } finally {
                await keepOverlayVisibleSince(overlayStartedAt);
                setExportingSTL(false);
                setTimeout(() => {
                    setExportProgress(0);
                    setExportStep?.(DEFAULT_EXPORT_STEP);
                }, 300);
            }
            if (exported) onModelExported?.();
        },
        [
            exportingSTL,
            threeDBuildBusy,
            exportObjectTo3MFBlob,
            setExportingSTL,
            setExportProgress,
            setExportStep,
            onModelExported,
        ]
    );

    const onExport3MF = useCallback(
        () =>
            export3MF({
                stepLabel: 'Saving 3MF file',
                deliver: (blob, fileName) =>
                    saveBlobToFile(blob, {
                        defaultFileName: fileName,
                        extension: '3mf',
                        filterName: '3MF model',
                    }),
                failureMessage: 'messages:files.threeMfFailed',
            }),
        [export3MF]
    );

    const onOpenInSlicer = useCallback(
        (slicer: SlicerApp | null) =>
            export3MF({
                stepLabel: 'Opening 3MF in slicer',
                deliver: (blob, fileName) => openModelInSlicer(blob, fileName, slicer),
                failureMessage: 'messages:files.slicerFailed',
            }),
        [export3MF]
    );

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
            const current = beginEdit();
            // Perform literal pixel replacement on the full-size image
            if (!current || !canvasPreviewRef.current || !imageSrc) return;
            let sourceUrl: string | null = null;
            try {
                const blob = await canvasPreviewRef.current.exportImageBlob();
                if (!blob || !current()) return;
                sourceUrl = URL.createObjectURL(blob);
                const img = await decodeImage(sourceUrl);
                if (!img || !current()) return;
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
                if (!outBlob || !current()) return;
                const url = URL.createObjectURL(outBlob);
                invalidate();
                setImage(url, true);
            } catch (err) {
                if (current()) console.warn('literal replace failed', err);
            } finally {
                if (sourceUrl) URL.revokeObjectURL(sourceUrl);
            }
        },
        [beginEdit, canvasPreviewRef, imageSrc, invalidate, setImage]
    );

    return {
        onExportImage,
        onExportStl,
        onExport3MF,
        onOpenInSlicer,
        onSwatchDelete,
        onSwatchApply,
    } as const;
}

export default useAppHandlers;
