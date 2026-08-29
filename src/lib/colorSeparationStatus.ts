import type { ColorSeparationReport } from './autoPaint';

function formatReportedDeltaE(value: number): string {
    return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : 'unavailable';
}

export function formatColorSeparationStatus(
    report: ColorSeparationReport,
    extraRepeatCount: number = 0
): string {
    const parts = [
        `${report.uniquelyPreservedWithinThresholdCount}/${report.requestedColorCount} colors uniquely preserved within ΔE ${report.maximumAllowedDeltaE}`,
    ];
    if (report.reusedPrintableColorCount > 0) {
        parts.push(
            report.reusedPrintableColorCount === 1
                ? '1 color reuses a printable color'
                : `${report.reusedPrintableColorCount} colors reuse printable colors`
        );
    }
    parts.push(
        report.printableColorCount === 1
            ? '1 distinct printable color available'
            : `${report.printableColorCount} distinct printable colors available`
    );
    if (report.unmappedColorCount > 0) {
        parts.push(
            report.unmappedColorCount === 1
                ? '1 image color has no printable mapping'
                : `${report.unmappedColorCount} image colors have no printable mapping`
        );
    }
    if (report.mappedWithinThresholdCount + report.overThresholdColorCount > 0) {
        parts.push(
            report.overThresholdColorCount === 0
                ? `all final mappings within ΔE ${report.maximumAllowedDeltaE}`
                : report.overThresholdColorCount === 1
                  ? `1 final mapping exceeds ΔE ${report.maximumAllowedDeltaE}`
                  : `${report.overThresholdColorCount} final mappings exceed ΔE ${report.maximumAllowedDeltaE}`
        );
    }
    parts.push(`worst mapped ΔE ${formatReportedDeltaE(report.maximumDeltaE)}`);
    parts.push(
        extraRepeatCount > 0
            ? `${extraRepeatCount} additional filament ${extraRepeatCount === 1 ? 'run' : 'runs'} used`
            : 'no repeated filament runs needed'
    );
    return parts.join(' · ');
}
