import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { CollapsibleCard, DirtyDot } from '@/components/CollapsibleCard';
import { Check, Loader, RotateCcw } from 'lucide-react';
import type { ImageDimensions } from '../hooks/useSwatches';
import {
    calculateImageResizeDimensions,
    clampImageResizePercent,
    DEFAULT_IMAGE_RESIZE_PERCENT,
    MAX_IMAGE_RESIZE_PERCENT,
    MIN_IMAGE_RESIZE_PERCENT,
} from '../lib/imageResize';

interface Props {
    imageDimensions: ImageDimensions | null;
    disabled?: boolean;
    onApply: (percent: number) => Promise<void> | void;
}

export const ImageResizePanel: React.FC<Props> = ({
    imageDimensions,
    disabled = false,
    onApply,
}) => {
    const [percent, setPercent] = useState(DEFAULT_IMAGE_RESIZE_PERCENT);
    const [working, setWorking] = useState(false);

    const targetDimensions = useMemo(() => {
        if (!imageDimensions) return null;
        return calculateImageResizeDimensions(
            imageDimensions.width,
            imageDimensions.height,
            percent
        );
    }, [imageDimensions, percent]);

    const noDimensionChange =
        !imageDimensions ||
        !targetDimensions ||
        (targetDimensions.width >= imageDimensions.width &&
            targetDimensions.height >= imageDimensions.height);
    const applyDisabled = disabled || working || noDimensionChange;
    const allDefault = percent === DEFAULT_IMAGE_RESIZE_PERCENT;

    const commitPercent = (value: number) => {
        setPercent(clampImageResizePercent(value));
    };

    const handleApply = async () => {
        if (applyDisabled) return;
        setWorking(true);
        try {
            await onApply(percent);
        } finally {
            setWorking(false);
        }
    };

    return (
        <CollapsibleCard
            id="resize-image"
            title="Resize Image"
            subtitle="Downscale pixel resolution"
            collapsedSummary={
                working ? (
                    <Loader
                        className="w-4 h-4 animate-spin text-muted-foreground"
                        aria-label="Resizing image"
                    />
                ) : !allDefault ? (
                    <DirtyDot title="Resize percentage modified" />
                ) : undefined
            }
            actions={
                <button
                    type="button"
                    onClick={() => commitPercent(DEFAULT_IMAGE_RESIZE_PERCENT)}
                    disabled={allDefault || working}
                    title="Reset resize percentage to default"
                    aria-label="Reset resize percentage"
                    className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-600/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground select-none cursor-pointer"
                >
                    <RotateCcw className="w-4 h-4" />
                </button>
            }
        >
            <div className="space-y-4">
                <div className="space-y-3">
                    <div className="flex justify-between items-center gap-2">
                        <Label htmlFor="image-resize-percent-slider" className="font-medium">
                            Scale
                        </Label>
                        <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold">
                            {percent}%
                        </span>
                    </div>
                    <Slider
                        id="image-resize-percent-slider"
                        data-testid="image-resize-percent-slider"
                        aria-label="Resize percentage"
                        min={MIN_IMAGE_RESIZE_PERCENT}
                        max={MAX_IMAGE_RESIZE_PERCENT}
                        step={1}
                        value={[percent]}
                        onValueChange={(value) => commitPercent(value[0])}
                        className="w-full"
                        disabled={working}
                    />
                </div>

                <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Current</span>
                        <span className="font-mono text-foreground">
                            {imageDimensions
                                ? `${imageDimensions.width}x${imageDimensions.height} px`
                                : 'No image'}
                        </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">After resize</span>
                        <span className="font-mono text-primary font-semibold">
                            {targetDimensions
                                ? `${targetDimensions.width}x${targetDimensions.height} px`
                                : '-'}
                        </span>
                    </div>
                </div>

                <Button
                    onClick={handleApply}
                    data-testid="image-resize-apply"
                    disabled={applyDisabled}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold disabled:bg-green-600/50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg active:scale-95 gap-1.5"
                >
                    {working ? (
                        <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                        <Check className="w-4 h-4" />
                    )}
                    <span>{working ? 'Resizing...' : 'Apply'}</span>
                </Button>
            </div>
        </CollapsibleCard>
    );
};

export default ImageResizePanel;
