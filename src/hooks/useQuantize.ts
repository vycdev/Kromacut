import {
    posterizeImageData,
    medianCutImageData,
    kmeansImageData,
    octreeImageData,
    wuImageData,
    enforcePaletteSizeAsync,
    mapImageToPalette,
} from '../lib/algorithms';
import { findBuiltInPalette } from '../data/palettes';
import { enabledColors } from '../lib/paletteManager';
import type { CustomPalette } from '../types';
import { rgbToHsl } from '../lib/color';
import {
    clampProgress,
    quantizeAlgorithmProgress,
    quantizePostProgress,
    quantizeSwatchProgress,
} from '../lib/progress';
import type { CanvasPreviewHandle } from '../components/CanvasPreview';

interface Params {
    algorithm: string;
    weight: number;
    finalColors: number;
    selectedPalette: string;
    customPalettes: CustomPalette[];
    imageSrc: string | null;
    setImage: (url: string | null, pushHistory?: boolean) => void;
    onImmediateSwatches: (
        colors: {
            hex: string;
            a: number;
            count: number;
            isTransparent?: boolean;
        }[]
    ) => void;
    onProgress?: (value: number) => void;
    onStage?: (stage: 'load' | 'algorithm' | 'post' | 'swatches' | 'final') => void;
    onStepChange?: (step: {
        stepIndex: number;
        stepCount: number;
        label: string;
        stepProgress?: number;
    }) => void;
}

const QUANTIZE_STEP_COUNT = 5;

function quantizeAlgorithmLabel(algorithm: string) {
    if (algorithm === 'median-cut') return 'Running median cut quantizer';
    if (algorithm === 'kmeans') return 'Running k-means quantizer';
    if (algorithm === 'octree') return 'Running octree quantizer';
    if (algorithm === 'wu') return 'Running Wu quantizer';
    if (algorithm === 'none') return 'Preparing source colors';
    return 'Posterizing colors';
}

function quantizePostLabel(
    selectedPalette: string,
    finalColors: number,
    options?: {
        overridePalette?: string[];
        overrideFinalColors?: number;
    }
) {
    if (options?.overridePalette && options.overridePalette.length > 0) {
        return 'Mapping to override palette';
    }

    if (selectedPalette && selectedPalette !== 'auto') {
        return 'Mapping to selected palette';
    }

    return `Reducing palette to ${options?.overrideFinalColors ?? finalColors} colors`;
}

export function useQuantize({
    algorithm,
    weight,
    finalColors,
    selectedPalette,
    customPalettes,
    imageSrc,
    setImage,
    onImmediateSwatches,
    onProgress,
    onStage,
    onStepChange,
}: Params) {
    const applyQuantize = async (
        canvasPreviewRef: React.RefObject<CanvasPreviewHandle | null>,
        options?: {
            overridePalette?: string[];
            overrideFinalColors?: number;
        }
    ) => {
        if (!canvasPreviewRef.current || !imageSrc) return;
        const bump = (value: number) => {
            onProgress?.(clampProgress(value));
        };
        const reportStep = (stepIndex: number, label: string, stepProgress = 0) => {
            onStepChange?.({
                stepIndex,
                stepCount: QUANTIZE_STEP_COUNT,
                label,
                stepProgress: clampProgress(stepProgress),
            });
        };
        // Yield to the event loop so the browser can paint the progress bar.
        // setTimeout(0) schedules on the macrotask queue, guaranteeing a render
        // opportunity between heavy synchronous blocks.
        const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));
        bump(0.01);
        onStage?.('load');
        reportStep(1, 'Loading image data', 0);
        const blob = await canvasPreviewRef.current.exportImageBlob();
        if (!blob) return;
        reportStep(1, 'Loading image data', 0.2);
        bump(0.02);
        const img = await new Promise<HTMLImageElement | null>((resolve) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => resolve(null);
            i.src = URL.createObjectURL(blob);
        });
        if (!img) return;
        reportStep(1, 'Loading image data', 0.4);
        bump(0.04);
        try {
            if (typeof img.decode === 'function') {
                await img.decode();
            }
        } catch {
            // ignore decode errors; onload already fired
        }
        reportStep(1, 'Loading image data', 0.6);
        bump(0.06);
        await yieldFrame();

        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        reportStep(1, 'Loading image data', 1);
        bump(0.1);
        await yieldFrame();
        // helper to finalize alpha after postprocessing
        const finalizeAlpha = (imgd: ImageData) => {
            // Any partially transparent (0<alpha<255) pixel becomes fully opaque
            const dd = imgd.data;
            for (let i = 0; i < dd.length; i += 4) {
                const a = dd[i + 3];
                if (a > 0 && a < 255) dd[i + 3] = 255;
            }
        };
        // Algorithm progress maps from 0.10 to 0.65.
        // The algorithm functions now accept { onProgress } and yield internally.
        const algorithmLabel = quantizeAlgorithmLabel(algorithm);
        const algoEnd = quantizeAlgorithmProgress(1);
        const algoProgress = (f: number) => {
            reportStep(2, algorithmLabel, f);
            bump(quantizeAlgorithmProgress(f));
        };
        onStage?.('algorithm');
        reportStep(2, algorithmLabel, 0);
        if (algorithm === 'median-cut')
            await medianCutImageData(data, weight, { onProgress: algoProgress });
        else if (algorithm === 'kmeans')
            await kmeansImageData(data, weight, { onProgress: algoProgress });
        else if (algorithm === 'octree')
            await octreeImageData(data, weight, { onProgress: algoProgress });
        else if (algorithm === 'wu') await wuImageData(data, weight, { onProgress: algoProgress });
        else if (algorithm === 'none') {
            // no algorithm pass, leave data as-is for postprocessing
        } else await posterizeImageData(data, weight, { onProgress: algoProgress });
        reportStep(2, algorithmLabel, 1);
        bump(algoEnd);
        await yieldFrame();

        // put algorithm result (or original) into canvas
        onStage?.('post');
        ctx.putImageData(data, 0, 0);
        bump(0.68);
        await yieldFrame();
        // postprocessing: if an override palette is provided use it; otherwise
        // fall back to selectedPalette (named palettes) or auto (enforce finalColors)
        const overridePalette = options?.overridePalette;
        const overrideFinal = options?.overrideFinalColors;
        const postLabel = quantizePostLabel(selectedPalette, finalColors, options);
        const postEnd = quantizePostProgress(1);
        const postProgress = (f: number) => {
            reportStep(3, postLabel, f);
            bump(quantizePostProgress(f));
        };
        reportStep(3, postLabel, 0);
        if (overridePalette && overridePalette.length > 0) {
            await mapImageToPalette(data, overridePalette, { onProgress: postProgress });
            ctx.putImageData(data, 0, 0);
        } else if (selectedPalette && selectedPalette !== 'auto') {
            // Search built-in palettes first, then custom palettes (enabled colors only)
            const builtIn = findBuiltInPalette(selectedPalette);
            const custom = customPalettes.find((p) => p.id === selectedPalette);
            const palColors = builtIn?.colors ?? (custom ? enabledColors(custom) : undefined);
            if (palColors && palColors.length > 0) {
                await mapImageToPalette(data, palColors, { onProgress: postProgress });
                ctx.putImageData(data, 0, 0);
            }
        } else {
            // auto: reduce to finalColors (or overridden final) via enforcePaletteSize
            await enforcePaletteSizeAsync(data, overrideFinal ?? finalColors, postProgress);
            ctx.putImageData(data, 0, 0);
        }
        reportStep(3, postLabel, 1);
        bump(postEnd);
        await yieldFrame();
        // Normalize any partial alpha AFTER post processing so uniqueness isn't skewed
        finalizeAlpha(data);
        ctx.putImageData(data, 0, 0);
        bump(0.88);
        await yieldFrame();
        // diagnostic: log final counts and what was applied

        // immediate swatches
        try {
            onStage?.('swatches');
            const swatchLabel = 'Collecting final swatches';
            reportStep(4, swatchLabel, 0);
            const cmap = new Map<number, number>();
            let transparentCount = 0;
            const dd = data.data;
            const SWATCH_CAP = 2 ** 14;
            const total = dd.length / 4;
            for (let i = 0; i < dd.length; i += 4) {
                if ((i / 4) % 10000 === 0) {
                    const fraction = (i / 4) / total;
                    reportStep(4, swatchLabel, fraction);
                    bump(quantizeSwatchProgress(i / 4, total));
                }
                if (dd[i + 3] === 0) {
                    transparentCount++;
                    continue;
                } // track transparent separately
                const k = (dd[i] << 16) | (dd[i + 1] << 8) | dd[i + 2];
                cmap.set(k, (cmap.get(k) || 0) + 1);
            }
            const topLocal = Array.from(cmap.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, Math.min(cmap.size, SWATCH_CAP))
                .map((entry) => {
                    const key = entry[0];
                    const r = (key >> 16) & 0xff;
                    const g = (key >> 8) & 0xff;
                    const b = key & 0xff;
                    const hex =
                        '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
                    return { hex, hsl: rgbToHsl(r, g, b) };
                });
            topLocal.sort((a, b) => {
                if (a.hsl.h !== b.hsl.h) return a.hsl.h - b.hsl.h;
                if (a.hsl.s !== b.hsl.s) return b.hsl.s - a.hsl.s;
                return b.hsl.l - a.hsl.l;
            });
            const structured = topLocal.map((t) => {
                const num = parseInt(t.hex.slice(1), 16);
                const cnt = cmap.get(num) || 0;
                return { hex: t.hex, a: 255, count: cnt, isTransparent: false };
            });
            if (transparentCount > 0) {
                structured.push({
                    hex: '#000000',
                    a: 0,
                    count: transparentCount,
                    isTransparent: true,
                });
            }
            onImmediateSwatches(structured);
            reportStep(4, swatchLabel, 1);
        } catch (err) {
            console.warn('immediate swatches failed', err);
        }
        bump(0.98);
        onStage?.('final');
        reportStep(5, 'Encoding processed image', 0);
        const outBlob = await new Promise<Blob | null>((res) =>
            c.toBlob((b) => res(b), 'image/png')
        );
        if (!outBlob) return;
        reportStep(5, 'Encoding processed image', 1);
        bump(1);
        const url = URL.createObjectURL(outBlob);
        setImage(url, true);
    };

    return { applyQuantize };
}
