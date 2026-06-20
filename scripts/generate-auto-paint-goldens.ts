import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

import { autoPaintGoldenScenarios } from '../tests/autoPaintGoldenFixtures.ts';

type AutoPaintModule = typeof import('../src/lib/autoPaint.ts');

const LAYER_HEIGHT = 0.08;
const FIRST_LAYER_HEIGHT = 0.16;

async function loadAutoPaintModule(): Promise<AutoPaintModule> {
    const server = await createServer({
        appType: 'custom',
        cacheDir: 'dist/.vite-test-cache',
        configFile: false,
        logLevel: 'error',
        optimizeDeps: { noDiscovery: true },
        resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
        root: process.cwd(),
        server: { hmr: false, middlewareMode: true },
    });

    try {
        return (await server.ssrLoadModule('/src/lib/autoPaint.ts')) as AutoPaintModule;
    } finally {
        await server.close();
    }
}

const { generateAutoLayers } = await loadAutoPaintModule();
const goldens = Object.fromEntries(
    autoPaintGoldenScenarios().map((scenario) => {
        const result = generateAutoLayers(
            scenario.filaments,
            scenario.imageSwatches,
            LAYER_HEIGHT,
            FIRST_LAYER_HEIGHT,
            undefined,
            scenario.enhancedColorMatch,
            scenario.allowRepeatedSwaps,
            { algorithm: 'auto', seed: scenario.seed },
            'uniform',
            scenario.imageDimensions
        );

        return [
            scenario.name,
            {
                filamentOrder: result.filamentOrder,
                transitionZones: result.transitionZones.map((zone) => ({
                    filamentId: zone.filamentId,
                    startHeight: zone.startHeight,
                    endHeight: zone.endHeight,
                    idealThickness: zone.idealThickness,
                    actualThickness: zone.actualThickness,
                })),
                totalHeight: result.totalHeight,
                compressionRatio: result.compressionRatio,
            },
        ];
    })
);

const outputPath = resolve('tests', 'assets', 'auto-paint-goldens.json');
writeFileSync(outputPath, `${JSON.stringify(goldens, null, 2)}\n`);
console.log(`Wrote ${Object.keys(goldens).length} auto-paint goldens to ${outputPath}`);
