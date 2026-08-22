import React from 'react';
import { Loader2, Maximize2 } from 'lucide-react';

import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
    PRINTABLE_FEATURE_NEIGHBOR_TAKEOVER,
    PRINTABLE_FEATURE_NO_SUPPORT,
    type PrintableFeatureSimulation,
} from '../lib/printableFeatures.ts';

interface PrintableFeaturePreviewProps {
    simulation?: PrintableFeatureSimulation;
    isComputing: boolean;
}

type PreviewMode = 'printable' | 'risk';

function formatCount(value: number): string {
    return value.toLocaleString();
}

export default function PrintableFeaturePreview({
    simulation,
    isComputing,
}: PrintableFeaturePreviewProps) {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const [mode, setMode] = React.useState<PreviewMode>('risk');
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !simulation || !open) return;
        canvas.width = simulation.width;
        canvas.height = simulation.height;
        const context = canvas.getContext('2d');
        if (!context) return;

        if (mode === 'printable') {
            context.putImageData(
                new ImageData(
                    new Uint8ClampedArray(simulation.data),
                    simulation.width,
                    simulation.height
                ),
                0,
                0
            );
            return;
        }

        const pixels = new Uint8ClampedArray(simulation.data);
        for (let pixel = 0; pixel < simulation.changeMask.length; pixel++) {
            const offset = pixel * 4;
            const change = simulation.changeMask[pixel];
            if (change === PRINTABLE_FEATURE_NEIGHBOR_TAKEOVER) {
                pixels[offset] = 245;
                pixels[offset + 1] = 158;
                pixels[offset + 2] = 11;
                pixels[offset + 3] = 255;
            } else if (change === PRINTABLE_FEATURE_NO_SUPPORT) {
                pixels[offset] = 236;
                pixels[offset + 1] = 72;
                pixels[offset + 2] = 153;
                pixels[offset + 3] = 255;
            } else if (pixels[offset + 3] > 0) {
                pixels[offset] = Math.round(pixels[offset] * 0.42);
                pixels[offset + 1] = Math.round(pixels[offset + 1] * 0.42);
                pixels[offset + 2] = Math.round(pixels[offset + 2] * 0.42);
            }
        }
        context.putImageData(new ImageData(pixels, simulation.width, simulation.height), 0, 0);
    }, [mode, open, simulation]);

    if (isComputing && !simulation) {
        return (
            <div className="flex h-10 items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking printable detail…
            </div>
        );
    }

    if (!simulation) return null;

    const { diagnostics } = simulation;
    const affectedPercent = diagnostics.affectedFraction * 100;

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 p-2.5">
                <div className="min-w-0">
                    <p className="text-[11px] font-medium text-foreground">Printable detail</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                        {affectedPercent.toFixed(affectedPercent < 1 ? 1 : 0)}% of opaque pixels
                        affected
                        {diagnostics.omitAtRiskPixels && diagnostics.omittedPixelCount > 0
                            ? ` · ${formatCount(diagnostics.omittedPixelCount)} reassigned`
                            : ''}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOpen(true)}
                    className="h-7 shrink-0 gap-1.5 px-2 text-[10px]"
                >
                    <Maximize2 className="h-3 w-3" />
                    Open preview
                </Button>
            </div>

            <AlertDialogContent className="flex max-h-[92vh] w-[96vw] max-w-[1200px] flex-col gap-3 p-4 sm:rounded-lg">
                <AlertDialogHeader className="pr-8">
                    <AlertDialogTitle>Printable detail preview</AlertDialogTitle>
                    <AlertDialogDescription>
                        Inspect the detail affected by the selected effective line width.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                        {affectedPercent.toFixed(affectedPercent < 1 ? 1 : 0)}% affected
                        {diagnostics.lostColorCount > 0
                            ? ` · ${diagnostics.lostColorCount} source colors disappear`
                            : ''}
                    </p>
                    <div className="flex rounded-md border border-border/70 bg-muted/30 p-0.5 text-xs">
                        <button
                            type="button"
                            onClick={() => setMode('risk')}
                            aria-pressed={mode === 'risk'}
                            className={`rounded px-3 py-1.5 transition-colors ${mode === 'risk' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            At risk
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('printable')}
                            aria-pressed={mode === 'printable'}
                            className={`rounded px-3 py-1.5 transition-colors ${mode === 'printable' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Printable
                        </button>
                    </div>
                </div>

                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded border border-border/60 bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:12px_12px] bg-[position:0_0,0_6px,6px_-6px,-6px_0px] p-2">
                    <canvas
                        ref={canvasRef}
                        role="img"
                        aria-label={
                            mode === 'risk'
                                ? 'Overlay showing image details at risk of disappearing or being claimed by neighboring colors'
                                : 'Image after minimum printable feature simulation'
                        }
                        className="block h-auto max-h-[calc(92vh-15rem)] w-full object-contain [image-rendering:pixelated]"
                    />
                </div>

                {mode === 'risk' ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                            {formatCount(diagnostics.reassignedPixelCount)} vulnerable to neighbor
                            takeover
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-pink-500" />
                            {formatCount(diagnostics.unsupportedPixelCount)} have no printable
                            neighbor
                        </span>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        {diagnostics.omitAtRiskPixels
                            ? `${formatCount(diagnostics.omittedPixelCount)} at-risk source pixels are replaced by nearby printable colors before matching and model generation.`
                            : 'At-risk source colors remain in Auto-paint matching and the physical height map.'}
                    </p>
                )}

                <AlertDialogFooter>
                    <AlertDialogCancel>Close</AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
