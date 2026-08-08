import type { Filament } from '../types';
import type { CanonicalSrgbColor, AppearanceAnchorLayer } from '../types/appearance';
import {
    fingerprintAppearanceFilaments,
    MAX_STACK_MATRIX_SAMPLES,
    type StackMatrixCalibrationV1,
} from './appearanceProfile';
import { blendColors, hexToRgb, rgbToHex, type RGB } from './autoPaint';
import { channelHds } from './calibration';
import { rgbToLab, type Rgb } from './colorDifference';
import { fingerprintJson } from './fingerprint';
import { createProjectiveMapper, type MatrixPhotoPoint } from './stackMatrixPhotoAlignment';

export type { MatrixPhotoPoint } from './stackMatrixPhotoAlignment';

export interface StackMatrixBuildOptions {
    layerHeight: number;
    firstLayerHeight: number;
    stackLayerCount: number;
    maximumSamples: number;
    backingFilamentId: string;
}

export const STACK_MATRIX_PATCH_SIZE_MM = 5;
export const STACK_MATRIX_GAP_MM = 0;

const FOUNDATION_MINIMUM_MM = 0.6;
const FOUNDATION_OPACITY_MULTIPLIER = 1.3;
const MAX_MATRIX_FILAMENTS = 8;

function roundHeight(value: number): number {
    return Math.round(value * 1e6) / 1e6;
}

function canonicalColor(rgb: RGB | Rgb): CanonicalSrgbColor {
    const values = Array.isArray(rgb) ? rgb : [rgb.r, rgb.g, rgb.b];
    const channels = values.map((channel) => Math.round(Math.max(0, Math.min(255, channel)))) as [
        number,
        number,
        number,
    ];
    return {
        space: 'srgb',
        encoding: 'uint8',
        whitePoint: 'D65',
        rgb: channels,
        hex: rgbToHex({ r: channels[0], g: channels[1], b: channels[2] }),
    };
}

export function matrixFoundationLayerThicknesses(
    backing: Filament,
    layerHeight: number,
    firstLayerHeight: number
): number[] {
    const regular = Math.max(0.001, layerHeight);
    const first = Math.max(regular, firstLayerHeight);
    const target = Math.max(
        FOUNDATION_MINIMUM_MM,
        Math.max(...channelHds(backing)) * FOUNDATION_OPACITY_MULTIPLIER
    );
    const layers = [roundHeight(first)];
    let height = first;
    while (height < target - 1e-9 && layers.length < 500) {
        layers.push(roundHeight(regular));
        height += regular;
    }
    return layers;
}

function decodeCombination(value: number, base: number, length: number): number[] {
    const stack = new Array<number>(length);
    let remaining = value;
    for (let index = length - 1; index >= 0; index--) {
        stack[index] = remaining % base;
        remaining = Math.floor(remaining / base);
    }
    return stack;
}

function stackLayers(
    filaments: readonly Filament[],
    backingIndex: number,
    foundationLayerThicknesses: readonly number[],
    stack: readonly number[],
    layerHeight: number
): AppearanceAnchorLayer[] {
    const backing = filaments[backingIndex];
    return [
        ...foundationLayerThicknesses.map((thickness) => ({
            filamentId: backing.id,
            filamentColor: backing.color.toLowerCase(),
            thickness,
        })),
        ...stack.map((filamentIndex) => ({
            filamentId: filaments[filamentIndex].id,
            filamentColor: filaments[filamentIndex].color.toLowerCase(),
            thickness: roundHeight(layerHeight),
        })),
    ];
}

function predictStackColor(
    filaments: readonly Filament[],
    backingIndex: number,
    stack: readonly number[],
    layerHeight: number
): CanonicalSrgbColor {
    let current = hexToRgb(filaments[backingIndex].color);
    let runStart = current;
    let runIndex = -1;
    let runThickness = 0;
    for (const filamentIndex of stack) {
        if (filamentIndex !== runIndex) {
            runStart = current;
            runIndex = filamentIndex;
            runThickness = 0;
        }
        runThickness += layerHeight;
        const filament = filaments[filamentIndex];
        current = blendColors(
            runStart,
            hexToRgb(filament.color),
            channelHds(filament),
            runThickness
        );
    }
    return canonicalColor(current);
}

interface Candidate {
    combinationIndex: number;
    stack: number[];
    predictedColor: CanonicalSrgbColor;
    lab: ReturnType<typeof rgbToLab>;
}

function squaredLabDistance(left: Candidate['lab'], right: Candidate['lab']): number {
    return (left.L - right.L) ** 2 + (left.a - right.a) ** 2 + (left.b - right.b) ** 2;
}

function selectHdGamutCandidates(
    candidates: Candidate[],
    filamentCount: number,
    stackLayerCount: number,
    maximumSamples: number
): Candidate[] {
    if (candidates.length <= maximumSamples) return candidates;
    const selectedIndices: number[] = [];
    const selectedSet = new Set<number>();
    const add = (candidateIndex: number) => {
        if (!selectedSet.has(candidateIndex) && selectedIndices.length < maximumSamples) {
            selectedSet.add(candidateIndex);
            selectedIndices.push(candidateIndex);
        }
    };

    // Every pure filament recipe is retained, even when the rest of the board
    // is selected for HD-predicted gamut coverage.
    for (let filamentIndex = 0; filamentIndex < filamentCount; filamentIndex++) {
        let combinationIndex = 0;
        for (let layer = 0; layer < stackLayerCount; layer++) {
            combinationIndex = combinationIndex * filamentCount + filamentIndex;
        }
        add(combinationIndex);
    }

    const minimumDistances = new Float64Array(candidates.length);
    minimumDistances.fill(Infinity);
    const updateDistances = (selectedIndex: number) => {
        const selected = candidates[selectedIndex];
        for (let index = 0; index < candidates.length; index++) {
            if (selectedSet.has(index)) {
                minimumDistances[index] = -1;
                continue;
            }
            minimumDistances[index] = Math.min(
                minimumDistances[index],
                squaredLabDistance(candidates[index].lab, selected.lab)
            );
        }
    };
    for (const selectedIndex of selectedIndices) updateDistances(selectedIndex);

    while (selectedIndices.length < maximumSamples) {
        let bestIndex = -1;
        let bestDistance = -1;
        for (let index = 0; index < candidates.length; index++) {
            const distance = minimumDistances[index];
            if (distance > bestDistance + 1e-12) {
                bestDistance = distance;
                bestIndex = index;
            }
        }
        if (bestIndex < 0) break;
        add(bestIndex);
        updateDistances(bestIndex);
    }

    return selectedIndices
        .map((index) => candidates[index])
        .sort((left, right) => left.combinationIndex - right.combinationIndex);
}

function uuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return fingerprintJson('matrix', `${Date.now()}:${Math.random()}`);
}

export function buildStackMatrixCalibration(
    inputFilaments: readonly Filament[],
    options: StackMatrixBuildOptions,
    timestamp = new Date().toISOString()
): StackMatrixCalibrationV1 {
    const filaments = inputFilaments.slice(0, MAX_MATRIX_FILAMENTS);
    if (filaments.length < 2) throw new Error('Select at least two filaments for a Stack Matrix');
    const backingIndex = filaments.findIndex(
        (filament) => filament.id === options.backingFilamentId
    );
    if (backingIndex < 0) throw new Error('The Stack Matrix backing filament is not selected');
    const stackLayerCount = Math.max(2, Math.min(6, Math.round(options.stackLayerCount)));
    const maximumSamples = Math.max(
        4,
        Math.min(MAX_STACK_MATRIX_SAMPLES, Math.round(options.maximumSamples))
    );
    const totalCombinationCount = filaments.length ** stackLayerCount;
    if (totalCombinationCount > 10_000_000) {
        throw new Error('This Stack Matrix has too many combinations');
    }

    const candidates: Candidate[] = new Array(totalCombinationCount);
    for (let combinationIndex = 0; combinationIndex < totalCombinationCount; combinationIndex++) {
        const stack = decodeCombination(combinationIndex, filaments.length, stackLayerCount);
        const predictedColor = predictStackColor(
            filaments,
            backingIndex,
            stack,
            options.layerHeight
        );
        candidates[combinationIndex] = {
            combinationIndex,
            stack,
            predictedColor,
            lab: rgbToLab([predictedColor.rgb[0], predictedColor.rgb[1], predictedColor.rgb[2]]),
        };
    }
    const selected = selectHdGamutCandidates(
        candidates,
        filaments.length,
        stackLayerCount,
        maximumSamples
    );
    const columns = Math.ceil(Math.sqrt(selected.length));
    const rows = Math.ceil(selected.length / columns);
    const foundationLayerThicknesses = matrixFoundationLayerThicknesses(
        filaments[backingIndex],
        options.layerHeight,
        options.firstLayerHeight
    );
    const samples = selected.map((candidate, index) => {
        const layers = stackLayers(
            filaments,
            backingIndex,
            foundationLayerThicknesses,
            candidate.stack,
            options.layerHeight
        );
        return {
            index,
            row: Math.floor(index / columns),
            column: index % columns,
            stack: candidate.stack,
            canonicalStackKey: fingerprintJson('stack-v1', layers),
            predictedColor: candidate.predictedColor,
        };
    });
    const pureStack = (filamentIndex: number) =>
        Array.from({ length: stackLayerCount }, () => filamentIndex);
    const markerIndices = [
        backingIndex,
        0,
        Math.floor((filaments.length - 1) / 2),
        filaments.length - 1,
    ];

    return {
        schemaVersion: 1,
        id: `stack-matrix-${uuid()}`,
        status: 'planned',
        process: {
            filamentProfileFingerprint: fingerprintAppearanceFilaments(inputFilaments),
            layerHeight: roundHeight(options.layerHeight),
            firstLayerHeight: roundHeight(options.firstLayerHeight),
            unknownFields: [],
        },
        filaments: filaments.map((filament) => ({
            id: filament.id,
            color: filament.color.toLowerCase(),
            name: filament.name || filament.brand || filament.color,
        })),
        backingFilamentIndex: backingIndex,
        foundationLayerThicknesses,
        stackLayerCount,
        grid: {
            rows,
            columns,
            patchSize: STACK_MATRIX_PATCH_SIZE_MM,
            gap: STACK_MATRIX_GAP_MM,
        },
        totalCombinationCount,
        selection: selected.length === totalCombinationCount ? 'exhaustive' : 'hd-gamut',
        samples,
        cornerStacks: markerIndices.map(pureStack),
        createdAt: timestamp,
    };
}

export function markStackMatrixExported(
    record: StackMatrixCalibrationV1,
    timestamp = new Date().toISOString()
): StackMatrixCalibrationV1 {
    return { ...record, exportedAt: timestamp };
}

export function completeStackMatrixCalibration(
    record: StackMatrixCalibrationV1,
    measuredColors: readonly Rgb[],
    photoName: string,
    referenceCorrection: boolean,
    timestamp = new Date().toISOString()
): StackMatrixCalibrationV1 {
    if (measuredColors.length !== record.samples.length) {
        throw new Error('The photographed grid does not match this Stack Matrix');
    }
    return {
        ...record,
        status: 'complete',
        samples: record.samples.map((sample, index) => ({
            ...sample,
            measuredColor: canonicalColor(measuredColors[index]),
        })),
        completedAt: timestamp,
        photoName: photoName.slice(0, 256) || 'matrix-photo',
        referenceCorrection,
    };
}

function sampleRgb(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    point: MatrixPhotoPoint,
    radius: number
): Rgb {
    const channels: number[][] = [[], [], []];
    const centerX = Math.round(point.x);
    const centerY = Math.round(point.y);
    for (let y = centerY - radius; y <= centerY + radius; y++) {
        if (y < 0 || y >= height) continue;
        for (let x = centerX - radius; x <= centerX + radius; x++) {
            if (x < 0 || x >= width) continue;
            const offset = (y * width + x) * 4;
            if (pixels[offset + 3] < 128) continue;
            channels[0].push(pixels[offset]);
            channels[1].push(pixels[offset + 1]);
            channels[2].push(pixels[offset + 2]);
        }
    }
    return channels.map((values) => {
        if (values.length === 0) return 0;
        values.sort((left, right) => left - right);
        const trim = Math.floor(values.length * 0.1);
        const kept = values.slice(trim, Math.max(trim + 1, values.length - trim));
        return Math.round(kept.reduce((sum, value) => sum + value, 0) / kept.length);
    }) as Rgb;
}

function stackEquals(left: readonly number[], right: readonly number[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function sampleStackMatrixPhoto(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    corners: readonly MatrixPhotoPoint[],
    record: StackMatrixCalibrationV1,
    referenceCorrection: boolean
): Rgb[] {
    if (pixels.length !== width * height * 4) throw new Error('Invalid Stack Matrix photo data');
    const project = createProjectiveMapper(corners);
    const horizontal =
        (Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y) +
            Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y)) /
        2;
    const vertical =
        (Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y) +
            Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y)) /
        2;
    const radius = Math.max(
        1,
        Math.floor(
            Math.min(horizontal / (record.grid.columns + 1), vertical / (record.grid.rows + 1)) *
                0.16
        )
    );
    const measured = record.samples.map((sample) =>
        sampleRgb(
            pixels,
            width,
            height,
            project(
                (sample.column + 1) / (record.grid.columns + 1),
                (sample.row + 1) / (record.grid.rows + 1)
            ),
            radius
        )
    );
    if (!referenceCorrection) return measured;

    const measuredCorners = [
        sampleRgb(pixels, width, height, project(0, 0), radius),
        sampleRgb(pixels, width, height, project(1, 0), radius),
        sampleRgb(pixels, width, height, project(1, 1), radius),
        sampleRgb(pixels, width, height, project(0, 1), radius),
    ];
    const expectedCorners = record.cornerStacks.map((stack) => {
        const sample = record.samples.find((candidate) => stackEquals(candidate.stack, stack));
        return sample?.predictedColor.rgb ?? ([128, 128, 128] as const);
    });
    const gains = [0, 1, 2].map((channel) => {
        const measuredTotal = measuredCorners.reduce((sum, color) => sum + color[channel], 0);
        const expectedTotal = expectedCorners.reduce((sum, color) => sum + color[channel], 0);
        return Math.max(0.5, Math.min(2, expectedTotal / Math.max(1, measuredTotal)));
    });
    return measured.map(
        (rgb) =>
            rgb.map((channel, index) =>
                Math.round(Math.max(0, Math.min(255, channel * gains[index])))
            ) as Rgb
    );
}

export function stackMatrixPhysicalSize(record: StackMatrixCalibrationV1): {
    width: number;
    height: number;
} {
    const physicalColumns = record.grid.columns + 2;
    const physicalRows = record.grid.rows + 2;
    return {
        width: physicalColumns * record.grid.patchSize + (physicalColumns - 1) * record.grid.gap,
        height: physicalRows * record.grid.patchSize + (physicalRows - 1) * record.grid.gap,
    };
}
