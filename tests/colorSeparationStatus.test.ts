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
        maximumAllowedDeltaE: 6,
        satisfied: false,
        ...overrides,
    };
}

test('separation status distinguishes unique preservation from within-limit reuse', () => {
    assert.equal(
        formatColorSeparationStatus(report()),
        '1/2 colors uniquely preserved within ΔE 6 · 1 color reuses a printable color · 1 distinct printable color available · all final mappings within ΔE 6 · worst mapped ΔE 4 · no repeated filament runs needed'
    );
});

test('separation status calls out an over-limit final mapping and precise worst error', () => {
    assert.equal(
        formatColorSeparationStatus(
            report({
                printableColorCount: 2,
                mappedWithinThresholdCount: 1,
                overThresholdColorCount: 1,
                reusedPrintableColorCount: 0,
                maximumDeltaE: 6.004,
            }),
            2
        ),
        '1/2 colors uniquely preserved within ΔE 6 · 2 distinct printable colors available · 1 final mapping exceeds ΔE 6 · worst mapped ΔE 6.004 · 2 additional filament runs used'
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
            })
        ),
        '0/1 colors uniquely preserved within ΔE 6 · 0 distinct printable colors available · 1 image color has no printable mapping · worst mapped ΔE unavailable · no repeated filament runs needed'
    );
});
