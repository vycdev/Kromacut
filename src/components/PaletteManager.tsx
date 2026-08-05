import React, { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Download, Eye, EyeOff, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CustomPalette } from '@/types';
import type { MergedPalette } from '@/hooks/usePaletteManager';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface PaletteManagerProps {
    customPalettes: CustomPalette[];
    allPalettes: MergedPalette[];
    selectedPalette: string;
    importFeedback: string | null;
    importInputRef: React.RefObject<HTMLInputElement | null>;
    onCreatePalette: (name: string, colors: string[], disabledColors?: number[]) => void;
    onUpdatePalette: (
        id: string,
        patch: { name?: string; colors?: string[]; disabledColors?: number[] }
    ) => void;
    onClonePalette: (id: string) => void;
    onDeletePalette: (id: string) => void;
    onExportPalette: (id: string) => void;
    onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Check if a string is a valid hex color (#RGB or #RRGGBB). */
function isValidHex(s: string): boolean {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

/** Normalize a 3-char hex to 6-char. */
function normalizeHex(s: string): string {
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
        return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
    }
    return s.toUpperCase();
}

interface EditorColor {
    hex: string;
    enabled: boolean;
}

interface EditorState {
    name: string;
    colors: EditorColor[];
}

export const PaletteManager: React.FC<PaletteManagerProps> = ({
    customPalettes,
    selectedPalette,
    importFeedback,
    importInputRef,
    onCreatePalette,
    onUpdatePalette,
    onClonePalette,
    onDeletePalette,
    onExportPalette,
    onImportFile,
}) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editor, setEditor] = useState<EditorState>({
        name: '',
        colors: [{ hex: '#FF0000', enabled: true }],
    });

    const isCustomSelected = customPalettes.some((p) => p.id === selectedPalette);

    const openCreate = useCallback(() => {
        setEditingId(null);
        setEditor({ name: '', colors: [{ hex: '#FF0000', enabled: true }] });
        setDialogOpen(true);
    }, []);

    const openEdit = useCallback(() => {
        const cp = customPalettes.find((p) => p.id === selectedPalette);
        if (!cp) return;
        const disabled = new Set(cp.disabledColors ?? []);
        setEditingId(cp.id);
        setEditor({
            name: cp.name,
            colors: cp.colors.map((hex, i) => ({ hex, enabled: !disabled.has(i) })),
        });
        setDialogOpen(true);
    }, [customPalettes, selectedPalette]);

    const handleSave = useCallback(() => {
        const trimmed = editor.name.trim();
        const validColors = editor.colors.filter((c) => isValidHex(c.hex));
        const colors = validColors.map((c) => normalizeHex(c.hex));
        const disabledColors = validColors.flatMap((c, i) => (c.enabled ? [] : [i]));
        if (!trimmed || colors.length === 0 || disabledColors.length >= colors.length) return;

        if (editingId) {
            onUpdatePalette(editingId, { name: trimmed, colors, disabledColors });
        } else {
            onCreatePalette(trimmed, colors, disabledColors);
        }
        setDialogOpen(false);
    }, [editor, editingId, onCreatePalette, onUpdatePalette]);

    const addColor = useCallback(() => {
        setEditor((prev) => ({
            ...prev,
            colors: [...prev.colors, { hex: '#000000', enabled: true }],
        }));
    }, []);

    const removeColor = useCallback((index: number) => {
        setEditor((prev) => ({
            ...prev,
            colors: prev.colors.filter((_, i) => i !== index),
        }));
    }, []);

    const updateColor = useCallback((index: number, value: string) => {
        setEditor((prev) => {
            const next = [...prev.colors];
            next[index] = { ...next[index], hex: value };
            return { ...prev, colors: next };
        });
    }, []);

    const toggleColor = useCallback((index: number) => {
        setEditor((prev) => {
            const next = [...prev.colors];
            next[index] = { ...next[index], enabled: !next[index].enabled };
            return { ...prev, colors: next };
        });
    }, []);

    const validCount = editor.colors.filter((c) => isValidHex(c.hex)).length;
    const enabledValidCount = editor.colors.filter((c) => c.enabled && isValidHex(c.hex)).length;
    const disabledCount = editor.colors.filter((c) => !c.enabled).length;

    return (
        <>
            {/* Action buttons row */}
            <div className="flex items-center gap-1.5 mt-2">
                {/* Create New */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0"
                    title="Create new palette"
                    onClick={openCreate}
                >
                    <Plus className="w-3.5 h-3.5" />
                </Button>

                {/* Edit */}
                {isCustomSelected && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0"
                        title="Edit selected palette"
                        onClick={openEdit}
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </Button>
                )}

                {/* Clone — works on built-in, supplier, and custom palettes */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0"
                    title="Clone selected palette into an editable custom palette"
                    onClick={() => onClonePalette(selectedPalette)}
                    disabled={selectedPalette === 'auto'}
                >
                    <Copy className="w-3.5 h-3.5" />
                </Button>

                {/* Import */}
                <input
                    ref={importInputRef}
                    type="file"
                    accept=".kpal,.json"
                    className="hidden"
                    data-testid="palette-import-input"
                    onChange={onImportFile}
                />
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0"
                    title="Import palette from file"
                    onClick={() => importInputRef.current?.click()}
                >
                    <Upload className="w-3.5 h-3.5" />
                </Button>

                {/* Export */}
                {isCustomSelected && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0"
                        title="Export selected palette as .kpal file"
                        onClick={() => onExportPalette(selectedPalette)}
                    >
                        <Download className="w-3.5 h-3.5" />
                    </Button>
                )}

                {/* Delete */}
                {isCustomSelected && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer flex-shrink-0"
                        title="Delete selected palette"
                        onClick={() => onDeletePalette(selectedPalette)}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>

            {/* Import feedback */}
            {importFeedback && (
                <div className="mt-1.5 px-2 py-1 rounded text-[10px] bg-muted text-muted-foreground border border-border/50">
                    {importFeedback}
                </div>
            )}

            {/* Create / Edit Dialog */}
            <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {editingId ? 'Edit Palette' : 'Create New Palette'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {editingId
                                ? 'Modify the palette name and colors.'
                                : 'Define a name and add colors to your new palette.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-4">
                        {/* Name input */}
                        <div className="space-y-1.5">
                            <Label htmlFor="palette-name" className="text-xs font-medium">
                                Palette Name
                            </Label>
                            <Input
                                id="palette-name"
                                placeholder="My Palette"
                                value={editor.name}
                                onChange={(e) =>
                                    setEditor((prev) => ({
                                        ...prev,
                                        name: e.target.value,
                                    }))
                                }
                                className="h-8 text-sm"
                                autoFocus
                            />
                        </div>

                        {/* Colors list */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-medium">
                                    Colors ({validCount}
                                    {disabledCount > 0 ? `, ${disabledCount} disabled` : ''})
                                </Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs gap-1 cursor-pointer"
                                    onClick={addColor}
                                >
                                    <Plus className="w-3 h-3" />
                                    Add
                                </Button>
                            </div>
                            <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                                {editor.colors.map(({ hex: color, enabled }, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        {/* Color picker popover */}
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <button
                                                    type="button"
                                                    className={`w-8 h-8 rounded-full border-2 border-border shadow-sm flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-transform hover:scale-105 cursor-pointer ${
                                                        enabled ? '' : 'opacity-50'
                                                    }`}
                                                    style={{
                                                        backgroundColor: isValidHex(color)
                                                            ? color
                                                            : '#000000',
                                                    }}
                                                    title="Pick color"
                                                />
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-3" align="start">
                                                <div className="space-y-3">
                                                    <h4 className="font-medium text-sm">
                                                        Pick Color
                                                    </h4>
                                                    <HexColorPicker
                                                        color={
                                                            isValidHex(color) ? color : '#000000'
                                                        }
                                                        onChange={(c) =>
                                                            updateColor(index, c.toUpperCase())
                                                        }
                                                    />
                                                    <div className="flex gap-2 items-center">
                                                        <span className="text-xs text-muted-foreground">
                                                            Hex
                                                        </span>
                                                        <Input
                                                            value={color}
                                                            onChange={(e) =>
                                                                updateColor(index, e.target.value)
                                                            }
                                                            className="h-7 text-xs font-mono"
                                                        />
                                                    </div>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                        {/* Hex input */}
                                        <Input
                                            value={color}
                                            onChange={(e) => updateColor(index, e.target.value)}
                                            placeholder="#RRGGBB"
                                            className={`h-8 text-xs font-mono flex-1 ${
                                                color && !isValidHex(color)
                                                    ? 'border-destructive'
                                                    : ''
                                            } ${enabled ? '' : 'opacity-50'}`}
                                        />
                                        {/* Enable / disable toggle */}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0"
                                            title={
                                                enabled
                                                    ? 'Disable color (kept in palette, excluded from quantization)'
                                                    : 'Enable color'
                                            }
                                            onClick={() => toggleColor(index)}
                                            disabled={
                                                enabled &&
                                                isValidHex(color) &&
                                                enabledValidCount <= 1
                                            }
                                        >
                                            {enabled ? (
                                                <Eye className="w-3.5 h-3.5" />
                                            ) : (
                                                <EyeOff className="w-3.5 h-3.5" />
                                            )}
                                        </Button>
                                        {/* Remove */}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground hover:text-destructive cursor-pointer flex-shrink-0"
                                            onClick={() => removeColor(index)}
                                            disabled={editor.colors.length <= 1}
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                        <Button
                            onClick={handleSave}
                            disabled={!editor.name.trim() || enabledValidCount === 0}
                            className="cursor-pointer"
                        >
                            {editingId ? 'Save Changes' : 'Create Palette'}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

export default PaletteManager;
