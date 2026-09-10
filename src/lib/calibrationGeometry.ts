export type CornerRounding = { bl?: boolean; br?: boolean; tr?: boolean; tl?: boolean };

export const CALIBRATION_CORNER_RADIUS_MM = 1.2;
export const CALIBRATION_CORNER_SEGMENTS = 5;

/** CCW outline of a rounded rectangle; disabled corners emit one sharp point. */
export function roundedRectOutline(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    radius: number,
    segments: number,
    round: Required<CornerRounding>
): Array<[number, number]> {
    const points: Array<[number, number]> = [];
    const corner = (
        centerX: number,
        centerY: number,
        startDegrees: number,
        endDegrees: number,
        isRounded: boolean,
        sharpX: number,
        sharpY: number
    ) => {
        if (!isRounded) {
            points.push([sharpX, sharpY]);
            return;
        }
        for (let index = 0; index <= segments; index++) {
            const degrees =
                startDegrees + (endDegrees - startDegrees) * (index / segments);
            const angle = (degrees * Math.PI) / 180;
            points.push([
                centerX + radius * Math.cos(angle),
                centerY + radius * Math.sin(angle),
            ]);
        }
    };

    corner(x1 - radius, y0 + radius, 270, 360, round.br, x1, y0);
    corner(x1 - radius, y1 - radius, 0, 90, round.tr, x1, y1);
    corner(x0 + radius, y1 - radius, 90, 180, round.tl, x0, y1);
    corner(x0 + radius, y0 + radius, 180, 270, round.bl, x0, y0);
    return points;
}
