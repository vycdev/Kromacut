import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { runBenchmarkCli } from './helpers/benchmarkCli.ts';

test('replay rejects a changed complete result with stale preparation provenance', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kromacut-benchmark-replay-'));
    try {
        const cases = JSON.parse(
            gunzipSync(
                readFileSync('tests/benchmark/results/cats-exact/2026-11-01/cases-exact.json.gz')
            ).toString('utf8')
        );
        cases[0].result.optimizerMetadata.score++;
        const changedInput = JSON.stringify(cases);
        const previousReport = '{"previous":"completed measurement"}\n';
        const input = join(directory, 'changed-input.json');
        const output = join(directory, 'report.json');
        writeFileSync(input, changedInput);
        writeFileSync(output, previousReport);
        const child = await runBenchmarkCli([
            '--input',
            input,
            '--output',
            output,
            '--heads',
            '2',
            '--modes',
            'luminance',
        ]);
        assert.notEqual(child.status, 0);
        assert.match(child.stderr, /Cached cats result does not match its preparation provenance/);
        assert.equal(readFileSync(input, 'utf8'), changedInput);
        assert.equal(readFileSync(output, 'utf8'), previousReport);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
