interface Props {
    onChoose: () => void;
    onRemove: () => void;
    canRemove: boolean;
}

export default function UploaderControls({
    onChoose,
    onRemove,
    canRemove,
}: Props) {
    return (
        <div className="uploader-controls">
            <button type="button" onClick={onChoose}>
                Choose file
            </button>
            <button onClick={onRemove} disabled={!canRemove}>
                Remove
            </button>
        </div>
    );
}
