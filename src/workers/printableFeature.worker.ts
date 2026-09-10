import {
    simulatePrintableFeatures,
    type PrintableFeatureSimulation,
} from '../lib/printableFeatures.ts';

export interface PrintableFeatureWorkerRequest {
    id: number;
    width: number;
    height: number;
    data: Uint8ClampedArray;
    pixelSizeMm: number;
    lineWidthMm: number;
    omitAtRiskPixels: boolean;
}

export interface PrintableFeatureWorkerResponse {
    id: number;
    result?: PrintableFeatureSimulation;
    error?: string;
}

self.onmessage = (event: MessageEvent<PrintableFeatureWorkerRequest>) => {
    const request = event.data;
    try {
        const result = simulatePrintableFeatures(request);
        const response: PrintableFeatureWorkerResponse = { id: request.id, result };
        self.postMessage(response, {
            transfer: [result.data.buffer as ArrayBuffer, result.changeMask.buffer as ArrayBuffer],
        });
    } catch (error) {
        const response: PrintableFeatureWorkerResponse = {
            id: request.id,
            error: error instanceof Error ? error.message : String(error),
        };
        self.postMessage(response);
    }
};
