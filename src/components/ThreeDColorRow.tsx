import React from 'react';
import { Slider } from '@/components/ui/slider';
import { ChevronUp, ChevronDown } from 'lucide-react';
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

type ContentProps = Omit<Props, 'displayIdx'> & {
    isDragHandle?: boolean;
};

function ThreeDColorRowContent({
    fi,
    hex,
    value,
    layerHeight,
    onChange,
    onMoveUp,
    onMoveDown,
    canMoveUp = false,
    canMoveDown = false,
    isDragHandle = true,
}: ContentProps) {
    const handleChange = (v: number[]) => {
        onChange(fi, v[0]);
    };

    return (
        <>
            {/* Drag handle */}
            {isDragHandle ? (
                <SortableItemHandle
                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors duration-150 select-none"
                    aria-label="Reorder color - drag handle"
                    title="Drag to reorder"
                >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 3h2v18H9V3zm4 0h2v18h-2V3z" />
                    </svg>
                </SortableItemHandle>
            ) : (
                <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 3h2v18H9V3zm4 0h2v18h-2V3z" />
                    </svg>
                </div>
            )}

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
        </>
    );
}

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
    return (
        <SortableItem
            value={String(fi)}
            className="flex gap-2 items-center px-3 py-2.5 rounded-lg transition-all duration-100 group hover:bg-accent/5 data-dragging:bg-primary/15 data-dragging:scale-105 data-dragging:shadow-lg"
        >
            <ThreeDColorRowContent
                fi={fi}
                hex={hex}
                value={value}
                layerHeight={layerHeight}
                onChange={onChange}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                canMoveUp={canMoveUp}
                canMoveDown={canMoveDown}
                isDragHandle={true}
            />
        </SortableItem>
    );
}

function ThreeDColorRowOverlay({
    fi,
    hex,
    value,
    layerHeight,
    onChange,
}: Omit<Props, 'displayIdx' | 'onMoveUp' | 'onMoveDown' | 'canMoveUp' | 'canMoveDown'>) {
    return (
        <div className="flex gap-2 items-center px-3 py-2.5 rounded-lg transition-all duration-100 hover:bg-accent/5">
            <ThreeDColorRowContent
                fi={fi}
                hex={hex}
                value={value}
                layerHeight={layerHeight}
                onChange={onChange}
                canMoveUp={false}
                canMoveDown={false}
                isDragHandle={false}
            />
        </div>
    );
}

export default React.memo(ThreeDColorRowInner);
export { ThreeDColorRowOverlay };
