import type { Filament } from '../types';
import { sanitizeFrontlitCalibration } from './calibration';
import { estimateHidingDistanceFromColor, normalizeHexColor } from './colorUtils';

/**
 * Preserve a stored calibration while keeping the scalar HD aligned with the
 * color currently being edited. A reverted color reuses the measured scalar;
 * a different color falls back to the color-derived estimate.
 */
export function colorEditUpdateForFilament(
    filament: Filament,
    color: string
): Partial<Omit<Filament, 'id'>> {
    const update: Partial<Omit<Filament, 'id'>> = { color };
    const calibration = sanitizeFrontlitCalibration(filament.calibration);
    if (!calibration) return update;

    const nextColor = normalizeHexColor(color, '');
    const calibratedColor = normalizeHexColor(calibration.filamentColor ?? filament.color, '');
    if (!nextColor || !calibratedColor) return update;

    update.td =
        nextColor === calibratedColor
            ? calibration.tdSingleValue
            : estimateHidingDistanceFromColor(nextColor);
    return update;
}
