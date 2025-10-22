import React from 'react';
import { Slider } from '@/components/ui/slider';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
    fi: number;
    displayIdx: number;
    hex: string;
    value: number;
    layerHeight: number;
    isDragOver: boolean;
    dragPosition: 'above' | 'below' | null;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, fi: number) => void;
    onDragOver: (e: React.DragEvent<HTMLDivElement>, displayIdx: number) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>, displayIdx: number) => void;
    onChange: (fi: number, value: number) => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
};

function ThreeDColorRowInner({
    fi,
    displayIdx,
    hex,
    value,
    layerHeight,
    isDragOver,
    dragPosition,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onChange,
    onMoveUp,
    onMoveDown,
    canMoveUp = false,
    canMoveDown = false,
}: Props) {
    const rowRef = React.useRef<HTMLDivElement>(null);

    const handleChange = (v: number[]) => {
        onChange(fi, v[0]);
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        // Create a proper drag ghost image with the full element
        if (rowRef.current) {
            // Create a clone of the element to use as drag image
            const dragGhost = rowRef.current.cloneNode(true) as HTMLElement;
            dragGhost.style.position = 'absolute';
            dragGhost.style.top = '-9999px';
            dragGhost.style.left = '-9999px';
            dragGhost.style.width = rowRef.current.offsetWidth + 'px';
            dragGhost.style.opacity = '0.8';
            dragGhost.style.zIndex = '10000';
            dragGhost.style.pointerEvents = 'none';
            dragGhost.style.borderRadius = '8px';
            dragGhost.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.5)';
            document.body.appendChild(dragGhost);

            // Set the drag image
            e.dataTransfer.setDragImage(dragGhost, 0, 0);

            // Clean up after a short delay
            setTimeout(() => {
                document.body.removeChild(dragGhost);
            }, 0);
        }

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(fi));
        onDragStart(e, fi);
    };

    const dragIndicatorClass = isDragOver
        ? dragPosition === 'above'
            ? 'ring-2 ring-primary ring-inset rounded-lg shadow-lg -translate-y-1 bg-primary/15 scale-105'
            : 'ring-2 ring-primary ring-inset rounded-lg shadow-lg translate-y-1 bg-primary/15 scale-105'
        : 'hover:bg-accent/5 scale-100';

    return (
        <div
            ref={rowRef}
            onDragOver={(e) => onDragOver(e, displayIdx)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, displayIdx)}
            className={`flex gap-2 items-center px-3 py-2.5 rounded-lg transition-all duration-100 group ${dragIndicatorClass}`}
            style={{ transformOrigin: 'left center' }}
        >
            {/* Drag handle */}
            <div
                draggable
                onDragStart={handleDragStart}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-primary transition-colors duration-150 select-none"
                aria-label="Reorder color - drag handle"
                title="Drag to reorder"
            >
                <GripVertical className="w-4 h-4" />
            </div>

            {/* Color swatch with border */}
            <div
                className="flex-shrink-0 w-7 h-6 border-2 border-border rounded-md shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary/50"
                style={{ background: hex }}
                title={hex}
                aria-label={`Color swatch: ${hex}`}
            />

            {/* Height slider - interactive area */}
            <div className="flex-1 min-w-0">
                <Slider
                    min={layerHeight}
                    max={10}
                    step={layerHeight}
                    value={[value]}
                    onValueChange={handleChange}
                    className="cursor-pointer"
                />
            </div>

            {/* Height value display - monowidth for alignment */}
            <div className="flex-shrink-0 w-14 text-right text-xs font-semibold text-primary tabular-nums">
                {value.toFixed(2)}
            </div>

            {/* Unit label */}
            <div className="flex-shrink-0 text-xs text-muted-foreground font-medium">mm</div>

            {/* Up/Down reorder buttons - better visibility on hover */}
            <div className="flex-shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 active:bg-primary/20 transition-colors duration-150"
                    onClick={onMoveUp}
                    disabled={!canMoveUp}
                    title="Move color up in order"
                    aria-label="Move color up"
                >
                    <ChevronUp className="w-3.5 h-3.5" />
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 active:bg-primary/20 transition-colors duration-150"
                    onClick={onMoveDown}
                    disabled={!canMoveDown}
                    title="Move color down in order"
                    aria-label="Move color down"
                >
                    <ChevronDown className="w-3.5 h-3.5" />
                </Button>
            </div>
        </div>
    );
}

export default React.memo(ThreeDColorRowInner);
