import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CustomPalette } from '../types';
import type { Palette } from '../data/palettes';
import { ALL_BUILTIN_PALETTES } from '../data/palettes';
import {
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
    const enabled = enabledColors(cp);
    return {
        id: cp.id,
        label: cp.name,
        colors: enabled,
        size: enabled.length,
        custom: true,
        totalColors: cp.colors.length,
    };
}

export type MergedPalette = Palette & { custom?: boolean; totalColors?: number };

/** Built-in palette ids are reserved — imported files can never claim them. */
const RESERVED_PALETTE_IDS = new Set(ALL_BUILTIN_PALETTES.map((p) => p.id));

export function usePaletteManager() {
    const [customPalettes, setCustomPalettes] = useState<CustomPalette[]>(() =>
        loadCustomPalettes()
    );
    const [importFeedback, setImportFeedback] = useState<string | null>(null);
    const importInputRef = useRef<HTMLInputElement>(null);

    // The initially selected palette from localStorage (or 'auto')
    const [selectedPalette, setSelectedPaletteState] = useState<string>(
        () => loadSelectedPalette() ?? 'auto'
    );

    const setSelectedPalette = useCallback((id: string) => {
        setSelectedPaletteState(id);
        saveSelectedPalette(id);
    }, []);

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

    // ---- CRUD ----

    const handleCreatePalette = useCallback(
        (name: string, colors: string[], disabledColors?: number[]) => {
            if (!name.trim() || colors.length === 0) return;
            const newPal = createCustomPalette(name, colors, disabledColors);
            const updated = [...customPalettes, newPal];
            setCustomPalettes(updated);
            saveCustomPalettes(updated);
            // Auto-select the new palette
            setSelectedPalette(newPal.id);
        },
        [customPalettes, setSelectedPalette]
    );

    const handleUpdatePalette = useCallback(
        (id: string, patch: { name?: string; colors?: string[]; disabledColors?: number[] }) => {
            const updated = updateCustomPalette(customPalettes, id, patch);
            setCustomPalettes(updated);
            saveCustomPalettes(updated);
        },
        [customPalettes]
    );

    const handleClonePalette = useCallback(
        (id: string) => {
            // Prefer the custom palette so disabled flags survive; otherwise
            // fall back to built-ins (whose colors may need hex normalization).
            const cp = customPalettes.find((p) => p.id === id);
            const builtIn = cp ? undefined : ALL_BUILTIN_PALETTES.find((p) => p.id === id);
            const source = cp
                ? { label: cp.name, colors: cp.colors, disabledColors: cp.disabledColors }
                : builtIn
                  ? { label: builtIn.label, colors: builtIn.colors }
                  : undefined;
            if (!source || source.colors.length === 0) return;

            const clone = clonePalette(source, customPalettes);
            if (!clone) return;
            const updated = [...customPalettes, clone];
            setCustomPalettes(updated);
            saveCustomPalettes(updated);
            setSelectedPalette(clone.id);
            setImportFeedback(`Cloned as "${clone.name}"`);
        },
        [customPalettes, setSelectedPalette]
    );

    const handleDeletePalette = useCallback(
        (id: string) => {
            const updated = deleteFromList(customPalettes, id);
            setCustomPalettes(updated);
            saveCustomPalettes(updated);
            if (selectedPalette === id) {
                setSelectedPalette('auto');
            }
        },
        [customPalettes, selectedPalette, setSelectedPalette]
    );

    // ---- Import / Export ----

    const handleExportPalette = useCallback(
        (id: string) => {
            const cp = customPalettes.find((p) => p.id === id);
            if (!cp) return;
            const blob = exportCustomPaletteBlob(cp);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = customPaletteFileName(cp.name);
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        },
        [customPalettes]
    );

    const handleImportFile = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const incoming = parseCustomPaletteFile(reader.result as string);
                if (!incoming) {
                    setImportFeedback('Invalid palette file');
                    return;
                }
                const result = importCustomPalettes(customPalettes, incoming, RESERVED_PALETTE_IDS);
                setCustomPalettes(result.palettes);
                saveCustomPalettes(result.palettes);

                const parts: string[] = [];
                if (result.imported.length > 0) parts.push(`${result.imported.length} imported`);
                if (result.overwritten.length > 0)
                    parts.push(`${result.overwritten.length} overwritten`);
                if (result.skipped.length > 0)
                    parts.push(`${result.skipped.length} skipped (duplicates)`);
                if (result.renamed.length > 0) parts.push(`${result.renamed.length} renamed`);
                setImportFeedback(parts.join(', ') || 'No palettes found');

                // Auto-select the first imported palette
                if (result.imported.length > 0) {
                    setSelectedPalette(result.imported[0].id);
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        },
        [customPalettes, setSelectedPalette]
    );

    // Clear import feedback after a few seconds
    useEffect(() => {
        if (!importFeedback) return;
        const timer = setTimeout(() => setImportFeedback(null), 4000);
        return () => clearTimeout(timer);
    }, [importFeedback]);

    // If the selected palette was deleted externally, fall back to auto
    useEffect(() => {
        if (selectedPalette === 'auto') return;
        const exists = allPalettes.some((p) => p.id === selectedPalette);
        if (!exists) {
            setSelectedPalette('auto');
        }
    }, [allPalettes, selectedPalette, setSelectedPalette]);

    return {
        customPalettes,
        allPalettes,
        selectedPalette,
        setSelectedPalette,
        findPalette,
        importFeedback,
        importInputRef,
        handleCreatePalette,
        handleUpdatePalette,
        handleClonePalette,
        handleDeletePalette,
        handleExportPalette,
        handleImportFile,
    };
}
