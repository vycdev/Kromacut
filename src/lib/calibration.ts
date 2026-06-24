import { estimateTDFromColor } from './colorUtils';
import { blendSrgbChannel, srgbChannelToLinear } from './colorSpace';

/**
 * Filament Calibration System
 *
 * Implements TD (Transmission Distance) calibration workflow where users measure
 * light transmission through stacked filament layers to derive accurate TD values.
 *
 * Calibration process:
 * 1. User prints test patches at different layer counts (e.g., 2, 4, 6, 8, 10 layers)
 * 2. User photographs patches on backlit surface and samples RGB values
 * 3. Algorithm fits a linear-light Beer-Lambert curve to derive TD for each color channel
 * 4. Confidence score computed based on fit quality and measurement consistency
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Single measurement point: layer count and measured transmission
 */
export type CalibrationRgb = [number, number, number];

export interface CalibrationMeasurement {
    layers: number; // Number of layers printed
    rgb: CalibrationRgb; // Measured RGB value (0-255)
    transmission: CalibrationRgb; // Normalized linear-light transmission (0-1)
}

/**
 * Complete calibration result for a filament
 */
export interface CalibrationResult {
    color: string; // Hex color
    measurements: CalibrationMeasurement[];
    whiteReference?: CalibrationRgb; // Measured backlight RGB used to normalize transmission
    td: CalibrationRgb; // Fitted TD for R, G, B channels (mm)
    tdSingleValue: number; // Auto-paint working TD derived from the measured samples (mm)
    confidence: number; // 0-1 score based on fit quality
    calibrationDate: string; // ISO timestamp
    notes?: string; // Optional user notes
}

/**
 * Calibration wizard state
 */
export interface CalibrationState {
    filamentColor: string;
    measurements: CalibrationMeasurement[];
    whiteReference: CalibrationRgb;
    currentStep: 'intro' | 'print' | 'measure' | 'results';
    layerHeight: number; // mm per layer
}

// ============================================================================
// Constants
// ============================================================================

export const RECOMMENDED_LAYER_COUNTS = [2, 4, 6, 8, 10];
export const DEFAULT_WHITE_REFERENCE: CalibrationRgb = [255, 255, 255];
const MIN_MEASUREMENTS = 3;
const CONFIDENCE_THRESHOLD_EXCELLENT = 0.9;
const CONFIDENCE_THRESHOLD_GOOD = 0.7;
const WORKING_TD_MIN = 0.4;
const WORKING_TD_MAX = 12.0;
const WORKING_TD_GRID_STEPS = 240;
const MIN_CHANNEL_CONTRAST = 12;

const clampRgbChannel = (value: number, min: number) => {
    if (!Number.isFinite(value)) return min;
    return Math.min(255, Math.max(min, Math.round(value)));
};

function sanitizeWhiteReference(
    whiteReference: CalibrationRgb = DEFAULT_WHITE_REFERENCE
): CalibrationRgb {
    return [
        clampRgbChannel(whiteReference[0], 1),
        clampRgbChannel(whiteReference[1], 1),
        clampRgbChannel(whiteReference[2], 1),
    ];
}

export function validateWhiteReference(whiteReference: CalibrationRgb): {
    valid: boolean;
    error?: string;
} {
    const [r, g, b] = whiteReference;
    if (r < 1 || r > 255 || g < 1 || g > 255 || b < 1 || b > 255) {
        return {
            valid: false,
            error: 'White reference RGB values must be between 1 and 255',
        };
    }
    return { valid: true };
}

export function normalizeCalibrationMeasurements(
    measurements: CalibrationMeasurement[],
    whiteReference: CalibrationRgb = DEFAULT_WHITE_REFERENCE
): CalibrationMeasurement[] {
    return measurements.map((measurement) => ({
        ...measurement,
        transmission: rgbToTransmission(measurement.rgb, whiteReference),
    }));
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function getBlendChannelWeights(
    filamentRgb: CalibrationRgb,
    whiteReference: CalibrationRgb
): CalibrationRgb {
    const rawWeights: CalibrationRgb = [0, 1, 2].map((channel) => {
        const contrast = Math.abs(whiteReference[channel] - filamentRgb[channel]);
        return contrast >= MIN_CHANNEL_CONTRAST ? contrast : contrast * 0.25;
    }) as CalibrationRgb;
    const total = rawWeights.reduce((sum, weight) => sum + weight, 0);

    if (total <= 1e-6) {
        return [1 / 3, 1 / 3, 1 / 3];
    }

    return rawWeights.map((weight) => weight / total) as CalibrationRgb;
}

function predictWorkingBlendRgb(
    filamentRgb: CalibrationRgb,
    whiteReference: CalibrationRgb,
    td: number,
    thickness: number
): CalibrationRgb {
    const transmission = Math.pow(10, -thickness / td);
    return [
        Math.round(blendSrgbChannel(whiteReference[0], filamentRgb[0], transmission)),
        Math.round(blendSrgbChannel(whiteReference[1], filamentRgb[1], transmission)),
        Math.round(blendSrgbChannel(whiteReference[2], filamentRgb[2], transmission)),
    ];
}

function transmissionFromMeasuredBlend(
    measured: number,
    filament: number,
    background: number
): number | undefined {
    const filamentLinear = srgbChannelToLinear(filament);
    const backgroundLinear = srgbChannelToLinear(background);
    const contrast = backgroundLinear - filamentLinear;

    if (Math.abs(contrast) < 1e-6) return undefined;

    const transmission = (srgbChannelToLinear(measured) - filamentLinear) / contrast;
    return transmission > 0 && transmission < 1 ? transmission : undefined;
}

function evaluateWorkingTdFit(
    measurements: CalibrationMeasurement[],
    layerHeight: number,
    filamentRgb: CalibrationRgb,
    whiteReference: CalibrationRgb,
    channelWeights: CalibrationRgb,
    td: number
): number {
    let weightedSquaredError = 0;

    for (const measurement of measurements) {
        const thickness = measurement.layers * layerHeight;
        const predicted = predictWorkingBlendRgb(filamentRgb, whiteReference, td, thickness);

        weightedSquaredError +=
            channelWeights[0] * Math.pow(predicted[0] - measurement.rgb[0], 2) +
            channelWeights[1] * Math.pow(predicted[1] - measurement.rgb[1], 2) +
            channelWeights[2] * Math.pow(predicted[2] - measurement.rgb[2], 2);
    }

    return weightedSquaredError / measurements.length;
}

function fitWorkingTdFromMeasurements(
    measurements: CalibrationMeasurement[],
    layerHeight: number,
    filamentColor: string,
    whiteReference: CalibrationRgb = DEFAULT_WHITE_REFERENCE
): { td: number; confidence: number } {
    const filamentRgb = hexToRgb(filamentColor);
    if (!filamentRgb) {
        return { td: estimateTDFromColor(filamentColor), confidence: 0.1 };
    }

    const reference = sanitizeWhiteReference(whiteReference);
    const channelWeights = getBlendChannelWeights(filamentRgb, reference);
    const heuristicTd = estimateTDFromColor(filamentColor);
    const logMin = Math.log(WORKING_TD_MIN);
    const logMax = Math.log(WORKING_TD_MAX);

    let bestTd = heuristicTd;
    let bestError = Number.POSITIVE_INFINITY;

    for (let i = 0; i < WORKING_TD_GRID_STEPS; i++) {
        const t = i / (WORKING_TD_GRID_STEPS - 1);
        const candidateTd = Math.exp(logMin + (logMax - logMin) * t);
        const error = evaluateWorkingTdFit(
            measurements,
            layerHeight,
            filamentRgb,
            reference,
            channelWeights,
            candidateTd
        );

        if (error < bestError) {
            bestError = error;
            bestTd = candidateTd;
        }
    }

    let refineMin = Math.max(WORKING_TD_MIN, bestTd / 1.8);
    let refineMax = Math.min(WORKING_TD_MAX, bestTd * 1.8);

    for (let pass = 0; pass < 2; pass++) {
        let passBestTd = bestTd;
        let passBestError = bestError;

        for (let i = 0; i < WORKING_TD_GRID_STEPS; i++) {
            const t = i / (WORKING_TD_GRID_STEPS - 1);
            const candidateTd = refineMin + (refineMax - refineMin) * t;
            const error = evaluateWorkingTdFit(
                measurements,
                layerHeight,
                filamentRgb,
                reference,
                channelWeights,
                candidateTd
            );

            if (error < passBestError) {
                passBestError = error;
                passBestTd = candidateTd;
            }
        }

        bestTd = passBestTd;
        bestError = passBestError;
        refineMin = Math.max(WORKING_TD_MIN, bestTd / 1.35);
        refineMax = Math.min(WORKING_TD_MAX, bestTd * 1.35);
    }

    const weightedRmse = Math.sqrt(bestError);
    const averageContrast =
        (Math.abs(reference[0] - filamentRgb[0]) +
            Math.abs(reference[1] - filamentRgb[1]) +
            Math.abs(reference[2] - filamentRgb[2])) /
        3;
    const contrastStrength = clamp(averageContrast / 255, 0, 1);
    const measurementCoverage = clamp(
        (measurements.length - MIN_MEASUREMENTS) / (RECOMMENDED_LAYER_COUNTS.length - MIN_MEASUREMENTS),
        0,
        1
    );
    const fitConfidence = clamp(1 - weightedRmse / 28, 0, 1);
    const agreement =
        Math.min(bestTd, heuristicTd) / Math.max(bestTd, heuristicTd, WORKING_TD_MIN);
    const measurementInfluence = clamp(
        fitConfidence *
            (0.3 + 0.7 * contrastStrength) *
            (0.6 + 0.4 * measurementCoverage) *
            (0.35 + 0.65 * Math.sqrt(agreement)),
        0,
        0.9
    );

    const blendedTd = clamp(
        heuristicTd + (bestTd - heuristicTd) * measurementInfluence,
        WORKING_TD_MIN,
        WORKING_TD_MAX
    );
    const confidence = clamp(0.25 + 0.75 * Math.max(fitConfidence, measurementInfluence), 0.1, 1);

    return { td: blendedTd, confidence };
}

// ============================================================================
// Core Calibration Algorithm
// ============================================================================

/**
 * Calculate TD from calibration measurements using Beer-Lambert law.
 *
 * Beer-Lambert: T = 10^(-d/TD)
 * Where T = transmission, d = distance (layers × layer_height), TD = transmission distance
 *
 * Solving for TD: TD = -d / log10(T)
 *
 * For each channel, we compute TD from each measurement pair, then
 * use weighted least-squares to fit a robust average.
 */
export function calculateTDFromMeasurements(
    measurements: CalibrationMeasurement[],
    layerHeight: number,
    whiteReference: CalibrationRgb = DEFAULT_WHITE_REFERENCE,
    filamentColor: string = '#808080'
): { td: [number, number, number]; tdSingleValue: number; confidence: number } {
    if (measurements.length < MIN_MEASUREMENTS) {
        throw new Error(
            `Need at least ${MIN_MEASUREMENTS} measurements, got ${measurements.length}`
        );
    }

    // Sort measurements by layer count
    const normalizedMeasurements = normalizeCalibrationMeasurements(measurements, whiteReference);
    const sorted = normalizedMeasurements.sort((a, b) => a.layers - b.layers);

    // Compute TD for each channel independently
    const tdChannels: [number, number, number] = [0, 0, 0];
    const confidences: [number, number, number] = [0, 0, 0];

    const filamentRgb = hexToRgb(filamentColor) ?? [128, 128, 128];
    const reference = sanitizeWhiteReference(whiteReference);

    for (let channel = 0; channel < 3; channel++) {
        const { td, confidence } = fitTDForChannel(
            sorted,
            channel,
            layerHeight,
            filamentRgb,
            reference
        );
        tdChannels[channel] = td;
        confidences[channel] = confidence;
    }

    const workingFit = fitWorkingTdFromMeasurements(
        sorted,
        layerHeight,
        filamentColor,
        whiteReference
    );
    const tdSingleValue = workingFit.td;

    // Overall confidence combines the per-channel fit stability with the
    // working-TD fit quality used by auto-paint.
    const confidence = (Math.min(...confidences) + workingFit.confidence) / 2;

    return { td: tdChannels, tdSingleValue, confidence };
}

/**
 * Fit TD for a single color channel using weighted least-squares
 */
function fitTDForChannel(
    measurements: CalibrationMeasurement[],
    channel: number,
    layerHeight: number,
    filamentRgb: CalibrationRgb,
    whiteReference: CalibrationRgb
): { td: number; confidence: number } {
    // Compute TD from each measurement
    const tdEstimates: Array<{ td: number; thickness: number; transmission: number }> = [];

    for (const measurement of measurements) {
        const transmission = transmissionFromMeasuredBlend(
            measurement.rgb[channel],
            filamentRgb[channel],
            whiteReference[channel]
        );
        if (transmission === undefined) continue; // Skip invalid or zero-contrast measurements

        const thickness = measurement.layers * layerHeight;
        const td = -thickness / Math.log10(transmission);

        if (td > 0 && td < 100) {
            // Sanity check: TD should be 0.5-20mm typically
            tdEstimates.push({ td, thickness, transmission });
        }
    }

    if (tdEstimates.length === 0) {
        // Fallback: return default TD with low confidence
        return { td: 2.0, confidence: 0.1 };
    }

    // Weighted average: measurements with moderate transmission (0.2-0.8) get higher weight
    let weightedSum = 0;
    let totalWeight = 0;

    for (const { td, transmission } of tdEstimates) {
        // Weight function: peaks at T=0.5, but preserve a small contribution
        // from valid measurements near either endpoint.
        const weight = Math.max(0.05, 1 - Math.abs(transmission - 0.5) * 2);
        weightedSum += td * weight;
        totalWeight += weight;
    }

    const tdFitted = weightedSum / totalWeight;

    // Calculate confidence based on consistency of estimates
    const variance =
        tdEstimates.reduce((sum, { td }) => sum + Math.pow(td - tdFitted, 2), 0) /
        tdEstimates.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / tdFitted;

    // Confidence: 1.0 if CV < 0.1, decreases linearly to 0.5 at CV = 0.4
    const confidence = Math.max(0.5, 1.0 - coefficientOfVariation * 2.5);

    return { td: tdFitted, confidence };
}

/**
 * Convert measured RGB values to normalized linear-light transmission values.
 * Uses a measured white reference so camera and backlight tint are normalized out.
 */
export function rgbToTransmission(
    rgb: CalibrationRgb,
    whiteReference: CalibrationRgb = DEFAULT_WHITE_REFERENCE
): CalibrationRgb {
    const reference = sanitizeWhiteReference(whiteReference);
    return [
        Math.max(0, Math.min(1, srgbChannelToLinear(rgb[0]) / srgbChannelToLinear(reference[0]))),
        Math.max(0, Math.min(1, srgbChannelToLinear(rgb[1]) / srgbChannelToLinear(reference[1]))),
        Math.max(0, Math.min(1, srgbChannelToLinear(rgb[2]) / srgbChannelToLinear(reference[2]))),
    ];
}

/**
 * Estimate expected RGB for a given layer count based on current TD estimate.
 * Useful for showing preview during calibration.
 */
export function predictTransmission(
    filamentColor: string,
    layers: number,
    layerHeight: number,
    td: [number, number, number],
    whiteReference: CalibrationRgb = DEFAULT_WHITE_REFERENCE
): CalibrationRgb {
    const thickness = layers * layerHeight;

    // Parse filament color
    const rgb = hexToRgb(filamentColor);
    if (!rgb) return [128, 128, 128];

    // Beer-Lambert: T = 10^(-d/TD)
    const transmission: [number, number, number] = [
        Math.pow(10, -thickness / td[0]),
        Math.pow(10, -thickness / td[1]),
        Math.pow(10, -thickness / td[2]),
    ];

    const reference = sanitizeWhiteReference(whiteReference);

    // Simulate the same linear-light blend Auto-paint uses: the filament is
    // the foreground and the measured backlight is the background.
    return [
        Math.round(blendSrgbChannel(reference[0], rgb[0], transmission[0])),
        Math.round(blendSrgbChannel(reference[1], rgb[1], transmission[1])),
        Math.round(blendSrgbChannel(reference[2], rgb[2], transmission[2])),
    ];
}

// ============================================================================
// Confidence Scoring
// ============================================================================

/**
 * Compute confidence score for a filament profile.
 * Takes into account:
 * - Whether calibration data exists
 * - Quality of calibration fit
 * - Age of calibration
 * - Number of measurements
 */
export function computeProfileConfidence(profile: {
    calibration?: CalibrationResult;
    transmissionDistance: number;
}): number {
    if (!profile.calibration) {
        // No calibration data: base confidence on TD value
        // Lower TD = more typical for lithophanes = higher confidence
        const td = profile.transmissionDistance;
        if (td >= 1.0 && td <= 5.0) return 0.5; // Reasonable estimate
        if (td >= 0.5 && td <= 10.0) return 0.3; // Plausible but uncertain
        return 0.1; // Likely a guess
    }

    const cal = profile.calibration;
    let confidence = cal.confidence;

    // Penalize old calibrations (>6 months)
    const ageMs = Date.now() - new Date(cal.calibrationDate).getTime();
    const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30);
    if (ageMonths > 6) {
        confidence *= Math.max(0.7, 1 - (ageMonths - 6) / 24); // Decay over 2 years
    }

    // Bonus for more measurements
    const measurementBonus = Math.min(0.1, cal.measurements.length * 0.02);
    confidence = Math.min(1.0, confidence + measurementBonus);

    return confidence;
}

/**
 * Get confidence label for UI display
 */
export function getConfidenceLabel(confidence: number): string {
    if (confidence >= CONFIDENCE_THRESHOLD_EXCELLENT) return 'Excellent';
    if (confidence >= CONFIDENCE_THRESHOLD_GOOD) return 'Good';
    if (confidence >= 0.5) return 'Fair';
    return 'Low';
}

/**
 * Get confidence color for UI display (Tailwind classes)
 */
export function getConfidenceColor(confidence: number): string {
    if (confidence >= CONFIDENCE_THRESHOLD_EXCELLENT) return 'text-green-600';
    if (confidence >= CONFIDENCE_THRESHOLD_GOOD) return 'text-blue-600';
    if (confidence >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate a calibration measurement
 */
export function validateMeasurement(
    measurement: CalibrationMeasurement,
    whiteReference: CalibrationRgb = DEFAULT_WHITE_REFERENCE
): { valid: boolean; error?: string } {
    if (measurement.layers < 1 || measurement.layers > 50) {
        return { valid: false, error: 'Layer count must be between 1 and 50' };
    }

    const [r, g, b] = measurement.rgb;
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
        return { valid: false, error: 'RGB values must be between 0 and 255' };
    }

    const [tR, tG, tB] = rgbToTransmission(measurement.rgb, whiteReference);
    if (tR < 0 || tR > 1 || tG < 0 || tG > 1 || tB < 0 || tB > 1) {
        return { valid: false, error: 'Transmission values must be between 0 and 1' };
    }

    return { valid: true };
}

/**
 * Check if measurements are ready for TD calculation
 */
export function canCalculateTD(
    measurements: CalibrationMeasurement[],
    whiteReference: CalibrationRgb = DEFAULT_WHITE_REFERENCE
): {
    ready: boolean;
    reason?: string;
} {
    const whiteReferenceValidation = validateWhiteReference(whiteReference);
    if (!whiteReferenceValidation.valid) {
        return { ready: false, reason: whiteReferenceValidation.error };
    }

    if (measurements.length < MIN_MEASUREMENTS) {
        return {
            ready: false,
            reason: `Need at least ${MIN_MEASUREMENTS} measurements (have ${measurements.length})`,
        };
    }

    // Check for duplicate layer counts
    const layerCounts = new Set(measurements.map((m) => m.layers));
    if (layerCounts.size < measurements.length) {
        return { ready: false, reason: 'Duplicate layer counts detected' };
    }

    // Validate each measurement
    for (const measurement of measurements) {
        const validation = validateMeasurement(measurement, whiteReference);
        if (!validation.valid) {
            return { ready: false, reason: validation.error };
        }
    }

    return { ready: true };
}

/**
 * Get recommended layer counts that haven't been measured yet
 */
export function getRecommendedLayerCounts(
    existing: CalibrationMeasurement[]
): { recommended: number[]; measured: number[] } {
    const measured = existing.map((m) => m.layers);
    const recommended = RECOMMENDED_LAYER_COUNTS.filter((count) => !measured.includes(count));
    return { recommended, measured };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse hex color to RGB
 */
function hexToRgb(hex: string): [number, number, number] | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
        : null;
}

/**
 * Generate calibration instructions for user
 */
export function getCalibrationInstructions(layerHeight: number): string[] {
    return [
        `Print test patches with ${RECOMMENDED_LAYER_COUNTS.join(', ')} layers each.`,
        `Use your filament color with 100% infill.`,
        `Layer height: ${layerHeight.toFixed(2)}mm.`,
        `Place patches on a backlit white surface (e.g., phone screen at max brightness).`,
        `Measure the bare backlight first and enter that RGB as the white reference.`,
        `Photograph patches under consistent lighting.`,
        `Use color picker tool to sample RGB values from center of each patch.`,
        `Enter measurements in the calibration wizard.`,
    ];
}

/**
 * Export calibration result to JSON for sharing
 */
export function exportCalibration(result: CalibrationResult): string {
    return JSON.stringify(result, null, 2);
}

/**
 * Import calibration result from JSON
 */
export function importCalibration(json: string): CalibrationResult {
    const parsed = JSON.parse(json);

    // Validation
    if (
        typeof parsed.color !== 'string' ||
        !Array.isArray(parsed.measurements) ||
        !Array.isArray(parsed.td) ||
        typeof parsed.tdSingleValue !== 'number' ||
        typeof parsed.confidence !== 'number'
    ) {
        throw new Error('Invalid calibration data format');
    }

    if (parsed.whiteReference !== undefined) {
        if (
            !Array.isArray(parsed.whiteReference) ||
            parsed.whiteReference.length !== 3 ||
            !validateWhiteReference(parsed.whiteReference as CalibrationRgb).valid
        ) {
            throw new Error('Invalid calibration white reference');
        }
    }

    const whiteReference = (parsed.whiteReference as CalibrationRgb | undefined) ?? undefined;

    return {
        ...(parsed as CalibrationResult),
        whiteReference,
        measurements: normalizeCalibrationMeasurements(
            parsed.measurements as CalibrationMeasurement[],
            whiteReference ?? DEFAULT_WHITE_REFERENCE
        ),
    };
}
