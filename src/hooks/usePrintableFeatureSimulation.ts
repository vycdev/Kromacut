import { useEffect, useMemo, useState } from 'react';

import type { PrintableFeatureSimulation } from '../lib/printableFeatures.ts';
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

        const requestId = nextPrintableFeatureRequestId++;
        let cancelled = false;
        const worker = new Worker(
            new URL('../workers/printableFeature.worker.ts', import.meta.url),
            {
                type: 'module',
            }
        );

        setSimulation(undefined);
        setIsComputing(true);
        setError(undefined);

        worker.onmessage = (event: MessageEvent<PrintableFeatureWorkerResponse>) => {
            if (cancelled || event.data.id !== requestId) return;
            worker.terminate();
            setIsComputing(false);
            if (event.data.error) {
                setSimulation(undefined);
                setError(event.data.error);
            } else {
                setSimulation(event.data.result);
                setError(undefined);
            }
        };
        worker.onerror = (event) => {
            if (cancelled) return;
            worker.terminate();
            setSimulation(undefined);
            setIsComputing(false);
            setError(event.message || 'Printable-detail analysis failed');
        };
        worker.onmessageerror = () => {
            if (cancelled) return;
            worker.terminate();
            setSimulation(undefined);
            setIsComputing(false);
            setError('Printable-detail analysis returned an unreadable result');
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
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
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
            })
            .catch((loadError) => {
                if (cancelled) return;
                worker.terminate();
                setSimulation(undefined);
                setIsComputing(false);
                setError(loadError instanceof Error ? loadError.message : String(loadError));
            });

        return () => {
            cancelled = true;
            worker.terminate();
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
