// Lightweight image algorithms for StrataPaint
// Each function operates on an ImageData instance and returns the modified ImageData.

export function posterizeImageData(data: ImageData, weight: number): ImageData {
    const d = data.data;
    // sanitize and clamp
    weight = Math.max(2, Math.min(256, Math.floor(weight)));

    // For very small palettes it's usually more visually pleasing to
    // quantize luminance (grayscale) rather than breaking color channels
    // which can produce strong color tints (e.g. red outlines at 2 colors).
    if (weight <= 4) {
        const levels = weight;
        const steps = Math.max(0, levels - 1);
        const scale = steps > 0 ? 255 / steps : 0;
        for (let i = 0; i < d.length; i += 4) {
            const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const idx = steps > 0 ? Math.round((l * steps) / 255) : 0;
            const v = Math.round(idx * scale);
            d[i] = d[i + 1] = d[i + 2] = v;
        }
        return enforcePaletteSize(data, weight);
    }

    // For larger palettes, distribute levels across R/G/B trying to get
    // a product close to the requested weight while keeping channels balanced.
    let r = Math.max(1, Math.floor(Math.cbrt(weight)));
    let g = r;
    let b = r;

    // Grow the smallest channel as long as it doesn't make the product exceed weight
    while (r * g * b < weight) {
        if (r <= g && r <= b) {
            if ((r + 1) * g * b <= weight) r++;
            else break;
        } else if (g <= r && g <= b) {
            if (r * (g + 1) * b <= weight) g++;
            else break;
        } else {
            if (r * g * (b + 1) <= weight) b++;
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

    return enforcePaletteSize(data, weight);
}

/**
 * Median-cut quantization: builds a palette of up to `weight` colors
 * by recursively splitting color boxes along the longest channel at the
 * pixel-count median. Operates on ImageData in-place and returns it.
 */
export function medianCutImageData(data: ImageData, weight: number): ImageData {
    const d = data.data;
    weight = Math.max(2, Math.min(256, Math.floor(weight)));

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

    if (entries.length <= weight) {
        // Already fewer unique colors than requested; still run post-pass to
        // ensure any downstream expectations are consistent (no-op in practice).
        return enforcePaletteSize(data, weight);
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

    while (boxes.length < weight) {
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

    return enforcePaletteSize(data, weight);
}

// (default export consolidated at end)

/**
 * K-means color quantization (weighted by pixel counts).
 * Uses k-means++ initialization and a small fixed number of iterations.
 */
export function kmeansImageData(data: ImageData, weight: number): ImageData {
    const d = data.data;
    weight = Math.max(2, Math.min(256, Math.floor(weight)));

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

    if (entries.length <= weight) return enforcePaletteSize(data, weight);

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

    while (centroids.length < weight) {
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

    return enforcePaletteSize(data, weight);
}

/**
 * Octree color quantization. Builds an octree up to depth 8, reduces
 * nodes until the leaf count <= weight, then maps pixels to leaf averages.
 */
export function octreeImageData(data: ImageData, weight: number): ImageData {
    const d = data.data;
    weight = Math.max(2, Math.min(256, Math.floor(weight)));

    // build histogram of unique colors
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
    map.forEach((count, key) =>
        entries.push({
            key,
            r: (key >> 16) & 0xff,
            g: (key >> 8) & 0xff,
            b: key & 0xff,
            count,
        })
    );

    if (entries.length <= weight) return enforcePaletteSize(data, weight);

    const MAX_DEPTH = 8;

    type Node = {
        children: (Node | null)[];
        isLeaf: boolean;
        pixelCount: number;
        rSum: number;
        gSum: number;
        bSum: number;
        level: number;
    };

    const reducible: Node[][] = Array.from({ length: MAX_DEPTH }, () => []);

    const makeNode = (level: number): Node => ({
        children: Array(8).fill(null),
        isLeaf: level >= MAX_DEPTH - 1,
        pixelCount: 0,
        rSum: 0,
        gSum: 0,
        bSum: 0,
        level,
    });

    const root = makeNode(0);
    let leafCount = 0;

    const addColor = (r: number, g: number, b: number, count: number) => {
        let node = root;
        for (let level = 0; level < MAX_DEPTH; level++) {
            if (node.isLeaf) {
                node.pixelCount += count;
                node.rSum += r * count;
                node.gSum += g * count;
                node.bSum += b * count;
                return;
            }
            const shift = 7 - level;
            const idx =
                (((r >> shift) & 1) << 2) |
                (((g >> shift) & 1) << 1) |
                ((b >> shift) & 1);
            if (!node.children[idx]) {
                const child = makeNode(level + 1);
                node.children[idx] = child;
                if (!child.isLeaf) reducible[level + 1].push(child);
                else leafCount++;
            }
            node = node.children[idx] as Node;
        }
        node.pixelCount += count;
        node.rSum += r * count;
        node.gSum += g * count;
        node.bSum += b * count;
    };

    for (const e of entries) addColor(e.r, e.g, e.b, e.count);

    const reduceOnce = (): boolean => {
        for (let level = MAX_DEPTH - 1; level > 0; level--) {
            const list = reducible[level];
            while (list.length > 0) {
                const node = list.pop() as Node;
                let rSum = 0,
                    gSum = 0,
                    bSum = 0,
                    cnt = 0,
                    removed = 0;
                for (let i = 0; i < 8; i++) {
                    const ch = node.children[i];
                    if (ch) {
                        rSum += ch.rSum;
                        gSum += ch.gSum;
                        bSum += ch.bSum;
                        cnt += ch.pixelCount;
                        if (ch.isLeaf) removed++;
                        node.children[i] = null;
                    }
                }
                node.isLeaf = true;
                node.rSum += rSum;
                node.gSum += gSum;
                node.bSum += bSum;
                node.pixelCount += cnt;
                leafCount = leafCount - removed + 1;
                return true;
            }
        }
        return false;
    };

    while (leafCount > weight) {
        if (!reduceOnce()) break;
    }

    const lookup = new Map<number, [number, number, number]>();

    const mapColorToLeaf = (
        r: number,
        g: number,
        b: number
    ): [number, number, number] => {
        let node = root;
        for (let level = 0; level < MAX_DEPTH; level++) {
            if (node.isLeaf) break;
            const shift = 7 - level;
            const idx =
                (((r >> shift) & 1) << 2) |
                (((g >> shift) & 1) << 1) |
                ((b >> shift) & 1);
            if (!node.children[idx]) break;
            node = node.children[idx] as Node;
        }
        const findLeaf = (n: Node): Node => {
            if (n.isLeaf) return n;
            for (let i = 0; i < 8; i++) {
                if (n.children[i]) {
                    const leaf = findLeaf(n.children[i] as Node);
                    if (leaf) return leaf;
                }
            }
            return n;
        };
        const leaf = node.isLeaf ? node : findLeaf(node);
        if (leaf && leaf.pixelCount > 0) {
            return [
                Math.round(leaf.rSum / leaf.pixelCount),
                Math.round(leaf.gSum / leaf.pixelCount),
                Math.round(leaf.bSum / leaf.pixelCount),
            ];
        }
        return [0, 0, 0];
    };

    for (const e of entries) {
        lookup.set(e.key, mapColorToLeaf(e.r, e.g, e.b));
    }

    for (let i = 0; i < d.length; i += 4) {
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        const v = lookup.get(key);
        if (v) {
            d[i] = v[0];
            d[i + 1] = v[1];
            d[i + 2] = v[2];
        }
    }

    return enforcePaletteSize(data, weight);
}

export default {
    posterizeImageData,
    medianCutImageData,
    kmeansImageData,
    octreeImageData,
    wuImageData,
    mapImageToPalette,
};

/**
 * Wu color quantization (fast, high-quality). Builds 3D moments over a
 * 33x33x33 color cube, partitions space to minimize squared error, and
 * maps pixels to the computed palette. Operates in-place on ImageData.
 */
export function wuImageData(data: ImageData, weight: number): ImageData {
    const d = data.data;
    weight = Math.max(2, Math.min(256, Math.floor(weight)));

    // Build histogram of unique colors to reduce work (weighted entries)
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

    if (entries.length <= weight) return enforcePaletteSize(data, weight);

    // Wu uses a 33x33x33 cube (indices 0..32) where colors are quantized by >> 3
    const SIDE = 33;
    const SIZE = SIDE * SIDE * SIDE;

    const getIndex = (r: number, g: number, b: number) =>
        (r * SIDE + g) * SIDE + b;

    // moments: weight, r, g, b, and sum of squares
    const vwt = new Float64Array(SIZE);
    const vmr = new Float64Array(SIZE);
    const vmg = new Float64Array(SIZE);
    const vmb = new Float64Array(SIZE);
    const m2 = new Float64Array(SIZE);

    // populate histogram at quantized positions (1..32). leave 0 as padding
    for (const e of entries) {
        const ir = (e.r >> 3) + 1;
        const ig = (e.g >> 3) + 1;
        const ib = (e.b >> 3) + 1;
        const idx = getIndex(ir, ig, ib);
        vwt[idx] += e.count;
        vmr[idx] += e.r * e.count;
        vmg[idx] += e.g * e.count;
        vmb[idx] += e.b * e.count;
        m2[idx] += (e.r * e.r + e.g * e.g + e.b * e.b) * e.count;
    }

    // compute cumulative moments
    for (let r = 1; r < SIDE; r++) {
        for (let g = 1; g < SIDE; g++) {
            let rowW = 0,
                rowR = 0,
                rowG = 0,
                rowB = 0,
                rowM2 = 0;
            for (let b = 1; b < SIDE; b++) {
                const idx = getIndex(r, g, b);
                rowW += vwt[idx];
                rowR += vmr[idx];
                rowG += vmg[idx];
                rowB += vmb[idx];
                rowM2 += m2[idx];

                const prev = getIndex(r - 1, g, b);
                vwt[idx] = vwt[prev] + rowW;
                vmr[idx] = vmr[prev] + rowR;
                vmg[idx] = vmg[prev] + rowG;
                vmb[idx] = vmb[prev] + rowB;
                m2[idx] = m2[prev] + rowM2;
            }
        }
    }

    const vol = (
        array: Float64Array,
        r0: number,
        r1: number,
        g0: number,
        g1: number,
        b0: number,
        b1: number
    ) => {
        const idx = (r: number, g: number, b: number) => getIndex(r, g, b);
        const a = array[idx(r1, g1, b1)];
        const b_ = array[idx(r1, g1, b0 - 1)];
        const c = array[idx(r1, g0 - 1, b1)];
        const d = array[idx(r0 - 1, g1, b1)];
        const e = array[idx(r1, g0 - 1, b0 - 1)];
        const f = array[idx(r0 - 1, g1, b0 - 1)];
        const g_ = array[idx(r0 - 1, g0 - 1, b1)];
        const h = array[idx(r0 - 1, g0 - 1, b0 - 1)];
        return a - b_ - c - d + e + f + g_ - h;
    };

    const volumeWeight = (box: {
        r0: number;
        r1: number;
        g0: number;
        g1: number;
        b0: number;
        b1: number;
    }) => vol(vwt, box.r0, box.r1, box.g0, box.g1, box.b0, box.b1);

    const volumeMoment = (box: {
        r0: number;
        r1: number;
        g0: number;
        g1: number;
        b0: number;
        b1: number;
    }) => ({
        r: vol(vmr, box.r0, box.r1, box.g0, box.g1, box.b0, box.b1),
        g: vol(vmg, box.r0, box.r1, box.g0, box.g1, box.b0, box.b1),
        b: vol(vmb, box.r0, box.r1, box.g0, box.g1, box.b0, box.b1),
    });

    const volumeM2 = (box: {
        r0: number;
        r1: number;
        g0: number;
        g1: number;
        b0: number;
        b1: number;
    }) => vol(m2, box.r0, box.r1, box.g0, box.g1, box.b0, box.b1);

    const variance = (box: {
        r0: number;
        r1: number;
        g0: number;
        g1: number;
        b0: number;
        b1: number;
    }) => {
        const w = volumeWeight(box);
        if (w === 0) return 0;
        const m = volumeMoment(box);
        const m2v = volumeM2(box);
        const dr = m.r * m.r + m.g * m.g + m.b * m.b;
        return m2v - dr / w;
    };

    type Box = {
        r0: number;
        r1: number;
        g0: number;
        g1: number;
        b0: number;
        b1: number;
        vol?: number;
    };

    const createBox = (): Box => ({
        r0: 1,
        r1: SIDE - 1,
        g0: 1,
        g1: SIDE - 1,
        b0: 1,
        b1: SIDE - 1,
    });

    // maximize variance reduction for a given box along a chosen axis
    const maximize = (box: Box, dir: "r" | "g" | "b") => {
        let bestScore = -1;
        let bestPos = -1;
        const wholeR = volumeMoment(box).r;
        const wholeG = volumeMoment(box).g;
        const wholeB = volumeMoment(box).b;
        const wholeW = volumeWeight(box);

        if (dir === "r") {
            for (let i = box.r0; i < box.r1; i++) {
                const box1 = {
                    r0: box.r0,
                    r1: i,
                    g0: box.g0,
                    g1: box.g1,
                    b0: box.b0,
                    b1: box.b1,
                };
                const w1 = volumeWeight(box1);
                const w2 = wholeW - w1;
                if (w1 === 0 || w2 === 0) continue;
                const m1 = volumeMoment(box1);
                const m2_ = {
                    r: wholeR - m1.r,
                    g: wholeG - m1.g,
                    b: wholeB - m1.b,
                };
                const score =
                    (m1.r * m1.r + m1.g * m1.g + m1.b * m1.b) / w1 +
                    (m2_.r * m2_.r + m2_.g * m2_.g + m2_.b * m2_.b) / w2;
                if (score > bestScore) {
                    bestScore = score;
                    bestPos = i;
                }
            }
        } else if (dir === "g") {
            for (let i = box.g0; i < box.g1; i++) {
                const box1 = {
                    r0: box.r0,
                    r1: box.r1,
                    g0: box.g0,
                    g1: i,
                    b0: box.b0,
                    b1: box.b1,
                };
                const w1 = volumeWeight(box1);
                const w2 = wholeW - w1;
                if (w1 === 0 || w2 === 0) continue;
                const m1 = volumeMoment(box1);
                const m2_ = {
                    r: wholeR - m1.r,
                    g: wholeG - m1.g,
                    b: wholeB - m1.b,
                };
                const score =
                    (m1.r * m1.r + m1.g * m1.g + m1.b * m1.b) / w1 +
                    (m2_.r * m2_.r + m2_.g * m2_.g + m2_.b * m2_.b) / w2;
                if (score > bestScore) {
                    bestScore = score;
                    bestPos = i;
                }
            }
        } else {
            for (let i = box.b0; i < box.b1; i++) {
                const box1 = {
                    r0: box.r0,
                    r1: box.r1,
                    g0: box.g0,
                    g1: box.g1,
                    b0: box.b0,
                    b1: i,
                };
                const w1 = volumeWeight(box1);
                const w2 = wholeW - w1;
                if (w1 === 0 || w2 === 0) continue;
                const m1 = volumeMoment(box1);
                const m2_ = {
                    r: wholeR - m1.r,
                    g: wholeG - m1.g,
                    b: wholeB - m1.b,
                };
                const score =
                    (m1.r * m1.r + m1.g * m1.g + m1.b * m1.b) / w1 +
                    (m2_.r * m2_.r + m2_.g * m2_.g + m2_.b * m2_.b) / w2;
                if (score > bestScore) {
                    bestScore = score;
                    bestPos = i;
                }
            }
        }
        return { score: bestScore, pos: bestPos };
    };

    // partition boxes
    const boxes: Box[] = [createBox()];

    while (boxes.length < weight) {
        // find box with largest variance
        let maxVar = -1;
        let idx = -1;
        for (let i = 0; i < boxes.length; i++) {
            const v = variance(boxes[i]);
            if (v > maxVar) {
                maxVar = v;
                idx = i;
            }
        }
        if (idx === -1 || maxVar <= 0) break;

        const box = boxes[idx];
        // try splits along each axis
        const rSplit = maximize(box, "r");
        const gSplit = maximize(box, "g");
        const bSplit = maximize(box, "b");

        // pick best split
        const best = [
            { dir: "r", score: rSplit.score, pos: rSplit.pos },
            { dir: "g", score: gSplit.score, pos: gSplit.pos },
            { dir: "b", score: bSplit.score, pos: bSplit.pos },
        ].sort((a, b) => b.score - a.score)[0];

        if (best.score <= 0 || best.pos < 0) {
            // Fallback median split on the largest axis to ensure progress
            const rRange = box.r1 - box.r0;
            const gRange = box.g1 - box.g0;
            const bRange = box.b1 - box.b0;
            let dir: "r" | "g" | "b" = "r";
            if (gRange >= rRange && gRange >= bRange) dir = "g";
            else if (bRange >= rRange && bRange >= gRange) dir = "b";
            let mid = 0;
            if (dir === "r") mid = Math.floor((box.r0 + box.r1) / 2);
            else if (dir === "g") mid = Math.floor((box.g0 + box.g1) / 2);
            else mid = Math.floor((box.b0 + box.b1) / 2);

            let b1: Box, b2: Box;
            if (dir === "r") {
                b1 = {
                    r0: box.r0,
                    r1: mid,
                    g0: box.g0,
                    g1: box.g1,
                    b0: box.b0,
                    b1: box.b1,
                };
                b2 = {
                    r0: mid + 1,
                    r1: box.r1,
                    g0: box.g0,
                    g1: box.g1,
                    b0: box.b0,
                    b1: box.b1,
                };
            } else if (dir === "g") {
                b1 = {
                    r0: box.r0,
                    r1: box.r1,
                    g0: box.g0,
                    g1: mid,
                    b0: box.b0,
                    b1: box.b1,
                };
                b2 = {
                    r0: box.r0,
                    r1: box.r1,
                    g0: mid + 1,
                    g1: box.g1,
                    b0: box.b0,
                    b1: box.b1,
                };
            } else {
                b1 = {
                    r0: box.r0,
                    r1: box.r1,
                    g0: box.g0,
                    g1: box.g1,
                    b0: box.b0,
                    b1: mid,
                };
                b2 = {
                    r0: box.r0,
                    r1: box.r1,
                    g0: box.g0,
                    g1: box.g1,
                    b0: mid + 1,
                    b1: box.b1,
                };
            }
            boxes.splice(idx, 1, b1);
            boxes.push(b2);
            continue;
        }

        // create two new boxes by splitting
        let box1: Box, box2: Box;
        if (best.dir === "r") {
            box1 = {
                r0: box.r0,
                r1: best.pos,
                g0: box.g0,
                g1: box.g1,
                b0: box.b0,
                b1: box.b1,
            };
            box2 = {
                r0: best.pos + 1,
                r1: box.r1,
                g0: box.g0,
                g1: box.g1,
                b0: box.b0,
                b1: box.b1,
            };
        } else if (best.dir === "g") {
            box1 = {
                r0: box.r0,
                r1: box.r1,
                g0: box.g0,
                g1: best.pos,
                b0: box.b0,
                b1: box.b1,
            };
            box2 = {
                r0: box.r0,
                r1: box.r1,
                g0: best.pos + 1,
                g1: box.g1,
                b0: box.b0,
                b1: box.b1,
            };
        } else {
            box1 = {
                r0: box.r0,
                r1: box.r1,
                g0: box.g0,
                g1: box.g1,
                b0: box.b0,
                b1: best.pos,
            };
            box2 = {
                r0: box.r0,
                r1: box.r1,
                g0: box.g0,
                g1: box.g1,
                b0: best.pos + 1,
                b1: box.b1,
            };
        }
        // replace current box with box1 and push box2
        boxes.splice(idx, 1, box1);
        boxes.push(box2);
    }

    // compute palette (average color in each box)
    const palette: [number, number, number][] = boxes.map((b) => {
        const w = volumeWeight(b);
        if (w === 0) return [0, 0, 0];
        const m = volumeMoment(b);
        return [Math.round(m.r / w), Math.round(m.g / w), Math.round(m.b / w)];
    });

    // build lookup from original color to palette color by locating which box contains its quantized coords
    const lookup = new Map<number, [number, number, number]>();
    for (let pi = 0; pi < palette.length; pi++) {
        // not needed here; we'll map by checking boxes per entry
    }

    for (const e of entries) {
        const ir = (e.r >> 3) + 1;
        const ig = (e.g >> 3) + 1;
        const ib = (e.b >> 3) + 1;
        let found = false;
        for (let bi = 0; bi < boxes.length; bi++) {
            const box = boxes[bi];
            if (
                ir >= box.r0 &&
                ir <= box.r1 &&
                ig >= box.g0 &&
                ig <= box.g1 &&
                ib >= box.b0 &&
                ib <= box.b1
            ) {
                lookup.set(e.key, palette[bi]);
                found = true;
                break;
            }
        }
        if (!found) lookup.set(e.key, palette[0]);
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

    return enforcePaletteSize(data, weight);
}

/**
 * Post-pass: merge nearest palette colors until the palette length is `target`.
 * Operates in-place on the provided ImageData and returns it.
 */
export function enforcePaletteSize(data: ImageData, target: number): ImageData {
    target = Math.max(2, Math.min(256, Math.floor(target)));
    const d = data.data;

    // build histogram of unique colors
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

    if (entries.length <= target) return data;

    // merge nearest pairs until length == target (naive O(n^2) approach)
    const dist2 = (
        a: { r: number; g: number; b: number },
        b: { r: number; g: number; b: number }
    ) => {
        const dr = a.r - b.r;
        const dg = a.g - b.g;
        const db = a.b - b.b;
        return dr * dr + dg * dg + db * db;
    };

    // We'll operate on a mutable array of palette entries
    const palette = entries.slice();

    while (palette.length > target) {
        let bestI = 0,
            bestJ = 1;
        let bestDist = Infinity;
        for (let i = 0; i < palette.length; i++) {
            for (let j = i + 1; j < palette.length; j++) {
                const d2 = dist2(palette[i], palette[j]);
                if (d2 < bestDist) {
                    bestDist = d2;
                    bestI = i;
                    bestJ = j;
                }
            }
        }
        // merge bestI and bestJ into weighted average
        const a = palette[bestI];
        const b = palette[bestJ];
        const wSum = a.count + b.count;
        const nr = Math.round((a.r * a.count + b.r * b.count) / wSum);
        const ng = Math.round((a.g * a.count + b.g * b.count) / wSum);
        const nb = Math.round((a.b * a.count + b.b * b.count) / wSum);
        const merged = {
            key: (nr << 16) | (ng << 8) | nb,
            r: nr,
            g: ng,
            b: nb,
            count: wSum,
        };
        // replace the earlier index with merged and remove the other
        if (bestI < bestJ) {
            palette.splice(bestJ, 1);
            palette.splice(bestI, 1, merged);
        } else {
            palette.splice(bestI, 1);
            palette.splice(bestJ, 1, merged);
        }
    }

    // Build mapping from original color -> nearest palette color (after merges)
    const paletteColors = palette.map((p) => ({ r: p.r, g: p.g, b: p.b }));
    const lookup = new Map<number, [number, number, number]>();
    const paletteDist = (r: number, g: number, b: number, idx: number) => {
        const p = paletteColors[idx];
        const dr = r - p.r;
        const dg = g - p.g;
        const db = b - p.b;
        return dr * dr + dg * dg + db * db;
    };
    // for each unique original color, find nearest merged palette color
    for (const e of entries) {
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < paletteColors.length; i++) {
            const d2 = paletteDist(e.r, e.g, e.b, i);
            if (d2 < bestD) {
                bestD = d2;
                best = i;
            }
        }
        const p = paletteColors[best];
        lookup.set(e.key, [p.r, p.g, p.b]);
    }

    // remap pixels in-place using lookup
    for (let i = 0; i < d.length; i += 4) {
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        const v = lookup.get(key);
        if (v) {
            d[i] = v[0];
            d[i + 1] = v[1];
            d[i + 2] = v[2];
        }
    }

    // quick diagnostic: count unique colors after remap
    const afterSet = new Set<number>();
    for (let i = 0; i < d.length; i += 4) {
        afterSet.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    }
    // if reduction didn't reach target for any reason (too many or too few), run a fallback k-means on unique colors
    if (afterSet.size !== target) {
        // build entries array (reuse variable name) from current pixels
        const uniq = new Map<number, number>();
        for (let i = 0; i < d.length; i += 4) {
            const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
            uniq.set(k, (uniq.get(k) || 0) + 1);
        }
        const uEntries: {
            key: number;
            r: number;
            g: number;
            b: number;
            count: number;
        }[] = [];
        uniq.forEach((count, key) => {
            uEntries.push({
                key,
                r: (key >> 16) & 0xff,
                g: (key >> 8) & 0xff,
                b: key & 0xff,
                count,
            });
        });

        // simple k-means on unique colors (weighted) to get exactly `target` centroids
        const dist2 = (
            a: { r: number; g: number; b: number },
            b: { r: number; g: number; b: number }
        ) => {
            const dr = a.r - b.r;
            const dg = a.g - b.g;
            const db = a.b - b.b;
            return dr * dr + dg * dg + db * db;
        };

        // init centroids by picking the most frequent `target` unique colors (or random)
        uEntries.sort((a, b) => b.count - a.count);
        const centroids = uEntries
            .slice(0, Math.min(target, uEntries.length))
            .map((e) => ({ r: e.r, g: e.g, b: e.b }));
        while (centroids.length < target)
            centroids.push({
                r: uEntries[0].r,
                g: uEntries[0].g,
                b: uEntries[0].b,
            });

        const assignments = new Array(uEntries.length).fill(-1);
        const maxIter = 12;
        for (let iter = 0; iter < maxIter; iter++) {
            let changed = false;
            // assign
            for (let i = 0; i < uEntries.length; i++) {
                let best = -1;
                let bestD = Infinity;
                for (let c = 0; c < centroids.length; c++) {
                    const d2 = dist2(uEntries[i], centroids[c]);
                    if (d2 < bestD) {
                        bestD = d2;
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
            for (let i = 0; i < uEntries.length; i++) {
                const a = assignments[i];
                const e = uEntries[i];
                sums[a].r += e.r * e.count;
                sums[a].g += e.g * e.count;
                sums[a].b += e.b * e.count;
                sums[a].w += e.count;
            }
            for (let c = 0; c < centroids.length; c++) {
                if (sums[c].w > 0) {
                    centroids[c] = {
                        r: Math.round(sums[c].r / sums[c].w),
                        g: Math.round(sums[c].g / sums[c].w),
                        b: Math.round(sums[c].b / sums[c].w),
                    };
                }
            }
            if (!changed) break;
        }

        // build centroid lookup
        const finalLookup = new Map<number, [number, number, number]>();
        for (let i = 0; i < uEntries.length; i++) {
            const e = uEntries[i];
            let best = 0;
            let bestD = Infinity;
            for (let c = 0; c < centroids.length; c++) {
                const d2 = dist2(e, centroids[c]);
                if (d2 < bestD) {
                    bestD = d2;
                    best = c;
                }
            }
            const p = centroids[best];
            finalLookup.set(e.key, [p.r, p.g, p.b]);
        }

        // remap pixels
        for (let i = 0; i < d.length; i += 4) {
            const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
            const v = finalLookup.get(key);
            if (v) {
                d[i] = v[0];
                d[i + 1] = v[1];
                d[i + 2] = v[2];
            }
        }
    }

    return data;
}

/**
 * Map every pixel color in `data` to the nearest color from `palette`.
 * `palette` is an array of hex strings like `#rrggbb`.
 */
export function mapImageToPalette(
    data: ImageData,
    palette: string[]
): ImageData {
    const d = data.data;
    if (!palette || palette.length === 0) return data;
    // helpers: parse palette color strings (hex, #rrggbb, hsl(...), rgb(...))
    const clamp = (v: number, a = 0, b = 255) => Math.max(a, Math.min(b, v));

    const parseHex = (s: string): [number, number, number] => {
        const raw = s.replace(/^#/, "").trim();
        if (raw.length === 3) {
            const r = parseInt(raw[0] + raw[0], 16);
            const g = parseInt(raw[1] + raw[1], 16);
            const b = parseInt(raw[2] + raw[2], 16);
            return [r, g, b];
        }
        const r = parseInt(raw.slice(0, 2), 16) || 0;
        const g = parseInt(raw.slice(2, 4), 16) || 0;
        const b = parseInt(raw.slice(4, 6), 16) || 0;
        return [r, g, b];
    };

    const hslToRgb = (
        h: number,
        s: number,
        l: number
    ): [number, number, number] => {
        // h in degrees, s/l in [0,1]
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const hh = ((h % 360) + 360) % 360;
        const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
        let r1 = 0,
            g1 = 0,
            b1 = 0;
        if (hh < 60) [r1, g1, b1] = [c, x, 0];
        else if (hh < 120) [r1, g1, b1] = [x, c, 0];
        else if (hh < 180) [r1, g1, b1] = [0, c, x];
        else if (hh < 240) [r1, g1, b1] = [0, x, c];
        else if (hh < 300) [r1, g1, b1] = [x, 0, c];
        else [r1, g1, b1] = [c, 0, x];
        const m = l - c / 2;
        return [
            Math.round(clamp((r1 + m) * 255)),
            Math.round(clamp((g1 + m) * 255)),
            Math.round(clamp((b1 + m) * 255)),
        ];
    };

    const parseColor = (s: string): [number, number, number] => {
        const str = (s || "").trim();
        if (!str) return [0, 0, 0];
        // hex
        if (
            str.startsWith("#") ||
            /^[0-9A-Fa-f]{6}$/.test(str) ||
            /^[0-9A-Fa-f]{3}$/.test(str)
        ) {
            try {
                return parseHex(str);
            } catch {
                return [0, 0, 0];
            }
        }
        // hsl(...) - accept both `hsl(0 0% 20%)` and `hsl(0,0%,20%)`
        const hsl = str.match(
            /hsl\(\s*([\d.-]+)(?:deg)?(?:\s*,\s*|\s+)([\d.]+)%?(?:\s*,\s*|\s+)([\d.]+)%?\s*\)/i
        );
        if (hsl) {
            const h = Number(hsl[1]);
            const s = Number(hsl[2]) / 100;
            const l = Number(hsl[3]) / 100;
            return hslToRgb(h, s, l);
        }
        // rgb(...) or rgba(...)
        const rgb = str.match(
            /rgba?\(\s*([\d.]+)\s*(?:,|\s)\s*([\d.]+)%?\s*(?:,|\s)\s*([\d.]+)%?(?:\s*,\s*[\d.]+)?\s*\)/i
        );
        if (rgb) {
            // if percentages were used, the regex still captures raw numbers; we try to detect % by presence of '%'
            const hasPercent = /%/.test(str);
            if (hasPercent) {
                return [
                    Math.round(clamp((Number(rgb[1]) / 100) * 255)),
                    Math.round(clamp((Number(rgb[2]) / 100) * 255)),
                    Math.round(clamp((Number(rgb[3]) / 100) * 255)),
                ];
            }
            return [
                Math.round(clamp(Number(rgb[1]))),
                Math.round(clamp(Number(rgb[2]))),
                Math.round(clamp(Number(rgb[3]))),
            ];
        }
        // fallback: try parse hex without #
        const raw = str.replace(/[^0-9A-Fa-f]/g, "");
        if (raw.length === 6) return parseHex(raw);
        return [0, 0, 0];
    };

    // convert sRGB [0..255] to Lab using D65 reference
    const srgbToLab = (r: number, g: number, b: number) => {
        // normalize
        let R = r / 255;
        let G = g / 255;
        let B = b / 255;
        const toLinear = (u: number) =>
            u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
        R = toLinear(R);
        G = toLinear(G);
        B = toLinear(B);
        // sRGB D65
        const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
        const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
        const Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
        // reference white
        const Xn = 0.95047;
        const Yn = 1.0;
        const Zn = 1.08883;
        const fx = (t: number) =>
            t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
        const fxX = fx(X / Xn);
        const fxY = fx(Y / Yn);
        const fxZ = fx(Z / Zn);
        const L = Math.max(0, 116 * fxY - 16);
        const a = 500 * (fxX - fxY);
        const bb = 200 * (fxY - fxZ);
        return [L, a, bb];
    };

    // build palette in Lab space and keep RGB for output
    const palRGB: [number, number, number][] = palette.map((p) =>
        parseColor(p)
    );
    const palLab = palRGB.map((c) => srgbToLab(c[0], c[1], c[2]));

    // build unique color histogram
    const uniq = new Map<number, number>();
    for (let i = 0; i < d.length; i += 4) {
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        uniq.set(key, (uniq.get(key) || 0) + 1);
    }

    // mapping from original color to nearest palette RGB using ΔE (Lab distance)
    const mapping = new Map<number, [number, number, number]>();
    for (const key of uniq.keys()) {
        const r = (key >> 16) & 0xff;
        const g = (key >> 8) & 0xff;
        const b = key & 0xff;
        const lab = srgbToLab(r, g, b);
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < palLab.length; i++) {
            const dl = lab[0] - palLab[i][0];
            const da = lab[1] - palLab[i][1];
            const db = lab[2] - palLab[i][2];
            const d2 = dl * dl + da * da + db * db;
            if (d2 < bestDist) {
                bestDist = d2;
                bestIdx = i;
            }
        }
        const p = palRGB[bestIdx];
        mapping.set(key, [p[0], p[1], p[2]]);
    }

    // remap pixels in-place
    for (let i = 0; i < d.length; i += 4) {
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        const v = mapping.get(key);
        if (v) {
            d[i] = v[0];
            d[i + 1] = v[1];
            d[i + 2] = v[2];
        }
    }

    return data;
}
