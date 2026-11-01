import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { AutoPaintResult } from '../src/lib/autoPaint.ts';
import type { Filament } from '../src/types/index.ts';

function savedEvidence(asset = 'fresh-exact-initial') {
    return JSON.parse(
        gunzipSync(
            readFileSync(`tests/benchmark/results/cats-exact/2026-11-01/${asset}.json.gz`)
        ).toString('utf8')
    ) as {
        configuration: {
            layerHeight: number;
            firstLayerHeight: number;
            transitionOpacity: number;
            maxHeight: number | null;
            preserveColorSeparation: boolean;
            maximumColorErrorDeltaE: number;
            failIfAnyColorIsMissed: boolean;
            maximumExtraFilamentAppearances: number;
        };
        filaments: Filament[];
        swatches: { hex: string; count: number }[];
        swatchesSha256: string;
        result: AutoPaintResult;
        resultSha256: string;
    };
}

const scenarios: {
    name: string;
    asset?: string;
    change: (saved: ReturnType<typeof savedEvidence>) => void;
    error: RegExp | undefined;
}[] = [
    { name: 'unchanged Exact evidence', change: () => {}, error: undefined },
    {
        name: 'a recorded-order audit as fresh Exact',
        asset: 'recorded-order-HEAD',
        change: () => {},
        error: /not produced by the Exact optimizer/,
    },
    {
        name: 'an optimizer cache hit as fresh Exact',
        change: (saved) => {
            Object.assign(saved.result.optimizerMetadata!, { cacheHit: true });
            saved.resultSha256 = createHash('sha256')
                .update(JSON.stringify(saved.result))
                .digest('hex');
        },
        error: /uncached Exact run/,
    },
    {
        name: 'a changed height cap',
        change: (saved) => {
            saved.configuration.maxHeight = 4;
        },
        error: /Saved height cap/,
    },
    {
        name: 'a changed separation mode',
        change: (saved) => {
            saved.configuration.preserveColorSeparation = false;
        },
        error: /Saved separation mode/,
    },
    {
        name: 'a changed color-error limit',
        change: (saved) => {
            saved.configuration.maximumColorErrorDeltaE = 6;
        },
        error: /Saved color-error limit/,
    },
    {
        name: 'a changed separation failure policy',
        change: (saved) => {
            saved.configuration.failIfAnyColorIsMissed = true;
        },
        error: /Saved separation failure policy/,
    },
    {
        name: 'a repeat budget below the chosen order',
        change: (saved) => {
            saved.configuration.maximumExtraFilamentAppearances = 0;
        },
        error: /Saved repeat budget/,
    },
    {
        name: 'a changed layer grid',
        change: (saved: ReturnType<typeof savedEvidence>) => {
            saved.configuration.layerHeight = 0.16;
        },
        error: /Saved layer height/,
    },
    {
        name: 'a changed filament',
        change: (saved: ReturnType<typeof savedEvidence>) => {
            saved.filaments[0].td *= 2;
        },
        error: /Saved filaments/,
    },
    {
        name: 'a different palette with its own valid checksum',
        change: (saved: ReturnType<typeof savedEvidence>) => {
            saved.swatches[0].count++;
            // A self-consistent checksum must still agree with the source image.
            saved.swatchesSha256 = createHash('sha256')
                .update(JSON.stringify(saved.swatches))
                .digest('hex');
        },
        error: /Saved swatches/,
    },
    {
        name: 'an appearance model fitted for another context',
        change: (saved: ReturnType<typeof savedEvidence>) => {
            Object.assign(saved.result.finalStack.appearanceModel, {
                contextFingerprint: 'another-context',
            });
            saved.resultSha256 = createHash('sha256')
                .update(JSON.stringify(saved.result))
                .digest('hex');
        },
        error: /Saved appearance model/,
    },
];
for (const scenario of scenarios) {
    test(`cached preparation ${scenario.error ? 'rejects' : 'accepts'} ${scenario.name}`, () => {
        const directory = mkdtempSync(join(tmpdir(), 'kromacut-cached-evidence-'));
        try {
            const saved = savedEvidence(scenario.asset);
            scenario.change(saved);
            const source = join(directory, 'evidence.json');
            const output = join(directory, 'cases.json');
            writeFileSync(source, JSON.stringify(saved));
            const child = spawnSync(
                process.execPath,
                [
                    '--no-warnings',
                    '--experimental-strip-types',
                    'tests/benchmark/multiHeadAppearance.ts',
                    '--prepare',
                    '--cases',
                    'cats',
                    '--calibrated-result',
                    source,
                    '--input',
                    output,
                ],
                { encoding: 'utf8', timeout: 30_000 }
            );
            if (scenario.error) {
                assert.notEqual(child.status, 0);
                assert.match(child.stderr, scenario.error);
                assert.equal(existsSync(output), false);
            } else {
                assert.equal(child.status, 0, child.stderr);
                const [prepared] = JSON.parse(readFileSync(output, 'utf8'));
                assert.equal(
                    prepared.result.finalStack.fingerprint,
                    saved.result.finalStack.fingerprint
                );
                assert.equal(prepared.layerHeight, saved.result.finalStack.settings.layerHeight);
                assert.deepEqual(prepared.result, saved.result);
            }
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
}
