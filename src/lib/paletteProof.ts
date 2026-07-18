import type {
    CanonicalSrgbColor,
    FinalPrintableStackSnapshot,
    FinalStackTargetMappingSnapshot,
    TargetSampleContext,
} from '../types/appearance';
import { CALIBRATION_CORNER_RADIUS_MM } from './calibrationGeometry';
import { deltaE2000Lab, type Lab } from './autoPaint';
import { fingerprintJson } from './fingerprint';

export const PALETTE_PROOF_PATCH_SIZE_MM = 8;
export const PALETTE_PROOF_GAP_MM = 1;
export const PALETTE_PROOF_TOUCHING_GAP_MM = 0;
export const PALETTE_PROOF_MARGIN_MM = 2;
export const PALETTE_PROOF_NOTCH_SIZE_MM = 2;
export const PALETTE_PROOF_CORNER_RADIUS_MM = CALIBRATION_CORNER_RADIUS_MM;
export const PALETTE_PROOF_DEFAULT_TARGETS = 8;
export const PALETTE_PROOF_MAX_TARGETS = 10;
export const PALETTE_PROOF_MIN_CANDIDATES = 2;
export const PALETTE_PROOF_MAX_CANDIDATES = 5;
export const PALETTE_PROOF_REINFORCEMENT_LAYERS = 2;
export const PALETTE_PROOF_REINFORCEMENT_CLEARANCE_MM = 0.15;

export type PaletteProofGapMm = 0 | 1;

export type PaletteProofCandidateRole =
    | 'incumbent'
    | 'previous-best'
    | 'lower-neighbor'
    | 'upper-neighbor'
    | 'unseen-neighbor'
    | 'unseen-alternative'
    | 'base-alternative'
    | 'spread'
    | 'uncertain'
    | 'discriminator'
    | 'fallback';

export interface PaletteProofPrefix {
    id: string;
    index: number;
    height: number;
    canonicalStackKey: string;
    predictedColor: CanonicalSrgbColor;
    predictedLab: readonly [number, number, number];
}

export interface PaletteProofCandidate {
    prefix: PaletteProofPrefix;
    role: PaletteProofCandidateRole;
    replacesRole?: 'lower-neighbor' | 'upper-neighbor';
}

export interface PaletteProofEvidenceScores {
    version: string;
    uncertaintyByStackKey: Readonly<Record<string, number>>;
    discriminatorByStackKey: Readonly<Record<string, number>>;
}

export interface PaletteProofCandidateHistory {
    testedStackKeys: ReadonlySet<string>;
    anchorStackKey?: string;
}

export interface PaletteProofSelectionHistory {
    targetPriorityById: ReadonlyMap<string, number>;
    candidateHistoryByTargetId: ReadonlyMap<string, PaletteProofCandidateHistory>;
}

export interface PaletteProofCell {
    id: string;
    row: number;
    column: number;
    targetMappingId: string;
    candidateRole: PaletteProofCandidateRole;
    replacesRole?: 'lower-neighbor' | 'upper-neighbor';
    physicalPatchId: string;
    canonicalStackKey: string;
    prefixIndex: number;
}

export interface PaletteProofColumn {
    id: string;
    column: number;
    targetMappingId: string;
    targetColor: CanonicalSrgbColor;
    targetLab: readonly [number, number, number];
    usageWeight: number;
    sampleContext: TargetSampleContext;
    cellIds: readonly string[];
}

export interface PaletteProofPhysicalPatch {
    id: string;
    canonicalStackKey: string;
    prefixIndex: number;
    placement:
        | { kind: 'matrix-cell'; row: number; column: number }
        | { kind: 'foundation-reference'; edge: 'bottom' };
}

export interface PaletteProofSpec {
    schemaVersion: 1;
    id: string;
    snapshotFingerprint: string;
    comparisonEnabled: boolean;
    layout: {
        kind: 'target-column-matrix';
        matrixOrientation?: 'target-columns' | 'target-rows';
        patchSizeMm: 8;
        gapMm: PaletteProofGapMm;
        marginMm: 2;
        notchSizeMm: 2;
        cornerRadiusMm: 1.2;
        rowCount: number;
        columnCount: number;
        widthMm: number;
        heightMm: number;
        reinforcementLayers?: number;
        reinforcementClearanceMm?: number;
        foundationPrefixKey: string | null;
        orientationMarker: 'top-left-notch';
    };
    targetPalette: readonly CanonicalSrgbColor[];
    columns: readonly PaletteProofColumn[];
    cells: readonly PaletteProofCell[];
    physicalPatches: readonly PaletteProofPhysicalPatch[];
}

function asLab(value: readonly [number, number, number]): Lab {
    return { L: value[0], a: value[1], b: value[2] };
}

function compareNumberDescending(left: number, right: number): number {
    if (left === right) return 0;
    return right - left;
}

function targetDistance(
    target: FinalStackTargetMappingSnapshot,
    prefix: PaletteProofPrefix
): number {
    return deltaE2000Lab(asLab(target.targetLab), asLab(prefix.predictedLab));
}

export function calculatePaletteProofFootprint(
    targetCount: number,
    candidateCount: number,
    matrixOrientation: 'target-columns' | 'target-rows' = 'target-rows',
    gapMm: PaletteProofGapMm = PALETTE_PROOF_GAP_MM
): { widthMm: number; heightMm: number } {
    if (targetCount <= 0 || candidateCount <= 0) return { widthMm: 0, heightMm: 0 };

    const horizontalCount = matrixOrientation === 'target-rows' ? candidateCount : targetCount;
    const verticalCount = matrixOrientation === 'target-rows' ? targetCount : candidateCount;

    return {
        widthMm:
            horizontalCount * PALETTE_PROOF_PATCH_SIZE_MM +
            (horizontalCount - 1) * gapMm +
            2 * PALETTE_PROOF_MARGIN_MM,
        heightMm:
            verticalCount * PALETTE_PROOF_PATCH_SIZE_MM +
            (verticalCount - 1) * gapMm +
            2 * PALETTE_PROOF_MARGIN_MM,
    };
}

export function enumerateFinalStackPrefixes(
    snapshot: FinalPrintableStackSnapshot
): PaletteProofPrefix[] {
    if (snapshot.layers.length !== snapshot.palette.length) {
        throw new Error('Final stack layer and palette counts do not match');
    }

    const seenKeys = new Set<string>();
    return snapshot.palette.map((entry, index) => {
        const layer = snapshot.layers[index];
        if (
            entry.index !== index ||
            layer.index !== index ||
            entry.layerId !== layer.id ||
            entry.canonicalStackKey !== layer.canonicalStackKey
        ) {
            throw new Error(`Final stack prefix ${index} is structurally inconsistent`);
        }
        if (seenKeys.has(entry.canonicalStackKey)) {
            throw new Error(`Final stack prefix ${index} duplicates a canonical stack key`);
        }
        seenKeys.add(entry.canonicalStackKey);

        return {
            id: entry.id,
            index,
            height: entry.height,
            canonicalStackKey: entry.canonicalStackKey,
            predictedColor: entry.predictedColor,
            predictedLab: entry.predictedLab,
        };
    });
}

export function selectPaletteProofTargets(
    snapshot: FinalPrintableStackSnapshot,
    requestedCount: number = PALETTE_PROOF_DEFAULT_TARGETS,
    targetPriorityById?: ReadonlyMap<string, number>
): FinalStackTargetMappingSnapshot[] {
    const limit = Math.min(
        PALETTE_PROOF_MAX_TARGETS,
        Math.max(0, Math.floor(requestedCount)),
        snapshot.targetMappings.length
    );
    if (limit === 0) return [];

    const remaining = [...snapshot.targetMappings].sort(
        (left, right) =>
            (targetPriorityById?.get(left.id) ?? 0) -
                (targetPriorityById?.get(right.id) ?? 0) ||
            compareNumberDescending(left.usageWeight, right.usageWeight) ||
            left.id.localeCompare(right.id)
    );
    const coverageCount = Math.min(Math.ceil(limit / 2), remaining.length);
    const selected = remaining.splice(0, coverageCount);

    while (selected.length < limit && remaining.length > 0) {
        const bestPriority = Math.min(
            ...remaining.map((target) => targetPriorityById?.get(target.id) ?? 0)
        );
        let bestIndex = remaining.findIndex(
            (target) => (targetPriorityById?.get(target.id) ?? 0) === bestPriority
        );
        let bestDistance = -Infinity;

        for (let index = 0; index < remaining.length; index++) {
            const candidate = remaining[index];
            if ((targetPriorityById?.get(candidate.id) ?? 0) !== bestPriority) continue;
            const minimumDistance = Math.min(
                ...selected.map((chosen) =>
                    deltaE2000Lab(asLab(candidate.targetLab), asLab(chosen.targetLab))
                )
            );
            const best = remaining[bestIndex];
            if (
                minimumDistance > bestDistance ||
                (minimumDistance === bestDistance &&
                    (candidate.usageWeight > best.usageWeight ||
                        (candidate.usageWeight === best.usageWeight &&
                            candidate.id.localeCompare(best.id) < 0)))
            ) {
                bestIndex = index;
                bestDistance = minimumDistance;
            }
        }

        selected.push(remaining.splice(bestIndex, 1)[0]);
    }

    return selected;
}

function closestUnusedPrefix(
    target: FinalStackTargetMappingSnapshot,
    prefixes: PaletteProofPrefix[],
    used: Set<string>
): PaletteProofPrefix | undefined {
    return prefixes
        .filter((prefix) => !used.has(prefix.canonicalStackKey))
        .sort(
            (left, right) =>
                targetDistance(target, left) - targetDistance(target, right) ||
                left.index - right.index
        )[0];
}

function highestScoredUnusedPrefix(
    prefixes: PaletteProofPrefix[],
    used: Set<string>,
    scores: Readonly<Record<string, number>>
): PaletteProofPrefix | undefined {
    return prefixes
        .filter(
            (prefix) =>
                !used.has(prefix.canonicalStackKey) &&
                Number.isFinite(scores[prefix.canonicalStackKey])
        )
        .sort(
            (left, right) =>
                compareNumberDescending(
                    scores[left.canonicalStackKey],
                    scores[right.canonicalStackKey]
                ) || left.index - right.index
        )[0];
}

function spreadUnusedPrefix(
    target: FinalStackTargetMappingSnapshot,
    prefixes: PaletteProofPrefix[],
    selected: PaletteProofCandidate[],
    used: Set<string>
): PaletteProofPrefix | undefined {
    const nearby = prefixes
        .filter((prefix) => !used.has(prefix.canonicalStackKey))
        .sort(
            (left, right) =>
                targetDistance(target, left) - targetDistance(target, right) ||
                left.index - right.index
        )
        .slice(0, 8);
    let best: PaletteProofPrefix | undefined;
    let bestSpread = -Infinity;

    for (const candidate of nearby) {
        const minimumSpread = Math.min(
            ...selected.map((chosen) =>
                deltaE2000Lab(asLab(candidate.predictedLab), asLab(chosen.prefix.predictedLab))
            )
        );
        if (
            minimumSpread > bestSpread ||
            (minimumSpread === bestSpread && (!best || candidate.index < best.index))
        ) {
            best = candidate;
            bestSpread = minimumSpread;
        }
    }

    return best;
}

export function selectPrefixCandidates(
    target: FinalStackTargetMappingSnapshot,
    prefixes: PaletteProofPrefix[],
    evidence?: PaletteProofEvidenceScores,
    requestedCount: number = PALETTE_PROOF_MAX_CANDIDATES,
    history?: PaletteProofCandidateHistory
): PaletteProofCandidate[] {
    if (prefixes.length === 0) return [];
    if (target.paletteIndex < 0 || target.paletteIndex >= prefixes.length) {
        throw new Error(`Target ${target.id} maps outside the final stack prefix range`);
    }
    const evidenceReady = Boolean(
        evidence?.version.trim() &&
        prefixes.some((prefix) =>
            Number.isFinite(evidence.uncertaintyByStackKey[prefix.canonicalStackKey])
        ) &&
        prefixes.some((prefix) =>
            Number.isFinite(evidence.discriminatorByStackKey[prefix.canonicalStackKey])
        )
    );

    const minimumCount = prefixes.length >= 2 ? PALETTE_PROOF_MIN_CANDIDATES : 1;
    const desiredCount = Math.min(
        PALETTE_PROOF_MAX_CANDIDATES,
        prefixes.length,
        Math.max(minimumCount, Math.floor(requestedCount))
    );
    const selected: PaletteProofCandidate[] = [];
    const used = new Set<string>();
    const missingNeighbors: Array<'lower-neighbor' | 'upper-neighbor'> = [];
    const add = (
        prefix: PaletteProofPrefix | undefined,
        role: PaletteProofCandidateRole,
        replacesRole?: 'lower-neighbor' | 'upper-neighbor'
    ) => {
        if (!prefix || used.has(prefix.canonicalStackKey) || selected.length >= desiredCount) {
            return;
        }
        used.add(prefix.canonicalStackKey);
        selected.push({ prefix, role, replacesRole });
    };

    if (history && history.testedStackKeys.size > 0) {
        const anchor =
            prefixes.find((prefix) => prefix.canonicalStackKey === history.anchorStackKey) ??
            prefixes[target.paletteIndex];
        add(anchor, 'previous-best');

        const unseen = prefixes.filter(
            (prefix) => !history.testedStackKeys.has(prefix.canonicalStackKey)
        );
        const adjacentUnseen = [
            [...unseen]
                .filter((prefix) => prefix.index < anchor.index)
                .sort((left, right) => right.index - left.index)[0],
            [...unseen]
                .filter((prefix) => prefix.index > anchor.index)
                .sort((left, right) => left.index - right.index)[0],
        ]
            .filter((prefix): prefix is PaletteProofPrefix => Boolean(prefix))
            .sort(
                (left, right) =>
                    targetDistance(target, left) - targetDistance(target, right) ||
                    left.index - right.index
            );
        for (const prefix of adjacentUnseen) add(prefix, 'unseen-neighbor');

        while (selected.length < desiredCount) {
            const prefix = closestUnusedPrefix(target, unseen, used);
            if (!prefix) break;
            add(prefix, 'unseen-alternative');
        }
        while (selected.length < desiredCount) {
            const prefix = closestUnusedPrefix(target, prefixes, used);
            if (!prefix) break;
            add(prefix, 'fallback');
        }

        return selected;
    }

    add(prefixes[target.paletteIndex], 'incumbent');
    if (target.paletteIndex > 0) add(prefixes[target.paletteIndex - 1], 'lower-neighbor');
    else missingNeighbors.push('lower-neighbor');
    if (target.paletteIndex + 1 < prefixes.length) {
        add(prefixes[target.paletteIndex + 1], 'upper-neighbor');
    } else {
        missingNeighbors.push('upper-neighbor');
    }

    if (evidence && evidenceReady) {
        add(highestScoredUnusedPrefix(prefixes, used, evidence.uncertaintyByStackKey), 'uncertain');
        add(
            highestScoredUnusedPrefix(prefixes, used, evidence.discriminatorByStackKey),
            'discriminator'
        );
    } else {
        add(closestUnusedPrefix(target, prefixes, used), 'base-alternative');
        add(spreadUnusedPrefix(target, prefixes, selected, used), 'spread');
    }

    while (selected.length < desiredCount) {
        const prefix = closestUnusedPrefix(target, prefixes, used);
        if (!prefix) break;
        add(prefix, 'fallback', missingNeighbors.shift());
    }

    return selected;
}

export function buildPaletteProofSpec(
    snapshot: FinalPrintableStackSnapshot,
    options: {
        targetCount?: number;
        candidateCount?: number;
        gapMm?: PaletteProofGapMm;
        evidence?: PaletteProofEvidenceScores;
        selectionHistory?: PaletteProofSelectionHistory;
    } = {}
): PaletteProofSpec {
    const prefixes = enumerateFinalStackPrefixes(snapshot);
    const targets = selectPaletteProofTargets(
        snapshot,
        options.targetCount ?? PALETTE_PROOF_DEFAULT_TARGETS,
        options.selectionHistory?.targetPriorityById
    );
    const minimumCandidateCount = prefixes.length >= 2 ? PALETTE_PROOF_MIN_CANDIDATES : 1;
    const rowCount = Math.min(
        PALETTE_PROOF_MAX_CANDIDATES,
        prefixes.length,
        Math.max(
            minimumCandidateCount,
            Math.floor(options.candidateCount ?? PALETTE_PROOF_MAX_CANDIDATES)
        )
    );
    const columnCount = targets.length;
    const gapMm: PaletteProofGapMm =
        options.gapMm === PALETTE_PROOF_TOUCHING_GAP_MM
            ? PALETTE_PROOF_TOUCHING_GAP_MM
            : PALETTE_PROOF_GAP_MM;
    const footprint = calculatePaletteProofFootprint(
        columnCount,
        rowCount,
        'target-rows',
        gapMm
    );
    const cells: PaletteProofCell[] = [];
    const columns: PaletteProofColumn[] = [];
    const physicalPatches: PaletteProofPhysicalPatch[] = [];
    let foundationReferenceAdded = false;

    for (let column = 0; column < targets.length; column++) {
        const target = targets[column];
        const selectedCandidates = selectPrefixCandidates(
            target,
            prefixes,
            options.evidence,
            rowCount,
            options.selectionHistory?.candidateHistoryByTargetId.get(target.id)
        );
        const candidates =
            gapMm === PALETTE_PROOF_TOUCHING_GAP_MM
                ? [...selectedCandidates].sort(
                      (left, right) => left.prefix.index - right.prefix.index
                  )
                : selectedCandidates;
        const cellIds: string[] = [];

        for (let row = 0; row < candidates.length; row++) {
            const candidate = candidates[row];
            const cellId = `${String.fromCharCode(65 + row)}${column + 1}`;
            const isFoundationReference = candidate.prefix.index === 0;
            const physicalPatchId = isFoundationReference
                ? 'foundation-reference'
                : `patch-${cellId}`;
            cellIds.push(cellId);
            cells.push({
                id: cellId,
                row,
                column,
                targetMappingId: target.id,
                candidateRole: candidate.role,
                replacesRole: candidate.replacesRole,
                physicalPatchId,
                canonicalStackKey: candidate.prefix.canonicalStackKey,
                prefixIndex: candidate.prefix.index,
            });

            if (isFoundationReference) {
                if (!foundationReferenceAdded) {
                    physicalPatches.push({
                        id: physicalPatchId,
                        canonicalStackKey: candidate.prefix.canonicalStackKey,
                        prefixIndex: candidate.prefix.index,
                        placement: { kind: 'foundation-reference', edge: 'bottom' },
                    });
                    foundationReferenceAdded = true;
                }
            } else {
                physicalPatches.push({
                    id: physicalPatchId,
                    canonicalStackKey: candidate.prefix.canonicalStackKey,
                    prefixIndex: candidate.prefix.index,
                    placement: { kind: 'matrix-cell', row, column },
                });
            }
        }

        columns.push({
            id: `column-${column + 1}`,
            column,
            targetMappingId: target.id,
            targetColor: target.targetColor,
            targetLab: target.targetLab,
            usageWeight: target.usageWeight,
            sampleContext: target.sampleContext,
            cellIds,
        });
    }

    const specWithoutId = {
        schemaVersion: 1 as const,
        snapshotFingerprint: snapshot.fingerprint,
        comparisonEnabled: prefixes.length >= 2 && columns.length > 0,
        layout: {
            kind: 'target-column-matrix' as const,
            matrixOrientation: 'target-rows' as const,
            patchSizeMm: PALETTE_PROOF_PATCH_SIZE_MM as 8,
            gapMm,
            marginMm: PALETTE_PROOF_MARGIN_MM as 2,
            notchSizeMm: PALETTE_PROOF_NOTCH_SIZE_MM as 2,
            cornerRadiusMm: PALETTE_PROOF_CORNER_RADIUS_MM as 1.2,
            rowCount,
            columnCount,
            ...footprint,
            reinforcementLayers:
                gapMm === PALETTE_PROOF_TOUCHING_GAP_MM
                    ? 0
                    : Math.min(
                          PALETTE_PROOF_REINFORCEMENT_LAYERS,
                          cells.reduce(
                              (maximum, cell) => Math.max(maximum, cell.prefixIndex),
                              0
                          )
                      ),
            reinforcementClearanceMm:
                gapMm !== PALETTE_PROOF_TOUCHING_GAP_MM &&
                cells.some((cell) => cell.prefixIndex > 0)
                    ? PALETTE_PROOF_REINFORCEMENT_CLEARANCE_MM
                    : 0,
            foundationPrefixKey: prefixes[0]?.canonicalStackKey ?? null,
            orientationMarker: 'top-left-notch' as const,
        },
        targetPalette: columns.map((column) => column.targetColor),
        columns,
        cells,
        physicalPatches,
    };

    return {
        ...specWithoutId,
        id: fingerprintJson('palette-proof-v1', specWithoutId),
    };
}

export function validatePaletteProofSpec(
    snapshot: FinalPrintableStackSnapshot,
    spec: PaletteProofSpec
): string[] {
    const errors: string[] = [];
    const prefixes = new Map(
        enumerateFinalStackPrefixes(snapshot).map((prefix) => [prefix.canonicalStackKey, prefix])
    );
    const patches = new Map(spec.physicalPatches.map((patch) => [patch.id, patch]));
    const expectedFootprint = calculatePaletteProofFootprint(
        spec.layout.columnCount,
        spec.layout.rowCount,
        spec.layout.matrixOrientation ?? 'target-columns',
        spec.layout.gapMm
    );

    if (spec.snapshotFingerprint !== snapshot.fingerprint) {
        errors.push('snapshot fingerprint does not match');
    }
    if (spec.layout.columnCount !== spec.columns.length) {
        errors.push('layout column count does not match columns');
    }
    if (spec.targetPalette.length !== spec.columns.length) {
        errors.push('target palette is not UI-aligned with columns');
    }
    if (
        spec.layout.widthMm !== expectedFootprint.widthMm ||
        spec.layout.heightMm !== expectedFootprint.heightMm
    ) {
        errors.push('layout footprint is inconsistent');
    }
    if (spec.layout.notchSizeMm !== PALETTE_PROOF_NOTCH_SIZE_MM) {
        errors.push('layout orientation notch is inconsistent');
    }
    if (spec.layout.cornerRadiusMm !== PALETTE_PROOF_CORNER_RADIUS_MM) {
        errors.push('layout corner radius is inconsistent');
    }
    if (
        spec.layout.gapMm !== PALETTE_PROOF_TOUCHING_GAP_MM &&
        spec.layout.gapMm !== PALETTE_PROOF_GAP_MM
    ) {
        errors.push('layout gap is inconsistent');
    }
    if (
        spec.layout.matrixOrientation !== undefined &&
        spec.layout.matrixOrientation !== 'target-columns' &&
        spec.layout.matrixOrientation !== 'target-rows'
    ) {
        errors.push('layout matrix orientation is inconsistent');
    }
    const reinforcementLayers = spec.layout.reinforcementLayers ?? 0;
    const reinforcementClearanceMm = spec.layout.reinforcementClearanceMm ?? 0;
    const maximumSelectedPrefixIndex = spec.cells.reduce(
        (maximum, cell) => Math.max(maximum, cell.prefixIndex),
        0
    );
    if (
        !Number.isInteger(reinforcementLayers) ||
        reinforcementLayers < 0 ||
        reinforcementLayers > PALETTE_PROOF_REINFORCEMENT_LAYERS ||
        reinforcementLayers > Math.max(0, snapshot.layers.length - 1) ||
        reinforcementLayers > maximumSelectedPrefixIndex
    ) {
        errors.push('layout reinforcement layer count is inconsistent');
    }
    if (
        (reinforcementLayers === 0 && reinforcementClearanceMm !== 0) ||
        (reinforcementLayers > 0 &&
            reinforcementClearanceMm !== PALETTE_PROOF_REINFORCEMENT_CLEARANCE_MM)
    ) {
        errors.push('layout reinforcement clearance is inconsistent');
    }
    if (spec.layout.foundationPrefixKey !== (snapshot.palette[0]?.canonicalStackKey ?? null)) {
        errors.push('foundation is not the first physical prefix');
    }

    for (const column of spec.columns) {
        const columnCells = spec.cells.filter((cell) => cell.column === column.column);
        const uniqueKeys = new Set(columnCells.map((cell) => cell.canonicalStackKey));
        if (columnCells.length !== spec.layout.rowCount) {
            errors.push(`column ${column.id} does not contain the resolved row count`);
        }
        if (uniqueKeys.size !== columnCells.length) {
            errors.push(`column ${column.id} contains duplicate prefixes`);
        }
        if (column.cellIds.join('|') !== columnCells.map((cell) => cell.id).join('|')) {
            errors.push(`column ${column.id} cell IDs are inconsistent`);
        }
    }

    for (const cell of spec.cells) {
        const prefix = prefixes.get(cell.canonicalStackKey);
        const patch = patches.get(cell.physicalPatchId);
        if (!prefix || prefix.index !== cell.prefixIndex) {
            errors.push(`cell ${cell.id} references a non-prefix stack`);
        }
        if (!patch || patch.canonicalStackKey !== cell.canonicalStackKey) {
            errors.push(`cell ${cell.id} has no matching physical patch`);
        }
    }

    return errors;
}
