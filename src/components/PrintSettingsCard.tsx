import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { RotateCcw } from 'lucide-react';

interface PrintSettingsCardProps {
    layerHeight: number;
    slicerFirstLayerHeight: number;
    pixelSize: number;
    modelSizeEstimate?: { width: number; height: number; depth: number } | null;
    smoothMeshing: boolean;
    onLayerHeightChange: (v: number) => void;
    onSlicerFirstLayerHeightChange: (v: number) => void;
    onPixelSizeChange: (v: number) => void;
    onSmoothMeshingChange: (v: boolean) => void;
    onReset: () => void;
    allDefault?: boolean;
}

interface DraftNumberInput {
    value: string;
    error: string;
    onChange: (value: string) => void;
    onFocus: () => void;
    onBlur: () => void;
}

function formatDraftNumber(value: number) {
    if (!Number.isFinite(value)) return '';
    return Number(value.toFixed(4)).toString();
}

function parseDraftNumber(value: string) {
    const normalized = value.trim().replace(',', '.');
    if (normalized === '' || normalized === '.' || normalized === '-' || normalized === '-.') {
        return undefined;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function formatModelDimension(value: number) {
    if (!Number.isFinite(value)) return '0.0';
    return value.toFixed(1);
}

function useDraftNumberInput(
    value: number,
    onCommit: (value: number) => void,
    options: { min: number; max: number }
): DraftNumberInput {
    const [draft, setDraft] = useState(() => formatDraftNumber(value));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) {
            setDraft(formatDraftNumber(value));
        }
    }, [focused, value]);

    const parsedDraft = parseDraftNumber(draft);
    const error =
        parsedDraft === undefined
            ? ''
            : parsedDraft < options.min
              ? `Minimum value is ${options.min}`
              : parsedDraft > options.max
                ? `Maximum value is ${options.max}`
                : '';

    return {
        value: draft,
        error,
        onChange: (nextDraft) => {
            setDraft(nextDraft);
            const parsed = parseDraftNumber(nextDraft);
            if (parsed !== undefined && parsed >= options.min && parsed <= options.max) {
                onCommit(parsed);
            }
        },
        onFocus: () => setFocused(true),
        onBlur: () => {
            setFocused(false);
            const parsed = parseDraftNumber(draft);
            const fallback = Number.isFinite(value) ? value : options.min;
            const committed =
                parsed === undefined
                    ? Math.max(options.min, Math.min(options.max, fallback))
                    : Math.max(options.min, Math.min(options.max, parsed));

            onCommit(committed);
            setDraft(formatDraftNumber(committed));
        },
    };
}

export default function PrintSettingsCard({
    layerHeight,
    slicerFirstLayerHeight,
    pixelSize,
    modelSizeEstimate,
    smoothMeshing,
    onLayerHeightChange,
    onSlicerFirstLayerHeightChange,
    onPixelSizeChange,
    onSmoothMeshingChange,
    onReset,
    allDefault = false,
}: PrintSettingsCardProps) {
    const pixelSizeInput = useDraftNumberInput(pixelSize, onPixelSizeChange, {
        min: 0.01,
        max: 10,
    });
    const layerHeightInput = useDraftNumberInput(layerHeight, onLayerHeightChange, {
        min: 0.01,
        max: 10,
    });
    const firstLayerHeightInput = useDraftNumberInput(
        slicerFirstLayerHeight,
        onSlicerFirstLayerHeightChange,
        {
            min: 0,
            max: 10,
        }
    );

    return (
        <Card className="p-4 border border-border/50">
            <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">3D Print Settings</h3>
                    <p className="text-xs text-muted-foreground">
                        Configure your printing parameters
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onReset}
                    disabled={allDefault}
                    title="Reset print settings to default"
                    aria-label="Reset print settings"
                    className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-600/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground select-none cursor-pointer"
                >
                    <RotateCcw className="w-4 h-4" />
                </button>
            </div>
            <div className="h-px bg-border/50 my-4" />
            <div className="space-y-4">
                {/* Pixel size (XY scaling) */}
                <div className="space-y-3">
                    <label className="block space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-foreground">Pixel Size (XY)</span>
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                                mm/pixel
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Input
                                data-testid="print-pixel-size"
                                type="text"
                                inputMode="decimal"
                                value={pixelSizeInput.value}
                                className={`min-w-32 flex-1 ${
                                    pixelSizeInput.error
                                        ? 'border-red-500 focus-visible:ring-red-500'
                                        : ''
                                }`}
                                onChange={(e) => pixelSizeInput.onChange(e.target.value)}
                                onFocus={pixelSizeInput.onFocus}
                                onBlur={pixelSizeInput.onBlur}
                            />
                            {modelSizeEstimate && (
                                <span
                                    className="inline-flex h-9 min-w-0 max-w-full flex-1 basis-44 items-center justify-start rounded-md border border-primary/20 bg-primary/10 px-3 text-xs font-semibold text-primary"
                                    title="Estimated model size before building"
                                >
                                    <span className="truncate">
                                        Model: {formatModelDimension(modelSizeEstimate.width)}×
                                        {formatModelDimension(modelSizeEstimate.height)}×
                                        {formatModelDimension(modelSizeEstimate.depth)} mm
                                    </span>
                                </span>
                            )}
                        </div>
                        {pixelSizeInput.error && (
                            <span className="text-xs text-red-500">{pixelSizeInput.error}</span>
                        )}
                    </label>
                </div>

                {/* Layer height */}
                <div className="space-y-3">
                    <label className="block space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-foreground">Layer Height</span>
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                                mm
                            </span>
                        </div>
                        <Input
                            data-testid="print-layer-height"
                            type="text"
                            inputMode="decimal"
                            value={layerHeightInput.value}
                            className={layerHeightInput.error ? 'border-red-500 focus-visible:ring-red-500' : ''}
                            onChange={(e) => layerHeightInput.onChange(e.target.value)}
                            onFocus={layerHeightInput.onFocus}
                            onBlur={layerHeightInput.onBlur}
                        />
                        {layerHeightInput.error && (
                            <span className="text-xs text-red-500">{layerHeightInput.error}</span>
                        )}
                    </label>
                </div>

                {/* Slicer first layer height */}
                <div className="space-y-3">
                    <label className="block space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-foreground">
                                First Layer Height
                            </span>
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                                mm
                            </span>
                        </div>
                        <Input
                            data-testid="print-first-layer-height"
                            type="text"
                            inputMode="decimal"
                            value={firstLayerHeightInput.value}
                            className={firstLayerHeightInput.error ? 'border-red-500 focus-visible:ring-red-500' : ''}
                            onChange={(e) => firstLayerHeightInput.onChange(e.target.value)}
                            onFocus={firstLayerHeightInput.onFocus}
                            onBlur={firstLayerHeightInput.onBlur}
                        />
                        {firstLayerHeightInput.error && (
                            <span className="text-xs text-red-500">{firstLayerHeightInput.error}</span>
                        )}
                    </label>
                </div>

                {/* Smooth Meshing */}
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <span className="font-semibold text-foreground">Smooth Meshing</span>
                        <p className="text-xs text-muted-foreground">
                            Smooth connected color boundary edges with fast welded topology.
                            Turning this on disables Flat Paint.
                        </p>
                    </div>
                    <Switch
                        id="smooth-meshing"
                        data-testid="print-smooth-meshing"
                        checked={smoothMeshing}
                        onCheckedChange={onSmoothMeshingChange}
                    />
                </div>
            </div>
        </Card>
    );
}
