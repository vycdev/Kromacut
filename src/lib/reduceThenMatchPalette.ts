import { enforcePaletteSizeAsync, mapImageToPalette, wuImageData } from './algorithms.ts';

/** Bound the merge stage, then match the representatives without adding colors. */
export async function reduceThenMatchPalette(
    data: ImageData,
    count: number,
    palette: string[],
    progress?: (value: number) => void
) {
    const distinct = new Set<number>();
    for (let i = 0; i < data.data.length && distinct.size <= 512; i += 4) {
        if (data.data[i + 3])
            distinct.add((data.data[i] << 16) | (data.data[i + 1] << 8) | data.data[i + 2]);
    }
    if (distinct.size > 512)
        await wuImageData(data, Math.max(256, count), { onProgress: (f) => progress?.(f * 0.25) });
    await enforcePaletteSizeAsync(data, count, (f) => progress?.(0.25 + f * 0.45));
    if (palette.length)
        await mapImageToPalette(data, palette, {
            perceptual: true,
            onProgress: (f) => progress?.(0.7 + f * 0.3),
        });
    progress?.(1);
    return data;
}
