/** Reproducible issue #103 workload; no HTTP listener or source-image dependency. */
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { loadViteModule } from '../helpers/viteModule.ts';

const autoPaint =
    await loadViteModule<typeof import('../../src/lib/autoPaint.ts')>('/src/lib/autoPaint.ts');
const { createSequenceScorer } =
    await loadViteModule<typeof import('../../src/lib/optimizer.ts')>('/src/lib/optimizer.ts');
const filaments = [
    { id: 'white', color: '#ffffff', td: 0.677 },
    { id: 'black', color: '#000000', td: 0.05 },
    { id: 'green', color: '#00ff00', td: 0.885 },
    { id: 'yellow', color: '#ffff00', td: 0.556 },
];
const counts = (process.argv[2] ?? '16,1024,4096,16384,142066').split(',').map(Number);
const sequences = Array.from({ length: 24 }, (_, index) => {
    const remaining = [...filaments];
    const sequence = [];
    let value = index;
    while (remaining.length) {
        sequence.push(remaining.splice(value % remaining.length, 1)[0]);
        value = Math.floor(value / (remaining.length + 1));
    }
    return sequence;
});
console.log(
    JSON.stringify({
        node: process.version,
        cpu: cpus()[0]?.model,
        seed: 12345,
        source: 'current',
    })
);
for (const count of counts) {
    // Odd multiplication permutes 24-bit RGB, guaranteeing distinct targets.
    const swatches = Array.from({ length: count }, (_, index) => ({
        hex: `#${((((index + 12345) * 2654435761) >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`,
        count: 1 + (index % 5),
    }));
    const targets = swatches.map(({ hex, count: weight }) => ({
        ...autoPaint.rgbToLab(autoPaint.hexToRgb(hex)),
        weight,
    }));
    const context = {
        imageColors: targets,
        layerHeight: 0.12,
        firstLayerHeight: 0.2,
        maxHeight: 5,
    };
    const warm = createSequenceScorer(context, 0);
    sequences.forEach((sequence) => warm(sequence));
    const samples = [];
    let fingerprint = '';
    for (let run = 0; run < 3; run++) {
        const scorer = createSequenceScorer(context, 0);
        const started = performance.now();
        const evaluations = sequences.map((sequence) => scorer.evaluate(sequence));
        samples.push(performance.now() - started);
        const next = createHash('sha256').update(JSON.stringify(evaluations)).digest('hex');
        if (fingerprint && next !== fingerprint) throw new Error('Nondeterministic scoring');
        fingerprint = next;
    }
    console.log(
        JSON.stringify({ count, candidates: sequences.length, samplesMs: samples, fingerprint })
    );
    if (process.argv.includes('--search')) {
        for (const repeats of [0, 12] as const) {
            const started = performance.now();
            let progress = 0;
            try {
                const result = autoPaint.generateAutoLayers(
                    filaments,
                    swatches,
                    0.12,
                    0.2,
                    5,
                    true,
                    repeats > 0,
                    {
                        algorithm: 'fast',
                        seed: 12345,
                        maxExtraRepeats: repeats,
                        transitionOpacity: 0.8,
                        cachingEnabled: false,
                        onProgress(iteration, total) {
                            progress = iteration / total;
                            if (performance.now() - started > 15_000) throw new Error('censored');
                        },
                    }
                );
                console.log(
                    JSON.stringify({
                        count,
                        repeats,
                        elapsedMs: performance.now() - started,
                        finalStack: result.finalStack.fingerprint,
                        score: result.optimizerMetadata?.score,
                    })
                );
            } catch (error) {
                if (!(error instanceof Error) || error.message !== 'censored') throw error;
                console.log(
                    JSON.stringify({
                        count,
                        repeats,
                        elapsedMs: performance.now() - started,
                        progress,
                        censored: true,
                    })
                );
            }
        }
    }
}
