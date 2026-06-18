import React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
    isOrtho?: boolean;
    onToggleCamera?: () => void;
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
    isOrtho = false,
    onToggleCamera,
}) => {
    return (
        <div className="absolute top-4 right-4 flex flex-wrap gap-2 z-[60]">
            {mode === '3d' && onToggleCamera && (
                <Button
                    size="icon"
                    title={isOrtho ? 'Switch to perspective camera' : 'Switch to orthographic camera'}
                    aria-label={isOrtho ? 'Switch to perspective camera' : 'Switch to orthographic camera'}
                    onClick={onToggleCamera}
                    className="bg-primary hover:bg-primary/80 text-primary-foreground"
                >
                    {isOrtho ? <Box className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                </Button>
            )}
            <Button
                size="icon"
                title="Undo"
                aria-label="Undo"
                disabled={isCropMode || !canUndo}
                onClick={onUndo}
                className="bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
                size="icon"
                title="Redo"
                aria-label="Redo"
                disabled={isCropMode || !canRedo}
                onClick={onRedo}
                className="bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <RotateCw className="w-4 h-4" />
            </Button>

            {mode === '2d' &&
                (!isCropMode ? (
                    <Button
                        size="icon"
                        title="Crop"
                        aria-label="Crop"
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
                            title="Save crop"
                            aria-label="Save crop"
                            disabled={!hasValidCropSelection}
                            onClick={onSaveCrop}
                            className="bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save className="w-4 h-4" />
                        </Button>
                        <Button
                            size="icon"
                            title="Cancel crop"
                            aria-label="Cancel crop"
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
                    title="Download image"
                    aria-label="Download image"
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
                                    ? `Exporting… ${Math.round(exportProgress * 100)}%`
                                    : 'Download 3D Model'
                            }
                            aria-label="Download 3D Model"
                            disabled={!imageAvailable || exportingSTL}
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
                                disabled={exportingSTL}
                                className="justify-start gap-2 h-9 px-2 font-normal"
                            >
                                <FileBox className="w-4 h-4 text-muted-foreground" />
                                <span>Download STL</span>
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            onClick={onExport3MF}
                            data-testid="download-3mf"
                            disabled={exportingSTL}
                            className="justify-start gap-2 h-9 px-2 font-normal"
                        >
                            <FileType className="w-4 h-4 text-muted-foreground" />
                            <span>Download 3MF</span>
                        </Button>
                    </PopoverContent>
                </Popover>
            )}

            {mode === '2d' && (
                <>
                    <Button
                        size="icon"
                        title="Toggle checkerboard"
                        aria-label="Toggle checkerboard"
                        onClick={onToggleCheckerboard}
                        className="bg-primary hover:bg-primary/80 text-primary-foreground"
                    >
                        <Grid3x3 className="w-4 h-4" />
                    </Button>
                    <Button
                        size="icon"
                        title="Choose file"
                        aria-label="Choose file"
                        onClick={onPickFile}
                        className="bg-primary hover:bg-primary/80 text-primary-foreground"
                    >
                        <Upload className="w-4 h-4" />
                    </Button>
                    <Button
                        size="icon"
                        title="Remove image"
                        aria-label="Remove image"
                        onClick={onClear}
                        disabled={!imageAvailable || isCropMode}
                        className="bg-destructive hover:bg-destructive/80 text-destructive-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </>
            )}
        </div>
    );
};

export default PreviewActions;
