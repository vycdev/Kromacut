import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { withViteTestServer } from '../helpers/viteModule.ts';
import { imageSwatches } from '../helpers/calibratedSwatches.ts';
import {
    benchmarkSourceRoot,
    persistOptimizerEvidence,
    sha256,
} from '../helpers/optimizerEvidence.ts';

// An audit of fixed-order construction, deliberately separate from fresh Exact.
const root = resolve('tests/assets/performance/8-colors-frontlit-2026-08-26');
const fixturePath = resolve(root, 'cats/case.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const swatches = imageSwatches(resolve(root, 'cats/source.png'));
const recorded = JSON.parse(
    readFileSync(
        'tests/benchmark/results/multi-head-appearance/2026-11-01-recorded-cats-order.json',
        'utf8'
    )
);
const refs = process.argv.slice(2);
assert.ok(refs.length, 'Supply Git revisions to audit');
const rows = [];
for (const ref of refs) {
    const sourceRoot = benchmarkSourceRoot(ref);
    const sourcePath = resolve(sourceRoot, 'src/lib/autoPaint.ts');
    const source = readFileSync(sourcePath, 'utf8');
    const branch = 'if (enhancedColorMatch) {';
    assert.equal(source.split(branch).length, 2);
    writeFileSync(
        sourcePath,
        source.replace(
            branch,
            'if (!enhancedColorMatch) { sortedFilaments = filaments; } else if (enhancedColorMatch) {'
        )
    );
    const prefix = '/' + relative(process.cwd(), sourceRoot).replaceAll('\\', '/');
    const modules = await withViteTestServer(async (server) => ({
        auto: (await server.ssrLoadModule(
            prefix + '/src/lib/autoPaint.ts'
        )) as typeof import('../../src/lib/autoPaint.ts'),
        appearance: (await server.ssrLoadModule(
            prefix + '/src/lib/appearanceModel.ts'
        )) as typeof import('../../src/lib/appearanceModel.ts'),
        profile: (await server.ssrLoadModule(
            prefix + '/src/lib/profileManager.ts'
        )) as typeof import('../../src/lib/profileManager.ts'),
        fingerprint: (await server.ssrLoadModule(
            prefix + '/src/lib/appearanceProfile.ts'
        )) as typeof import('../../src/lib/appearanceProfile.ts'),
    }));
    const parsed = modules.profile.parseProfileFile(
        readFileSync(resolve(root, 'profile.kfil'), 'utf8')
    );
    assert.ok(parsed);
    const profile = modules.profile.importProfiles([], parsed).imported[0];
    const start = performance.now();
    const model = modules.appearance.fitAppearanceRankModel(profile.appearance, {
        filamentProfileFingerprint: modules.fingerprint.fingerprintAppearanceFilaments(
            profile.filaments
        ),
        layerHeight: 0.08,
        firstLayerHeight: 0.4,
        transitionOpacity: 0.9,
        filaments: profile.filaments,
    });
    const appearanceFitMs = performance.now() - start;
    const order = recorded.filamentOrderColors.map((color: string) => {
        const filament = profile.filaments.find((f) => f.color.toLowerCase() === color);
        assert.ok(filament);
        return filament;
    });
    const buildStart = performance.now();
    const result = modules.auto.generateAutoLayers(
        order,
        swatches,
        0.08,
        0.4,
        5.92,
        false,
        false,
        {
            transitionOpacity: 0.9,
            preserveSeparation: true,
            separationMaxDeltaE: 20,
            failOnSeparationError: false,
        },
        model
    );
    const evidencePath = persistOptimizerEvidence({
        output: `.profiles/issue-117/audit-${ref}-${Date.now()}.json`,
        fixture: fixturePath,
        profile: resolve(root, 'profile.kfil'),
        sourceImage: resolve(root, 'cats/source.png'),
        configuration: fixture.settings,
        variant: 'recorded-order-audit',
        harnessPath: 'tests/benchmark/catsReplayAudit.ts',
        sourceRef: ref,
        filaments: profile.filaments,
        swatches,
        result,
        timing: { appearanceFitMs, optimizationMs: performance.now() - buildStart },
    });
    rows.push({
        ref,
        evidencePath,
        fingerprint: result.finalStack.fingerprint,
        modelSha256: sha256(JSON.stringify(model)),
        layers: result.finalStack.layers.length,
        totalHeight: result.totalHeight,
        physicalLayersSha256: sha256(
            JSON.stringify(result.finalStack.layers.map((l) => [l.filamentId, l.thickness]))
        ),
        predictedColorsSha256: sha256(
            JSON.stringify(result.finalStack.layers.map((l) => l.predictedColor))
        ),
        mappingsSha256: sha256(JSON.stringify(result.finalStack.targetMappings)),
    });
    process.stdout.write(JSON.stringify(rows.at(-1)) + '\n');
    writeFileSync('.profiles/issue-117/audit-summary.json', JSON.stringify(rows, null, 2) + '\n');
}
