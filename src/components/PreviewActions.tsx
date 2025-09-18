import React from 'react';

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
        <div className="preview-actions">
            <button
                className="preview-action-btn"
                title="Undo"
                aria-label="Undo"
                disabled={isCropMode || !canUndo}
                onClick={onUndo}
            >
                <i className="fa-solid fa-rotate-left" aria-hidden />
            </button>
            <button
                className="preview-action-btn"
                title="Redo"
                aria-label="Redo"
                disabled={isCropMode || !canRedo}
                onClick={onRedo}
            >
                <i className="fa-solid fa-rotate-right" aria-hidden />
            </button>

            {mode === '2d' &&
                (!isCropMode ? (
                    <button
                        className="preview-crop-btn"
                        title="Crop"
                        aria-label="Crop"
                        disabled={!imageAvailable}
                        onClick={onEnterCrop}
                    >
                        <i className="fa-solid fa-crop" aria-hidden="true"></i>
                    </button>
                ) : (
                    <>
                        <button
                            className="preview-crop-btn preview-crop-btn--save"
                            title="Save crop"
                            aria-label="Save crop"
                            onClick={onSaveCrop}
                        >
                            <i className="fa-solid fa-floppy-disk" aria-hidden="true"></i>
                        </button>
                        <button
                            className="preview-crop-btn preview-crop-btn--cancel"
                            title="Cancel crop"
                            aria-label="Cancel crop"
                            onClick={onCancelCrop}
                        >
                            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                        </button>
                    </>
                ))}

            {/* Download button: image in 2D; STL in 3D */}
            <button
                className="preview-crop-btn"
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
                    <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                ) : (
                    <i className="fa-solid fa-download" aria-hidden="true" />
                )}
            </button>

            {mode === '2d' && (
                <>
                    <button
                        className="preview-crop-btn"
                        title="Toggle checkerboard"
                        aria-label="Toggle checkerboard"
                        onClick={onToggleCheckerboard}
                    >
                        <i className="fa-solid fa-square" aria-hidden />
                    </button>
                    <button
                        className="preview-crop-btn"
                        title="Choose file"
                        aria-label="Choose file"
                        onClick={onPickFile}
                    >
                        <i className="fa-solid fa-file-upload" aria-hidden />
                    </button>
                    <button
                        className="preview-crop-btn"
                        title="Remove image"
                        aria-label="Remove image"
                        onClick={onClear}
                        disabled={!imageAvailable || isCropMode}
                    >
                        <i className="fa-solid fa-trash" aria-hidden />
                    </button>
                </>
            )}
        </div>
    );
};

export default PreviewActions;
