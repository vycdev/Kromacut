import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('archived benchmark source retains its revision when the requested ref moves', () => {
    const directory = mkdtempSync(join(tmpdir(), 'kromacut-benchmark-source-'));
    try {
        const hooks = join(directory, 'empty-hooks');
        mkdirSync(hooks);
        const gitOptions = [
            '-c',
            `core.hooksPath=${hooks}`,
            '-c',
            'core.autocrlf=false',
            '-c',
            'commit.gpgsign=false',
            '-c',
            'user.name=Benchmark Test',
            '-c',
            'user.email=benchmark-test@example.invalid',
        ];
        const git = (...args: string[]) =>
            execFileSync('git', [...gitOptions, ...args], {
                cwd: directory,
                encoding: 'utf8',
            }).trim();
        git('init', '--quiet', '--initial-branch=main');
        mkdirSync(join(directory, 'src'));
        const probe = join(directory, 'src/probe.ts');
        writeFileSync(probe, '// revision A\n');
        git('add', 'src');
        git('commit', '--quiet', '-m', 'source A');
        const first = git('rev-parse', 'HEAD');
        git('update-ref', 'refs/heads/moving', first);
        writeFileSync(probe, '// revision B\n');
        git('commit', '--quiet', '-am', 'source B');
        const second = git('rev-parse', 'HEAD');
        const helperUrl = new URL('./helpers/optimizerEvidence.ts', import.meta.url).href;
        const script = `
            import { execFileSync } from 'node:child_process';
            import { readFileSync } from 'node:fs';
            import { prepareBenchmarkSource, captureOptimizerProvenance } from ${JSON.stringify(helperUrl)};
            const source = prepareBenchmarkSource('moving');
            execFileSync('git', [...${JSON.stringify(gitOptions)}, 'update-ref', 'refs/heads/moving', ${JSON.stringify(second)}]);
            const provenance = captureOptimizerProvenance({
                source, fixture: 'src/probe.ts', profile: 'src/probe.ts',
                sourceImage: 'src/probe.ts', harnessPath: 'src/probe.ts',
            });
            process.stdout.write(JSON.stringify({
                source: readFileSync(source.root + '/src/probe.ts', 'utf8').trim(),
                sourceRevision: provenance.sourceRevision,
                machineRevision: provenance.machine.revision,
                movedRef: execFileSync('git', ['rev-parse', 'moving'], { encoding: 'utf8' }).trim(),
            }));
        `;
        const child = spawnSync(
            process.execPath,
            [
                '--no-warnings',
                '--experimental-strip-types',
                '--input-type=module',
                '--eval',
                script,
            ],
            { cwd: directory, encoding: 'utf8', timeout: 30_000 }
        );
        assert.equal(child.status, 0, child.stderr);
        assert.deepEqual(JSON.parse(child.stdout), {
            source: '// revision A',
            sourceRevision: first,
            machineRevision: second,
            movedRef: second,
        });
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
