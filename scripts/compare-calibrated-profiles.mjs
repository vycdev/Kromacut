import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const profileRoot = resolve('.profiles');
mkdirSync(profileRoot, { recursive: true });

const skipped = [];
const discoveredRuns = readdirSync(profileRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap((entry) => {
        const relativeSummaryPath = `${entry.name}/summary.json`;
        try {
            const summary = JSON.parse(
                readFileSync(resolve(profileRoot, entry.name, 'summary.json'), 'utf8')
            );
            return [normalizeRun(summary, entry.name, relativeSummaryPath)];
        } catch (error) {
            if (error?.code !== 'ENOENT') {
                skipped.push({
                    summary: relativeSummaryPath,
                    reason: error instanceof Error ? error.message : String(error),
                });
            }
            return [];
        }
    });
const enrichedRuns = discoveredRuns.filter((run) => run.workload && run.benchmark && run.result);
const runs = enrichedRuns.length > 0 ? enrichedRuns : discoveredRuns;

const comparison = {
    schemaVersion: 1,
    profilesCompared: runs.length,
    runs,
    hotspotAggregates: aggregateHotspots(runs).slice(0, 50),
    ...(skipped.length > 0 ? { skipped } : {}),
};

writeFileSync(resolve(profileRoot, 'comparison.json'), `${JSON.stringify(comparison, null, 2)}\n`);
writeFileSync(resolve(profileRoot, 'comparison.md'), renderMarkdown(comparison));

console.log(
    `Compared ${runs.length} calibrated profile${runs.length === 1 ? '' : 's'} in ${profileRoot}`
);
if (skipped.length > 0) console.warn(`Skipped ${skipped.length} unreadable summary file(s).`);

function normalizeRun(summary, directory, summaryPath) {
    const benchmark = asObject(summary.benchmark) ?? summary;
    const workload =
        asObject(summary.workload) ??
        asObject(benchmark.workload) ??
        asObject(summary.benchmarkWorkload);
    const settings =
        asObject(workload?.settings) ??
        asObject(workload?.config) ??
        asObject(benchmark.settings) ??
        asObject(benchmark.config) ??
        asObject(summary.settings) ??
        asObject(summary.config);
    const timing = asObject(benchmark.timing) ?? asObject(summary.timing);
    const memory = asObject(benchmark.memory) ?? asObject(summary.memory);
    const result =
        asObject(benchmark.result) ??
        asObject(summary.result) ??
        asObject(summary.benchmarkResult) ??
        asObject(benchmark.output);
    const appearanceFitMs = firstFiniteNumber(
        timing?.appearanceFitMs,
        timing?.appearanceWallMs,
        timing?.appearanceMs,
        benchmark.appearanceFitMs,
        benchmark.appearanceWallMs
    );
    const optimizationMs = firstFiniteNumber(
        timing?.optimizationMs,
        timing?.optimizationWallMs,
        timing?.optimizerMs,
        benchmark.optimizationMs,
        benchmark.optimizationWallMs
    );
    const explicitTotalMs = firstFiniteNumber(
        timing?.totalWallMs,
        timing?.totalMs,
        benchmark.totalWallMs,
        benchmark.totalMs
    );
    const totalWallMs =
        explicitTotalMs ??
        (appearanceFitMs !== null && optimizationMs !== null
            ? appearanceFitMs + optimizationMs
            : null);
    const peakRssBytes = firstFiniteNumber(
        memory?.maximumResidentSetBytes,
        memory?.peakRssBytes,
        memory?.maxRssBytes,
        benchmark.maximumResidentSetBytes,
        benchmark.peakRssBytes
    );
    const order = firstArray(
        result?.orderColors,
        result?.filamentOrderColors,
        result?.filamentOrder,
        result?.order
    );
    const separation =
        asObject(result?.separation) ??
        asObject(result?.colorSeparation) ??
        asObject(benchmark.separation);
    const sampledMicroseconds = firstFiniteNumber(
        summary.sampledMicroseconds,
        summary.cpuProfile?.sampledMicroseconds,
        summary.cpu?.sampledMicroseconds
    );
    const sampleCount = firstFiniteNumber(
        summary.sampleCount,
        summary.cpuProfile?.sampleCount,
        summary.cpu?.sampleCount
    );
    const hotspots = normalizeHotspots(
        summary.applicationHotSymbols ??
            summary.applicationHotFunctions ??
            summary.cpuProfile?.applicationHotFunctions ??
            summary.cpu?.applicationHotFunctions ??
            summary.hotspots,
        sampledMicroseconds
    );

    return {
        id: directory,
        summary: summaryPath,
        fixture: firstString(
            workload?.fixture,
            benchmark.fixture,
            summary.fixture,
            workload?.caseName,
            summary.caseName
        ),
        capturedAt: firstString(summary.capturedAt, benchmark.capturedAt),
        workload: workload ? stableClone(workload) : null,
        settings: settings ? stableClone(settings) : null,
        benchmark: [appearanceFitMs, optimizationMs, totalWallMs, peakRssBytes].some(
            (value) => value !== null
        )
            ? { appearanceFitMs, optimizationMs, totalWallMs, peakRssBytes }
            : null,
        result: result
            ? {
                  score: firstFiniteNumber(result.score, result.optimizerScore),
                  iterations: firstFiniteNumber(result.iterations, result.optimizerIterations),
                  order: order ? order.map((value) => String(value)) : null,
                  finalStackFingerprint: firstString(
                      result.finalStackFingerprint,
                      result.finalFingerprint,
                      result.fingerprint
                  ),
                  separation: separation ? stableClone(separation) : null,
              }
            : null,
        cpuProfile:
            sampledMicroseconds !== null || sampleCount !== null || hotspots.length > 0
                ? { sampledMicroseconds, sampleCount, hotspots }
                : null,
    };
}

function normalizeHotspots(value, sampledMicroseconds) {
    if (!Array.isArray(value)) return [];
    return value
        .flatMap((entry) => {
            if (!asObject(entry)) return [];
            const selfMicroseconds = firstFiniteNumber(
                entry.selfMicroseconds,
                entry.microseconds,
                entry.selfTimeMicroseconds
            );
            const percent = firstFiniteNumber(entry.percent, entry.selfPercent);
            const functionName = firstString(entry.functionName, entry.name) ?? '(anonymous)';
            const location = normalizeLocation(
                firstString(entry.source, entry.location, entry.url) ?? '(runtime)'
            );
            if (selfMicroseconds === null && percent === null) return [];
            return [
                {
                    functionName,
                    location,
                    selfMicroseconds,
                    percent:
                        percent ??
                        (selfMicroseconds !== null && sampledMicroseconds
                            ? (selfMicroseconds / sampledMicroseconds) * 100
                            : null),
                    samples: firstFiniteNumber(entry.samples, entry.sampleCount),
                },
            ];
        })
        .sort(compareHotspots);
}

function aggregateHotspots(runs) {
    const aggregates = new Map();
    for (const run of runs) {
        const perRun = new Map();
        for (const hotspot of run.cpuProfile?.hotspots ?? []) {
            const stableLocation = stableHotspotLocation(hotspot.functionName, hotspot.location);
            const key = `${hotspot.functionName}\u0000${stableLocation}`;
            const entry = perRun.get(key) ?? {
                functionName: hotspot.functionName,
                location: stableLocation,
                selfMicroseconds: 0,
                percent: 0,
                samples: 0,
            };
            entry.selfMicroseconds += hotspot.selfMicroseconds ?? 0;
            entry.percent += hotspot.percent ?? 0;
            entry.samples += hotspot.samples ?? 0;
            perRun.set(key, entry);
        }
        for (const [key, entry] of perRun) {
            const aggregate = aggregates.get(key) ?? {
                functionName: entry.functionName,
                location: entry.location,
                runCount: 0,
                totalSelfMicroseconds: 0,
                totalSamples: 0,
                percentSum: 0,
                maximumPercent: 0,
                sampledMicroseconds: 0,
                runs: [],
            };
            aggregate.runCount += 1;
            aggregate.totalSelfMicroseconds += entry.selfMicroseconds;
            aggregate.totalSamples += entry.samples;
            aggregate.percentSum += entry.percent;
            aggregate.maximumPercent = Math.max(aggregate.maximumPercent, entry.percent);
            aggregate.sampledMicroseconds += run.cpuProfile?.sampledMicroseconds ?? 0;
            aggregate.runs.push(run.id);
            aggregates.set(key, aggregate);
        }
    }

    return [...aggregates.values()]
        .map(({ percentSum, sampledMicroseconds, ...entry }) => ({
            ...entry,
            meanPercent: round(percentSum / entry.runCount),
            maximumPercent: round(entry.maximumPercent),
            weightedPercent:
                sampledMicroseconds > 0
                    ? round((entry.totalSelfMicroseconds / sampledMicroseconds) * 100)
                    : null,
        }))
        .sort(
            (left, right) =>
                right.runCount - left.runCount ||
                right.meanPercent - left.meanPercent ||
                right.totalSelfMicroseconds - left.totalSelfMicroseconds ||
                left.functionName.localeCompare(right.functionName, 'en') ||
                left.location.localeCompare(right.location, 'en')
        );
}

function renderMarkdown(comparison) {
    const timingRows = comparison.runs.map((run) => {
        const benchmark = run.benchmark;
        return `| ${escapeCell(run.id)} | ${escapeCell(run.fixture ?? 'n/a')} | ${escapeCell(formatSettings(run.settings))} | ${formatMilliseconds(benchmark?.appearanceFitMs)} | ${formatMilliseconds(benchmark?.optimizationMs)} | ${formatMilliseconds(benchmark?.totalWallMs)} | ${formatBytes(benchmark?.peakRssBytes)} |`;
    });
    const resultRows = comparison.runs.map((run) => {
        const result = run.result;
        return `| ${escapeCell(run.id)} | ${formatNumber(result?.score)} | ${formatInteger(result?.iterations)} | ${escapeCell(result?.order?.join(' -> ') ?? 'n/a')} | ${escapeCell(result?.finalStackFingerprint ?? 'n/a')} | ${escapeCell(formatSeparation(result?.separation))} |`;
    });
    const hotspotRows = comparison.hotspotAggregates
        .slice(0, 20)
        .map(
            (entry) =>
                `| ${entry.runCount}/${comparison.runs.length} | ${formatPercent(entry.meanPercent)} | ${formatPercent(entry.maximumPercent)} | ${formatMicroseconds(entry.totalSelfMicroseconds)} | ${escapeCell(entry.functionName)} | ${escapeCell(entry.location)} |`
        );
    return [
        '# Calibrated optimizer profile comparison',
        '',
        `Profiles compared: ${comparison.profilesCompared}`,
        '',
        '## Workloads and benchmark timing',
        '',
        '| Run | Fixture | Settings | Appearance fit | Optimization | Total wall | Peak RSS |',
        '| --- | --- | --- | ---: | ---: | ---: | ---: |',
        ...timingRows,
        '',
        '## Results',
        '',
        '| Run | Score | Iterations | Filament order | Final fingerprint | Separation |',
        '| --- | ---: | ---: | --- | --- | --- |',
        ...resultRows,
        '',
        '## Stable CPU hotspots',
        '',
        '| Runs | Mean self | Max self | Total sampled self | Function | Location |',
        '| ---: | ---: | ---: | ---: | --- | --- |',
        ...hotspotRows,
        '',
        ...(comparison.skipped?.length
            ? [
                  '## Skipped summaries',
                  '',
                  ...comparison.skipped.map((entry) => `- ${entry.summary}: ${entry.reason}`),
                  '',
              ]
            : []),
    ].join('\n');
}

function stableHotspotLocation(functionName, location) {
    if (functionName === '(anonymous)') return location;
    return location.replace(/:\d+(?::\d+)?$/, '');
}

function normalizeLocation(location) {
    const normalized = String(location).replaceAll('\\', '/');
    const match = normalized.match(/(?:^|\/)(src|tests\/benchmark|scripts)\/(.+)$/i);
    return match ? `${match[1].toLowerCase()}/${match[2]}` : normalized;
}

function formatSettings(settings) {
    if (!settings) return 'n/a';
    const values = flattenObject(settings);
    if (values.length === 0) return 'n/a';
    const visible = values.slice(0, 12).map(([key, value]) => `${key}=${formatValue(value)}`);
    if (values.length > visible.length) visible.push(`+${values.length - visible.length} more`);
    return visible.join('; ');
}

function formatSeparation(separation) {
    if (!separation) return 'n/a';
    const requested = firstFiniteNumber(separation.requestedColorCount, separation.requested);
    const assigned = firstFiniteNumber(
        separation.assignedDistinctColorCount,
        separation.assignedDistinct,
        separation.assigned
    );
    const unacceptable = firstFiniteNumber(
        separation.unacceptableColorCount,
        separation.unacceptable,
        separation.fallbackColorCount
    );
    const maximum = firstFiniteNumber(separation.maximumDeltaE, separation.maxDeltaE);
    const allowed = firstFiniteNumber(
        separation.maximumAllowedDeltaE,
        separation.allowedDeltaE,
        separation.threshold
    );
    const pieces = [];
    if (assigned !== null || requested !== null) {
        pieces.push(`${assigned ?? '?'} / ${requested ?? '?'} assigned`);
    }
    if (unacceptable !== null) pieces.push(`${unacceptable} unacceptable`);
    if (maximum !== null) {
        pieces.push(
            `max Delta E ${formatNumber(maximum)}${allowed !== null ? ` / ${formatNumber(allowed)}` : ''}`
        );
    }
    if (typeof separation.satisfied === 'boolean') {
        pieces.push(separation.satisfied ? 'satisfied' : 'unsatisfied');
    }
    return pieces.length > 0 ? pieces.join('; ') : formatSettings(separation);
}

function flattenObject(value, prefix = '') {
    if (!asObject(value)) return prefix ? [[prefix, value]] : [];
    return Object.keys(value)
        .sort((left, right) => left.localeCompare(right, 'en'))
        .flatMap((key) => {
            const nextPrefix = prefix ? `${prefix}.${key}` : key;
            return asObject(value[key])
                ? flattenObject(value[key], nextPrefix)
                : [[nextPrefix, value[key]]];
        });
}

function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (!asObject(value)) return value;
    return Object.fromEntries(
        Object.keys(value)
            .sort((left, right) => left.localeCompare(right, 'en'))
            .map((key) => [key, stableClone(value[key])])
    );
}

function asObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function firstFiniteNumber(...values) {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
}

function firstString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.length > 0) return value;
    }
    return null;
}

function firstArray(...values) {
    return values.find(Array.isArray) ?? null;
}

function compareHotspots(left, right) {
    return (
        (right.selfMicroseconds ?? 0) - (left.selfMicroseconds ?? 0) ||
        (right.percent ?? 0) - (left.percent ?? 0) ||
        left.functionName.localeCompare(right.functionName, 'en') ||
        left.location.localeCompare(right.location, 'en')
    );
}

function formatMilliseconds(value) {
    if (value === null || value === undefined) return 'n/a';
    if (value >= 60_000) return `${(value / 60_000).toFixed(2)} min`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(2)} s`;
    return `${value.toFixed(1)} ms`;
}

function formatMicroseconds(value) {
    return formatMilliseconds(value / 1_000);
}

function formatBytes(value) {
    if (value === null || value === undefined) return 'n/a';
    return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatPercent(value) {
    return value === null || value === undefined ? 'n/a' : `${value.toFixed(2)}%`;
}

function formatInteger(value) {
    return value === null || value === undefined
        ? 'n/a'
        : Math.round(value).toLocaleString('en-US');
}

function formatNumber(value) {
    if (value === null || value === undefined) return 'n/a';
    if (Number.isInteger(value)) return String(value);
    const magnitude = Math.abs(value);
    if (magnitude >= 1_000_000) return value.toPrecision(8);
    return String(round(value));
}

function formatValue(value) {
    if (Array.isArray(value)) return `[${value.map(formatValue).join(',')}]`;
    if (typeof value === 'string') return value;
    if (value === null) return 'null';
    return JSON.stringify(value);
}

function round(value) {
    return Number(value.toFixed(6));
}

function escapeCell(value) {
    return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}
