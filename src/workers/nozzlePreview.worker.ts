import { assertNozzlePatchSize } from '../lib/nozzlePatchLimits';
import {
    simulatePrintableFeatures,
    type PrintableFeatureSimulation,
} from '../lib/printableFeatures';
import { estimateNozzleAppearance, type NozzleAppearance } from '../lib/nozzleAppearance';
import { patchVulnerableRegions, type RegionPatch } from '../lib/patchVulnerableRegions';
import type { PrintableFeatureWorkerRequest } from './printableFeature.worker';
export type NozzleComparisonResult = PrintableFeatureSimulation & {
    appearance: NozzleAppearance;
    patch?: Omit<RegionPatch, 'data'>;
};
export interface NozzleComparisonResponse {
    result?: NozzleComparisonResult;
    patch?: RegionPatch;
    error?: string;
}
export type NozzleComparisonRequest = PrintableFeatureWorkerRequest & {
    patchEnabled?: boolean;
    patchOnly?: boolean;
};
self.onmessage = (event: MessageEvent<NozzleComparisonRequest>) => {
    const input = event.data;
    try {
        if (input.patchOnly || input.patchEnabled) assertNozzlePatchSize(input.width, input.height);
        let analysis = simulatePrintableFeatures(input);
        const patch =
            input.patchEnabled || input.patchOnly
                ? patchVulnerableRegions(input.width, input.height, input.data, analysis.changeMask)
                : undefined;
        if (input.patchOnly && patch) {
            self.postMessage({ patch }, { transfer: [patch.data.buffer] });
            return;
        }
        if (patch) analysis = simulatePrintableFeatures({ ...input, data: patch.data });
        const result: NozzleComparisonResult = {
            ...analysis,
            appearance: estimateNozzleAppearance(
                input.width,
                input.height,
                patch?.data ?? input.data,
                input.pixelSizeMm,
                input.lineWidthMm
            ),
            patch: patch && {
                changedPixelCount: patch.changedPixelCount,
                patchedRegionCount: patch.patchedRegionCount,
                unresolvedPixelCount: patch.unresolvedPixelCount,
            },
        };
        self.postMessage(
            { result },
            {
                transfer: [
                    result.data.buffer,
                    result.changeMask.buffer,
                    result.appearance.data.buffer,
                ],
            }
        );
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
};
