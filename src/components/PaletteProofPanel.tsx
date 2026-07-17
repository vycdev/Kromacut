import { useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { saveBlobToFile } from '../hooks/saveBlobToFile';
import { buildPaletteProofSpec } from '../lib/paletteProof';
import { exportPaletteProof3MF } from '../lib/paletteProofExport';
import type { FinalPrintableStackSnapshot } from '../types/appearance';

interface PaletteProofPanelProps {
    snapshot: FinalPrintableStackSnapshot;
    embedded?: boolean;
    showTitle?: boolean;
}

function swatchTextColor(rgb: readonly [number, number, number]): string {
    const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return luminance > 0.55 ? '#111111' : '#ffffff';
}

export default function PaletteProofPanel({
    snapshot,
    embedded = false,
    showTitle = true,
}: PaletteProofPanelProps) {
    const proofState = useMemo(() => {
        try {
            return { spec: buildPaletteProofSpec(snapshot), error: null };
        } catch (error) {
            return {
                spec: null,
                error: error instanceof Error ? error.message : 'Could not build Palette Proof',
            };
        }
    }, [snapshot]);
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const spec = proofState.spec;

    const cellsByCoordinate = useMemo(
        () => new Map(spec?.cells.map((cell) => [`${cell.row}:${cell.column}`, cell]) ?? []),
        [spec]
    );
    const prefixesByKey = useMemo(
        () => new Map(snapshot.palette.map((entry) => [entry.canonicalStackKey, entry])),
        [snapshot]
    );

    const handleDownload = async () => {
        if (!spec?.comparisonEnabled || isExporting) return;
        setIsExporting(true);
        setExportError(null);
        setSaved(false);

        try {
            const blob = await exportPaletteProof3MF(snapshot, spec);
            const result = await saveBlobToFile(blob, {
                defaultFileName: `kromacut-palette-proof-${spec.id.slice(-8)}.3mf`,
                extension: '3mf',
                filterName: 'Palette Proof 3MF',
            });
            setSaved(result !== null);
        } catch (error) {
            console.error('Palette Proof export failed', error);
            setExportError(error instanceof Error ? error.message : 'Palette Proof export failed');
        } finally {
            setIsExporting(false);
        }
    };

    if (!spec || proofState.error) {
        return (
            <div
                className={cn(
                    'text-[10px] text-destructive',
                    !embedded && 'mt-4 border-t border-border/50 pt-3'
                )}
            >
                {proofState.error}
            </div>
        );
    }

    const gridMinimumWidth = Math.max(300, 24 + spec.layout.columnCount * 34);

    return (
        <section
            data-testid="palette-proof-panel"
            className={cn(
                'space-y-2.5',
                !embedded && 'mt-4 border-t border-border/50 pt-3'
            )}
        >
            <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1 max-[480px]:basis-full">
                    {showTitle && (
                        <h4 className="text-xs font-semibold text-foreground">Palette Proof</h4>
                    )}
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                        {spec.layout.widthMm} x {spec.layout.heightMm} mm /{' '}
                        {spec.layout.columnCount} targets / {spec.layout.rowCount} candidates
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-8 shrink-0 px-2.5 text-xs max-[480px]:ml-0 max-[480px]:w-8 max-[480px]:px-0"
                    disabled={!spec.comparisonEnabled || isExporting}
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
            </div>

            <div className="overflow-x-auto pb-1">
                <div
                    className="grid gap-1"
                    style={{
                        gridTemplateColumns: `20px repeat(${spec.layout.columnCount}, minmax(28px, 1fr))`,
                        minWidth: `${gridMinimumWidth}px`,
                    }}
                >
                    <div className="flex h-7 items-center justify-center text-[9px] text-muted-foreground">
                        T
                    </div>
                    {spec.columns.map((column) => (
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

                    {Array.from({ length: spec.layout.rowCount }, (_, row) => [
                        <div
                            key={`row-${row}`}
                            className="flex h-7 items-center justify-center text-[9px] font-medium text-muted-foreground"
                        >
                            {String.fromCharCode(65 + row)}
                        </div>,
                        ...spec.columns.map((column) => {
                            const cell = cellsByCoordinate.get(`${row}:${column.column}`);
                            const prefix = cell
                                ? prefixesByKey.get(cell.canonicalStackKey)
                                : undefined;
                            const isFoundation = cell?.physicalPatchId === 'foundation-reference';
                            return (
                                <div
                                    key={`cell-${row}-${column.column}`}
                                    className={`flex h-7 items-center justify-center rounded border text-[9px] font-semibold tabular-nums ${
                                        isFoundation
                                            ? 'border-dashed border-foreground/60'
                                            : 'border-border/70'
                                    }`}
                                    style={{
                                        backgroundColor: prefix?.predictedColor.hex ?? '#000000',
                                        color: prefix
                                            ? swatchTextColor(prefix.predictedColor.rgb)
                                            : '#ffffff',
                                    }}
                                    title={
                                        cell
                                            ? `${cell.id}: prefix ${cell.prefixIndex + 1}, ${
                                                  cell.candidateRole
                                              }${isFoundation ? ' (foundation margin)' : ''}`
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
                {saved && <span className="ml-auto text-green-600 dark:text-green-400">Saved</span>}
            </div>
            {exportError && <p className="text-[10px] text-destructive">{exportError}</p>}
            {!spec.comparisonEnabled && (
                <p className="text-[10px] text-muted-foreground">
                    At least two printable prefixes are required.
                </p>
            )}
        </section>
    );
}
