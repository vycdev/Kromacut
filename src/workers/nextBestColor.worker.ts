/**
 * Web Worker for next-best-color suggestions.
 *
 * The scoring loop can get expensive with large image palettes and filament
 * inventories, so keep it off the UI thread.
 */

import { nextBestColor } from '../lib/nextBestColor';
import type { NextBestColorResult } from '../lib/nextBestColor';
import type { Filament } from '../types';

export interface NextBestColorWorkerRequest {
    id: number;
    filaments: Filament[];
    imageSwatches: Array<{ hex: string; count?: number }>;
}

export interface NextBestColorWorkerResponse {
    id: number;
    result?: NextBestColorResult;
    error?: string;
}

self.onmessage = (e: MessageEvent<NextBestColorWorkerRequest>) => {
    const req = e.data;

    try {
        const result = nextBestColor(req.filaments, req.imageSwatches);
        const response: NextBestColorWorkerResponse = { id: req.id, result };
        self.postMessage(response);
    } catch (err) {
        const response: NextBestColorWorkerResponse = {
            id: req.id,
            error: err instanceof Error ? err.message : String(err),
        };
        self.postMessage(response);
    }
};
