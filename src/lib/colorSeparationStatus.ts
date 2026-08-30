import type { ColorSeparationReport } from './autoPaint';

function formatReportedDeltaE(value: number): string {
    return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : 'unavailable';
}

export function formatColorSeparationStatus(
    report: ColorSeparationReport,
    extraRepeatCount: number = 0
): string {
    const parts = [
        `${report.uniquelyPreservedWithinThresholdCount}/${report.requestedColorCount} colors preserved within ΔE ${report.maximumAllowedDeltaE}`,
    ];
    if (report.mergedColorCount > 0) {
        parts.push(
            report.mergedColorCount === 1
                ? '1 color dropped and merged into a preserved color'
                : `${report.mergedColorCount} colors dropped and merged into preserved colors`
        );
    }
    parts.push(
        `${report.assignedDistinctColorCount} printable surface ${report.assignedDistinctColorCount === 1 ? 'color' : 'colors'} used from ${report.printableColorCount} available`
    );
    if (report.unmappedColorCount > 0) {
        parts.push(
            report.unmappedColorCount === 1
                ? '1 image color has no printable mapping'
                : `${report.unmappedColorCount} image colors have no printable mapping`
        );
    }
    parts.push(`worst preserved ΔE ${formatReportedDeltaE(report.maximumPreservedDeltaE)}`);
    parts.push(
        extraRepeatCount > 0
            ? `${extraRepeatCount} additional filament ${extraRepeatCount === 1 ? 'run' : 'runs'} used`
            : 'no repeated filament runs needed'
    );
    return parts.join(' · ');
}
