import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { withViteTestServer } from '../tests/helpers/viteModule.ts';
import type { AutoPaintDiagnosticRunInputV1 } from '../src/lib/autoPaintDiagnostics.ts';
import type { AppearanceFitContext } from '../src/lib/appearanceModel.ts';

const help = `Offline, diagnostics-only Matrix prediction validation.
Usage: npm run benchmark:appearance -- --input <profile.kfil|profile.kapp|trace.jsonl> --out <NEW directory>
Options:
  --profile <id>             Required if the file contains multiple profiles
  --run <zero-based index>   Required if a trace contains multiple run-start records
  --folds <2..10>            Default 4
  --delta-e <positive>       Reporting threshold only; default 10
  --layer-height <mm>        Required for profiles with multiple Matrix layer heights
  --first-layer-height <mm>  Default from trace or first compatible Matrix
  --opacity <0..1>           Default from trace or 0.9; no optimizer runs
  --sessions <json>          Optional object mapping EVERY included Matrix id to its shared print/photo session
No application settings or calibrations are written. Existing output directories are refused.`;

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
        console.log(help);
        return;
    }
    const values = new Map<string, string>();
    const allowed = new Set([
        'input',
        'out',
        'profile',
        'run',
        'folds',
        'delta-e',
        'layer-height',
        'first-layer-height',
        'opacity',
        'sessions',
    ]);
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace(/^--/, '');
        if (
            !args[i].startsWith('--') ||
            !allowed.has(key) ||
            !args[i + 1] ||
            args[i + 1].startsWith('--') ||
            values.has(key)
        ) {
            throw new Error(`Invalid or duplicate option: ${args[i]}\n${help}`);
        }
        values.set(key, args[i + 1]);
    }
    if (!values.has('input') || !values.has('out')) throw new Error(help);
    const inputPath = resolve(values.get('input')!);
    const outputPath = resolve(values.get('out')!);
    if (existsSync(outputPath))
        throw new Error('Output directory already exists; choose a new directory.');
    const numberOption = (key: string, fallback: number): number => {
        const value = values.has(key) ? Number(values.get(key)) : fallback;
        if (!Number.isFinite(value)) throw new Error(`Invalid --${key}`);
        return value;
    };
    let sessions: Record<string, string> | undefined;
    if (values.has('sessions')) {
        const parsed: unknown = JSON.parse(readFileSync(resolve(values.get('sessions')!), 'utf8'));
        if (
            !parsed ||
            typeof parsed !== 'object' ||
            Array.isArray(parsed) ||
            Object.values(parsed).some((v) => typeof v !== 'string' || !v.trim())
        ) {
            throw new Error(
                'Sessions must be a JSON object mapping Matrix IDs to nonempty session strings'
            );
        }
        sessions = parsed as Record<string, string>;
    }
    const raw = readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '');
    await withViteTestServer(async (server) => {
        const validation = (await server.ssrLoadModule(
            '/src/lib/appearanceValidation.ts'
        )) as typeof import('../src/lib/appearanceValidation.ts');
        const profiles = (await server.ssrLoadModule(
            '/src/lib/profileManager.ts'
        )) as typeof import('../src/lib/profileManager.ts');
        const appearance = (await server.ssrLoadModule(
            '/src/lib/appearanceProfile.ts'
        )) as typeof import('../src/lib/appearanceProfile.ts');
        let trace: AutoPaintDiagnosticRunInputV1 | undefined;
        let profileJson = raw;
        if (inputPath.toLowerCase().endsWith('.jsonl')) {
            const records = raw
                .trim()
                .split(/\r?\n/)
                .map((line) => JSON.parse(line))
                .filter((r) => r.kind === 'run-start');
            if (!records.length || (records.length > 1 && !values.has('run')))
                throw new Error(
                    'Select --run when a trace has multiple runs; at least one run-start is required'
                );
            const run = numberOption('run', 0);
            if (!Number.isInteger(run) || run < 0 || run >= records.length)
                throw new Error('Invalid --run index');
            trace = records[run].payload;
            if (trace?.schemaVersion !== 1 || !Array.isArray(trace.filaments) || !trace.settings)
                throw new Error('Unsupported diagnostic input schema');
            profileJson = JSON.stringify({
                id: 'diagnostic-snapshot',
                name: 'Diagnostic snapshot',
                version: 3,
                filaments: trace.filaments,
                appearance: trace.appearanceProfile,
                createdAt: 0,
                updatedAt: 0,
            });
        } else if (values.has('run')) throw new Error('--run is only valid for JSONL traces');
        const candidates = profiles.parseProfileFile(profileJson);
        if (!candidates?.length) throw new Error('No valid profiles found');
        if (candidates.length > 1 && !values.has('profile'))
            throw new Error(`Select --profile: ${candidates.map((p) => p.id).join(', ')}`);
        const profile = values.has('profile')
            ? candidates.find((p) => p.id === values.get('profile'))
            : candidates[0];
        if (!profile?.appearance?.stackMatrices?.length)
            throw new Error('Selected profile has no Matrix measurements');
        const matrices = profile.appearance.stackMatrices.filter((m) => m.status === 'complete');
        const heights = [...new Set(matrices.map((m) => m.process.layerHeight))];
        if (!trace && heights.length > 1 && !values.has('layer-height'))
            throw new Error('Multiple Matrix layer heights: select --layer-height');
        const layerHeight = numberOption('layer-height', trace?.settings.layerHeight ?? heights[0]);
        const firstLayerHeight = numberOption(
            'first-layer-height',
            trace?.settings.firstLayerHeight ??
                matrices.find((m) => m.process.layerHeight === layerHeight)?.process
                    .firstLayerHeight ??
                layerHeight
        );
        const transitionOpacity = numberOption('opacity', trace?.settings.transitionOpacity ?? 0.9);
        if (
            layerHeight <= 0 ||
            firstLayerHeight <= 0 ||
            transitionOpacity <= 0 ||
            transitionOpacity >= 1
        )
            throw new Error('Invalid layer height or opacity');
        const context: AppearanceFitContext = {
            filaments: profile.filaments,
            filamentProfileFingerprint: appearance.fingerprintAppearanceFilaments(
                profile.filaments
            ),
            layerHeight,
            firstLayerHeight,
            transitionOpacity,
        };
        const options = {
            folds: numberOption('folds', 4),
            maximumDeltaE: numberOption('delta-e', 10),
            sessions,
            onProgress: (message: string) => console.log(message),
        };
        const plan = validation.planAppearanceValidation(profile.appearance, context, options);
        if (!plan.observations.length)
            throw new Error(
                'No compatible, uncorrected measured Matrix samples at this layer height'
            );
        let commit = 'unknown';
        let dirty = true;
        try {
            commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
            dirty = Boolean(
                execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
            );
        } catch {
            /* Git is optional for an exported source tree. */
        }
        const sourceHashes = Object.fromEntries(
            [
                'scripts/validate-appearance.ts',
                'src/lib/appearanceValidation.ts',
                'src/lib/appearanceModel.ts',
                'src/lib/effectiveOptics.ts',
                'src/lib/appearanceProfile.ts',
                'src/lib/calibration.ts',
                'src/lib/colorDifference.ts',
                'src/lib/colorSpace.ts',
                'src/lib/profileManager.ts',
            ].map((path) => [
                path,
                createHash('sha256')
                    .update(readFileSync(resolve(path)))
                    .digest('hex'),
            ])
        );
        const report = {
            ...validation.runAppearanceValidation(profile.appearance, context, options),
            execution: {
                commit,
                dirty,
                source: inputPath,
                profileId: profile.id,
                node: process.version,
                sourceHashes,
            },
        };
        const lines = [
            '# Matrix end-to-end validation',
            '',
            `Code: ${commit}${dirty ? ' (working-tree changes present)' : ''}. Input fingerprint: ${report.inputFingerprint}.`,
            '',
            report.scope,
            '',
            `${report.measuredSampleCount} measured samples, ${report.compatibleMatrixCount} matrices, ${report.boardGroupCount} board/photo groups. Reporting threshold: ΔE00 ${report.maximumDeltaE}.`,
            '',
            '| Holdout | Prediction | Mean ΔE00 | P90 | Worst | Within limit |',
            '| --- | --- | ---: | ---: | ---: | ---: |',
        ];
        for (const scenario of report.scenarios) {
            for (const stage of ['baseline', 'physical', 'full'] as const) {
                const result = scenario[stage];
                lines.push(
                    result
                        ? `| ${scenario.scenario} | ${stage} | ${result.mean.toFixed(2)} | ${result.p90.toFixed(2)} | ${result.worst.toFixed(2)} | ${result.withinLimit}/${result.count} |`
                        : `| ${scenario.scenario} | ${stage} | not evaluated | — | — | — |`
                );
            }
        }
        lines.push(
            '',
            'Baseline = fixed filament/wedge prior; physical = training-only fitted optics with deployed support handling; full = physical plus training-only Matrix lookup and anchors.',
            '',
            '## Limits and exclusions',
            '',
            ...report.limitations.map((message) => `- ${message}`),
            ...report.skipped.map((s) => `- ${s.scenario}: ${s.reason}`),
            ...report.scenarios.map(
                (s) =>
                    `- ${s.scenario}: ${s.evaluatedSampleCount} evaluated; ${s.unevaluatedSampleCount} not evaluated. Foundation-only samples have no pair for interaction holdouts.`
            ),
            ...report.excludedMatrices.map((m) => `- Excluded Matrix ${m.id}: ${m.reason}.`),
            '',
            '## Largest full-pipeline errors',
            ''
        );
        const label = (id: string) => profile.filaments.find((f) => f.id === id)?.color ?? id;
        for (const scenario of report.scenarios) {
            if (!scenario.worstCases.length) continue;
            lines.push(
                `### ${scenario.scenario}`,
                '',
                '| Sample | Recipe (bottom → top, mm) | Prior ΔE | Full ΔE | Method |',
                '| --- | --- | ---: | ---: | --- |'
            );
            for (const row of scenario.worstCases.slice(0, 8)) {
                lines.push(
                    `| ${row.id.replace(/\|/g, '\\|')} | ${row.recipe.map((r) => `${label(r.filamentId)} ${r.thickness}`).join(' → ')} | ${row.errors.baseline.toFixed(2)} | ${row.errors.full.toFixed(2)} | ${row.method} |`
                );
            }
            lines.push('');
        }
        lines.push(
            '## Before new prints',
            '',
            'Inspect leakage checks and regression pairs first. Do not tune the model against these holdouts and then reuse their scores as independent validation.',
            '',
            'Next, freeze the profile/model and record predictions for a small set of diagnostic recipes, including a known reference and disputed combinations. Print at the recorded layer heights/backing, photograph together under consistent light, and keep the first comparison out of calibration until scored. An optimizer-chosen full-image print is a later acceptance check, not a replacement for those measurements.',
            ''
        );
        mkdirSync(outputPath, { recursive: true });
        writeFileSync(resolve(outputPath, 'report.json'), JSON.stringify(report, null, 2) + '\n', {
            flag: 'wx',
        });
        writeFileSync(resolve(outputPath, 'report.md'), lines.join('\n'), { flag: 'wx' });
        console.log(`Reports written to ${outputPath}`);
    });
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
