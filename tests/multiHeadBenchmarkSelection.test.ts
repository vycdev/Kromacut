import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { runBenchmarkCli } from './helpers/benchmarkCli.ts';

const scenarios = [
    {
        name: 'a head count below the supported range',
        args: ['--heads', '1'],
        error: /--heads must contain integers from 2 through 8/,
    },
    {
        name: 'a head count above the supported range',
        args: ['--heads', '9'],
        error: /--heads must contain integers from 2 through 8/,
    },
    {
        name: 'a fractional head count',
        args: ['--heads', '2.5'],
        error: /--heads must contain integers from 2 through 8/,
    },
    {
        name: 'an unsupported grouping mode',
        args: ['--modes', 'colour'],
        error: /--modes must contain luminance or color/,
    },
    {
        name: 'unknown preparation case',
        args: ['--prepare', '--cases', 'ctas'],
        error: /Unknown preparation case/,
    },
    {
        name: 'a non-cats selection for saved cats evidence',
        args: ['--prepare', '--cases', 'rocco', '--calibrated-result', 'unused.json'],
        error: /Unknown preparation case/,
    },
    {
        name: 'a requested case absent from the input',
        args: ['--cases', 'rocco'],
        error: /Requested cases absent from input: rocco/,
    },
    {
        name: 'a partially missing explicit case selection',
        args: ['--cases', 'cats,missing'],
        error: /Requested cases absent from input: missing/,
    },
    {
        name: 'a missing saved-evidence argument',
        args: ['--prepare', '--calibrated-result'],
        error: /--calibrated-result requires a value/,
    },
    {
        name: 'a flag in place of a case argument',
        args: ['--prepare', '--cases', '--reoptimize'],
        error: /--cases requires a value/,
    },
    {
        name: 'saved evidence supplied without preparation',
        args: ['--calibrated-result', 'unused.json'],
        error: /--calibrated-result requires --prepare/,
    },
];
for (const scenario of scenarios) {
    test(`benchmark rejects ${scenario.name} without replacing input or report`, async () => {
        const directory = mkdtempSync(join(tmpdir(), 'kromacut-benchmark-selection-'));
        try {
            const input = join(directory, 'cases.json');
            const output = join(directory, 'report.json');
            const originalInput = gunzipSync(
                readFileSync('tests/benchmark/results/cats-exact/2026-11-01/cases-exact.json.gz')
            );
            const originalReport = '{"previous":"completed measurement"}\n';
            writeFileSync(input, originalInput);
            writeFileSync(output, originalReport);
            const child = await runBenchmarkCli([
                '--input',
                input,
                '--output',
                output,
                ...scenario.args,
            ]);
            assert.notEqual(child.status, 0);
            assert.match(child.stderr, scenario.error);
            assert.deepEqual(readFileSync(input), originalInput);
            assert.equal(readFileSync(output, 'utf8'), originalReport);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
}
