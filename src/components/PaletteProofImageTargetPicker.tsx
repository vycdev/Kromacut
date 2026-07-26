import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Check, X } from 'lucide-react';

import {
    buildPaletteProofTargetHighlight,
    paletteProofRgbKey,
    paletteProofTargetImageSize,
    paletteProofTargetKeyAt,
} from '../lib/paletteProofTargetImage';
import type { FinalStackTargetMappingSnapshot } from '../types/appearance';

interface PaletteProofImageTargetPickerProps {
    imageSrc: string;
    targets: readonly FinalStackTargetMappingSnapshot[];
    selectedTargetIds: readonly string[];
    maximumSelected: number;
    onToggleTarget: (targetId: string) => void;
}

function swatchTextColor(rgb: readonly [number, number, number]): string {
    const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return luminance > 0.55 ? '#111111' : '#ffffff';
}

function formatUsagePercent(usageWeight: number): string {
    const percent = usageWeight * 100;
    if (percent === 0) return '0%';
    return percent >= 10 ? `${Math.round(percent)}%` : `${percent.toFixed(1)}%`;
}

export default function PaletteProofImageTargetPicker({
    imageSrc,
    targets,
    selectedTargetIds,
    maximumSelected,
    onToggleTarget,
}: PaletteProofImageTargetPickerProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const sourcePixelsRef = useRef<ImageData | null>(null);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectionMessage, setSelectionMessage] = useState<string | null>(null);

    const targetByRgbKey = useMemo(
        () =>
            new Map(
                targets.map((target) => [paletteProofRgbKey(...target.targetColor.rgb), target])
            ),
        [targets]
    );
    const targetById = useMemo(
        () => new Map(targets.map((target) => [target.id, target])),
        [targets]
    );
    const selectedTargets = useMemo(
        () =>
            selectedTargetIds
                .map((targetId) => targetById.get(targetId))
                .filter((target): target is FinalStackTargetMappingSnapshot => Boolean(target)),
        [selectedTargetIds, targetById]
    );
    const selectedRgbKeys = useMemo(
        () =>
            new Set(selectedTargets.map((target) => paletteProofRgbKey(...target.targetColor.rgb))),
        [selectedTargets]
    );

    useEffect(() => {
        let cancelled = false;
        setLoadError(null);
        setSelectionMessage(null);
        sourcePixelsRef.current = null;
        setImageSize({ width: 0, height: 0 });

        const image = new Image();
        image.onload = () => {
            if (cancelled) return;
            const size = paletteProofTargetImageSize(image.naturalWidth, image.naturalHeight);
            const samplingCanvas = document.createElement('canvas');
            samplingCanvas.width = size.width;
            samplingCanvas.height = size.height;
            const context = samplingCanvas.getContext('2d', { willReadFrequently: true });
            if (!context) {
                setLoadError('Could not prepare the processed image for target selection.');
                return;
            }
            context.imageSmoothingEnabled = false;
            context.clearRect(0, 0, size.width, size.height);
            context.drawImage(image, 0, 0, size.width, size.height);
            try {
                sourcePixelsRef.current = context.getImageData(0, 0, size.width, size.height);
                setImageSize(size);
            } catch {
                setLoadError('Could not read the processed image colors.');
            }
        };
        image.onerror = () => {
            if (!cancelled) setLoadError('Could not load the processed image.');
        };
        image.src = imageSrc;

        return () => {
            cancelled = true;
        };
    }, [imageSrc]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const source = sourcePixelsRef.current;
        if (!canvas || !source || imageSize.width === 0 || imageSize.height === 0) return;
        canvas.width = imageSize.width;
        canvas.height = imageSize.height;
        const context = canvas.getContext('2d');
        if (!context) return;
        const highlighted = buildPaletteProofTargetHighlight(source.data, selectedRgbKeys);
        const output = context.createImageData(source.width, source.height);
        output.data.set(highlighted);
        context.putImageData(output, 0, 0);
    }, [imageSize, selectedRgbKeys]);

    const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
        const canvas = event.currentTarget;
        const source = sourcePixelsRef.current;
        if (!source) return;
        const bounds = canvas.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / bounds.width) * source.width;
        const y = ((event.clientY - bounds.top) / bounds.height) * source.height;
        const rgbKey = paletteProofTargetKeyAt(source.data, source.width, source.height, x, y);
        const target = rgbKey === null ? undefined : targetByRgbKey.get(rgbKey);
        if (!target) {
            setSelectionMessage('That area is not part of the current processed palette.');
            return;
        }
        const isSelected = selectedTargetIds.includes(target.id);
        if (!isSelected && selectedTargetIds.length >= maximumSelected) {
            setSelectionMessage(`You can select up to ${maximumSelected} target colors.`);
            return;
        }
        setSelectionMessage(
            isSelected
                ? `Removed ${target.targetColor.hex.toUpperCase()}.`
                : `Selected ${target.targetColor.hex.toUpperCase()} across the image.`
        );
        onToggleTarget(target.id);
    };

    return (
        <div className="space-y-2">
            <div className="relative flex min-h-36 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/30 p-1">
                {imageSize.width > 0 && (
                    <canvas
                        ref={canvasRef}
                        className="block h-auto max-h-[52vh] w-auto max-w-full cursor-crosshair rounded-sm [image-rendering:pixelated]"
                        onClick={handleCanvasClick}
                        role="img"
                        aria-label="Processed image target selector. Click an image region to select or deselect its color."
                        data-testid="palette-proof-target-image"
                    />
                )}
                {imageSize.width === 0 && !loadError && (
                    <p className="text-xs text-muted-foreground">Loading processed image...</p>
                )}
                {loadError && <p className="text-xs text-destructive">{loadError}</p>}
            </div>
            <p className="text-[9px] text-muted-foreground">
                {selectedTargetIds.length > 0
                    ? 'Selected colors stay bright; all other image colors are dimmed.'
                    : 'Click any region to select that processed color everywhere it appears.'}
            </p>
            <div
                className="flex min-h-8 flex-wrap items-center gap-1.5"
                aria-live="polite"
                data-testid="palette-proof-selected-targets"
            >
                {selectedTargets.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground">
                        No image colors selected. All targets will be selected automatically.
                    </span>
                ) : (
                    selectedTargets.map((target) => (
                        <button
                            key={target.id}
                            type="button"
                            className="inline-flex h-7 items-center gap-1 rounded border border-foreground/60 px-2 text-[9px] font-semibold shadow-sm"
                            style={{
                                backgroundColor: target.targetColor.hex,
                                color: swatchTextColor(target.targetColor.rgb),
                            }}
                            onClick={() => onToggleTarget(target.id)}
                            aria-label={`Remove selected ${target.targetColor.hex.toUpperCase()}`}
                            data-selected-target-id={target.id}
                        >
                            <Check className="h-3 w-3" />
                            {target.targetColor.hex.toUpperCase()}
                            <span className="opacity-75">
                                {formatUsagePercent(target.usageWeight)}
                            </span>
                            <X className="h-3 w-3" />
                        </button>
                    ))
                )}
            </div>
            {selectionMessage && (
                <p className="text-[9px] text-muted-foreground">{selectionMessage}</p>
            )}
        </div>
    );
}
