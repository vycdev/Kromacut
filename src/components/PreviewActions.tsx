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
        <div className="absolute top-4 right-4 flex flex-wrap gap-2 z-10">
            <Button
                variant="secondary"
                size="sm"
                title="Undo"
                aria-label="Undo"
                disabled={isCropMode || !canUndo}
                onClick={onUndo}
            >
                <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
                variant="secondary"
                size="sm"
                title="Redo"
                aria-label="Redo"
                disabled={isCropMode || !canRedo}
                onClick={onRedo}
            >
                <RotateCw className="w-4 h-4" />
            </Button>

            {mode === '2d' &&
                (!isCropMode ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        title="Crop"
                        aria-label="Crop"
                        disabled={!imageAvailable}
                        onClick={onEnterCrop}
                    >
                        <Crop className="w-4 h-4" />
                    </Button>
                ) : (
                    <>
                        <Button
                            variant="secondary"
                            size="sm"
                            title="Save crop"
                            aria-label="Save crop"
                            onClick={onSaveCrop}
                        >
                            <Save className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            title="Cancel crop"
                            aria-label="Cancel crop"
                            onClick={onCancelCrop}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </>
                ))}

            {/* Download button: image in 2D; STL in 3D */}
            <Button
                variant="secondary"
                size="sm"
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
                        variant="secondary"
                        size="sm"
                        title="Toggle checkerboard"
                        aria-label="Toggle checkerboard"
                        onClick={onToggleCheckerboard}
                    >
                        <Grid3x3 className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        title="Choose file"
                        aria-label="Choose file"
                        onClick={onPickFile}
                    >
                        <Upload className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        title="Remove image"
                        aria-label="Remove image"
                        onClick={onClear}
                        disabled={!imageAvailable || isCropMode}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </>
            )}
        </div>
    );
};

export default PreviewActions;
