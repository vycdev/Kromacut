/**
 * Web Worker for auto-paint computation.
 *
 * Offloads the heavy `generateAutoLayers` call (which includes the
 * filament-order optimizer) to a background thread so the UI stays
 * responsive while the algorithm runs.
 */

import {
    DEFAULT_TRANSITION_OPACITY,
    generateAutoLayers,
    type AutoPaintImageSwatch,
    type AutoPaintResult,
} from '../lib/autoPaint';
import type { AutoPaintRepeatLimit, Filament } from '../types';
import type { OptimizerOptions } from '../lib/optimizer';
import { fitAppearanceRankModel } from '../lib/appearanceModel';
import {
    fingerprintAppearanceFilaments,
    type AppearanceProfileV1,
} from '../lib/appearanceProfile';

type WorkerOptimizerOptions = Omit<OptimizerOptions, 'onProgress'>;

export interface AutoPaintWorkerRequest {
    id: number;
    filaments: Filament[];
    imageSwatches: AutoPaintImageSwatch[];
    layerHeight: number;
    firstLayerHeight: number;
    maxHeight?: number;
    enhancedColorMatch?: boolean;
    maxRepeatedSwaps?: AutoPaintRepeatLimit;
    optimizerOptions?: Partial<WorkerOptimizerOptions>;
    /** JSON transport avoids recursively cloning a large evidence graph on the UI thread. */
    appearanceJson?: string;
    /** Legacy/direct-worker input retained for compatibility with focused tests. */
    appearance?: AppearanceProfileV1;
}

interface AutoPaintWorkerResult {
    id: number;
    result?: AutoPaintResult;
    error?: string;
}

export interface AutoPaintWorkerProgress {
    type: 'progress';
    id: number;
    progress: number;
    iteration: number;
    total: number;
    bestScore: number;
}

export type AutoPaintWorkerResponse = AutoPaintWorkerResult | AutoPaintWorkerProgress;

self.onmessage = (e: MessageEvent<AutoPaintWorkerRequest>) => {
    const req = e.data;
    const PROGRESS_INTERVAL_MS = 100;
    let lastProgress = 0;
    let lastProgressAt = -Infinity;

    const reportProgress = (iteration: number, total: number, bestScore: number) => {
        const progress = Math.max(lastProgress, Math.min(1, total > 0 ? iteration / total : 0));
        const now = performance.now();
        if (progress < 1 && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;

        lastProgress = progress;
        lastProgressAt = now;
        const response: AutoPaintWorkerProgress = {
            type: 'progress',
            id: req.id,
            progress,
            iteration,
            total,
            bestScore,
        };
        self.postMessage(response);
    };

    try {
        const appearance = req.appearanceJson
            ? (JSON.parse(req.appearanceJson) as AppearanceProfileV1)
            : req.appearance;
        const appearanceModel = fitAppearanceRankModel(appearance, {
            filamentProfileFingerprint: fingerprintAppearanceFilaments(req.filaments),
            layerHeight: req.layerHeight,
            firstLayerHeight: Math.max(req.layerHeight, req.firstLayerHeight),
            transitionOpacity:
                req.optimizerOptions?.transitionOpacity ?? DEFAULT_TRANSITION_OPACITY,
            filaments: req.filaments,
        });
        const result = generateAutoLayers(
            req.filaments,
            req.imageSwatches,
            req.layerHeight,
            req.firstLayerHeight,
            req.maxHeight,
            req.enhancedColorMatch,
            (req.maxRepeatedSwaps ?? 0) > 0,
            {
                ...req.optimizerOptions,
                onProgress: reportProgress,
            },
            appearanceModel
        );

        reportProgress(1, 1, result.optimizerMetadata?.score ?? Infinity);
        const response: AutoPaintWorkerResult = { id: req.id, result };
        self.postMessage(response);
    } catch (err) {
        const response: AutoPaintWorkerResult = {
            id: req.id,
            error: err instanceof Error ? err.message : String(err),
        };
        self.postMessage(response);
    }
};
