import { rgbToLab, deltaE2000Lab, type Lab } from './colorDifference.ts';

export interface RegionPatch {
    data: Uint8ClampedArray;
    changedPixelCount: number;
    patchedRegionCount: number;
    unresolvedPixelCount: number;
}

/** Merge flagged 8-connected color regions into an original, edge-adjacent
 * unflagged color. Prefer perceptual similarity, then shared edge length, then
 * RGB order. Decisions never cascade; alpha and unflagged pixels are untouched. */
export function patchVulnerableRegions(
    width: number,
    height: number,
    source: Uint8ClampedArray,
    mask: Uint8Array
): RegionPatch {
    const n = width * height;
    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1 ||
        source.length !== n * 4 ||
        mask.length !== n
    )
        throw new Error('Invalid region patch dimensions');
    const data = new Uint8ClampedArray(source);
    const visited = new Uint8Array(n);
    const queue = new Int32Array(n);
    const key = (i: number) => (source[i * 4] << 16) | (source[i * 4 + 1] << 8) | source[i * 4 + 2];
    const labs = new Map<number, Lab>();
    const lab = (rgb: number) => {
        let value = labs.get(rgb);
        if (!value) {
            value = rgbToLab([(rgb >>> 16) & 255, (rgb >>> 8) & 255, rgb & 255]);
            labs.set(rgb, value);
        }
        return value;
    };
    let changedPixelCount = 0,
        patchedRegionCount = 0,
        unresolvedPixelCount = 0;
    for (let start = 0; start < n; start++) {
        if (visited[start] || !mask[start] || !source[start * 4 + 3]) continue;
        const color = key(start);
        const contacts = new Map<number, number>();
        let head = 0,
            tail = 1;
        queue[0] = start;
        visited[start] = 1;
        while (head < tail) {
            const i = queue[head++],
                x = i % width,
                y = Math.floor(i / width);
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    if (
                        !(dx || dy) ||
                        x + dx < 0 ||
                        x + dx >= width ||
                        y + dy < 0 ||
                        y + dy >= height
                    )
                        continue;
                    const j = (y + dy) * width + x + dx;
                    if (!source[j * 4 + 3]) continue;
                    const neighbor = key(j);
                    if (mask[j] && neighbor === color && !visited[j]) {
                        visited[j] = 1;
                        queue[tail++] = j;
                    } else if (!mask[j] && neighbor !== color && (!dx || !dy))
                        contacts.set(neighbor, (contacts.get(neighbor) ?? 0) + 1);
                }
        }
        let best = -1,
            bestDistance = Infinity,
            bestContact = -1;
        for (const [candidate, contact] of contacts) {
            const distance = deltaE2000Lab(lab(color), lab(candidate));
            if (
                distance < bestDistance - 1e-9 ||
                (Math.abs(distance - bestDistance) <= 1e-9 &&
                    (contact > bestContact || (contact === bestContact && candidate < best)))
            ) {
                best = candidate;
                bestDistance = distance;
                bestContact = contact;
            }
        }
        if (best < 0) {
            unresolvedPixelCount += tail;
            continue;
        }
        patchedRegionCount++;
        changedPixelCount += tail;
        for (let q = 0; q < tail; q++) {
            const at = queue[q] * 4;
            data[at] = (best >>> 16) & 255;
            data[at + 1] = (best >>> 8) & 255;
            data[at + 2] = best & 255;
        }
    }
    return { data, changedPixelCount, patchedRegionCount, unresolvedPixelCount };
}
