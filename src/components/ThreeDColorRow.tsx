import React from 'react';
import { Slider } from '@/components/ui/slider';
import { ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SortableItem, SortableItemHandle } from '@/components/ui/sortable';

type Props = {
    fi: number;
    displayIdx: number;
    hex: string;
    value: number;
    layerHeight: number;
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
    onChange,
    onMoveUp,
    onMoveDown,
    canMoveUp = false,
    canMoveDown = false,
}: Props) {
    const handleChange = (v: number[]) => {
        onChange(fi, v[0]);
    };

    return (
        <SortableItem value={String(fi)} asChild>
            <div className="flex gap-2 items-center px-3 py-2.5 rounded-lg transition-all duration-100 group hover:bg-accent/5 data-dragging:bg-primary/15 data-dragging:scale-105 data-dragging:shadow-lg">
                {/* Drag handle */}
                <SortableItemHandle asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 flex-shrink-0 text-muted-foreground hover:text-primary"
                        aria-label="Reorder color - drag handle"
                        title="Drag to reorder"
                    >
                        <GripVertical className="h-4 w-4" />
                    </Button>
                </SortableItemHandle>

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
        </SortableItem>
    );
}

export default React.memo(ThreeDColorRowInner);
