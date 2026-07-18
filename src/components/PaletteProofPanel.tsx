import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Download, Loader2, Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { saveBlobToFile } from '../hooks/saveBlobToFile';
import {
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
    onDeleteIncompleteProof?: (proofId: string) => void;
}

type PanelView = 'proof' | 'results';

function swatchTextColor(rgb: readonly [number, number, number]): string {
    const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return luminance > 0.55 ? '#111111' : '#ffffff';
}

function proofLabel(record: PaletteProofRecord, isCurrent: boolean): string {
    const date = new Date(record.exportedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    });
    return `${isCurrent ? 'Current job' : date} / ${record.proof.layout.columnCount} targets / ${record.id.slice(-8)}`;
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
    onDeleteIncompleteProof,
}: PaletteProofPanelProps) {
    const [requestedTargetCount, setRequestedTargetCount] = useState(PALETTE_PROOF_DEFAULT_TARGETS);
    const [requestedCandidateCount, setRequestedCandidateCount] = useState(
        PALETTE_PROOF_MAX_CANDIDATES
    );
    const [historyProofIds, setHistoryProofIds] = useState<readonly string[]>([]);
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
    const selectedHistory = useMemo(
        () => (snapshot ? buildPaletteProofHistory(profile?.appearance, snapshot, historyProofIds) : null),
        [historyProofIds, profile?.appearance, snapshot]
    );
    const allCompletedHistory = useMemo(
        () => (snapshot ? buildPaletteProofHistory(profile?.appearance, snapshot) : null),
        [profile?.appearance, snapshot]
    );
    const currentProofState = useMemo(() => {
        if (!snapshot) return { spec: null, error: null };
        try {
            return {
                spec: buildPaletteProofSpec(snapshot, {
                    targetCount,
                    candidateCount,
                    selectionHistory:
                        historyProofIds.length > 0
                            ? selectedHistory?.selectionHistory
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
    }, [candidateCount, historyProofIds.length, selectedHistory, snapshot, targetCount]);
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
    const currentSpec = currentProofState.spec;
    const [selectedProofId, setSelectedProofId] = useState<string>('');
    const [view, setView] = useState<PanelView>('proof');
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [pendingDeleteProofId, setPendingDeleteProofId] = useState<string | null>(null);

    useEffect(() => {
        setHistoryProofIds([]);
    }, [snapshot?.fingerprint]);

    useEffect(() => {
        if (currentSpec) {
            setSelectedProofId(currentSpec.id);
            return;
        }
        setSelectedProofId((proofId) =>
            proofId && savedById.has(proofId) ? proofId : (savedProofs[0]?.id ?? '')
        );
    }, [currentSpec, savedById, savedProofs]);

    const selectedRecord = savedById.get(selectedProofId);
    const selectedSpec =
        selectedRecord?.proof ?? (currentSpec?.id === selectedProofId ? currentSpec : null);
    const selectedSnapshot = currentSpec?.id === selectedProofId ? snapshot : undefined;
    const isSelectedCurrent = currentSpec?.id === selectedProofId;
    const canTrack = Boolean(profile && !profileDirty);
    const evaluation = selectedRecord
        ? getPaletteProofEvaluationState(profile?.appearance, selectedRecord.id)
        : undefined;
    const judgmentsByColumn = useMemo(
        () => new Map(evaluation?.judgments.map((judgment) => [judgment.column, judgment]) ?? []),
        [evaluation?.judgments]
    );
    const cellsByCoordinate = useMemo(
        () =>
            new Map(selectedSpec?.cells.map((cell) => [`${cell.row}:${cell.column}`, cell]) ?? []),
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
        if (!currentSpec?.comparisonEnabled || !snapshot || isExporting) return;
        setIsExporting(true);
        setExportError(null);
        setActionError(null);
        setSaved(false);

        try {
            const blob = await exportPaletteProof3MF(snapshot, currentSpec);
            const result = await saveBlobToFile(blob, {
                defaultFileName: `kromacut-palette-proof-${currentSpec.id.slice(-8)}.3mf`,
                extension: '3mf',
                filterName: 'Palette Proof 3MF',
            });
            setSaved(result !== null);
            if (result !== null && onRegisterProof) {
                try {
                    onRegisterProof(snapshot, currentSpec);
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

    const handleDeleteIncompleteProof = () => {
        if (!selectedRecord || evaluation?.complete || !onDeleteIncompleteProof) return;
        setActionError(null);
        try {
            onDeleteIncompleteProof(selectedRecord.id);
            setPendingDeleteProofId(null);
            setView('proof');
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Could not delete proof');
        }
    };

    const handleStartNextProof = () => {
        if (
            !isSelectedCurrent ||
            !evaluation?.complete ||
            !allCompletedHistory?.hasUnseenEvidence
        ) {
            return;
        }
        setActionError(null);
        setHistoryProofIds([...allCompletedHistory.proofIds]);
        setView('proof');
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

    const gridMinimumWidth = Math.max(300, 24 + selectedSpec.layout.columnCount * 34);
    const currentRecord = currentSpec ? savedById.get(currentSpec.id) : undefined;
    const selectorOptions = [
        ...(currentSpec && !currentRecord
            ? [
                  {
                      id: currentSpec.id,
                      label: `Current job / not saved / ${currentSpec.id.slice(-8)}`,
                  },
              ]
            : []),
        ...savedProofs.map((record) => ({
            id: record.id,
            label: proofLabel(record, record.id === currentSpec?.id),
        })),
    ];
    const targetCountOptions = Array.from({ length: maximumTargetCount }, (_, index) => index + 1);
    const candidateCountOptions =
        maximumCandidateCount === 1
            ? [1]
            : Array.from(
                  { length: Math.max(0, maximumCandidateCount - PALETTE_PROOF_MIN_CANDIDATES + 1) },
                  (_, index) => index + PALETTE_PROOF_MIN_CANDIDATES
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
                {currentSpec && isSelectedCurrent && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto h-8 shrink-0 px-2.5 text-xs max-[480px]:ml-0 max-[480px]:w-8 max-[480px]:px-0"
                        disabled={!currentSpec.comparisonEnabled || isExporting}
                        onClick={handleDownload}
                        data-testid="download-palette-proof"
                        title="Download Palette Proof 3MF"
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
                )}
                {selectedRecord && !evaluation?.complete && (
                    <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={!canTrack || !onDeleteIncompleteProof}
                        onClick={() => setPendingDeleteProofId(selectedRecord.id)}
                        title="Delete incomplete Palette Proof"
                        aria-label="Delete incomplete Palette Proof"
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
                        Delete this incomplete proof and its draft results?
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
                        onClick={handleDeleteIncompleteProof}
                    >
                        Delete proof
                    </Button>
                </div>
            )}

            {selectorOptions.length > 1 && (
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
                        {selectorOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id} className="text-xs">
                                {option.label}
                            </SelectItem>
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
                            onValueChange={(value) => setRequestedTargetCount(Number(value))}
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
                            onValueChange={(value) => setRequestedCandidateCount(Number(value))}
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
                    <div className="overflow-x-auto pb-1">
                        <div
                            className="grid gap-1"
                            style={{
                                gridTemplateColumns: `20px repeat(${selectedSpec.layout.columnCount}, minmax(28px, 1fr))`,
                                minWidth: `${gridMinimumWidth}px`,
                            }}
                        >
                            <div className="flex h-7 items-center justify-center text-[9px] text-muted-foreground">
                                T
                            </div>
                            {selectedSpec.columns.map((column) => (
                                <div
                                    key={`target-${column.id}`}
                                    className="flex h-7 items-center justify-center rounded border border-border/70 text-[9px] font-semibold tabular-nums"
                                    style={{
                                        backgroundColor: column.targetColor.hex,
                                        color: swatchTextColor(column.targetColor.rgb),
                                    }}
                                    title={`Target ${column.column + 1}: ${column.targetColor.hex.toUpperCase()}`}
                                    aria-label={`Target ${column.column + 1}: ${column.targetColor.hex}`}
                                >
                                    {column.column + 1}
                                </div>
                            ))}

                            {Array.from({ length: selectedSpec.layout.rowCount }, (_, row) => [
                                <div
                                    key={`row-${row}`}
                                    className="flex h-7 items-center justify-center text-[9px] font-medium text-muted-foreground"
                                >
                                    {String.fromCharCode(65 + row)}
                                </div>,
                                ...selectedSpec.columns.map((column) => {
                                    const cell = cellsByCoordinate.get(`${row}:${column.column}`);
                                    const color = cell
                                        ? prefixesByKey.get(cell.canonicalStackKey)
                                        : undefined;
                                    const isFoundation =
                                        cell?.physicalPatchId === 'foundation-reference';
                                    return (
                                        <div
                                            key={`cell-${row}-${column.column}`}
                                            className={cn(
                                                'flex h-7 items-center justify-center rounded border text-[9px] font-semibold tabular-nums',
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
                                                          isFoundation ? ' (foundation margin)' : ''
                                                      }`
                                                    : undefined
                                            }
                                            aria-label={cell?.id}
                                        >
                                            {isFoundation ? 'F' : cell?.id}
                                        </div>
                                    );
                                }),
                            ])}
                        </div>
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
                                                    const cell = selectedRecord.proof.cells.find(
                                                        (candidate) => candidate.id === cellId
                                                    );
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
                                    <div className="ml-auto flex items-center gap-2">
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
                                        {isSelectedCurrent && (
                                            <Button
                                                size="sm"
                                                className="h-8 text-xs"
                                                disabled={
                                                    !canTrack ||
                                                    !allCompletedHistory?.hasUnseenEvidence
                                                }
                                                onClick={handleStartNextProof}
                                                title={
                                                    allCompletedHistory?.hasUnseenEvidence
                                                        ? 'Build another proof with untested evidence'
                                                        : 'All available targets and prefixes are covered'
                                                }
                                            >
                                                Next proof
                                                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                                            </Button>
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
