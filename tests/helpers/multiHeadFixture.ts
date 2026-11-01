import type { AutoPaintResult } from '../../src/lib/autoPaint.ts';
import type { ColorFirstResult } from '../../src/lib/multiHeadAnalysisColorFirst.ts';
import type { PrinterLayer, WindowResult } from '../../src/lib/multiHeadAnalysis.ts';
import type { Filament, ThreeDControlsStateShape } from '../../src/types/index.ts';

/** A deliberate plan, independent of optimizer heuristics: two windows plus all three range kinds. */
export function multiHeadFixture(firstLayerHeight = 0.2) {
    const filaments: Filament[] = [
        { id: 'A', color: '#112233', td: 0.5 },
        { id: 'B', color: '#CC2233', td: 0.8 },
        { id: 'C', color: '#DDCC22', td: 1.2 },
        { id: 'D', color: '#2244DD', td: 1.8 },
    ];
    const first = Math.max(firstLayerHeight, 0.12);
    const consensus = [0, 0, 1, 2, 2, 2, 3, 0];
    const layers: PrinterLayer[] = consensus.map((filamentIdx, i) => {
        const filament = filaments[filamentIdx];
        const hex = parseInt(filament.color.slice(1), 16);
        return {
            filamentIdx,
            filamentId: filament.id,
            filamentRgb: { r: hex >> 16, g: (hex >> 8) & 255, b: hex & 255 },
            td: filament.td,
            startZ: i === 0 ? 0 : first + (i - 1) * 0.12,
            thickness: i === 0 ? first : 0.12,
        };
    });
    const colors = ['#808080', '#AA9977'];
    const targetMappings = colors.map((hex) => {
        const rgb = parseInt(hex.slice(1), 16);
        return {
            targetColor: { hex, rgb: [rgb >> 16, (rgb >> 8) & 255, rgb & 255] },
            projectedHeight: first + 7 * 0.12,
            usageWeight: 1,
            // A deliberately poor normal stack, so this plan clears the build's gain check.
            predictedColor: { hex: '#000000', rgb: [0, 0, 0] },
        };
    });
    // Only the original material runs and target mappings are needed by this
    // fixture's build, geometry, and instruction paths; no optimizer is invoked.
    const autoPaintResult = {
        layers: consensus.map((fi, i) => ({
            filamentColor: filaments[fi].color,
            startHeight: layers[i].startZ,
            endHeight: layers[i].startZ + layers[i].thickness,
        })),
        totalHeight: first + 7 * 0.12,
        finalStack: {
            appearanceModel: { applied: false, exactAnchors: [], localEvidence: [], empiricalLuts: [] },
            targetMappings,
            palette: [],
        },
    } as unknown as AutoPaintResult;
    const state: ThreeDControlsStateShape = {
        layerHeight: 0.12,
        slicerFirstLayerHeight: firstLayerHeight,
        colorOrder: layers.map((_, i) => i),
        colorSliceHeights: layers.map((layer) => layer.thickness),
        filteredSwatches: layers.map((_, i) => ({ hex: filaments[consensus[i]].color, a: 255 })),
        autoPaintFilamentSwatches: layers.map((_, i) => ({
            hex: filaments[consensus[i]].color,
            a: 255,
        })),
        pixelSize: 0.1,
        filaments,
        paintMode: 'autopaint',
        autoPaintResult,
        multiHeadMode: true,
        multiHeadCount: 3,
        multiHeadSearchDepth: 'balanced',
    };
    const window = (windowStart: number, windowEnd: number) =>
        ({ windowStart, windowEnd }) as WindowResult;
    const result: ColorFirstResult = {
        // Selection order deliberately differs from print order.
        windows: [window(5, 6), window(1, 2)],
        patchedLayers: layers,
        colorLayerFilaments: new Map([
            [colors[0], [0, 1, 0, 2, 2, 2, 3, 0]],
            [colors[1], [0, 0, 1, 2, 2, 3, 2, 0]],
        ]),
        windowRunFilaments: [
            ['C', 'D'],
            ['A', 'B'],
        ],
        nozzleAssignments: [
            [1, 0, -1],
            [1, 0, -1],
        ],
        nonWindowedRanges: [
            { rangeStart: 0, rangeEnd: 0, nozzleFilaments: ['A', '', ''] },
            { rangeStart: 3, rangeEnd: 4, nozzleFilaments: ['C', 'A', ''] },
            { rangeStart: 7, rangeEnd: 7, nozzleFilaments: ['A', 'C', ''] },
        ],
        preWindowFilaments: ['A'],
        colorAssignments: [],
        uniqueLayerCount: 2,
    };
    return { state, result, colors, layers };
}
