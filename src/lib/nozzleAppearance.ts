export interface NozzleAppearance {
    data: Uint8ClampedArray;
    changedPixelCount: number;
    coreCount: number;
}

/** Exact nearest-seed transform on the pixel grid, with deterministic ties. */
function nearestSeeds(width: number, height: number, seeds: Uint8Array) {
    const n = width * height;
    const horizontal = new Float64Array(n);
    horizontal.fill(Infinity);
    const labels = new Int32Array(n);
    labels.fill(-1);
    for (let y = 0; y < height; y++) {
        let last = -1;
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (seeds[i]) last = x;
            if (last >= 0) {
                horizontal[i] = (x - last) ** 2;
                labels[i] = y * width + last;
            }
        }
        last = -1;
        for (let x = width - 1; x >= 0; x--) {
            const i = y * width + x;
            if (seeds[i]) last = x;
            if (last >= 0 && (x - last) ** 2 < horizontal[i]) {
                horizontal[i] = (x - last) ** 2;
                labels[i] = y * width + last;
            }
        }
    }
    const distance = new Float64Array(n);
    distance.fill(Infinity);
    const nearest = new Int32Array(n);
    nearest.fill(-1);
    const sites = new Int32Array(height);
    const cuts = new Float64Array(height + 1);
    for (let x = 0; x < width; x++) {
        let k = -1;
        for (let y = 0; y < height; y++) {
            const f = horizontal[y * width + x];
            if (!Number.isFinite(f)) continue;
            let intersection = -Infinity;
            while (k >= 0) {
                const previous = sites[k];
                intersection =
                    (f + y * y - horizontal[previous * width + x] - previous * previous) /
                    (2 * (y - previous));
                if (intersection > cuts[k]) break;
                k--;
            }
            k++;
            sites[k] = y;
            cuts[k] = k ? intersection : -Infinity;
            cuts[k + 1] = Infinity;
        }
        if (k < 0) continue;
        let current = 0;
        for (let y = 0; y < height; y++) {
            while (current < k && cuts[current + 1] < y) current++;
            const at = sites[current] * width + x;
            distance[y * width + x] = (y - sites[current]) ** 2 + horizontal[at];
            nearest[y * width + x] = labels[at];
        }
    }
    return { distance, nearest };
}

/**
 * Preview-only color-region approximation: keep centers with enough interior
 * clearance for half the line width, then reconstruct color areas from their
 * nearest surviving centers. It is not a toolpath or extrusion simulation.
 * Source alpha/silhouette and source RGB palette are preserved.
 */
export function estimateNozzleAppearance(
    width: number,
    height: number,
    source: Uint8ClampedArray,
    pixelSizeMm: number,
    lineWidthMm: number
): NozzleAppearance {
    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1 ||
        source.length !== width * height * 4 ||
        !Number.isFinite(pixelSizeMm) ||
        pixelSizeMm <= 0 ||
        !Number.isFinite(lineWidthMm) ||
        lineWidthMm <= 0
    )
        throw new Error('Invalid nozzle preview dimensions');
    const n = width * height;
    const boundary = new Uint8Array(n);
    const same = (a: number, b: number) =>
        source[b * 4 + 3] > 0 &&
        source[a * 4] === source[b * 4] &&
        source[a * 4 + 1] === source[b * 4 + 1] &&
        source[a * 4 + 2] === source[b * 4 + 2];
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (
                !source[i * 4 + 3] ||
                x === 0 ||
                y === 0 ||
                x === width - 1 ||
                y === height - 1 ||
                !same(i, i - 1) ||
                !same(i, i + 1) ||
                !same(i, i - width) ||
                !same(i, i + width)
            )
                boundary[i] = 1;
        }
    const edgeDistance = nearestSeeds(width, height, boundary).distance;
    const radius = lineWidthMm / pixelSizeMm / 2;
    const cores = new Uint8Array(n);
    let coreCount = 0;
    for (let i = 0; i < n; i++)
        if (source[i * 4 + 3] && Math.sqrt(edgeDistance[i]) + 0.5 + 1e-9 >= radius) {
            cores[i] = 1;
            coreCount++;
        }
    const data = new Uint8ClampedArray(source);
    if (!coreCount) return { data, coreCount, changedPixelCount: 0 };
    const nearest = nearestSeeds(width, height, cores).nearest;
    let changedPixelCount = 0;
    for (let i = 0; i < n; i++) {
        if (!source[i * 4 + 3]) continue;
        const from = nearest[i] * 4,
            to = i * 4;
        if (
            data[to] !== source[from] ||
            data[to + 1] !== source[from + 1] ||
            data[to + 2] !== source[from + 2]
        )
            changedPixelCount++;
        data[to] = source[from];
        data[to + 1] = source[from + 1];
        data[to + 2] = source[from + 2];
    }
    return { data, changedPixelCount, coreCount };
}
