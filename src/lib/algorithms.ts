// Lightweight image algorithms for StrataPaint
// Each function operates on an ImageData instance and returns the modified ImageData.

export function posterizeImageData(
    data: ImageData,
    colorCount: number
): ImageData {
    const d = data.data;
    // sanitize and clamp
    colorCount = Math.max(2, Math.min(256, Math.floor(colorCount)));

    // For very small palettes it's usually more visually pleasing to
    // quantize luminance (grayscale) rather than breaking color channels
    // which can produce strong color tints (e.g. red outlines at 2 colors).
    if (colorCount <= 4) {
        const levels = colorCount;
        const steps = Math.max(0, levels - 1);
        const scale = steps > 0 ? 255 / steps : 0;
        for (let i = 0; i < d.length; i += 4) {
            const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const idx = steps > 0 ? Math.round((l * steps) / 255) : 0;
            const v = Math.round(idx * scale);
            d[i] = d[i + 1] = d[i + 2] = v;
        }
        return data;
    }

    // For larger palettes, distribute levels across R/G/B trying to get
    // a product close to the requested colorCount while keeping channels balanced.
    let r = Math.max(1, Math.floor(Math.cbrt(colorCount)));
    let g = r;
    let b = r;

    // Grow the smallest channel as long as it doesn't make the product exceed colorCount
    while (r * g * b < colorCount) {
        if (r <= g && r <= b) {
            if ((r + 1) * g * b <= colorCount) r++;
            else break;
        } else if (g <= r && g <= b) {
            if (r * (g + 1) * b <= colorCount) g++;
            else break;
        } else {
            if (r * g * (b + 1) <= colorCount) b++;
            else break;
        }
    }

    const levels = [r, g, b];
    const stepsArr = levels.map((l) => Math.max(0, l - 1));
    const scales = stepsArr.map((s) => (s > 0 ? 255 / s : 0));

    for (let i = 0; i < d.length; i += 4) {
        // quantize each channel independently; if a channel has only one
        // level (steps === 0) map to mid-range (128) to avoid pushing the
        // overall color toward black.
        for (let c = 0; c < 3; c++) {
            const val = d[i + c];
            const steps = stepsArr[c];
            if (steps === 0) {
                d[i + c] = 128;
            } else {
                const idx = Math.round((val * steps) / 255);
                d[i + c] = Math.round(idx * scales[c]);
            }
        }
        // leave alpha untouched
    }

    return data;
}

/**
 * Median-cut quantization: builds a palette of up to `colorCount` colors
 * by recursively splitting color boxes along the longest channel at the
 * pixel-count median. Operates on ImageData in-place and returns it.
 */
export function medianCutImageData(
    data: ImageData,
    colorCount: number
): ImageData {
    const d = data.data;
    colorCount = Math.max(2, Math.min(256, Math.floor(colorCount)));

    // Build histogram of unique colors to reduce work
    const map = new Map<number, number>();
    for (let i = 0; i < d.length; i += 4) {
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        map.set(key, (map.get(key) || 0) + 1);
    }

    const entries: {
        key: number;
        r: number;
        g: number;
        b: number;
        count: number;
    }[] = [];
    entries.length = 0;
    map.forEach((count, key) => {
        const r = (key >> 16) & 0xff;
        const g = (key >> 8) & 0xff;
        const b = key & 0xff;
        entries.push({ key, r, g, b, count });
    });

    if (entries.length <= colorCount) {
        // Already fewer unique colors than requested; nothing to do.
        return data;
    }

    type Box = {
        items: typeof entries;
        rMin: number;
        rMax: number;
        gMin: number;
        gMax: number;
        bMin: number;
        bMax: number;
        count: number;
    };

    const makeBox = (items: typeof entries): Box => {
        let rMin = 255,
            rMax = 0,
            gMin = 255,
            gMax = 0,
            bMin = 255,
            bMax = 0,
            count = 0;
        for (const it of items) {
            if (it.r < rMin) rMin = it.r;
            if (it.r > rMax) rMax = it.r;
            if (it.g < gMin) gMin = it.g;
            if (it.g > gMax) gMax = it.g;
            if (it.b < bMin) bMin = it.b;
            if (it.b > bMax) bMax = it.b;
            count += it.count;
        }
        return { items, rMin, rMax, gMin, gMax, bMin, bMax, count };
    };

    // start with one box containing all entries
    const boxes: Box[] = [makeBox(entries)];

    while (boxes.length < colorCount) {
        // pick the box with largest color range (by max channel span)
        let idx = -1;
        let maxRange = -1;
        for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i];
            const rRange = b.rMax - b.rMin;
            const gRange = b.gMax - b.gMin;
            const bRange = b.bMax - b.bMin;
            const span = Math.max(rRange, gRange, bRange);
            if (span > maxRange && b.items.length > 1) {
                maxRange = span;
                idx = i;
            }
        }
        if (idx === -1) break; // no splitable box left

        const box = boxes[idx];

        // choose channel to split: the one with largest range
        const rRange = box.rMax - box.rMin;
        const gRange = box.gMax - box.gMin;
        const bRange = box.bMax - box.bMin;
        let channel: "r" | "g" | "b" = "r";
        if (gRange >= rRange && gRange >= bRange) channel = "g";
        else if (bRange >= rRange && bRange >= gRange) channel = "b";

        // sort items by chosen channel
        box.items.sort((a, b) =>
            channel === "r"
                ? a.r - b.r
                : channel === "g"
                ? a.g - b.g
                : a.b - b.b
        );

        // find median split by cumulative pixel counts
        const total = box.count;
        let acc = 0;
        let splitIndex = 0;
        for (let i = 0; i < box.items.length; i++) {
            acc += box.items[i].count;
            if (acc >= total / 2) {
                splitIndex = i;
                break;
            }
        }

        // avoid degenerate split
        if (splitIndex <= 0) splitIndex = 1;
        if (splitIndex >= box.items.length) splitIndex = box.items.length - 1;

        const aItems = box.items.slice(0, splitIndex);
        const bItems = box.items.slice(splitIndex);

        // replace the box with two new boxes
        boxes.splice(idx, 1, makeBox(aItems), makeBox(bItems));
    }

    // compute palette (weighted average per box) and build lookup
    const lookup = new Map<number, [number, number, number]>();
    for (const box of boxes) {
        let rSum = 0,
            gSum = 0,
            bSum = 0,
            cnt = 0;
        for (const it of box.items) {
            rSum += it.r * it.count;
            gSum += it.g * it.count;
            bSum += it.b * it.count;
            cnt += it.count;
        }
        const rr = cnt ? Math.round(rSum / cnt) : 0;
        const gg = cnt ? Math.round(gSum / cnt) : 0;
        const bb = cnt ? Math.round(bSum / cnt) : 0;
        for (const it of box.items) {
            lookup.set(it.key, [rr, gg, bb]);
        }
    }

    // apply lookup
    for (let i = 0; i < d.length; i += 4) {
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        const v = lookup.get(key);
        if (v) {
            d[i] = v[0];
            d[i + 1] = v[1];
            d[i + 2] = v[2];
        }
    }

    return data;
}

// (default export consolidated at end)

/**
 * K-means color quantization (weighted by pixel counts).
 * Uses k-means++ initialization and a small fixed number of iterations.
 */
export function kmeansImageData(
    data: ImageData,
    colorCount: number
): ImageData {
    const d = data.data;
    colorCount = Math.max(2, Math.min(256, Math.floor(colorCount)));

    // Build unique color entries with counts
    const map = new Map<number, number>();
    for (let i = 0; i < d.length; i += 4) {
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        map.set(key, (map.get(key) || 0) + 1);
    }
    const entries: {
        key: number;
        r: number;
        g: number;
        b: number;
        count: number;
    }[] = [];
    map.forEach((count, key) => {
        entries.push({
            key,
            r: (key >> 16) & 0xff,
            g: (key >> 8) & 0xff,
            b: key & 0xff,
            count,
        });
    });

    if (entries.length <= colorCount) return data;

    // helper: squared distance
    const dist2 = (
        a: { r: number; g: number; b: number },
        b: { r: number; g: number; b: number }
    ) => {
        const dr = a.r - b.r;
        const dg = a.g - b.g;
        const db = a.b - b.b;
        return dr * dr + dg * dg + db * db;
    };

    // k-means++ init
    const centroids: { r: number; g: number; b: number }[] = [];
    // pick first randomly weighted
    let totalCount = 0;
    for (const e of entries) totalCount += e.count;
    let r = Math.random() * totalCount;
    for (const e of entries) {
        r -= e.count;
        if (r <= 0) {
            centroids.push({ r: e.r, g: e.g, b: e.b });
            break;
        }
    }
    if (centroids.length === 0)
        centroids.push({ r: entries[0].r, g: entries[0].g, b: entries[0].b });

    while (centroids.length < colorCount) {
        // compute D^2 to nearest centroid for each entry
        let sum = 0;
        const dists: number[] = new Array(entries.length);
        for (let i = 0; i < entries.length; i++) {
            let best = Infinity;
            for (const c of centroids) {
                const v = dist2(entries[i], c);
                if (v < best) best = v;
            }
            dists[i] = best * entries[i].count;
            sum += dists[i];
        }
        if (sum === 0) break;
        // pick new centroid weighted by dists
        let pick = Math.random() * sum;
        let idx = 0;
        for (; idx < entries.length; idx++) {
            pick -= dists[idx];
            if (pick <= 0) break;
        }
        if (idx >= entries.length) idx = entries.length - 1;
        centroids.push({
            r: entries[idx].r,
            g: entries[idx].g,
            b: entries[idx].b,
        });
    }

    // iterate k-means (weighted) -- limited iterations for speed
    const maxIter = 8;
    const assignments = new Array(entries.length).fill(-1);
    for (let iter = 0; iter < maxIter; iter++) {
        let changed = false;
        // assign
        for (let i = 0; i < entries.length; i++) {
            let best = -1;
            let bestDist = Infinity;
            for (let c = 0; c < centroids.length; c++) {
                const v = dist2(entries[i], centroids[c]);
                if (v < bestDist) {
                    bestDist = v;
                    best = c;
                }
            }
            if (assignments[i] !== best) {
                assignments[i] = best;
                changed = true;
            }
        }
        // recompute centroids
        const sums: { r: number; g: number; b: number; w: number }[] =
            centroids.map(() => ({ r: 0, g: 0, b: 0, w: 0 }));
        for (let i = 0; i < entries.length; i++) {
            const a = assignments[i];
            const e = entries[i];
            sums[a].r += e.r * e.count;
            sums[a].g += e.g * e.count;
            sums[a].b += e.b * e.count;
            sums[a].w += e.count;
        }
        for (let c = 0; c < centroids.length; c++) {
            if (sums[c].w === 0) {
                // re-seed empty centroid with a random entry
                const pick =
                    entries[Math.floor(Math.random() * entries.length)];
                centroids[c] = { r: pick.r, g: pick.g, b: pick.b };
            } else {
                centroids[c] = {
                    r: Math.round(sums[c].r / sums[c].w),
                    g: Math.round(sums[c].g / sums[c].w),
                    b: Math.round(sums[c].b / sums[c].w),
                };
            }
        }
        if (!changed) break;
    }

    // build lookup: map original color to nearest centroid
    const lookup = new Map<number, [number, number, number]>();
    for (let i = 0; i < entries.length; i++) {
        let best = -1;
        let bestDist = Infinity;
        for (let c = 0; c < centroids.length; c++) {
            const v = dist2(entries[i], centroids[c]);
            if (v < bestDist) {
                bestDist = v;
                best = c;
            }
        }
        const cent = centroids[best];
        lookup.set(entries[i].key, [cent.r, cent.g, cent.b]);
    }

    // apply mapping
    for (let i = 0; i < d.length; i += 4) {
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        const v = lookup.get(key);
        if (v) {
            d[i] = v[0];
            d[i + 1] = v[1];
            d[i + 2] = v[2];
        }
    }

    return data;
}

// add to default export for convenience
export default { posterizeImageData, medianCutImageData, kmeansImageData };
