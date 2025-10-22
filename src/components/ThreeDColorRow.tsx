import React from 'react';
import { Slider } from '@/components/ui/slider';
import { GripVertical } from 'lucide-react';

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
}: Props) {
    const handleChange = (v: number[]) => {
        onChange(fi, v[0]);
    };

    const boxShadowClass = isDragOver
        ? dragPosition === 'above'
            ? 'ring-2 ring-purple-500 ring-inset rounded'
            : 'ring-2 ring-purple-500 ring-inset rounded'
        : '';

    return (
        <div
            onDragOver={(e) => onDragOver(e, displayIdx)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, displayIdx)}
            className={`flex gap-2 items-center ${boxShadowClass} transition-all`}
        >
            <div
                draggable
                onDragStart={(e) => onDragStart(e, fi)}
                className="w-5 h-5 flex items-center justify-center cursor-grab text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Reorder color"
                title="Drag to reorder"
            >
                <GripVertical className="w-4 h-4" />
            </div>
            <div
                className="w-7 h-5 border border-border rounded"
                style={{ background: hex }}
                title={hex}
            />
            <div className="flex-1">
                <Slider
                    min={layerHeight}
                    max={10}
                    step={layerHeight}
                    value={[value]}
                    onValueChange={handleChange}
                />
            </div>
            <div className="w-16 text-right text-sm font-medium text-muted-foreground">
                {value.toFixed(2)} mm
            </div>
        </div>
    );
}

export default React.memo(ThreeDColorRowInner);
