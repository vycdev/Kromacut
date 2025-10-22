import { Button } from '@/components/ui/button';

interface Props {
    onChoose: () => void;
    onRemove: () => void;
    canRemove: boolean;
}

export default function UploaderControls({ onChoose, onRemove, canRemove }: Props) {
    return (
        <div className="p-4 bg-card border-b border-border flex gap-2">
            <Button variant="secondary" onClick={onChoose}>
                Choose file
            </Button>
            <Button variant="secondary" onClick={onRemove} disabled={!canRemove}>
                Remove
            </Button>
        </div>
    );
}
