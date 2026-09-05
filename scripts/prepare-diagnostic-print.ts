import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { withViteTestServer } from '../tests/helpers/viteModule.ts';
import { verifyDiagnostic3mf } from '../tests/helpers/diagnostic3mf.ts';
import type { AutoPaintDiagnosticRunInputV1 } from '../src/lib/autoPaintDiagnostics.ts';
import type { DiagnosticStripDesign, DiagnosticStrip } from '../src/lib/diagnosticPrint.ts';
import type { FinalPrintableStackSnapshot } from '../src/types/appearance.ts';

const help = `Prepare an OFFLINE, frozen diagnostic print bundle (no calibration writes).
npm run diagnostics:print -- --input <single-run desktop trace.jsonl> --design <design.json> --out <NEW directory>
The design explicitly selects physical layers, not optimizer results. Layer heights must match the trace.
Refuses existing output directories. See tests/benchmark/diagnostic-print.md.`;
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const escape = (s: string) =>
    s.replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
    );

function instructions(strips: DiagnosticStrip[]) {
    const lines = [
        '# Frozen diagnostic print bundle',
        '',
        'Start with A, B and C. Print ONE strip per job: combining different stack families on one plate can cause many extra filament changes. D–H are simpler-backing controls; I–J repeat known photographed Matrix recipes.',
        '',
        '## Before printing',
        '',
        '- Open patch-map.html for the numbered map. The notched corner is top-left; pads are numbered left to right. IDs are on the map, NOT embossed (embossing would change the sample stack). Label the back after printing, one strip at a time.',
        `- Use ${strips[0].context.layerHeight} mm regular layers and ${strips[0].context.firstLayerHeight} mm first layer; 100% scale, face-up, no supports/raft, no adaptive layers, 100% infill and one wall. Keep pad top surfaces free of ironing or other new surface treatment. A removable brim outside the specimen is fine; do not add material under it.`,
        '- Import as one multipart object, not separate independently grounded objects. Retain all layer parts and their relative Z positions. Check the slicer layer preview against every swap table below.',
        '- IMPORTANT: the embedded slicer profile is only a generic placeholder, NOT your printer/material preset. Select your actual printer and spools, then recheck layer heights, infill, walls and assignments. A 0.40 mm first layer is deliberately frozen from today’s print; use it only with the same already-working nozzle/process, not an untested setup.',
        '- Record the actual printer/nozzle, spool IDs, temperatures, flow, line widths, speeds, infill directions, cooling, surface treatment and purge settings before printing. These are NOT known from the desktop trace. Save the slicer project and sliced output alongside your observations; do not silently substitute these settings.',
        '- In particular, inspect the black → orange purge in A/C. Residual black could contribute to brown; this bundle does not assume the optical model is the only cause. Keep purge settings documented so this can be separated from backing effects.',
        '- Measure/photograph only the CENTRE of each 8 × 8 mm pad. Gaps and margins expose the thin first layer, not the full backing. Pad 1 is a full-backing reference in A–H; the last pad repeats an earlier thickness.',
        '',
        '## What is frozen',
        '',
        'predictions.json contains every complete layer recipe, unrounded physical/final prediction, evidence contributors, model fingerprint and warnings. full-profile-model.json was fitted with the FULL frozen profile, not benchmark holdouts. frozen-profile.kfil and source-trace.jsonl preserve the input. source-code.zip, source-manifest.json and working-tree.patch preserve the actual working source, including uncommitted edits; the Git commit alone is not the source snapshot.',
        '',
        'manifest.json hashes all payload files. Run `node verify-bundle.mjs` from this folder before printing to check integrity. Record observations separately (copy observations-template.json outside this bundle, or simply send labeled photos and notes). Predictions are estimates, not promised physical colors. “Opaque” control foundations are sized to the model’s 95% assumption, not measured proof of opacity. Known Matrix controls are training recipes, not independent test predictions; their original first-layer schedule may differ.',
        '',
        '## Record results without changing calibration',
        '',
        'After cooling, photograph A/B/C and comparison controls together in even, fixed lighting, with exposure/white balance locked if possible. Avoid glare and keep an untouched original photo. Include a known neutral reference if you have one; phone RGB alone is not absolute colorimetry. Compare duplicate pads for repeatability. Record each pad ID and whether it looks different from its repeat. Do not import measurements or retune HD until the frozen predictions and actual recipes have been compared.',
        '',
        'The file checks validate geometry, physical materials, layer heights and pad stacks. They do not validate your slicer’s toolpaths or prove the optical model is accurate.',
        '',
    ];
    for (const s of strips) {
        lines.push(
            `## ${s.design.id}: ${s.design.title}`,
            '',
            s.design.purpose,
            '',
            `File: strips/${s.design.id}.3mf — ${s.dimensions.width} × ${s.dimensions.depth} × ${s.dimensions.height} mm.`,
            '',
            `Backing, bottom → top: ${s.backing.map((r) => `${r.filamentColor} ${r.thickness.toFixed(2)} mm`).join(' → ')}. Top filament: ${s.design.foreground}.`,
            '',
            ...s.warnings.map((w) => `WARNING: ${w}`),
            '',
            '| Pad | Top layers | Top mm | Total Z mm | Repeat of |',
            '| --- | ---: | ---: | ---: | --- |',
            ...s.patches.map(
                (p) =>
                    `| ${p.id} | ${p.topLayers} | ${p.topThickness.toFixed(2)} | ${p.totalHeight.toFixed(2)} | ${p.repeatOf ?? '—'} |`
            ),
            '',
            '| First layer using filament (1-based) | Start Z mm | Physical color |',
            '| ---: | ---: | --- |',
            ...s.layers.flatMap((l, i) =>
                i === 0 || s.layers[i - 1].filamentId !== l.filamentId
                    ? [`| ${i + 1} | ${l.startHeight.toFixed(2)} | ${l.filamentColor} |`]
                    : []
            ),
            ''
        );
    }
    return lines.join('\n');
}

function patchMap(strips: DiagnosticStrip[]) {
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kromacut diagnostic patch map</title>
<style>body{font:16px system-ui;max-width:1100px;margin:32px auto;padding:0 20px;color:#182330;background:#f4f6f8}h1{font-size:30px}article{background:white;border:1px solid #ccd2da;border-radius:12px;padding:24px;margin:24px 0;break-inside:avoid}h2{margin:0 0 10px}p{line-height:1.5}svg{width:100%;max-height:145px}text{font-family:system-ui}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:8px;text-align:left;border-bottom:1px solid #ddd}details{margin-top:18px}summary{cursor:pointer;font-weight:600}.swatch{display:inline-block;width:24px;height:18px;border:1px solid #888;vertical-align:middle;margin-right:8px}.warn{color:#8b4500}.muted{color:#526274}a{color:#0562a8}@media print{body{background:white;margin:0}article{border:0;margin:0;padding:16px 0}details{display:none}}</style>
<h1>Frozen diagnostic print map</h1><p>Start with <b>A · Orange</b>, <b>B · Cyan</b>, <b>C · White</b>. One strip per print job. <a href="README.md">Read print instructions</a> before slicing.</p><p>Notch at top-left. Pad IDs run left → right. Measure the pad centres, not the exposed gaps. Diagrams are NOT to scale. Predictions are hidden initially so you can record observations first.</p>
${strips
    .map(
        (
            s
        ) => `<article><h2>${escape(s.design.id)} · ${escape(s.design.title)}</h2><p>${escape(s.design.purpose)}</p><p class="muted">${s.dimensions.width} × ${s.dimensions.depth} × ${s.dimensions.height} mm · <a href="strips/${s.design.id}.3mf">3MF</a> · ${s.layers.filter((l, i) => i > 0 && l.filamentId !== s.layers[i - 1].filamentId).length} filament changes</p>
<svg viewBox="-1 -4 ${s.dimensions.width + 2} 19" role="img" aria-label="${escape(s.design.id)} numbered strip, notch at top-left"><path d="M2 0 H${s.dimensions.width} V12 H0 V2 H2 Z" fill="#dce2e8" stroke="#566779" stroke-width=".2"/><text x="0" y="-1" font-size="1.8">NOTCH</text>${s.patches.map((p) => `<rect x="${p.bounds.x0}" y="2" width="8" height="8" fill="white" stroke="#8c9aac" stroke-width=".15"/><text x="${p.bounds.x0 + 4}" y="5.5" font-size="2.5" text-anchor="middle">${p.number}</text><text x="${p.bounds.x0 + 4}" y="8.5" font-size="1.5" text-anchor="middle">${p.topThickness.toFixed(2)} mm</text>`).join('')}</svg>
<p>Backing: ${s.backing.map((r) => `${escape(r.filamentColor)} ${r.thickness.toFixed(2)} mm`).join(' → ')}. Top: ${escape(s.design.foreground)}. ${s.patches
            .filter((p) => p.repeatOf)
            .map((p) => `${p.id} repeats ${p.repeatOf}.`)
            .join(' ')}</p>
${s.warnings.map((w) => `<p class="warn">${escape(w)}</p>`).join('')}
<details><summary>Reveal frozen predictions (estimates, not physical guarantees)</summary><table><tr><th>Pad</th><th>Top layers</th><th>Predicted sRGB</th><th>Evidence method</th></tr>${s.patches.map((p) => `<tr><td>${p.id}</td><td>${p.topLayers}</td><td><span class="swatch" style="background:${p.predictedHex}"></span>${p.predictedHex}</td><td>${escape(p.prediction.predictionConfidence.method)}</td></tr>`).join('')}</table></details></article>`
    )
    .join('')}
</html>`;
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
            !['--input', '--design', '--out'].includes(args[i]) ||
            !args[i + 1] ||
            args[i + 1].startsWith('--') ||
            options.has(args[i])
        )
            throw new Error(help);
        options.set(args[i], args[i + 1]);
    }
    if (options.size !== 3) throw new Error(help);
    const out = resolve(options.get('--out')!),
        input = resolve(options.get('--input')!),
        designPath = resolve(options.get('--design')!);
    if (existsSync(out))
        throw new Error('Output directory already exists; choose a new directory.');
    const raw = readFileSync(input),
        designRaw = readFileSync(designPath);
    const records = raw
        .toString('utf8')
        .replace(/^\uFEFF/, '')
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line));
    const starts = records.filter((r) => r.kind === 'run-start');
    if (starts.length !== 1) throw new Error('Select a trace containing exactly one run-start');
    const trace = starts[0].payload as AutoPaintDiagnosticRunInputV1;
    if (
        trace.schemaVersion !== 1 ||
        !trace.appearanceProfile ||
        !trace.settings ||
        !trace.filaments?.length
    )
        throw new Error('Incomplete diagnostic input');
    const design = JSON.parse(designRaw.toString('utf8')) as {
        schemaVersion: number;
        layerHeight: number;
        firstLayerHeight: number;
        strips: DiagnosticStripDesign[];
        traceMatches?: { stripId: string; patchNumber: number; targetColor: string }[];
        knownReferences?: { id: string; title: string; foreground: string; substrate: string }[];
    };
    if (
        design.schemaVersion !== 1 ||
        design.layerHeight !== trace.settings.layerHeight ||
        design.firstLayerHeight !== trace.settings.firstLayerHeight ||
        !design.strips?.length
    )
        throw new Error('Design and trace must specify identical physical layer heights');
    const files: Record<string, { sha256: string; bytes: number }> = {};
    const write = (name: string, value: string | Uint8Array) => {
        writeFileSync(resolve(out, name), value, { flag: 'wx' });
        files[name] = { sha256: hash(value), bytes: Buffer.byteLength(value) };
    };
    const json = (name: string, value: unknown) =>
        write(name, JSON.stringify(value, null, 2) + '\n');
    await withViteTestServer(async (server) => {
        const [appearance, fit, diagnostics, validation, profiles] = await Promise.all([
            server.ssrLoadModule('/src/lib/appearanceProfile.ts') as Promise<
                typeof import('../src/lib/appearanceProfile.ts')
            >,
            server.ssrLoadModule('/src/lib/appearanceModel.ts') as Promise<
                typeof import('../src/lib/appearanceModel.ts')
            >,
            server.ssrLoadModule('/src/lib/diagnosticPrint.ts') as Promise<
                typeof import('../src/lib/diagnosticPrint.ts')
            >,
            server.ssrLoadModule('/src/lib/appearanceValidation.ts') as Promise<
                typeof import('../src/lib/appearanceValidation.ts')
            >,
            server.ssrLoadModule('/src/lib/profileManager.ts') as Promise<
                typeof import('../src/lib/profileManager.ts')
            >,
        ]);
        const profile = {
            id: 'frozen-diagnostic-profile',
            name: 'Frozen full diagnostic profile',
            version: 3,
            createdAt: 0,
            updatedAt: 0,
            filaments: trace.filaments,
            appearance: trace.appearanceProfile,
        };
        const parsed = profiles.parseProfileFile(JSON.stringify(profile));
        if (
            parsed?.length !== 1 ||
            appearance.fingerprintAppearanceFilaments(parsed[0].filaments) !==
                appearance.fingerprintAppearanceFilaments(trace.filaments)
        )
            throw new Error('Invalid profile; refusing to silently repair diagnostic input');
        const context = {
            filaments: trace.filaments,
            filamentProfileFingerprint: appearance.fingerprintAppearanceFilaments(trace.filaments),
            layerHeight: design.layerHeight,
            firstLayerHeight: design.firstLayerHeight,
            transitionOpacity: trace.settings.transitionOpacity,
        };
        console.log('Fitting the full frozen profile (no benchmark holdouts)...');
        const model = fit.fitAppearanceRankModel(trace.appearanceProfile!, context);
        const observations = validation.planAppearanceValidation(
            trace.appearanceProfile!,
            context,
            {
                scenarios: [],
            }
        );
        const known = (design.knownReferences ?? []).map((ref) => {
            const candidates = observations.observations.filter(
                (o) =>
                    o.layers.length >= 2 &&
                    o.layers.at(-1)!.filamentColor.toLowerCase() === ref.foreground.toLowerCase() &&
                    o.layers.at(-2)!.filamentColor.toLowerCase() === ref.substrate.toLowerCase()
            );
            candidates.sort(
                (a, b) =>
                    a.layers.length - b.layers.length ||
                    a.layers.reduce((s, l) => s + l.thickness, 0) -
                        b.layers.reduce((s, l) => s + l.thickness, 0) ||
                    a.sampleIndex - b.sampleIndex
            );
            const chosen = candidates.find((o) =>
                o.layers.every((l, i) => {
                    const n =
                        i === 0
                            ? 1 + (l.thickness - design.firstLayerHeight) / design.layerHeight
                            : l.thickness / design.layerHeight;
                    return n >= 1 && Math.abs(n - Math.round(n)) < 1e-6;
                })
            );
            if (!chosen) throw new Error(`No measured, layer-compatible reference for ${ref.id}`);
            const matrix = observations.matrices.find((m) => m.id === chosen.matrixId)!;
            const sample = matrix.samples.find((s) => s.index === chosen.sampleIndex)!;
            const top = Math.round(chosen.layers.at(-1)!.thickness / design.layerHeight);
            return {
                id: ref.id,
                title: ref.title,
                purpose:
                    'Two identical copies of a known photographed Matrix recipe. Compare repeatability and transfer, not independent prediction accuracy.',
                backing: chosen.layers.slice(0, -1).map((l, i) => ({
                    color: l.filamentColor,
                    layers: Math.round(
                        i === 0
                            ? 1 + (l.thickness - design.firstLayerHeight) / design.layerHeight
                            : l.thickness / design.layerHeight
                    ),
                })),
                foreground: ref.foreground,
                topLayers: [top, top],
                reference: {
                    matrixId: chosen.matrixId,
                    sampleIndex: chosen.sampleIndex,
                    measuredRgb: sample.measuredColor!.rgb,
                    originalFirstLayerHeight: matrix.process.firstLayerHeight,
                },
            } satisfies DiagnosticStripDesign;
        });
        const strips = [...design.strips, ...known].map((s) =>
            diagnostics.planDiagnosticStrip(s, context, model)
        );
        if (new Set(strips.map((s) => s.design.id)).size !== strips.length)
            throw new Error('Duplicate strip IDs');
        const results = records.filter((r) => r.kind === 'result');
        if (
            design.traceMatches?.length &&
            (results.length !== 1 || !results[0].payload.result?.finalStack)
        )
            throw new Error('Trace-matched designs require one completed final-stack snapshot');
        const traceMatches = (design.traceMatches ?? []).map((ref) => {
            const strip = strips.find((s) => s.design.id === ref.stripId);
            if (!strip) throw new Error(`Unknown trace-match strip ${ref.stripId}`);
            return diagnostics.verifyDiagnosticTraceMatch(
                strip,
                ref.patchNumber,
                ref.targetColor,
                results[0].payload.result.finalStack as FinalPrintableStackSnapshot
            );
        });
        const execution = {
            createdAt: new Date().toISOString(),
            codeRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
            workingTreeStatus: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }),
            node: process.version,
            inputName: input,
            inputSha256: hash(raw),
            designSha256: hash(designRaw),
            fullProfile: true,
            optimizerRun: false,
            modelFingerprint: model.fingerprint,
            command: process.argv.slice(1),
        };
        // Snapshot source BEFORE export. Include new/uncommitted files, not only git HEAD.
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
                'tests/benchmark',
                'package.json',
                'package-lock.json',
                'tsconfig.json',
                'tsconfig.app.json',
                'tsconfig.node.json',
            ],
            { encoding: 'utf8' }
        )
            .trim()
            .split(/\r?\n/)
            .filter((p) => /\.(?:tsx?|m?js|json|css)$/.test(p));
        const sourceZip = new JSZip(),
            sourceHashes: Record<string, string> = {};
        for (const name of [...new Set(sourcePaths)].sort()) {
            const bytes = readFileSync(resolve(name));
            sourceZip.file(name, bytes);
            sourceHashes[name] = hash(bytes);
        }
        mkdirSync(out);
        mkdirSync(resolve(out, 'strips'));
        write('source-trace.jsonl', raw);
        write('design.json', designRaw);
        json('frozen-profile.kfil', profile);
        json('full-profile-model.json', model);
        json('predictions.json', { schemaVersion: 1, execution, context, strips });
        json('source-manifest.json', sourceHashes);
        write(
            'working-tree.patch',
            execFileSync('git', ['diff', 'HEAD', '--binary'], { maxBuffer: 32 * 1024 * 1024 })
        );
        write(
            'source-code.zip',
            await sourceZip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
        );
        write('README.md', instructions(strips));
        write('patch-map.html', patchMap(strips));
        write('verify-bundle.mjs', readFileSync(resolve('scripts/verify-diagnostic-bundle.mjs')));
        json('observations-template.json', {
            note: 'COPY outside the frozen bundle before editing. Record observations BEFORE changing calibration.',
            printer: null,
            nozzle: null,
            spools: null,
            temperatures: null,
            flow: null,
            lineWidths: null,
            speeds: null,
            infillDirections: null,
            cooling: null,
            surfaceTreatment: null,
            purgeSettings: null,
            slicerProject: null,
            slicedOutput: null,
            lighting: null,
            cameraSettings: null,
            photos: [],
            patches: strips.flatMap((s) =>
                s.patches.map((p) => ({
                    id: p.id,
                    observation: null,
                    measuredRgb: null,
                    repeatAgreement: null,
                }))
            ),
        });
        const checks = [];
        for (const strip of strips) {
            const bytes = new Uint8Array(
                await (await diagnostics.exportDiagnosticStrip(strip)).arrayBuffer()
            );
            const check = await verifyDiagnostic3mf(bytes, strip);
            write(`strips/${strip.design.id}.3mf`, bytes);
            checks.push({ strip: strip.design.id, ...check });
            console.log(
                `${strip.design.id}: ${strip.patches.length} pads, ${strip.layers.length} layers; serialized stacks/materials/topology verified`
            );
        }
        // Detect accidental source edits during the run before declaring the bundle complete.
        for (const [name, expected] of Object.entries(sourceHashes))
            if (hash(readFileSync(resolve(name))) !== expected)
                throw new Error(`Source changed during export: ${name}; bundle is incomplete`);
        json('verification.json', {
            checks,
            traceMatches,
            scope: 'Serialized 3MF topology, exact physical layers, pad centre stacks and material assignments. Does not validate slicer toolpaths or physical color accuracy.',
        });
        writeFileSync(
            resolve(out, 'manifest.json'),
            JSON.stringify(
                { schemaVersion: 1, status: 'frozen-pre-print', execution, files },
                null,
                2
            ) + '\n',
            { flag: 'wx' }
        );
        console.log(
            `Ready: ${relative(process.cwd(), out)} (${strips.length} strips; ${strips.reduce((n, s) => n + s.patches.length, 0)} pads).`
        );
    });
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
