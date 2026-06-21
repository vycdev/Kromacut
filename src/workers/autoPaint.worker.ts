/**
 * Web Worker for auto-paint computation.
 *
 * Offloads the heavy `generateAutoLayers` call (which includes the
 * filament-order optimizer) to a background thread so the UI stays
 * responsive while the algorithm runs.
 */

import { generateAutoLayers } from '../lib/autoPaint';
import type { Filament } from '../types';
import type { OptimizerOptions } from '../lib/optimizer';
import type { AutoPaintResult } from '../lib/autoPaint';

export interface AutoPaintWorkerRequest {
    id: number;
    filaments: Filament[];
    imageSwatches: Array<{ hex: string; count?: number }>;
    layerHeight: number;
    firstLayerHeight: number;
    maxHeight?: number;
    enhancedColorMatch?: boolean;
    allowRepeatedSwaps?: boolean;
    optimizerOptions?: Partial<OptimizerOptions>;
}

export interface AutoPaintWorkerResponse {
    id: number;
    result?: AutoPaintResult;
    error?: string;
}

self.onmessage = (e: MessageEvent<AutoPaintWorkerRequest>) => {
    const req = e.data;

    try {
        const result = generateAutoLayers(
            req.filaments,
            req.imageSwatches,
            req.layerHeight,
            req.firstLayerHeight,
            req.maxHeight,
            req.enhancedColorMatch,
            req.allowRepeatedSwaps,
            req.optimizerOptions
        );

        const response: AutoPaintWorkerResponse = { id: req.id, result };
        self.postMessage(response);
    } catch (err) {
        const response: AutoPaintWorkerResponse = {
            id: req.id,
            error: err instanceof Error ? err.message : String(err),
        };
        self.postMessage(response);
    }
};
