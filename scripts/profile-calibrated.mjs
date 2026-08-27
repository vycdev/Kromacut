import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { resolve } from 'node:path';

const caseName = process.argv[2] ?? 'cats';
if (!/^[a-z0-9-]+$/.test(caseName)) {
    throw new Error(`Invalid calibrated optimizer case name: ${caseName}`);
}
const variantName = process.argv[3] ?? 'baseline';
if (!/^[a-z0-9-]+$/.test(variantName)) {
    throw new Error(`Invalid calibrated optimizer variant name: ${variantName}`);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const runName = variantName === 'baseline' ? caseName : `${caseName}-${variantName}`;
const outputDirectory = resolve('.profiles', `${timestamp}-${runName}`);
const profilePath = resolve(outputDirectory, 'optimizer.cpuprofile');
const samplingIntervalMicroseconds = 1000;
mkdirSync(outputDirectory, { recursive: true });

const childArguments = [
    '--cpu-prof',
    `--cpu-prof-dir=${outputDirectory}`,
    '--cpu-prof-name=optimizer.cpuprofile',
    `--cpu-prof-interval=${samplingIntervalMicroseconds}`,
    '--enable-source-maps',
    '--expose-gc',
    '--no-warnings',
    '--experimental-strip-types',
    resolve('tests', 'benchmark', 'calibratedOptimizer.ts'),
    caseName,
    variantName,
];

console.error(`Profiling calibrated case "${caseName}"...`);
console.error(`Profile output: ${outputDirectory}`);

let benchmarkOutput = '';
const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, childArguments, {
        cwd: process.cwd(),
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['inherit', 'pipe', 'inherit'],
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
        benchmarkOutput += chunk;
        process.stdout.write(chunk);
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
        if (signal) reject(new Error(`Profiler process stopped by ${signal}`));
        else resolveExit(code ?? 1);
    });
});

if (exitCode !== 0) {
    process.exitCode = exitCode;
} else {
    const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
    const benchmark = parseBenchmarkOutput(benchmarkOutput);
    const workload = readWorkload(caseName);
    const summary = summarizeProfile(profile, runName, {
        benchmark,
        workload,
        samplingIntervalMicroseconds,
    });
    const benchmarkJsonPath = resolve(outputDirectory, 'benchmark.json');
    const summaryJsonPath = resolve(outputDirectory, 'summary.json');
    const summaryMarkdownPath = resolve(outputDirectory, 'summary.md');
    writeFileSync(benchmarkJsonPath, `${JSON.stringify(benchmark, null, 2)}\n`);
    writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`);
    writeFileSync(summaryMarkdownPath, renderMarkdown(summary));

    console.error('');
    console.error('Top application functions by sampled self time:');
    for (const entry of summary.applicationHotFunctions.slice(0, 20)) {
        console.error(
            `${entry.percent.toFixed(1).padStart(5)}%  ${formatDuration(entry.selfMicroseconds).padStart(9)}  ${entry.functionName}  ${entry.location}`
        );
    }
    console.error('');
    console.error(`Readable summary: ${summaryMarkdownPath}`);
    console.error(`Raw CPU profile:  ${profilePath}`);
}

function summarizeProfile(profile, fixture, metadata) {
    const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
    const parentByNodeId = new Map();
    for (const node of profile.nodes) {
        for (const childId of node.children ?? []) parentByNodeId.set(childId, node.id);
    }
    const totalsByFrame = new Map();
    const samples = profile.samples ?? [];
    const timeDeltas = profile.timeDeltas ?? [];
    let sampledMicroseconds = 0;

    for (let index = 0; index < samples.length; index++) {
        const delta = Number(timeDeltas[index] ?? 0);
        if (!Number.isFinite(delta) || delta < 0) continue;
        sampledMicroseconds += delta;
        const node = nodesById.get(samples[index]);
        if (!node) continue;
        const frame = node.callFrame;
        const functionName = frame.functionName || '(anonymous)';
        const url = normalizeLocationUrl(frame.url || '');
        const source = relativeSource(url);
        const line = Math.max(0, Number(frame.lineNumber ?? -1)) + 1;
        const column = Math.max(0, Number(frame.columnNumber ?? -1)) + 1;
        const location = url ? `${url}:${line}:${column}` : '(runtime)';
        const key = `${functionName}\u0000${location}`;
        const current = totalsByFrame.get(key) ?? {
            functionName,
            source,
            location,
            selfMicroseconds: 0,
            samples: 0,
            callersByFrame: new Map(),
        };
        current.selfMicroseconds += delta;
        current.samples += 1;
        const parent = nodesById.get(parentByNodeId.get(node.id));
        const callerName = parent ? parent.callFrame.functionName || '(anonymous)' : '(root)';
        const callerUrl = normalizeLocationUrl(parent?.callFrame?.url || '');
        const callerLine = Math.max(0, Number(parent?.callFrame?.lineNumber ?? -1)) + 1;
        const callerLocation = callerUrl ? `${callerUrl}:${callerLine}` : '(runtime)';
        const callerKey = `${callerName}\u0000${callerLocation}`;
        const caller = current.callersByFrame.get(callerKey) ?? {
            functionName: callerName,
            location: callerLocation,
            selfMicroseconds: 0,
        };
        caller.selfMicroseconds += delta;
        current.callersByFrame.set(callerKey, caller);
        totalsByFrame.set(key, current);
    }

    const ranked = Array.from(totalsByFrame.values(), (entry) => {
        const { callersByFrame, ...frame } = entry;
        return {
            ...frame,
            percent:
                sampledMicroseconds > 0 ? (entry.selfMicroseconds / sampledMicroseconds) * 100 : 0,
            callers: [...callersByFrame.values()].sort(
                (left, right) => right.selfMicroseconds - left.selfMicroseconds
            ),
        };
    }).sort(
        (left, right) =>
            right.selfMicroseconds - left.selfMicroseconds ||
            left.functionName.localeCompare(right.functionName)
    );
    const applicationHotFunctions = ranked.filter((entry) => isApplicationLocation(entry.location));
    const applicationHotSymbols = aggregateBySymbol(applicationHotFunctions, sampledMicroseconds);

    const effectiveSettings = metadata.benchmark.configuration ?? metadata.workload.settings;
    const effectiveFixture =
        metadata.benchmark.variant && metadata.benchmark.variant !== 'baseline'
            ? `${metadata.benchmark.fixture}/${metadata.benchmark.variant}`
            : (metadata.benchmark.fixture ?? fixture);
    return {
        fixture: effectiveFixture,
        capturedAt: new Date().toISOString(),
        workload: {
            name:
                metadata.benchmark.variant && metadata.benchmark.variant !== 'baseline'
                    ? `${metadata.workload.name} / ${metadata.benchmark.variant}`
                    : metadata.workload.name,
            profileSha256: metadata.workload.sha256?.profile ?? null,
            sourceImageSha256: metadata.workload.sha256?.sourceImage ?? null,
            settingsSha256: hashJson(effectiveSettings),
            settings: effectiveSettings,
        },
        benchmark: metadata.benchmark,
        environment: collectEnvironment(metadata.samplingIntervalMicroseconds),
        sampledMicroseconds,
        sampledDuration: formatDuration(sampledMicroseconds),
        sampleCount: samples.length,
        applicationHotFunctions: applicationHotFunctions.slice(0, 100),
        applicationHotSymbols: applicationHotSymbols.slice(0, 100),
        overallHotFunctions: ranked.slice(0, 100),
    };
}

function parseBenchmarkOutput(output) {
    const trimmed = output.trim();
    if (!trimmed) throw new Error('Calibrated benchmark produced no JSON output');
    try {
        return JSON.parse(trimmed);
    } catch (error) {
        throw new Error(`Could not parse calibrated benchmark JSON: ${error.message}`);
    }
}

function readWorkload(fixture) {
    const casePath = resolve(
        'tests',
        'assets',
        'performance',
        '8-colors-frontlit-2026-08-26',
        fixture,
        'case.json'
    );
    return JSON.parse(readFileSync(casePath, 'utf8'));
}

function collectEnvironment(samplingInterval) {
    const cpuList = cpus();
    const gitRevision = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });
    const gitStatus = spawnSync('git', ['status', '--porcelain'], {
        cwd: process.cwd(),
        encoding: 'utf8',
    });
    return {
        node: process.version,
        platform: platform(),
        release: release(),
        architecture: arch(),
        cpuModel: cpuList[0]?.model ?? null,
        logicalCpuCount: cpuList.length,
        totalMemoryBytes: totalmem(),
        gitRevision: gitRevision.status === 0 ? gitRevision.stdout.trim() : null,
        gitDirty: gitStatus.status === 0 ? gitStatus.stdout.trim().length > 0 : null,
        samplingIntervalMicroseconds: samplingInterval,
    };
}

function aggregateBySymbol(entries, sampledMicroseconds) {
    const bySymbol = new Map();
    for (const entry of entries) {
        // Named functions are stable across small edits, while anonymous
        // callbacks need their line number to avoid merging unrelated hot
        // loops from the same source file into one misleading symbol.
        const source =
            entry.functionName === '(anonymous)'
                ? entry.location.replace(/:\d+$/, '')
                : entry.source;
        const key = `${entry.functionName}\u0000${source}`;
        const current = bySymbol.get(key) ?? {
            functionName: entry.functionName,
            source,
            selfMicroseconds: 0,
            samples: 0,
        };
        current.selfMicroseconds += entry.selfMicroseconds;
        current.samples += entry.samples;
        bySymbol.set(key, current);
    }
    return [...bySymbol.values()]
        .map((entry) => ({
            ...entry,
            percent:
                sampledMicroseconds > 0 ? (entry.selfMicroseconds / sampledMicroseconds) * 100 : 0,
        }))
        .sort(
            (left, right) =>
                right.selfMicroseconds - left.selfMicroseconds ||
                left.functionName.localeCompare(right.functionName)
        );
}

function relativeSource(source) {
    if (!source) return '(runtime)';
    const normalized = source.replaceAll('\\', '/');
    const workspace = process.cwd().replaceAll('\\', '/');
    return normalized.toLowerCase().startsWith(`${workspace.toLowerCase()}/`)
        ? normalized.slice(workspace.length + 1)
        : normalized;
}

function hashJson(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isApplicationLocation(location) {
    const normalized = location.replaceAll('\\', '/').toLowerCase();
    return (
        normalized.includes('/src/') ||
        normalized.includes('/tests/benchmark/') ||
        normalized.includes('/scripts/')
    );
}

function normalizeLocationUrl(url) {
    try {
        if (url.startsWith('file:'))
            return decodeURIComponent(new URL(url).pathname).replace(/^\/(.:\/)/, '$1');
    } catch {
        // Keep the original profiler URL if it is not a valid file URL.
    }
    return url;
}

function formatDuration(microseconds) {
    if (microseconds >= 60_000_000) return `${(microseconds / 60_000_000).toFixed(2)} min`;
    if (microseconds >= 1_000_000) return `${(microseconds / 1_000_000).toFixed(2)} s`;
    if (microseconds >= 1_000) return `${(microseconds / 1_000).toFixed(1)} ms`;
    return `${microseconds.toFixed(0)} us`;
}

function renderMarkdown(summary) {
    const settings = summary.workload.settings;
    const benchmark = summary.benchmark;
    const separationLabel = benchmark.result.separation
        ? `${benchmark.result.separation.requestedColorCount} targets`
        : 'separation off';
    const rows = summary.applicationHotFunctions.slice(0, 50).map((entry) => {
        const caller = entry.callers[0];
        const callerLabel = caller ? `${caller.functionName} -- ${caller.location}` : '(unknown)';
        return `| ${entry.percent.toFixed(2)}% | ${formatDuration(entry.selfMicroseconds)} | ${entry.samples} | ${escapeCell(entry.functionName)} | ${escapeCell(entry.location)} | ${escapeCell(callerLabel)} |`;
    });
    return [
        `# Calibrated optimizer CPU profile: ${summary.fixture}`,
        '',
        `- Captured: ${summary.capturedAt}`,
        `- Workload: ${summary.workload.name}`,
        `- Configuration: ${settings.optimizerAlgorithm}, ${separationLabel}, Delta E ${settings.maximumColorErrorDeltaE}, ${settings.maximumExtraFilamentAppearances} extra appearances`,
        `- Benchmark wall time: ${formatDuration(benchmark.timing.totalMs * 1000)} (${formatDuration(benchmark.timing.appearanceFitMs * 1000)} appearance fit, ${formatDuration(benchmark.timing.optimizationMs * 1000)} optimization)`,
        `- Peak RSS: ${formatBytes(benchmark.memory.maximumResidentSetBytes)}`,
        `- Output fingerprint: ${benchmark.result.finalStackFingerprint}`,
        `- Sampled duration: ${summary.sampledDuration}`,
        `- Samples: ${summary.sampleCount.toLocaleString('en-US')}`,
        '',
        '## Application hot functions',
        '',
        '| Self | Time | Samples | Function | Location | Primary caller |',
        '| ---: | ---: | ---: | --- | --- | --- |',
        ...rows,
        '',
    ].join('\n');
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return 'unknown';
    return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function escapeCell(value) {
    return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}
