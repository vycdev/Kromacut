import React, { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { CollapsibleCard, DirtyDot } from '@/components/CollapsibleCard';
import { RotateCcw, Check, Loader } from 'lucide-react';
import type { CanvasPreviewHandle } from './CanvasPreview';
import { deditherRowProgress } from '../lib/progress';

interface Props {
    canvasRef: React.RefObject<CanvasPreviewHandle | null>;
    onApplyResult: (blobUrl: string) => void;
    onWorkingChange?: (working: boolean) => void;
    onProgress?: (value: number) => void;
    onStepChange?: (step: {
        stepIndex: number;
        stepCount: number;
        label: string;
        stepProgress?: number;
    }) => void;
}

export const DeditherPanel: React.FC<Props> = ({
    canvasRef,
    onApplyResult,
    onWorkingChange,
    onProgress,
    onStepChange,
}) => {
    const [weight, setWeight] = useState<number>(4);
    const [passes, setPasses] = useState<number>(1);
    const [working, setWorking] = useState(false);
    const DEFAULT_WEIGHT = 4;
    const DEFAULT_PASSES = 1;

    const handleApply = useCallback(async () => {
        if (!canvasRef.current) return;
        const totalPasses = Math.max(1, Math.min(10, Math.round(passes)));
        setWorking(true);
        onWorkingChange?.(true);
        onStepChange?.({
            stepIndex: 1,
            stepCount: totalPasses,
            label: 'Dedithering pass 1',
            stepProgress: 0,
        });
        onProgress?.(0.01);
        await new Promise((r) => requestAnimationFrame(r));
        try {
            // prefer adjusted image if available
            const blob = await canvasRef.current.exportAdjustedImageBlob?.();
            if (!blob) return;
            const img = await new Promise<HTMLImageElement | null>((res) => {
                const i = new Image();
                i.onload = () => res(i);
                i.onerror = () => res(null);
                i.src = URL.createObjectURL(blob);
            });
            if (!img) return;
            onProgress?.(0.06);

            const w = img.naturalWidth;
            const h = img.naturalHeight;
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, 0, 0, w, h);
            const data = ctx.getImageData(0, 0, w, h);
            let current = new Uint8ClampedArray(data.data);
            onProgress?.(0.1);

            // neighbor offsets for 3x3 window excluding center
            const neigh: Array<[number, number]> = [
                [-1, -1],
                [0, -1],
                [1, -1],
                [-1, 0],
                /* center */ [1, 0],
                [-1, 1],
                [0, 1],
                [1, 1],
            ];

            const YIELD_MS = 12;
            let lastYield = performance.now();
            const totalRows = Math.max(1, totalPasses * h);
            let processedRows = 0;

            for (let pass = 0; pass < totalPasses; pass++) {
                onStepChange?.({
                    stepIndex: pass + 1,
                    stepCount: totalPasses,
                    label: `Dedithering pass ${pass + 1}`,
                    stepProgress: 0,
                });
                const out = new Uint8ClampedArray(current);
                // iterate pixels
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const idx = (y * w + x) * 4;
                        const r = current[idx],
                            g = current[idx + 1],
                            b = current[idx + 2],
                            a = current[idx + 3];

                        // count same-color neighbors
                        let sameCount = 0;
                        const counts = new Map<number, number>();
                        for (const [dx, dy] of neigh) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                            const nidx = (ny * w + nx) * 4;
                            const nr = current[nidx],
                                ng = current[nidx + 1],
                                nb = current[nidx + 2],
                                na = current[nidx + 3];
                            if (nr === r && ng === g && nb === b && na === a) {
                                sameCount++;
                            } else {
                                // candidate color key (pack rgba into 32-bit int)
                                const key =
                                    ((nr & 0xff) << 24) |
                                    ((ng & 0xff) << 16) |
                                    ((nb & 0xff) << 8) |
                                    (na & 0xff);
                                counts.set(key, (counts.get(key) || 0) + 1);
                            }
                        }

                        if (sameCount >= weight) {
                            // keep original
                            continue;
                        }

                        // pick most frequent candidate color (excluding same as itself)
                        if (counts.size === 0) {
                            // nothing to choose
                            continue;
                        }
                        // find max count
                        let max = 0;
                        const top: number[] = [];
                        counts.forEach((v, k) => {
                            if (v > max) {
                                max = v;
                                top.length = 0;
                                top.push(k);
                            } else if (v === max) {
                                top.push(k);
                            }
                        });
                        // pick random among top
                        const pick = top[Math.floor(Math.random() * top.length)];
                        const nr = (pick >>> 24) & 0xff;
                        const ng = (pick >>> 16) & 0xff;
                        const nb = (pick >>> 8) & 0xff;
                        const na = pick & 0xff;
                        out[idx] = nr;
                        out[idx + 1] = ng;
                        out[idx + 2] = nb;
                        out[idx + 3] = na;
                    }
                    if (performance.now() - lastYield > YIELD_MS) {
                        await new Promise((r) => requestAnimationFrame(r));
                        lastYield = performance.now();
                    }
                    processedRows++;
                    if (y % 16 === 0) {
                        onStepChange?.({
                            stepIndex: pass + 1,
                            stepCount: totalPasses,
                            label: `Dedithering pass ${pass + 1}`,
                            stepProgress: (y + 1) / Math.max(1, h),
                        });
                        onProgress?.(deditherRowProgress(processedRows, totalRows));
                    }
                }
                current = out;
                if (performance.now() - lastYield > YIELD_MS) {
                    await new Promise((r) => requestAnimationFrame(r));
                    lastYield = performance.now();
                }
                onStepChange?.({
                    stepIndex: pass + 1,
                    stepCount: totalPasses,
                    label: `Dedithering pass ${pass + 1}`,
                    stepProgress: 1,
                });
                onProgress?.(deditherRowProgress(processedRows, totalRows));
            }

            const outData = new ImageData(current, w, h);
            ctx.putImageData(outData, 0, 0);
            onProgress?.(0.95);
            const outBlob = await new Promise<Blob | null>((res) =>
                c.toBlob((b) => res(b), 'image/png')
            );
            if (!outBlob) return;
            onProgress?.(1);
            const url = URL.createObjectURL(outBlob);
            onApplyResult(url);
        } catch (err) {
            console.warn('Dedither failed', err);
        } finally {
            setWorking(false);
            onWorkingChange?.(false);
        }
    }, [canvasRef, weight, passes, onApplyResult, onWorkingChange, onProgress, onStepChange]);

    const allDefault = weight === DEFAULT_WEIGHT && passes === DEFAULT_PASSES;

    const handleResetAll = useCallback(() => {
        setWeight(DEFAULT_WEIGHT);
        setPasses(DEFAULT_PASSES);
    }, []);

    return (
        <CollapsibleCard
            id="dedither"
            title="Dedither"
            subtitle="Smooth dithered patterns"
            collapsedSummary={
                working ? (
                    <Loader
                        className="w-4 h-4 animate-spin text-muted-foreground"
                        aria-label="Applying dedither"
                    />
                ) : !allDefault ? (
                    <DirtyDot title="Dedither settings modified" />
                ) : undefined
            }
            actions={
                <button
                    type="button"
                    onClick={handleResetAll}
                    disabled={allDefault}
                    title="Reset all dedither settings to default"
                    aria-label="Reset all dedither settings"
                    className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-600/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground select-none cursor-pointer"
                >
                    <RotateCcw className="w-4 h-4" />
                </button>
            }
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm gap-2">
                        <Label htmlFor="weight-slider" className="font-medium">
                            Weight
                        </Label>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold">
                                {weight}
                            </span>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setWeight(DEFAULT_WEIGHT);
                                }}
                                disabled={weight === DEFAULT_WEIGHT}
                                title="Reset weight to default"
                                aria-label="Reset weight"
                                className="h-5 w-5 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-600/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground select-none cursor-pointer"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    <Slider
                        id="weight-slider"
                        data-testid="dedither-weight-slider"
                        aria-label="Dedither weight"
                        min={1}
                        max={9}
                        step={1}
                        value={[weight]}
                        onValueChange={(value) => setWeight(value[0])}
                        className="w-full"
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm gap-2">
                        <Label htmlFor="passes-slider" className="font-medium">
                            Passes
                        </Label>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold">
                                {passes}
                            </span>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setPasses(DEFAULT_PASSES);
                                }}
                                disabled={passes === DEFAULT_PASSES}
                                title="Reset passes to default"
                                aria-label="Reset passes"
                                className="h-5 w-5 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-600/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground select-none cursor-pointer"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    <Slider
                        id="passes-slider"
                        data-testid="dedither-passes-slider"
                        aria-label="Dedither passes"
                        min={1}
                        max={10}
                        step={1}
                        value={[passes]}
                        onValueChange={(value) => setPasses(value[0])}
                        className="w-full"
                    />
                </div>

                <div className="h-px bg-border/50" />

                <Button
                    onClick={handleApply}
                    data-testid="dedither-apply"
                    disabled={working}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold disabled:bg-green-600/50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg active:scale-95 gap-1.5"
                >
                    {working ? (
                        <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                        <Check className="w-4 h-4" />
                    )}
                    <span>{working ? 'Applying...' : 'Apply'}</span>
                </Button>
            </div>
        </CollapsibleCard>
    );
};

export default DeditherPanel;
