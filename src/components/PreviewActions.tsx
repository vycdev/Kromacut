import React from 'react';
import { Button } from '@/components/ui/button';
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
}) => {
    return (
        <div className="absolute top-4 right-4 flex flex-wrap gap-2 z-[60]">
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

            {/* Download button: image in 2D; STL in 3D */}
            <Button
                size="icon"
                title={
                    mode === '3d'
                        ? exportingSTL
                            ? `Exporting STL… ${Math.round(exportProgress * 100)}%`
                            : 'Download STL'
                        : 'Download image'
                }
                aria-label={
                    mode === '3d'
                        ? exportingSTL
                            ? 'Exporting STL'
                            : 'Download STL'
                        : 'Download image'
                }
                disabled={!imageAvailable || exportingSTL}
                onClick={async () => {
                    if (mode === '3d') await onExportStl();
                    else await onExportImage();
                }}
                className="bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {mode === '3d' && exportingSTL ? (
                    <Loader className="w-4 h-4 animate-spin" />
                ) : (
                    <Download className="w-4 h-4" />
                )}
            </Button>

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
