import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { dirname, resolve } from 'node:path';
import type { AutoPaintResult } from '../../src/lib/autoPaint.ts';
import type { Filament } from '../../src/types/index.ts';

export function sha256(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
}

export function measurementSummary(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return {
        values,
        median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
        minimum: sorted[0],
        maximum: sorted.at(-1),
        spread: sorted.at(-1)! - sorted[0],
    };
}

export function benchmarkEnvironment() {
    return {
        node: process.version,
        platform: platform(),
        release: release(),
        architecture: arch(),
        cpu: cpus()[0]?.model,
        logicalCpus: cpus().length,
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        sourceDiffSha256: sha256(
            execFileSync('git', ['diff', '--no-ext-diff', 'HEAD', '--', 'src'], {
                maxBuffer: 32 * 1024 * 1024,
            })
        ),
    };
}

/** Read historical source into an ignored directory without touching a checkout. */
export function benchmarkSourceRoot(ref?: string): string {
    if (!ref) return process.cwd();
    mkdirSync('dist/benchmark-source', { recursive: true });
    const root = mkdtempSync(resolve('dist/benchmark-source/revision-'));
    const archive = resolve(root, 'source.tar');
    writeFileSync(
        archive,
        execFileSync('git', ['archive', ref, 'src'], { maxBuffer: 64 * 1024 * 1024 })
    );
    execFileSync('tar', ['-xf', archive, '-C', root]);
    return root;
}

/** Resolve all external provenance before starting an expensive calculation. */
export function captureOptimizerProvenance(options: {
    fixture: string;
    profile: string;
    sourceImage: string;
    sourceRef?: string;
    harnessPath?: string;
}) {
    const {
        fixture,
        profile,
        sourceImage,
        sourceRef,
        harnessPath = 'tests/benchmark/calibratedOptimizer.ts',
    } = options;
    return {
        provenanceCapturedAt: new Date().toISOString(),
        machine: benchmarkEnvironment(),
        sourceRevision: execFileSync('git', ['rev-parse', `${sourceRef ?? 'HEAD'}^{commit}`], {
            encoding: 'utf8',
        }).trim(),
        harness: { path: harnessPath, sha256: sha256(readFileSync(harnessPath)) },
        inputs: Object.fromEntries(
            Object.entries({ fixture, profile, sourceImage }).map(([key, file]) => [
                key,
                { path: file, sha256: sha256(readFileSync(file)) },
            ])
        ),
    };
}

export function persistOptimizerEvidence(options: {
    output: string;
    provenance: ReturnType<typeof captureOptimizerProvenance>;
    configuration: unknown;
    variant: string;
    sourceRef?: string;
    phase?: string;
    sample?: number;
    optimizerDiagnostics?: unknown[];
    filaments: Filament[];
    swatches: Array<{ hex: string; count: number }>;
    result: AutoPaintResult;
    timing: { appearanceFitMs: number; optimizationMs: number };
}): string {
    const { output, provenance, ...data } = options;
    const path = resolve(output);
    const evidence = {
        schemaVersion: 1,
        measuredAt: new Date().toISOString(),
        ...provenance,
        swatchesSha256: sha256(JSON.stringify(data.swatches)),
        resultSha256: sha256(JSON.stringify(data.result)),
        ...data,
    };
    mkdirSync(dirname(path), { recursive: true });
    // Refuse accidental replacement of an earlier complete run.
    writeFileSync(path, JSON.stringify(evidence) + '\n', { flag: 'wx' });
    return path;
}
