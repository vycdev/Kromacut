import React from 'react';
import { Slider } from '@/components/ui/slider';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SortableItem, SortableItemHandle } from '@/components/ui/sortable';

type Props = {
    fi: number;
    displayIdx: number;
    hex: string;
    value: number;
    layerHeight: number;
    onChange: (fi: number, value: number) => void;
};

function ThreeDColorRowInner({ fi, displayIdx, hex, value, layerHeight, onChange }: Props) {
    const handleChange = (v: number[]) => {
        onChange(fi, v[0]);
    };

    return (
        <SortableItem value={String(fi)} asChild>
            <div className="flex gap-3 items-center px-4 py-3 rounded-lg transition-all duration-200 group hover:bg-primary/5 data-dragging:bg-primary/15 data-dragging:shadow-lg border border-border/0 hover:border-border/50 hover:shadow-sm">
                {/* Drag handle */}
                <SortableItemHandle asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 flex-shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        aria-label="Reorder color - drag handle"
                        title="Drag to reorder"
                    >
                        <GripVertical className="h-4 w-4" />
                    </Button>
                </SortableItemHandle>

                {/* Color swatch with border */}
                <div
                    className="flex-shrink-0 w-8 h-6 border-2 border-border rounded-md shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary/50 ring-1 ring-black/10"
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
                <div className="flex-shrink-0 min-w-[3.5rem] text-right">
                    <div className="text-xs font-semibold text-primary font-mono tracking-tight">
                        {value.toFixed(2)}
                    </div>
                </div>

                {/* Unit label */}
                <div className="flex-shrink-0 text-xs text-muted-foreground font-medium min-w-[1.5rem]">
                    mm
                </div>
            </div>
        </SortableItem>
    );
}

export default React.memo(ThreeDColorRowInner);
