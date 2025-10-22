import { Button } from '@/components/ui/button';

interface Props {
    onChoose: () => void;
    onRemove: () => void;
    canRemove: boolean;
}

export default function UploaderControls({ onChoose, onRemove, canRemove }: Props) {
    return (
        <div className="p-4 bg-card border-b border-border flex gap-2">
            <Button
                onClick={onChoose}
                className="bg-primary hover:bg-primary/80 text-primary-foreground font-semibold flex-1"
            >
                Choose file
            </Button>
            <Button
                onClick={onRemove}
                disabled={!canRemove}
                className="bg-muted hover:bg-muted/80 text-muted-foreground font-semibold flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Remove
            </Button>
        </div>
    );
}
