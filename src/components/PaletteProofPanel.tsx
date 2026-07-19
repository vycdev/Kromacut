import { useEffect, useMemo, useState } from 'react';
import { Check, Download, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { saveBlobToFile } from '../hooks/saveBlobToFile';
import {
    fingerprintAppearanceFilaments,
    getPaletteProofEvaluationState,
    type PaletteProofRecord,
    type PaletteTargetResponse,
} from '../lib/appearanceProfile';
import {
    buildPaletteProofSpec,
    PALETTE_PROOF_DEFAULT_TARGETS,
    PALETTE_PROOF_MAX_CANDIDATES,
    PALETTE_PROOF_MAX_TARGETS,
    PALETTE_PROOF_MIN_CANDIDATES,
    type PaletteProofSpec,
} from '../lib/paletteProof';
import { exportPaletteProof3MF } from '../lib/paletteProofExport';
import { groupPaletteProofRecords, paletteProofTargetSetKey } from '../lib/paletteProofGroups';
import { buildPaletteProofHistory } from '../lib/paletteProofHistory';
import type { AutoPaintProfile } from '../lib/profileManager';
import type { FinalPrintableStackSnapshot } from '../types/appearance';

interface PaletteProofPanelProps {
    snapshot?: FinalPrintableStackSnapshot;
    profile?: AutoPaintProfile;
    profileDirty?: boolean;
    embedded?: boolean;
    showTitle?: boolean;
    onRegisterProof?: (
        snapshot: FinalPrintableStackSnapshot,
        proof: PaletteProofSpec
    ) => PaletteProofRecord;
    onSetTargetResponse?: (
        proofId: string,
        column: number,
        response: PaletteTargetResponse | null
    ) => void;
    onCompleteEvaluation?: (proofId: string) => void;
    onReopenEvaluation?: (proofId: string) => void;
    onDeleteProof?: (proofId: string) => void;
}

type PanelView = 'proof' | 'results';
type ProofGeneration =
    | { mode: 'initial' }
    | {
          mode: 'continue';
          sourceProofId: string;
          targetMappingIds: readonly string[];
      }
    | {
          mode: 'new-targets';
          sourceProofId: string;
          deprioritizedTargetIds: readonly string[];
      };

function swatchTextColor(rgb: readonly [number, number, number]): string {
    const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return luminance > 0.55 ? '#111111' : '#ffffff';
}

function proofTimestamp(record: PaletteProofRecord): string {
    return new Date(record.exportedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export default function PaletteProofPanel({
    snapshot,
    profile,
    profileDirty = false,
    embedded = false,
    showTitle = true,
    onRegisterProof,
    onSetTargetResponse,
    onCompleteEvaluation,
    onReopenEvaluation,
    onDeleteProof,
}: PaletteProofPanelProps) {
    const [requestedTargetCount, setRequestedTargetCount] = useState(PALETTE_PROOF_DEFAULT_TARGETS);
    const [requestedCandidateCount, setRequestedCandidateCount] = useState(
        PALETTE_PROOF_MAX_CANDIDATES
    );
    const [proofGeneration, setProofGeneration] = useState<ProofGeneration>({ mode: 'initial' });
    const maximumTargetCount = Math.min(
        PALETTE_PROOF_MAX_TARGETS,
        snapshot?.targetMappings.length ?? 0
    );
    const maximumCandidateCount = Math.min(
        PALETTE_PROOF_MAX_CANDIDATES,
        snapshot?.palette.length ?? 0
    );
    const targetCount = Math.min(requestedTargetCount, maximumTargetCount);
    const minimumCandidateCount =
        maximumCandidateCount >= 2 ? PALETTE_PROOF_MIN_CANDIDATES : maximumCandidateCount;
    const candidateCount = Math.max(
        minimumCandidateCount,
        Math.min(requestedCandidateCount, maximumCandidateCount)
    );
    const filamentProfileFingerprint = useMemo(
        () =>
            profile && !profileDirty
                ? fingerprintAppearanceFilaments(profile.filaments)
                : undefined,
        [profile, profileDirty]
    );
    const compatibleAppearance = profileDirty ? undefined : profile?.appearance;
    const allCompletedHistory = useMemo(
        () =>
            snapshot
                ? buildPaletteProofHistory(
                      compatibleAppearance,
                      snapshot,
                      undefined,
                      filamentProfileFingerprint
                  )
                : null,
        [compatibleAppearance, filamentProfileFingerprint, snapshot]
    );
    const generationHistory = useMemo(() => {
        if (!snapshot) return null;
        if (proofGeneration.mode === 'initial') return allCompletedHistory;
        return buildPaletteProofHistory(
            compatibleAppearance,
            snapshot,
            undefined,
            filamentProfileFingerprint,
            proofGeneration.mode === 'new-targets'
                ? new Set(proofGeneration.deprioritizedTargetIds)
                : undefined
        );
    }, [
        allCompletedHistory,
        compatibleAppearance,
        filamentProfileFingerprint,
        proofGeneration,
        snapshot,
    ]);
    const currentProofState = useMemo(() => {
        if (!snapshot) return { spec: null, error: null };
        try {
            return {
                spec: buildPaletteProofSpec(snapshot, {
                    targetCount,
                    candidateCount,
                    selectionHistory: generationHistory?.selectionHistory,
                    targetMappingIds:
                        proofGeneration.mode === 'continue'
                            ? proofGeneration.targetMappingIds
                            : undefined,
                }),
                error: null,
            };
        } catch (error) {
            return {
                spec: null,
                error: error instanceof Error ? error.message : 'Could not build Palette Proof',
            };
        }
    }, [candidateCount, generationHistory, proofGeneration, snapshot, targetCount]);
    const savedProofs = useMemo(
        () =>
            [...(profile?.appearance?.proofs ?? [])].sort((left, right) =>
                right.exportedAt.localeCompare(left.exportedAt)
            ),
        [profile?.appearance?.proofs]
    );
    const savedById = useMemo(
        () => new Map(savedProofs.map((proof) => [proof.id, proof])),
        [savedProofs]
    );
    const savedProofGroups = useMemo(() => groupPaletteProofRecords(savedProofs), [savedProofs]);
    const currentSpec = currentProofState.spec;
    const [selectedProofId, setSelectedProofId] = useState<string>('');
    const [view, setView] = useState<PanelView>('proof');
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [pendingDeleteProofId, setPendingDeleteProofId] = useState<string | null>(null);

    useEffect(() => {
        setProofGeneration({ mode: 'initial' });
    }, [snapshot?.fingerprint]);

    useEffect(() => {
        setSelectedProofId((proofId) => {
            if (proofId && (savedById.has(proofId) || proofId === currentSpec?.id)) {
                return proofId;
            }
            return currentSpec?.id ?? savedProofs[0]?.id ?? '';
        });
    }, [currentSpec, savedById, savedProofs]);

    const selectedRecord = savedById.get(selectedProofId);
    const selectedSpec =
        selectedRecord?.proof ?? (currentSpec?.id === selectedProofId ? currentSpec : null);
    const selectedSnapshot =
        selectedSpec?.snapshotFingerprint === snapshot?.fingerprint ? snapshot : undefined;
    const isSelectedCurrent = currentSpec?.id === selectedProofId;
    const canTrack = Boolean(profile && !profileDirty);
    const evaluation = selectedRecord
        ? getPaletteProofEvaluationState(profile?.appearance, selectedRecord.id)
        : undefined;
    const judgmentsByColumn = useMemo(
        () => new Map(evaluation?.judgments.map((judgment) => [judgment.column, judgment]) ?? []),
        [evaluation?.judgments]
    );
    const cellsById = useMemo(
        () => new Map(selectedSpec?.cells.map((cell) => [cell.id, cell]) ?? []),
        [selectedSpec]
    );
    const prefixesByKey = useMemo(() => {
        if (selectedRecord) {
            return new Map(
                selectedRecord.prefixes.map((prefix) => [
                    prefix.canonicalStackKey,
                    prefix.predictedColor,
                ])
            );
        }
        return new Map(
            (selectedSnapshot?.palette ?? []).map((entry) => [
                entry.canonicalStackKey,
                entry.predictedColor,
            ])
        );
    }, [selectedRecord, selectedSnapshot]);

    const handleDownload = async () => {
        if (!selectedSpec?.comparisonEnabled || !selectedSnapshot || isExporting) return;
        setIsExporting(true);
        setExportError(null);
        setActionError(null);
        setSaved(false);

        try {
            const blob = await exportPaletteProof3MF(selectedSnapshot, selectedSpec);
            const result = await saveBlobToFile(blob, {
                defaultFileName: `kromacut-palette-proof-${selectedSpec.id.slice(-8)}.3mf`,
                extension: '3mf',
                filterName: 'Palette Proof 3MF',
            });
            setSaved(result !== null);
            if (result !== null && !selectedRecord && onRegisterProof) {
                try {
                    onRegisterProof(selectedSnapshot, selectedSpec);
                } catch (error) {
                    setActionError(
                        `3MF saved, but results cannot be tracked: ${
                            error instanceof Error ? error.message : 'profile update failed'
                        }`
                    );
                }
            }
        } catch (error) {
            console.error('Palette Proof export failed', error);
            setExportError(error instanceof Error ? error.message : 'Palette Proof export failed');
        } finally {
            setIsExporting(false);
        }
    };

    const runProfileAction = (action: () => void) => {
        setActionError(null);
        try {
            action();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Could not save proof results');
        }
    };

    const handleCellToggle = (column: number, cellId: string) => {
        if (!selectedRecord || !onSetTargetResponse || evaluation?.complete) return;
        const current = judgmentsByColumn.get(column);
        const selected = current?.response === 'closest' ? current.closestCellIds : [];
        const closestCellIds = selected.includes(cellId)
            ? selected.filter((candidate) => candidate !== cellId)
            : [...selected, cellId];
        runProfileAction(() =>
            onSetTargetResponse(
                selectedRecord.id,
                column,
                closestCellIds.length > 0 ? { response: 'closest', closestCellIds } : null
            )
        );
    };

    const handleNoneToggle = (column: number) => {
        if (!selectedRecord || !onSetTargetResponse || evaluation?.complete) return;
        const current = judgmentsByColumn.get(column);
        runProfileAction(() =>
            onSetTargetResponse(
                selectedRecord.id,
                column,
                current?.response === 'none' ? null : { response: 'none' }
            )
        );
    };

    const handleDeleteProof = () => {
        if (!selectedRecord || !onDeleteProof) return;
        setActionError(null);
        try {
            onDeleteProof(selectedRecord.id);
            setPendingDeleteProofId(null);
            setProofGeneration({ mode: 'initial' });
            setView('proof');
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Could not delete proof');
        }
    };

    const prepareNextProof = (generation: ProofGeneration) => {
        if (!selectedRecord || !evaluation?.complete) return;
        setActionError(null);
        setRequestedTargetCount(selectedRecord.proof.layout.columnCount);
        setRequestedCandidateCount(selectedRecord.proof.layout.rowCount);
        setSelectedProofId('');
        setProofGeneration(generation);
        setView('proof');
    };

    const handleContinueTargets = () => {
        if (!selectedRecord) return;
        prepareNextProof({
            mode: 'continue',
            sourceProofId: selectedRecord.id,
            targetMappingIds: selectedRecord.proof.columns.map((column) => column.targetMappingId),
        });
    };

    const handleNewTargets = () => {
        if (!selectedRecord) return;
        prepareNextProof({
            mode: 'new-targets',
            sourceProofId: selectedRecord.id,
            deprioritizedTargetIds: selectedRecord.proof.columns.map(
                (column) => column.targetMappingId
            ),
        });
    };

    if (currentProofState.error) {
        return (
            <div
                className={cn(
                    'text-[10px] text-destructive',
                    !embedded && 'mt-4 border-t border-border/50 pt-3'
                )}
            >
                {currentProofState.error}
            </div>
        );
    }

    if (!selectedSpec) {
        return (
            <div
                className={cn(
                    'rounded-md border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground',
                    !embedded && 'mt-4'
                )}
            >
                Generate an Auto-paint result to create a Palette Proof. Saved proofs from the
                active filament profile will also appear here.
            </div>
        );
    }

    const currentRecord = currentSpec ? savedById.get(currentSpec.id) : undefined;
    const currentTargetSetKey = currentSpec ? paletteProofTargetSetKey(currentSpec) : undefined;
    const matchingCurrentGroup = currentTargetSetKey
        ? savedProofGroups.find((group) => group.key === currentTargetSetKey)
        : undefined;
    const selectorGroups = savedProofGroups.map((group) => {
        const records = [...group.records].reverse();
        const items = records.map((record) => {
            const chronologicalRound = group.records.findIndex((entry) => entry.id === record.id);
            const evaluationState = getPaletteProofEvaluationState(profile?.appearance, record.id);
            const roundLabel =
                chronologicalRound === 0 ? 'Initial' : `Continuation ${chronologicalRound}`;
            const status = evaluationState.complete
                ? 'Complete'
                : `${evaluationState.answeredColumns}/${evaluationState.totalColumns}`;
            return {
                id: record.id,
                label: `Set ${group.number} / ${roundLabel} / ${proofTimestamp(record)} / ${status}`,
            };
        });
        if (currentSpec && !currentRecord && matchingCurrentGroup?.key === group.key) {
            items.unshift({
                id: currentSpec.id,
                label: `Set ${group.number} / Continuation ${group.records.length} / not saved`,
            });
        }
        return {
            key: group.key,
            label: `Target set ${group.number} / ${items.length} ${items.length === 1 ? 'round' : 'rounds'}`,
            items,
        };
    });
    if (currentSpec && !currentRecord && !matchingCurrentGroup) {
        const groupNumber = savedProofGroups.length + 1;
        selectorGroups.unshift({
            key: currentTargetSetKey ?? currentSpec.id,
            label: `Target set ${groupNumber} / new`,
            items: [
                {
                    id: currentSpec.id,
                    label: `Set ${groupNumber} / ${savedProofGroups.length === 0 ? 'Initial' : 'New targets'} / not saved`,
                },
            ],
        });
    }
    const selectorOptionCount = selectorGroups.reduce(
        (count, group) => count + group.items.length,
        0
    );
    const targetCountOptions = Array.from({ length: maximumTargetCount }, (_, index) => index + 1);
    const candidateCountOptions =
        maximumCandidateCount === 1
            ? [1]
            : Array.from(
                  { length: Math.max(0, maximumCandidateCount - PALETTE_PROOF_MIN_CANDIDATES + 1) },
                  (_, index) => index + PALETTE_PROOF_MIN_CANDIDATES
              );
    const selectedTargetIds = new Set(
        selectedRecord?.proof.columns.map((column) => column.targetMappingId) ?? []
    );
    const targetHasUnseenCandidates = (targetId: string) =>
        (allCompletedHistory?.selectionHistory.candidateHistoryByTargetId.get(targetId)
            ?.testedStackKeys.size ?? 0) < (snapshot?.palette.length ?? 0);
    const selectedTargetsExistInCurrentResult = Boolean(
        snapshot &&
        [...selectedTargetIds].every((targetId) =>
            snapshot.targetMappings.some((target) => target.id === targetId)
        )
    );
    const selectedProofMatchesCurrentProcess = Boolean(
        selectedRecord &&
        snapshot &&
        filamentProfileFingerprint &&
        selectedRecord.process.filamentProfileFingerprint === filamentProfileFingerprint &&
        selectedRecord.process.layerHeight === snapshot.settings.layerHeight &&
        selectedRecord.process.firstLayerHeight === snapshot.settings.firstLayerHeight &&
        selectedRecord.process.transitionOpacity === snapshot.settings.transitionOpacity
    );
    const canContinueTargets = Boolean(
        selectedProofMatchesCurrentProcess &&
        selectedTargetsExistInCurrentResult &&
        evaluation?.complete &&
        [...selectedTargetIds].some(targetHasUnseenCandidates)
    );
    const canStartNewTargets = Boolean(
        selectedProofMatchesCurrentProcess &&
        evaluation?.complete &&
        snapshot?.targetMappings.some(
            (target) => !selectedTargetIds.has(target.id) && targetHasUnseenCandidates(target.id)
        )
    );

    return (
        <section
            data-testid="palette-proof-panel"
            data-proof-id={selectedSpec.id}
            className={cn('space-y-3', !embedded && 'mt-4 border-t border-border/50 pt-3')}
        >
            <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1 max-[480px]:basis-full">
                    {showTitle && (
                        <h4 className="text-xs font-semibold text-foreground">Palette Proof</h4>
                    )}
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                        {selectedSpec.layout.widthMm} x {selectedSpec.layout.heightMm} mm /{' '}
                        {selectedSpec.layout.columnCount} targets / {selectedSpec.layout.rowCount}{' '}
                        candidates
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-8 shrink-0 px-2.5 text-xs max-[480px]:ml-0 max-[480px]:w-8 max-[480px]:px-0"
                    disabled={!selectedSpec.comparisonEnabled || !selectedSnapshot || isExporting}
                    onClick={handleDownload}
                    data-testid="download-palette-proof"
                    title={
                        selectedSnapshot
                            ? 'Download Palette Proof 3MF'
                            : "Rebuild this proof's source Auto-paint result to download it again"
                    }
                    aria-label="Download Palette Proof 3MF"
                >
                    {isExporting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin min-[481px]:mr-1.5" />
                    ) : (
                        <Download className="h-3.5 w-3.5 min-[481px]:mr-1.5" />
                    )}
                    <span className="max-[480px]:sr-only">
                        {isExporting ? 'Building...' : 'Download 3MF'}
                    </span>
                </Button>
                {selectedRecord && (
                    <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={!canTrack || !onDeleteProof}
                        onClick={() => setPendingDeleteProofId(selectedRecord.id)}
                        title="Delete Palette Proof"
                        aria-label="Delete Palette Proof"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>

            {selectedRecord && pendingDeleteProofId === selectedRecord.id && (
                <div
                    className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-2"
                    role="alert"
                >
                    <p className="min-w-0 flex-1 text-[10px] text-foreground">
                        Delete this {evaluation?.complete ? 'completed' : 'incomplete'} proof and
                        all of its results? This removes it from appearance calibration.
                    </p>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setPendingDeleteProofId(null)}
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-xs"
                        onClick={handleDeleteProof}
                    >
                        Delete proof
                    </Button>
                </div>
            )}

            {selectorOptionCount > 1 && (
                <Select
                    value={selectedProofId}
                    onValueChange={(proofId) => {
                        setSelectedProofId(proofId);
                        setView('proof');
                        setActionError(null);
                        setPendingDeleteProofId(null);
                    }}
                >
                    <SelectTrigger className="h-8 text-xs" aria-label="Palette Proof record">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {selectorGroups.map((group) => (
                            <SelectGroup key={group.key}>
                                <SelectLabel className="px-2 py-1 text-[10px] font-medium text-muted-foreground">
                                    {group.label}
                                </SelectLabel>
                                {group.items.map((option) => (
                                    <SelectItem
                                        key={option.id}
                                        value={option.id}
                                        className="text-xs"
                                    >
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        ))}
                    </SelectContent>
                </Select>
            )}

            {currentSpec && isSelectedCurrent && targetCountOptions.length > 0 && (
                <div className="grid grid-cols-2 gap-2" data-testid="palette-proof-size-controls">
                    <label className="space-y-1 text-[10px] font-medium text-muted-foreground">
                        Targets
                        <Select
                            value={String(targetCount)}
                            onValueChange={(value) => {
                                setSelectedProofId('');
                                setRequestedTargetCount(Number(value));
                            }}
                            disabled={proofGeneration.mode === 'continue'}
                        >
                            <SelectTrigger
                                className="mt-1 h-8 text-xs text-foreground"
                                aria-label="Palette Proof target count"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {targetCountOptions.map((count) => (
                                    <SelectItem
                                        key={count}
                                        value={String(count)}
                                        className="text-xs"
                                    >
                                        {count}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                    <label className="space-y-1 text-[10px] font-medium text-muted-foreground">
                        Candidates
                        <Select
                            value={String(candidateCount)}
                            onValueChange={(value) => {
                                setSelectedProofId('');
                                setRequestedCandidateCount(Number(value));
                            }}
                            disabled={candidateCountOptions.length <= 1}
                        >
                            <SelectTrigger
                                className="mt-1 h-8 text-xs text-foreground"
                                aria-label="Palette Proof candidate count"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {candidateCountOptions.map((count) => (
                                    <SelectItem
                                        key={count}
                                        value={String(count)}
                                        className="text-xs"
                                    >
                                        {count}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                </div>
            )}

            <Tabs value={view} onValueChange={(value) => setView(value as PanelView)}>
                <TabsList className="grid h-8 w-full grid-cols-2">
                    <TabsTrigger value="proof" className="h-6 text-xs">
                        Proof map
                    </TabsTrigger>
                    <TabsTrigger value="results" className="h-6 text-xs">
                        Results
                        {evaluation && (
                            <span className="ml-1 tabular-nums text-[9px] text-muted-foreground">
                                {evaluation.answeredColumns}/{evaluation.totalColumns}
                            </span>
                        )}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="proof" className="mt-3 space-y-2">
                    <div className="divide-y divide-border/70 border-y border-border/70">
                        {selectedSpec.columns.map((column) => (
                            <div
                                key={column.id}
                                className="grid gap-2 py-2 sm:grid-cols-[5.5rem_1fr]"
                                data-testid={`palette-proof-map-target-${column.column + 1}`}
                                data-target-mapping-id={column.targetMappingId}
                            >
                                <div className="flex items-center gap-2 sm:items-start">
                                    <div
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-[10px] font-semibold"
                                        style={{
                                            backgroundColor: column.targetColor.hex,
                                            color: swatchTextColor(column.targetColor.rgb),
                                        }}
                                        title={`Target ${column.column + 1}: ${column.targetColor.hex.toUpperCase()}`}
                                        aria-label={`Target ${column.column + 1}`}
                                    >
                                        {column.column + 1}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-medium">
                                            Target {column.column + 1}
                                        </p>
                                        <p className="truncate text-[9px] uppercase text-muted-foreground">
                                            {column.targetColor.hex}
                                        </p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                                    {column.cellIds.map((cellId) => {
                                        const cell = cellsById.get(cellId);
                                        const color = cell
                                            ? prefixesByKey.get(cell.canonicalStackKey)
                                            : undefined;
                                        const isFoundation =
                                            cell?.physicalPatchId === 'foundation-reference';
                                        return (
                                            <div
                                                key={cellId}
                                                className={cn(
                                                    'flex h-10 items-center justify-center rounded border text-[10px] font-semibold tabular-nums',
                                                    isFoundation
                                                        ? 'border-dashed border-foreground/60'
                                                        : 'border-border/70'
                                                )}
                                                style={{
                                                    backgroundColor: color?.hex ?? '#000000',
                                                    color: color
                                                        ? swatchTextColor(color.rgb)
                                                        : '#ffffff',
                                                }}
                                                title={
                                                    cell
                                                        ? `${cell.id}: prefix ${cell.prefixIndex + 1}, ${
                                                              cell.candidateRole
                                                          }${
                                                              isFoundation
                                                                  ? ' (foundation margin)'
                                                                  : ''
                                                          }`
                                                        : undefined
                                                }
                                                aria-label={cell?.id}
                                            >
                                                {isFoundation ? `${cellId} F` : cellId}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex min-h-4 items-center text-[9px] text-muted-foreground">
                        <span>F = shared foundation reference</span>
                        {saved && (
                            <span className="ml-auto text-green-600 dark:text-green-400">
                                Saved
                            </span>
                        )}
                    </div>
                    {!profile && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            Save a named filament profile to retain this proof and its results.
                        </p>
                    )}
                    {profileDirty && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            Save or overwrite filament edits before tracking proof results.
                        </p>
                    )}
                    {selectedRecord && !isSelectedCurrent && (
                        <p className="text-[10px] text-muted-foreground">
                            Saved proof from {new Date(selectedRecord.exportedAt).toLocaleString()}.
                        </p>
                    )}
                </TabsContent>

                <TabsContent value="results" className="mt-3 space-y-3">
                    {!selectedRecord ? (
                        <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                            Download the current 3MF to save this proof before recording results.
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span className="tabular-nums">
                                    {evaluation?.answeredColumns ?? 0}/
                                    {evaluation?.totalColumns ?? 0} targets answered
                                </span>
                                {evaluation?.complete && (
                                    <span className="ml-auto inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                                        <Check className="h-3 w-3" /> Complete
                                    </span>
                                )}
                            </div>

                            <div className="divide-y divide-border/70 border-y border-border/70">
                                {selectedRecord.proof.columns.map((column) => {
                                    const judgment = judgmentsByColumn.get(column.column);
                                    return (
                                        <div
                                            key={column.id}
                                            className="grid gap-2 py-3 sm:grid-cols-[5.5rem_1fr]"
                                            data-testid={`palette-proof-result-column-${column.column + 1}`}
                                        >
                                            <div className="flex items-center gap-2 sm:items-start">
                                                <div
                                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-[10px] font-semibold"
                                                    style={{
                                                        backgroundColor: column.targetColor.hex,
                                                        color: swatchTextColor(
                                                            column.targetColor.rgb
                                                        ),
                                                    }}
                                                    aria-label={`Target ${column.column + 1}`}
                                                >
                                                    {column.column + 1}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-medium">
                                                        Target {column.column + 1}
                                                    </p>
                                                    <p className="truncate text-[9px] uppercase text-muted-foreground">
                                                        {column.targetColor.hex}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                                                {column.cellIds.map((cellId) => {
                                                    const cell = cellsById.get(cellId);
                                                    const color = cell
                                                        ? prefixesByKey.get(cell.canonicalStackKey)
                                                        : undefined;
                                                    const selected =
                                                        judgment?.response === 'closest' &&
                                                        judgment.closestCellIds.includes(cellId);
                                                    const isFoundation =
                                                        cell?.physicalPatchId ===
                                                        'foundation-reference';
                                                    return (
                                                        <button
                                                            key={cellId}
                                                            type="button"
                                                            disabled={
                                                                !canTrack || evaluation?.complete
                                                            }
                                                            onClick={() =>
                                                                handleCellToggle(
                                                                    column.column,
                                                                    cellId
                                                                )
                                                            }
                                                            className={cn(
                                                                'relative flex h-10 items-center justify-center rounded border text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
                                                                selected
                                                                    ? 'border-primary ring-2 ring-primary/50'
                                                                    : 'border-border hover:border-foreground/50'
                                                            )}
                                                            style={{
                                                                backgroundColor:
                                                                    color?.hex ?? '#000000',
                                                                color: color
                                                                    ? swatchTextColor(color.rgb)
                                                                    : '#ffffff',
                                                            }}
                                                            aria-pressed={selected}
                                                            aria-label={`${cellId}${
                                                                isFoundation
                                                                    ? ', foundation reference'
                                                                    : ''
                                                            }`}
                                                            title={`${cellId}: ${
                                                                cell?.candidateRole ?? 'candidate'
                                                            }`}
                                                        >
                                                            {isFoundation ? `${cellId} F` : cellId}
                                                            {selected && (
                                                                <Check className="absolute right-0.5 top-0.5 h-3 w-3" />
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                                <button
                                                    type="button"
                                                    disabled={!canTrack || evaluation?.complete}
                                                    onClick={() => handleNoneToggle(column.column)}
                                                    className={cn(
                                                        'h-10 rounded border px-1 text-[9px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
                                                        judgment?.response === 'none'
                                                            ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                                                            : 'border-dashed border-border text-muted-foreground hover:border-foreground/50'
                                                    )}
                                                    aria-pressed={judgment?.response === 'none'}
                                                >
                                                    None
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[9px] text-muted-foreground">
                                    Pick the visibly closest patch even if it is imperfect. Select
                                    ties together; use None only when every candidate is clearly a
                                    poor match.
                                </p>
                                {evaluation?.complete ? (
                                    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            disabled={!canTrack || !onReopenEvaluation}
                                            onClick={() =>
                                                runProfileAction(() =>
                                                    onReopenEvaluation?.(selectedRecord.id)
                                                )
                                            }
                                        >
                                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                            Edit results
                                        </Button>
                                        {selectedProofMatchesCurrentProcess && (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 text-xs"
                                                    disabled={!canTrack || !canContinueTargets}
                                                    onClick={handleContinueTargets}
                                                    title={
                                                        canContinueTargets
                                                            ? 'Keep these targets and test untried stack candidates'
                                                            : 'Every stack candidate has been tested for these targets'
                                                    }
                                                >
                                                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                                    Continue targets
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    className="h-8 text-xs"
                                                    disabled={!canTrack || !canStartNewTargets}
                                                    onClick={handleNewTargets}
                                                    title={
                                                        canStartNewTargets
                                                            ? 'Prioritize image targets outside this proof'
                                                            : 'No untested image targets remain outside this proof'
                                                    }
                                                >
                                                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                                                    New targets
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <Button
                                        size="sm"
                                        className="ml-auto h-8 text-xs"
                                        disabled={
                                            !canTrack ||
                                            !onCompleteEvaluation ||
                                            evaluation?.answeredColumns !==
                                                evaluation?.totalColumns ||
                                            evaluation?.totalColumns === 0
                                        }
                                        onClick={() =>
                                            runProfileAction(() =>
                                                onCompleteEvaluation?.(selectedRecord.id)
                                            )
                                        }
                                    >
                                        <Check className="mr-1.5 h-3.5 w-3.5" />
                                        Complete results
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </TabsContent>
            </Tabs>

            {exportError && <p className="text-[10px] text-destructive">{exportError}</p>}
            {actionError && <p className="text-[10px] text-destructive">{actionError}</p>}
            {!selectedSpec.comparisonEnabled && (
                <p className="text-[10px] text-muted-foreground">
                    At least two printable prefixes are required.
                </p>
            )}
        </section>
    );
}
