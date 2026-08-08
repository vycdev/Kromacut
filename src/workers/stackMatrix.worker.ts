import type { Filament } from '../types';
import type { StackMatrixCalibrationV1 } from '../lib/appearanceProfile';
import {
    buildStackMatrixCalibration,
    markStackMatrixExported,
    type StackMatrixBuildOptions,
} from '../lib/stackMatrixCalibration';
import { generateStackMatrix3mf } from '../lib/stackMatrixExport';

export interface StackMatrixWorkerCreateRequest {
    id: number;
    type: 'create';
    filaments: Filament[];
    options: StackMatrixBuildOptions;
}

export interface StackMatrixWorkerExportRequest {
    id: number;
    type: 'export';
    record: StackMatrixCalibrationV1;
}

export type StackMatrixWorkerRequest =
    | StackMatrixWorkerCreateRequest
    | StackMatrixWorkerExportRequest;

export type StackMatrixWorkerJob =
    | Omit<StackMatrixWorkerCreateRequest, 'id'>
    | Omit<StackMatrixWorkerExportRequest, 'id'>;

export interface StackMatrixWorkerPhaseResponse {
    id: number;
    type: 'phase';
    phase: 'planning' | 'exporting';
}

export interface StackMatrixWorkerCompleteResponse {
    id: number;
    type: 'complete';
    record: StackMatrixCalibrationV1;
    blob: Blob;
}

export interface StackMatrixWorkerErrorResponse {
    id: number;
    type: 'error';
    error: string;
}

export type StackMatrixWorkerResponse =
    | StackMatrixWorkerPhaseResponse
    | StackMatrixWorkerCompleteResponse
    | StackMatrixWorkerErrorResponse;

self.onmessage = async (event: MessageEvent<StackMatrixWorkerRequest>) => {
    const request = event.data;
    try {
        let record: StackMatrixCalibrationV1;
        if (request.type === 'create') {
            self.postMessage({
                id: request.id,
                type: 'phase',
                phase: 'planning',
            } satisfies StackMatrixWorkerPhaseResponse);
            record = buildStackMatrixCalibration(request.filaments, request.options);
        } else {
            record = request.record;
        }

        self.postMessage({
            id: request.id,
            type: 'phase',
            phase: 'exporting',
        } satisfies StackMatrixWorkerPhaseResponse);
        const blob = await generateStackMatrix3mf(record);
        const exported = markStackMatrixExported(record);
        self.postMessage({
            id: request.id,
            type: 'complete',
            record: exported,
            blob,
        } satisfies StackMatrixWorkerCompleteResponse);
    } catch (caught) {
        self.postMessage({
            id: request.id,
            type: 'error',
            error: caught instanceof Error ? caught.message : String(caught),
        } satisfies StackMatrixWorkerErrorResponse);
    }
};
