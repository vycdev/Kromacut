/** Exact bounds, including partially transparent edge pixels; runs in the preparation worker. */
export function opaqueBounds(data: Uint8ClampedArray, width: number, height: number) {
    let minX = width,
        minY = height,
        maxX = -1,
        maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3]) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }
    return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
