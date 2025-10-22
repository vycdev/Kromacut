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
    const handleChange = (v: number[]) => {
        onChange(fi, v[0]);
    };

    const boxShadowClass = isDragOver
        ? dragPosition === 'above'
            ? 'ring-2 ring-primary ring-inset rounded shadow-lg -translate-y-1'
            : 'ring-2 ring-primary ring-inset rounded shadow-lg translate-y-1'
        : '';

    return (
        <div
            onDragOver={(e) => onDragOver(e, displayIdx)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, displayIdx)}
            className={`flex gap-2 items-center p-2 rounded transition-all duration-200 ${boxShadowClass} hover:bg-accent/10`}
        >
            {/* Drag handle */}
            <div
                draggable
                onDragStart={(e) => onDragStart(e, fi)}
                className="w-5 h-5 flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors duration-200"
                aria-label="Reorder color"
                title="Drag to reorder"
            >
                <GripVertical className="w-4 h-4" />
            </div>

            {/* Color swatch */}
            <div
                className="w-8 h-6 border border-border rounded shadow-sm transition-all duration-200 hover:shadow-md"
                style={{ background: hex }}
                title={hex}
            />

            {/* Height slider */}
            <div className="flex-1">
                <Slider
                    min={layerHeight}
                    max={10}
                    step={layerHeight}
                    value={[value]}
                    onValueChange={handleChange}
                    className="cursor-pointer"
                />
            </div>

            {/* Height value display */}
            <div className="w-16 text-right text-sm font-medium text-muted-foreground tabular-nums">
                {value.toFixed(2)} mm
            </div>

            {/* Up/Down reorder buttons */}
            <div className="flex gap-1">
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors duration-200"
                    onClick={onMoveUp}
                    disabled={!canMoveUp}
                    title="Move up"
                    aria-label="Move color up"
                >
                    <ChevronUp className="w-3.5 h-3.5" />
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors duration-200"
                    onClick={onMoveDown}
                    disabled={!canMoveDown}
                    title="Move down"
                    aria-label="Move color down"
                >
                    <ChevronDown className="w-3.5 h-3.5" />
                </Button>
            </div>
        </div>
    );
}

export default React.memo(ThreeDColorRowInner);
