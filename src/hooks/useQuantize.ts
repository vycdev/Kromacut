import {
    posterizeImageData,
    medianCutImageData,
    kmeansImageData,
    octreeImageData,
    wuImageData,
    enforcePaletteSize,
    mapImageToPalette,
} from "../lib/algorithms";
import { PALETTES } from "../data/palettes";
import { rgbToHsl } from "../lib/color";
import type { CanvasPreviewHandle } from "../components/CanvasPreview";

interface Params {
    algorithm: string;
    weight: number;
    finalColors: number;
    selectedPalette: string;
    imageSrc: string | null;
    setImage: (url: string | null, pushHistory?: boolean) => void;
    onImmediateSwatches: (colors: string[]) => void;
}

export function useQuantize({
    algorithm,
    weight,
    finalColors,
    selectedPalette,
    imageSrc,
    setImage,
    onImmediateSwatches,
}: Params) {
    const applyQuantize = async (
        canvasPreviewRef: React.RefObject<CanvasPreviewHandle | null>
    ) => {
        if (!canvasPreviewRef.current || !imageSrc) return;
        const blob = await canvasPreviewRef.current.exportImageBlob();
        if (!blob) return;
        const img = await new Promise<HTMLImageElement | null>((resolve) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => resolve(null);
            i.src = URL.createObjectURL(blob);
        });
        if (!img) return;

        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const countUnique = (imgd: ImageData) => {
            const s = new Set<number>();
            const dd = imgd.data;
            for (let i = 0; i < dd.length; i += 4)
                s.add((dd[i] << 16) | (dd[i + 1] << 8) | dd[i + 2]);
            return s.size;
        };
        if (algorithm === "median-cut") medianCutImageData(data, weight);
        else if (algorithm === "kmeans") kmeansImageData(data, weight);
        else if (algorithm === "octree") octreeImageData(data, weight);
        else if (algorithm === "wu") wuImageData(data, weight);
        else if (algorithm === "none") {
            // no algorithm pass, leave data as-is for postprocessing
        } else posterizeImageData(data, weight);
        console.log("unique after:", countUnique(data));
        // put algorithm result (or original) into canvas
        ctx.putImageData(data, 0, 0);
        // postprocessing: enforce final color count or map to selected palette
        if (selectedPalette && selectedPalette !== "auto") {
            const pal = PALETTES.find((p) => p.id === selectedPalette);
            if (pal && pal.colors && pal.colors.length > 0) {
                mapImageToPalette(data, pal.colors);
                ctx.putImageData(data, 0, 0);
            }
        } else {
            // auto: reduce to finalColors via enforcePaletteSize
            enforcePaletteSize(data, finalColors);
            ctx.putImageData(data, 0, 0);
        }
        // diagnostic: log final counts and what was applied
        try {
            const postUnique = countUnique(data);
            console.log(
                "postprocess: requested=",
                finalColors,
                "selectedPalette=",
                selectedPalette,
                "uniqueAfterPost=",
                postUnique
            );
        } catch {
            /* ignore */
        }

        // immediate swatches
        try {
            const cmap = new Map<number, number>();
            const dd = data.data;
            const SWATCH_CAP = 2 ** 14;
            for (let i = 0; i < dd.length; i += 4) {
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
                        "#" +
                        [r, g, b]
                            .map((v) => v.toString(16).padStart(2, "0"))
                            .join("");
                    return { hex, hsl: rgbToHsl(r, g, b) };
                });
            topLocal.sort((a, b) => {
                if (a.hsl.h !== b.hsl.h) return a.hsl.h - b.hsl.h;
                if (a.hsl.s !== b.hsl.s) return b.hsl.s - a.hsl.s;
                return b.hsl.l - a.hsl.l;
            });
            onImmediateSwatches(topLocal.map((t) => t.hex));
        } catch (err) {
            console.warn("immediate swatches failed", err);
        }
        const outBlob = await new Promise<Blob | null>((res) =>
            c.toBlob((b) => res(b), "image/png")
        );
        if (!outBlob) return;
        const url = URL.createObjectURL(outBlob);
        setImage(url, true);
    };

    return { applyQuantize };
}
