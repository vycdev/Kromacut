/**
 * Filament Calibration Wizard
 *
 * Multi-step wizard for calibrating filament Transmission Distance (TD) values.
 * Guides users through printing test patches, measuring RGB values, and computing
 * TD with confidence scoring.
 */

import { useState, useCallback, useRef } from 'react';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { X, Download, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    calculateTDFromMeasurements,
    DEFAULT_WHITE_REFERENCE,
    normalizeCalibrationMeasurements,
    rgbToTransmission,
    getCalibrationInstructions,
    getRecommendedLayerCounts,
    canCalculateTD,
    getConfidenceLabel,
    getConfidenceColor,
    RECOMMENDED_LAYER_COUNTS,
    type CalibrationRgb,
    type CalibrationMeasurement,
    type CalibrationResult,
} from '@/lib/calibration';
import { generateCalibrationPatchesStl } from '@/lib/generateCalibrationPatchesStl';

type WizardStep = 'intro' | 'print' | 'measure' | 'results';
type SamplerTarget = 'white-reference' | 'measurement';

type RgbInputState = { r: string; g: string; b: string };
type SamplerPoint = { x: number; y: number };

// The brush stays a consistent size on screen, then scales to the source image
// so the outlined area is the exact area being averaged.
const SAMPLER_BRUSH_RADIUS_PX = 16;
const SAMPLER_BRUSH_DIAMETER_PX = SAMPLER_BRUSH_RADIUS_PX * 2;

const buildRgbInputState = (rgb?: CalibrationRgb): RgbInputState => ({
    r: String(rgb?.[0] ?? DEFAULT_WHITE_REFERENCE[0]),
    g: String(rgb?.[1] ?? DEFAULT_WHITE_REFERENCE[1]),
    b: String(rgb?.[2] ?? DEFAULT_WHITE_REFERENCE[2]),
});

const parseRgbInputState = (rgb: RgbInputState): CalibrationRgb => [
    Math.max(0, Math.min(255, Number.parseInt(rgb.r, 10) || 0)),
    Math.max(0, Math.min(255, Number.parseInt(rgb.g, 10) || 0)),
    Math.max(0, Math.min(255, Number.parseInt(rgb.b, 10) || 0)),
];

const rgbToInputState = (rgb: CalibrationRgb): RgbInputState => ({
    r: String(rgb[0]),
    g: String(rgb[1]),
    b: String(rgb[2]),
});

const formatRgb = (rgb: CalibrationRgb) => `RGB(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

function sampleAverageRgb(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number
): CalibrationRgb {
    const roundedRadius = Math.max(1, Math.round(radius));
    const startX = Math.max(0, centerX - roundedRadius);
    const startY = Math.max(0, centerY - roundedRadius);
    const endX = Math.min(ctx.canvas.width - 1, centerX + roundedRadius);
    const endY = Math.min(ctx.canvas.height - 1, centerY + roundedRadius);
    const width = endX - startX + 1;
    const height = endY - startY + 1;
    const imageData = ctx.getImageData(startX, startY, width, height).data;

    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let samples = 0;

    for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
            const distanceX = x - centerX;
            const distanceY = y - centerY;
            if (distanceX * distanceX + distanceY * distanceY > roundedRadius * roundedRadius) {
                continue;
            }

            const pixelIndex = ((y - startY) * width + (x - startX)) * 4;
            const alpha = imageData[pixelIndex + 3] / 255;
            if (alpha <= 0) continue;
            totalR += imageData[pixelIndex] * alpha;
            totalG += imageData[pixelIndex + 1] * alpha;
            totalB += imageData[pixelIndex + 2] * alpha;
            samples += alpha;
        }
    }

    if (samples <= 0) return [0, 0, 0];

    return [
        Math.round(totalR / samples),
        Math.round(totalG / samples),
        Math.round(totalB / samples),
    ];
}

interface FilamentCalibrationWizardProps {
    open: boolean;
    onClose: () => void;
    onComplete: (result: CalibrationResult) => void;
    filamentColor: string;
    filamentName?: string;
    layerHeight: number;
    existingMeasurements?: CalibrationMeasurement[];
    existingWhiteReference?: CalibrationRgb;
}

export function FilamentCalibrationWizard({
    open,
    onClose,
    onComplete,
    filamentColor,
    filamentName = 'Your filament',
    layerHeight,
    existingMeasurements = [],
    existingWhiteReference,
}: FilamentCalibrationWizardProps) {
    const [step, setStep] = useState<WizardStep>('intro');
    const [measurements, setMeasurements] = useState<CalibrationMeasurement[]>(
        existingMeasurements
    );
    const [calibrationLayerHeight, setCalibrationLayerHeight] = useState(layerHeight);
    const [whiteReferenceInput, setWhiteReferenceInput] = useState<RgbInputState>(() =>
        buildRgbInputState(existingWhiteReference)
    );
    const [samplerTarget, setSamplerTarget] = useState<SamplerTarget>('measurement');
    const [pickerImageSrc, setPickerImageSrc] = useState<string | null>(null);
    const [pickerStatus, setPickerStatus] = useState<string | null>(null);
    const [samplerPoint, setSamplerPoint] = useState<SamplerPoint | null>(null);
    const [lastSamplePoint, setLastSamplePoint] = useState<SamplerPoint | null>(null);
    const [currentLayers, setCurrentLayers] = useState<string>('');
    const [currentRGB, setCurrentRGB] = useState({ r: '', g: '', b: '' });
    const [result, setResult] = useState<CalibrationResult | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const pickerFileInputRef = useRef<HTMLInputElement | null>(null);
    const pickerImageRef = useRef<HTMLImageElement | null>(null);
    const pickerCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const { recommended } = getRecommendedLayerCounts(measurements);
    const whiteReference = parseRgbInputState(whiteReferenceInput);
    const currentMeasurementRgb = parseRgbInputState(currentRGB);
    const activeSamplerLabel =
        samplerTarget === 'white-reference' ? 'White Reference' : 'Measurement RGB';
    const activeSamplerRgb =
        samplerTarget === 'white-reference' ? whiteReference : currentMeasurementRgb;

    const handlePickerImageSelected = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                setPickerImageSrc(typeof reader.result === 'string' ? reader.result : null);
                setSamplerPoint(null);
                setLastSamplePoint(null);
                setPickerStatus(
                    'Image loaded. Move the circular brush over a uniform area, then click to sample it.'
                );
            };
            reader.readAsDataURL(file);
            event.target.value = '';
        },
        []
    );

    const handlePickerImageLoad = useCallback(() => {
        const image = pickerImageRef.current;
        const canvas = pickerCanvasRef.current;
        if (!image || !canvas) return;

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
    }, []);

    const getSamplerCoordinates = useCallback((event: React.MouseEvent<HTMLImageElement>) => {
        const image = pickerImageRef.current;
        const canvas = pickerCanvasRef.current;
        if (!image || !canvas) return null;

        const rect = image.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        const normalizedX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const normalizedY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));

        return {
            imageX: Math.min(canvas.width - 1, Math.floor(normalizedX * canvas.width)),
            imageY: Math.min(canvas.height - 1, Math.floor(normalizedY * canvas.height)),
            displayPoint: { x: normalizedX * 100, y: normalizedY * 100 },
            imageRadius: Math.max(1, (SAMPLER_BRUSH_RADIUS_PX / rect.width) * canvas.width),
        };
    }, []);

    const handleSamplerMove = useCallback(
        (event: React.MouseEvent<HTMLImageElement>) => {
            const coordinates = getSamplerCoordinates(event);
            if (coordinates) setSamplerPoint(coordinates.displayPoint);
        },
        [getSamplerCoordinates]
    );

    const handleSamplerClick = useCallback(
        (event: React.MouseEvent<HTMLImageElement>) => {
            const canvas = pickerCanvasRef.current;
            const coordinates = getSamplerCoordinates(event);
            if (!canvas || !coordinates) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const rgb = sampleAverageRgb(
                ctx,
                coordinates.imageX,
                coordinates.imageY,
                coordinates.imageRadius
            );
            setSamplerPoint(coordinates.displayPoint);
            setLastSamplePoint(coordinates.displayPoint);

            if (samplerTarget === 'white-reference') {
                setWhiteReferenceInput(rgbToInputState(rgb));
            } else {
                setCurrentRGB(rgbToInputState(rgb));
            }

            setPickerStatus(
                `Sampled RGB(${rgb[0]}, ${rgb[1]}, ${rgb[2]}) into ${
                    samplerTarget === 'white-reference' ? 'white reference' : 'measurement RGB'
                }.`
            );
        },
        [getSamplerCoordinates, samplerTarget]
    );

    const handleAddMeasurement = useCallback(() => {
        const layers = Math.max(1, Number.parseInt(currentLayers, 10) || 1);
        const r = Math.max(0, Math.min(255, Number.parseInt(currentRGB.r, 10) || 0));
        const g = Math.max(0, Math.min(255, Number.parseInt(currentRGB.g, 10) || 0));
        const b = Math.max(0, Math.min(255, Number.parseInt(currentRGB.b, 10) || 0));

        const rgb: CalibrationRgb = [r, g, b];
        const transmission = rgbToTransmission(rgb, whiteReference);

        const newMeasurement: CalibrationMeasurement = {
            layers,
            rgb,
            transmission,
        };

        setMeasurements((prev) => [...prev, newMeasurement]);
        setCurrentLayers('');
        setCurrentRGB({ r: '', g: '', b: '' });
    }, [currentLayers, currentRGB, whiteReference]);

    const handleRemoveMeasurement = useCallback((index: number) => {
        setMeasurements((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleCalculate = useCallback(() => {
        const { ready, reason } = canCalculateTD(measurements, whiteReference);
        if (!ready) {
            setErrorMessage(reason || 'Cannot calculate TD yet.');
            return;
        }

        try {
            const normalizedMeasurements = normalizeCalibrationMeasurements(
                measurements,
                whiteReference
            );
            const { td, tdSingleValue, confidence } = calculateTDFromMeasurements(
                measurements,
                calibrationLayerHeight,
                whiteReference,
                filamentColor
            );

            const calibrationResult: CalibrationResult = {
                color: filamentColor,
                measurements: normalizedMeasurements,
                whiteReference,
                td,
                tdSingleValue,
                confidence,
                calibrationDate: new Date().toISOString(),
                notes: `Calibrated for ${filamentName}`,
            };

            setResult(calibrationResult);
            setStep('results');
            setErrorMessage(null);
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'Failed to calculate TD.');
        }
    }, [measurements, calibrationLayerHeight, filamentColor, filamentName, whiteReference]);

    const handleComplete = useCallback(() => {
        if (result) {
            onComplete(result);
            onClose();
            // Reset state
            setStep('intro');
            setMeasurements(existingMeasurements);
            setCalibrationLayerHeight(layerHeight);
            setWhiteReferenceInput(buildRgbInputState(existingWhiteReference));
            setSamplerTarget('measurement');
            setPickerImageSrc(null);
            setPickerStatus(null);
            setSamplerPoint(null);
            setLastSamplePoint(null);
            setResult(null);
            setErrorMessage(null);
        }
    }, [result, onComplete, onClose, existingMeasurements, existingWhiteReference, layerHeight]);

    const handleCancel = useCallback(() => {
        onClose();
        // Reset state after a short delay to avoid visible state change before closing
        setTimeout(() => {
            setStep('intro');
            setMeasurements(existingMeasurements);
            setCalibrationLayerHeight(layerHeight);
            setWhiteReferenceInput(buildRgbInputState(existingWhiteReference));
            setSamplerTarget('measurement');
            setPickerImageSrc(null);
            setPickerStatus(null);
            setSamplerPoint(null);
            setLastSamplePoint(null);
            setCurrentLayers('');
            setCurrentRGB({ r: '', g: '', b: '' });
            setResult(null);
            setErrorMessage(null);
        }, 300);
    }, [onClose, existingMeasurements, existingWhiteReference, layerHeight]);

    const renderIntro = () => (
        <>
            <AlertDialogHeader>
                <AlertDialogTitle>Calibrate Filament TD</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="space-y-2">
                <p>
                    Calibrating Transmission Distance (TD) will give you more accurate
                    auto-paint results.
                </p>
                <p className="font-semibold">You will need:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>{filamentName}</li>
                    <li>A 3D printer</li>
                    <li>A backlit white surface (phone screen works great)</li>
                    <li>A color picker tool (digital or app)</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-4">
                    This process takes about 15-20 minutes including print time.
                </p>
            </div>
            <AlertDialogFooter>
                <Button variant="outline" onClick={handleCancel}>
                    Cancel
                </Button>
                <Button onClick={() => setStep('print')}>Start Calibration</Button>
            </AlertDialogFooter>
        </>
    );

    const handleDownloadPatches = () => {
        const blob = generateCalibrationPatchesStl(RECOMMENDED_LAYER_COUNTS, calibrationLayerHeight);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `calibration_patches_${calibrationLayerHeight.toFixed(2)}mm.stl`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const renderPrintInstructions = () => {
        const instructions = getCalibrationInstructions(calibrationLayerHeight);

        return (
            <>
                <AlertDialogHeader>
                    <AlertDialogTitle>Step 1: Print Test Patches</AlertDialogTitle>
                </AlertDialogHeader>
                <div className="space-y-3">
                    <AlertDialogDescription asChild>
                        <div className="space-y-2">
                            {instructions.map((instruction, i) => (
                                <p key={i} className="text-sm">
                                    {i === 0 ? '📋' : i === instructions.length - 1 ? '📊' : '🔧'}{' '}
                                    {instruction}
                                </p>
                            ))}
                        </div>
                    </AlertDialogDescription>

                    <Card className="p-4 bg-muted">
                        <p className="text-sm font-semibold mb-2">Print Settings:</p>
                        <ul className="text-sm space-y-1">
                            <li>
                                <strong>Filament:</strong>{' '}
                                <span
                                    className="inline-block w-4 h-4 rounded border"
                                    style={{ backgroundColor: filamentColor }}
                                />{' '}
                                {filamentName}
                            </li>
                            <li className="flex items-center gap-2">
                                <strong>Layer Height:</strong>
                                <Input
                                    type="number"
                                    value={calibrationLayerHeight}
                                    onChange={(e) => setCalibrationLayerHeight(Number(e.target.value))}
                                    step="0.01"
                                    min="0.05"
                                    max="0.4"
                                    className="w-20 h-7 text-xs"
                                />
                                <span className="text-xs">mm</span>
                            </li>
                            <li>
                                <strong>Infill:</strong> 100%
                            </li>
                            <li>
                                <strong>Patch Size:</strong> 20mm × 20mm (or larger)
                            </li>
                            <li>
                                <strong>Layer Counts:</strong> {recommended.join(', ')} layers
                            </li>
                        </ul>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownloadPatches}
                            className="mt-3 w-full gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Download Test Patches STL
                        </Button>
                    </Card>

                    <p className="text-xs text-muted-foreground">
                        💡 Tip: Label each patch with its layer count using a marker.
                    </p>
                </div>
                <AlertDialogFooter>
                    <Button variant="outline" onClick={() => setStep('intro')}>
                        Back
                    </Button>
                    <Button onClick={() => setStep('measure')}>Patches Printed</Button>
                </AlertDialogFooter>
            </>
        );
    };

    const renderMeasurement = () => {
        const { ready, reason } = canCalculateTD(measurements, whiteReference);

        return (
            <>
                <AlertDialogHeader>
                    <AlertDialogTitle>Step 2: Measure RGB Values</AlertDialogTitle>
                </AlertDialogHeader>
                <p className="text-sm mb-4">
                    Keep the same backlit setup for every sample. Measure the empty backlight
                    first, then capture each printed patch from the center.
                </p>

                <div className="space-y-5 py-4">
                    <Card className="border-border/60 bg-muted/20 p-4 sm:p-5">
                        <div className="space-y-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="space-y-1">
                                    <Label className="text-sm">Image Sampler</Label>
                                    <p className="text-xs leading-relaxed text-muted-foreground">
                                        Upload a photo or screenshot, choose where clicks should go,
                                        then use the circular brush to capture an averaged RGB sample.
                                    </p>
                                </div>
                                <input
                                    ref={pickerFileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handlePickerImageSelected}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 self-start"
                                    onClick={() => pickerFileInputRef.current?.click()}
                                >
                                    <Upload className="w-4 h-4" />
                                    Upload Image
                                </Button>
                            </div>

                            <div className="rounded-xl border border-border/50 bg-background/60 p-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="space-y-2">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                            Sampling Target
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className={cn(
                                                    'border-border/60',
                                                    samplerTarget === 'measurement' &&
                                                        'border-primary/50 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                                                )}
                                                onClick={() => setSamplerTarget('measurement')}
                                            >
                                                Fill Measurement RGB
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className={cn(
                                                    'border-border/60',
                                                    samplerTarget === 'white-reference' &&
                                                        'border-primary/50 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                                                )}
                                                onClick={() => setSamplerTarget('white-reference')}
                                            >
                                                Fill White Reference
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background px-3 py-2">
                                        <div
                                            className="h-10 w-10 min-h-10 min-w-10 flex-none rounded-lg border border-border/70 shadow-inner"
                                            style={{
                                                backgroundColor: `rgb(${activeSamplerRgb[0]}, ${activeSamplerRgb[1]}, ${activeSamplerRgb[2]})`,
                                            }}
                                        />
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                                Active Preview
                                            </div>
                                            <div className="text-sm font-semibold text-foreground">
                                                {activeSamplerLabel}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatRgb(activeSamplerRgb)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {pickerImageSrc ? (
                                <div className="space-y-3">
                                    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm">
                                        <div className="relative mx-auto w-fit max-w-full">
                                            <img
                                                ref={pickerImageRef}
                                                src={pickerImageSrc}
                                                alt="Uploaded calibration sample"
                                                className="block max-h-[28rem] max-w-full cursor-crosshair select-none object-contain"
                                                onLoad={handlePickerImageLoad}
                                                onMouseMove={handleSamplerMove}
                                                onMouseLeave={() => setSamplerPoint(null)}
                                                onClick={handleSamplerClick}
                                                draggable={false}
                                            />
                                            {lastSamplePoint && (
                                                <div
                                                    aria-hidden="true"
                                                    className="pointer-events-none absolute z-10 rounded-full border-2 border-dashed border-foreground/80 bg-background/10 shadow-sm"
                                                    style={{
                                                        width: `${SAMPLER_BRUSH_DIAMETER_PX}px`,
                                                        height: `${SAMPLER_BRUSH_DIAMETER_PX}px`,
                                                        left: `${lastSamplePoint.x}%`,
                                                        top: `${lastSamplePoint.y}%`,
                                                        transform: 'translate(-50%, -50%)',
                                                    }}
                                                />
                                            )}
                                            {samplerPoint && (
                                                <div
                                                    aria-hidden="true"
                                                    className="pointer-events-none absolute z-20 rounded-full border-2 border-primary bg-primary/15 shadow-[0_0_0_1px_hsl(var(--background))]"
                                                    style={{
                                                        width: `${SAMPLER_BRUSH_DIAMETER_PX}px`,
                                                        height: `${SAMPLER_BRUSH_DIAMETER_PX}px`,
                                                        left: `${samplerPoint.x}%`,
                                                        top: `${samplerPoint.y}%`,
                                                        transform: 'translate(-50%, -50%)',
                                                    }}
                                                />
                                            )}
                                        </div>
                                        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-primary/25 bg-background/90 px-3 py-1 text-[11px] font-medium text-foreground shadow-sm backdrop-blur">
                                            Circular brush averages into {activeSamplerLabel}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                                        {pickerStatus ??
                                            'Move the circular brush over a uniform area, then click to capture it.'}
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-4 py-8 text-center">
                                    <div className="mx-auto max-w-sm space-y-2">
                                        <p className="text-sm font-medium text-foreground">
                                            No image loaded yet
                                        </p>
                                        <p className="text-xs leading-relaxed text-muted-foreground">
                                            Upload a calibration photo to sample directly from it, or
                                            keep entering RGB values manually below.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <canvas ref={pickerCanvasRef} className="hidden" />
                        </div>
                    </Card>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="border-border/60 bg-muted/25 p-4">
                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-sm">White Reference</Label>
                                        <p className="text-xs leading-relaxed text-muted-foreground">
                                            Sample the empty backlight first so the calibration uses
                                            your real light source instead of assuming pure white.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background px-3 py-2">
                                        <div
                                            className="h-10 w-10 min-h-10 min-w-10 flex-none rounded-lg border border-border/70 shadow-inner"
                                            style={{
                                                backgroundColor: `rgb(${whiteReference[0]}, ${whiteReference[1]}, ${whiteReference[2]})`,
                                            }}
                                        />
                                        <div className="text-right">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                                Current
                                            </div>
                                            <div className="text-xs font-medium text-foreground">
                                                {formatRgb(whiteReference)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <Label htmlFor="white-r" className="text-xs">
                                            Ref R
                                        </Label>
                                        <Input
                                            id="white-r"
                                            type="number"
                                            min="1"
                                            max="255"
                                            value={whiteReferenceInput.r}
                                            onChange={(e) =>
                                                setWhiteReferenceInput((prev) => ({
                                                    ...prev,
                                                    r: e.target.value,
                                                }))
                                            }
                                            placeholder="255"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="white-g" className="text-xs">
                                            Ref G
                                        </Label>
                                        <Input
                                            id="white-g"
                                            type="number"
                                            min="1"
                                            max="255"
                                            value={whiteReferenceInput.g}
                                            onChange={(e) =>
                                                setWhiteReferenceInput((prev) => ({
                                                    ...prev,
                                                    g: e.target.value,
                                                }))
                                            }
                                            placeholder="255"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="white-b" className="text-xs">
                                            Ref B
                                        </Label>
                                        <Input
                                            id="white-b"
                                            type="number"
                                            min="1"
                                            max="255"
                                            value={whiteReferenceInput.b}
                                            onChange={(e) =>
                                                setWhiteReferenceInput((prev) => ({
                                                    ...prev,
                                                    b: e.target.value,
                                                }))
                                            }
                                            placeholder="255"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-xs text-muted-foreground">
                                        Tip: use the sampler with
                                        {' '}
                                        <span className="font-medium text-foreground">
                                            Fill White Reference
                                        </span>
                                        {' '}
                                        selected.
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                            setWhiteReferenceInput(
                                                buildRgbInputState(DEFAULT_WHITE_REFERENCE)
                                            )
                                        }
                                    >
                                        Use 255,255,255
                                    </Button>
                                </div>
                            </div>
                        </Card>

                        <Card className="border-border/60 bg-muted/25 p-4">
                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-sm">Add Measurement</Label>
                                        <p className="text-xs leading-relaxed text-muted-foreground">
                                            Enter the patch layer count, then fill or sample the RGB
                                            value from the center of that patch.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background px-3 py-2">
                                        <div
                                            className="h-10 w-10 min-h-10 min-w-10 flex-none rounded-lg border border-border/70 shadow-inner"
                                            style={{
                                                backgroundColor: `rgb(${currentMeasurementRgb[0]}, ${currentMeasurementRgb[1]}, ${currentMeasurementRgb[2]})`,
                                            }}
                                        />
                                        <div className="text-right">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                                Draft Sample
                                            </div>
                                            <div className="text-xs font-medium text-foreground">
                                                {formatRgb(currentMeasurementRgb)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-border/50 bg-background/60 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-xs text-muted-foreground">
                                            Sampler shortcut:
                                            {' '}
                                            <span className="font-medium text-foreground">
                                                {samplerTarget === 'measurement'
                                                    ? 'currently filling Measurement RGB'
                                                    : 'switch sampler target to Measurement RGB'}
                                            </span>
                                        </div>
                                        <div className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                                            Layers {currentLayers || '2'}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    <div>
                                        <Label htmlFor="layers" className="text-xs">
                                            Layers
                                        </Label>
                                        <Input
                                            id="layers"
                                            type="number"
                                            min="1"
                                            max="50"
                                            value={currentLayers}
                                            onChange={(e) => setCurrentLayers(e.target.value)}
                                            placeholder="2"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="r" className="text-xs">
                                            R
                                        </Label>
                                        <Input
                                            id="r"
                                            type="number"
                                            min="0"
                                            max="255"
                                            value={currentRGB.r}
                                            onChange={(e) =>
                                                setCurrentRGB((prev) => ({
                                                    ...prev,
                                                    r: e.target.value,
                                                }))
                                            }
                                            placeholder="0-255"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="g" className="text-xs">
                                            G
                                        </Label>
                                        <Input
                                            id="g"
                                            type="number"
                                            min="0"
                                            max="255"
                                            value={currentRGB.g}
                                            onChange={(e) =>
                                                setCurrentRGB((prev) => ({
                                                    ...prev,
                                                    g: e.target.value,
                                                }))
                                            }
                                            placeholder="0-255"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="b" className="text-xs">
                                            B
                                        </Label>
                                        <Input
                                            id="b"
                                            type="number"
                                            min="0"
                                            max="255"
                                            value={currentRGB.b}
                                            onChange={(e) =>
                                                setCurrentRGB((prev) => ({
                                                    ...prev,
                                                    b: e.target.value,
                                                }))
                                            }
                                            placeholder="0-255"
                                        />
                                    </div>
                                </div>

                                <Button onClick={handleAddMeasurement} size="sm" className="w-full">
                                    Add Measurement
                                </Button>
                            </div>
                        </Card>
                    </div>

                    {measurements.length > 0 ? (
                        <Card className="border-border/60 bg-muted/15 p-4">
                            <div className="space-y-3">
                                <div>
                                    <Label className="text-sm">Saved Measurements</Label>
                                    <p className="text-xs text-muted-foreground">
                                        {measurements.length} captured so far. You need at least 3
                                        to calculate TD.
                                    </p>
                                </div>
                                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                                    {measurements.map((m, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-2"
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground">
                                                    {m.layers} layers
                                                </div>
                                                <div
                                                    className="h-8 w-8 rounded-lg border border-border/70 shadow-inner"
                                                    style={{
                                                        backgroundColor: `rgb(${m.rgb[0]}, ${m.rgb[1]}, ${m.rgb[2]})`,
                                                    }}
                                                />
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium text-foreground">
                                                        {formatRgb(m.rgb)}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground">
                                                        Normalized from your white reference
                                                    </div>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveMeasurement(i)}
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    ) : (
                        <Card className="border-dashed border-border/60 bg-muted/10 p-4">
                            <div className="space-y-1 text-center">
                                <p className="text-sm font-medium text-foreground">
                                    No measurements added yet
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Recommended patch counts:{' '}
                                    <span className="font-medium text-foreground">
                                        {recommended.join(', ')}
                                    </span>
                                </p>
                            </div>
                        </Card>
                    )}

                    {!ready && reason && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                            {reason}
                        </div>
                    )}

                    {errorMessage && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            {errorMessage}
                        </div>
                    )}
                </div>

                <AlertDialogFooter>
                    <Button variant="outline" onClick={() => setStep('print')}>
                        Back
                    </Button>
                    <Button onClick={handleCalculate} disabled={!ready}>
                        Calculate TD
                    </Button>
                </AlertDialogFooter>
            </>
        );
    };

    const renderResults = () => {
        if (!result) return null;

        const confidenceLabel = getConfidenceLabel(result.confidence);
        const confidenceColor = getConfidenceColor(result.confidence);

        return (
            <>
                <AlertDialogHeader>
                    <AlertDialogTitle>Calibration Complete! 🎉</AlertDialogTitle>
                </AlertDialogHeader>
                <p className="text-sm mb-4">
                    Your filament has been calibrated successfully.
                </p>

                <div className="space-y-4 py-4">
                    <Card className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-8 h-8 rounded border"
                                    style={{ backgroundColor: filamentColor }}
                                />
                                <div>
                                    <p className="font-semibold">{filamentName}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {result.measurements.length} measurements
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-bold">
                                    {result.tdSingleValue.toFixed(2)}mm
                                </p>
                                <p className="text-xs text-muted-foreground">Auto-paint working TD</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="text-center p-2 bg-red-100 dark:bg-red-900/20 rounded">
                                <p className="font-semibold">R: {result.td[0].toFixed(2)}mm</p>
                            </div>
                            <div className="text-center p-2 bg-green-100 dark:bg-green-900/20 rounded">
                                <p className="font-semibold">G: {result.td[1].toFixed(2)}mm</p>
                            </div>
                            <div className="text-center p-2 bg-blue-100 dark:bg-blue-900/20 rounded">
                                <p className="font-semibold">B: {result.td[2].toFixed(2)}mm</p>
                            </div>
                        </div>

                        {result.whiteReference && (
                            <div className="flex items-center justify-between pt-2 border-t text-sm">
                                <span>White reference:</span>
                                <span className="font-mono text-xs">
                                    RGB({result.whiteReference[0]}, {result.whiteReference[1]},{' '}
                                    {result.whiteReference[2]})
                                </span>
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t">
                            <span className="text-sm">Confidence:</span>
                            <span className={`text-sm font-semibold ${confidenceColor}`}>
                                {confidenceLabel} ({(result.confidence * 100).toFixed(0)}%)
                            </span>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            This value blends the measured patch fit with the filament color
                            heuristic when the photo data is noisy or weakly informative.
                        </p>
                    </Card>

                    <p className="text-xs text-muted-foreground">
                        💡 This calibration will be saved with your filament profile and improve
                        auto-paint accuracy.
                    </p>
                </div>

                <AlertDialogFooter>
                    <Button variant="outline" onClick={handleCancel}>
                        Discard
                    </Button>
                    <Button onClick={handleComplete}>Save Calibration</Button>
                </AlertDialogFooter>
            </>
        );
    };

    return (
        <AlertDialog open={open} onOpenChange={(isOpen) => {
            if (!isOpen) {
                onClose();
            }
        }}>
            <AlertDialogContent className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(96vw,82rem)] max-w-[82rem] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg">
                <AlertDialogDescription className="sr-only">
                    Filament calibration wizard for measuring transmission distance (TD) values to improve auto-paint results
                </AlertDialogDescription>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCancel}
                    className="absolute right-3 top-3 h-7 w-7 text-muted-foreground hover:text-foreground"
                    aria-label="Close calibration wizard"
                >
                    <X className="h-4 w-4" />
                </Button>
                {step === 'intro' && renderIntro()}
                {step === 'print' && renderPrintInstructions()}
                {step === 'measure' && renderMeasurement()}
                {step === 'results' && renderResults()}
            </AlertDialogContent>
        </AlertDialog>
    );
}
