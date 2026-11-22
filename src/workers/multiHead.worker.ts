/**
 * Web Worker for multi-head analysis computation.
 *
 * Offloads `runMultiHeadLayerAnalysisColorFirst` off the main thread so the
 * UI stays responsive while the DP window search and nozzle optimizer run.
 */

import { runMultiHeadLayerAnalysisColorFirst } from '../lib/multiHeadAnalysisColorFirst';
import type { Filament, MultiHeadDitherContext } from '../types';
import type { AutoPaintResult } from '../lib/autoPaint';
import type {
    ColorFirstResult,
    MultiHeadColorMode,
} from '../lib/multiHeadAnalysisColorFirst';

export interface MultiHeadWorkerRequest {
    id: number;
    filaments: Filament[];
    autoPaintResult: AutoPaintResult;
    imageSwatches: Array<{ hex: string; count?: number }>;
    layerHeight: number;
    firstLayerHeight: number;
    n: number;
    searchDepth: 'fast' | 'balanced' | 'thorough';
    colorMode: MultiHeadColorMode;
    heightDithering?: boolean;
    ditherContext?: MultiHeadDitherContext;
}

export interface MultiHeadWorkerResponse {
    id: number;
    result?: ColorFirstResult;
    error?: string;
}

self.onmessage = (e: MessageEvent<MultiHeadWorkerRequest>) => {
    const req = e.data;
    try {
        const result = runMultiHeadLayerAnalysisColorFirst(
            req.filaments,
            req.autoPaintResult,
            req.imageSwatches,
            req.layerHeight,
            req.firstLayerHeight,
            req.n,
            req.searchDepth,
            req.colorMode,
            req.heightDithering,
            req.ditherContext
        );
        const response: MultiHeadWorkerResponse = { id: req.id, result };
        self.postMessage(response);
    } catch (err) {
        const response: MultiHeadWorkerResponse = {
            id: req.id,
            error: err instanceof Error ? err.message : String(err),
        };
        self.postMessage(response);
    }
};
