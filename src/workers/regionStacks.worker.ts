/**
 * Web Worker for per-region stack planning.
 *
 * Offloads `planRegionStacks` so large palettes don't block the UI while
 * every target color searches its own stack.
 */

import { planRegionStacks, type RegionStackPlanOptions } from '../lib/regionStacks';
import type { RegionStackPlan } from '../types';

export interface RegionStacksWorkerRequest extends RegionStackPlanOptions {
    id: number;
}

export interface RegionStacksWorkerResponse {
    id: number;
    result?: RegionStackPlan | null;
    error?: string;
}

self.onmessage = (e: MessageEvent<RegionStacksWorkerRequest>) => {
    const { id, ...options } = e.data;
    try {
        const response: RegionStacksWorkerResponse = { id, result: planRegionStacks(options) };
        self.postMessage(response);
    } catch (err) {
        const response: RegionStacksWorkerResponse = {
            id,
            error: err instanceof Error ? err.message : String(err),
        };
        self.postMessage(response);
    }
};
