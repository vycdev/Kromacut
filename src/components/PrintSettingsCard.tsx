import { useTranslation } from 'react-i18next';
import { translateRuntimeMessage } from '../lib/runtimeMessages';
import { useEffect, useState } from 'react';
import { CollapsibleCard, DirtyDot } from '@/components/CollapsibleCard';
import { Input, NumberInput } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { RotateCcw } from 'lucide-react';

interface PrintSettingsCardProps {
    layerHeight: number;
    slicerFirstLayerHeight: number;
    pixelSize: number;
    effectiveLineWidth: number;
    modelSizeEstimate?: { width: number; height: number; depth: number } | null;
    smoothMeshing: boolean;
    onLayerHeightChange: (v: number) => void;
    onSlicerFirstLayerHeightChange: (v: number) => void;
    onPixelSizeChange: (v: number) => void;
    onEffectiveLineWidthChange: (v: number) => void;
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
    effectiveLineWidth,
    modelSizeEstimate,
    smoothMeshing,
    onLayerHeightChange,
    onSlicerFirstLayerHeightChange,
    onPixelSizeChange,
    onEffectiveLineWidthChange,
    onSmoothMeshingChange,
    onReset,
    allDefault = false,
}: PrintSettingsCardProps) {
    const { t } = useTranslation('printing');
    const [lineWidthDraft, setLineWidthDraft] = useState(() => effectiveLineWidth.toString());
    useEffect(() => {
        setLineWidthDraft(effectiveLineWidth.toString());
    }, [effectiveLineWidth]);

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
        <CollapsibleCard
            id="print-settings"
            title={t('printSettingsCard.3DPrintSettings')}
            subtitle={t('printSettingsCard.configureYourPrintingParameters')}
            collapsedSummary={
                !allDefault ? (
                    <DirtyDot title={t('printSettingsCard.printSettingsModified')} />
                ) : undefined
            }
            actions={
                <button
                    type="button"
                    onClick={onReset}
                    disabled={allDefault}
                    title={t('printSettingsCard.resetPrintSettingsToDefault')}
                    aria-label={t('printSettingsCard.resetPrintSettings')}
                    className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-600/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground select-none cursor-pointer"
                >
                    <RotateCcw className="w-4 h-4" />
                </button>
            }
        >
            <div className="space-y-4">
                {/* Pixel size (XY scaling) */}
                <div className="space-y-3">
                    <label className="block space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-foreground">
                                {t('printSettingsCard.pixelSizeXY')}
                            </span>
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
                                    title={t('printSettingsCard.estimatedModelSizeBeforeBuilding')}
                                >
                                    <span className="truncate">
                                        {t('printSettingsCard.modelDimensions', {
                                            width: formatModelDimension(modelSizeEstimate.width),
                                            height: formatModelDimension(modelSizeEstimate.height),
                                            depth: formatModelDimension(modelSizeEstimate.depth),
                                        })}
                                    </span>
                                </span>
                            )}
                        </div>
                        {pixelSizeInput.error && (
                            <span className="text-xs text-red-500">
                                {translateRuntimeMessage(pixelSizeInput.error)}
                            </span>
                        )}
                    </label>
                </div>

                {/* Layer height */}
                <div className="space-y-3">
                    <label className="block space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-foreground">
                                {t('printSettingsCard.layerHeight')}
                            </span>
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                                mm
                            </span>
                        </div>
                        <Input
                            data-testid="print-layer-height"
                            type="text"
                            inputMode="decimal"
                            value={layerHeightInput.value}
                            className={
                                layerHeightInput.error
                                    ? 'border-red-500 focus-visible:ring-red-500'
                                    : ''
                            }
                            onChange={(e) => layerHeightInput.onChange(e.target.value)}
                            onFocus={layerHeightInput.onFocus}
                            onBlur={layerHeightInput.onBlur}
                        />
                        {layerHeightInput.error && (
                            <span className="text-xs text-red-500">
                                {translateRuntimeMessage(layerHeightInput.error)}
                            </span>
                        )}
                    </label>
                </div>

                {/* Slicer first layer height */}
                <div className="space-y-3">
                    <label className="block space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-foreground">
                                {t('printSettingsCard.firstLayerHeight')}
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
                            className={
                                firstLayerHeightInput.error
                                    ? 'border-red-500 focus-visible:ring-red-500'
                                    : ''
                            }
                            onChange={(e) => firstLayerHeightInput.onChange(e.target.value)}
                            onFocus={firstLayerHeightInput.onFocus}
                            onBlur={firstLayerHeightInput.onBlur}
                        />
                        {firstLayerHeightInput.error && (
                            <span className="text-xs text-red-500">
                                {translateRuntimeMessage(firstLayerHeightInput.error)}
                            </span>
                        )}
                    </label>
                </div>

                {/* Effective extrusion width */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <label
                            htmlFor="effective-line-width"
                            className="font-semibold text-foreground"
                        >
                            {t('printSettingsCard.effectiveLineWidth')}
                        </label>
                        <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                            mm
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <NumberInput
                            id="effective-line-width"
                            data-testid="print-effective-line-width"
                            min={0.1}
                            max={2}
                            step={0.01}
                            value={lineWidthDraft}
                            onChange={(event) => setLineWidthDraft(event.target.value)}
                            onBlur={() => {
                                const parsed = parseFloat(lineWidthDraft);
                                if (Number.isNaN(parsed)) {
                                    setLineWidthDraft(effectiveLineWidth.toString());
                                    return;
                                }
                                const value = Math.max(0.1, Math.min(2, parsed));
                                onEffectiveLineWidthChange(value);
                                setLineWidthDraft(value.toString());
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') event.currentTarget.blur();
                            }}
                            className="min-w-0 flex-1"
                        />
                    </div>
                </div>

                {/* Smooth Meshing */}
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <span className="font-semibold text-foreground">
                            {t('printSettingsCard.smoothMeshing')}
                        </span>
                        <p className="text-xs text-muted-foreground">
                            {t(
                                'printSettingsCard.smoothConnectedColorBoundaryEdgesWithFastWeldedTopology'
                            )}
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
        </CollapsibleCard>
    );
}
