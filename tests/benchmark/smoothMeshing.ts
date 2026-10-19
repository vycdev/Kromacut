import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { generateSmoothMesh } from '../../src/lib/meshing.ts';
import {
    logoFixturePath,
    largeIssueFixturePath,
    maskFromPngAlpha,
    maskFromJpegLuminance,
} from '../imageFixtures.ts';

// Optional positional Git ref compares the presets with the pre-change mesher in
// the same process. Alternate order to reduce warmup/GC bias; timings are medians.
const baselineRef = process.argv[2];
const baselinePath = fileURLToPath(new URL('.smooth-meshing-baseline.ts', import.meta.url));
const noYield = { yieldIntervalMs: Infinity, onYield: async () => undefined };
const variants = ['none', 'minimal', 'medium', 'aggressive'] as const;
const fixtures = [
    { name: 'logo 256px', mask: maskFromPngAlpha(logoFixturePath, 256) },
    { name: 'logo 1024px', mask: maskFromPngAlpha(logoFixturePath, 1024) },
    ...[96, 144, 192].map((threshold) => ({
        name: `photo 512px threshold ${threshold}`,
        mask: maskFromJpegLuminance(largeIssueFixturePath, 512, threshold),
    })),
];
let createdBaseline = false;
try {
    let baseline: typeof generateSmoothMesh | undefined;
    if (baselineRef) {
        writeFileSync(
            baselinePath,
            execFileSync('git', ['show', `${baselineRef}:src/lib/meshing.ts`], {
                encoding: 'utf8',
            }),
            { flag: 'wx' }
        );
        createdBaseline = true;
        baseline = (await import(pathToFileURL(baselinePath).href)).generateSmoothMesh;
    }
    const results = [];
    for (const { name, mask } of fixtures) {
        const run = (strength: (typeof variants)[number] | 'baseline') => {
            const generate = strength === 'baseline' ? baseline! : generateSmoothMesh;
            return generate(
                mask.activePixels,
                mask.width,
                mask.height,
                0.08,
                0.2,
                0.1,
                1,
                strength === 'baseline' ? noYield : { ...noYield, strength }
            );
        };
        if (baseline) {
            const old = await run('baseline');
            const medium = await run('medium');
            assert.deepEqual(
                medium.positions,
                old.positions,
                `${name}: Medium changed legacy vertices`
            );
            assert.deepEqual(medium.indices, old.indices, `${name}: Medium changed legacy faces`);
        }
        const names = baseline ? ['baseline' as const, ...variants] : [...variants];
        const reference = await run('medium');
        const samples = new Map(names.map((variant) => [variant, [] as number[]]));
        const sizes = new Map<string, { vertices: number; triangles: number }>();
        for (let round = 0; round < 11; round++) {
            for (const variant of round % 2 ? [...names].reverse() : names) {
                const start = performance.now();
                const mesh = await run(variant);
                const elapsed = performance.now() - start;
                assert.equal(
                    mesh.positions.length,
                    reference.positions.length,
                    `${name}: ${variant} increased vertices`
                );
                assert.equal(
                    mesh.indices.length,
                    reference.indices.length,
                    `${name}: ${variant} changed triangle count`
                );
                if (round >= 2) samples.get(variant)!.push(elapsed);
                sizes.set(variant, {
                    vertices: mesh.positions.length / 3,
                    triangles: mesh.indices.length / 3,
                });
            }
        }
        results.push({
            fixture: name,
            activePixels: mask.activeCount,
            presets: Object.fromEntries(
                names.map((variant) => {
                    const sorted = samples.get(variant)!.sort((a, b) => a - b);
                    return [variant, { medianMs: +sorted[4].toFixed(2), ...sizes.get(variant) }];
                })
            ),
        });
    }
    process.stdout.write(
        JSON.stringify({ baselineRef, samplesPerPreset: 9, results }, null, 2) + '\n'
    );
} finally {
    if (createdBaseline) unlinkSync(baselinePath);
}
