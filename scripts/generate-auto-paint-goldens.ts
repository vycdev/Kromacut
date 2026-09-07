import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { autoPaintGoldenScenarios } from '../tests/autoPaintGoldenFixtures.ts';
import { loadViteModule } from '../tests/helpers/viteModule.ts';

type AutoPaintModule = typeof import('../src/lib/autoPaint.ts');

const LAYER_HEIGHT = 0.08;
const FIRST_LAYER_HEIGHT = 0.16;

const { generateAutoLayers } = await loadViteModule<AutoPaintModule>('/src/lib/autoPaint.ts');
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
            { algorithm: 'balanced', seed: scenario.seed }
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
