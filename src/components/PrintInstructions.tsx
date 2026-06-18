import { Card } from '@/components/ui/card';
import type { SwapEntry } from '../hooks/useSwapPlan';

interface PrintInstructionsProps {
    swapPlan: SwapEntry[];
    layerHeight: number;
    slicerFirstLayerHeight: number;
    copied: boolean;
    onCopy: () => void;
    tooManyColors?: boolean;
    colorCount?: number;
    /** Flat Paint prints swap filaments per layer via AMS — no manual plan */
    flatPaint?: boolean;
}

export default function PrintInstructions({
    swapPlan,
    layerHeight,
    slicerFirstLayerHeight,
    copied,
    onCopy,
    tooManyColors = false,
    colorCount = 0,
    flatPaint = false,
}: PrintInstructionsProps) {
    return (
        <Card className="p-4 border border-border/50 mt-6">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h4 className="font-semibold text-foreground">Print Instructions</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                        Generated swap plan for your printer
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onCopy}
                    title="Copy print instructions to clipboard"
                    aria-pressed={copied}
                    disabled={tooManyColors}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                        copied
                            ? 'bg-green-600 text-white'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                >
                    {copied ? '✓ Copied!' : 'Copy'}
                </button>
            </div>

            <div className="h-px bg-border/50 mb-4" />

            <div className="space-y-4 text-sm">
                {/* Recommended Settings */}
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="font-semibold text-foreground mb-2">Recommended Settings</div>
                    <div className="space-y-1 text-muted-foreground text-xs">
                        <div>
                            • Wall loops: <span className="text-foreground font-medium">1</span>
                        </div>
                        <div>
                            • Infill: <span className="text-foreground font-medium">100%</span>
                        </div>
                        <div>
                            • Layer height:{' '}
                            <span className="text-foreground font-mono">
                                {layerHeight.toFixed(3)} mm
                            </span>
                        </div>
                        <div>
                            • First layer height:{' '}
                            <span className="text-foreground font-mono">
                                {slicerFirstLayerHeight.toFixed(3)} mm
                            </span>
                        </div>
                    </div>
                </div>

                {/* Flat Paint: no manual swap sequence — slicer assigns filaments */}
                {flatPaint ? (
                    <div className="p-3 rounded-lg bg-accent/5 border border-border/50 space-y-2">
                        <div className="font-semibold text-foreground">
                            Flat Paint multi-material print
                        </div>
                        <ul className="list-disc pl-4 space-y-1 text-muted-foreground text-xs">
                            <li>
                                Export as <span className="font-semibold">3MF</span> — the model
                                contains one object per filament. Assign each object to its filament
                                in the slicer (AMS/toolchanger required).
                            </li>
                            <li>
                                Use <span className="font-semibold">clear filament</span> for the
                                transparent carrier object — it prints first and becomes the smooth
                                viewing face.
                            </li>
                            <li>
                                Print as-is — the artwork is already mirrored for face-down
                                printing. Do not mirror in the slicer.
                            </li>
                            <li>After printing, flip the piece over to view the image.</li>
                        </ul>
                    </div>
                ) : (
                    <>
                        {/* Start Color */}
                        <div>
                            <div className="font-semibold text-foreground mb-3">
                                Start with Color
                            </div>
                            {tooManyColors ? (
                                <div className="text-muted-foreground text-sm p-3 rounded-lg bg-muted/30">
                                    —
                                </div>
                            ) : swapPlan.length && swapPlan[0].type === 'start' ? (
                                (() => {
                                    const sw = swapPlan[0].swatch;
                                    return (
                                        <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border-2 border-primary/30 shadow-sm">
                                            <span
                                                className="block w-8 h-8 rounded-md border-2 border-border flex-shrink-0 shadow-md"
                                                style={{ background: sw.hex }}
                                                title={sw.hex}
                                            />
                                            <span className="font-mono text-sm font-semibold text-foreground">
                                                {sw.hex}
                                            </span>
                                        </div>
                                    );
                                })()
                            ) : (
                                <div className="text-muted-foreground text-sm p-3 rounded-lg bg-muted/30">
                                    —
                                </div>
                            )}
                        </div>

                        {/* Color Swap Plan */}
                        <div>
                            <div className="font-semibold text-foreground mb-2">
                                Color Swap Plan
                            </div>
                            {tooManyColors ? (
                                <div className="text-amber-600 text-sm p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                    Swap instructions are disabled for very large palettes (
                                    {colorCount} colors). Reduce the image to 64 colors or fewer in
                                    2D mode first.
                                </div>
                            ) : swapPlan.length <= 1 ? (
                                <div className="text-muted-foreground text-sm p-3 rounded-lg bg-accent/5 border border-border/50">
                                    Only one color configured — no swaps needed.
                                </div>
                            ) : (
                                <ol className="space-y-2">
                                    {swapPlan.map((entry, idx) => {
                                        if (entry.type === 'start') return null;
                                        return (
                                            <li
                                                key={idx}
                                                className="flex items-start gap-2 text-muted-foreground text-xs p-2 rounded bg-accent/5"
                                            >
                                                <span className="text-primary font-semibold flex-shrink-0">
                                                    {idx}.
                                                </span>
                                                <div className="flex-1 flex flex-col gap-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <span>Swap to</span>
                                                        <span
                                                            className="inline-block w-4 h-4 rounded border border-border flex-shrink-0"
                                                            style={{ background: entry.swatch.hex }}
                                                        />
                                                        <span className="font-mono text-foreground">
                                                            {entry.swatch.hex}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        at layer{' '}
                                                        <span className="font-semibold text-foreground">
                                                            {entry.layer}
                                                        </span>{' '}
                                                        (~
                                                        <span className="font-mono text-foreground">
                                                            {entry.height.toFixed(3)} mm
                                                        </span>
                                                        )
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </div>
                    </>
                )}

                <div className="text-xs text-muted-foreground p-3 rounded-lg bg-accent/5 border border-border/50">
                    <span>ℹ️</span>{' '}
                    <span className="italic">
                        Heights are approximate. Always confirm in your slicer before printing.
                    </span>
                </div>
            </div>
        </Card>
    );
}
