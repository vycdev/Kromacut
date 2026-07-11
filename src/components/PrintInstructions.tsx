import { CollapsibleCard, DirtyDot } from '@/components/CollapsibleCard';
import type { SwapEntry, MultiHeadScheduleEvent } from '../hooks/useSwapPlan';

interface PrintInstructionsProps {
    swapPlan: SwapEntry[];
    multiHeadPlan?: MultiHeadScheduleEvent[] | null;
    multiHeadMode?: boolean;
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
    multiHeadPlan,
    multiHeadMode = false,
    layerHeight,
    slicerFirstLayerHeight,
    copied,
    onCopy,
    tooManyColors = false,
    colorCount = 0,
    flatPaint = false,
}: PrintInstructionsProps) {
    return (
        <CollapsibleCard
            id="print-instructions"
            title="Print Instructions"
            subtitle="Generated swap plan for your printer"
            headingLevel={4}
            className="mt-6"
            collapsedSummary={
                tooManyColors ? <DirtyDot title="Too many colors for a swap plan" /> : undefined
            }
            actions={
                <button
                    type="button"
                    onClick={onCopy}
                    title="Copy print instructions to clipboard"
                    aria-pressed={copied}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                        copied
                            ? 'bg-green-600 text-white'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                >
                    {copied ? '✓ Copied!' : 'Copy'}
                </button>
            }
        >
            <div className="space-y-4 text-sm">
                {tooManyColors && (
                    <div className="text-amber-600 text-sm p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        This print has {colorCount} layers — swap instructions may be slow to generate above 64.
                    </div>
                )}
                {/* Recommended Settings */}
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="font-semibold text-foreground mb-2">Recommended Settings</div>
                    <div className="space-y-1 text-muted-foreground text-xs">
                        <div>• Wall loops: <span className="text-foreground font-medium">1</span></div>
                        <div>• Infill: <span className="text-foreground font-medium">100%</span></div>
                        <div>
                            • Layer height:{' '}
                            <span className="text-foreground font-mono">{layerHeight.toFixed(3)} mm</span>
                        </div>
                        <div>
                            • First layer height:{' '}
                            <span className="text-foreground font-mono">{slicerFirstLayerHeight.toFixed(3)} mm</span>
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
                ) : multiHeadPlan ? (
                    <HeadSchedule events={multiHeadPlan} />
                ) : multiHeadMode ? (
                    <div className="text-muted-foreground text-sm p-3 rounded-lg bg-accent/5 border border-border/50">
                        Click <span className="font-semibold text-foreground">Build 3D Model</span> to generate the multi-head schedule.
                    </div>
                ) : (
                    /* Single-head */
                    <>
                        <div>
                            <div className="font-semibold text-foreground mb-3">Start with Color</div>
                            {swapPlan.length && swapPlan[0].type === 'start' ? (
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
                                <div className="text-muted-foreground text-sm p-3 rounded-lg bg-muted/30">—</div>
                            )}
                        </div>
                        <div>
                            <div className="font-semibold text-foreground mb-2">Color Swap Plan</div>
                            {swapPlan.length <= 1 ? (
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
        </CollapsibleCard>
    );
}

// ---------------------------------------------------------------------------
// HeadSchedule — multi-head load / swap schedule in layer order
// ---------------------------------------------------------------------------

function HeadSchedule({ events }: { events: MultiHeadScheduleEvent[] }) {
    if (events.length === 0) {
        return (
            <div className="text-muted-foreground text-sm p-3 rounded-lg bg-accent/5 border border-border/50">
                No head assignments computed yet.
            </div>
        );
    }

    return (
        <div>
            <div className="font-semibold text-foreground mb-3">Head Schedule</div>
            <div className="space-y-3">
                {events.filter(evt => evt.isPrePrint || evt.swapCount > 0).map((evt, evtIdx) => {
                    return (
                        <div
                            key={evtIdx}
                            className={`p-3 rounded-lg border ${
                                evt.isPrePrint
                                    ? 'bg-primary/5 border-primary/20'
                                    : 'bg-accent/5 border-border/50'
                            }`}
                        >
                            {/* Event header */}
                            <div className="text-xs font-semibold text-foreground mb-2">
                                {evt.isPrePrint
                                    ? <>Before print <span className="font-normal text-muted-foreground"> — load all heads</span></>
                                    : <>Layer {evt.startLayer}<span className="text-amber-600 dark:text-amber-400"> — swap {evt.swapCount} head{evt.swapCount !== 1 ? 's' : ''}</span></>
                                }
                            </div>

                            {/* Nozzle rows — all heads shown; changed ones highlighted */}
                            <div className="space-y-1">
                                {evt.nozzles.map((n) => (
                                    <div
                                        key={n.nozzle}
                                        className={`flex items-center gap-2 text-xs ${
                                            n.changed
                                                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                                : 'text-muted-foreground'
                                        }`}
                                    >
                                        <span className="w-14 flex-shrink-0 font-medium">
                                            Head {n.nozzle}
                                        </span>
                                        <span
                                            className={`inline-block w-3.5 h-3.5 rounded border flex-shrink-0 ${
                                                n.empty
                                                    ? 'border-dashed border-muted-foreground/60'
                                                    : 'border-border'
                                            }`}
                                            style={{ background: n.empty ? 'transparent' : n.filamentHex }}
                                        />
                                        <span className={n.empty ? 'italic opacity-70' : undefined}>
                                            {n.filamentName}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
