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
import { fingerprintAppearanceFilaments, type AppearanceProfileV1 } from '../lib/appearanceProfile';
import {
    buildAutoPaintDiagnosticRunResult,
    type AutoPaintDiagnosticRunResultV1,
    type AutoPaintDiagnosticTimingV1,
} from '../lib/autoPaintDiagnostics';
import type { OptimizerDiagnosticEvent } from '../lib/optimizer';

type WorkerOptimizerOptions = Omit<OptimizerOptions, 'onProgress' | 'onDiagnostic'>;

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
    /** Desktop-only, decision-level trace collection for this request. */
    diagnostics?: boolean;
}

interface AutoPaintWorkerResult {
    id: number;
    result?: AutoPaintResult;
    /** Shares the result object in the same structured clone to avoid a second large message. */
    diagnosticResult?: AutoPaintDiagnosticRunResultV1;
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

export interface AutoPaintWorkerDiagnostic {
    type: 'diagnostic';
    id: number;
    kind: 'appearance-fit';
    payload: unknown;
}

export type AutoPaintWorkerResponse =
    | AutoPaintWorkerResult
    | AutoPaintWorkerProgress
    | AutoPaintWorkerDiagnostic;

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
        const workerStartedAt = performance.now();
        const appearance = req.appearanceJson
            ? (JSON.parse(req.appearanceJson) as AppearanceProfileV1)
            : req.appearance;
        const fitStartedAt = performance.now();
        const appearanceModel = fitAppearanceRankModel(appearance, {
            filamentProfileFingerprint: fingerprintAppearanceFilaments(req.filaments),
            layerHeight: req.layerHeight,
            firstLayerHeight: Math.max(req.layerHeight, req.firstLayerHeight),
            transitionOpacity:
                req.optimizerOptions?.transitionOpacity ?? DEFAULT_TRANSITION_OPACITY,
            filaments: req.filaments,
        });
        const appearanceFitMs = performance.now() - fitStartedAt;
        if (req.diagnostics) {
            const diagnostic: AutoPaintWorkerDiagnostic = {
                type: 'diagnostic',
                id: req.id,
                kind: 'appearance-fit',
                payload: {
                    durationMs: appearanceFitMs,
                    fingerprint: appearanceModel.fingerprint,
                    contextFingerprint: appearanceModel.contextFingerprint,
                    applied: appearanceModel.applied,
                    gateReason: appearanceModel.gateReason,
                    confidence: appearanceModel.confidence,
                    observationCount: appearanceModel.observationCount,
                    trainingObservationCount: appearanceModel.trainingObservationCount,
                    heldOutCount: appearanceModel.heldOutCount,
                    exactAnchorCount: appearanceModel.exactAnchors.length,
                    localEvidenceCount: appearanceModel.localEvidence.length,
                    empiricalLutCount: appearanceModel.empiricalLuts.length,
                    empiricalSampleCount: appearanceModel.empiricalLuts.reduce(
                        (sum, lut) => sum + lut.samples.length,
                        0
                    ),
                    effectiveOptics: appearanceModel.effectiveOptics ?? null,
                },
            };
            self.postMessage(diagnostic);
        }
        const optimizerEvents: OptimizerDiagnosticEvent[] = [];
        const generationStartedAt = performance.now();
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
                ...(req.diagnostics
                    ? {
                          onDiagnostic: (event: OptimizerDiagnosticEvent) => {
                              optimizerEvents.push(event);
                          },
                      }
                    : {}),
            },
            appearanceModel
        );
        const generationMs = performance.now() - generationStartedAt;

        let diagnosticResult: AutoPaintDiagnosticRunResultV1 | undefined;
        if (req.diagnostics) {
            const traceStartedAt = performance.now();
            const timing: AutoPaintDiagnosticTimingV1 = {
                appearanceFitMs,
                generationMs,
                traceAssemblyMs: 0,
                totalWorkerMs: 0,
            };
            diagnosticResult = buildAutoPaintDiagnosticRunResult(result, optimizerEvents, timing);
            timing.traceAssemblyMs = performance.now() - traceStartedAt;
            timing.totalWorkerMs = performance.now() - workerStartedAt;
        }

        reportProgress(1, 1, result.optimizerMetadata?.score ?? Infinity);
        const response: AutoPaintWorkerResult = { id: req.id, result, diagnosticResult };
        self.postMessage(response);
    } catch (err) {
        const response: AutoPaintWorkerResult = {
            id: req.id,
            error: err instanceof Error ? err.message : String(err),
        };
        self.postMessage(response);
    }
};
