import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { CanvasPreviewHandle } from '../components/CanvasPreview';
import type { SwatchEntry } from './useSwatches';
import type * as THREE from 'three';

export interface UseAppHandlersParams {
    canvasPreviewRef: RefObject<CanvasPreviewHandle | null>;
    imageSrc?: string | null;
    invalidate: () => void;
    setImage: (url: string, push?: boolean) => void;
    setExportingSTL: (b: boolean) => void;
    setExportProgress: (n: number) => void;
    exportingSTL: boolean;
    exportMeshToStlBlob: (mesh: THREE.Mesh, onProgress?: (p: number) => void) => Promise<Blob>;
    applyQuantize: (
        canvasRef: RefObject<CanvasPreviewHandle | null>,
        options?: { overridePalette?: string[]; overrideFinalColors?: number }
    ) => Promise<void>;
    swatches: SwatchEntry[];
}

export function useAppHandlers(params: UseAppHandlersParams) {
    const {
        canvasPreviewRef,
        imageSrc,
        invalidate,
        setImage,
        setExportingSTL,
        setExportProgress,
        exportingSTL,
        exportMeshToStlBlob,
        applyQuantize,
        swatches,
    } = params;

    const onExportImage = useCallback(async () => {
        if (!canvasPreviewRef.current) return;
        const blob = await canvasPreviewRef.current.exportImageBlob();
        if (!blob) {
            alert('No image available to download');
            return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'image.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }, [canvasPreviewRef]);

    const onExportStl = useCallback(async () => {
        if (exportingSTL) return;
        interface StrataWindow extends Window {
            __STRATA_LAST_MESH?: THREE.Mesh;
        }
        const threeMesh = (window as StrataWindow).__STRATA_LAST_MESH;
        if (!threeMesh) {
            alert('3D mesh not ready yet');
            return;
        }
        setExportingSTL(true);
        setExportProgress(0);
        try {
            const blob = await exportMeshToStlBlob(threeMesh, (p) => setExportProgress(p));
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'model.stl';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.warn('STL export failed', err);
            alert('STL export failed. See console for details.');
        } finally {
            setExportingSTL(false);
            setTimeout(() => setExportProgress(0), 300);
        }
    }, [exportingSTL, exportMeshToStlBlob, setExportingSTL, setExportProgress]);

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
        onSwatchDelete,
        onSwatchApply,
    } as const;
}

export default useAppHandlers;
