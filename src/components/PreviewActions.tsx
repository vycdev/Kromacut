import { useTranslation } from 'react-i18next';
import React from 'react';
import { HexColorPicker } from '@/components/ui/localized-color-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { PreviewColorMode, PreviewRenderMode, TouchUpTool } from '@/types';
import {
    RotateCcw,
    RotateCw,
    Crop,
    Save,
    X,
    Loader,
    Download,
    Grid3x3,
    Upload,
    Trash2,
    FileBox,
    FileType,
    Box,
    Camera,
    Check,
    Eye,
    Blend,
    Layers,
    Brush,
    Eraser,
    PaintBucket,
    Palette,
    Pipette,
    Type,
} from 'lucide-react';

export interface PreviewActionsProps {
    mode: '2d' | '3d';
    canUndo: boolean;
    canRedo: boolean;
    isCropMode: boolean;
    imageAvailable: boolean;
    hasValidCropSelection?: boolean;
    exportingSTL: boolean;
    exportProgress: number; // 0..1
    onUndo: () => void;
    onRedo: () => void;
    onEnterCrop: () => void;
    onSaveCrop: () => Promise<void>;
    onCancelCrop: () => void;
    onToggleCheckerboard: () => void;
    onPickFile: () => void;
    onClear: () => void;
    onExportImage: () => Promise<void>;
    onExportStl: () => Promise<void>;
    onExport3MF: () => Promise<void>;
    /** The currently built model is a Flat Paint slab — STL export is useless for it */
    flatPaintModel?: boolean;
    /** No valid model exists for the selected 3D mode/settings. */
    modelExportDisabled?: boolean;
    isOrtho?: boolean;
    onToggleCamera?: () => void;
    previewRenderMode?: PreviewRenderMode;
    onPreviewRenderModeChange?: (mode: PreviewRenderMode) => void;
    /** The currently built model is an auto-paint result (has physical filament colors to show) */
    autoPaintEnabled?: boolean;
    previewColorMode?: PreviewColorMode;
    onPreviewColorModeChange?: (mode: PreviewColorMode) => void;
    /** 2D touch-up tools shown alongside crop while in 2D mode */
    touchUpTool?: TouchUpTool | null;
    onTouchUpToolChange?: (tool: TouchUpTool | null) => void;
    touchUpColor?: string;
    onTouchUpColorChange?: (hex: string) => void;
    touchUpBrushSize?: number;
    onTouchUpBrushSizeChange?: (size: number) => void;
    touchUpTextSize?: number;
    onTouchUpTextSizeChange?: (size: number) => void;
    /** Current image palette for palette-aware color selection */
    paletteColors?: string[];
}

export const PreviewActions: React.FC<PreviewActionsProps> = ({
    mode,
    canUndo,
    canRedo,
    isCropMode,
    imageAvailable,
    hasValidCropSelection = false,
    exportingSTL,
    exportProgress,
    onUndo,
    onRedo,
    onEnterCrop,
    onSaveCrop,
    onCancelCrop,
    onToggleCheckerboard,
    onPickFile,
    onClear,
    onExportImage,
    onExportStl,
    onExport3MF,
    flatPaintModel = false,
    modelExportDisabled = false,
    isOrtho = false,
    onToggleCamera,
    previewRenderMode = 'shaded',
    onPreviewRenderModeChange,
    autoPaintEnabled = false,
    previewColorMode = 'simulated',
    onPreviewColorModeChange,
    touchUpTool = null,
    onTouchUpToolChange,
    touchUpColor = '#000000',
    onTouchUpColorChange,
    touchUpBrushSize = 4,
    onTouchUpBrushSizeChange,
    touchUpTextSize = 24,
    onTouchUpTextSizeChange,
    paletteColors = [],
}) => {
    const { t } = useTranslation('workspace');
    const [previewModeMenuOpen, setPreviewModeMenuOpen] = React.useState(false);
    // Local color while the picker popover is open: react-colorful fires
    // onChange continuously during drags, and pushing every sample into app
    // state re-renders the whole app. The chosen color is committed on close.
    const [colorPopoverOpen, setColorPopoverOpen] = React.useState(false);
    const [draftColor, setDraftColor] = React.useState(touchUpColor);
    const shownTouchUpColor = colorPopoverOpen ? draftColor : touchUpColor;
    const PreviewModeIcon =
        previewRenderMode === 'color-accurate'
            ? Palette
            : previewRenderMode === 'wireframe'
              ? Grid3x3
              : previewRenderMode === 'transparent'
                ? Eye
                : Box;
    const previewRenderModeLabel =
        previewRenderMode === 'color-accurate'
            ? t('previewActions.colorAccurate')
            : previewRenderMode === 'wireframe'
              ? t('previewActions.wireframe')
              : previewRenderMode === 'transparent'
                ? t('previewActions.transparent')
                : t('previewActions.shaded');
    const previewModeOptions: Array<{
        value: PreviewRenderMode;
        label: string;
        icon: React.ReactNode;
    }> = [
        {
            value: 'color-accurate',
            label: t('previewActions.colorAccurate'),
            icon: <Palette className="w-4 h-4" />,
        },
        { value: 'shaded', label: t('previewActions.shaded'), icon: <Box className="w-4 h-4" /> },
        {
            value: 'transparent',
            label: t('previewActions.transparent'),
            icon: <Eye className="w-4 h-4" />,
        },
        {
            value: 'wireframe',
            label: t('previewActions.wireframe'),
            icon: <Grid3x3 className="w-4 h-4" />,
        },
    ];
    const touchUpToolOptions: Array<{
        value: TouchUpTool;
        label: string;
        icon: React.ReactNode;
    }> = [
        { value: 'brush', label: t('previewActions.brush'), icon: <Brush className="w-4 h-4" /> },
        {
            value: 'eraser',
            label: t('previewActions.eraser'),
            icon: <Eraser className="w-4 h-4" />,
        },
        {
            value: 'fill',
            label: t('previewActions.fill'),
            icon: <PaintBucket className="w-4 h-4" />,
        },
        { value: 'text', label: t('previewActions.text'), icon: <Type className="w-4 h-4" /> },
        {
            value: 'picker',
            label: t('previewActions.pickColorFromImage'),
            icon: <Pipette className="w-4 h-4" />,
        },
    ];
    const showTouchUpTools = mode === '2d' && !isCropMode && !!onTouchUpToolChange;
    const touchUpColorRelevant =
        touchUpTool === 'brush' ||
        touchUpTool === 'fill' ||
        touchUpTool === 'text' ||
        touchUpTool === 'picker';
    // Every tool's options row reads the same left-to-right: chip, size, hint.
    const touchUpHints: Record<TouchUpTool, string> = {
        brush: t('previewActions.dragOverTheImageToPaint'),
        eraser: t('previewActions.dragOverTheImageToErase'),
        fill: t('previewActions.clickAColorRegionToFillIt'),
        text: t('previewActions.clickTheImageAndStartTyping'),
        picker: t('previewActions.clickTheImageToPickAColor'),
    };

    return (
        <div className="absolute top-4 right-4 flex flex-wrap justify-end gap-2 z-40">
            {mode === '3d' && onPreviewRenderModeChange && (
                <Popover open={previewModeMenuOpen} onOpenChange={setPreviewModeMenuOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            size="icon"
                            title={t('previewActions.previewViewTitle', {
                                mode: previewRenderModeLabel,
                            })}
                            aria-label={t('previewActions.choosePreviewView', {
                                mode: previewRenderModeLabel,
                            })}
                            data-testid="preview-render-mode-trigger"
                            className="bg-primary hover:bg-primary/80 text-primary-foreground"
                        >
                            <PreviewModeIcon className="w-4 h-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-44 p-1.5">
                        <div
                            role="radiogroup"
                            aria-label={t('previewActions.3dPreviewView')}
                            className="grid gap-1"
                        >
                            {previewModeOptions.map(({ value, label, icon }) => {
                                const selected = previewRenderMode === value;
                                return (
                                    <label
                                        key={value}
                                        onClick={() => {
                                            if (selected) setPreviewModeMenuOpen(false);
                                        }}
                                        className={`flex h-9 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm transition-colors focus-within:ring-1 focus-within:ring-ring ${
                                            selected
                                                ? 'bg-primary/10 text-primary'
                                                : 'text-foreground hover:bg-accent'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="preview-render-mode"
                                            value={value}
                                            checked={selected}
                                            onChange={() => {
                                                onPreviewRenderModeChange(value);
                                                setPreviewModeMenuOpen(false);
                                            }}
                                            className="sr-only"
                                            data-testid={`preview-render-mode-${value}`}
                                        />
                                        {icon}
                                        <span className="flex-1">{label}</span>
                                        {selected && <Check className="w-4 h-4" aria-hidden />}
                                    </label>
                                );
                            })}
                        </div>
                    </PopoverContent>
                </Popover>
            )}
            {mode === '3d' && autoPaintEnabled && onPreviewColorModeChange && (
                <Button
                    size="icon"
                    title={
                        previewColorMode === 'physical'
                            ? t(
                                  'previewActions.showingPhysicalFilamentColorsSwitchToSimulatedColors'
                              )
                            : t(
                                  'previewActions.showingSimulatedColorsSwitchToPhysicalFilamentColors'
                              )
                    }
                    aria-label={
                        previewColorMode === 'physical'
                            ? t('previewActions.switchPreviewToSimulatedColors')
                            : t('previewActions.switchPreviewToPhysicalFilamentColors')
                    }
                    aria-pressed={previewColorMode === 'physical'}
                    data-testid="preview-color-mode-toggle"
                    onClick={() =>
                        onPreviewColorModeChange(
                            previewColorMode === 'physical' ? 'simulated' : 'physical'
                        )
                    }
                    className="bg-primary hover:bg-primary/80 text-primary-foreground"
                >
                    {previewColorMode === 'physical' ? (
                        <Layers className="w-4 h-4" />
                    ) : (
                        <Blend className="w-4 h-4" />
                    )}
                </Button>
            )}
            {mode === '3d' && onToggleCamera && (
                <Button
                    size="icon"
                    title={
                        isOrtho
                            ? t('previewActions.switchToPerspectiveCamera')
                            : t('previewActions.switchToOrthographicCamera')
                    }
                    aria-label={
                        isOrtho
                            ? t('previewActions.switchToPerspectiveCamera')
                            : t('previewActions.switchToOrthographicCamera')
                    }
                    onClick={onToggleCamera}
                    className="bg-primary hover:bg-primary/80 text-primary-foreground"
                >
                    {isOrtho ? <Box className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                </Button>
            )}
            <Button
                size="icon"
                title={t('previewActions.undo')}
                aria-label={t('previewActions.undo')}
                disabled={isCropMode || !canUndo}
                onClick={onUndo}
                className="bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
                size="icon"
                title={t('previewActions.redo')}
                aria-label={t('previewActions.redo')}
                disabled={isCropMode || !canRedo}
                onClick={onRedo}
                className="bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <RotateCw className="w-4 h-4" />
            </Button>

            {showTouchUpTools &&
                touchUpToolOptions.map(({ value, label, icon }) => {
                    const active = touchUpTool === value;
                    return (
                        <Button
                            key={value}
                            size="icon"
                            title={label}
                            aria-label={label}
                            aria-pressed={active}
                            data-testid={`touchup-tool-${value}`}
                            disabled={!imageAvailable}
                            onClick={() => onTouchUpToolChange?.(active ? null : value)}
                            className={
                                'bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed' +
                                (active
                                    ? ' ring-2 ring-ring ring-offset-2 ring-offset-background'
                                    : '')
                            }
                        >
                            {icon}
                        </Button>
                    );
                })}
            {mode === '2d' &&
                (!isCropMode ? (
                    <Button
                        size="icon"
                        title={t('previewActions.crop')}
                        aria-label={t('previewActions.crop')}
                        disabled={!imageAvailable}
                        onClick={onEnterCrop}
                        className="bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Crop className="w-4 h-4" />
                    </Button>
                ) : (
                    <>
                        <Button
                            size="icon"
                            title={t('previewActions.saveCrop')}
                            aria-label={t('previewActions.saveCrop')}
                            disabled={!hasValidCropSelection}
                            onClick={onSaveCrop}
                            className="bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save className="w-4 h-4" />
                        </Button>
                        <Button
                            size="icon"
                            title={t('previewActions.cancelCrop')}
                            aria-label={t('previewActions.cancelCrop')}
                            onClick={onCancelCrop}
                            className="bg-destructive hover:bg-destructive/80 text-destructive-foreground"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </>
                ))}

            {/* Download button logic */}
            {mode === '2d' ? (
                <Button
                    size="icon"
                    title={t('previewActions.downloadImage')}
                    aria-label={t('previewActions.downloadImage')}
                    disabled={!imageAvailable}
                    onClick={onExportImage}
                    className="bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Download className="w-4 h-4" />
                </Button>
            ) : (
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            size="icon"
                            data-testid="download-3d-model"
                            title={
                                exportingSTL
                                    ? t('previewActions.exportingProgress', {
                                          percent: Math.round(exportProgress * 100),
                                      })
                                    : t('previewActions.download3dModel')
                            }
                            aria-label={t('previewActions.download3dModel')}
                            disabled={!imageAvailable || exportingSTL || modelExportDisabled}
                            className="bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {exportingSTL ? (
                                <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                                <Download className="w-4 h-4" />
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-48 p-1 flex flex-col gap-1">
                        {/* Flat Paint slabs carry their colors as per-filament 3MF
                            objects; a single-geometry STL of the slab is useless */}
                        {!flatPaintModel && (
                            <Button
                                variant="ghost"
                                onClick={onExportStl}
                                data-testid="download-stl"
                                disabled={exportingSTL || modelExportDisabled}
                                className="justify-start gap-2 h-9 px-2 font-normal"
                            >
                                <FileBox className="w-4 h-4 text-muted-foreground" />
                                <span>{t('previewActions.downloadStl')}</span>
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            onClick={onExport3MF}
                            data-testid="download-3mf"
                            disabled={exportingSTL || modelExportDisabled}
                            className="justify-start gap-2 h-9 px-2 font-normal"
                        >
                            <FileType className="w-4 h-4 text-muted-foreground" />
                            <span>{t('previewActions.download3mf')}</span>
                        </Button>
                    </PopoverContent>
                </Popover>
            )}

            {mode === '2d' && (
                <>
                    <Button
                        size="icon"
                        title={t('previewActions.toggleCheckerboard')}
                        aria-label={t('previewActions.toggleCheckerboard')}
                        onClick={onToggleCheckerboard}
                        className="bg-primary hover:bg-primary/80 text-primary-foreground"
                    >
                        <Grid3x3 className="w-4 h-4" />
                    </Button>
                    <Button
                        size="icon"
                        title={t('previewActions.chooseFile')}
                        aria-label={t('previewActions.chooseFile')}
                        onClick={onPickFile}
                        className="bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Upload className="w-4 h-4" />
                    </Button>
                    <Button
                        size="icon"
                        title={t('previewActions.removeImage')}
                        aria-label={t('previewActions.removeImage')}
                        onClick={onClear}
                        disabled={!imageAvailable || isCropMode}
                        className="bg-destructive hover:bg-destructive/80 text-destructive-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </>
            )}
            {showTouchUpTools && touchUpTool && imageAvailable && (
                <div className="w-full flex justify-end">
                    <div
                        className="flex items-center gap-2 p-2 rounded-md border border-border/40 bg-card shadow-md"
                        data-testid="touchup-options"
                    >
                        {touchUpColorRelevant && onTouchUpColorChange && (
                            <Popover
                                open={colorPopoverOpen}
                                onOpenChange={(open) => {
                                    setColorPopoverOpen(open);
                                    if (open) {
                                        setDraftColor(touchUpColor);
                                    } else if (draftColor !== touchUpColor) {
                                        onTouchUpColorChange(draftColor);
                                    }
                                }}
                            >
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        title={t('previewActions.changeToolColor')}
                                        aria-label={t('previewActions.changeToolColor')}
                                        data-testid="touchup-color-chip"
                                        className="w-8 h-8 rounded-full border-2 border-border shadow-sm flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-transform hover:scale-105 cursor-pointer"
                                        style={{ backgroundColor: shownTouchUpColor }}
                                    />
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-auto p-3"
                                    align="end"
                                    onEscapeKeyDown={(e) => e.stopPropagation()}
                                >
                                    <div className="space-y-3">
                                        <h4 className="font-medium text-sm">
                                            {t('previewActions.pickColor')}
                                        </h4>
                                        <HexColorPicker
                                            color={draftColor}
                                            onChange={setDraftColor}
                                        />
                                        {paletteColors.length > 0 && (
                                            <div className="space-y-1.5">
                                                <span className="text-xs text-muted-foreground">
                                                    {t('previewActions.imageColors')}
                                                </span>
                                                <div className="grid grid-cols-8 gap-1.5 max-h-24 overflow-y-auto pr-1">
                                                    {paletteColors.map((hex) => (
                                                        <button
                                                            key={hex}
                                                            type="button"
                                                            title={hex}
                                                            aria-label={t(
                                                                'previewActions.useColor',
                                                                { color: hex }
                                                            )}
                                                            onClick={() => setDraftColor(hex)}
                                                            className="w-5 h-5 rounded-full border border-border shadow-sm cursor-pointer transition-transform hover:scale-110"
                                                            style={{ backgroundColor: hex }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex gap-2 items-center">
                                            <span className="text-xs text-muted-foreground">
                                                {t('previewActions.hex')}
                                            </span>
                                            <Input
                                                value={draftColor}
                                                onChange={(e) => setDraftColor(e.target.value)}
                                                className="h-7 text-xs font-mono"
                                            />
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )}
                        {touchUpTool === 'eraser' && (
                            <div
                                title={t('previewActions.theEraserPaintsTransparentPixels')}
                                aria-label={t('previewActions.eraserColorTransparent')}
                                className="w-8 h-8 rounded-full border-2 border-border shadow-sm flex-shrink-0"
                                style={{
                                    background:
                                        'repeating-conic-gradient(rgba(255,255,255,0.35) 0% 25%, rgba(90,90,90,0.35) 0% 50%) 50% / 10px 10px',
                                }}
                            />
                        )}
                        {(touchUpTool === 'brush' || touchUpTool === 'eraser') &&
                            onTouchUpBrushSizeChange && (
                                <>
                                    <Slider
                                        value={[touchUpBrushSize]}
                                        min={1}
                                        max={64}
                                        step={1}
                                        onValueChange={([v]) => onTouchUpBrushSizeChange(v)}
                                        aria-label={t('previewActions.brushSize')}
                                        className="w-28 cursor-pointer"
                                    />
                                    <div className="flex-shrink-0 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold whitespace-nowrap">
                                        {t('previewActions.pixelSize', { size: touchUpBrushSize })}
                                    </div>
                                </>
                            )}
                        {touchUpTool === 'text' && onTouchUpTextSizeChange && (
                            <>
                                <Slider
                                    value={[touchUpTextSize]}
                                    min={6}
                                    max={128}
                                    step={1}
                                    onValueChange={([v]) => onTouchUpTextSizeChange(v)}
                                    aria-label={t('previewActions.textSize')}
                                    className="w-28 cursor-pointer"
                                />
                                <div className="flex-shrink-0 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold whitespace-nowrap">
                                    {t('previewActions.pixelSize', { size: touchUpTextSize })}
                                </div>
                            </>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {touchUpHints[touchUpTool]}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PreviewActions;
