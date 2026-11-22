import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { runBenchmarkCli } from './helpers/benchmarkCli.ts';

for (const alias of ['same path', 'hard link', 'planned input', 'saved Exact evidence']) {
    test(`benchmark refuses report output aliasing ${alias}`, async () => {
        const directory = mkdtempSync(join(tmpdir(), 'kromacut-benchmark-output-'));
        try {
            const input = join(directory, 'cases.json');
            const evidence = join(directory, 'evidence.json');
            const originalInput = gunzipSync(
                readFileSync('tests/benchmark/results/cats-exact/2026-11-01/cases-exact.json.gz')
            );
            const originalEvidence = gunzipSync(
                readFileSync(
                    'tests/benchmark/results/cats-exact/2026-11-01/fresh-exact-initial.json.gz'
                )
            );
            writeFileSync(evidence, originalEvidence);
            const prepare = alias === 'planned input' || alias === 'saved Exact evidence';
            let output = input;
            if (alias === 'planned input') {
                // A future Windows path also aliases when only its case differs.
                output = process.platform === 'win32' ? input.toUpperCase() : input;
            } else if (alias === 'saved Exact evidence') output = evidence;
            if (!prepare) writeFileSync(input, originalInput);
            if (alias === 'hard link') {
                output = join(directory, 'report-hardlink.json');
                linkSync(input, output);
            }
            const child = await runBenchmarkCli([
                '--input',
                input,
                '--output',
                output,
                '--heads',
                '2',
                '--modes',
                'luminance',
                ...(prepare ? ['--prepare', '--run', '--calibrated-result', evidence] : []),
            ]);
            assert.notEqual(child.status, 0);
            assert.match(child.stderr, /Report output must differ from benchmark inputs/);
            assert.deepEqual(readFileSync(evidence), originalEvidence);
            if (prepare) assert.equal(existsSync(input), false);
            else {
                assert.deepEqual(readFileSync(input), originalInput);
                assert.deepEqual(readFileSync(output), originalInput);
            }
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
}
