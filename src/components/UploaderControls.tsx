interface Props {
    onChoose: () => void;
    onRemove: () => void;
    canRemove: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}

export default function UploaderControls({
    onChoose,
    onRemove,
    canRemove,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
}: Props) {
    return (
        <div className="uploader-controls">
            <button type="button" onClick={onChoose}>
                Choose file
            </button>
            <button onClick={onRemove} disabled={!canRemove}>
                Remove
            </button>
            <button onClick={onUndo} disabled={!canUndo} title="Undo">
                Undo
            </button>
            <button onClick={onRedo} disabled={!canRedo} title="Redo">
                Redo
            </button>
        </div>
    );
}
