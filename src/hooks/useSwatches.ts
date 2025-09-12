import { useEffect, useRef, useState } from "react";
import { rgbToHsl } from "../lib/color";

// Manages swatch computation with cancellation & immediate override
export interface SwatchEntry {
    hex: string;
    a: number;
    count: number;
}
export function useSwatches(imageSrc: string | null) {
    const [swatches, setSwatches] = useState<SwatchEntry[]>([]);
    const [loading, setLoading] = useState(false);
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
                setLoading(false);
                return;
            }
            const runId = ++runRef.current;
            setSwatches([]);
            setLoading(true);
            try {
                const img = await new Promise<HTMLImageElement>(
                    (resolve, reject) => {
                        const i = new Image();
                        i.onload = () => resolve(i);
                        i.onerror = () =>
                            reject(new Error("image load failed"));
                        i.src = imageSrc;
                    }
                );
                if (runId !== runRef.current || cancelled) return;
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                const TILE = 1024;
                const map = new Map<number, number>();
                const tile = document.createElement("canvas");
                const tctx = tile.getContext("2d", {
                    willReadFrequently: true,
                });
                if (!tctx) {
                    setLoading(false);
                    return;
                }
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
                            const key =
                                (data[i] << 16) |
                                (data[i + 1] << 8) |
                                data[i + 2];
                            map.set(key, (map.get(key) || 0) + 1);
                        }
                    }
                    await new Promise((r) => setTimeout(r, 0));
                    if (runId !== runRef.current || cancelled) return;
                }
                const top = Array.from(map.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, Math.min(map.size, SWATCH_CAP))
                    .map((entry) => {
                        const key = entry[0];
                        const r = (key >> 16) & 0xff;
                        const g = (key >> 8) & 0xff;
                        const b = key & 0xff;
                        const hex =
                            "#" +
                            [r, g, b]
                                .map((v) => v.toString(16).padStart(2, "0"))
                                .join("");
                        return { hex, hsl: rgbToHsl(r, g, b), freq: entry[1] };
                    });
                top.sort((a, b) => {
                    if (a.hsl.h !== b.hsl.h) return a.hsl.h - b.hsl.h;
                    if (a.hsl.s !== b.hsl.s) return b.hsl.s - a.hsl.s;
                    return b.hsl.l - a.hsl.l;
                });
                if (runId === runRef.current && !cancelled) {
                    setSwatches(
                        top.map((t) => ({ hex: t.hex, a: 255, count: t.freq }))
                    );
                    setLoading(false);
                }
            } catch (err) {
                if (runId === runRef.current && !cancelled) {
                    console.warn("swatches: compute failed", err);
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
        invalidate,
        immediateOverride,
    };
}
