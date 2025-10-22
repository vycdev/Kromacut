import React, { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { RotateCcw } from 'lucide-react';
import type { CanvasPreviewHandle } from './CanvasPreview';

interface Props {
    canvasRef: React.RefObject<CanvasPreviewHandle | null>;
    onApplyResult: (blobUrl: string) => void;
}

export const DeditherPanel: React.FC<Props> = ({ canvasRef, onApplyResult }) => {
    const [weight, setWeight] = useState<number>(4);
    const [working, setWorking] = useState(false);
    const DEFAULT_WEIGHT = 4;

    const handleApply = useCallback(async () => {
        if (!canvasRef.current) return;
        setWorking(true);
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

            // Output copy
            const out = new Uint8ClampedArray(dd);

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

            // iterate pixels
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    const r = dd[idx],
                        g = dd[idx + 1],
                        b = dd[idx + 2],
                        a = dd[idx + 3];

                    // count same-color neighbors
                    let sameCount = 0;
                    const counts = new Map<number, number>();
                    for (const [dx, dy] of neigh) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                        const nidx = (ny * w + nx) * 4;
                        const nr = dd[nidx],
                            ng = dd[nidx + 1],
                            nb = dd[nidx + 2],
                            na = dd[nidx + 3];
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
            }

            const outData = new ImageData(out, w, h);
            ctx.putImageData(outData, 0, 0);
            const outBlob = await new Promise<Blob | null>((res) =>
                c.toBlob((b) => res(b), 'image/png')
            );
            if (!outBlob) return;
            const url = URL.createObjectURL(outBlob);
            onApplyResult(url);
        } catch (err) {
            console.warn('Dedither failed', err);
        } finally {
            setWorking(false);
        }
    }, [canvasRef, weight, onApplyResult]);

    return (
        <Card className="p-4 border border-border/50 space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">Dedither</h3>
                    <p className="text-xs text-muted-foreground mt-1">Smooth dithered patterns</p>
                </div>
            </div>

            <div className="h-px bg-border/50" />

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
                            className="h-5 w-5 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-600/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
                <Slider
                    id="weight-slider"
                    min={1}
                    max={9}
                    step={1}
                    value={[weight]}
                    onValueChange={(value) => setWeight(value[0])}
                    className="w-full"
                />
            </div>

            <Button
                onClick={handleApply}
                disabled={working}
                className="w-full bg-primary hover:bg-primary/80 text-primary-foreground font-semibold disabled:bg-primary/50 disabled:cursor-not-allowed transition-colors"
            >
                {working ? 'Working...' : 'Apply'}
            </Button>
        </Card>
    );
};

export default DeditherPanel;
