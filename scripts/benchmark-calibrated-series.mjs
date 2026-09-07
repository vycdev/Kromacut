import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { resolve } from 'node:path';

const caseName = process.argv[2] ?? 'cats';
const variantName = process.argv[3] ?? 'baseline';
const requestedCount = Number(process.argv[4] ?? 3);

if (!/^[a-z0-9-]+$/.test(caseName)) throw new Error(`Invalid case name: ${caseName}`);
if (!/^[a-z0-9-]+$/.test(variantName)) throw new Error(`Invalid variant name: ${variantName}`);
if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 20) {
    throw new Error(`Run count must be an integer from 1 to 20, received: ${process.argv[4]}`);
}

const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replace(/\.\d{3}Z$/, 'Z');
const outputDirectory = resolve('.profiles', 'series', `${timestamp}-${caseName}-${variantName}`);
mkdirSync(outputDirectory, { recursive: true });

const runs = [];
for (let index = 0; index < requestedCount; index++) {
    process.stderr.write(
        `Calibrated series ${caseName}/${variantName}: run ${index + 1}/${requestedCount}\n`
    );
    const payload = await runBenchmark(caseName, variantName);
    runs.push(payload);
    writeFileSync(
        resolve(outputDirectory, `run-${String(index + 1).padStart(2, '0')}.json`),
        `${JSON.stringify(payload, null, 2)}\n`
    );
}

assertDeterministicResults(runs);

const summary = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    caseName,
    variantName,
    runCount: runs.length,
    environment: benchmarkEnvironment(),
    configuration: runs[0].configuration,
    deterministicResult: runs[0].result,
    timing: summarizeMeasurements(runs.map((run) => run.timing)),
    memory: summarizeMeasurements(runs.map((run) => run.memory)),
    runs: runs.map((run, index) => ({
        run: index + 1,
        timing: run.timing,
        memory: run.memory,
    })),
};

writeFileSync(resolve(outputDirectory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(resolve(outputDirectory, 'summary.md'), renderMarkdown(summary));

console.log(JSON.stringify({ outputDirectory, ...summary }, null, 2));

function runBenchmark(selectedCase, selectedVariant) {
    const args = [
        '--expose-gc',
        '--no-warnings',
        '--experimental-strip-types',
        'tests/benchmark/calibratedOptimizer.ts',
        selectedCase,
        selectedVariant,
    ];
    return new Promise((resolveRun, rejectRun) => {
        const child = spawn(process.execPath, args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
        });
        child.on('error', rejectRun);
        child.on('close', (code) => {
            if (code !== 0) {
                rejectRun(
                    new Error(`Calibrated benchmark exited with code ${code}.\n${stderr || stdout}`)
                );
                return;
            }
            try {
                resolveRun(JSON.parse(stdout));
            } catch (error) {
                rejectRun(
                    new Error(
                        `Could not parse calibrated benchmark output: ${error.message}\n${stdout}\n${stderr}`
                    )
                );
            }
        });
    });
}

function benchmarkEnvironment() {
    const cpuList = cpus();
    const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
    const sourceDiff = spawnSync('git', ['diff', '--no-ext-diff', 'HEAD', '--', 'src'], {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    });
    return {
        node: process.version,
        platform: platform(),
        release: release(),
        architecture: arch(),
        cpuModel: cpuList[0]?.model ?? null,
        logicalCpuCount: cpuList.length,
        gitRevision: revision.status === 0 ? revision.stdout.trim() : null,
        sourceDiffSha256:
            sourceDiff.status === 0
                ? createHash('sha256').update(sourceDiff.stdout).digest('hex')
                : null,
    };
}

function assertDeterministicResults(results) {
    const expected = stableResult(results[0].result);
    for (let index = 1; index < results.length; index++) {
        const actual = stableResult(results[index].result);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(
                `Run ${index + 1} changed the calibrated result.\nExpected ${JSON.stringify(expected)}\nReceived ${JSON.stringify(actual)}`
            );
        }
    }
}

function stableResult(result) {
    return {
        score: result.score,
        iterations: result.iterations,
        converged: result.converged,
        extraRepeatCount: result.extraRepeatCount,
        orderColors: result.orderColors,
        transitionZones: result.transitionZones,
        physicalLayers: result.physicalLayers,
        totalHeight: result.totalHeight,
        finalStackFingerprint: result.finalStackFingerprint,
        separation: result.separation,
    };
}

function summarizeMeasurements(measurements) {
    const keys = Object.keys(measurements[0]);
    return Object.fromEntries(
        keys.map((key) => {
            const values = measurements.map((measurement) => measurement[key]);
            return [
                key,
                {
                    median: median(values),
                    minimum: Math.min(...values),
                    maximum: Math.max(...values),
                    values,
                },
            ];
        })
    );
}

function median(values) {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function renderMarkdown(result) {
    const milliseconds = (value) => `${value.toFixed(1)} ms`;
    const mebibytes = (value) => `${(value / 1024 / 1024).toFixed(1)} MiB`;
    return [
        `# Calibrated benchmark series: ${result.caseName}/${result.variantName}`,
        '',
        `Runs: ${result.runCount}`,
        '',
        '| Measurement | Median | Minimum | Maximum |',
        '| --- | ---: | ---: | ---: |',
        row('Appearance fit', result.timing.appearanceFitMs, milliseconds),
        row('Optimization', result.timing.optimizationMs, milliseconds),
        row('Total', result.timing.totalMs, milliseconds),
        ...(result.memory.retainedHeapAfterGcBytes
            ? [row('Retained heap after GC', result.memory.retainedHeapAfterGcBytes, mebibytes)]
            : []),
        ...(result.memory.residentSetAfterGcBytes
            ? [row('Resident set after GC', result.memory.residentSetAfterGcBytes, mebibytes)]
            : []),
        row('Maximum RSS', result.memory.maximumResidentSetBytes, mebibytes),
        '',
        `Final-stack fingerprint: \`${result.deterministicResult.finalStackFingerprint}\``,
        `Optimizer score: ${result.deterministicResult.score}`,
        `Iterations: ${result.deterministicResult.iterations}`,
        '',
    ].join('\n');
}

function row(label, values, formatter) {
    return `| ${label} | ${formatter(values.median)} | ${formatter(values.minimum)} | ${formatter(values.maximum)} |`;
}
