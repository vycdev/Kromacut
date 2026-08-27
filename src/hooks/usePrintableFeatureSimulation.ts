import { useEffect, useMemo, useState } from 'react';

import {
    concealPrintableFeatureBuffers,
    type PrintableFeatureSimulation,
} from '../lib/printableFeatures.ts';
import type { Swatch } from '../types';
import type {
    PrintableFeatureWorkerRequest,
    PrintableFeatureWorkerResponse,
} from '../workers/printableFeature.worker.ts';

interface UsePrintableFeatureSimulationOptions {
    enabled: boolean;
    imageSrc: string | null;
    sourceSwatches: Swatch[];
    pixelSizeMm: number;
    lineWidthMm: number;
    omitAtRiskPixels: boolean;
}

interface UsePrintableFeatureSimulationResult {
    simulation?: PrintableFeatureSimulation;
    printableSwatches: Swatch[];
    isComputing: boolean;
    error?: string;
}

let nextPrintableFeatureRequestId = 1;
let lastCompletedSimulation:
    | { key: string; simulation: PrintableFeatureSimulation }
    | undefined;

function simulationKey(
    imageSrc: string,
    pixelSizeMm: number,
    lineWidthMm: number,
    omitAtRiskPixels: boolean
): string {
    return JSON.stringify([imageSrc, pixelSizeMm, lineWidthMm, omitAtRiskPixels]);
}

function loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () =>
            reject(new Error('Could not load the image for printable-detail analysis'));
        image.src = source;
    });
}

export function usePrintableFeatureSimulation(
    options: UsePrintableFeatureSimulationOptions
): UsePrintableFeatureSimulationResult {
    const { enabled, imageSrc, sourceSwatches, pixelSizeMm, lineWidthMm, omitAtRiskPixels } =
        options;
    const [simulation, setSimulation] = useState<PrintableFeatureSimulation | undefined>();
    const [isComputing, setIsComputing] = useState(false);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        if (!enabled || !imageSrc) {
            setSimulation(undefined);
            setIsComputing(false);
            setError(undefined);
            return;
        }

        const cacheKey = simulationKey(
            imageSrc,
            pixelSizeMm,
            lineWidthMm,
            omitAtRiskPixels
        );
        if (lastCompletedSimulation?.key === cacheKey) {
            setSimulation(lastCompletedSimulation.simulation);
            setIsComputing(false);
            setError(undefined);
            return;
        }

        const requestId = nextPrintableFeatureRequestId++;
        let cancelled = false;
        let activeWorker: Worker | null = null;
        let retryTimer: number | null = null;
        let attempt = 0;

        setSimulation(undefined);
        setIsComputing(true);
        setError(undefined);

        const finishWithError = (message: string) => {
            if (cancelled) return;
            activeWorker?.terminate();
            activeWorker = null;
            setSimulation(undefined);
            setIsComputing(false);
            setError(message);
        };

        void loadImage(imageSrc)
            .then((image) => {
                if (cancelled) return;
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                if (!context)
                    throw new Error('Canvas is unavailable for printable-detail analysis');
                context.drawImage(image, 0, 0);

                const startAttempt = () => {
                    if (cancelled) return;
                    attempt += 1;
                    const worker = new Worker(
                        new URL('../workers/printableFeature.worker.ts', import.meta.url),
                        { type: 'module' }
                    );
                    activeWorker = worker;

                    const retryOrFail = (message: string) => {
                        if (cancelled || activeWorker !== worker) return;
                        worker.terminate();
                        activeWorker = null;
                        if (attempt < 2) {
                            retryTimer = window.setTimeout(() => {
                                retryTimer = null;
                                startAttempt();
                            }, 0);
                        } else {
                            finishWithError(message);
                        }
                    };

                    worker.onmessage = (
                        event: MessageEvent<PrintableFeatureWorkerResponse>
                    ) => {
                        if (
                            cancelled ||
                            activeWorker !== worker ||
                            event.data.id !== requestId
                        ) {
                            return;
                        }
                        worker.terminate();
                        activeWorker = null;
                        setIsComputing(false);
                        if (event.data.error || !event.data.result) {
                            setSimulation(undefined);
                            setError(event.data.error ?? 'Printable-detail analysis failed');
                        } else {
                            const simulation = concealPrintableFeatureBuffers(
                                event.data.result
                            );
                            lastCompletedSimulation = {
                                key: cacheKey,
                                simulation,
                            };
                            setSimulation(simulation);
                            setError(undefined);
                        }
                    };
                    worker.onerror = (event) => {
                        event.preventDefault();
                        retryOrFail(event.message || 'Printable-detail analysis failed');
                    };
                    worker.onmessageerror = () => {
                        retryOrFail('Printable-detail analysis returned an unreadable result');
                    };

                    const imageData = context.getImageData(
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    );
                    const request: PrintableFeatureWorkerRequest = {
                        id: requestId,
                        width: canvas.width,
                        height: canvas.height,
                        data: imageData.data,
                        pixelSizeMm,
                        lineWidthMm,
                        omitAtRiskPixels,
                    };
                    worker.postMessage(request, [imageData.data.buffer as ArrayBuffer]);
                };

                startAttempt();
            })
            .catch((loadError) => {
                if (cancelled) return;
                finishWithError(
                    loadError instanceof Error ? loadError.message : String(loadError)
                );
            });

        return () => {
            cancelled = true;
            if (retryTimer !== null) window.clearTimeout(retryTimer);
            activeWorker?.terminate();
        };
    }, [enabled, imageSrc, lineWidthMm, omitAtRiskPixels, pixelSizeMm]);

    const printableSwatches = useMemo(() => {
        if (!simulation) return [];
        const sourceByHex = new Map<string, Swatch>();
        const sourceOrder = new Map<string, number>();
        for (const [index, swatch] of sourceSwatches.entries()) {
            const hex = swatch.hex.toLowerCase();
            if (!sourceByHex.has(hex)) {
                sourceByHex.set(hex, swatch);
                sourceOrder.set(hex, index);
            }
        }

        return simulation.colorStats
            .map((stat) => {
                const source = sourceByHex.get(stat.hex);
                return {
                    hex: stat.hex,
                    a: source?.a ?? 255,
                    count: stat.count,
                    centerWeight: stat.centerWeight,
                    edgeWeight: stat.edgeWeight,
                    sampleContext: source?.sampleContext,
                } satisfies Swatch;
            })
            .sort((left, right) => {
                const leftIndex = sourceOrder.get(left.hex) ?? Number.MAX_SAFE_INTEGER;
                const rightIndex = sourceOrder.get(right.hex) ?? Number.MAX_SAFE_INTEGER;
                return leftIndex === rightIndex
                    ? left.hex.localeCompare(right.hex)
                    : leftIndex - rightIndex;
            });
    }, [simulation, sourceSwatches]);

    return { simulation, printableSwatches, isComputing, error };
}
