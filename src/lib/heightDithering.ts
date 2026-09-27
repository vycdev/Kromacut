/**
 * Quantize a height map in place, optionally distributing fractional heights
 * with block-aware Stucki diffusion. Zero pixels are transparent.
 */
export function quantizeHeightMap(
    pixelHeightMap: Float32Array,
    boxW: number,
    boxH: number,
    {
        layerHeight,
        slicerFirstLayerHeight,
        minModelH,
        maxModelH,
        heightDithering,
        ditherLineWidth,
        pixelSize,
    }: {
        layerHeight: number;
        slicerFirstLayerHeight: number;
        minModelH: number;
        maxModelH: number;
        heightDithering: boolean;
        ditherLineWidth: number;
        pixelSize: number;
    }
): void {
    // --- Pass 2: Quantize heights (with optional dithering) ---
    // The continuous height map has sub-layer precision, but
    // the 3D model must use discrete layer heights.  When
    // heightDithering is ON, block-aware Stucki error
    // diffusion approximates dots at the printer's line width.
    // Actual printability still needs checking in the slicer. Edges
    // between different quantized heights are protected from
    // dithering to avoid staircase artifacts that expose wrong
    // colors.  When OFF, simple rounding is used.
    if (layerHeight > 0 && heightDithering) {
        // --- Step 2a: Snap everything to the grid first ---
        const snappedMap = new Float32Array(boxW * boxH);
        for (let mi = 0; mi < boxW * boxH; mi++) {
            const h = pixelHeightMap[mi];
            if (h <= 0) {
                snappedMap[mi] = 0;
                continue;
            }
            const delta = Math.max(0, h - slicerFirstLayerHeight);
            let s = slicerFirstLayerHeight + Math.round(delta / layerHeight) * layerHeight;
            s = Math.max(minModelH, Math.min(maxModelH, s));
            snappedMap[mi] = s;
        }

        // --- Step 2b: Identify edge pixels ---
        // A pixel is on an edge if any of its 4-connected
        // neighbors has a different snapped height.  Dithering
        // these would create jagged staircases that expose the
        // wrong filament color, so we leave them at their
        // nearest-round height.
        const isEdge = new Uint8Array(boxW * boxH);
        for (let y = 0; y < boxH; y++) {
            for (let x = 0; x < boxW; x++) {
                const mi = y * boxW + x;
                const sh = snappedMap[mi];
                if (sh <= 0) continue;
                if (
                    (x > 0 && snappedMap[mi - 1] > 0 && snappedMap[mi - 1] !== sh) ||
                    (x < boxW - 1 && snappedMap[mi + 1] > 0 && snappedMap[mi + 1] !== sh) ||
                    (y > 0 && snappedMap[mi - boxW] > 0 && snappedMap[mi - boxW] !== sh) ||
                    (y < boxH - 1 && snappedMap[mi + boxW] > 0 && snappedMap[mi + boxW] !== sh)
                ) {
                    isEdge[mi] = 1;
                }
            }
        }

        // --- Step 2c: Block-aware Stucki error diffusion ---
        // Approximate the requested line width with whole-pixel blocks.
        const blockSize = Math.max(1, Math.round(ditherLineWidth / pixelSize));
        const bW = Math.ceil(boxW / blockSize);
        const bH = Math.ceil(boxH / blockSize);

        // Compute average continuous height per block
        const blockAvg = new Float64Array(bW * bH);
        const blockCnt = new Uint32Array(bW * bH);
        const blockHasEdge = new Uint8Array(bW * bH);
        for (let y = 0; y < boxH; y++) {
            for (let x = 0; x < boxW; x++) {
                const mi = y * boxW + x;
                const h = pixelHeightMap[mi]; // still continuous
                if (h <= 0) continue;
                const bx = Math.floor(x / blockSize);
                const by = Math.floor(y / blockSize);
                const bi = by * bW + bx;
                blockAvg[bi] += h;
                blockCnt[bi]++;
                if (isEdge[mi] || Math.abs(h - snappedMap[mi]) <= 1e-6) {
                    // Protect exact matches even when a block also contains
                    // fractional pixels that round to the same height.
                    blockHasEdge[bi] = 1;
                }
            }
        }
        for (let bi = 0; bi < bW * bH; bi++) {
            if (blockCnt[bi] > 0) blockAvg[bi] /= blockCnt[bi];
        }

        // Dither at block level using the Stucki kernel: a
        // wider, error-conserving diffusion than Floyd-
        // Steinberg for smoother tone and finer detail.
        // Offsets are scan-relative (dx along the serpentine
        // direction, dy downward); weights are pre-divided by 42.
        const STUCKI_KERNEL: ReadonlyArray<readonly [number, number, number]> = [
            [1, 0, 8 / 42],
            [2, 0, 4 / 42],
            [-2, 1, 2 / 42],
            [-1, 1, 4 / 42],
            [0, 1, 8 / 42],
            [1, 1, 4 / 42],
            [2, 1, 2 / 42],
            [-2, 2, 1 / 42],
            [-1, 2, 2 / 42],
            [0, 2, 4 / 42],
            [1, 2, 2 / 42],
            [2, 2, 1 / 42],
        ];
        const errBuf = new Float64Array(bW * bH);
        const blockSnapped = new Float32Array(bW * bH);

        for (let by = 0; by < bH; by++) {
            const ltr = by % 2 === 0;
            for (let bxi = 0; bxi < bW; bxi++) {
                const bx = ltr ? bxi : bW - 1 - bxi;
                const bi = by * bW + bx;
                if (blockCnt[bi] === 0) continue;

                let snapped: number;
                if (blockHasEdge[bi]) {
                    // Edge block: no dithering, use simple snap
                    const delta = Math.max(0, blockAvg[bi] - slicerFirstLayerHeight);
                    snapped =
                        slicerFirstLayerHeight + Math.round(delta / layerHeight) * layerHeight;
                } else {
                    const adjusted = blockAvg[bi] + errBuf[bi];
                    const delta = Math.max(0, adjusted - slicerFirstLayerHeight);
                    snapped =
                        slicerFirstLayerHeight + Math.round(delta / layerHeight) * layerHeight;
                }
                snapped = Math.max(minModelH, Math.min(maxModelH, snapped));
                // Keep diffusion inside the block's original adjacent
                // layer pair. In particular, incoming error must not
                // dither an exact match or a calibrated anchor. The
                // tolerance removes Float32 noise at layer boundaries.
                const layerPosition = Math.max(
                    0,
                    (blockAvg[bi] - slicerFirstLayerHeight) / layerHeight
                );
                const lower = Math.max(
                    minModelH,
                    slicerFirstLayerHeight + Math.floor(layerPosition + 1e-6) * layerHeight
                );
                const upper = Math.min(
                    maxModelH,
                    slicerFirstLayerHeight + Math.ceil(layerPosition - 1e-6) * layerHeight
                );
                snapped = Math.max(lower, Math.min(upper, snapped));
                blockSnapped[bi] = snapped;

                if (!blockHasEdge[bi]) {
                    const err = blockAvg[bi] + errBuf[bi] - snapped;
                    const dir = ltr ? 1 : -1;
                    for (let k = 0; k < STUCKI_KERNEL.length; k++) {
                        const [dx, dy, weight] = STUCKI_KERNEL[k];
                        const tx = bx + dir * dx;
                        const ty = by + dy;
                        if (tx < 0 || tx >= bW || ty >= bH) continue;
                        errBuf[ty * bW + tx] += err * weight;
                    }
                }
            }
        }

        // Write block-level results back to pixel map
        for (let y = 0; y < boxH; y++) {
            for (let x = 0; x < boxW; x++) {
                const mi = y * boxW + x;
                if (pixelHeightMap[mi] <= 0) continue;
                const bx = Math.floor(x / blockSize);
                const by = Math.floor(y / blockSize);
                const bi = by * bW + bx;
                if (blockHasEdge[bi]) {
                    // Edge blocks: use per-pixel snap
                    pixelHeightMap[mi] = snappedMap[mi];
                } else {
                    pixelHeightMap[mi] = blockSnapped[bi];
                }
            }
        }
    } else if (layerHeight > 0) {
        // Simple grid snap without error diffusion
        for (let mi = 0; mi < boxW * boxH; mi++) {
            const h = pixelHeightMap[mi];
            if (h <= 0) continue;
            const delta = Math.max(0, h - slicerFirstLayerHeight);
            let snapped = slicerFirstLayerHeight + Math.round(delta / layerHeight) * layerHeight;
            snapped = Math.max(minModelH, Math.min(maxModelH, snapped));
            pixelHeightMap[mi] = snapped;
        }
    }
}
