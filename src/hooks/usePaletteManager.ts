import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CustomPalette } from '../types';
import type { Palette } from '../data/palettes';
import { ALL_BUILTIN_PALETTES } from '../data/palettes';
import { saveBlobToFile } from './saveBlobToFile';
import {
    cacheGeneratedPalette,
    loadCustomPalettes,
    saveCustomPalettes,
    createCustomPalette,
    updateCustomPalette,
    deleteCustomPalette as deleteFromList,
    importCustomPalettes,
    parseCustomPaletteFile,
    exportCustomPaletteBlob,
    customPaletteFileName,
    loadSelectedPalette,
    saveSelectedPalette,
    enabledColors,
    clonePalette,
} from '../lib/paletteManager';

/**
 * Convert a CustomPalette to the built-in Palette shape for the dropdown.
 * `colors`/`size` reflect only the enabled colors so chips, the color-count
 * target, and quantization stay in agreement; `totalColors` keeps the full
 * count for labels like "Name (5/8)".
 */
function toPalette(cp: CustomPalette): Palette & { custom: true; totalColors: number } {
    const disabled = new Set(cp.disabledColors ?? []);
    const enabled = enabledColors(cp);
    return {
        id: cp.id,
        label: cp.name,
        colors: enabled,
        size: enabled.length,
        custom: true,
        totalColors: cp.colors.length,
        ...(cp.colorNames ? { colorNames: cp.colorNames.filter((_, i) => !disabled.has(i)) } : {}),
    };
}

export type MergedPalette = Palette & { custom?: boolean; totalColors?: number };

/** Built-in palette ids are reserved — imported files can never claim them. */
const RESERVED_PALETTE_IDS = new Set(ALL_BUILTIN_PALETTES.map((p) => p.id));

const paletteStorageFailure = (action: string) =>
    `${action} could not be saved. Existing palettes were left unchanged; free browser storage and try again.`;

export function usePaletteManager() {
    const [customPalettes, setCustomPalettesState] = useState<CustomPalette[]>(() =>
        loadCustomPalettes(RESERVED_PALETTE_IDS)
    );
    const customPalettesRef = useRef(customPalettes);
    // Successful writes update the import snapshot synchronously, before React renders.
    // A delayed FileReader must merge with every palette saved since its read began.
    const setCustomPalettes = useCallback((updated: CustomPalette[]) => {
        customPalettesRef.current = updated;
        setCustomPalettesState(updated);
    }, []);
    const [importFeedback, setImportFeedback] = useState<string | null>(null);
    const importInputRef = useRef<HTMLInputElement>(null);

    const [selectedPaletteIds, setSelectedPaletteIdsState] = useState<string[]>(() => {
        const known = new Set([...ALL_BUILTIN_PALETTES, ...customPalettes].map((p) => p.id));
        try {
            const saved = JSON.parse(localStorage.getItem('kromacut.selectedPaletteIds') ?? 'null');
            if (Array.isArray(saved))
                return [
                    ...new Set(
                        saved.filter(
                            (id): id is string =>
                                typeof id === 'string' && id !== 'auto' && known.has(id)
                        )
                    ),
                ];
        } catch {
            /* retain the legacy single selection */
        }
        const legacy = loadSelectedPalette();
        return legacy && legacy !== 'auto' && known.has(legacy) ? [legacy] : [];
    });
    const selectedPalette = selectedPaletteIds[0] ?? 'auto';
    const setSelectedPaletteIds = useCallback((ids: string[]) => {
        const next = [...new Set(ids.filter((id) => id !== 'auto'))];
        setSelectedPaletteIdsState(next);
        saveSelectedPalette(next[0] ?? 'auto');
        try {
            localStorage.setItem('kromacut.selectedPaletteIds', JSON.stringify(next));
        } catch {
            /* session selection still works */
        }
    }, []);
    const setSelectedPalette = useCallback(
        (id: string) => setSelectedPaletteIds(id === 'auto' ? [] : [id]),
        [setSelectedPaletteIds]
    );

    // Merge built-in + custom palettes for the dropdown
    const allPalettes: MergedPalette[] = useMemo(() => {
        const customs = customPalettes.map(toPalette);
        return [...ALL_BUILTIN_PALETTES, ...customs];
    }, [customPalettes]);

    // Resolve a palette ID → Palette (works for both built-in and custom)
    const findPalette = useCallback(
        (id: string): MergedPalette | undefined => {
            return allPalettes.find((p) => p.id === id);
        },
        [allPalettes]
    );

    const cachePalette = useCallback(
        (colors: string[]) => {
            const current = customPalettesRef.current;
            const updated = cacheGeneratedPalette(current, colors);
            if (updated === current) return;
            if (!saveCustomPalettes(updated)) {
                setImportFeedback(paletteStorageFailure('Generated palette'));
                return;
            }
            setCustomPalettes(updated);
        },
        [setCustomPalettes]
    );

    // ---- CRUD ----

    const handleCreatePalette = useCallback(
        (name: string, colors: string[], disabledColors?: number[], colorNames?: string[]) => {
            if (!name.trim() || colors.length === 0) return false;
            const newPal = createCustomPalette(name, colors, disabledColors, colorNames);
            const updated = [...customPalettes, newPal];
            if (!saveCustomPalettes(updated)) {
                setImportFeedback(paletteStorageFailure('The new palette'));
                return false;
            }
            setCustomPalettes(updated);
            setImportFeedback(null);
            // Auto-select the new palette
            setSelectedPalette(newPal.id);
            return true;
        },
        [customPalettes, setCustomPalettes, setSelectedPalette]
    );

    const handleUpdatePalette = useCallback(
        (
            id: string,
            patch: {
                name?: string;
                colors?: string[];
                disabledColors?: number[];
                colorNames?: string[];
            }
        ) => {
            const updated = updateCustomPalette(customPalettes, id, patch);
            if (!saveCustomPalettes(updated)) {
                setImportFeedback(paletteStorageFailure('Palette changes'));
                return;
            }
            setCustomPalettes(updated);
            setImportFeedback(null);
        },
        [customPalettes, setCustomPalettes]
    );

    const handleClonePalette = useCallback(
        (id: string) => {
            // Prefer the custom palette so disabled flags survive; otherwise
            // fall back to built-ins (whose colors may need hex normalization).
            const cp = customPalettes.find((p) => p.id === id);
            const builtIn = cp ? undefined : ALL_BUILTIN_PALETTES.find((p) => p.id === id);
            const source = cp
                ? {
                      label: cp.name,
                      colors: cp.colors,
                      disabledColors: cp.disabledColors,
                      colorNames: cp.colorNames,
                  }
                : builtIn
                  ? {
                        label: builtIn.label,
                        colors: builtIn.colors,
                        colorNames: builtIn.colorNames,
                    }
                  : undefined;
            if (!source || source.colors.length === 0) return;

            const clone = clonePalette(source, customPalettes);
            if (!clone) return;
            const updated = [...customPalettes, clone];
            if (!saveCustomPalettes(updated)) {
                setImportFeedback(paletteStorageFailure('The cloned palette'));
                return;
            }
            setCustomPalettes(updated);
            setSelectedPalette(clone.id);
            setImportFeedback(`Cloned as "${clone.name}"`);
        },
        [customPalettes, setCustomPalettes, setSelectedPalette]
    );

    const handleDeletePalette = useCallback(
        (id: string) => {
            const updated = deleteFromList(customPalettes, id);
            if (!saveCustomPalettes(updated)) {
                setImportFeedback(paletteStorageFailure('Palette deletion'));
                return;
            }
            setCustomPalettes(updated);
            setImportFeedback(null);
            setSelectedPaletteIds(selectedPaletteIds.filter((selected) => selected !== id));
        },
        [customPalettes, selectedPaletteIds, setCustomPalettes, setSelectedPaletteIds]
    );

    // ---- Import / Export ----

    const handleExportPalette = useCallback(
        async (id: string) => {
            const cp = customPalettes.find((p) => p.id === id);
            if (!cp) return;
            try {
                const saved = await saveBlobToFile(exportCustomPaletteBlob(cp), {
                    defaultFileName: customPaletteFileName(cp.name),
                    extension: 'kpal',
                    filterName: 'Color palette',
                });
                if (saved) setImportFeedback(null);
            } catch (error) {
                console.error('Palette export failed', error);
                setImportFeedback('Could not export the palette. Please try saving again.');
            }
        },
        [customPalettes]
    );

    const importText = useCallback(
        (content: string, selectExisting = false): boolean => {
            const incoming = parseCustomPaletteFile(content.replace(/^\uFEFF/, ''));
            if (!incoming) {
                setImportFeedback('Invalid palette file');
                return false;
            }
            const result = importCustomPalettes(
                customPalettesRef.current,
                incoming,
                RESERVED_PALETTE_IDS
            );
            if (result.imported.length > 0) {
                if (!saveCustomPalettes(result.palettes)) {
                    setImportFeedback(paletteStorageFailure('The palette import'));
                    return false;
                }
                setCustomPalettes(result.palettes);
            }

            const parts: string[] = [];
            if (result.imported.length > 0) parts.push(`${result.imported.length} imported`);
            if (result.overwritten.length > 0)
                parts.push(`${result.overwritten.length} overwritten`);
            if (result.skipped.length > 0)
                parts.push(`${result.skipped.length} skipped (duplicates)`);
            if (result.renamed.length > 0) parts.push(`${result.renamed.length} renamed`);
            setImportFeedback(parts.join(', ') || 'No palettes found');

            // Auto-select the first imported palette
            const first = (selectExisting ? result.resolved : result.imported)[0];
            if (first) {
                setSelectedPalette(first.id);
            }
            return result.resolved.length > 0;
        },
        [setCustomPalettes, setSelectedPalette]
    );

    const handleImportFile = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => importText(reader.result as string);
            reader.onerror = () => setImportFeedback('Invalid palette file');
            reader.readAsText(file);
            e.target.value = '';
        },
        [importText]
    );

    // Clear import feedback after a few seconds
    useEffect(() => {
        if (!importFeedback) return;
        const timer = setTimeout(() => setImportFeedback(null), 4000);
        return () => clearTimeout(timer);
    }, [importFeedback]);

    // Keep surviving selections if a palette disappears.
    useEffect(() => {
        const available = selectedPaletteIds.filter((id) => allPalettes.some((p) => p.id === id));
        if (available.length !== selectedPaletteIds.length) setSelectedPaletteIds(available);
    }, [allPalettes, selectedPaletteIds, setSelectedPaletteIds]);

    // A project's palette snapshots never overwrite unrelated local palette IDs.
    const restoreProjectPalettes = (palettes: CustomPalette[]) => {
        const incoming = palettes.map((p) => ({ ...p, id: crypto.randomUUID() }));
        const result = importCustomPalettes(
            customPalettesRef.current,
            incoming,
            RESERVED_PALETTE_IDS
        );
        if (result.resolved.length !== incoming.length || !saveCustomPalettes(result.palettes))
            throw new Error('palette');
        setCustomPalettes(result.palettes);
        setSelectedPaletteIds(result.resolved.map((p) => p.id));
    };
    return {
        restoreProjectPalettes,
        customPalettes,
        allPalettes,
        selectedPalette,
        selectedPaletteIds,
        setSelectedPaletteIds,
        setSelectedPalette,
        findPalette,
        cachePalette,
        importFeedback,
        importInputRef,
        handleCreatePalette,
        handleUpdatePalette,
        handleClonePalette,
        handleDeletePalette,
        handleExportPalette,
        handleImportFile,
        importText,
    };
}
