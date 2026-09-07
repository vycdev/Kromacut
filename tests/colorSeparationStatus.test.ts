import assert from 'node:assert/strict';
import test from 'node:test';

import { formatColorSeparationStatus } from '../src/lib/colorSeparationStatus.ts';
import type { ColorSeparationReport } from '../src/lib/autoPaint.ts';

function report(overrides: Partial<ColorSeparationReport> = {}): ColorSeparationReport {
    return {
        requestedColorCount: 2,
        printableColorCount: 1,
        assignedDistinctColorCount: 1,
        uniquelyPreservedWithinThresholdCount: 1,
        unacceptableColorCount: 1,
        mappedWithinThresholdCount: 2,
        overThresholdColorCount: 0,
        unmappedColorCount: 0,
        reusedPrintableColorCount: 1,
        maximumDeltaE: 4,
        maximumPreservedDeltaE: 4,
        preservedTargetWeight: 0.5,
        preservedWeightedMeanDeltaE: 4,
        mergedColorCount: 1,
        maximumAllowedDeltaE: 6,
        satisfied: false,
        ...overrides,
    };
}

test('separation status explains that unmatched colors are dropped and merged', () => {
    assert.equal(
        formatColorSeparationStatus(report()),
        '1/2 colors preserved within ΔE 6 · 1 color dropped and merged into a preserved color · 1 printable surface color used from 1 available · worst preserved ΔE 4 · no repeated filament runs needed'
    );
});

test('separation status reports available capacity without treating a merged color as preserved', () => {
    assert.equal(
        formatColorSeparationStatus(
            report({
                printableColorCount: 2,
                mappedWithinThresholdCount: 1,
                overThresholdColorCount: 1,
                reusedPrintableColorCount: 1,
                maximumDeltaE: 6.004,
                mergedColorCount: 1,
            }),
            2
        ),
        '1/2 colors preserved within ΔE 6 · 1 color dropped and merged into a preserved color · 1 printable surface color used from 2 available · worst preserved ΔE 4 · 2 additional filament runs used'
    );
});

test('separation status keeps unmapped colors separate from over-limit mappings', () => {
    assert.equal(
        formatColorSeparationStatus(
            report({
                requestedColorCount: 1,
                printableColorCount: 0,
                assignedDistinctColorCount: 0,
                uniquelyPreservedWithinThresholdCount: 0,
                mappedWithinThresholdCount: 0,
                overThresholdColorCount: 0,
                unmappedColorCount: 1,
                reusedPrintableColorCount: 0,
                maximumDeltaE: Infinity,
                maximumPreservedDeltaE: Infinity,
                preservedTargetWeight: 0,
                preservedWeightedMeanDeltaE: Infinity,
                mergedColorCount: 0,
            })
        ),
        '0/1 colors preserved within ΔE 6 · 0 printable surface colors used from 0 available · 1 image color has no printable mapping · worst preserved ΔE unavailable · no repeated filament runs needed'
    );
});
