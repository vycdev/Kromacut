import React, { useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SortableItem, SortableItemHandle } from '@/components/ui/sortable';

type Props = {
    fi: number;
    hex: string;
    value: number;
    layerHeight: number;
    minHeight?: number;
    onChange: (fi: number, value: number) => void;
};

function ThreeDColorRowInner({ fi, hex, value, layerHeight, minHeight, onChange }: Props) {
    const [tempValue, setTempValue] = useState<number>(value);

    // Sync tempValue when the value prop changes (e.g., when layerHeight changes)
    useEffect(() => {
        setTempValue(value);
    }, [value]);

    const handleChange = (v: number[]) => {
        setTempValue(v[0]);
    };

    const handleValueCommit = (v: number[]) => {
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
                <div className="flex-1">
                    <Slider
                        min={typeof minHeight === 'number' ? minHeight : layerHeight}
                        max={10}
                        step={layerHeight}
                        value={[tempValue]}
                        onValueChange={handleChange}
                        onValueCommit={handleValueCommit}
                        className="cursor-pointer"
                    />
                </div>

                {/* Height value display with badge styling */}
                <div className="flex-shrink-0 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold">
                    {tempValue.toFixed(2)} mm
                </div>
            </div>
        </SortableItem>
    );
}

export default React.memo(ThreeDColorRowInner);
