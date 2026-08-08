export interface MatrixPhotoPoint {
    x: number;
    y: number;
}

export interface MatrixTemplateLine {
    start: MatrixPhotoPoint;
    end: MatrixPhotoPoint;
    outer: boolean;
}

export interface MatrixCornerEstimate {
    corners: MatrixPhotoPoint[];
    outerCorners: MatrixPhotoPoint[];
    confidence: number;
    method: 'detected' | 'fallback';
}

export interface RectifiedMatrixPhoto {
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
}

function solveLinearSystem(matrix: number[][], values: number[]): number[] {
    const rows = matrix.map((row, index) => [...row, values[index]]);
    for (let column = 0; column < values.length; column++) {
        let pivot = column;
        for (let row = column + 1; row < rows.length; row++) {
            if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
        }
        if (Math.abs(rows[pivot][column]) < 1e-12) throw new Error('Corner points are degenerate');
        [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
        const divisor = rows[column][column];
        for (let index = column; index <= values.length; index++) rows[column][index] /= divisor;
        for (let row = 0; row < rows.length; row++) {
            if (row === column) continue;
            const factor = rows[row][column];
            for (let index = column; index <= values.length; index++) {
                rows[row][index] -= factor * rows[column][index];
            }
        }
    }
    return rows.map((row) => row[values.length]);
}

export function createProjectiveMapper(corners: readonly MatrixPhotoPoint[]) {
    if (corners.length !== 4) throw new Error('Pick all four Stack Matrix corner markers');
    const source = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
    ];
    const matrix: number[][] = [];
    const values: number[] = [];
    for (let index = 0; index < 4; index++) {
        const [u, v] = source[index];
        const { x, y } = corners[index];
        matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
        values.push(x);
        matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
        values.push(y);
    }
    const coefficients = solveLinearSystem(matrix, values);
    return (u: number, v: number): MatrixPhotoPoint => {
        const denominator = coefficients[6] * u + coefficients[7] * v + 1;
        return {
            x: (coefficients[0] * u + coefficients[1] * v + coefficients[2]) / denominator,
            y: (coefficients[3] * u + coefficients[4] * v + coefficients[5]) / denominator,
        };
    };
}

function outerMarkerCoordinate(index: number, dataCellCount: number): number {
    return (index - 0.5) / (dataCellCount + 1);
}

export function stackMatrixOuterCorners(
    corners: readonly MatrixPhotoPoint[],
    rows: number,
    columns: number
): MatrixPhotoPoint[] {
    const project = createProjectiveMapper(corners);
    const left = outerMarkerCoordinate(0, columns);
    const right = outerMarkerCoordinate(columns + 2, columns);
    const top = outerMarkerCoordinate(0, rows);
    const bottom = outerMarkerCoordinate(rows + 2, rows);
    return [project(left, top), project(right, top), project(right, bottom), project(left, bottom)];
}

export function stackMatrixTemplateLines(
    corners: readonly MatrixPhotoPoint[],
    rows: number,
    columns: number
): MatrixTemplateLine[] {
    const project = createProjectiveMapper(corners);
    const left = outerMarkerCoordinate(0, columns);
    const right = outerMarkerCoordinate(columns + 2, columns);
    const top = outerMarkerCoordinate(0, rows);
    const bottom = outerMarkerCoordinate(rows + 2, rows);
    const lines: MatrixTemplateLine[] = [];
    for (let column = 0; column <= columns + 2; column++) {
        const u = outerMarkerCoordinate(column, columns);
        lines.push({
            start: project(u, top),
            end: project(u, bottom),
            outer: column === 0 || column === columns + 2,
        });
    }
    for (let row = 0; row <= rows + 2; row++) {
        const v = outerMarkerCoordinate(row, rows);
        lines.push({
            start: project(left, v),
            end: project(right, v),
            outer: row === 0 || row === rows + 2,
        });
    }
    return lines;
}

function polygonBounds(points: readonly MatrixPhotoPoint[]) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
    };
}

function isFiniteConvexQuadrilateral(points: readonly MatrixPhotoPoint[]): boolean {
    if (
        points.length !== 4 ||
        points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
    ) {
        return false;
    }
    const bounds = polygonBounds(points);
    if (bounds.width <= 1e-3 || bounds.height <= 1e-3) return false;
    // Below this, a technically convex board is still too close to collinear for a
    // useful calibration and its projective grid collapses into a visual fan.
    const tolerance = bounds.width * bounds.height * 0.08;
    let orientation = 0;
    for (let index = 0; index < 4; index++) {
        const first = points[index];
        const second = points[(index + 1) % 4];
        const third = points[(index + 2) % 4];
        const cross =
            (second.x - first.x) * (third.y - second.y) -
            (second.y - first.y) * (third.x - second.x);
        if (Math.abs(cross) <= tolerance) return false;
        const nextOrientation = Math.sign(cross);
        if (orientation === 0) orientation = nextOrientation;
        else if (nextOrientation !== orientation) return false;
    }
    return true;
}

export function isStackMatrixCornerLayoutValid(
    corners: readonly MatrixPhotoPoint[],
    rows: number,
    columns: number
): boolean {
    if (!isFiniteConvexQuadrilateral(corners)) return false;
    try {
        const outerCorners = stackMatrixOuterCorners(corners, rows, columns);
        if (!isFiniteConvexQuadrilateral(outerCorners)) return false;
        const markerBounds = polygonBounds(corners);
        const outerBounds = polygonBounds(outerCorners);
        return (
            outerBounds.width <= markerBounds.width * 4 &&
            outerBounds.height <= markerBounds.height * 4
        );
    } catch {
        return false;
    }
}

export function constrainStackMatrixCornerMove(
    corners: readonly MatrixPhotoPoint[],
    cornerIndex: number,
    target: MatrixPhotoPoint,
    rows: number,
    columns: number
): MatrixPhotoPoint {
    const current = corners[cornerIndex];
    if (!current || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return current;
    const candidate = corners.map((corner, index) => (index === cornerIndex ? target : corner));
    if (isStackMatrixCornerLayoutValid(candidate, rows, columns)) return target;
    if (!isStackMatrixCornerLayoutValid(corners, rows, columns)) return current;

    let valid = current;
    let validAmount = 0;
    let invalidAmount = 1;
    for (let iteration = 0; iteration < 16; iteration++) {
        const amount = (validAmount + invalidAmount) / 2;
        const point = {
            x: current.x + (target.x - current.x) * amount,
            y: current.y + (target.y - current.y) * amount,
        };
        const interpolated = corners.map((corner, index) =>
            index === cornerIndex ? point : corner
        );
        if (isStackMatrixCornerLayoutValid(interpolated, rows, columns)) {
            valid = point;
            validAmount = amount;
        } else {
            invalidAmount = amount;
        }
    }
    return valid;
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    values.sort((left, right) => left - right);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function inferMarkerCenters(
    outerCorners: readonly MatrixPhotoPoint[],
    rows: number,
    columns: number
): MatrixPhotoPoint[] {
    const project = createProjectiveMapper(outerCorners);
    const insetX = 0.5 / (columns + 2);
    const insetY = 0.5 / (rows + 2);
    return [
        project(insetX, insetY),
        project(1 - insetX, insetY),
        project(1 - insetX, 1 - insetY),
        project(insetX, 1 - insetY),
    ];
}

function fallbackOuterCorners(
    width: number,
    height: number,
    rows: number,
    columns: number
): MatrixPhotoPoint[] {
    const expectedAspect = (columns + 2) / (rows + 2);
    let boardWidth = width * 0.82;
    let boardHeight = boardWidth / expectedAspect;
    if (boardHeight > height * 0.82) {
        boardHeight = height * 0.82;
        boardWidth = boardHeight * expectedAspect;
    }
    const left = (width - boardWidth) / 2;
    const top = (height - boardHeight) / 2;
    return [
        { x: left, y: top },
        { x: left + boardWidth, y: top },
        { x: left + boardWidth, y: top + boardHeight },
        { x: left, y: top + boardHeight },
    ];
}

export function estimateStackMatrixMarkerCenters(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    rows: number,
    columns: number
): MatrixCornerEstimate {
    if (pixels.length !== width * height * 4 || width < 8 || height < 8) {
        throw new Error('Invalid Stack Matrix photo data');
    }
    const scale = Math.min(1, 280 / Math.max(width, height));
    const sampleWidth = Math.max(8, Math.round(width * scale));
    const sampleHeight = Math.max(8, Math.round(height * scale));
    const rgb = new Uint8Array(sampleWidth * sampleHeight * 3);
    for (let y = 0; y < sampleHeight; y++) {
        const sourceY = Math.min(height - 1, Math.round((y + 0.5) / scale - 0.5));
        for (let x = 0; x < sampleWidth; x++) {
            const sourceX = Math.min(width - 1, Math.round((x + 0.5) / scale - 0.5));
            const source = (sourceY * width + sourceX) * 4;
            const target = (y * sampleWidth + x) * 3;
            rgb[target] = pixels[source];
            rgb[target + 1] = pixels[source + 1];
            rgb[target + 2] = pixels[source + 2];
        }
    }

    const border = Math.max(1, Math.round(Math.min(sampleWidth, sampleHeight) * 0.025));
    const perimeter: number[][] = [[], [], []];
    for (let y = 0; y < sampleHeight; y++) {
        for (let x = 0; x < sampleWidth; x++) {
            if (
                x >= border &&
                x < sampleWidth - border &&
                y >= border &&
                y < sampleHeight - border
            ) {
                continue;
            }
            const offset = (y * sampleWidth + x) * 3;
            perimeter[0].push(rgb[offset]);
            perimeter[1].push(rgb[offset + 1]);
            perimeter[2].push(rgb[offset + 2]);
        }
    }
    const background = perimeter.map(median);
    const perimeterDistances: number[] = [];
    for (let index = 0; index < perimeter[0].length; index++) {
        perimeterDistances.push(
            Math.hypot(
                perimeter[0][index] - background[0],
                perimeter[1][index] - background[1],
                perimeter[2][index] - background[2]
            )
        );
    }
    perimeterDistances.sort((left, right) => left - right);
    const noise = perimeterDistances[Math.floor(perimeterDistances.length * 0.9)] ?? 0;
    const threshold = Math.max(24, Math.min(100, noise + 16));
    let mask = new Uint8Array(sampleWidth * sampleHeight);
    for (let index = 0; index < mask.length; index++) {
        const offset = index * 3;
        const distance = Math.hypot(
            rgb[offset] - background[0],
            rgb[offset + 1] - background[1],
            rgb[offset + 2] - background[2]
        );
        mask[index] = distance >= threshold ? 1 : 0;
    }
    // Join thin cell boundaries and small specular gaps before component selection.
    for (let pass = 0; pass < 2; pass++) {
        const expanded = mask.slice();
        for (let y = 1; y < sampleHeight - 1; y++) {
            for (let x = 1; x < sampleWidth - 1; x++) {
                const index = y * sampleWidth + x;
                if (mask[index]) continue;
                for (let dy = -1; dy <= 1 && !expanded[index]; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (mask[(y + dy) * sampleWidth + x + dx]) {
                            expanded[index] = 1;
                            break;
                        }
                    }
                }
            }
        }
        mask = expanded;
    }

    const visited = new Uint8Array(mask.length);
    const expectedAspect = (columns + 2) / (rows + 2);
    let best:
        | {
              score: number;
              area: number;
              fill: number;
              aspectScore: number;
              corners: MatrixPhotoPoint[];
          }
        | undefined;
    const queue = new Int32Array(mask.length);
    for (let start = 0; start < mask.length; start++) {
        if (!mask[start] || visited[start]) continue;
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        visited[start] = 1;
        let area = 0;
        let minX = sampleWidth;
        let minY = sampleHeight;
        let maxX = 0;
        let maxY = 0;
        let minSum = Infinity;
        let maxSum = -Infinity;
        let minDifference = Infinity;
        let maxDifference = -Infinity;
        let topLeft = { x: 0, y: 0 };
        let topRight = { x: 0, y: 0 };
        let bottomRight = { x: 0, y: 0 };
        let bottomLeft = { x: 0, y: 0 };
        while (head < tail) {
            const index = queue[head++];
            const x = index % sampleWidth;
            const y = Math.floor(index / sampleWidth);
            area++;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            const sum = x + y;
            const difference = x - y;
            if (sum < minSum) {
                minSum = sum;
                topLeft = { x, y };
            }
            if (difference > maxDifference) {
                maxDifference = difference;
                topRight = { x, y };
            }
            if (sum > maxSum) {
                maxSum = sum;
                bottomRight = { x, y };
            }
            if (difference < minDifference) {
                minDifference = difference;
                bottomLeft = { x, y };
            }
            const neighbors = [index - 1, index + 1, index - sampleWidth, index + sampleWidth];
            for (const neighbor of neighbors) {
                if (
                    neighbor < 0 ||
                    neighbor >= mask.length ||
                    visited[neighbor] ||
                    !mask[neighbor]
                ) {
                    continue;
                }
                const neighborX = neighbor % sampleWidth;
                if (Math.abs(neighborX - x) > 1) continue;
                visited[neighbor] = 1;
                queue[tail++] = neighbor;
            }
        }
        const boxWidth = maxX - minX + 1;
        const boxHeight = maxY - minY + 1;
        const areaFraction = area / mask.length;
        if (areaFraction < 0.02 || boxWidth < sampleWidth * 0.18 || boxHeight < sampleHeight * 0.18)
            continue;
        const fill = area / (boxWidth * boxHeight);
        const aspectScore = Math.exp(-Math.abs(Math.log(boxWidth / boxHeight / expectedAspect)));
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerDistance = Math.hypot(
            (centerX - sampleWidth / 2) / sampleWidth,
            (centerY - sampleHeight / 2) / sampleHeight
        );
        const centerScore = Math.max(0.25, 1 - centerDistance);
        const score = area * (0.35 + fill) * (0.45 + aspectScore) * centerScore;
        if (!best || score > best.score) {
            best = {
                score,
                area,
                fill,
                aspectScore,
                corners: [topLeft, topRight, bottomRight, bottomLeft],
            };
        }
    }

    if (!best) {
        const outerCorners = fallbackOuterCorners(width, height, rows, columns);
        return {
            outerCorners,
            corners: inferMarkerCenters(outerCorners, rows, columns),
            confidence: 0,
            method: 'fallback',
        };
    }
    const outerCorners = best.corners.map((point) => ({
        x: (point.x + 0.5) / scale,
        y: (point.y + 0.5) / scale,
    }));
    const areaConfidence = Math.min(1, best.area / (mask.length * 0.22));
    const confidence = Math.max(
        0,
        Math.min(1, areaConfidence * Math.min(1, best.fill / 0.45) * best.aspectScore)
    );
    if (confidence < 0.12) {
        const fallback = fallbackOuterCorners(width, height, rows, columns);
        return {
            outerCorners: fallback,
            corners: inferMarkerCenters(fallback, rows, columns),
            confidence,
            method: 'fallback',
        };
    }
    return {
        outerCorners,
        corners: inferMarkerCenters(outerCorners, rows, columns),
        confidence,
        method: 'detected',
    };
}

function bilinearSample(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number,
    channel: number
): number {
    if (x < 0 || x > width - 1 || y < 0 || y > height - 1) return 0;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const top =
        pixels[(y0 * width + x0) * 4 + channel] * (1 - tx) +
        pixels[(y0 * width + x1) * 4 + channel] * tx;
    const bottom =
        pixels[(y1 * width + x0) * 4 + channel] * (1 - tx) +
        pixels[(y1 * width + x1) * 4 + channel] * tx;
    return Math.round(top * (1 - ty) + bottom * ty);
}

export function rectifyStackMatrixPhoto(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    corners: readonly MatrixPhotoPoint[],
    rows: number,
    columns: number,
    maxDimension = 360
): RectifiedMatrixPhoto {
    if (pixels.length !== width * height * 4) throw new Error('Invalid Stack Matrix photo data');
    const physicalColumns = columns + 2;
    const physicalRows = rows + 2;
    const scale = Math.max(1, maxDimension) / Math.max(physicalColumns, physicalRows);
    const outputWidth = Math.max(1, Math.round(physicalColumns * scale));
    const outputHeight = Math.max(1, Math.round(physicalRows * scale));
    const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
    const project = createProjectiveMapper(corners);
    for (let y = 0; y < outputHeight; y++) {
        const boardV = (y + 0.5) / outputHeight;
        const markerV = (boardV * physicalRows - 0.5) / (rows + 1);
        for (let x = 0; x < outputWidth; x++) {
            const boardU = (x + 0.5) / outputWidth;
            const markerU = (boardU * physicalColumns - 0.5) / (columns + 1);
            const source = project(markerU, markerV);
            const offset = (y * outputWidth + x) * 4;
            output[offset] = bilinearSample(pixels, width, height, source.x, source.y, 0);
            output[offset + 1] = bilinearSample(pixels, width, height, source.x, source.y, 1);
            output[offset + 2] = bilinearSample(pixels, width, height, source.x, source.y, 2);
            output[offset + 3] = 255;
        }
    }
    return { pixels: output, width: outputWidth, height: outputHeight };
}
