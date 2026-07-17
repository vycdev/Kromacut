import type { Filament } from '../types';
import type {
    CanonicalSrgbColor,
    FinalPrintableStackSnapshot,
    TargetSampleContext,
} from '../types/appearance';
import { fingerprintJson } from './fingerprint.ts';
import type {
    PaletteProofCandidateRole,
    PaletteProofSpec,
} from './paletteProof';

export const APPEARANCE_PROFILE_SCHEMA_VERSION = 1;
export const APPEARANCE_RENDERER_VERSION = 'kromacut-palette-proof-v1';
export const MAX_STORED_PALETTE_PROOFS = 50;
export const MAX_STORED_VIEWING_SESSIONS = 100;
export const MAX_STORED_TARGET_JUDGMENTS = 1_000;

const MAX_STACK_LAYERS = 500;
const MAX_TEXT_LENGTH = 256;
// These constants are part of the persisted Palette Proof v1 contract. Keep
// them versioned here instead of resolving imports while sanitizing profile data.
const PALETTE_PROOF_PATCH_SIZE_MM = 8;
const PALETTE_PROOF_GAP_MM = 1;
const PALETTE_PROOF_MARGIN_MM = 2;
const PALETTE_PROOF_NOTCH_SIZE_MM = 2;
const PALETTE_PROOF_CORNER_RADIUS_MM = 1.2;
const PALETTE_PROOF_MAX_CANDIDATES = 5;
const PALETTE_PROOF_MAX_TARGETS = 10;
const UNKNOWN_PROCESS_FIELDS = [
    'slicerName',
    'slicerVersion',
    'printerProfile',
    'materialBatchIds',
    'nozzleWidth',
    'lineWidth',
    'nozzleTemperature',
    'flowRatio',
    'printSpeed',
    'coolingProfile',
    'surfaceSettings',
    'perimeterCount',
    'topSurfacePattern',
    'minimumLayerTime',
    'slicerToolpathFingerprint',
] as const;

export interface AppearanceStackLayer {
    filamentId: string;
    filamentColor: string;
    thickness: number;
}

export interface AppearanceProcessSnapshot {
    paintMode: 'autopaint';
    layerHeight: number;
    firstLayerHeight: number;
    transitionOpacity: number;
    modelFingerprint: string;
    filamentProfileFingerprint: string;
    unknownFields: string[];
}

export interface StoredPaletteProofPrefix {
    canonicalStackKey: string;
    prefixIndex: number;
    predictedColor: CanonicalSrgbColor;
}

export interface PaletteProofRecord {
    schemaVersion: 1;
    id: string;
    snapshotFingerprint: string;
    proof: PaletteProofSpec;
    stack: AppearanceStackLayer[];
    prefixes: StoredPaletteProofPrefix[];
    process: AppearanceProcessSnapshot;
    createdAt: string;
    exportedAt: string;
}

export interface AppearanceViewingSession {
    id: string;
    proofId: string;
    reuseScope: 'session-only';
    status: 'draft' | 'complete';
    colorContract: {
        space: 'srgb';
        encoding: 'uint8';
        whitePoint: 'D65';
        rendererVersion: typeof APPEARANCE_RENDERER_VERSION;
    };
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
}

export interface PaletteTargetJudgment {
    id: string;
    proofId: string;
    column: number;
    targetColor: CanonicalSrgbColor;
    candidateCellIds: string[];
    closestCellIds: string[];
    response: 'closest' | 'none';
    viewingSessionId: string;
    createdAt: string;
    updatedAt: string;
}

export interface AppearanceProfileV1 {
    schemaVersion: 1;
    proofs: PaletteProofRecord[];
    viewingSessions: AppearanceViewingSession[];
    targetJudgments: PaletteTargetJudgment[];
}

export type PaletteTargetResponse =
    | { response: 'closest'; closestCellIds: string[] }
    | { response: 'none' };

export interface PaletteProofEvaluationState {
    session?: AppearanceViewingSession;
    judgments: PaletteTargetJudgment[];
    answeredColumns: number;
    totalColumns: number;
    complete: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, maximum = MAX_TEXT_LENGTH): string | null {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum
        ? value
        : null;
}

function finiteNumber(value: unknown, minimum: number, maximum: number): number | null {
    return typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= minimum &&
        value <= maximum
        ? value
        : null;
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
    const number = finiteNumber(value, minimum, maximum);
    return number !== null && Number.isInteger(number) ? number : null;
}

function isoTimestamp(value: unknown): string | null {
    const text = boundedString(value, 64);
    return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function dedupeLast<T>(values: T[], keyOf: (value: T) => string): T[] {
    const unique = new Map<string, T>();
    for (const value of values) {
        const key = keyOf(value);
        unique.delete(key);
        unique.set(key, value);
    }
    return [...unique.values()];
}

function sanitizeCanonicalColor(value: unknown): CanonicalSrgbColor | null {
    if (!isRecord(value) || !Array.isArray(value.rgb) || value.rgb.length !== 3) return null;
    const rgb = value.rgb.map((channel) => integer(channel, 0, 255));
    if (rgb.some((channel) => channel === null)) return null;
    const tuple = rgb as [number, number, number];
    const hex = `#${tuple.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
    if (
        value.space !== 'srgb' ||
        value.encoding !== 'uint8' ||
        value.whitePoint !== 'D65' ||
        value.hex !== hex
    ) {
        return null;
    }
    return {
        space: 'srgb',
        encoding: 'uint8',
        whitePoint: 'D65',
        rgb: tuple,
        hex,
    };
}

function sanitizeLab(value: unknown): readonly [number, number, number] | null {
    if (!Array.isArray(value) || value.length !== 3) return null;
    const lab = value.map((channel) => finiteNumber(channel, -256, 256));
    return lab.some((channel) => channel === null)
        ? null
        : (lab as [number, number, number]);
}

function sanitizeSampleContext(value: unknown): TargetSampleContext | null {
    if (!isRecord(value)) return null;
    if (!['flat-interior', 'edge-limited', 'mixed', 'unknown'].includes(String(value.geometryClass))) {
        return null;
    }
    const context: TargetSampleContext = {
        geometryClass: value.geometryClass as TargetSampleContext['geometryClass'],
    };
    for (const key of ['interiorRadiusMm', 'flatInteriorWeight', 'edgeLimitedWeight'] as const) {
        if (value[key] === undefined) continue;
        const maximum = key === 'interiorRadiusMm' ? 10_000 : 1;
        const number = finiteNumber(value[key], 0, maximum);
        if (number === null) return null;
        context[key] = number;
    }
    return context;
}

const CANDIDATE_ROLES: PaletteProofCandidateRole[] = [
    'incumbent',
    'lower-neighbor',
    'upper-neighbor',
    'base-alternative',
    'spread',
    'uncertain',
    'discriminator',
    'fallback',
];

function sanitizePaletteProofSpec(value: unknown): PaletteProofSpec | null {
    if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.layout)) return null;
    if (
        typeof value.comparisonEnabled !== 'boolean' ||
        !Array.isArray(value.targetPalette) ||
        !Array.isArray(value.columns) ||
        !Array.isArray(value.cells) ||
        !Array.isArray(value.physicalPatches) ||
        value.columns.length > PALETTE_PROOF_MAX_TARGETS ||
        value.cells.length > PALETTE_PROOF_MAX_TARGETS * PALETTE_PROOF_MAX_CANDIDATES ||
        value.physicalPatches.length >
            PALETTE_PROOF_MAX_TARGETS * PALETTE_PROOF_MAX_CANDIDATES
    ) {
        return null;
    }

    const id = boundedString(value.id, 128);
    const snapshotFingerprint = boundedString(value.snapshotFingerprint, 128);
    const rowCount = integer(value.layout.rowCount, 0, PALETTE_PROOF_MAX_CANDIDATES);
    const columnCount = integer(value.layout.columnCount, 0, PALETTE_PROOF_MAX_TARGETS);
    const widthMm = finiteNumber(value.layout.widthMm, 0, 1_000);
    const heightMm = finiteNumber(value.layout.heightMm, 0, 1_000);
    if (
        !id ||
        !snapshotFingerprint ||
        rowCount === null ||
        columnCount === null ||
        widthMm === null ||
        heightMm === null ||
        value.layout.kind !== 'target-column-matrix' ||
        value.layout.patchSizeMm !== PALETTE_PROOF_PATCH_SIZE_MM ||
        value.layout.gapMm !== PALETTE_PROOF_GAP_MM ||
        value.layout.marginMm !== PALETTE_PROOF_MARGIN_MM ||
        value.layout.notchSizeMm !== PALETTE_PROOF_NOTCH_SIZE_MM ||
        value.layout.cornerRadiusMm !== PALETTE_PROOF_CORNER_RADIUS_MM ||
        value.layout.orientationMarker !== 'top-left-notch' ||
        value.columns.length !== columnCount ||
        value.targetPalette.length !== columnCount
    ) {
        return null;
    }

    const foundationPrefixKey =
        value.layout.foundationPrefixKey === null
            ? null
            : boundedString(value.layout.foundationPrefixKey, 128);
    if (value.layout.foundationPrefixKey !== null && !foundationPrefixKey) return null;

    const targetPalette = value.targetPalette.map(sanitizeCanonicalColor);
    if (targetPalette.some((color) => color === null)) return null;

    const columns: PaletteProofSpec['columns'][number][] = [];
    for (const raw of value.columns) {
        if (!isRecord(raw) || !Array.isArray(raw.cellIds)) return null;
        const columnId = boundedString(raw.id, 64);
        const column = integer(raw.column, 0, PALETTE_PROOF_MAX_TARGETS - 1);
        const targetMappingId = boundedString(raw.targetMappingId, 128);
        const targetColor = sanitizeCanonicalColor(raw.targetColor);
        const targetLab = sanitizeLab(raw.targetLab);
        const usageWeight = finiteNumber(raw.usageWeight, 0, 1);
        const sampleContext = sanitizeSampleContext(raw.sampleContext);
        const cellIds = raw.cellIds.map((cellId) => boundedString(cellId, 16));
        if (
            !columnId ||
            column === null ||
            !targetMappingId ||
            !targetColor ||
            !targetLab ||
            usageWeight === null ||
            !sampleContext ||
            cellIds.length !== rowCount ||
            cellIds.some((cellId) => !cellId)
        ) {
            return null;
        }
        columns.push({
            id: columnId,
            column,
            targetMappingId,
            targetColor,
            targetLab,
            usageWeight,
            sampleContext,
            cellIds: cellIds as string[],
        });
    }

    const cells: PaletteProofSpec['cells'][number][] = [];
    for (const raw of value.cells) {
        if (!isRecord(raw)) return null;
        const cellId = boundedString(raw.id, 16);
        const row = integer(raw.row, 0, PALETTE_PROOF_MAX_CANDIDATES - 1);
        const column = integer(raw.column, 0, PALETTE_PROOF_MAX_TARGETS - 1);
        const targetMappingId = boundedString(raw.targetMappingId, 128);
        const physicalPatchId = boundedString(raw.physicalPatchId, 64);
        const canonicalStackKey = boundedString(raw.canonicalStackKey, 128);
        const prefixIndex = integer(raw.prefixIndex, 0, MAX_STACK_LAYERS - 1);
        if (
            !cellId ||
            row === null ||
            column === null ||
            !targetMappingId ||
            !physicalPatchId ||
            !canonicalStackKey ||
            prefixIndex === null ||
            !CANDIDATE_ROLES.includes(raw.candidateRole as PaletteProofCandidateRole)
        ) {
            return null;
        }
        const replacesRole =
            raw.replacesRole === 'lower-neighbor' || raw.replacesRole === 'upper-neighbor'
                ? raw.replacesRole
                : undefined;
        if (raw.replacesRole !== undefined && replacesRole === undefined) return null;
        cells.push({
            id: cellId,
            row,
            column,
            targetMappingId,
            candidateRole: raw.candidateRole as PaletteProofCandidateRole,
            replacesRole,
            physicalPatchId,
            canonicalStackKey,
            prefixIndex,
        });
    }

    const physicalPatches: PaletteProofSpec['physicalPatches'][number][] = [];
    for (const raw of value.physicalPatches) {
        if (!isRecord(raw) || !isRecord(raw.placement)) return null;
        const patchId = boundedString(raw.id, 64);
        const canonicalStackKey = boundedString(raw.canonicalStackKey, 128);
        const prefixIndex = integer(raw.prefixIndex, 0, MAX_STACK_LAYERS - 1);
        if (!patchId || !canonicalStackKey || prefixIndex === null) return null;
        let placement: PaletteProofSpec['physicalPatches'][number]['placement'];
        if (raw.placement.kind === 'foundation-reference' && raw.placement.edge === 'bottom') {
            placement = { kind: 'foundation-reference', edge: 'bottom' };
        } else if (raw.placement.kind === 'matrix-cell') {
            const row = integer(raw.placement.row, 0, PALETTE_PROOF_MAX_CANDIDATES - 1);
            const column = integer(raw.placement.column, 0, PALETTE_PROOF_MAX_TARGETS - 1);
            if (row === null || column === null) return null;
            placement = { kind: 'matrix-cell', row, column };
        } else {
            return null;
        }
        physicalPatches.push({ id: patchId, canonicalStackKey, prefixIndex, placement });
    }

    const spec: PaletteProofSpec = {
        schemaVersion: 1,
        id,
        snapshotFingerprint,
        comparisonEnabled: value.comparisonEnabled,
        layout: {
            kind: 'target-column-matrix',
            patchSizeMm: PALETTE_PROOF_PATCH_SIZE_MM,
            gapMm: PALETTE_PROOF_GAP_MM,
            marginMm: PALETTE_PROOF_MARGIN_MM,
            notchSizeMm: PALETTE_PROOF_NOTCH_SIZE_MM,
            cornerRadiusMm: PALETTE_PROOF_CORNER_RADIUS_MM,
            rowCount,
            columnCount,
            widthMm,
            heightMm,
            foundationPrefixKey,
            orientationMarker: 'top-left-notch',
        },
        targetPalette: targetPalette as CanonicalSrgbColor[],
        columns,
        cells,
        physicalPatches,
    };

    const cellIds = new Set(spec.cells.map((cell) => cell.id));
    const patchIds = new Set(spec.physicalPatches.map((patch) => patch.id));
    const patchesById = new Map(spec.physicalPatches.map((patch) => [patch.id, patch]));
    const expectedWidth =
        columnCount === 0
            ? 0
            : columnCount * PALETTE_PROOF_PATCH_SIZE_MM +
              (columnCount - 1) * PALETTE_PROOF_GAP_MM +
              2 * PALETTE_PROOF_MARGIN_MM;
    const expectedHeight =
        rowCount === 0
            ? 0
            : rowCount * PALETTE_PROOF_PATCH_SIZE_MM +
              (rowCount - 1) * PALETTE_PROOF_GAP_MM +
              2 * PALETTE_PROOF_MARGIN_MM;
    if (
        cellIds.size !== spec.cells.length ||
        patchIds.size !== spec.physicalPatches.length ||
        spec.cells.length !== rowCount * columnCount ||
        widthMm !== expectedWidth ||
        heightMm !== expectedHeight ||
        spec.comparisonEnabled !== (rowCount >= 2 && columnCount > 0) ||
        spec.columns.some(
            (column, index) =>
                column.column !== index ||
                column.targetColor.hex !== spec.targetPalette[index]?.hex ||
                column.cellIds.join('|') !==
                    spec.cells
                        .filter((cell) => cell.column === column.column)
                        .sort((left, right) => left.row - right.row)
                        .map((cell) => cell.id)
                        .join('|')
        ) ||
        spec.cells.some(
            (cell) => {
                const patch = patchesById.get(cell.physicalPatchId);
                return (
                    cell.column >= columnCount ||
                    cell.row >= rowCount ||
                    !patch ||
                    patch.canonicalStackKey !== cell.canonicalStackKey ||
                    patch.prefixIndex !== cell.prefixIndex
                );
            }
        )
    ) {
        return null;
    }
    return spec;
}

export function fingerprintAppearanceFilaments(filaments: readonly Filament[]): string {
    return fingerprintJson(
        'filament-profile-v1',
        filaments.map((filament) => ({
            id: filament.id,
            color: filament.color,
            td: filament.td,
            calibration: filament.calibration ?? null,
        }))
    );
}

export function createEmptyAppearanceProfile(): AppearanceProfileV1 {
    return {
        schemaVersion: APPEARANCE_PROFILE_SCHEMA_VERSION,
        proofs: [],
        viewingSessions: [],
        targetJudgments: [],
    };
}

export function buildPaletteProofRecord(
    filaments: readonly Filament[],
    snapshot: FinalPrintableStackSnapshot,
    proof: PaletteProofSpec,
    timestamp = new Date().toISOString()
): PaletteProofRecord {
    if (
        proof.snapshotFingerprint !== snapshot.fingerprint ||
        proof.layout.columnCount !== proof.columns.length ||
        proof.targetPalette.length !== proof.columns.length
    ) {
        throw new Error('Palette Proof does not match the final printable stack');
    }

    const seen = new Set<string>();
    const prefixes: StoredPaletteProofPrefix[] = [];
    for (const cell of [...proof.cells].sort((left, right) => left.prefixIndex - right.prefixIndex)) {
        if (seen.has(cell.canonicalStackKey)) continue;
        seen.add(cell.canonicalStackKey);
        const paletteEntry = snapshot.palette[cell.prefixIndex];
        if (!paletteEntry || paletteEntry.canonicalStackKey !== cell.canonicalStackKey) {
            throw new Error(`Palette Proof cell ${cell.id} does not resolve to its final stack prefix`);
        }
        prefixes.push({
            canonicalStackKey: cell.canonicalStackKey,
            prefixIndex: cell.prefixIndex,
            predictedColor: paletteEntry.predictedColor,
        });
    }
    if (prefixes.length === 0) throw new Error('Palette Proof has no physical prefix candidates');
    const maximumPrefixIndex = Math.max(...prefixes.map((prefix) => prefix.prefixIndex));

    return {
        schemaVersion: 1,
        id: proof.id,
        snapshotFingerprint: snapshot.fingerprint,
        proof,
        stack: snapshot.layers.slice(0, maximumPrefixIndex + 1).map((layer) => ({
            filamentId: layer.filamentId,
            filamentColor: layer.filamentColor,
            thickness: layer.thickness,
        })),
        prefixes,
        process: {
            paintMode: 'autopaint',
            layerHeight: snapshot.settings.layerHeight,
            firstLayerHeight: snapshot.settings.firstLayerHeight,
            transitionOpacity: snapshot.settings.transitionOpacity,
            modelFingerprint: snapshot.modelFingerprint,
            filamentProfileFingerprint: fingerprintAppearanceFilaments(filaments),
            unknownFields: [...UNKNOWN_PROCESS_FIELDS],
        },
        createdAt: timestamp,
        exportedAt: timestamp,
    };
}

export function upsertPaletteProofRecord(
    appearance: AppearanceProfileV1 | undefined,
    record: PaletteProofRecord
): AppearanceProfileV1 {
    const current = appearance ?? createEmptyAppearanceProfile();
    const previous = current.proofs.find((proof) => proof.id === record.id);
    const nextRecord = previous ? { ...record, createdAt: previous.createdAt } : record;
    const proofs = [
        ...current.proofs.filter((proof) => proof.id !== record.id),
        nextRecord,
    ].slice(-MAX_STORED_PALETTE_PROOFS);
    const proofIds = new Set(proofs.map((proof) => proof.id));
    const viewingSessions = current.viewingSessions.filter((session) =>
        proofIds.has(session.proofId)
    );
    const sessionIds = new Set(viewingSessions.map((session) => session.id));
    return {
        ...current,
        proofs,
        viewingSessions,
        targetJudgments: current.targetJudgments.filter((judgment) =>
            sessionIds.has(judgment.viewingSessionId)
        ),
    };
}

function createSessionId(proofId: string, timestamp: string): string {
    const random = globalThis.crypto?.randomUUID?.();
    return random ?? fingerprintJson('viewing-session-v1', { proofId, timestamp });
}

function findEvaluationSession(
    appearance: AppearanceProfileV1,
    proofId: string
): AppearanceViewingSession | undefined {
    return [...appearance.viewingSessions]
        .filter((session) => session.proofId === proofId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

export function getPaletteProofEvaluationState(
    appearance: AppearanceProfileV1 | undefined,
    proofId: string
): PaletteProofEvaluationState {
    const proof = appearance?.proofs.find((candidate) => candidate.id === proofId);
    const session = appearance ? findEvaluationSession(appearance, proofId) : undefined;
    const judgments = session
        ? appearance!.targetJudgments
              .filter((judgment) => judgment.viewingSessionId === session.id)
              .sort((left, right) => left.column - right.column)
        : [];
    const totalColumns = proof?.proof.columns.length ?? 0;
    return {
        session,
        judgments,
        answeredColumns: judgments.length,
        totalColumns,
        complete: session?.status === 'complete',
    };
}

export function setPaletteTargetResponse(
    appearance: AppearanceProfileV1 | undefined,
    proofId: string,
    columnIndex: number,
    response: PaletteTargetResponse | null,
    timestamp = new Date().toISOString()
): AppearanceProfileV1 {
    const current = appearance ?? createEmptyAppearanceProfile();
    const proof = current.proofs.find((candidate) => candidate.id === proofId);
    if (!proof) throw new Error('Palette Proof is not saved in the active profile');
    const column = proof.proof.columns.find((candidate) => candidate.column === columnIndex);
    if (!column) throw new Error(`Palette Proof column ${columnIndex + 1} does not exist`);

    let session = findEvaluationSession(current, proofId);
    if (session?.status === 'complete') {
        throw new Error('Reopen the completed evaluation before editing its results');
    }
    if (!session) {
        session = {
            id: createSessionId(proofId, timestamp),
            proofId,
            reuseScope: 'session-only',
            status: 'draft',
            colorContract: {
                space: 'srgb',
                encoding: 'uint8',
                whitePoint: 'D65',
                rendererVersion: APPEARANCE_RENDERER_VERSION,
            },
            createdAt: timestamp,
            updatedAt: timestamp,
        };
    }

    const existingJudgment = current.targetJudgments.find(
        (judgment) =>
            judgment.viewingSessionId === session!.id && judgment.column === columnIndex
    );
    const otherJudgments = current.targetJudgments.filter(
        (judgment) =>
            !(
                judgment.viewingSessionId === session!.id && judgment.column === columnIndex
            )
    );

    let nextJudgments = otherJudgments;
    if (response) {
        const requestedClosestIds =
            response.response === 'closest' ? new Set(response.closestCellIds) : undefined;
        const closestCellIds =
            response.response === 'closest'
                ? column.cellIds.filter((cellId) => requestedClosestIds!.has(cellId))
                : [];
        if (response.response === 'closest' && closestCellIds.length === 0) {
            throw new Error('Select at least one candidate or choose None');
        }
        const judgment: PaletteTargetJudgment = {
            id:
                existingJudgment?.id ??
                fingerprintJson('palette-target-judgment-v1', {
                    proofId,
                    viewingSessionId: session.id,
                    column: columnIndex,
                }),
            proofId,
            column: columnIndex,
            targetColor: column.targetColor,
            candidateCellIds: [...column.cellIds],
            closestCellIds,
            response: response.response,
            viewingSessionId: session.id,
            createdAt: existingJudgment?.createdAt ?? timestamp,
            updatedAt: timestamp,
        };
        nextJudgments = [...otherJudgments, judgment].slice(-MAX_STORED_TARGET_JUDGMENTS);
    }

    const nextSession = { ...session, updatedAt: timestamp };
    const viewingSessions = [
        ...current.viewingSessions.filter((candidate) => candidate.id !== session.id),
        nextSession,
    ].slice(-MAX_STORED_VIEWING_SESSIONS);
    const sessionIds = new Set(viewingSessions.map((candidate) => candidate.id));
    return {
        ...current,
        viewingSessions,
        targetJudgments: nextJudgments.filter((judgment) =>
            sessionIds.has(judgment.viewingSessionId)
        ),
    };
}

export function completePaletteProofEvaluation(
    appearance: AppearanceProfileV1,
    proofId: string,
    timestamp = new Date().toISOString()
): AppearanceProfileV1 {
    const state = getPaletteProofEvaluationState(appearance, proofId);
    if (!state.session) throw new Error('Record proof results before completing the evaluation');
    if (state.answeredColumns !== state.totalColumns || state.totalColumns === 0) {
        throw new Error('Answer every target column before completing the evaluation');
    }
    const completed: AppearanceViewingSession = {
        ...state.session,
        status: 'complete',
        updatedAt: timestamp,
        completedAt: timestamp,
    };
    return {
        ...appearance,
        viewingSessions: appearance.viewingSessions.map((session) =>
            session.id === completed.id ? completed : session
        ),
    };
}

export function reopenPaletteProofEvaluation(
    appearance: AppearanceProfileV1,
    proofId: string,
    timestamp = new Date().toISOString()
): AppearanceProfileV1 {
    const state = getPaletteProofEvaluationState(appearance, proofId);
    if (!state.session) throw new Error('Palette Proof has no evaluation to reopen');
    const reopened: AppearanceViewingSession = {
        ...state.session,
        status: 'draft',
        updatedAt: timestamp,
    };
    delete reopened.completedAt;
    return {
        ...appearance,
        viewingSessions: appearance.viewingSessions.map((session) =>
            session.id === reopened.id ? reopened : session
        ),
    };
}

function sanitizeStoredPrefix(value: unknown): StoredPaletteProofPrefix | null {
    if (!isRecord(value)) return null;
    const canonicalStackKey = boundedString(value.canonicalStackKey, 128);
    const prefixIndex = integer(value.prefixIndex, 0, MAX_STACK_LAYERS - 1);
    const predictedColor = sanitizeCanonicalColor(value.predictedColor);
    return canonicalStackKey && prefixIndex !== null && predictedColor
        ? { canonicalStackKey, prefixIndex, predictedColor }
        : null;
}

function sanitizeAppearanceStack(value: unknown): AppearanceStackLayer[] | null {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_STACK_LAYERS) return null;
    const stack: AppearanceStackLayer[] = [];
    for (const raw of value) {
        if (!isRecord(raw)) return null;
        const filamentId = boundedString(raw.filamentId, 128);
        const filamentColor = boundedString(raw.filamentColor, 16);
        const thickness = finiteNumber(raw.thickness, 0.0001, 100);
        if (!filamentId || !filamentColor || !/^#[0-9a-f]{6}$/i.test(filamentColor) || thickness === null) {
            return null;
        }
        stack.push({ filamentId, filamentColor, thickness });
    }
    return stack;
}

function sanitizePaletteProofRecord(value: unknown): PaletteProofRecord | null {
    if (
        !isRecord(value) ||
        value.schemaVersion !== 1 ||
        !Array.isArray(value.prefixes) ||
        value.prefixes.length === 0
    ) {
        return null;
    }
    const id = boundedString(value.id, 128);
    const snapshotFingerprint = boundedString(value.snapshotFingerprint, 128);
    const proof = sanitizePaletteProofSpec(value.proof);
    const createdAt = isoTimestamp(value.createdAt);
    const exportedAt = isoTimestamp(value.exportedAt);
    const stack = sanitizeAppearanceStack(value.stack);
    if (
        !id ||
        !snapshotFingerprint ||
        !proof ||
        !stack ||
        !createdAt ||
        !exportedAt ||
        id !== proof.id ||
        snapshotFingerprint !== proof.snapshotFingerprint ||
        value.prefixes.length > PALETTE_PROOF_MAX_TARGETS * PALETTE_PROOF_MAX_CANDIDATES ||
        !isRecord(value.process)
    ) {
        return null;
    }
    const prefixes = value.prefixes.map(sanitizeStoredPrefix);
    if (prefixes.some((prefix) => prefix === null)) return null;
    const layerHeight = finiteNumber(value.process.layerHeight, 0.001, 100);
    const firstLayerHeight = finiteNumber(value.process.firstLayerHeight, 0.001, 100);
    const transitionOpacity = finiteNumber(value.process.transitionOpacity, 0, 1);
    const modelFingerprint = boundedString(value.process.modelFingerprint, 128);
    const filamentProfileFingerprint = boundedString(
        value.process.filamentProfileFingerprint,
        128
    );
    if (
        value.process.paintMode !== 'autopaint' ||
        layerHeight === null ||
        firstLayerHeight === null ||
        transitionOpacity === null ||
        !modelFingerprint ||
        !filamentProfileFingerprint ||
        !Array.isArray(value.process.unknownFields) ||
        value.process.unknownFields.length > UNKNOWN_PROCESS_FIELDS.length
    ) {
        return null;
    }
    const unknownFields = value.process.unknownFields.map((field) => boundedString(field, 64));
    if (
        unknownFields.some(
            (field) =>
                !field ||
                !UNKNOWN_PROCESS_FIELDS.includes(
                    field as (typeof UNKNOWN_PROCESS_FIELDS)[number]
                )
        )
    ) {
        return null;
    }

    const prefixRecords = prefixes as StoredPaletteProofPrefix[];
    const keys = new Set(prefixRecords.map((prefix) => prefix.canonicalStackKey));
    if (
        keys.size !== prefixRecords.length ||
        prefixRecords.some((prefix) => prefix.prefixIndex >= stack.length) ||
        Math.max(...prefixRecords.map((prefix) => prefix.prefixIndex)) !== stack.length - 1 ||
        proof.cells.some((cell) => !keys.has(cell.canonicalStackKey))
    ) {
        return null;
    }
    return {
        schemaVersion: 1,
        id,
        snapshotFingerprint,
        proof,
        stack,
        prefixes: prefixRecords,
        process: {
            paintMode: 'autopaint',
            layerHeight,
            firstLayerHeight,
            transitionOpacity,
            modelFingerprint,
            filamentProfileFingerprint,
            unknownFields: unknownFields as string[],
        },
        createdAt,
        exportedAt,
    };
}

function sanitizeViewingSession(value: unknown): AppearanceViewingSession | null {
    if (!isRecord(value) || !isRecord(value.colorContract)) return null;
    const id = boundedString(value.id, 128);
    const proofId = boundedString(value.proofId, 128);
    const createdAt = isoTimestamp(value.createdAt);
    const updatedAt = isoTimestamp(value.updatedAt);
    const completedAt = value.completedAt === undefined ? undefined : isoTimestamp(value.completedAt);
    if (
        !id ||
        !proofId ||
        !createdAt ||
        !updatedAt ||
        (value.completedAt !== undefined && !completedAt) ||
        value.reuseScope !== 'session-only' ||
        (value.status !== 'draft' && value.status !== 'complete') ||
        value.colorContract.space !== 'srgb' ||
        value.colorContract.encoding !== 'uint8' ||
        value.colorContract.whitePoint !== 'D65' ||
        value.colorContract.rendererVersion !== APPEARANCE_RENDERER_VERSION
    ) {
        return null;
    }
    return {
        id,
        proofId,
        reuseScope: 'session-only',
        status: value.status,
        colorContract: {
            space: 'srgb',
            encoding: 'uint8',
            whitePoint: 'D65',
            rendererVersion: APPEARANCE_RENDERER_VERSION,
        },
        createdAt,
        updatedAt,
        completedAt: completedAt ?? undefined,
    };
}

function sanitizeTargetJudgment(value: unknown): PaletteTargetJudgment | null {
    if (!isRecord(value) || !Array.isArray(value.candidateCellIds) || !Array.isArray(value.closestCellIds)) {
        return null;
    }
    const id = boundedString(value.id, 128);
    const proofId = boundedString(value.proofId, 128);
    const viewingSessionId = boundedString(value.viewingSessionId, 128);
    const column = integer(value.column, 0, PALETTE_PROOF_MAX_TARGETS - 1);
    const targetColor = sanitizeCanonicalColor(value.targetColor);
    const createdAt = isoTimestamp(value.createdAt);
    const updatedAt = isoTimestamp(value.updatedAt);
    const candidateCellIds = value.candidateCellIds.map((cellId) => boundedString(cellId, 16));
    const closestCellIds = value.closestCellIds.map((cellId) => boundedString(cellId, 16));
    if (
        !id ||
        !proofId ||
        !viewingSessionId ||
        column === null ||
        !targetColor ||
        !createdAt ||
        !updatedAt ||
        (value.response !== 'closest' && value.response !== 'none') ||
        candidateCellIds.length === 0 ||
        candidateCellIds.length > PALETTE_PROOF_MAX_CANDIDATES ||
        candidateCellIds.some((cellId) => !cellId) ||
        closestCellIds.some((cellId) => !cellId) ||
        (value.response === 'closest' && closestCellIds.length === 0) ||
        (value.response === 'none' && closestCellIds.length !== 0) ||
        closestCellIds.some((cellId) => !candidateCellIds.includes(cellId))
    ) {
        return null;
    }
    return {
        id,
        proofId,
        column,
        targetColor,
        candidateCellIds: candidateCellIds as string[],
        closestCellIds: closestCellIds as string[],
        response: value.response,
        viewingSessionId,
        createdAt,
        updatedAt,
    };
}

export function sanitizeAppearanceProfile(value: unknown): AppearanceProfileV1 | undefined {
    if (
        !isRecord(value) ||
        value.schemaVersion !== APPEARANCE_PROFILE_SCHEMA_VERSION ||
        !Array.isArray(value.proofs) ||
        !Array.isArray(value.viewingSessions) ||
        !Array.isArray(value.targetJudgments)
    ) {
        return undefined;
    }
    const proofs = dedupeLast(
        value.proofs
            .slice(-MAX_STORED_PALETTE_PROOFS)
            .map(sanitizePaletteProofRecord)
            .filter((proof): proof is PaletteProofRecord => proof !== null),
        (proof) => proof.id
    );
    const proofIds = new Set(proofs.map((proof) => proof.id));
    const viewingSessions = dedupeLast(
        value.viewingSessions
            .slice(-MAX_STORED_VIEWING_SESSIONS)
            .map(sanitizeViewingSession)
            .filter(
                (session): session is AppearanceViewingSession =>
                    session !== null && proofIds.has(session.proofId)
            ),
        (session) => session.id
    );
    const sessionsById = new Map(viewingSessions.map((session) => [session.id, session]));
    const proofsById = new Map(proofs.map((proof) => [proof.id, proof]));
    const targetJudgments = dedupeLast(
        value.targetJudgments
            .slice(-MAX_STORED_TARGET_JUDGMENTS)
            .map(sanitizeTargetJudgment)
            .filter((judgment): judgment is PaletteTargetJudgment => {
                if (!judgment) return false;
                const session = sessionsById.get(judgment.viewingSessionId);
                const proof = proofsById.get(judgment.proofId);
                const column = proof?.proof.columns.find(
                    (candidate) => candidate.column === judgment.column
                );
                return Boolean(
                    session &&
                        session.proofId === judgment.proofId &&
                        column &&
                        judgment.candidateCellIds.join('|') === column.cellIds.join('|') &&
                        judgment.targetColor.hex === column.targetColor.hex
                );
            }),
        (judgment) => `${judgment.viewingSessionId}:${judgment.column}`
    );
    const judgmentCounts = new Map<string, number>();
    for (const judgment of targetJudgments) {
        judgmentCounts.set(
            judgment.viewingSessionId,
            (judgmentCounts.get(judgment.viewingSessionId) ?? 0) + 1
        );
    }
    const normalizedViewingSessions = viewingSessions.map((session) => {
        const expected = proofsById.get(session.proofId)?.proof.columns.length ?? 0;
        if (
            session.status !== 'complete' ||
            (judgmentCounts.get(session.id) ?? 0) === expected
        ) {
            return session;
        }
        const draft: AppearanceViewingSession = { ...session, status: 'draft' };
        delete draft.completedAt;
        return draft;
    });
    return {
        schemaVersion: 1,
        proofs,
        viewingSessions: normalizedViewingSessions,
        targetJudgments,
    };
}
