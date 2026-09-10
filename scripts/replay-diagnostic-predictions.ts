/** Post-print, read-only replay of preserved recipes. Never imported by the app. */
import { readFileSync, mkdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { withViteTestServer } from '../tests/helpers/viteModule.ts';
import type { AppearanceFitContext } from '../src/lib/appearanceModel.ts';
import type { DiagnosticStrip } from '../src/lib/diagnosticPrint.ts';
import type { AutoPaintProfile } from '../src/lib/profileManager.ts';
import type { FinalPrintableStackSnapshot } from '../src/types/appearance.ts';

const help = `Replay a frozen diagnostic bundle with CURRENT prediction code, without new prints or calibration writes.
node --no-warnings --experimental-strip-types scripts/replay-diagnostic-predictions.ts --bundle <frozen directory> --out <NEW workspace directory> [--observations <UTF-8 notes file>]
Requires predictions.json, frozen-profile.kfil, design.json, source-trace.jsonl and a valid frozen manifest.
The output parent must already exist inside this workspace. Writes only report.json and report.md.
Original pre-print predictions stay untouched. Observation notes are qualitative annotations, never fitting data.`;
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const json = (bytes: Uint8Array) =>
    JSON.parse(
        Buffer.from(bytes)
            .toString('utf8')
            .replace(/^\uFEFF/, '')
    );
const within = (root: string, path: string) => {
    const name = relative(root, path);
    return (
        !!name &&
        name !== '..' &&
        !name.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
        !isAbsolute(name)
    );
};
const md = (value: unknown) =>
    String(value)
        .replace(/\|/g, '\\|')
        .replace(/[\r\n]+/g, ' ');

interface PayloadHash {
    sha256: string;
    bytes: number;
}
interface FrozenPredictions {
    schemaVersion: number;
    execution: { modelFingerprint: string; [key: string]: unknown };
    context: AppearanceFitContext;
    strips: DiagnosticStrip[];
}
interface FrozenManifest {
    schemaVersion: number;
    status: string;
    files: Record<string, PayloadHash>;
}

function verifyBundle(bundle: string, manifest: FrozenManifest) {
    if (
        manifest.schemaVersion !== 1 ||
        manifest.status !== 'frozen-pre-print' ||
        !Object.keys(manifest.files ?? {}).length
    )
        throw new Error('Missing or unsupported frozen-pre-print manifest');
    const hashes: Record<string, PayloadHash> = {};
    for (const [name, expected] of Object.entries(manifest.files)) {
        const path = resolve(bundle, name);
        if (!within(bundle, path) || !within(bundle, realpathSync(path)))
            throw new Error(`Unsafe frozen payload path: ${name}`);
        const bytes = readFileSync(path);
        const actual = { sha256: hash(bytes), bytes: bytes.length };
        if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes)
            throw new Error(`Frozen payload changed: ${name}`);
        hashes[name] = actual;
    }
    for (const name of [
        'predictions.json',
        'frozen-profile.kfil',
        'design.json',
        'source-trace.jsonl',
    ])
        if (!hashes[name]) throw new Error(`Required payload is not in the manifest: ${name}`);
    return hashes;
}

/** Resolve the old model's opaque-sizing instruction to the material that was actually exported. */
function pinFrozenDesign(strip: DiagnosticStrip) {
    const design = structuredClone(strip.design);
    const pinnedBackingRuns: { runIndex: number; original: 'opaque'; frozenLayers: number }[] = [];
    for (const [index, run] of design.backing.entries()) {
        if (run.layers !== 'opaque') continue;
        if (index !== 0) throw new Error(`Invalid opaque instruction in ${strip.design.id}`);
        // Subtract explicit later runs rather than scanning the first color:
        // adjacent runs may intentionally use the same filament.
        const laterRuns = design.backing.slice(1);
        if (laterRuns.some((r) => !Number.isInteger(r.layers) || Number(r.layers) < 1))
            throw new Error(`Invalid backing layer counts in ${strip.design.id}`);
        const count =
            strip.backingLayerCount - laterRuns.reduce((sum, r) => sum + Number(r.layers), 0);
        if (
            !Number.isInteger(count) ||
            count < 1 ||
            strip.layers
                .slice(0, count)
                .some((l) => l.filamentColor.toLowerCase() !== run.color.toLowerCase())
        )
            throw new Error(`Cannot recover frozen foundation for ${strip.design.id}`);
        run.layers = count;
        pinnedBackingRuns.push({ runIndex: index, original: 'opaque', frozenLayers: count });
    }
    return { design, pinnedBackingRuns };
}

function assertSamePhysicalStrip(frozen: DiagnosticStrip, fresh: DiagnosticStrip) {
    const fields = [
        'dimensions',
        'layers',
        'backing',
        'backingLayerCount',
        'patchSize',
        'gap',
        'orientation',
    ] as const;
    for (const field of fields)
        if (!isDeepStrictEqual(frozen[field], fresh[field]))
            throw new Error(
                `Physical ${field} changed in ${frozen.design.id}; refusing a different-recipe replay`
            );
    if (frozen.patches.length !== fresh.patches.length)
        throw new Error(`Patch count changed in ${frozen.design.id}`);
    const patchFields = [
        'id',
        'number',
        'topLayers',
        'topThickness',
        'layerCount',
        'totalHeight',
        'recipe',
        'bounds',
        'repeatOf',
    ] as const;
    for (const [index, patch] of frozen.patches.entries())
        for (const field of patchFields)
            if (!isDeepStrictEqual(patch[field], fresh.patches[index][field]))
                throw new Error(`Physical ${field} changed for ${patch.id}`);
    return {
        dimensionsIdentical: true,
        completePhysicalLayerSequenceIdentical: true,
        allPatchRecipesBoundsAndRepeatsIdentical: true,
    };
}

function predictionSummary(patch: DiagnosticStrip['patches'][number]) {
    const prediction = patch.prediction;
    const empirical = prediction.empiricalMatch;
    return {
        predictedHex: patch.predictedHex,
        predictedRgb: patch.predictedRgb,
        physicalRgb: patch.physicalRgb,
        method: prediction.predictionConfidence.method,
        sourceIds: [
            ...new Set([
                ...(empirical?.lutIds ?? (empirical?.lutId ? [empirical.lutId] : [])),
                ...(prediction.exactAnchor ? [prediction.exactAnchor.proofId] : []),
                ...(prediction.localMatch?.contributions ?? []).flatMap((c) =>
                    c.sourceId ? [c.sourceId] : []
                ),
            ]),
        ],
        evidenceIds: [
            ...new Set([
                ...(empirical?.sampleIds ?? []),
                ...(prediction.localMatch?.evidenceIds ?? []),
                ...(prediction.exactAnchor ? [prediction.exactAnchor.id] : []),
            ]),
        ],
        // Retain unrounded Lab, confidence semantics and all requested contribution weights.
        prediction,
    };
}

async function main() {
    if (process.argv.includes('--help')) {
        console.log(help);
        return;
    }
    const args = process.argv.slice(2),
        options = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) {
        if (
            !['--bundle', '--out', '--observations'].includes(args[i]) ||
            !args[i + 1] ||
            args[i + 1].startsWith('--') ||
            options.has(args[i])
        )
            throw new Error(help);
        options.set(args[i], args[i + 1]);
    }
    if (!options.has('--bundle') || !options.has('--out')) throw new Error(help);
    const workspace = realpathSync(process.cwd());
    const bundle = realpathSync(resolve(options.get('--bundle')!));
    const out = resolve(options.get('--out')!);
    if (existsSync(out))
        throw new Error('Output directory already exists; choose a new directory.');
    // Require an existing canonical parent: do not follow an output ancestor outside the workspace.
    const parent = realpathSync(dirname(out));
    if (!within(workspace, out) || (parent !== workspace && !within(workspace, parent)))
        throw new Error('Output must be a NEW directory under this workspace');
    if (within(bundle, out) || out === bundle || within(bundle, parent) || parent === bundle)
        throw new Error('Reports cannot be written inside the frozen bundle');
    const manifestBytes = readFileSync(resolve(bundle, 'manifest.json'));
    const manifest = json(manifestBytes) as FrozenManifest;
    const payloadHashes = verifyBundle(bundle, manifest);
    const frozen = json(readFileSync(resolve(bundle, 'predictions.json'))) as FrozenPredictions;
    const profile = json(readFileSync(resolve(bundle, 'frozen-profile.kfil'))) as AutoPaintProfile;
    const designFile = json(readFileSync(resolve(bundle, 'design.json'))) as {
        traceMatches?: { stripId: string; patchNumber: number; targetColor: string }[];
    };
    if (
        frozen.schemaVersion !== 1 ||
        !frozen.strips?.length ||
        profile.version !== 3 ||
        !profile.appearance ||
        !profile.filaments?.length
    )
        throw new Error('Unsupported or incomplete frozen predictions/profile');
    if (!isDeepStrictEqual(frozen.context.filaments, profile.filaments))
        throw new Error('Frozen profile filaments differ from the saved prediction context');
    if (new Set(frozen.strips.map((s) => s.design.id)).size !== frozen.strips.length)
        throw new Error('Duplicate frozen strip IDs');
    const contextFields = [
        'filamentProfileFingerprint',
        'layerHeight',
        'firstLayerHeight',
        'transitionOpacity',
    ] as const;
    for (const strip of frozen.strips) {
        if (
            strip.schemaVersion !== 1 ||
            strip.modelFingerprint !== frozen.execution.modelFingerprint
        )
            throw new Error(`Inconsistent frozen schema/model for ${strip.design.id}`);
        for (const field of contextFields)
            if (strip.context[field] !== frozen.context[field])
                throw new Error(`Inconsistent frozen ${field} for ${strip.design.id}`);
    }
    const records = readFileSync(resolve(bundle, 'source-trace.jsonl'), 'utf8')
        .replace(/^\uFEFF/, '')
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line));
    const starts = records.filter((r) => r.kind === 'run-start');
    const results = records.filter((r) => r.kind === 'result');
    if (
        starts.length !== 1 ||
        !isDeepStrictEqual(starts[0].payload.filaments, profile.filaments) ||
        !isDeepStrictEqual(starts[0].payload.appearanceProfile, profile.appearance)
    )
        throw new Error('Source trace does not reproduce the complete frozen profile');
    for (const field of ['layerHeight', 'firstLayerHeight', 'transitionOpacity'] as const)
        if (starts[0].payload.settings?.[field] !== frozen.context[field])
            throw new Error(`Source trace does not reproduce frozen ${field}`);
    const snapshot =
        results.length === 1
            ? (results[0].payload.result?.finalStack as FinalPrintableStackSnapshot | undefined)
            : undefined;
    if (designFile.traceMatches?.length && !snapshot)
        throw new Error(
            'Portrait design matches require exactly one completed final-stack snapshot'
        );
    const observationPath = options.has('--observations')
        ? resolve(options.get('--observations')!)
        : undefined;
    const observationBytes = observationPath ? readFileSync(observationPath) : undefined;
    const observations = observationBytes
        ? {
              path: observationPath,
              sha256: hash(observationBytes),
              text: observationBytes.toString('utf8'),
              usedForFitting: false,
          }
        : null;

    // Hash current source as well as Git HEAD: uncommitted work is part of the replay implementation.
    const sourcePaths = execFileSync(
        'git',
        [
            'ls-files',
            '--cached',
            '--others',
            '--exclude-standard',
            'src',
            'scripts',
            'tests/helpers',
            'package.json',
            'package-lock.json',
        ],
        { encoding: 'utf8', cwd: workspace }
    )
        .trim()
        .split(/\r?\n/)
        .filter((p) => /\.(?:tsx?|m?js|json)$/.test(p));
    const sourceHashes = Object.fromEntries(
        [...new Set(sourcePaths)]
            .sort()
            .map((name) => [name, hash(readFileSync(resolve(workspace, name)))])
    );
    const codeRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
        cwd: workspace,
    }).trim();
    const workingTreeStatus = execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
        cwd: workspace,
    });
    await withViteTestServer(async (server) => {
        const [fit, diagnostics, appearance] = await Promise.all([
            server.ssrLoadModule('/src/lib/appearanceModel.ts') as Promise<
                typeof import('../src/lib/appearanceModel.ts')
            >,
            server.ssrLoadModule('/src/lib/diagnosticPrint.ts') as Promise<
                typeof import('../src/lib/diagnosticPrint.ts')
            >,
            server.ssrLoadModule('/src/lib/appearanceProfile.ts') as Promise<
                typeof import('../src/lib/appearanceProfile.ts')
            >,
        ]);
        const context: AppearanceFitContext = { ...frozen.context, filaments: profile.filaments };
        if (
            appearance.fingerprintAppearanceFilaments(profile.filaments) !==
            context.filamentProfileFingerprint
        )
            throw new Error('Frozen filament fingerprint mismatch');
        console.log(
            'Refitting the FULL frozen profile; no optimizer, holdout or observation fitting.'
        );
        const model = fit.fitAppearanceRankModel(profile.appearance!, context);
        const strips = frozen.strips.map((oldStrip) => {
            const pinned = pinFrozenDesign(oldStrip);
            const fresh = diagnostics.planDiagnosticStrip(pinned.design, context, model);
            const physicalChecks = assertSamePhysicalStrip(oldStrip, fresh);
            return {
                stripId: oldStrip.design.id,
                originalDesign: oldStrip.design,
                replayDesign: pinned.design,
                pinnedBackingRuns: pinned.pinnedBackingRuns,
                dimensions: fresh.dimensions,
                physicalLayers: fresh.layers,
                physicalChecks,
                frozenWarnings: oldStrip.warnings,
                replayWarnings: fresh.warnings,
                patches: oldStrip.patches.map((oldPatch, index) => ({
                    id: oldPatch.id,
                    number: oldPatch.number,
                    topThickness: oldPatch.topThickness,
                    totalHeight: oldPatch.totalHeight,
                    recipe: oldPatch.recipe,
                    repeatOf: oldPatch.repeatOf,
                    frozenPrePrint: predictionSummary(oldPatch),
                    currentCodeReplay: predictionSummary(fresh.patches[index]),
                    roundedPredictionChanged:
                        oldPatch.predictedHex.toLowerCase() !==
                        fresh.patches[index].predictedHex.toLowerCase(),
                    evidenceMethodChanged:
                        oldPatch.prediction.predictionConfidence.method !==
                        fresh.patches[index].prediction.predictionConfidence.method,
                })),
                fresh,
            };
        });
        const portraitMatches = (designFile.traceMatches ?? []).map((match) => {
            const index = strips.findIndex((s) => s.stripId === match.stripId);
            if (index < 0) throw new Error(`Unknown portrait strip ${match.stripId}`);
            const original = diagnostics.verifyDiagnosticTraceMatch(
                frozen.strips[index],
                match.patchNumber,
                match.targetColor,
                snapshot!
            );
            const replay = diagnostics.verifyDiagnosticTraceMatch(
                strips[index].fresh,
                match.patchNumber,
                match.targetColor,
                snapshot!
            );
            const patch = strips[index].patches.find((p) => p.number === match.patchNumber)!;
            return {
                ...match,
                originalTraceAndFrozenMatch: original,
                currentCodeSameRecipeMatch: replay,
                frozenPrePrint: patch.frozenPrePrint,
                currentCodeReplay: patch.currentCodeReplay,
            };
        });
        const patches = strips.flatMap((s) => s.patches);
        // A concurrent source edit or any original-payload change invalidates this replay.
        for (const [name, expected] of Object.entries(sourceHashes))
            if (hash(readFileSync(resolve(workspace, name))) !== expected)
                throw new Error(`Source changed during replay: ${name}; rerun after edits settle`);
        if (
            hash(readFileSync(resolve(bundle, 'manifest.json'))) !== hash(manifestBytes) ||
            !isDeepStrictEqual(payloadHashes, verifyBundle(bundle, manifest))
        )
            throw new Error('Frozen bundle changed during replay');
        if (
            observationPath &&
            observationBytes &&
            hash(readFileSync(observationPath)) !== hash(observationBytes)
        )
            throw new Error('Observation notes changed during replay');
        const report = {
            schemaVersion: 1,
            status: 'post-print-current-code-reinterpretation',
            scope: {
                originalPrePrintPredictionsPreserved: true,
                fullFrozenProfileRefitted: true,
                physicalRecipesPreserved: true,
                opaqueSizing:
                    'Pinned to frozen physical layer counts; no new model-dependent sizing.',
                optimizerRun: false,
                newPrintClaim: false,
                calibrationWritten: false,
                photoColorimetryAvailable: false,
                limitation:
                    'This report reinterprets already-frozen recipes with current code. It is not a new pre-print prediction bundle, an independent measurement validation, or a guarantee of physical color accuracy. Qualitative observations do not supply RGB/Delta E ground truth.',
            },
            execution: {
                createdAt: new Date().toISOString(),
                command: process.argv.slice(1),
                node: process.version,
                workspace,
                codeRevision,
                workingTreeStatus,
                sourceHashes,
                sourceFingerprintSha256: hash(JSON.stringify(sourceHashes)),
                currentModelFingerprint: model.fingerprint,
            },
            originalBundle: {
                path: bundle,
                manifestSha256: hash(manifestBytes),
                payloadHashes,
                verifiedBeforeAndAfter: true,
                frozenExecution: frozen.execution,
                frozenModelFingerprint: frozen.execution.modelFingerprint,
                filamentProfileFingerprint: context.filamentProfileFingerprint,
                recordedPortraitFingerprint: snapshot?.fingerprint ?? null,
            },
            context: { ...context, filaments: undefined },
            observations,
            summary: {
                strips: strips.length,
                patches: patches.length,
                roundedPredictionsChanged: patches.filter((p) => p.roundedPredictionChanged).length,
                evidenceMethodsChanged: patches.filter((p) => p.evidenceMethodChanged).length,
                portraitMatches: portraitMatches.length,
            },
            strips: strips.map(({ fresh: _fresh, ...strip }) => {
                void _fresh;
                return strip;
            }),
            portraitMatches,
        };
        const lines = [
            '# Current-code replay of preserved diagnostic recipes',
            '',
            '**Post-print reinterpretation, not replacement pre-print predictions.** The original bundle and calibration remain unchanged. No optimizer ran and no additional print is claimed.',
            '',
            `Original model: \`${md(frozen.execution.modelFingerprint)}\`. Current model: \`${md(model.fingerprint)}\`.`,
            `Verified all ${Object.keys(payloadHashes).length} original payload hashes before and after replay. Manifest SHA-256: \`${hash(manifestBytes)}\`. Full payload/source hashes and contribution details are in report.json.`,
            '',
            `All ${strips.length} strips / ${patches.length} patches retain their exact physical layers, recipes, bounds, repeats and dimensions. Originally automatic opaque backing sizes were pinned to the exported layer counts.`,
            `${report.summary.roundedPredictionsChanged} rounded colors and ${report.summary.evidenceMethodsChanged} evidence methods changed. These are software prediction changes, not measured print errors.`,
            '',
            '## Original portrait target recipes',
            '',
            '| Target | Matching patch | Recorded portrait | Frozen strip | Current replay | Current method |',
            '| --- | --- | --- | --- | --- | --- |',
            ...portraitMatches.map(
                (p) =>
                    `| ${md(p.targetColor)} | ${md(p.currentCodeSameRecipeMatch.patchId)} | ${p.originalTraceAndFrozenMatch.recordedPredictedHex} | ${p.frozenPrePrint.predictedHex} | ${p.currentCodeReplay.predictedHex} | ${md(p.currentCodeReplay.method)} |`
            ),
            '',
            '## All frozen patch recipes',
            '',
            '| Patch | Top mm | Frozen prediction / method | Current prediction / method | Current evidence sources |',
            '| --- | ---: | --- | --- | --- |',
            ...patches.map(
                (p) =>
                    `| ${md(p.id)} | ${p.topThickness.toFixed(2)} | ${p.frozenPrePrint.predictedHex} / ${md(p.frozenPrePrint.method)} | ${p.currentCodeReplay.predictedHex} / ${md(p.currentCodeReplay.method)} | ${md(p.currentCodeReplay.sourceIds.join(', ') || 'none')} |`
            ),
            '',
            '## Observation notes and limits',
            '',
            'No absolute colorimetry was extracted from new photographs. Any supplied notes below are qualitative annotations, excluded from fitting; they are not new RGB measurements or calibration imports.',
            '',
            ...(observations
                ? observations.text.split(/\r?\n/).map((line) => `> ${line}`)
                : ['No observation notes file supplied.']),
            '',
            report.scope.limitation,
            '',
        ];
        // Non-recursive creation is exclusive; a concurrent collision must not overwrite a report.
        mkdirSync(out);
        writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', {
            flag: 'wx',
        });
        writeFileSync(resolve(out, 'report.md'), lines.join('\n'), { flag: 'wx' });
        console.log(
            `Replay complete: ${relative(workspace, out)}; ${patches.length} unchanged physical recipes, ${report.summary.roundedPredictionsChanged} revised colors.`
        );
    });
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
