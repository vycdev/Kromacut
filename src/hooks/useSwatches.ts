import { useEffect, useRef, useState } from 'react';
import { rgbToHsl } from '../lib/color';
import { createCenterWeight, createEdgeWeight } from '../lib/regionWeighting';

// Manages swatch computation with cancellation & immediate override
export interface SwatchEntry {
    hex: string;
    a: number;
    count: number;
    centerWeight?: number;
    edgeWeight?: number;
    isTransparent?: boolean;
}

export interface ImageDimensions {
    width: number;
    height: number;
    opaqueWidth: number;
    opaqueHeight: number;
}

export function useSwatches(imageSrc: string | null) {
    const [swatches, setSwatches] = useState<SwatchEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(null);
    const runRef = useRef(0);
    const SWATCH_CAP = 2 ** 14; // matches previous constant

    const invalidate = () => {
        runRef.current++;
        setLoading(false);
    };

    const immediateOverride = (colors: SwatchEntry[]) => {
        runRef.current++; // cancel any inflight computation
        setSwatches(colors);
        setLoading(false);
    };

    useEffect(() => {
        let cancelled = false;
        const compute = async () => {
            if (!imageSrc) {
                runRef.current++;
                setSwatches([]);
                setImageDimensions(null);
                setLoading(false);
                return;
            }
            const runId = ++runRef.current;
            setSwatches([]);
            setLoading(true);
            try {
                const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const i = new Image();
                    i.onload = () => resolve(i);
                    i.onerror = () => reject(new Error('image load failed'));
                    i.src = imageSrc;
                });
                if (runId !== runRef.current || cancelled) return;
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                setImageDimensions({ width: w, height: h, opaqueWidth: w, opaqueHeight: h });
                // Precompute the size-dependent weighting terms once so the
                // per-pixel scan below stays a couple of multiplies per call.
                const centerWeightFor = createCenterWeight(w, h);
                const edgeWeightFor = createEdgeWeight(w, h);
                const TILE = 1024;
                const map = new Map<
                    number,
                    { count: number; centerWeight: number; edgeWeight: number }
                >();
                const tile = document.createElement('canvas');
                const tctx = tile.getContext('2d', {
                    willReadFrequently: true,
                });
                if (!tctx) {
                    setLoading(false);
                    return;
                }
                let transparentCount = 0;
                let minOpaqueX = w;
                let minOpaqueY = h;
                let maxOpaqueX = -1;
                let maxOpaqueY = -1;
                for (let y = 0; y < h; y += TILE) {
                    for (let x = 0; x < w; x += TILE) {
                        const sw = Math.min(TILE, w - x);
                        const sh = Math.min(TILE, h - y);
                        tile.width = sw;
                        tile.height = sh;
                        tctx.clearRect(0, 0, sw, sh);
                        tctx.drawImage(img, x, y, sw, sh, 0, 0, sw, sh);
                        const data = tctx.getImageData(0, 0, sw, sh).data;
                        for (let i = 0; i < data.length; i += 4) {
                            const a = data[i + 3];
                            if (a === 0) {
                                // accumulate fully transparent pixels into a single bucket
                                transparentCount++;
                                continue;
                            }
                            const pixelOffset = i / 4;
                            const px = x + (pixelOffset % sw);
                            const py = y + Math.floor(pixelOffset / sw);
                            if (px < minOpaqueX) minOpaqueX = px;
                            if (py < minOpaqueY) minOpaqueY = py;
                            if (px > maxOpaqueX) maxOpaqueX = px;
                            if (py > maxOpaqueY) maxOpaqueY = py;
                            // include alpha in the key so semi-transparent colors are preserved
                            const r = data[i];
                            const g = data[i + 1];
                            const b = data[i + 2];
                            const key = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
                            const centerWeight = centerWeightFor(px, py);
                            const edgeWeight = edgeWeightFor(px, py);
                            const existing = map.get(key);
                            if (existing) {
                                existing.count++;
                                existing.centerWeight += centerWeight;
                                existing.edgeWeight += edgeWeight;
                            } else {
                                map.set(key, { count: 1, centerWeight, edgeWeight });
                            }
                        }
                    }
                    await new Promise((r) => setTimeout(r, 0));
                    if (runId !== runRef.current || cancelled) return;
                }
                const top = Array.from(map.entries())
                    .sort((a, b) => b[1].count - a[1].count)
                    .slice(0, Math.min(map.size, SWATCH_CAP))
                    .map((entry) => {
                        const key = entry[0];
                        // decode unsigned 32-bit key with alpha in the low byte
                        const r = (key >>> 24) & 0xff;
                        const g = (key >>> 16) & 0xff;
                        const b = (key >>> 8) & 0xff;
                        const a = key & 0xff;
                        const hex =
                            '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
                        return {
                            hex,
                            a,
                            hsl: rgbToHsl(r, g, b),
                            freq: entry[1].count,
                            centerWeight: entry[1].centerWeight,
                            edgeWeight: entry[1].edgeWeight,
                        };
                    });
                top.sort((a, b) => {
                    if (a.hsl.h !== b.hsl.h) return a.hsl.h - b.hsl.h;
                    if (a.hsl.s !== b.hsl.s) return b.hsl.s - a.hsl.s;
                    return b.hsl.l - a.hsl.l;
                });
                // Present colors from darkest to lightest (reverse the previous ordering)
                top.reverse();
                if (runId === runRef.current && !cancelled) {
                    const hasOpaquePixels = maxOpaqueX >= minOpaqueX && maxOpaqueY >= minOpaqueY;
                    setImageDimensions({
                        width: w,
                        height: h,
                        opaqueWidth: hasOpaquePixels ? maxOpaqueX - minOpaqueX + 1 : w,
                        opaqueHeight: hasOpaquePixels ? maxOpaqueY - minOpaqueY + 1 : h,
                    });
                    const result = top.map((t) => ({
                        hex: t.hex,
                        a: typeof t.a === 'number' ? t.a : 255,
                        count: t.freq,
                        centerWeight: t.centerWeight,
                        edgeWeight: t.edgeWeight,
                        isTransparent: typeof t.a === 'number' ? t.a === 0 : false,
                    }));
                    if (transparentCount > 0) {
                        // preserve the single fully-transparent bucket
                        result.push({
                            hex: '#000000',
                            a: 0,
                            count: transparentCount,
                            centerWeight: 0,
                            edgeWeight: 0,
                            isTransparent: true,
                        });
                    }
                    setSwatches(result);
                    setLoading(false);
                }
            } catch (err) {
                if (runId === runRef.current && !cancelled) {
                    console.warn('swatches: compute failed', err);
                    setSwatches([]);
                    setLoading(false);
                }
            }
        };
        compute();
        return () => {
            cancelled = true;
        };
    }, [imageSrc, SWATCH_CAP]);

    return {
        swatches,
        swatchesLoading: loading,
        imageDimensions,
        invalidate,
        immediateOverride,
    };
}
