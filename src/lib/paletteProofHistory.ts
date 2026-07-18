import type { FinalPrintableStackSnapshot } from '../types/appearance';
import {
    getPaletteProofEvaluationState,
    type AppearanceProfileV1,
    type PaletteProofRecord,
} from './appearanceProfile';
import type { PaletteProofCandidateHistory, PaletteProofSelectionHistory } from './paletteProof';

export interface PaletteProofHistorySummary {
    proofIds: readonly string[];
    selectionHistory: PaletteProofSelectionHistory;
    hasUnseenEvidence: boolean;
}

function completedRecords(
    appearance: AppearanceProfileV1 | undefined,
    snapshot: FinalPrintableStackSnapshot,
    allowedProofIds?: ReadonlySet<string>,
    filamentProfileFingerprint?: string
): PaletteProofRecord[] {
    if (!appearance) return [];
    return appearance.proofs
        .filter((record) => {
            if (
                filamentProfileFingerprint &&
                record.process.filamentProfileFingerprint !== filamentProfileFingerprint
            ) {
                return false;
            }
            const compatibleProcess =
                record.process.layerHeight === snapshot.settings.layerHeight &&
                record.process.firstLayerHeight === snapshot.settings.firstLayerHeight &&
                record.process.transitionOpacity === snapshot.settings.transitionOpacity;
            if (record.snapshotFingerprint !== snapshot.fingerprint && !compatibleProcess) {
                return false;
            }
            if (allowedProofIds && !allowedProofIds.has(record.id)) return false;
            return getPaletteProofEvaluationState(appearance, record.id).complete;
        })
        .sort(
            (left, right) =>
                left.exportedAt.localeCompare(right.exportedAt) || left.id.localeCompare(right.id)
        );
}

export function buildPaletteProofHistory(
    appearance: AppearanceProfileV1 | undefined,
    snapshot: FinalPrintableStackSnapshot,
    proofIds?: readonly string[],
    filamentProfileFingerprint?: string,
    deprioritizedTargetIds?: ReadonlySet<string>
): PaletteProofHistorySummary {
    const records = completedRecords(
        appearance,
        snapshot,
        proofIds ? new Set(proofIds) : undefined,
        filamentProfileFingerprint
    );
    const targetVisitCountById = new Map<string, number>();
    const testedByTarget = new Map<string, Set<string>>();
    const anchorByTarget = new Map<string, string>();

    for (const record of records) {
        const evaluation = getPaletteProofEvaluationState(appearance, record.id);
        const judgmentsByColumn = new Map(
            evaluation.judgments.map((judgment) => [judgment.column, judgment])
        );
        const cellsById = new Map(record.proof.cells.map((cell) => [cell.id, cell]));

        for (const column of record.proof.columns) {
            targetVisitCountById.set(
                column.targetMappingId,
                (targetVisitCountById.get(column.targetMappingId) ?? 0) + 1
            );
            const tested = testedByTarget.get(column.targetMappingId) ?? new Set<string>();
            for (const cellId of column.cellIds) {
                const cell = cellsById.get(cellId);
                if (cell) tested.add(cell.canonicalStackKey);
            }
            testedByTarget.set(column.targetMappingId, tested);

            const judgment = judgmentsByColumn.get(column.column);
            if (judgment?.response !== 'closest') continue;
            const anchorCellId = column.cellIds.find((cellId) =>
                judgment.closestCellIds.includes(cellId)
            );
            const anchorCell = anchorCellId ? cellsById.get(anchorCellId) : undefined;
            if (anchorCell) {
                anchorByTarget.set(column.targetMappingId, anchorCell.canonicalStackKey);
            }
        }
    }

    const targetPriorityById = new Map<string, number>();
    const candidateHistoryByTargetId = new Map<string, PaletteProofCandidateHistory>();
    const maximumVisitCount = Math.max(0, ...targetVisitCountById.values());
    for (const target of snapshot.targetMappings) {
        const testedStackKeys = testedByTarget.get(target.id);
        const hasUnseenCandidates = (testedStackKeys?.size ?? 0) < snapshot.palette.length;
        const visitCount = targetVisitCountById.get(target.id) ?? 0;
        const priority = !hasUnseenCandidates
            ? Number.POSITIVE_INFINITY
            : visitCount + (deprioritizedTargetIds?.has(target.id) ? maximumVisitCount + 1 : 0);
        targetPriorityById.set(target.id, priority);
        if (testedStackKeys && testedStackKeys.size > 0) {
            candidateHistoryByTargetId.set(target.id, {
                testedStackKeys,
                anchorStackKey: anchorByTarget.get(target.id) ?? target.canonicalStackKey,
            });
        }
    }

    return {
        proofIds: records.map((record) => record.id),
        selectionHistory: { targetPriorityById, candidateHistoryByTargetId },
        hasUnseenEvidence:
            snapshot.palette.length >= 2 &&
            snapshot.targetMappings.some(
                (target) => (testedByTarget.get(target.id)?.size ?? 0) < snapshot.palette.length
            ),
    };
}
